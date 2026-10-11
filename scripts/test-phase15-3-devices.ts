/**
 * PHASE 15.3 — Comprehensive Device Management & Security Test Suite
 *
 * Direct integration and authorization tests covering:
 * 1. Device list for authorized vendor (safe fields, no hardware_fingerprint leakage)
 * 2. Empty device list handling
 * 3. Unauthorized request rejection (401 AUTH_REQUIRED)
 * 4. Malformed/tampered token rejection (401 LICENSE_INVALID)
 * 5. Multi-tenant isolation (Vendor A cannot view Vendor B devices)
 * 6. Cross-tenant deactivation protection (Vendor A cannot deactivate Vendor B device)
 * 7. Role-based authorization guard (VENDOR_STAFF blocked with 403 ORG_ACCESS_DENIED)
 * 8. Valid deactivation by owner (history preserved in DB, slot freed)
 * 9. Repeated deactivation idempotency
 * 10. Server-derived device quota calculation and full-quota detection
 * 11. Device activation after releasing slot & unique constraint safe reactivation
 * 12. UI error resilience & refresh/retry handling
 * 13. Zero credential / hardware fingerprint leakage audit
 */

import { NextRequest } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Production imports using tsconfig aliases
import { getServiceSupabase } from '@/lib/supabase';
import { createSignedToken } from '@/lib/auth-server';
import { GET as getVendorDevices } from '../apps/web/src/app/api/vendor/devices/route';
import { POST as deactivateDevice } from '../apps/web/src/app/api/auth/deactivate-device/route';
import { POST as vendorLogin } from '../apps/web/src/app/api/auth/vendor-login/route';

// Colors for reporting
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ${GREEN}✓ PASS${RESET}: ${message}`);
  } else {
    console.error(`  ${RED}✗ FAIL${RESET}: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
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

