import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { verifyServerAuth, corsHeaders } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyServerAuth(req);
    if (!auth.success) {
      return NextResponse.json(
        { error: auth.error, code: auth.code },
        { status: auth.status, headers: corsHeaders }
      );
    }

    const client = getServiceSupabase();
    const orgId = auth.orgId;

    // 1. Fetch organization entitlement info
    const { data: org, error: orgError } = await client
      .from('organizations')
      .select('id, name, slug, plan_tier, subscription_status, subscription_expires_at, max_devices_quota')
      .eq('id', orgId)
      .single();

    if (orgError || !org) {
      return NextResponse.json(
        { error: 'Organisasi vendor tidak ditemukan.', code: 'ORG_ACCESS_DENIED' },
        { status: 404, headers: corsHeaders }
      );
    }

    // 2. Fetch payment transactions strictly scoped to authenticated tenant
    const { data: rawPayments, error: payError } = await client
      .from('payments')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (payError) {
      return NextResponse.json(
        { error: payError.message },
        { status: 500, headers: corsHeaders }
      );
    }

    const safePayments = (rawPayments || []).map((p: any) => ({
      id: p.id,
      orderId: p.order_id,
      planTier: p.plan_tier,
      amountIdr: Number(p.amount_idr),
      paymentStatus: p.payment_status,
      billingInterval: p.billing_interval || null,
      durationDays: p.duration_days ? Number(p.duration_days) : null,
      currency: p.currency || 'IDR',
      createdAt: p.created_at,
      paidAt: p.paid_at,
    }));

    return NextResponse.json(
      {
        organization: {
          id: org.id,
          name: org.name,
          slug: org.slug,
          planTier: org.plan_tier,
          subscriptionStatus: org.subscription_status,
          subscriptionExpiresAt: org.subscription_expires_at,
          maxDevicesQuota: org.max_devices_quota,
        },
        payments: safePayments,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
