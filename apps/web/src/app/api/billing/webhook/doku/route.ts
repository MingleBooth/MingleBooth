import { NextRequest, NextResponse } from 'next/server';
import { validateDokuWebhookSignature, getDokuConfig } from '@/lib/doku';
import { executePaymentSettlement } from '@/lib/billing-settlement';
import { getServiceSupabase } from '@/lib/supabase';
import { getOrderSnapshot } from '@/lib/pricing';
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
    if (isPreviewDeployment()) {
      return previewBlockedResponse(
        'doku_webhook',
        'Webhook settlement billing DOKU dinonaktifkan pada Vercel Preview.'
      );
    }

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

    // 1. Validate DOKU Webhook Signature if configured in production
    if (dokuConfig.secretKey) {
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
    } else if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Server misconfiguration: DOKU_SECRET_KEY is required in production' },
        { status: 500 }
      );
    }

    // 2. Extract DOKU Order & Transaction Information
    const invoiceNumber = body.order?.invoice_number;
    const transactionStatus = body.transaction?.status;
    const transactionDate = body.transaction?.date;
    const originalRequestId = body.transaction?.original_request_id || requestId;
    const paymentChannel = body.channel?.id || 'DOKU_CHECKOUT';

    if (!invoiceNumber) {
      return NextResponse.json({ error: 'Missing order.invoice_number in DOKU payload' }, { status: 400 });
    }

    // Only process successful payments
    if (transactionStatus !== 'SUCCESS') {
      return NextResponse.json(
        { message: 'Payment status not SUCCESS', status: transactionStatus },
        { status: 200 }
      );
    }

    // 3. Lookup Pre-Registered Order Snapshot (Immutable Source of Truth)
    const client = getServiceSupabase();
    const { data: existingPayment } = await client
      .from('payments')
      .select('*')
      .eq('order_id', invoiceNumber)
      .maybeSingle();

    const snapshot = existingPayment ? null : getOrderSnapshot(invoiceNumber);

    if (!existingPayment && !snapshot) {
      console.warn(`[DOKU Webhook] Unrecognized order: ${invoiceNumber}`);
      return NextResponse.json(
        { error: 'Order snapshot not found for invoice ' + invoiceNumber },
        { status: 404 }
      );
    }

    const targetOrgId = existingPayment?.organization_id || snapshot?.organizationId;
    const targetPlanTier = (existingPayment?.plan_tier || snapshot?.planTier || 'starter') as any;
    const targetAmount = Number(existingPayment?.amount_idr || snapshot?.amountIdr || 0);
    const targetDurationDays = Number(existingPayment?.duration_days || snapshot?.durationDays || 365);
    const targetCustomerEmail =
      existingPayment?.snapshot_metadata?.customerEmail ||
      snapshot?.metadata?.customerEmail ||
      body.customer?.email ||
      null;

    // 4. Atomic Database Settlement
    const settlement = await executePaymentSettlement({
      orderId: invoiceNumber,
      organizationId: targetOrgId,
      customerEmail: targetCustomerEmail,
      planTier: targetPlanTier,
      amountIdr: targetAmount,
      durationDays: targetDurationDays,
      providerTransactionId: originalRequestId,
      paymentLinkUrl: 'https://doku.com',
    });

    console.log(`[DOKU Settlement Success] Org: ${targetOrgId}, Plan: ${targetPlanTier}, Expires: ${settlement.expiresAt}`);

    return NextResponse.json(
      {
        status: 'SUCCESS',
        message: 'DOKU payment verified & subscription active',
        settlement: {
          orderId: settlement.orderId,
          planTier: settlement.planTier,
          expiresAt: settlement.expiresAt,
          maxDevicesQuota: settlement.maxDevicesQuota,
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('[DOKU Webhook Handler Error]', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error processing DOKU webhook' },
      { status: 500 }
    );
  }
}
