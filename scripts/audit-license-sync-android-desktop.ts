import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../apps/web/.env.local') });

import fs from 'fs';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Domain imports
import { BASELINE_PLANS } from '../apps/web/src/lib/pricing';
import { DEFAULT_PLAN_LIMITS } from '../packages/shared/src/constants';
import { LicenseVerifier } from '../packages/license/src/license-verifier';
import { createSignedToken, verifyServerAuth } from '../apps/web/src/lib/auth-server';
import { getServiceSupabase } from '../apps/web/src/lib/supabase';

// API Handlers under test
import { POST as vendorLoginPost } from '../apps/web/src/app/api/auth/vendor-login/route';
import { POST as verifyLicensePost } from '../apps/web/src/app/api/auth/verify-license/route';
import { POST as deactivateDevicePost } from '../apps/web/src/app/api/auth/deactivate-device/route';
import { GET as getVendorDevicesGet } from '../apps/web/src/app/api/vendor/devices/route';
import { GET as getVendorEventsGet } from '../apps/web/src/app/api/vendor/events/route';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;
let total = 0;

function assert(cond: boolean, name: string, detail?: string) {
  total++;
  if (cond) {
    passed++;
    console.log(`  ${GREEN}✓ PASS${RESET}: ${name}`);
  } else {
    failed++;
    console.error(`  ${RED}✗ FAIL${RESET}: ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function createRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: any
): NextRequest {
  const reqInit: RequestInit = {
    method,
    headers: new Headers(headers),
  };
  if (body) {
    reqInit.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  return new NextRequest(url, reqInit);
}

async function runAudit() {
  console.log(`\n${CYAN}========================================================================${RESET}`);
  console.log(`${CYAN}   AUDIT SINKRONISASI LISENSI PERANGKAT MINGLEBOOTH — ANDROID ↔ DESKTOP ${RESET}`);
  console.log(`${CYAN}========================================================================${RESET}\n`);

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 1: SUMBER DATA PAKET & KUOTA PERANGKAT (STATIC & SCHEMA AUDIT)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log(`${YELLOW}--- 1. Sumber Data Paket & Kuota Perangkat Backend ---${RESET}`);

  // 1a. Pricing Catalog Baseline
  const starterPlan = BASELINE_PLANS.find((p) => p.id === 'starter');
  const proPlan = BASELINE_PLANS.find((p) => p.id === 'pro');
  const businessPlan = BASELINE_PLANS.find((p) => p.id === 'business');

  assert(starterPlan?.maxDevicesQuota === 1, 'BASELINE_PLANS Starter quota = 1 perangkat');
  assert(proPlan?.maxDevicesQuota === 3, 'BASELINE_PLANS Pro quota = 3 perangkat');
  assert(businessPlan?.maxDevicesQuota === 10, 'BASELINE_PLANS Business quota = 10 perangkat');

  // 1b. Packages/shared Constants
  assert(DEFAULT_PLAN_LIMITS.starter.maxDevices === 1, '@minglebooth/shared Starter maxDevices = 1');
  assert(DEFAULT_PLAN_LIMITS.pro.maxDevices === 3, '@minglebooth/shared Pro maxDevices = 3');
  assert(DEFAULT_PLAN_LIMITS.business.maxDevices === 10, '@minglebooth/shared Business maxDevices = 10');

  // 1c. SQL Migrations
  const rpcSql = fs.readFileSync(
    path.resolve(__dirname, '../supabase/migrations/20261009000001_billing_idempotency_rpc.sql'),
    'utf8'
  );
  assert(
    rpcSql.includes("v_max_devices := 1;") &&
    rpcSql.includes("v_max_devices := 3;") &&
    rpcSql.includes("v_max_devices := 10;"),
    'SQL RPC 20261009000001 menetapkan kuota perangkat: Starter=1, Pro=3, Business=10'
  );

  const dynamicPricingSql = fs.readFileSync(
    path.resolve(__dirname, '../supabase/migrations/20261009000002_dynamic_pricing_and_snapshots.sql'),
    'utf8'
  );
  assert(
    dynamicPricingSql.includes("('starter', 'Starter', 'starter',") &&
    dynamicPricingSql.includes("('pro', 'Pro', 'pro',") &&
    dynamicPricingSql.includes("('business', 'Business', 'business',"),
    'SQL 20261009000002 menginisialisasi subscription_plans untuk starter, pro, business'
  );

  // 1d. Web Register Quota Map
  const webRegisterSrc = fs.readFileSync(
    path.resolve(__dirname, '../apps/web/src/app/api/auth/web-register/route.ts'),
    'utf8'
  );
  assert(
    webRegisterSrc.includes('starter: 1') &&
    webRegisterSrc.includes('pro: 3') &&
    webRegisterSrc.includes('business: 10'),
    'Web Registration Route menginisialisasi quotaMap Starter=1, Pro=3, Business=10'
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 2: IMPLEMENTASI DESKTOP AUDIT
  // ─────────────────────────────────────────────────────────────────────────────
  console.log(`\n${YELLOW}--- 2. Implementasi Desktop Studio ---${RESET}`);
  const desktopGateSrc = fs.readFileSync(
    path.resolve(__dirname, '../apps/desktop/src/components/VendorAuthGate.tsx'),
    'utf8'
  );
  const desktopMainSrc = fs.readFileSync(
    path.resolve(__dirname, '../apps/desktop/electron/main.cjs'),
    'utf8'
  );

  assert(
    desktopGateSrc.includes("localStorage.getItem('mb_license_token')"),
    'Desktop membaca token dari LocalStorage (mb_license_token)'
  );
  assert(
    desktopGateSrc.includes('verifier.verifyTokenString(token, currentHwid)'),
    'Desktop memverifikasi token offline menggunakan LicenseVerifier shared package'
  );
  assert(
    desktopGateSrc.includes('api/auth/vendor-login'),
    'Desktop mengaktivasi perangkat via POST /api/auth/vendor-login'
  );
  assert(
    desktopGateSrc.includes('api/auth/verify-license'),
    'Desktop memverifikasi lisensi via POST /api/auth/verify-license'
  );
  assert(
    desktopMainSrc.includes('function generateHardwareFingerprint()') &&
    desktopMainSrc.includes('os.hostname()') &&
    desktopMainSrc.includes('crypto.createHash(\'sha256\')'),
    'Desktop Electron menghasilkan HWID stabil dari parameter mesin (hostname, platform, arch, cpu, mac)'
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 3: IMPLEMENTASI ANDROID AUDIT
  // ─────────────────────────────────────────────────────────────────────────────
  console.log(`\n${YELLOW}--- 3. Implementasi Android Mobile ---${RESET}`);
  const mobileDeviceSrc = fs.readFileSync(
    path.resolve(__dirname, '../apps/mobile/src/lib/mobileDevice.ts'),
    'utf8'
  );
  const mobileLicenseSrc = fs.readFileSync(
    path.resolve(__dirname, '../apps/mobile/src/lib/mobileLicense.ts'),
    'utf8'
  );
  const mobileGateSrc = fs.readFileSync(
    path.resolve(__dirname, '../apps/mobile/src/components/MobileAuthGate.tsx'),
    'utf8'
  );

  assert(
    mobileDeviceSrc.includes('mb_mobile_hwid') &&
    mobileDeviceSrc.includes('nanoid'),
    'Android menghasilkan HWID stabil dan persisten di LocalStorage (mb_mobile_hwid)'
  );
  assert(
    mobileLicenseSrc.includes("MB_LICENSE_TOKEN_KEY = 'mb_license_token'"),
    'Android membaca kunci token yang identik dengan Desktop (mb_license_token)'
  );
  assert(
    mobileLicenseSrc.includes('verifier.verifyTokenString(token, currentHwid)'),
    'Android memverifikasi lisensi offline menggunakan LicenseVerifier dari @minglebooth/license'
  );
  assert(
    mobileLicenseSrc.includes('api/auth/verify-license'),
    'Android melakukan background check ke endpoint /api/auth/verify-license'
  );
  assert(
    mobileGateSrc.includes('api/auth/vendor-login'),
    'Android mengaktivasi perangkat via POST /api/auth/vendor-login'
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 4: INTEGRASI DATABASE & SKENARIO PENGUJIAN AKTUAL
  // ─────────────────────────────────────────────────────────────────────────────
  console.log(`\n${YELLOW}--- 4. Skenario Pengujian Fungsional (Supabase Test Fixtures) ---${RESET}`);
  const client = getServiceSupabase();
  const testRunId = crypto.randomBytes(4).toString('hex');

  const ORG_STARTER = crypto.randomUUID();
  const ORG_PRO = crypto.randomUUID();
  const ORG_BUSINESS = crypto.randomUUID();
  const ORG_EXPIRED = crypto.randomUUID();
  const ORG_VENDOR_B = crypto.randomUUID();

  const futureExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const pastExpiry = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Track created user IDs for teardown
  const createdAuthUserIds: string[] = [];

  const setupVendorUser = async (orgId: string, email: string, name: string) => {
    const { data: authUser, error: authErr } = await client.auth.admin.createUser({
      email,
      password: 'password123',
      email_confirm: true,
    });
    if (authErr || !authUser?.user) {
      throw new Error(`Gagal membuat auth user ${email}: ${authErr?.message}`);
    }
    createdAuthUserIds.push(authUser.user.id);

    const { error: profileErr } = await client.from('user_profiles').insert({
      id: authUser.user.id,
      organization_id: orgId,
      email,
      role: 'VENDOR_OWNER',
      full_name: name,
    });
    if (profileErr) {
      throw new Error(`Gagal membuat user profile ${email}: ${profileErr.message}`);
    }
    return authUser.user.id;
  };

  try {
    // Setup Organizations
    const { error: errOrgs } = await client.from('organizations').insert([
      {
        id: ORG_STARTER,
        name: `Test Starter ${testRunId}`,
        slug: `test-starter-${testRunId}`,
        plan_tier: 'starter',
        subscription_status: 'active',
        subscription_expires_at: futureExpiry,
        max_devices_quota: 1,
      },
      {
        id: ORG_PRO,
        name: `Test Pro ${testRunId}`,
        slug: `test-pro-${testRunId}`,
        plan_tier: 'pro',
        subscription_status: 'active',
        subscription_expires_at: futureExpiry,
        max_devices_quota: 3,
      },
      {
        id: ORG_BUSINESS,
        name: `Test Business ${testRunId}`,
        slug: `test-business-${testRunId}`,
        plan_tier: 'business',
        subscription_status: 'active',
        subscription_expires_at: futureExpiry,
        max_devices_quota: 10,
      },
      {
        id: ORG_EXPIRED,
        name: `Test Expired ${testRunId}`,
        slug: `test-expired-${testRunId}`,
        plan_tier: 'pro',
        subscription_status: 'expired',
        subscription_expires_at: pastExpiry,
        max_devices_quota: 3,
      },
      {
        id: ORG_VENDOR_B,
        name: `Test Vendor B ${testRunId}`,
        slug: `test-vendor-b-${testRunId}`,
        plan_tier: 'starter',
        subscription_status: 'active',
        subscription_expires_at: futureExpiry,
        max_devices_quota: 1,
      },
    ]);
    if (errOrgs) throw new Error(`Setup organizations failed: ${errOrgs.message}`);

    // Setup Authentic User Profiles
    const emailStarter = `starter_${testRunId}@testvendor.id`;
    const emailPro = `pro_${testRunId}@testvendor.id`;
    const emailBusiness = `business_${testRunId}@testvendor.id`;
    const emailExpired = `expired_${testRunId}@testvendor.id`;
    const emailVendorB = `vendor_b_${testRunId}@testvendor.id`;

    await setupVendorUser(ORG_STARTER, emailStarter, 'Owner Starter');
    await setupVendorUser(ORG_PRO, emailPro, 'Owner Pro');
    await setupVendorUser(ORG_BUSINESS, emailBusiness, 'Owner Business');
    await setupVendorUser(ORG_EXPIRED, emailExpired, 'Owner Expired');
    await setupVendorUser(ORG_VENDOR_B, emailVendorB, 'Owner Vendor B');

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 4.1: STARTER QUOTA ENFORCEMENT (1 Perangkat)
    // ─────────────────────────────────────────────────────────────────────────
    console.log(`\n  * Skenario 1: Paket Starter (1 Perangkat)`);
    // Device 1: Android
    const devStarter1Req = createRequest('http://localhost:3000/api/auth/vendor-login', 'POST', {}, {
      email: emailStarter,
      password: 'password123',
      hardwareFingerprint: `mob_starter_android_${testRunId}`,
      deviceName: 'Samsung Galaxy Tab S9 (ANDROID)',
      osType: 'android',
      appVersion: '1.0.0',
    });
    const resStarter1 = await vendorLoginPost(devStarter1Req);
    const dataStarter1 = await resStarter1.json();
    assert(resStarter1.status === 200 && dataStarter1.success, 'Perangkat 1 (Android) pada Starter diterima (1/1)');

    // Device 2: Desktop Mac
    const devStarter2Req = createRequest('http://localhost:3000/api/auth/vendor-login', 'POST', {}, {
      email: emailStarter,
      password: 'password123',
      hardwareFingerprint: `mac_starter_desktop_${testRunId}`,
      deviceName: 'MacBook Pro Operator',
      osType: 'mac',
      appVersion: '1.0.0-rc.1',
    });
    const resStarter2 = await vendorLoginPost(devStarter2Req);
    const dataStarter2 = await resStarter2.json();
    assert(
      resStarter2.status === 403 && dataStarter2.code === 'DEVICE_QUOTA_EXCEEDED',
      'Perangkat 2 (Desktop) pada Starter DITOLAK saat kuota penuh (1/1)'
    );

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 4.2: PRO QUOTA ENFORCEMENT (Maksimal 3 Perangkat Campuran)
    // ─────────────────────────────────────────────────────────────────────────
    console.log(`\n  * Skenario 2: Paket Pro (Maksimal 3 Perangkat — Campuran Desktop & Android)`);
    // Pro Dev 1: MacBook
    const resPro1 = await vendorLoginPost(createRequest('http://localhost:3000/api/auth/vendor-login', 'POST', {}, {
      email: emailPro,
      password: 'password123',
      hardwareFingerprint: `mac_pro_1_${testRunId}`,
      deviceName: 'MacBook Studio 1',
      osType: 'mac',
    }));
    const dataPro1 = await resPro1.json();
    assert(resPro1.status === 200 && dataPro1.success, 'Perangkat 1 (MacBook Desktop) diterima (1/3)');

    // Pro Dev 2: Android Tablet
    const resPro2 = await vendorLoginPost(createRequest('http://localhost:3000/api/auth/vendor-login', 'POST', {}, {
      email: emailPro,
      password: 'password123',
      hardwareFingerprint: `mob_pro_android_${testRunId}`,
      deviceName: 'Xiaomi Pad 6 (ANDROID)',
      osType: 'android',
    }));
    const dataPro2 = await resPro2.json();
    assert(resPro2.status === 200 && dataPro2.success, 'Perangkat 2 (Android Tablet) diterima (2/3)');

    // Pro Dev 3: Windows Laptop
    const resPro3 = await vendorLoginPost(createRequest('http://localhost:3000/api/auth/vendor-login', 'POST', {}, {
      email: emailPro,
      password: 'password123',
      hardwareFingerprint: `win_pro_3_${testRunId}`,
      deviceName: 'Asus ROG Windows Booth',
      osType: 'windows',
    }));
    const dataPro3 = await resPro3.json();
    assert(resPro3.status === 200 && dataPro3.success, 'Perangkat 3 (Windows Laptop) diterima (3/3)');

    // Pro Dev 4: Android Phone (Harus Ditolak)
    const resPro4 = await vendorLoginPost(createRequest('http://localhost:3000/api/auth/vendor-login', 'POST', {}, {
      email: emailPro,
      password: 'password123',
      hardwareFingerprint: `mob_pro_phone_${testRunId}`,
      deviceName: 'Google Pixel 8 (ANDROID)',
      osType: 'android',
    }));
    const dataPro4 = await resPro4.json();
    assert(
      resPro4.status === 403 && dataPro4.code === 'DEVICE_QUOTA_EXCEEDED',
      'Perangkat 4 (Android Phone) DITOLAK saat kuota Pro penuh (3/3)'
    );

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 4.3: DEAKTIVASI PERANGKAT & REUSE SLOT
    // ─────────────────────────────────────────────────────────────────────────
    console.log(`\n  * Skenario 3: Deaktivasi Perangkat & Penggunaan Kembali Slot`);
    // Find device 2 (Android) in DB
    const { data: proDevs } = await client
      .from('devices')
      .select('id, hardware_fingerprint, is_active')
      .eq('organization_id', ORG_PRO)
      .eq('hardware_fingerprint', `mob_pro_android_${testRunId}`)
      .single();

    assert(Boolean(proDevs?.is_active), 'Perangkat Android terdaftar aktif di DB sebelum dinonaktifkan');

    // Deactivate device 2 via /api/auth/deactivate-device using owner token
    const proOwnerToken = createSignedToken({
      orgId: ORG_PRO,
      email: emailPro,
      role: 'VENDOR_OWNER',
    });

    const resDeact = await deactivateDevicePost(
      createRequest('http://localhost:3000/api/auth/deactivate-device', 'POST', {
        Authorization: `Bearer ${proOwnerToken}`,
      }, { deviceId: proDevs?.id })
    );
    const dataDeact = await resDeact.json();
    assert(resDeact.status === 200 && dataDeact.success, 'Deaktivasi perangkat Android via API berhasil');

    // Verify DB state: is_active should be false (history preserved)
    const { data: proDevsAfter } = await client
      .from('devices')
      .select('is_active')
      .eq('id', proDevs?.id)
      .single();
    assert(proDevsAfter?.is_active === false, 'Status perangkat di DB berubah menjadi is_active = false');

    // Now try activating Device 4 (Android Phone) again -> Must SUCCEED because slot freed!
    const resPro4Retry = await vendorLoginPost(createRequest('http://localhost:3000/api/auth/vendor-login', 'POST', {}, {
      email: emailPro,
      password: 'password123',
      hardwareFingerprint: `mob_pro_phone_${testRunId}`,
      deviceName: 'Google Pixel 8 (ANDROID)',
      osType: 'android',
    }));
    const dataPro4Retry = await resPro4Retry.json();
    assert(
      resPro4Retry.status === 200 && dataPro4Retry.success,
      'Perangkat 4 berhasil diaktivasi setelah slot dibebaskan (Reuse Slot Sukses)'
    );

    // Reactivate previous device (mob_pro_android) -> Should be rejected now because quota full again (3/3)
    const resReactivateBlocked = await vendorLoginPost(createRequest('http://localhost:3000/api/auth/vendor-login', 'POST', {}, {
      email: emailPro,
      password: 'password123',
      hardwareFingerprint: `mob_pro_android_${testRunId}`,
      deviceName: 'Xiaomi Pad 6 (ANDROID)',
      osType: 'android',
    }));
    const dataReactivateBlocked = await resReactivateBlocked.json();
    assert(
      resReactivateBlocked.status === 403 && dataReactivateBlocked.code === 'DEVICE_QUOTA_EXCEEDED',
      'Reaktivasi perangkat lama DITOLAK jika kuota sedang penuh (konsistensi kuota)'
    );

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 4.4: BUSINESS QUOTA ENFORCEMENT (10 Perangkat)
    // ─────────────────────────────────────────────────────────────────────────
    console.log(`\n  * Skenario 4: Paket Business (Maksimal 10 Perangkat)`);
    let businessActivated = 0;
    for (let i = 1; i <= 10; i++) {
      const isMob = i % 2 === 0;
      const res = await vendorLoginPost(createRequest('http://localhost:3000/api/auth/vendor-login', 'POST', {}, {
        email: emailBusiness,
        password: 'password123',
        hardwareFingerprint: `biz_dev_${i}_${testRunId}`,
        deviceName: isMob ? `Android Tablet #${i}` : `MacBook Studio #${i}`,
        osType: isMob ? 'android' : 'mac',
      }));
      if (res.status === 200) businessActivated++;
    }
    assert(businessActivated === 10, 'Tepat 10 perangkat berhasil diaktivasi pada paket Business (10/10)');

    // 11th device rejected
    const resBiz11 = await vendorLoginPost(createRequest('http://localhost:3000/api/auth/vendor-login', 'POST', {}, {
      email: emailBusiness,
      password: 'password123',
      hardwareFingerprint: `biz_dev_11_${testRunId}`,
      deviceName: 'Operator Laptop #11',
      osType: 'windows',
    }));
    const dataBiz11 = await resBiz11.json();
    assert(
      resBiz11.status === 403 && dataBiz11.code === 'DEVICE_QUOTA_EXCEEDED',
      'Perangkat ke-11 DITOLAK saat kuota Business penuh (10/10)'
    );

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 4.5: EXPIRED / UNPAID SUBSCRIPTION (Demo Mode Isolation)
    // ─────────────────────────────────────────────────────────────────────────
    console.log(`\n  * Skenario 5: Langganan Kedaluwarsa / Tidak Aktif`);
    const resExpired = await vendorLoginPost(createRequest('http://localhost:3000/api/auth/vendor-login', 'POST', {}, {
      email: emailExpired,
      password: 'password123',
      hardwareFingerprint: `dev_expired_${testRunId}`,
      deviceName: 'Operator Booth Expired',
      osType: 'mac',
    }));
    const dataExpired = await resExpired.json();
    assert(
      resExpired.status === 200 && dataExpired.isDemo === true && dataExpired.isLicensed === false,
      'Langganan expired dialihkan ke Mode Demo terautentikasi'
    );

    // Verify expired account DID NOT consume device quota in database
    const { count: expiredDevCount } = await client
      .from('devices')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', ORG_EXPIRED);
    assert(
      expiredDevCount === 0,
      'Mode Demo tidak mendaftarkan perangkat ke database dan tidak mengonsumsi kuota'
    );

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 4.6: MULTI-TENANT ISOLATION
    // ─────────────────────────────────────────────────────────────────────────
    console.log(`\n  * Skenario 6: Isolasi Multi-Tenant`);
    const starterToken = dataStarter1.licenseToken;
    const vendorBToken = createSignedToken({
      orgId: ORG_VENDOR_B,
      email: emailVendorB,
      role: 'VENDOR_OWNER',
    });

    // Vendor B queries devices -> Should see only Vendor B's devices (empty)
    const resVendorBDevices = await getVendorDevicesGet(
      createRequest('http://localhost:3000/api/vendor/devices', 'GET', {
        Authorization: `Bearer ${vendorBToken}`,
      })
    );
    const dataVendorBDevices = await resVendorBDevices.json();
    assert(
      dataVendorBDevices.devices.length === 0,
      'Vendor B tidak dapat melihat perangkat milik Vendor A (Isolasi Perangkat)'
    );

    // Vendor B tries to deactivate Vendor A's device -> 403 Forbidden
    const resCrossDeact = await deactivateDevicePost(
      createRequest('http://localhost:3000/api/auth/deactivate-device', 'POST', {
        Authorization: `Bearer ${vendorBToken}`,
      }, { deviceId: proDevs?.id })
    );
    assert(
      resCrossDeact.status === 403,
      'Vendor B DITOLAK saat mencoba menonaktifkan perangkat Vendor A (Cross-Tenant Protection)'
    );

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 4.7: OFFLINE VERIFIER & GRACE PERIOD
    // ─────────────────────────────────────────────────────────────────────────
    console.log(`\n  * Skenario 7: Verifikasi Offline & Masa Tenggang (Grace Period)`);
    const verifier = new LicenseVerifier(true);

    // Valid active token verification
    const activeCheck = verifier.verifyTokenString(starterToken, `mob_starter_android_${testRunId}`);
    assert(
      activeCheck.isValid === true && activeCheck.isExpired === false,
      'Token Starter diverifikasi valid oleh LicenseVerifier offline'
    );

    // Device mismatch verification
    const mismatchCheck = verifier.verifyTokenString(starterToken, `different_hwid_999`);
    assert(
      mismatchCheck.isValid === false && mismatchCheck.code === 'DEVICE_MISMATCH',
      'LicenseVerifier menolak token pada perangkat berbeda (DEVICE_MISMATCH)'
    );

    // Expired but within 7-day grace period token
    const graceExpiry = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days ago
    const graceToken = createSignedToken({
      orgId: ORG_STARTER,
      orgName: 'Grace Vendor',
      planTier: 'starter',
      hwid: `mob_starter_android_${testRunId}`,
      expiresAt: graceExpiry,
      offlineGracePeriodDays: 7,
    });
    const graceCheck = verifier.verifyTokenString(graceToken, `mob_starter_android_${testRunId}`);
    assert(
      graceCheck.isValid === true && graceCheck.isGracePeriod === true,
      'Masa tenggang offline (grace period) 7 hari memungkinkan bilik tetap beroperasi'
    );

    // Expired past grace period (10 days ago)
    const longExpired = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const deadToken = createSignedToken({
      orgId: ORG_STARTER,
      orgName: 'Dead Vendor',
      planTier: 'starter',
      hwid: `mob_starter_android_${testRunId}`,
      expiresAt: longExpired,
      offlineGracePeriodDays: 7,
    });
    const deadCheck = verifier.verifyTokenString(deadToken, `mob_starter_android_${testRunId}`);
    assert(
      deadCheck.isValid === false && deadCheck.code === 'LICENSE_EXPIRED',
      'Token lewat masa tenggang ditolak dengan kode LICENSE_EXPIRED'
    );

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 4.8: PENGUJIAN KONKURENSI (Race Condition Atomicity)
    // ─────────────────────────────────────────────────────────────────────────
    console.log(`\n  * Skenario 8: Pengujian Konkurensi & Atomisitas Aktivasi`);
    // Create new organization with starter quota = 1
    const ORG_CONC = crypto.randomUUID();
    const emailConc = `conc_${testRunId}@testvendor.id`;
    await client.from('organizations').insert({
      id: ORG_CONC,
      name: `Test Conc ${testRunId}`,
      slug: `test-conc-${testRunId}`,
      plan_tier: 'starter',
      subscription_status: 'active',
      subscription_expires_at: futureExpiry,
      max_devices_quota: 1,
    });
    await setupVendorUser(ORG_CONC, emailConc, 'Owner Conc');

    // Launch two simultaneous activation requests via Promise.all
    const concDev1Req = createRequest('http://localhost:3000/api/auth/vendor-login', 'POST', {}, {
      email: emailConc,
      password: 'password123',
      hardwareFingerprint: `conc_dev1_${testRunId}`,
      deviceName: 'Device 1 Concurrent',
      osType: 'mac',
    });
    const concDev2Req = createRequest('http://localhost:3000/api/auth/vendor-login', 'POST', {}, {
      email: emailConc,
      password: 'password123',
      hardwareFingerprint: `conc_dev2_${testRunId}`,
      deviceName: 'Device 2 Concurrent',
      osType: 'android',
    });

    const [concRes1, concRes2] = await Promise.all([
      vendorLoginPost(concDev1Req),
      vendorLoginPost(concDev2Req),
    ]);

    const { count: finalConcActiveCount } = await client
      .from('devices')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', ORG_CONC)
      .eq('is_active', true);

    const onePassedOneFailed =
      (concRes1.status === 200 && concRes2.status === 403) ||
      (concRes1.status === 403 && concRes2.status === 200);

    assert(
      onePassedOneFailed,
      'Dua perangkat yang mendaftar bersamaan diserialisasi: tepat satu diterima dan satu ditolak'
    );
    assert(
      finalConcActiveCount === 1,
      'Jumlah perangkat aktif di database tidak pernah melampaui kuota starter (tepat 1 perangkat aktif)'
    );

    // Cleanup concurrency org fixtures
    await client.from('devices').delete().eq('organization_id', ORG_CONC);
    await client.from('user_profiles').delete().eq('organization_id', ORG_CONC);
    await client.from('organizations').delete().eq('id', ORG_CONC);
  } finally {
    // Teardown test fixtures
    console.log(`\n${CYAN}[Teardown] Membersihkan fixture pengujian dari database...${RESET}`);
    await client.from('devices').delete().in('organization_id', [ORG_STARTER, ORG_PRO, ORG_BUSINESS, ORG_EXPIRED, ORG_VENDOR_B]);
    await client.from('user_profiles').delete().in('organization_id', [ORG_STARTER, ORG_PRO, ORG_BUSINESS, ORG_EXPIRED, ORG_VENDOR_B]);
    for (const uid of createdAuthUserIds) {
      await client.auth.admin.deleteUser(uid).catch(() => {});
    }
    await client.from('organizations').delete().in('id', [ORG_STARTER, ORG_PRO, ORG_BUSINESS, ORG_EXPIRED, ORG_VENDOR_B]);
    console.log(`  ${GREEN}✓ Pembersihan selesai tanpa residu.${RESET}`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 5: KAMERA INTEGRITY AUDIT
  // ─────────────────────────────────────────────────────────────────────────────
  console.log(`\n${YELLOW}--- 5. Konfirmasi Integritas Driver & Kamera ---${RESET}`);
  const pluginJava = fs.readFileSync(
    path.resolve(__dirname, '../apps/mobile/android/app/src/main/java/com/minglebooth/mobile/plugins/SonyDirectCameraPlugin.java'),
    'utf8'
  );
  const driverJava = fs.readFileSync(
    path.resolve(__dirname, '../apps/mobile/android/app/src/main/java/com/minglebooth/mobile/plugins/SonyPtpDriver.java'),
    'utf8'
  );

  const hashPlugin = crypto.createHash('sha256').update(pluginJava).digest('hex');
  const hashDriver = crypto.createHash('sha256').update(driverJava).digest('hex');

  assert(
    hashPlugin === 'b874cfa1b1d966e95091c8cab621ebab4db3219895285157f96d5698c4bd68cb',
    'SonyDirectCameraPlugin.java SHA-256 identik dengan baseline (TIDAK BERUBAH)'
  );
  assert(
    hashDriver === 'ba80d86b57a8d9ac1471090fdcf23be1d4a861b56d51678105085f42d5cc5b18',
    'SonyPtpDriver.java SHA-256 identik dengan baseline (TIDAK BERUBAH)'
  );

  console.log(`\n${CYAN}========================================================================${RESET}`);
  console.log(`${CYAN}   HASIL AKHIR AUDIT: ${passed}/${total} PENGUJIAN LOLOS (${failed} GAGAL)       ${RESET}`);
  console.log(`${CYAN}========================================================================${RESET}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAudit().catch((err) => {
  console.error('\nAudit Suite Error:', err);
  process.exit(1);
});
