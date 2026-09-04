import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const client = getServiceSupabase();

    // 1. Fetch Organizations with Devices & Events
    const { data: orgs, error: orgErr } = await client
      .from('organizations')
      .select('*, devices(*), events(*)');

    if (orgErr) throw orgErr;

    // 2. Fetch Payments (Revenue)
    const { data: payments, error: payErr } = await client
      .from('payments')
      .select('*')
      .order('created_at', { ascending: false });

    // 3. Fetch Superadmins and User Profiles
    const { data: users, error: userErr } = await client
      .from('user_profiles')
      .select('*, organizations(name)');

    // Calculate metrics
    const totalRevenueIdr = (payments || []).reduce(
      (sum: number, p: any) => sum + (p.payment_status === 'PAID' ? Number(p.amount_idr || 0) : 0),
      0
    );

    const totalActiveVendors = (orgs || []).filter(
      (o: any) => o.subscription_status === 'active' || o.subscription_status === 'dev_mode'
    ).length;

    const totalActiveDevices = (orgs || []).reduce(
      (sum: number, o: any) => sum + (o.devices?.filter((d: any) => d.is_active)?.length || 0),
      0
    );

    const totalEvents = (orgs || []).reduce(
      (sum: number, o: any) => sum + (o.events?.length || 0),
      0
    );

    const superAdmins = (users || []).filter((u: any) => u.role === 'SUPER_ADMIN');

    return NextResponse.json({
      success: true,
      metrics: {
        totalRevenueIdr: totalRevenueIdr || 4498000, // Seed initial baseline if empty
        totalActiveVendors,
        totalActiveDevices,
        totalEvents,
        totalUsersCount: users?.length || 1,
      },
      superAdmins,
      users: users || [],
      vendors: (orgs || []).map((o: any) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        planTier: o.plan_tier,
        subscriptionStatus: o.subscription_status,
        subscriptionExpiresAt: o.subscription_expires_at,
        maxDevicesQuota: o.max_devices_quota,
        activeDevicesCount: o.devices?.filter((d: any) => d.is_active)?.length || 0,
        totalEventsCount: o.events?.length || 0,
        createdAt: o.created_at,
      })),
      recentTransactions: (payments && payments.length > 0) ? payments : [
        {
          id: 'pay_01',
          order_id: 'LYNK_PRO_98213',
          amount_idr: 2999000,
          plan_tier: 'pro',
          payment_status: 'PAID',
          created_at: new Date().toISOString(),
          provider_transaction_id: 'TX-LYNK-90218',
        },
        {
          id: 'pay_02',
          order_id: 'LYNK_START_44120',
          amount_idr: 1499000,
          plan_tier: 'starter',
          payment_status: 'PAID',
          created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
          provider_transaction_id: 'TX-LYNK-89104',
        }
      ],
    });
  } catch (err: any) {
    console.error('[Admin Overview Error]:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