async function runDeviceManagerTestSuite() {
  console.log(`\n${CYAN}================================================================${RESET}`);
  console.log(`${CYAN}   PHASE 15.3 — VENDOR DEVICE MANAGER TEST SUITE${RESET}`);
  console.log(`${CYAN}================================================================${RESET}\n`);

  const client = getServiceSupabase();
  let testUserId: string | null = null;

  // Unique isolated fixtures for this test run
  const testRunId = crypto.randomBytes(4).toString('hex');
  const ORG_A_ID = crypto.randomUUID();
  const ORG_B_ID = crypto.randomUUID();
  const ORG_EMPTY_ID = crypto.randomUUID();

  const DEV_A1_ID = crypto.randomUUID();
  const DEV_A2_ID = crypto.randomUUID();
  const DEV_B1_ID = crypto.randomUUID();

  const HWID_A1 = `TEST-HWID-A1-${testRunId}`;
  const HWID_A2 = `TEST-HWID-A2-${testRunId}`;
  const HWID_A3 = `TEST-HWID-A3-${testRunId}`;
  const HWID_B1 = `TEST-HWID-B1-${testRunId}`;

  const futureExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  // Step 0: Setup isolated test fixtures
  console.log(`[Setup] Creating isolated test organizations and devices...`);
  try {
    // Insert Test Organization A (Quota: 2 devices)
    const { error: errOrgA } = await client.from('organizations').insert({
      id: ORG_A_ID,
      name: `Test Vendor A ${testRunId}`,
      slug: `test-vendor-a-${testRunId}`,
      plan_tier: 'starter',
      subscription_status: 'active',
      subscription_expires_at: futureExpiry,
      max_devices_quota: 2,
    });
    if (errOrgA) throw new Error(`Setup Org A failed: ${errOrgA.message}`);

    // Insert Test Organization B (Quota: 5 devices)
    const { error: errOrgB } = await client.from('organizations').insert({
      id: ORG_B_ID,
      name: `Test Vendor B ${testRunId}`,
      slug: `test-vendor-b-${testRunId}`,
      plan_tier: 'pro',
      subscription_status: 'active',
      subscription_expires_at: futureExpiry,
      max_devices_quota: 5,
    });
    if (errOrgB) throw new Error(`Setup Org B failed: ${errOrgB.message}`);

    // Insert Empty Test Organization (Quota: 1 device, 0 devices attached)
    const { error: errOrgEmpty } = await client.from('organizations').insert({
      id: ORG_EMPTY_ID,
      name: `Test Vendor Empty ${testRunId}`,
      slug: `test-vendor-empty-${testRunId}`,
      plan_tier: 'starter',
      subscription_status: 'active',
      subscription_expires_at: futureExpiry,
      max_devices_quota: 1,
    });
    if (errOrgEmpty) throw new Error(`Setup Empty Org failed: ${errOrgEmpty.message}`);

    // Insert Device A1 (active)
    const { error: errDevA1 } = await client.from('devices').insert({
      id: DEV_A1_ID,
      organization_id: ORG_A_ID,
      hardware_fingerprint: HWID_A1,
      device_name: 'Photobooth Mac A1',
      os_type: 'mac',
      app_version: '1.0.0',
      is_active: true,
      activated_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    });
    if (errDevA1) throw new Error(`Setup Dev A1 failed: ${errDevA1.message}`);

    // Insert Device A2 (active)
    const { error: errDevA2 } = await client.from('devices').insert({
      id: DEV_A2_ID,
      organization_id: ORG_A_ID,
      hardware_fingerprint: HWID_A2,
      device_name: 'Photobooth Win A2',
      os_type: 'windows',
      app_version: '1.0.0',
      is_active: true,
      activated_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    });
    if (errDevA2) throw new Error(`Setup Dev A2 failed: ${errDevA2.message}`);

    // Insert Device B1 (active)
    const { error: errDevB1 } = await client.from('devices').insert({
      id: DEV_B1_ID,
      organization_id: ORG_B_ID,
      hardware_fingerprint: HWID_B1,
      device_name: 'Photobooth Mac B1',
      os_type: 'mac',
      app_version: '1.0.0',
      is_active: true,
      activated_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    });
    if (errDevB1) throw new Error(`Setup Dev B1 failed: ${errDevB1.message}`);

    // Create authentic user profile for Vendor A
    const { data: authUser, error: authErr } = await client.auth.admin.createUser({
      email: `owner_a_${testRunId}@test.com`,
      password: 'TestPassword123!',
      email_confirm: true,
    });
    if (authErr || !authUser?.user) throw new Error(`Setup Auth User failed: ${authErr?.message}`);
    testUserId = authUser.user.id;

    const { error: profileErr } = await client.from('user_profiles').insert({
      id: testUserId,
      email: `owner_a_${testRunId}@test.com`,
      role: 'VENDOR_OWNER',
      organization_id: ORG_A_ID,
      full_name: 'Test Owner A',
    });
    if (profileErr) throw new Error(`Setup Profile failed: ${profileErr.message}`);

    console.log(`  ${GREEN}✓ Setup completed successfully.${RESET}\n`);

    // Prepare authentic signed bearer tokens
    const tokenAOwner = createSignedToken({
      orgId: ORG_A_ID,
      orgName: `Test Vendor A ${testRunId}`,
      planTier: 'starter',
      email: `owner_a_${testRunId}@test.com`,
      role: 'VENDOR_OWNER',
      expiresAt: futureExpiry,
      issuedAt: new Date().toISOString(),
    });

    const tokenAStaff = createSignedToken({
      orgId: ORG_A_ID,
      orgName: `Test Vendor A ${testRunId}`,
      planTier: 'starter',
      email: `staff_a_${testRunId}@test.com`,
      role: 'VENDOR_STAFF',
      expiresAt: futureExpiry,
      issuedAt: new Date().toISOString(),
    });

    const tokenBOwner = createSignedToken({
      orgId: ORG_B_ID,
      orgName: `Test Vendor B ${testRunId}`,
      planTier: 'pro',
      email: `owner_b_${testRunId}@test.com`,
      role: 'VENDOR_OWNER',
      expiresAt: futureExpiry,
      issuedAt: new Date().toISOString(),
    });

    const tokenEmptyOwner = createSignedToken({
      orgId: ORG_EMPTY_ID,
      orgName: `Test Vendor Empty ${testRunId}`,
      planTier: 'starter',
      email: `empty_${testRunId}@test.com`,
      role: 'VENDOR_OWNER',
      expiresAt: futureExpiry,
      issuedAt: new Date().toISOString(),
    });

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 1: DEVICE LIST FOR AUTHORIZED VENDOR & SENSITIVE DATA LEAKAGE AUDIT
    // ───────────────────────────────────────────────────────────────────────────
    console.log(`[Test 1] Device List for Authorized Vendor (Safe Fields & Data Sanitization)`);
    const req1 = createRequest('http://localhost:3000/api/vendor/devices', 'GET', {
      authorization: `Bearer ${tokenAOwner}`,
    });
    const res1 = await getVendorDevices(req1);
    assert(res1.status === 200, 'GET /api/vendor/devices returns HTTP 200 for authorized vendor');
    const data1 = await res1.json();

    assert(Array.isArray(data1.devices), 'Response contains devices array');
    assert(data1.devices.length === 2, 'Returns exactly 2 devices for Org A');

    // Field safety check
    for (const dev of data1.devices) {
      assert(dev.id !== undefined, 'Device has id');
      assert(dev.deviceName !== undefined, 'Device has deviceName');
      assert(dev.osType !== undefined, 'Device has osType');
      assert(dev.appVersion !== undefined, 'Device has appVersion');
      assert(dev.isActive !== undefined, 'Device has isActive');
      assert(dev.activatedAt !== undefined, 'Device has activatedAt');
      assert(dev.lastSeenAt !== undefined, 'Device has lastSeenAt');

      // CRITICAL SECURITY ASSERTION: Hardware fingerprint must NOT be exposed
      assert(dev.hardware_fingerprint === undefined, 'Hardware fingerprint is NOT exposed in API response');
      assert(dev.hardwareFingerprint === undefined, 'Raw hardware fingerprint key is completely omitted');
    }

    // Quota structure check
    assert(data1.quota !== undefined, 'Response includes authoritative quota info');
    assert(data1.quota.activeCount === 2, 'Authoritative activeCount is 2');
    assert(data1.quota.maxQuota === 2, 'Authoritative maxQuota is 2');
    assert(data1.quota.isFull === true, 'Quota full flag is correctly true (2/2 devices)');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 2: EMPTY DEVICE LIST HANDLING
    // ───────────────────────────────────────────────────────────────────────────
    console.log(`\n[Test 2] Empty Device List Handling`);
    const req2 = createRequest('http://localhost:3000/api/vendor/devices', 'GET', {
      authorization: `Bearer ${tokenEmptyOwner}`,
    });
    const res2 = await getVendorDevices(req2);
    assert(res2.status === 200, 'Empty org returns HTTP 200');
    const data2 = await res2.json();
    assert(Array.isArray(data2.devices) && data2.devices.length === 0, 'devices array is empty []');
    assert(data2.quota.activeCount === 0, 'activeCount is 0 for organization without devices');
    assert(data2.quota.isFull === false, 'isFull flag is false for empty organization');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 3: UNAUTHORIZED REQUEST REJECTION
    // ───────────────────────────────────────────────────────────────────────────
    console.log(`\n[Test 3] Unauthorized Request Rejection`);
    const req3 = createRequest('http://localhost:3000/api/vendor/devices', 'GET', {});
    const res3 = await getVendorDevices(req3);
    assert(res3.status === 401, 'Missing token returns HTTP 401');
    const data3 = await res3.json();
    assert(data3.code === 'AUTH_REQUIRED', 'Returns AUTH_REQUIRED error code');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 4: MALFORMED & TAMPERED TOKEN REJECTION
    // ───────────────────────────────────────────────────────────────────────────
    console.log(`\n[Test 4] Malformed & Tampered Token Rejection`);
    const req4Malformed = createRequest('http://localhost:3000/api/vendor/devices', 'GET', {
      authorization: 'Bearer non_base64_garbage',
    });
    const res4Malformed = await getVendorDevices(req4Malformed);
    assert(res4Malformed.status === 401, 'Malformed token returns HTTP 401');

    // Tampered payload
    const parsedTokenA = JSON.parse(Buffer.from(tokenAOwner, 'base64').toString('utf8'));
    const tamperedPayload = { ...parsedTokenA.payload, orgId: ORG_B_ID };
    const tamperedToken = Buffer.from(JSON.stringify({ payload: tamperedPayload, sig: parsedTokenA.sig })).toString('base64');
    const req4Tampered = createRequest('http://localhost:3000/api/vendor/devices', 'GET', {
      authorization: `Bearer ${tamperedToken}`,
    });
    const res4Tampered = await getVendorDevices(req4Tampered);
    assert(res4Tampered.status === 401, 'Tampered token signature returns HTTP 401 LICENSE_INVALID');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 5: MULTI-TENANT ISOLATION (VENDOR A CANNOT VIEW VENDOR B DEVICES)
    // ───────────────────────────────────────────────────────────────────────────
    console.log(`\n[Test 5] Multi-Tenant Isolation (Tenant Query Boundaries)`);
    // Vendor A query
    const res5A = await getVendorDevices(
      createRequest('http://localhost:3000/api/vendor/devices', 'GET', {
        authorization: `Bearer ${tokenAOwner}`,
      })
    );
    const data5A = await res5A.json();
    const vendorADeviceIds = data5A.devices.map((d: any) => d.id);
    assert(!vendorADeviceIds.includes(DEV_B1_ID), 'Vendor A device list does NOT contain Vendor B device');

    // Vendor B query
    const res5B = await getVendorDevices(
      createRequest('http://localhost:3000/api/vendor/devices', 'GET', {
        authorization: `Bearer ${tokenBOwner}`,
      })
    );
    const data5B = await res5B.json();
    const vendorBDeviceIds = data5B.devices.map((d: any) => d.id);
    assert(!vendorBDeviceIds.includes(DEV_A1_ID), 'Vendor B device list does NOT contain Vendor A device 1');
    assert(!vendorBDeviceIds.includes(DEV_A2_ID), 'Vendor B device list does NOT contain Vendor A device 2');
    assert(vendorBDeviceIds.includes(DEV_B1_ID), 'Vendor B device list correctly contains Vendor B device');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 6: CROSS-TENANT DEACTIVATION PROTECTION (VENDOR A CANNOT DEACTIVATE B)
    // ───────────────────────────────────────────────────────────────────────────
    console.log(`\n[Test 6] Cross-Tenant Deactivation Rejection`);
    const req6 = createRequest('http://localhost:3000/api/auth/deactivate-device', 'POST', {
      authorization: `Bearer ${tokenAOwner}`,
      'content-type': 'application/json',
    }, { deviceId: DEV_B1_ID });
    const res6 = await deactivateDevice(req6);
    assert(res6.status === 403, 'Cross-tenant deactivation rejected with HTTP 403');
    const data6 = await res6.json();
    assert(data6.code === 'ORG_ACCESS_DENIED', 'Returns ORG_ACCESS_DENIED');

    // Verify DB integrity: B1 must remain active
    const { data: checkB1 } = await client.from('devices').select('is_active').eq('id', DEV_B1_ID).single();
    assert(checkB1?.is_active === true, 'Device B1 remains active in database after unauthorized attack');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 7: ROLE-BASED AUTHORIZATION GUARD (VENDOR_STAFF CANNOT DEACTIVATE)
    // ───────────────────────────────────────────────────────────────────────────
    console.log(`\n[Test 7] Role-Based Authorization Guard (Staff Deactivation Rejection)`);
    const req7 = createRequest('http://localhost:3000/api/auth/deactivate-device', 'POST', {
      authorization: `Bearer ${tokenAStaff}`,
      'content-type': 'application/json',
    }, { deviceId: DEV_A1_ID });
    const res7 = await deactivateDevice(req7);
    assert(res7.status === 403, 'VENDOR_STAFF deactivation rejected with HTTP 403');
    const data7 = await res7.json();
    assert(data7.code === 'ORG_ACCESS_DENIED', 'Returns ORG_ACCESS_DENIED error code');

    // Verify DB integrity: A1 must remain active
    const { data: checkA1Staff } = await client.from('devices').select('is_active').eq('id', DEV_A1_ID).single();
    assert(checkA1Staff?.is_active === true, 'Device A1 remains active after staff attempt');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 8: VALID DEACTIVATION BY AUTHORIZED OWNER (HISTORY PRESERVED)
    // ───────────────────────────────────────────────────────────────────────────
    console.log(`\n[Test 8] Valid Deactivation by Authorized Owner (History Preservation)`);
    const req8 = createRequest('http://localhost:3000/api/auth/deactivate-device', 'POST', {
      authorization: `Bearer ${tokenAOwner}`,
      'content-type': 'application/json',
    }, { deviceId: DEV_A1_ID });
    const res8 = await deactivateDevice(req8);
    assert(res8.status === 200, 'Authorized deactivation returns HTTP 200');
    const data8 = await res8.json();
    assert(data8.success === true, 'Response indicates success: true');

    // Verify DB state: Row MUST NOT be deleted (history preserved)
    const { data: devAfterDeact, error: devErr } = await client
      .from('devices')
      .select('id, is_active, device_name')
      .eq('id', DEV_A1_ID)
      .single();
    assert(!devErr && devAfterDeact !== null, 'Device record still exists in database (NOT deleted)');
    assert(devAfterDeact.is_active === false, 'Device is_active is now false');

    // Verify quota reflection via GET endpoint
    const res8List = await getVendorDevices(
      createRequest('http://localhost:3000/api/vendor/devices', 'GET', {
        authorization: `Bearer ${tokenAOwner}`,
      })
    );
    const data8List = await res8List.json();
    assert(data8List.quota.activeCount === 1, 'Active device count decreased to 1');
    assert(data8List.quota.isFull === false, 'Quota is no longer full (1 / 2 devices)');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 9: REPEATED DEACTIVATION IDEMPOTENCY
    // ───────────────────────────────────────────────────────────────────────────
    console.log(`\n[Test 9] Repeated Deactivation Idempotency`);
    const req9 = createRequest('http://localhost:3000/api/auth/deactivate-device', 'POST', {
      authorization: `Bearer ${tokenAOwner}`,
      'content-type': 'application/json',
    }, { deviceId: DEV_A1_ID });
    const res9 = await deactivateDevice(req9);
    assert(res9.status === 200, 'Repeated deactivation returns HTTP 200 (Idempotent)');
    const data9 = await res9.json();
    assert(data9.success === true, 'Repeated deactivation returns success');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 10: DEVICE QUOTA ENFORCEMENT ON ACTIVATION (VENDOR LOGIN)
    // ───────────────────────────────────────────────────────────────────────────
    console.log(`\n[Test 10] Quota Enforcement on Device Activation (vendor-login)`);
    // Currently Org A has 1 active device (A2) and quota 2.
    // Let's activate a new device A3 so activeCount becomes 2 (quota full).
    const req10A3 = createRequest('http://localhost:3000/api/auth/vendor-login', 'POST', {
      'content-type': 'application/json',
    }, {
      email: `owner_a_${testRunId}@test.com`,
      hardwareFingerprint: HWID_A3,
      deviceName: 'Photobooth Win A3',
      osType: 'windows',
      appVersion: '1.0.0',
    });
    const res10A3 = await vendorLogin(req10A3);
    assert(res10A3.status === 200, 'Login and activation of 2nd device succeeds (1 -> 2 / 2)');

    // Now active count is 2 / 2 (Full). Try activating a 4th device (A4)
    const req10A4 = createRequest('http://localhost:3000/api/auth/vendor-login', 'POST', {
      'content-type': 'application/json',
    }, {
      email: `owner_a_${testRunId}@test.com`,
      hardwareFingerprint: `TEST-HWID-A4-${testRunId}`,
      deviceName: 'Rogue 3rd Device',
      osType: 'mac',
      appVersion: '1.0.0',
    });
    const res10A4 = await vendorLogin(req10A4);
    assert(res10A4.status === 403, 'Attempting to activate beyond quota returns HTTP 403');
    const data10A4 = await res10A4.json();
    assert(data10A4.code === 'DEVICE_QUOTA_EXCEEDED', 'Returns code DEVICE_QUOTA_EXCEEDED');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 11: ACTIVATION AFTER RELEASING SLOT & UNIQUE CONSTRAINT REACTIVATION
    // ───────────────────────────────────────────────────────────────────────────
    console.log(`\n[Test 11] Slot Release & Unique Constraint Safe Reactivation`);
    // Deactivate device A2 to free up a slot (2/2 -> 1/2)
    const req11DeactA2 = createRequest('http://localhost:3000/api/auth/deactivate-device', 'POST', {
      authorization: `Bearer ${tokenAOwner}`,
      'content-type': 'application/json',
    }, { deviceId: DEV_A2_ID });
    const res11DeactA2 = await deactivateDevice(req11DeactA2);
    assert(res11DeactA2.status === 200, 'Deactivating device A2 succeeds, freeing 1 slot');

    // Now reactivate device A1 (which was previously deactivated in Test 8)
    // Legacy implementation had a bug where this threw a duplicate key exception on UNIQUE(organization_id, hardware_fingerprint)
    const req11Reactivate = createRequest('http://localhost:3000/api/auth/vendor-login', 'POST', {
      'content-type': 'application/json',
    }, {
      email: `owner_a_${testRunId}@test.com`,
      hardwareFingerprint: HWID_A1,
      deviceName: 'Photobooth Mac A1 Reactivated',
      osType: 'mac',
      appVersion: '1.0.1',
    });
    const res11Reactivate = await vendorLogin(req11Reactivate);
    assert(res11Reactivate.status === 200, 'Reactivating previously deactivated device succeeds without DB unique constraint collision');
    const data11Reactivate = await res11Reactivate.json();
    assert(typeof data11Reactivate.licenseToken === 'string', 'Returns signed license token upon reactivation');

    // Verify in DB that A1 is active again and has updated metadata
    const { data: devA1AfterReactivate } = await client
      .from('devices')
      .select('is_active, app_version, device_name')
      .eq('id', DEV_A1_ID)
      .single();
    assert(devA1AfterReactivate?.is_active === true, 'Device A1 in DB has is_active: true');
    assert(devA1AfterReactivate?.app_version === '1.0.1', 'Device app_version updated');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 12: DASHBOARD CODE SECURITY & HARDWARE FINGERPRINT LEAK AUDIT
    // ───────────────────────────────────────────────────────────────────────────
    console.log(`\n[Test 12] Dashboard Source Code & Leakage Audit`);
    const dashboardSrc = fs.readFileSync(path.resolve(__dirname, '../apps/web/src/app/dashboard/page.tsx'), 'utf8');

    // Ensure raw hardware_fingerprint is not rendered in dashboard
    assert(!dashboardSrc.includes('d.hardware_fingerprint'), 'No references to d.hardware_fingerprint in dashboard JSX');
    assert(!dashboardSrc.includes('ID Laptop:'), 'Legacy hardware fingerprint display string removed from dashboard');

    // Ensure confirmation modal exists
    assert(dashboardSrc.includes('handleOpenDeactivateModal'), 'Dashboard defines handleOpenDeactivateModal');
    assert(dashboardSrc.includes('handleConfirmDeactivate'), 'Dashboard defines handleConfirmDeactivate');
    assert(dashboardSrc.includes('Konfirmasi Nonaktifkan Perangkat'), 'Dashboard renders explicit deactivation confirmation modal');

    // Ensure error retry & refresh UI exists
    assert(dashboardSrc.includes('deviceError'), 'Dashboard maintains deviceError state');
    assert(dashboardSrc.includes('Coba Lagi'), 'Dashboard provides retry button for API failures');
    assert(dashboardSrc.includes('Segarkan'), 'Dashboard provides manual refresh button');

    // Ensure server-derived quota display exists
    assert(dashboardSrc.includes('deviceQuota.activeCount'), 'Dashboard displays server-derived activeCount');
    assert(dashboardSrc.includes('deviceQuota.maxQuota'), 'Dashboard displays server-derived maxQuota');
    assert(dashboardSrc.includes('Kuota Perangkat Penuh'), 'Dashboard renders quota full warning');

    console.log(`\n${GREEN}================================================================${RESET}`);
    console.log(`${GREEN}   PHASE 15.3 TEST SUITE: ALL ${passedTests}/${totalTests} TESTS PASSED!${RESET}`);
    console.log(`${GREEN}================================================================${RESET}\n`);

  } finally {
    // Teardown: Clean up isolated test fixtures
    console.log(`[Teardown] Cleaning up isolated test fixtures...`);
    try {
      if (testUserId) {
        await client.from('user_profiles').delete().eq('id', testUserId);
        await client.auth.admin.deleteUser(testUserId);
      }
      await client.from('devices').delete().in('organization_id', [ORG_A_ID, ORG_B_ID, ORG_EMPTY_ID]);
      await client.from('organizations').delete().in('id', [ORG_A_ID, ORG_B_ID, ORG_EMPTY_ID]);
      console.log(`  ${GREEN}✓ Teardown complete. Zero test residues left in database.${RESET}\n`);
    } catch (cleanupErr: any) {
      console.error(`  ${YELLOW}! Warning during cleanup: ${cleanupErr?.message}${RESET}`);
    }
  }
}

runDeviceManagerTestSuite().catch((err) => {
  console.error('\nDevice Manager Test Suite Exception:', err);
  process.exit(1);
});
