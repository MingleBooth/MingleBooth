import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
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

    // 1. Fetch organization
    // For demo/dev mode: match default org or look up user profile
    const { data: userProfile } = await client
      .from('user_profiles')
      .select('organization_id, role, full_name')
      .eq('email', email)
      .limit(1)
      .single();

    let orgId = userProfile?.organization_id;

    if (!orgId) {
      const { data: defaultOrg } = await client
        .from('organizations')
        .select('id')
        .limit(1)
        .single();
      orgId = defaultOrg?.id;
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
    const expiresAt = new Date(org.subscription_expires_at);

    if (org.subscription_status === 'expired' || expiresAt < now) {
      return NextResponse.json(
        {
          error: 'Masa aktif langganan Anda telah berakhir. Silakan lakukan perpanjangan di halaman Billing.',
          code: 'SUBSCRIPTION_EXPIRED',
        },
        { status: 403, headers: corsHeaders }
      );
    }

    // 3. Check registered devices for this organization
    const { data: registeredDevices, error: devError } = await client
      .from('devices')
      .select('*')
      .eq('organization_id', org.id)
      .eq('is_active', true);

    const existingDevice = registeredDevices?.find(
      (d) => d.hardware_fingerprint === hardwareFingerprint
    );

    const maxQuota = org.max_devices_quota || 3;
    const currentActiveCount = registeredDevices?.length || 0;

    if (!existingDevice) {
      // New device trying to activate
      if (currentActiveCount >= maxQuota) {
        return NextResponse.json(
          {
            error: `Batas kuota perangkat tercapai (${currentActiveCount}/${maxQuota}). Silakan non-aktifkan salah satu laptop lama di Vendor Dashboard atau upgrade paket lisensi Anda.`,
            code: 'DEVICE_QUOTA_EXCEEDED',
            currentActiveCount,
            maxQuota,
          },
          { status: 403, headers: corsHeaders }
        );
      }

      // Register new device in Supabase
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
    } else {
      // Update last seen for existing device
      await client
        .from('devices')
        .update({
          last_seen_at: new Date().toISOString(),
          device_name: deviceName,
        })
        .eq('id', existingDevice.id);
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

    const licenseSignature = crypto
      .createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY || 'minglebooth_secret_hwid_key')
      .update(JSON.stringify(tokenPayload))
      .digest('hex');

    const licenseToken = Buffer.from(
      JSON.stringify({ payload: tokenPayload, sig: licenseSignature })
    ).toString('base64');

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
          activeDevicesCount: existingDevice ? currentActiveCount : currentActiveCount + 1,
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
