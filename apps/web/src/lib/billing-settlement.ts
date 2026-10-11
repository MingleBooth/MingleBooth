import { getServiceSupabase } from '@/lib/supabase';
import { validateOrderAgainstSnapshot } from '@/lib/pricing';

export interface PaymentSettlementInput {
  orderId: string;
  organizationId?: string | null;
  customerEmail?: string | null;
  planTier: 'starter' | 'pro' | 'business';
  amountIdr: number;
  durationDays: number;
  providerTransactionId?: string | null;
  paymentLinkUrl?: string;
}

export interface PaymentSettlementResult {
  success: boolean;
  isDuplicate: boolean;
  orderId: string;
  organizationId: string;
  planTier: string;
  maxDevicesQuota: number;
  expiresAt: string;
  durationDays: number;
  message: string;
  alreadyPaid?: boolean;
  engineMode?: 'ATOMIC_DATABASE_RPC' | 'APPLICATION_COMPENSATION_FALLBACK';
}

/**
 * Executes payment settlement and subscription entitlement with exactly-once guarantees.
 * Attempts atomic PostgreSQL RPC first; falls back to an application-level compensation protocol
 * if the RPC migration is pending on the remote database.
 */
export async function executePaymentSettlement(
  input: PaymentSettlementInput
): Promise<PaymentSettlementResult> {
  if (!input.orderId || typeof input.orderId !== 'string' || !input.orderId.trim()) {
    throw new Error('MISSING_ORDER_ID: orderId is required');
  }

  if (!input.planTier || !['starter', 'pro', 'business'].includes(input.planTier)) {
    throw new Error(`INVALID_PLAN_TIER: Plan ${input.planTier} is not a valid plan tier (must be starter, pro, or business)`);
  }

  if (typeof input.amountIdr !== 'number' || input.amountIdr <= 0 || isNaN(input.amountIdr)) {
    throw new Error('INVALID_AMOUNT: Payment amount must be greater than zero');
  }

  if (!input.durationDays || ![30, 365].includes(Number(input.durationDays))) {
    throw new Error(`INVALID_DURATION: Duration ${input.durationDays} days is not permitted (must be 30 or 365)`);
  }

  const client = getServiceSupabase();
  const { orderId, planTier, amountIdr, durationDays, providerTransactionId, paymentLinkUrl } = input;

  // 1. Try atomic PostgreSQL RPC `process_payment_entitlement`
  try {
    const { data: rpcData, error: rpcError } = await client.rpc('process_payment_entitlement', {
      p_order_id: orderId,
      p_org_id: input.organizationId || null,
      p_plan_tier: planTier,
      p_amount_idr: amountIdr,
      p_duration_days: durationDays,
      p_provider_transaction_id: providerTransactionId || null,
      p_payment_link_url: paymentLinkUrl || 'https://lynk.id',
    });

    if (!rpcError && rpcData) {
      return {
        success: Boolean(rpcData.success),
        isDuplicate: Boolean(rpcData.is_duplicate),
        orderId: rpcData.order_id || orderId,
        organizationId: rpcData.organization_id || '',
        planTier: rpcData.plan_tier || planTier,
        maxDevicesQuota: Number(rpcData.max_devices_quota || 3),
        expiresAt: rpcData.expires_at || '',
        durationDays: Number(rpcData.duration_days || durationDays),
        message: rpcData.message || 'Settlement processed via atomic database RPC',
        alreadyPaid: Boolean(rpcData.already_paid),
        engineMode: 'ATOMIC_DATABASE_RPC',
      };
    }

    if (rpcError) {
      const isRpcMissing =
        rpcError.code === 'PGRST202' ||
        (typeof rpcError.message === 'string' &&
          (rpcError.message.includes('Could not find the function') ||
            rpcError.message.includes('schema cache') ||
            (rpcError.message.includes('process_payment_entitlement') && rpcError.message.includes('does not exist'))));

      if (!isRpcMissing) {
        // Genuine payment validation error, business-rule rejection, or DB exception.
        // E.g. ORGANIZATION_MISMATCH, PAYMENT_AMOUNT_INSUFFICIENT, PROVIDER_TRANSACTION_REUSED.
        // DO NOT silently fall back to compensation protocol!
        throw new Error(rpcError.message || 'RPC execution failed');
      }
      // RPC is genuinely missing from remote database (PGRST202); proceed to application compensation protocol
    }
  } catch (rpcEx: any) {
    const isRpcMissing =
      rpcEx?.code === 'PGRST202' ||
      (typeof rpcEx?.message === 'string' &&
        (rpcEx.message.includes('Could not find the function') ||
          rpcEx.message.includes('schema cache') ||
          (rpcEx.message.includes('process_payment_entitlement') && rpcEx.message.includes('does not exist'))));

    if (!isRpcMissing) {
      throw rpcEx;
    }
    // Continue to application-level compensation protocol only if RPC is not deployed yet
  }

  // 2. Application-Level Exactly-Once Compensation Protocol
  // a. Check if provider_transaction_id has already been used by a different order
  if (providerTransactionId) {
    const { data: reusedTx } = await client
      .from('payments')
      .select('id, order_id, payment_status')
      .eq('provider_transaction_id', providerTransactionId)
      .neq('order_id', orderId)
      .maybeSingle();

    if (reusedTx && reusedTx.payment_status === 'PAID') {
      throw new Error(`PROVIDER_TRANSACTION_REUSED: Transaction ${providerTransactionId} was already claimed by order ${reusedTx.order_id}`);
    }
  }

  // b. Idempotency Check at Database Boundary
  const { data: rawExistingPayment } = await client
    .from('payments')
    .select('*')
    .eq('order_id', orderId)
    .maybeSingle();
  const existingPayment = rawExistingPayment as any;

  // Cross-validation 1: If order is pre-registered to an organization, caller cannot redirect to another org
  if (existingPayment?.organization_id && input.organizationId && input.organizationId !== existingPayment.organization_id) {
    throw new Error(`ORGANIZATION_MISMATCH: Order ${orderId} is bound to ${existingPayment.organization_id}`);
  }

  // Cross-validation 2: Validate requested plan matches pre-registered order plan
  if (existingPayment?.plan_tier && existingPayment.plan_tier !== planTier) {
    throw new Error(`PLAN_MISMATCH: Order ${orderId} is pre-registered for ${existingPayment.plan_tier} plan but requested ${planTier}`);
  }

  if (existingPayment && existingPayment.payment_status === 'PAID') {
    // Fetch target organization's existing entitlement info
    const { data: targetOrg } = await client
      .from('organizations')
      .select('subscription_status, subscription_expires_at, max_devices_quota')
      .eq('id', existingPayment.organization_id)
      .maybeSingle();

    const effectivePlan = (existingPayment.plan_tier as any) || planTier;
    const maxDevices = effectivePlan === 'business' ? 10 : (effectivePlan === 'starter' ? 1 : 3);

    // Self-Healing Recovery: Only if organization was left in pending_payment or missing expiry
    // (i.e. payment was recorded as PAID but initial entitlement activation never completed).
    // Must NOT override valid existing expiration timestamp or grant fresh time on expired subscriptions!
    const needsRecovery = targetOrg && (targetOrg.subscription_status === 'pending_payment' || !targetOrg.subscription_expires_at);
    if (needsRecovery && targetOrg) {
      const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

      await client
        .from('organizations')
        .update({
          subscription_status: 'active',
          subscription_expires_at: expiresAt,
          plan_tier: effectivePlan,
          max_devices_quota: maxDevices,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingPayment.organization_id);

      return {
        success: true,
        isDuplicate: true,
        alreadyPaid: true,
        orderId,
        organizationId: existingPayment.organization_id,
        planTier: effectivePlan,
        maxDevicesQuota: maxDevices,
        expiresAt,
        durationDays,
        message: 'Payment previously recorded; recovered missing subscription entitlement (reconciled)',
        engineMode: 'APPLICATION_COMPENSATION_FALLBACK',
      };
    }

    return {
      success: true,
      isDuplicate: true,
      alreadyPaid: true,
      orderId,
      organizationId: existingPayment.organization_id,
      planTier: effectivePlan,
      maxDevicesQuota: targetOrg?.max_devices_quota || maxDevices,
      expiresAt: targetOrg?.subscription_expires_at || '',
      durationDays,
      message: 'Payment already processed (idempotent)',
      engineMode: 'APPLICATION_COMPENSATION_FALLBACK',
    };
  }

  // c. Resolve Target Organization ID (Authoritative Order Binding)
  let targetOrgId = existingPayment?.organization_id || input.organizationId || null;

  // Cross-validation: If order is pre-registered to an organization, caller cannot redirect to another org
  if (existingPayment?.organization_id && input.organizationId && input.organizationId !== existingPayment.organization_id) {
    throw new Error(`ORGANIZATION_MISMATCH: Order ${orderId} is bound to ${existingPayment.organization_id}`);
  }

  // Cross-validation: Validate requested plan matches pre-registered order plan
  if (existingPayment?.plan_tier && existingPayment.plan_tier !== planTier) {
    throw new Error(`PLAN_MISMATCH: Order ${orderId} is pre-registered for ${existingPayment.plan_tier} plan but requested ${planTier}`);
  }

  // Lookup by customer email only if verified user profile exists in user_profiles
  if (!targetOrgId && input.customerEmail) {
    const cleanEmail = input.customerEmail.trim().toLowerCase();
    const { data: userProfile } = await client
      .from('user_profiles')
      .select('organization_id')
      .ilike('email', cleanEmail)
      .limit(1)
      .maybeSingle();

    if (userProfile?.organization_id) {
      targetOrgId = userProfile.organization_id;
    }
  }

  // Fail-closed tenant isolation guard:
  // Never auto-provision an organization from untrusted webhook data.
  // Never fall back to default organization via created_at ASC.
  if (!targetOrgId) {
    throw new Error(`MISSING_ORGANIZATION: No authorized organization found for order ${orderId}`);
  }

  // d. Authoritative Snapshot & Commercial Terms Validation
  // Validates plan, organization, exact amount, and duration without arbitrary thresholds
  if (existingPayment) {
    validateOrderAgainstSnapshot(existingPayment, {
      amountIdr,
      planTier,
      durationDays,
      organizationId: input.organizationId,
    });
  }

  const effectivePlan = (existingPayment?.plan_tier as any) || planTier;
  const effectiveDurationDays = existingPayment?.duration_days
    ? Number(existingPayment.duration_days)
    : (existingPayment?.billing_interval === 'monthly' ? 30 : durationDays);
  const maxDevices = effectivePlan === 'business' ? 10 : (effectivePlan === 'starter' ? 1 : 3);

  // e. Concurrency-Safe Payment Claim
  let createdPaymentId: string | null = null;

  if (existingPayment && existingPayment.payment_status === 'PENDING') {
    const { data: claimedPay, error: claimErr } = await client
      .from('payments')
      .update({
        payment_status: 'PAID',
        paid_at: new Date().toISOString(),
        provider_transaction_id: providerTransactionId || null,
        amount_idr: amountIdr,
        plan_tier: effectivePlan,
      })
      .eq('id', existingPayment.id)
      .eq('payment_status', 'PENDING')
      .select('id')
      .maybeSingle();

    if (claimErr || !claimedPay) {
      // Another concurrent worker claimed and completed this transition
      return {
        success: true,
        isDuplicate: true,
        orderId,
        organizationId: targetOrgId,
        planTier: effectivePlan,
        maxDevicesQuota: maxDevices,
        expiresAt: '',
        durationDays,
        message: 'Payment transitioned concurrently (idempotent)',
        engineMode: 'APPLICATION_COMPENSATION_FALLBACK',
      };
    }
  } else if (!existingPayment) {
    const { data: insertedPay, error: insertErr } = await client
      .from('payments')
      .insert({
        order_id: orderId,
        organization_id: targetOrgId,
        plan_tier: effectivePlan,
        amount_idr: amountIdr,
        payment_status: 'PAID',
        payment_link_url: paymentLinkUrl || 'https://lynk.id',
        provider_transaction_id: providerTransactionId || null,
        paid_at: new Date().toISOString(),
      })
      .select('id')
      .maybeSingle();

    if (insertErr) {
      if (
        insertErr.code === '23505' ||
        insertErr.message.includes('unique') ||
        insertErr.message.includes('duplicate key')
      ) {
        // Unique constraint collision: another concurrent delivery inserted it
        return {
          success: true,
          isDuplicate: true,
          orderId,
          organizationId: targetOrgId,
          planTier: effectivePlan,
          maxDevicesQuota: maxDevices,
          expiresAt: '',
          durationDays,
          message: 'Payment already processed concurrently (idempotent)',
          engineMode: 'APPLICATION_COMPENSATION_FALLBACK',
        };
      }
      throw new Error(`Failed to record payment: ${insertErr.message}`);
    }

    if (insertedPay) {
      createdPaymentId = insertedPay.id;
    }
  }

  // f. Fetch Current Organization Entitlement State
  const { data: orgData, error: orgFetchErr } = await client
    .from('organizations')
    .select('id, subscription_expires_at, subscription_status')
    .eq('id', targetOrgId)
    .maybeSingle();

  if (orgFetchErr || !orgData) {
    // COMPENSATION ROLLBACK: Revert payment record so it is not orphaned in PAID state
    await rollbackPayment(client, existingPayment?.id, createdPaymentId);
    throw new Error(`Target organization not found: ${orgFetchErr?.message || 'Empty'}`);
  }

  // g. Renewal Calculation: Preserve remaining time on active subscriptions
  const currentExpiryMs = orgData.subscription_expires_at ? new Date(orgData.subscription_expires_at).getTime() : 0;
  const now = Date.now();
  const isCurrentlyActive = orgData.subscription_status === 'active' && currentExpiryMs > now;
  const baseTimeMs = isCurrentlyActive ? currentExpiryMs : now;
  const expiresAt = new Date(baseTimeMs + effectiveDurationDays * 24 * 60 * 60 * 1000).toISOString();

  // h. Update Organization Entitlements
  const { error: orgUpdateErr } = await client
    .from('organizations')
    .update({
      subscription_status: 'active',
      subscription_expires_at: expiresAt,
      plan_tier: effectivePlan,
      max_devices_quota: maxDevices,
      updated_at: new Date().toISOString(),
    })
    .eq('id', targetOrgId);

  if (orgUpdateErr) {
    // COMPENSATION ROLLBACK: Revert payment state
    await rollbackPayment(client, existingPayment?.id, createdPaymentId);
    throw new Error(`Failed to update organization entitlement: ${orgUpdateErr.message}`);
  }

  return {
    success: true,
    isDuplicate: false,
    orderId,
    organizationId: targetOrgId,
    planTier: effectivePlan,
    maxDevicesQuota: maxDevices,
    expiresAt,
    durationDays: effectiveDurationDays,
    message: `Subscription successfully activated/renewed until ${expiresAt}`,
    engineMode: 'APPLICATION_COMPENSATION_FALLBACK',
  };
}

/**
 * Reverts payment state in case organization entitlement update fails,
 * preventing orphaned PAID payments that cannot be retried.
 */
async function rollbackPayment(
  client: ReturnType<typeof getServiceSupabase>,
  existingPaymentId?: string,
  insertedPaymentId?: string | null
) {
  try {
    if (existingPaymentId) {
      await client
        .from('payments')
        .update({ payment_status: 'PENDING', paid_at: null })
        .eq('id', existingPaymentId);
    } else if (insertedPaymentId) {
      await client.from('payments').delete().eq('id', insertedPaymentId);
    }
  } catch (rollbackErr) {
    console.error('[Billing Settlement] Compensation rollback error:', rollbackErr);
  }
}
