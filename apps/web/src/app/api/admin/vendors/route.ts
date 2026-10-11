import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { verifyServerAuth } from '@/lib/auth-server';
import { isPreviewDeployment, previewBlockedResponse } from '@/lib/preview-guard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyServerAuth(req);
    if (!auth.isValid) {
      return NextResponse.json({ error: auth.error, code: 'AUTH_REQUIRED' }, { status: auth.status || 401 });
    }
    if (!auth.isSuperAdmin) {
      return NextResponse.json({ error: 'Superadmin role required', code: 'ORG_ACCESS_DENIED' }, { status: 403 });
    }

    const client = getServiceSupabase();

    const { data: orgs, error: orgErr } = await client
      .from('organizations')
      .select('*, devices(*), events(*)');

    if (orgErr) {
      return NextResponse.json({ error: orgErr.message }, { status: 500 });
    }

    const formattedVendors = (orgs || []).map((o) => ({
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
    }));

    return NextResponse.json({
      success: true,
      vendors: formattedVendors,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (isPreviewDeployment()) {
      return previewBlockedResponse(
        'modify_vendor',
        'Modifikasi data vendor dan reset perangkat dinonaktifkan pada Vercel Preview.'
      );
    }

    const auth = await verifyServerAuth(req);
    if (!auth.isValid) {
      return NextResponse.json({ error: auth.error, code: 'AUTH_REQUIRED' }, { status: auth.status || 401 });
    }
    if (!auth.isSuperAdmin) {
      return NextResponse.json({ error: 'Superadmin role required', code: 'ORG_ACCESS_DENIED' }, { status: 403 });
    }

    const body = await req.json();
    const { orgId, action, planTier } = body;

    if (!orgId) {
      return NextResponse.json({ error: 'orgId required' }, { status: 400 });
    }

    const client = getServiceSupabase();

    if (action === 'extend_1_year') {
      const { data: targetOrg } = await client
        .from('organizations')
        .select('subscription_expires_at, subscription_status')
        .eq('id', orgId)
        .single();

      const currentExpiryMs = targetOrg?.subscription_expires_at
        ? new Date(targetOrg.subscription_expires_at).getTime()
        : 0;
      const baseTimeMs =
        currentExpiryMs > Date.now() && targetOrg?.subscription_status !== 'expired'
          ? currentExpiryMs
          : Date.now();
      const expiresAt = new Date(baseTimeMs + 365 * 24 * 60 * 60 * 1000).toISOString();

      await client
        .from('organizations')
        .update({
          subscription_status: 'active',
          subscription_expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orgId);

      return NextResponse.json({ success: true, message: 'Lisensi vendor berhasil diperpanjang +365 Hari!' });
    }

    if (action === 'change_plan') {
      let maxDevices = 3;
      if (planTier === 'starter') maxDevices = 1;
      if (planTier === 'business') maxDevices = 10;

      await client
        .from('organizations')
        .update({
          plan_tier: planTier,
          max_devices_quota: maxDevices,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orgId);

      return NextResponse.json({ success: true, message: `Paket diubah ke ${planTier.toUpperCase()} (Kuota: ${maxDevices} Device)!` });
    }

    if (action === 'reset_devices') {
      await client.from('devices').delete().eq('organization_id', orgId);
      return NextResponse.json({ success: true, message: 'Semua HWID perangkat vendor berhasil di-reset!' });
    }

    return NextResponse.json({ error: 'Action not supported' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
