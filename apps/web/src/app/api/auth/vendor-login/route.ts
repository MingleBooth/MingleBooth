import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { createSignedToken } from '@/lib/auth-server';
import { isPreviewDeployment, previewBlockedResponse } from '@/lib/preview-guard';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

/**
 * Vendor Device Activation & Login API (Catatan.md Section 14, 16, 17, 23)
 *
 * Flow:
 * 1. Checks vendor organization & subscription validity.
 * 2. Reads Hardware Fingerprint (HWID).
 * 3. Enforces Device Quota (Starter: 1, Pro: 3, Business: 10).
 * 4. Issues signed license token.
 */
export async function POST(req: NextRequest) {
  if (isPreviewDeployment()) {
    return previewBlockedResponse(
      'vendor_device_activation',
      'Aktivasi perangkat desktop dinonaktifkan pada Vercel Preview untuk melindungi integritas lisensi perangkat produksi.'
    );
  }

  try {
    const body = await req.json();
    const {
      email,
      password,
      hardwareFingerprint,
      deviceName = 'Operator Laptop',
      osType = 'mac',
      appVersion = '1.0.0',
    } = body;

    if (!email || !hardwareFingerprint) {
      return NextResponse.json(
        { error: 'Email dan Sidik Jari Hardware (HWID) wajib diisi.' },
        { status: 400, headers: corsHeaders }
      );
    }

    const client = getServiceSupabase();
    const cleanEmail = (email || '').toLowerCase().trim();

    // 1. Fetch organization authoritatively bound to this user profile
    const { data: userProfile } = await client
      .from('user_profiles')
      .select('organization_id, role, full_name')
      .ilike('email', cleanEmail)
      .limit(1)
      .maybeSingle();

    const isAdmin =
      cleanEmail.includes('admin') ||
      cleanEmail.endsWith('@minglebooth.com') ||
      userProfile?.role === 'superadmin' ||
      userProfile?.role === 'admin';

    let orgId = userProfile?.organization_id;

    if (!orgId && isAdmin) {
      const { data: hqOrg } = await client
        .from('organizations')
        .select('id')
        .eq('slug', 'minglebooth-hq')
        .maybeSingle();
      if (hqOrg) orgId = hqOrg.id;
    }

    if (!orgId) {
      return NextResponse.json(
        { error: 'Akun vendor tidak ditemukan. Pastikan Anda telah mendaftar di web.' },
        { status: 404, headers: corsHeaders }
      );
    }

    const { data: org, error: orgError } = await client
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single();

    if (orgError || !org) {
      return NextResponse.json(
        { error: 'Organisasi vendor tidak ditemukan.' },
        { status: 404, headers: corsHeaders }
      );
    }

    // 2. Check subscription status & expiration date
    const now = new Date();
    const expiresAt = org.subscription_expires_at ? new Date(org.subscription_expires_at) : new Date(0);

    const isSuperAdmin =
      isAdmin ||
      userProfile?.role === 'superadmin' ||
      userProfile?.role === 'admin' ||
      org.slug === 'minglebooth-hq';

    const hasActiveSubscription =
      (org.subscription_status === 'active' || isSuperAdmin) &&
      (expiresAt >= now || isSuperAdmin);

    // If unpaid account (pending_payment, expired, etc.):
    // Allow login into limited Demo Presentation WITHOUT registering a device or consuming device quota
    if (!hasActiveSubscription) {
      const demoTokenPayload = {
        orgId: org.id,
        orgName: org.name,
        planTier: org.plan_tier,
        maxDevices: 0,
        hwid: hardwareFingerprint,
        expiresAt: org.subscription_expires_at || new Date(0).toISOString(),
        issuedAt: new Date().toISOString(),
        isDemo: true,
        subscriptionStatus: org.subscription_status,
      };

      const demoLicenseToken = createSignedToken(demoTokenPayload);

      return NextResponse.json(
        {
          success: true,
          isDemo: true,
          isLicensed: false,
          subscriptionStatus: org.subscription_status,
          message:
            org.subscription_status === 'expired'
              ? 'Masa aktif langganan telah berakhir. Aplikasi berjalan dalam Mode Demo.'
              : 'Akun Anda belum memiliki langganan aktif. Aplikasi berjalan dalam Mode Demo untuk pengujian kamera.',
          licenseToken: demoLicenseToken,
          organization: {
            id: org.id,
            name: org.name,
            planTier: org.plan_tier,
            subscriptionStatus: org.subscription_status,
            expiresAt: org.subscription_expires_at,
            maxDevicesQuota: org.max_devices_quota,
            activeDevicesCount: 0,
          },
          device: {
            hwid: hardwareFingerprint,
            name: deviceName,
            is_demo: true,
          },
        },
        { status: 200, headers: corsHeaders }
      );
    }

    // 3. Check registered devices and quota for this organization (PAID ACCOUNTS ONLY)
    const { data: orgDevice } = await client
      .from('devices')
      .select('*')
      .eq('organization_id', org.id)
      .eq('hardware_fingerprint', hardwareFingerprint)
      .maybeSingle();

    const { count: activeCount } = await client
      .from('devices')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', org.id)
      .eq('is_active', true);

    const maxQuota = isSuperAdmin ? 9999 : (org.max_devices_quota || 99);
    const currentActiveCount = activeCount || 0;

    if (orgDevice && orgDevice.is_active) {
      // Existing active device: update last seen & metadata
      await client
        .from('devices')
        .update({
          last_seen_at: new Date().toISOString(),
          device_name: deviceName,
          os_type: osType,
          app_version: appVersion,
        })
        .eq('id', orgDevice.id);
    } else {
      // New device OR reactivating a deactivated device
      if (!isSuperAdmin && currentActiveCount >= maxQuota) {
        return NextResponse.json(
          {
            error: `Batas kuota perangkat tercapai (${currentActiveCount}/${maxQuota}). Silakan non-aktifkan salah satu laptop lama di Vendor Dashboard atau hubungi admin.`,
            code: 'DEVICE_QUOTA_EXCEEDED',
            currentActiveCount,
            maxQuota,
          },
          { status: 403, headers: corsHeaders }
        );
      }

      if (orgDevice) {
        // Reactivate previously deactivated device (prevents unique constraint violation)
        await client
          .from('devices')
          .update({
            is_active: true,
            last_seen_at: new Date().toISOString(),
            activated_at: new Date().toISOString(),
            device_name: deviceName,
            os_type: osType,
            app_version: appVersion,
          })
          .eq('id', orgDevice.id);
      } else {
        // Insert brand new device
        const { error: insertDevError } = await client.from('devices').insert({
          organization_id: org.id,
          hardware_fingerprint: hardwareFingerprint,
          device_name: deviceName,
          os_type: osType,
          app_version: appVersion,
          is_active: true,
          last_seen_at: new Date().toISOString(),
          activated_at: new Date().toISOString(),
        });

        if (insertDevError) {
          console.error('[Device Activation Insert Error]:', insertDevError);
        }
      }
    }

    // 4. Generate signed license token for offline use
    const tokenPayload = {
      orgId: org.id,
      orgName: org.name,
      planTier: org.plan_tier,
      maxDevices: maxQuota,
      hwid: hardwareFingerprint,
      expiresAt: org.subscription_expires_at,
      issuedAt: new Date().toISOString(),
    };

    const licenseToken = createSignedToken(tokenPayload);

    return NextResponse.json(
      {
        success: true,
        message: `Aktivasi perangkat berhasil! Selamat datang, ${org.name}.`,
        licenseToken,
        organization: {
          id: org.id,
          name: org.name,
          planTier: org.plan_tier,
          subscriptionStatus: org.subscription_status,
          expiresAt: org.subscription_expires_at,
          maxDevicesQuota: maxQuota,
          activeDevicesCount: (orgDevice && orgDevice.is_active) ? currentActiveCount : Math.min(currentActiveCount + 1, maxQuota),
        },
        device: {
          hwid: hardwareFingerprint,
          name: deviceName,
        },
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (err: any) {
    console.error('[Vendor Login Exception]:', err);
    return NextResponse.json(
      { error: err?.message || 'Gagal memproses login & aktivasi perangkat.' },
      { status: 500, headers: corsHeaders }
    );
  }
}
