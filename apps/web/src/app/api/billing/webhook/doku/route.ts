import { NextRequest, NextResponse } from 'next/server';
import { validateDokuWebhookSignature, getDokuConfig, isDokuTimestampValid, validateDokuOrderEnvironment } from '@/lib/doku';
import { executePaymentSettlement } from '@/lib/billing-settlement';
import { getServiceSupabase } from '@/lib/supabase';
import { getOrderSnapshot, resolveOrderDurationAndInterval, ResolvedPackageTerms } from '@/lib/pricing';
import { isPreviewDeployment, previewBlockedResponse } from '@/lib/preview-guard';

export const dynamic = 'force-dynamic';

/**
 * DOKU Payment Notification Webhook Handler
 * Endpoint: /api/billing/webhook/doku
 *
 * Supported DOKU Payment Channels:
 * - QRIS (All e-wallets & mobile banking)
 * - Virtual Account (BCA, Mandiri, BRI, BNI, Permata, Danamon, CIMB)
 * - E-Wallets (GoPay, OVO, ShopeePay, DANA)
 * - Credit & Debit Cards (Visa, Mastercard, JCB)
 */
export async function POST(req: NextRequest) {
  try {
    const rawBodyText = await req.text();
    let body: any = {};
    try {
      body = JSON.parse(rawBodyText);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const clientId = req.headers.get('Client-Id') || req.headers.get('client-id') || '';
    const requestId = req.headers.get('Request-Id') || req.headers.get('request-id') || '';
    const requestTimestamp = req.headers.get('Request-Timestamp') || req.headers.get('request-timestamp') || '';
    const signature = req.headers.get('Signature') || req.headers.get('signature') || '';

    const dokuConfig = getDokuConfig();
    const isProd = process.env.NODE_ENV === 'production';

    // 1. Validate DOKU Request-Timestamp Freshness & Format (Prevent Replay Attacks)
    if (!requestTimestamp || !isDokuTimestampValid(requestTimestamp)) {
      return NextResponse.json(
        { error: 'Invalid or stale Request-Timestamp header (must be ISO8601 UTC within 300 seconds)' },
        { status: 400 }
      );
    }

    // 2. Validate DOKU Webhook Cryptographic HMAC-SHA256 Signature
    // Mandatory cryptographic authentication across all environments before processing any mutation
    if (!signature || !dokuConfig.secretKey) {
      return NextResponse.json({ error: 'Missing DOKU signature or secret key' }, { status: 401 });
    }

    const isValid = validateDokuWebhookSignature({
      clientId: clientId || dokuConfig.clientId,
      requestId,
      requestTimestamp,
      requestTarget: '/api/billing/webhook/doku',
      rawBody: rawBodyText,
      receivedSignature: signature,
      secretKey: dokuConfig.secretKey,
    });

    if (!isValid) {
      console.error('[DOKU Webhook] Invalid signature from client:', clientId);
      return NextResponse.json({ error: 'Invalid DOKU signature' }, { status: 401 });
    }

    // 3. Extract Order, Transaction & Currency Information
    const invoiceNumber = body.order?.invoice_number;
    const transactionStatus = (body.transaction?.status || body.order?.status || '').toUpperCase();
    const originalRequestId = body.transaction?.original_request_id || requestId;
    const currency = (body.order?.currency || 'IDR').toUpperCase();
    const incomingAmount = body.order?.amount !== undefined ? Number(body.order.amount) : null;

    if (!invoiceNumber || typeof invoiceNumber !== 'string' || !invoiceNumber.trim()) {
      return NextResponse.json({ error: 'Missing order.invoice_number in DOKU payload' }, { status: 400 });
    }

    // Strict Currency Validation
    if (currency !== 'IDR') {
      return NextResponse.json(
        { error: `CURRENCY_MISMATCH: Expected IDR currency, received ${currency}` },
        { status: 400 }
      );
    }

    // 4. Preview Guard & Sandbox Isolation (Fail-Closed)
    // On Vercel Preview, settlement mutations are strictly restricted to legitimate DOKU Sandbox orders.
    // Production orders (e.g. MB- commercial orders) or non-sandbox environments are strictly blocked.
    if (isPreviewDeployment()) {
      const cleanInvoice = invoiceNumber.trim().toUpperCase();
      const isSandboxOrder = cleanInvoice.startsWith('MB-SBX-');
      const isSandboxEnv = dokuConfig.environment === 'sandbox';

      if (!isSandboxOrder || !isSandboxEnv) {
        console.warn(
          `[Preview Guard] Blocked non-sandbox webhook settlement in Preview deployment: invoice=${invoiceNumber}, env=${dokuConfig.environment}`
        );
        return previewBlockedResponse(
          'doku_webhook',
          'Webhook settlement billing pada Vercel Preview hanya diizinkan untuk DOKU Sandbox order (MB-SBX-).'
        );
      }
    }

    // 5. Strict Environment Namespace Validation
    try {
      validateDokuOrderEnvironment(invoiceNumber, dokuConfig.environment);
    } catch (envErr: any) {
      console.error(`[DOKU Webhook Security Alert] Mismatched environment for order ${invoiceNumber}:`, envErr.message);
      return NextResponse.json(
        { error: envErr.message, code: 'SECURITY_ENVIRONMENT_MISMATCH' },
        { status: 400 }
      );
    }

    // 4. Lookup Pre-Registered Order Snapshot (Immutable Source of Truth)
    const client = getServiceSupabase();
    const { data: existingPayment, error: queryErr } = await client
      .from('payments')
      .select('*')
      .eq('order_id', invoiceNumber)
      .maybeSingle();

    if (queryErr) {
      console.error(`[DOKU Webhook] Database query failure for order ${invoiceNumber}:`, queryErr);
      return NextResponse.json(
        { error: `Database error querying order ${invoiceNumber}: ${queryErr.message}` },
        { status: 500 }
      );
    }

    const snapshot = existingPayment ? null : getOrderSnapshot(invoiceNumber);

    if (!existingPayment && !snapshot) {
      console.warn(`[DOKU Webhook] Unrecognized order: ${invoiceNumber}`);
      return NextResponse.json(
        { error: `UNKNOWN_TRANSACTION: Order snapshot not found for invoice ${invoiceNumber}` },
        { status: 404 }
      );
    }

    const expectedOrgId = existingPayment?.organization_id || snapshot?.organizationId;
    const targetPlanTier = (existingPayment?.plan_tier || snapshot?.planTier || 'starter') as any;
    const expectedAmount = Number(existingPayment?.amount_idr || snapshot?.amountIdr || 0);

    // Authoritatively resolve package duration & interval from catalog (Fail-closed)
    const resolvedTerms = resolveOrderDurationAndInterval(
      existingPayment || {
        order_id: invoiceNumber,
        plan_tier: targetPlanTier,
        amount_idr: expectedAmount,
        duration_days: snapshot?.durationDays,
        billing_interval: snapshot?.billingInterval,
      }
    );
    const targetDurationDays = resolvedTerms.durationDays;
    const targetBillingInterval = resolvedTerms.billingInterval;

    const targetCustomerEmail =
      existingPayment?.snapshot_metadata?.customerEmail ||
      snapshot?.metadata?.customerEmail ||
      body.customer?.email ||
      null;

    // 5. Monotonic Payment State Protection
    // A delayed FAILED or EXPIRED event must NEVER downgrade an already confirmed PAID payment.
    if (existingPayment?.payment_status === 'PAID') {
      if (transactionStatus === 'FAILED' || transactionStatus === 'EXPIRED') {
        console.warn(
          `[DOKU Monotonic Protection] Order ${invoiceNumber} is already confirmed PAID. Ignored delayed ${transactionStatus} event.`
        );
        return NextResponse.json(
          {
            status: 'PAID',
            message: `Order is already confirmed PAID; ignoring delayed ${transactionStatus} event`,
            isIgnored: true,
          },
          { status: 200 }
        );
      }

      if (transactionStatus === 'SUCCESS') {
        // Duplicate valid webhook delivery -> Idempotent acknowledgment
        return NextResponse.json(
          {
            status: 'SUCCESS',
            isDuplicate: true,
            alreadyPaid: true,
            message: 'Payment already processed (idempotent)',
            orderId: invoiceNumber,
          },
          { status: 200 }
        );
      }
    }

    // 6. Handle FAILED or EXPIRED Notifications
    if (transactionStatus === 'FAILED' || transactionStatus === 'EXPIRED') {
      if (existingPayment?.payment_status === transactionStatus) {
        // Idempotent duplicate delivery of failure / expiration
        return NextResponse.json(
          {
            status: transactionStatus,
            isDuplicate: true,
            message: `Duplicate ${transactionStatus} event acknowledged`,
            orderId: invoiceNumber,
          },
          { status: 200 }
        );
      }

      // Transition payment status from PENDING to FAILED / EXPIRED atomically
      const { error: updateErr } = await client
        .from('payments')
        .update({
          payment_status: transactionStatus,
          provider_transaction_id: originalRequestId,
          updated_at: new Date().toISOString(),
        })
        .eq('order_id', invoiceNumber)
        .eq('payment_status', 'PENDING');

      if (updateErr) {
        console.error(`[DOKU Webhook] Failed to record ${transactionStatus} status:`, updateErr);
        return NextResponse.json(
          { error: `Failed to record payment ${transactionStatus}: ${updateErr.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          status: transactionStatus,
          message: `Payment status successfully updated to ${transactionStatus}`,
          orderId: invoiceNumber,
        },
        { status: 200 }
      );
    }

    // 7. Handle SUCCESS Notifications
    if (transactionStatus === 'SUCCESS') {
      // Validate Payment Status is PENDING
      if (existingPayment && existingPayment.payment_status !== 'PENDING') {
        return NextResponse.json(
          {
            error: `INVALID_PAYMENT_STATE: Order ${invoiceNumber} is in status ${existingPayment.payment_status}, expected PENDING`,
          },
          { status: 400 }
        );
      }

      // Validate Organization Ownership
      const incomingOrgId = body.customer?.id;
      if (incomingOrgId && expectedOrgId && incomingOrgId !== expectedOrgId) {
        return NextResponse.json(
          {
            error: `ORGANIZATION_MISMATCH: Order ${invoiceNumber} is bound to ${expectedOrgId} but received customer id ${incomingOrgId}`,
          },
          { status: 400 }
        );
      }

      // Validate Exact Payment Amount
      if (incomingAmount !== null && incomingAmount < expectedAmount) {
        return NextResponse.json(
          {
            error: `PAYMENT_AMOUNT_INSUFFICIENT: Received ${incomingAmount} IDR, expected ${expectedAmount} IDR`,
          },
          { status: 400 }
        );
      }

      // Atomic Database Settlement & Entitlement Activation
      const settlement = await executePaymentSettlement({
        orderId: invoiceNumber,
        organizationId: expectedOrgId,
        customerEmail: targetCustomerEmail,
        planTier: targetPlanTier,
        amountIdr: expectedAmount,
        durationDays: targetDurationDays,
        providerTransactionId: originalRequestId,
        paymentLinkUrl: existingPayment?.payment_link_url || 'https://doku.com',
        environment: dokuConfig.environment,
      });

      console.log(
        `[DOKU Settlement Success] Org: ${expectedOrgId}, Plan: ${targetPlanTier}, Expires: ${settlement.expiresAt}, Duplicate: ${settlement.isDuplicate}`
      );

      return NextResponse.json(
        {
          status: 'SUCCESS',
          isDuplicate: Boolean(settlement.isDuplicate),
          message: settlement.isDuplicate
            ? 'Payment already processed (idempotent)'
            : 'DOKU payment verified & subscription active',
          settlement: {
            orderId: settlement.orderId,
            planTier: settlement.planTier,
            expiresAt: settlement.expiresAt,
            maxDevicesQuota: settlement.maxDevicesQuota,
            alreadyPaid: settlement.alreadyPaid,
          },
        },
        { status: 200 }
      );
    }

    // 8. Other Unhandled Transaction Statuses
    return NextResponse.json(
      { message: `Unhandled transaction status: ${transactionStatus}`, status: transactionStatus },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('[DOKU Webhook Handler Error]', err);
    const isValidationErr =
      err.message?.includes('INVALID_') ||
      err.message?.includes('MISMATCH') ||
      err.message?.includes('UNRESOLVED_') ||
      err.message?.includes('AMBIGUOUS_') ||
      err.message?.includes('PRICE_NOT_FOUND') ||
      err.message?.includes('CONTRADICTORY_');
    const status = isValidationErr ? 400 : 500;
    return NextResponse.json(
      { error: err?.message || 'Internal server error processing DOKU webhook' },
      { status }
    );
  }
}
