import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { executePaymentSettlement } from '@/lib/billing-settlement';
import { getServiceSupabase } from '@/lib/supabase';
import { isPreviewDeployment, previewBlockedResponse } from '@/lib/preview-guard';

export const dynamic = 'force-dynamic';

/**
 * Payment Webhook Handler (Catatan.md Section 20 & 22)
 *
 * Flow:
 * Vendor -> Payment Link -> Payment Confirmed -> Webhook -> Verify Order -> Subscription ACTIVE -> License ACTIVE
 */
export async function POST(req: NextRequest) {
  try {
    if (isPreviewDeployment()) {
      return previewBlockedResponse(
        'payment_webhook',
        'Webhook pembayaran dinonaktifkan pada Vercel Preview.'
      );
    }

    const body = await req.json();
    const signature = req.headers.get('x-payment-signature') || req.headers.get('x-webhook-signature');

    // Cryptographic signature verification
    const secret = process.env.PAYMENT_WEBHOOK_SECRET;
    if (secret) {
      if (!signature) {
        return NextResponse.json({ error: 'Missing webhook signature' }, { status: 401 });
      }
      const rawBody = JSON.stringify(body);
      const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      const expectedBuf = Buffer.from(expected, 'utf8');
      const sigBuf = Buffer.from(signature, 'utf8');

      if (expectedBuf.length !== sigBuf.length || !crypto.timingSafeEqual(expectedBuf, sigBuf)) {
        return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
      }
    } else if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'PAYMENT_WEBHOOK_SECRET is required in production' }, { status: 500 });
    }

    const {
      orderId,
      organizationId,
      planTier,
      paymentStatus,
      amountIdr,
      durationDays,
      providerTransactionId,
    } = body;

    if (!orderId || !organizationId) {
      return NextResponse.json({ error: 'Missing required order metadata' }, { status: 400 });
    }

    if (planTier && !['starter', 'pro', 'business'].includes(planTier)) {
      return NextResponse.json({ error: `Invalid plan tier: ${planTier}` }, { status: 400 });
    }

    // Authoritative snapshot lookup
    const client = getServiceSupabase();
    const { data: existingPayment } = await client
      .from('payments')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle();

    if (existingPayment?.organization_id && organizationId !== existingPayment.organization_id) {
      return NextResponse.json(
        { error: `ORGANIZATION_MISMATCH: Order ${orderId} is bound to ${existingPayment.organization_id}` },
        { status: 400 }
      );
    }

    const effectivePlan = planTier || existingPayment?.plan_tier;
    if (!effectivePlan || !['starter', 'pro', 'business'].includes(effectivePlan)) {
      return NextResponse.json({ error: 'Missing or invalid plan tier' }, { status: 400 });
    }

    if (existingPayment?.plan_tier && planTier && planTier !== existingPayment.plan_tier) {
      return NextResponse.json(
        { error: `PLAN_MISMATCH: Order ${orderId} is pre-registered for ${existingPayment.plan_tier} plan but requested ${planTier}` },
        { status: 400 }
      );
    }

    const effectiveAmount = amountIdr !== undefined ? Number(amountIdr) : Number(existingPayment?.amount_idr);
    if (!effectiveAmount || isNaN(effectiveAmount) || effectiveAmount <= 0) {
      return NextResponse.json({ error: 'Missing or invalid payment amount' }, { status: 400 });
    }

    const effectiveDuration = durationDays !== undefined
      ? Number(durationDays)
      : (existingPayment?.duration_days
        ? Number(existingPayment.duration_days)
        : (existingPayment?.billing_interval === 'monthly' ? 30 : 365));

    if (![30, 365].includes(effectiveDuration)) {
      return NextResponse.json({ error: 'Missing or invalid subscription duration' }, { status: 400 });
    }

    if (paymentStatus === 'PAID' || paymentStatus === 'SUCCESS') {
      const settlement = await executePaymentSettlement({
        orderId,
        organizationId,
        planTier: effectivePlan,
        amountIdr: effectiveAmount,
        durationDays: effectiveDuration,
        providerTransactionId: providerTransactionId || `TX-${orderId}`,
        paymentLinkUrl: 'https://minglebooth.com',
      });

      return NextResponse.json({
        success: true,
        orderId: settlement.orderId,
        isDuplicate: settlement.isDuplicate,
        message: settlement.isDuplicate
          ? 'Payment already processed (idempotent)'
          : `Subscription successfully activated until ${settlement.expiresAt}`,
        expiresAt: settlement.expiresAt,
      }, { status: 200 });
    }

    return NextResponse.json({ received: true, status: paymentStatus });
  } catch (err: any) {
    const isValidationErr = err.message && (
      err.message.includes('ORGANIZATION_MISMATCH') ||
      err.message.includes('PLAN_MISMATCH') ||
      err.message.includes('INVALID_PLAN_TIER') ||
      err.message.includes('INVALID_AMOUNT') ||
      err.message.includes('INVALID_DURATION') ||
      err.message.includes('PAYMENT_AMOUNT_INSUFFICIENT') ||
      err.message.includes('PAYMENT_AMOUNT_MISMATCH')
    );
    const status = isValidationErr ? 400 : 500;
    return NextResponse.json({ error: err?.message || 'Internal Server Error' }, { status });
  }
}
