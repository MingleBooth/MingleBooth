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

    // 1. Fetch organization quota info
    const { data: org } = await client
      .from('organizations')
      .select('id, name, plan_tier, max_devices_quota, subscription_status')
      .eq('id', orgId)
      .single();

    // 2. STRICT MULTI-TENANT FILTER: Query ONLY devices belonging to the verified organization
    const { data: rawDevices, error } = await client
      .from('devices')
      .select('id, device_name, os_type, app_version, is_active, activated_at, last_seen_at')
      .eq('organization_id', orgId)
      .order('activated_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400, headers: corsHeaders });
    }

    const devicesList = rawDevices || [];
    const activeCount = devicesList.filter((d: any) => d.is_active).length;
    const maxQuota = org?.max_devices_quota ?? 1;

    // Map safe fields only (never expose hardware fingerprints to renderer)
    const safeDevices = devicesList.map((d: any) => ({
      id: d.id,
      deviceName: d.device_name,
      device_name: d.device_name, // backward compatibility
      osType: d.os_type,
      os_type: d.os_type,
      appVersion: d.app_version || '1.0.0',
      app_version: d.app_version || '1.0.0',
      isActive: d.is_active,
      is_active: d.is_active,
      activatedAt: d.activated_at,
      activated_at: d.activated_at,
      lastSeenAt: d.last_seen_at,
      last_seen_at: d.last_seen_at,
    }));

    return NextResponse.json({
      devices: safeDevices,
      quota: {
        activeCount,
        maxQuota,
        planTier: org?.plan_tier || 'starter',
        isFull: activeCount >= maxQuota,
      },
    }, { headers: corsHeaders });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500, headers: corsHeaders });
  }
}
