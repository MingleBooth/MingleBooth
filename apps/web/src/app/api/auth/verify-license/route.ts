import { NextRequest, NextResponse } from 'next/server';
import { verifyServerAuth, corsHeaders } from '@/lib/auth-server';
import { getServiceSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

/**
 * Online License Verification Endpoint (Catatan.md Section 17 & Phase 15.2)
 * Validates HMAC signature, checks Supabase organization active status,
 * and confirms that the hardware device is not deactivated.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await verifyServerAuth(req);
    if (!auth.success) {
      return NextResponse.json(
        { success: false, valid: false, error: auth.error, code: auth.code },
        { status: auth.status, headers: corsHeaders }
      );
    }

    const client = getServiceSupabase();

    // 1. Fetch live organization status
    const { data: org, error: orgErr } = await client
      .from('organizations')
      .select('*')
      .eq('id', auth.orgId)
      .single();

    if (orgErr || !org) {
      return NextResponse.json(
        { success: false, valid: false, error: 'Organisasi tidak ditemukan.', code: 'ORG_ACCESS_DENIED' },
        { status: 404, headers: corsHeaders }
      );
    }

    const now = Date.now();
    const expiryMs = org.subscription_expires_at ? new Date(org.subscription_expires_at).getTime() : 0;
    const isSuperAdmin = auth.isSuperAdmin || org.slug === 'minglebooth-hq';
    const hasActiveSubscription =
      (org.subscription_status === 'active' || isSuperAdmin) &&
      (expiryMs >= now || isSuperAdmin);

    // If account has no active subscription or token is demo:
    // Report valid authentication in Demo Presentation mode
    if (!hasActiveSubscription || auth.payload?.isDemo) {
      return NextResponse.json(
        {
          success: true,
          valid: true,
          isDemo: true,
          isLicensed: false,
          subscriptionStatus: org.subscription_status,
          organization: {
            id: org.id,
            name: org.name,
            planTier: org.plan_tier,
            subscriptionStatus: org.subscription_status,
            expiresAt: org.subscription_expires_at,
            maxDevicesQuota: org.max_devices_quota,
          },
          device: {
            hwid: auth.hwid || '',
            is_demo: true,
          },
          daysRemaining: 0,
          message:
            org.subscription_status === 'expired'
              ? 'Masa aktif langganan telah berakhir di cloud. Aplikasi berjalan dalam Mode Demo.'
              : 'Langganan organisasi belum aktif di cloud. Aplikasi berjalan dalam Mode Demo.',
        },
        { status: 200, headers: corsHeaders }
      );
    }

    // 2. If HWID is present in token, verify device is still active
    let deviceStatus = null;
    if (auth.hwid) {
      const { data: device } = await client
        .from('devices')
        .select('*')
        .eq('organization_id', org.id)
        .eq('hardware_fingerprint', auth.hwid)
        .maybeSingle();

      if (device) {
        if (!device.is_active) {
          return NextResponse.json(
            {
              success: false,
              valid: false,
              error: 'Perangkat ini telah dinonaktifkan dari Vendor Dashboard.',
              code: 'DEVICE_MISMATCH',
            },
            { status: 403, headers: corsHeaders }
          );
        }
        deviceStatus = {
          id: device.id,
          name: device.device_name,
          hwid: device.hardware_fingerprint,
          isActive: device.is_active,
        };
      }
    }

    const daysRemaining = Math.max(0, Math.ceil((expiryMs - now) / (1000 * 60 * 60 * 24)));

    return NextResponse.json(
      {
        success: true,
        valid: true,
        organization: {
          id: org.id,
          name: org.name,
          planTier: org.plan_tier,
          subscriptionStatus: org.subscription_status,
          expiresAt: org.subscription_expires_at,
          maxDevicesQuota: org.max_devices_quota,
        },
        device: deviceStatus,
        daysRemaining,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, valid: false, error: err?.message || 'Gagal memverifikasi lisensi.' },
      { status: 500, headers: corsHeaders }
    );
  }
}
