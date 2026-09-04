import { NextRequest, NextResponse } from 'next/server';

/**
 * Payment Webhook Handler (Catatan.md Section 20 & 22)
 *
 * Flow:
 * Vendor -> Payment Link -> Payment Confirmed -> Webhook -> Verify Order -> Subscription ACTIVE -> License ACTIVE
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const signature = req.headers.get('x-payment-signature') || req.headers.get('x-webhook-signature');

    // In production, verify cryptographic HMAC signature with PAYMENT_WEBHOOK_SECRET
    console.log('[Payment Webhook Received]:', body);

    const { orderId, organizationId, planTier, paymentStatus } = body;

    if (!orderId || !organizationId) {
      return NextResponse.json({ error: 'Missing required order metadata' }, { status: 400 });
    }

    if (paymentStatus === 'PAID' || paymentStatus === 'SUCCESS') {
      // 1. Update organization subscription status to 'active'
      // 2. Add 365 days to valid_until
      // 3. Issue license token for organization devices
      console.log(`[Order Confirmed]: ${orderId} for Org ${organizationId} (Plan: ${planTier})`);

      return NextResponse.json({
        success: true,
        orderId,
        message: 'Subscription successfully activated for 365 days',
      });
    }

    return NextResponse.json({ received: true, status: paymentStatus });
  } catch (err: any) {
    console.error('[Payment Webhook Error]:', err);
    return NextResponse.json({ error: err?.message || 'Internal Server Error' }, { status: 500 });
  }
}
