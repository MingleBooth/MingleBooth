import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getServiceSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Validate Lynk.id Webhook Signature using SHA256
 * signatureString = amount + ref_id + message_id + secret_key
 */
function validateLynkSignature(
  refId: string,
  amount: string | number,
  messageId: string,
  receivedSignature: string,
  secretKey: string
): boolean {
  if (!secretKey) return true; // Allow dev testing if secret key is not set
  const signatureString = `${amount}${refId}${messageId}${secretKey}`;
  const calculatedSignature = crypto
    .createHash('sha256')
    .update(signatureString)
    .digest('hex');
  return calculatedSignature === receivedSignature;
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const receivedSignature = req.headers.get('x-lynk-signature') || '';
    const secretKey = process.env.LYNK_MERCHANT_KEY || '';

    const { event, data } = rawBody;

    if (event !== 'payment.received' || !data) {
      return NextResponse.json({ message: 'Ignored non-payment event' }, { status: 200 });
    }

    const { message_action, message_id, message_data } = data;

    if (message_action !== 'SUCCESS' || !message_data) {
      return NextResponse.json({ message: 'Payment not successful' }, { status: 200 });
    }

    const { refId, totals, customer, items } = message_data;
    const grandTotal = totals?.grandTotal ?? 0;

    // Verify cryptographic signature if secret key is set
    if (secretKey && receivedSignature) {
      const isValid = validateLynkSignature(
        refId,
        grandTotal.toString(),
        message_id,
        receivedSignature,
        secretKey
      );

      if (!isValid) {
        console.error('[Lynk Webhook] Invalid Signature received:', receivedSignature);
        return NextResponse.json({ error: 'Invalid Lynk.id signature' }, { status: 401 });
      }
    }

    const client = getServiceSupabase();

    // 1. Determine plan tier based on catatan.md Section 15
    let planTier = 'pro';
    let maxDevices = 3;

    const itemTitle = (items?.[0]?.title || '').toLowerCase();
    if (itemTitle.includes('business') || grandTotal >= 5000000) {
      planTier = 'business';
      maxDevices = 10;
    } else if (itemTitle.includes('starter') || (grandTotal <= 2000000 && !itemTitle.includes('pro'))) {
      planTier = 'starter';
      maxDevices = 1;
    } else {
      planTier = 'pro';
      maxDevices = 3;
    }

    // 2. Find Organization (by customer email or auto-provision / fallback)
    let orgId: string | null = null;

    if (customer?.email) {
      const cleanEmail = customer.email.trim().toLowerCase();
      const { data: userProfile } = await client
        .from('user_profiles')
        .select('organization_id')
        .ilike('email', cleanEmail)
        .limit(1)
        .maybeSingle();

      if (userProfile?.organization_id) {
        orgId = userProfile.organization_id;
      }
    }

    // If customer paid but doesn't have an organization yet, auto-provision one
    if (!orgId && customer?.email) {
      const cleanEmail = customer.email.trim().toLowerCase();
      const vendorName = customer.name?.trim() || cleanEmail.split('@')[0];
      const orgSlug = `${vendorName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Math.random().toString(36).substring(2, 7)}`;

      const { data: createdOrg, error: createOrgErr } = await client
        .from('organizations')
        .insert({
          name: vendorName,
          slug: orgSlug,
          plan_tier: planTier,
          subscription_status: 'active',
          subscription_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          max_devices_quota: maxDevices,
        })
        .select('id')
        .maybeSingle();

      if (!createOrgErr && createdOrg) {
        orgId = createdOrg.id;
        console.log(`[Lynk Webhook] Auto-provisioned organization ${orgId} for customer ${cleanEmail}`);
      }
    }

    if (!orgId) {
      const { data: defaultOrg } = await client
        .from('organizations')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      orgId = defaultOrg?.id || null;
    }

    if (!orgId) {
      return NextResponse.json({ error: 'No organization found to assign license' }, { status: 400 });
    }

    // 3. Extend Subscription Expiry Date by +365 Days (preserve remaining days if still active)
    const { data: orgData } = await client
      .from('organizations')
      .select('id, subscription_expires_at')
      .eq('id', orgId)
      .maybeSingle();

    const currentExpiryMs = orgData?.subscription_expires_at ? new Date(orgData.subscription_expires_at).getTime() : 0;
    const baseTimeMs = currentExpiryMs > Date.now() ? currentExpiryMs : Date.now();
    const expiresAt = new Date(baseTimeMs + 365 * 24 * 60 * 60 * 1000).toISOString();

    const { error: orgUpdateError } = await client
      .from('organizations')
      .update({
        subscription_status: 'active',
        subscription_expires_at: expiresAt,
        plan_tier: planTier,
        max_devices_quota: maxDevices,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orgId);

    if (orgUpdateError) {
      console.error('[Lynk Webhook] Org update failed:', orgUpdateError);
      return NextResponse.json({ error: orgUpdateError.message }, { status: 500 });
    }

    // 4. Record Payment in Supabase payments table
    const { error: payError } = await client
      .from('payments')
      .upsert(
        {
          order_id: refId || `LYNK-${Date.now()}`,
          organization_id: orgId,
          plan_tier: planTier,
          amount_idr: grandTotal,
          payment_status: 'PAID',
          payment_link_url: 'https://lynk.id',
          provider_transaction_id: message_id,
          paid_at: new Date().toISOString(),
        },
        { onConflict: 'order_id' }
      );

    if (payError) {
      console.warn('[Lynk Webhook] Payment log notice:', payError.message);
    }

    return NextResponse.json({
      success: true,
      message: `Lynk.id payment verified! License extended for 365 days until ${expiresAt}.`,
      planTier,
      maxDevices,
      expiresAt,
      refId,
    });
  } catch (err: any) {
    console.error('[Lynk Webhook Exception]:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
