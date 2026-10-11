import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { verifyServerAuth, corsHeaders } from '@/lib/auth-server';
import { isPreviewDeployment, previewBlockedResponse } from '@/lib/preview-guard';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  if (isPreviewDeployment()) {
    return previewBlockedResponse('deactivate_device', 'Device deactivation is disabled in Preview deployments to protect production devices.');
  }

  try {
    const auth = await verifyServerAuth(req);
    if (!auth.success) {
      return NextResponse.json(
        { error: auth.error, code: auth.code },
        { status: auth.status, headers: corsHeaders }
      );
    }

    // Role Guard: Only VENDOR_OWNER, VENDOR_ADMIN, or SUPER_ADMIN can deactivate devices
    if (!auth.isSuperAdmin && auth.role === 'VENDOR_STAFF') {
      return NextResponse.json(
        {
          error: 'Akses ditolak: Hanya Vendor Owner atau Administrator yang berwenang menonaktifkan perangkat.',
          code: 'ORG_ACCESS_DENIED',
        },
        { status: 403, headers: corsHeaders }
      );
    }

    const body = await req.json();
    const { deviceId } = body;

    if (!deviceId) {
      return NextResponse.json({ error: 'Device ID required' }, { status: 400, headers: corsHeaders });
    }

    const client = getServiceSupabase();

    // 1. Verify that the device belongs to the authenticated organization
    const { data: existingDevice } = await client
      .from('devices')
      .select('id, organization_id, is_active, device_name')
      .eq('id', deviceId)
      .maybeSingle();

    if (!existingDevice || (!auth.isSuperAdmin && existingDevice.organization_id !== auth.orgId)) {
      return NextResponse.json(
        { error: 'Akses ditolak: Perangkat tidak ditemukan atau bukan milik organisasi Anda.', code: 'ORG_ACCESS_DENIED' },
        { status: 403, headers: corsHeaders }
      );
    }

    // 2. Preserve device history: Update is_active to false (Idempotent)
    const { error } = await client
      .from('devices')
      .update({
        is_active: false,
        last_seen_at: new Date().toISOString(),
      })
      .eq('id', deviceId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400, headers: corsHeaders });
    }

    return NextResponse.json({
      success: true,
      message: `Perangkat "${existingDevice.device_name}" berhasil dinonaktifkan. Kuota slot perangkat telah dibebaskan.`,
      deviceId,
    }, { status: 200, headers: corsHeaders });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500, headers: corsHeaders });
  }
}
