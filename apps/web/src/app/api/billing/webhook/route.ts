import { NextRequest, NextResponse } from 'next/server';
import { validateLynkSignature } from '@/lib/lynk';
import { executePaymentSettlement } from '@/lib/billing-settlement';
import { getServiceSupabase } from '@/lib/supabase';
import { getActivePricingCatalog, getOrderSnapshot } from '@/lib/pricing';
import { isPreviewDeployment, previewBlockedResponse } from '@/lib/preview-guard';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    if (isPreviewDeployment()) {
      return previewBlockedResponse(
        'billing_webhook',
        'Webhook settlement billing dinonaktifkan pada Vercel Preview.'
      );
    }

    const rawBody = await req.json();
    const receivedSignature = req.headers.get('x-lynk-signature') || '';
    const secretKey = process.env.LYNK_MERCHANT_KEY || '';

    // 1. Server Configuration Check in Production
    if (process.env.NODE_ENV === 'production' && !secretKey) {
      return NextResponse.json(
        { error: 'Server misconfiguration: LYNK_MERCHANT_KEY is required in production' },
        { status: 500 }
      );
    }

    // 2. Webhook Signature Validation (Fail-closed when configured or in production)
    if (secretKey || process.env.NODE_ENV === 'production') {
      if (!receivedSignature) {
        return NextResponse.json({ error: 'Missing Lynk.id signature' }, { status: 401 });
      }
    }

    const { event, data } = rawBody;

    if (event !== 'payment.received' || !data) {
      return NextResponse.json({ message: 'Ignored non-payment event' }, { status: 200 });
    }

    const { message_action, message_id, message_data } = data;

    if (message_action !== 'SUCCESS' || !message_data) {
      return NextResponse.json({ message: 'Payment not successful', status: message_action }, { status: 200 });
    }

    const { refId, totals, customer, items } = message_data;
    const grandTotal = Number(totals?.grandTotal ?? 0);

    // Verify cryptographic signature
    if (secretKey || receivedSignature) {
      const isValid = validateLynkSignature(
        refId || '',
        grandTotal.toString(),
        message_id || '',
        receivedSignature,
        secretKey
      );

      if (!isValid) {
        return NextResponse.json({ error: 'Invalid Lynk.id signature' }, { status: 401 });
      }
    }

    const orderRef = refId || (message_id ? `LYNK-${message_id}` : null);
    if (!orderRef) {
      return NextResponse.json({ error: 'Missing order reference' }, { status: 400 });
    }

    // 3. Lookup Pre-Registered Order Snapshot (Immutable Source of Truth)
    const client = getServiceSupabase();
    const { data: existingPayment } = await client
      .from('payments')
      .select('*')
      .eq('order_id', orderRef)
      .maybeSingle();

    let planTier: 'starter' | 'pro' | 'business';
    let durationDays: number;
    let targetOrgId: string | null = existingPayment?.organization_id || null;

    if (existingPayment) {
      if (!targetOrgId) {
        return NextResponse.json(
          { error: `MISSING_ORGANIZATION: Order ${orderRef} is not bound to a valid organization` },
          { status: 400 }
        );
      }

      // Cross-validate item title against pre-registered plan
      const itemTitle = (items?.[0]?.title || '').toLowerCase();
      const itemPlan = itemTitle.includes('business') ? 'business' : (itemTitle.includes('starter') ? 'starter' : (itemTitle.includes('pro') ? 'pro' : null));
      if (existingPayment.plan_tier && itemPlan && itemPlan !== existingPayment.plan_tier) {
        return NextResponse.json(
          { error: `PLAN_MISMATCH: Order ${orderRef} is pre-registered for ${existingPayment.plan_tier} plan but requested ${itemPlan}` },
          { status: 400 }
        );
      }

      // Authoritative commercial snapshot resolution (preserves original pricing & terms)
      const snapshot = getOrderSnapshot(orderRef);
      planTier = existingPayment.plan_tier as any;
      durationDays = existingPayment.duration_days
        ? Number(existingPayment.duration_days)
        : (snapshot?.durationDays ?? (existingPayment.billing_interval === 'monthly' ? 30 : (itemTitle.includes('bulan') || itemTitle.includes('month') ? 30 : 365)));

      const expectedAmount = Number(existingPayment.amount_idr);
      if (grandTotal < expectedAmount) {
        return NextResponse.json(
          { error: `PAYMENT_AMOUNT_INSUFFICIENT: Received ${grandTotal} IDR, expected ${expectedAmount} IDR` },
          { status: 400 }
        );
      }
      if (grandTotal > expectedAmount) {
        return NextResponse.json(
          { error: `PAYMENT_AMOUNT_MISMATCH: Received ${grandTotal} IDR, expected ${expectedAmount} IDR` },
          { status: 400 }
        );
      }
    } else {
      // Direct Webhook without pre-registered order:
      // Authoritative check: Look up user profile by verified customer email ONLY
      if (!customer?.email) {
        return NextResponse.json(
          {
            error: `MISSING_ORGANIZATION: Order reference '${orderRef}' has no pre-registered snapshot and no customer email`,
            code: 'MISSING_ORGANIZATION',
          },
          { status: 400 }
        );
      }

      const cleanEmail = customer.email.trim().toLowerCase();
      const { data: userProfile } = await client
        .from('user_profiles')
        .select('organization_id')
        .ilike('email', cleanEmail)
        .limit(1)
        .maybeSingle();

      if (!userProfile?.organization_id) {
        return NextResponse.json(
          {
            error: `MISSING_ORGANIZATION: No registered organization found for customer email '${cleanEmail}'`,
            code: 'MISSING_ORGANIZATION',
          },
          { status: 400 }
        );
      }

      targetOrgId = userProfile.organization_id;

      // Resolve dynamically against published pricing catalog
      const catalog = await getActivePricingCatalog();
      const itemTitle = (items?.[0]?.title || '').toLowerCase();
      const isTestItem = itemTitle.includes('test') || orderRef.includes('TEST');

      // Check for price match in catalog
      const matchedPrice = catalog.prices.find((p) => p.amountIdr === grandTotal && p.isActive);

      if (matchedPrice) {
        planTier = matchedPrice.planId;
        durationDays = matchedPrice.durationDays;
      } else if (isTestItem) {
        // Fallback for test items in sandbox
        planTier = itemTitle.includes('business') ? 'business' : (itemTitle.includes('starter') ? 'starter' : 'pro');
        durationDays = (itemTitle.includes('bulan') || itemTitle.includes('month')) ? 30 : 365;
      } else {
        return NextResponse.json(
          {
            error: `UNRECOGNIZED_SUBSCRIPTION_AMOUNT: Received payment of ${grandTotal} IDR does not match any active subscription plan.`,
            code: 'AMOUNT_MISMATCH',
          },
          { status: 400 }
        );
      }
    }

    if (!targetOrgId) {
      return NextResponse.json(
        {
          error: `MISSING_ORGANIZATION: No authorized organization bound to order '${orderRef}'`,
          code: 'MISSING_ORGANIZATION',
        },
        { status: 400 }
      );
    }

    // 4. Execute Exactly-Once Settlement via Unified Billing Engine
    const settlement = await executePaymentSettlement({
      orderId: orderRef,
      organizationId: targetOrgId,
      customerEmail: customer?.email,
      planTier,
      amountIdr: grandTotal,
      durationDays,
      providerTransactionId: message_id,
      paymentLinkUrl: 'https://lynk.id',
    });

    return NextResponse.json({
      success: true,
      message: settlement.isDuplicate
        ? 'Payment already processed (idempotent)'
        : `Lynk.id payment verified! License extended until ${settlement.expiresAt}.`,
      planTier: settlement.planTier,
      maxDevices: settlement.maxDevicesQuota,
      expiresAt: settlement.expiresAt,
      refId: settlement.orderId,
      durationDays: settlement.durationDays,
      isDuplicate: settlement.isDuplicate,
    }, { status: 200 });
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
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status });
  }
}
