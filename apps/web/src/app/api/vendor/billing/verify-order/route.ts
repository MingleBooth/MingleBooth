import { NextRequest, NextResponse } from 'next/server';
import { verifyServerAuth, corsHeaders } from '@/lib/auth-server';
import { getServiceSupabase } from '@/lib/supabase';
import { checkDokuOrderStatus, getDokuConfig, validateDokuOrderEnvironment } from '@/lib/doku';
import { executePaymentSettlement } from '@/lib/billing-settlement';
import { isPreviewDeployment, previewBlockedResponse } from '@/lib/preview-guard';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

/**
 * Server-Side Order Status & Verification API
 * Endpoint: POST /api/vendor/billing/verify-order
 *
 * Mandatory Safeguards:
 * 1. Require verified vendor authentication (tenant binding).
 * 2. Lookup pre-registered order in Supabase payments table.
 * 3. Enforce tenant isolation (order.organization_id === auth.orgId).
 * 4. If already PAID, return authoritative state immediately (idempotent).
 * 5. If PENDING, call DOKU Inquiry API server-side using official credentials.
 * 6. Only verified DOKU SUCCESS triggers atomic database settlement.
 * 7. If DOKU is unreachable, returns status PROCESSING (never claims PAID).
 * 8. Never exposes secrets or raw gateway tokens.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate vendor session
    const auth = await verifyServerAuth(req);
    if (!auth.isValid || !auth.orgId) {
      return NextResponse.json(
        { error: auth.error || 'Authentication required.', code: 'AUTH_REQUIRED' },
        { status: 401, headers: corsHeaders }
      );
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400, headers: corsHeaders }
      );
    }

    const { orderId } = body;
    if (!orderId || typeof orderId !== 'string' || !orderId.trim()) {
      return NextResponse.json(
        { error: 'orderId is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const cleanOrderId = orderId.trim();

    // Environment Isolation Guard (Phase 2 & Phase 3)
    let dokuConfig;
    try {
      dokuConfig = getDokuConfig();
      validateDokuOrderEnvironment(cleanOrderId, dokuConfig.environment);
    } catch (secErr: any) {
      console.error(`[VerifyOrder] Environment check rejected for order ${cleanOrderId}:`, secErr?.message);
      return NextResponse.json(
        {
          error: secErr?.message || 'Cross-environment order verification blocked.',
          code: 'SECURITY_ENVIRONMENT_MISMATCH',
        },
        { status: 403, headers: corsHeaders }
      );
    }

    // 2. Scoped Preview Guard & Sandbox Isolation (Fail-Closed)
    // On Vercel Preview, order settlement verification is strictly restricted to legitimate DOKU Sandbox orders.
    // Production orders (e.g. MB- commercial orders) or non-sandbox environments are strictly blocked.
    if (isPreviewDeployment()) {
      const isSandboxOrder = cleanOrderId.toUpperCase().startsWith('MB-SBX-');
      const isSandboxEnv = dokuConfig.environment === 'sandbox';

      if (!isSandboxOrder || !isSandboxEnv) {
        console.warn(
          `[Preview Guard] Blocked non-sandbox order verification in Preview deployment: order=${cleanOrderId}, env=${dokuConfig.environment}`
        );
        return previewBlockedResponse(
          'verify_order',
          'Verifikasi settlement order pada Vercel Preview hanya diizinkan untuk DOKU Sandbox order (MB-SBX-).'
        );
      }
    }

    const client = getServiceSupabase();

    // 2. Fetch pre-registered order from Supabase
    const { data: paymentRecord, error: payErr } = await client
      .from('payments')
      .select('*')
      .eq('order_id', cleanOrderId)
      .maybeSingle();

    if (payErr) {
      console.error(`[VerifyOrder] DB error querying order ${cleanOrderId}:`, payErr);
      return NextResponse.json(
        { error: 'Database error reading payment record' },
        { status: 500, headers: corsHeaders }
      );
    }

    if (!paymentRecord) {
      return NextResponse.json(
        { error: `Order ${cleanOrderId} not found`, code: 'ORDER_NOT_FOUND' },
        { status: 404, headers: corsHeaders }
      );
    }

    // 3. Strict Tenant Isolation Check
    // Order must belong to the authenticated vendor's organization
    if (paymentRecord.organization_id && paymentRecord.organization_id !== auth.orgId) {
      // Superadmin check bypass
      const isSuperAdmin = auth.isSuperAdmin || auth.role === 'SUPER_ADMIN' || auth.email === 'admin@minglebooth.com';
      if (!isSuperAdmin) {
        return NextResponse.json(
          {
            error: `ORGANIZATION_MISMATCH: Order is not associated with organization ${auth.orgId}`,
            code: 'ORG_MISMATCH',
          },
          { status: 403, headers: corsHeaders }
        );
      }
    }

    const targetOrgId = paymentRecord.organization_id || auth.orgId;

    // Fetch associated organization data
    const { data: orgData } = await client
      .from('organizations')
      .select('id, name, plan_tier, subscription_status, subscription_expires_at, max_devices_quota')
      .eq('id', targetOrgId)
      .maybeSingle();

    // 4. Case A: Already PAID in Database
    if (paymentRecord.payment_status === 'PAID') {
      const nowMs = Date.now();
      const expiryMs = orgData?.subscription_expires_at
        ? new Date(orgData.subscription_expires_at).getTime()
        : 0;
      const isEntitlementActive =
        orgData?.subscription_status === 'active' && expiryMs > nowMs;

      return NextResponse.json(
        {
          success: true,
          status: 'SUCCESS',
          paymentStatus: 'PAID',
          isSettled: true,
          order: {
            orderId: paymentRecord.order_id,
            planTier: paymentRecord.plan_tier,
            amountIdr: Number(paymentRecord.amount_idr),
            billingInterval: paymentRecord.billing_interval || 'yearly',
            durationDays: Number(paymentRecord.duration_days || 365),
            createdAt: paymentRecord.created_at,
            paidAt: paymentRecord.paid_at,
            providerTransactionId: paymentRecord.provider_transaction_id,
          },
          organization: {
            id: orgData?.id || targetOrgId,
            name: orgData?.name || 'Studio Vendor',
            planTier: orgData?.plan_tier || paymentRecord.plan_tier,
            subscriptionStatus: orgData?.subscription_status || 'active',
            subscriptionExpiresAt: orgData?.subscription_expires_at || '',
            maxDevicesQuota: Number(orgData?.max_devices_quota || 3),
            isEntitlementActive,
          },
          message: 'Payment verified and subscription is active',
        },
        { status: 200, headers: corsHeaders }
      );
    }

    // 5. Case B: Known Terminal Failed or Expired state in DB
    if (paymentRecord.payment_status === 'FAILED' || paymentRecord.payment_status === 'EXPIRED') {
      return NextResponse.json(
        {
          success: false,
          status: paymentRecord.payment_status,
          paymentStatus: paymentRecord.payment_status,
          isSettled: false,
          order: {
            orderId: paymentRecord.order_id,
            planTier: paymentRecord.plan_tier,
            amountIdr: Number(paymentRecord.amount_idr),
            billingInterval: paymentRecord.billing_interval || 'yearly',
          },
          message: `Payment status is ${paymentRecord.payment_status}`,
        },
        { status: 200, headers: corsHeaders }
      );
    }

    // 6. Case C: Order is PENDING in Database -> Query DOKU API Server-Side
    const dokuInquiry = await checkDokuOrderStatus(cleanOrderId);

    if (!dokuInquiry.success) {
      // DOKU API returned an error or is unreachable -> Safe return PROCESSING (never premature PAID)
      return NextResponse.json(
        {
          success: false,
          status: 'PROCESSING',
          paymentStatus: 'PENDING',
          isSettled: false,
          retryable: true,
          order: {
            orderId: paymentRecord.order_id,
            planTier: paymentRecord.plan_tier,
            amountIdr: Number(paymentRecord.amount_idr),
          },
          message: 'Payment verification in progress; gateway status pending or retryable',
        },
        { status: 200, headers: corsHeaders }
      );
    }

    // 7. Evaluate DOKU Transaction Status
    if (dokuInquiry.transactionStatus === 'SUCCESS') {
      // Validate payment amount against authoritative snapshot
      const expectedAmount = Number(paymentRecord.amount_idr);
      const dokuAmount = Number(dokuInquiry.amount || 0);

      if (dokuAmount > 0 && dokuAmount < expectedAmount) {
        console.error(
          `[VerifyOrder] Fraud Guard: Received ${dokuAmount} IDR, expected ${expectedAmount} IDR for order ${cleanOrderId}`
        );
        return NextResponse.json(
          {
            error: `PAYMENT_AMOUNT_INSUFFICIENT: Received ${dokuAmount} IDR, expected ${expectedAmount} IDR`,
            code: 'AMOUNT_MISMATCH',
          },
          { status: 400, headers: corsHeaders }
        );
      }

      // Execute Atomic Database Settlement using the same mechanism as the Webhook
      const durationDays = Number(paymentRecord.duration_days || (paymentRecord.billing_interval === 'monthly' ? 30 : 365));
      const settlement = await executePaymentSettlement({
        orderId: cleanOrderId,
        organizationId: targetOrgId,
        planTier: paymentRecord.plan_tier as any,
        amountIdr: expectedAmount,
        durationDays,
        providerTransactionId: dokuInquiry.originalRequestId || null,
        paymentLinkUrl: paymentRecord.payment_link_url || 'https://doku.com',
        environment: dokuConfig.environment,
      });

      console.log(
        `[VerifyOrder] Settlement successful for ${cleanOrderId}: Org=${targetOrgId}, Plan=${settlement.planTier}, Expiry=${settlement.expiresAt}`
      );

      // Fetch fresh updated organization data
      const { data: updatedOrg } = await client
        .from('organizations')
        .select('id, name, plan_tier, subscription_status, subscription_expires_at, max_devices_quota')
        .eq('id', targetOrgId)
        .maybeSingle();

      return NextResponse.json(
        {
          success: true,
          status: 'SUCCESS',
          paymentStatus: 'PAID',
          isSettled: true,
          order: {
            orderId: cleanOrderId,
            planTier: settlement.planTier,
            amountIdr: expectedAmount,
            billingInterval: paymentRecord.billing_interval || 'yearly',
            durationDays: settlement.durationDays,
            paidAt: new Date().toISOString(),
            providerTransactionId: dokuInquiry.originalRequestId || null,
            paymentMethod: dokuInquiry.paymentChannel || 'DOKU_CHECKOUT',
          },
          organization: {
            id: updatedOrg?.id || targetOrgId,
            name: updatedOrg?.name || 'Studio Vendor',
            planTier: updatedOrg?.plan_tier || settlement.planTier,
            subscriptionStatus: updatedOrg?.subscription_status || 'active',
            subscriptionExpiresAt: updatedOrg?.subscription_expires_at || settlement.expiresAt,
            maxDevicesQuota: Number(updatedOrg?.max_devices_quota || settlement.maxDevicesQuota),
            isEntitlementActive: true,
          },
          message: 'DOKU payment verified and subscription entitlement activated',
        },
        { status: 200, headers: corsHeaders }
      );
    }

    if (dokuInquiry.transactionStatus === 'FAILED' || dokuInquiry.transactionStatus === 'EXPIRED') {
      // Update payment record to terminal failed/expired status
      await client
        .from('payments')
        .update({
          payment_status: dokuInquiry.transactionStatus,
          provider_transaction_id: dokuInquiry.originalRequestId || null,
          updated_at: new Date().toISOString(),
        })
        .eq('order_id', cleanOrderId)
        .eq('payment_status', 'PENDING');

      return NextResponse.json(
        {
          success: false,
          status: dokuInquiry.transactionStatus,
          paymentStatus: dokuInquiry.transactionStatus,
          isSettled: false,
          order: {
            orderId: cleanOrderId,
            planTier: paymentRecord.plan_tier,
            amountIdr: Number(paymentRecord.amount_idr),
          },
          message: `Payment concluded with status: ${dokuInquiry.transactionStatus}`,
        },
        { status: 200, headers: corsHeaders }
      );
    }

    // Default: Order still pending at gateway
    return NextResponse.json(
      {
        success: false,
        status: 'PROCESSING',
        paymentStatus: 'PENDING',
        isSettled: false,
        order: {
          orderId: cleanOrderId,
          planTier: paymentRecord.plan_tier,
          amountIdr: Number(paymentRecord.amount_idr),
        },
        message: 'Awaiting payment confirmation from DOKU',
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (err: any) {
    console.error('[VerifyOrder Exception]', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error verifying order status' },
      { status: 500, headers: corsHeaders }
    );
  }
}

