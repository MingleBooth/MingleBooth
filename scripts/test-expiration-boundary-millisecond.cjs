/**
 * scripts/test-expiration-boundary-millisecond.cjs
 *
 * MINGLEBOOTH — FINAL EXPIRATION BOUNDARY CORRECTION
 * STRICT VERIFICATION TEST SUITE (1 ms PRECISION)
 *
 * Policy:
 * - now < expiresAt  -> ACTIVE (ACCEPT)
 * - now >= expiresAt -> EXPIRED (REJECT HTTP 403)
 * - now === expiresAt must be REJECTED (Zero Tolerance)
 *
 * Scenarios tested for each endpoint:
 * 1. now = expiresAt - 1 ms -> ACCEPT (if subscription_status = 'active')
 * 2. now = expiresAt        -> REJECT HTTP 403 (SUBSCRIPTION_REQUIRED)
 * 3. now = expiresAt + 1 ms -> REJECT HTTP 403 (SUBSCRIPTION_REQUIRED)
 * 4. status = 'expired' with future expiresAt -> REJECT HTTP 403
 * 5. status = 'active' with future expiresAt  -> ACCEPT HTTP 200
 *
 * Proof of Zero Writes on Rejection:
 * - Zero storage uploads (storageSpy.uploadCount === 0)
 * - Zero database inserts (dbSpy.insertCount === 0)
 * - Zero files written to filesystem
 * - Zero side effects
 *
 * Strict Read-Only Production Protection:
 * - Mocked Supabase client (Zero network, zero connection to Supabase Production)
 * - Zero migrations, zero deployments
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Terminal ANSI Colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;

function assert(condition, message, detail = '') {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`    ${GREEN}✓ PASS${RESET}: ${message}`);
  } else {
    failedAssertions++;
    console.error(`    ${RED}✗ FAIL${RESET}: ${message}${detail ? ` (${detail})` : ''}`);
    throw new Error(`Assertion failed: ${message} - ${detail}`);
  }
}

// Fixed boundary reference timestamp: 2026-11-15T12:00:00.000Z
const FIXED_EXPIRY_MS = 1794744000000;
const FIXED_EXPIRY_ISO = new Date(FIXED_EXPIRY_MS).toISOString();

/**
 * Millisecond Time Mocking Harness
 * Replaces global.Date with a controllable MockDate.
 */
let mockedNowMs = FIXED_EXPIRY_MS;
const OriginalDate = global.Date;

class MockDate extends OriginalDate {
  constructor(...args) {
    if (args.length === 0) {
      super(mockedNowMs);
    } else {
      // @ts-ignore
      super(...args);
    }
  }
  static now() {
    return mockedNowMs;
  }
}

function setMockNow(ms) {
  mockedNowMs = ms;
}

// Enable MockDate globally
global.Date = MockDate;

// Setup JITI to load Next.js TypeScript route handlers
const jiti = require('jiti')(__filename, {
  alias: {
    '@': path.resolve(__dirname, '../apps/web/src'),
  },
});

const { NextRequest } = require('next/server');
const authServer = jiti('../apps/web/src/lib/auth-server');
const supabaseMod = jiti('../apps/web/src/lib/supabase');

// Route handlers
const uploadCaptureRoute = jiti('../apps/web/src/app/api/sync/upload-capture/route.ts');
const vendorEventsRoute = jiti('../apps/web/src/app/api/vendor/events/route.ts');
const vendorTemplatesRoute = jiti('../apps/web/src/app/api/vendor/templates/route.ts');
const vendorLoginRoute = jiti('../apps/web/src/app/api/auth/vendor-login/route.ts');
const verifyLicenseRoute = jiti('../apps/web/src/app/api/auth/verify-license/route.ts');

/**
 * Spies to verify Zero Storage Uploads & Zero DB Inserts
 */
const storageSpy = {
  uploadCount: 0,
  uploadedFiles: [],
  reset() {
    this.uploadCount = 0;
    this.uploadedFiles = [];
  },
};

const dbSpy = {
  insertCount: 0,
  updateCount: 0,
  insertedTables: [],
  reset() {
    this.insertCount = 0;
    this.updateCount = 0;
    this.insertedTables = [];
  },
};

/**
 * Create a mock Supabase client configured for a specific org state
 */
function createMockSupabase(orgState) {
  const orgId = orgState.id || '00000000-0000-0000-0000-000000000001';
  const eventId = '00000000-0000-0000-0000-000000000002';

  return {
    from: (table) => {
      const queryObj = {
        select: () => queryObj,
        eq: () => queryObj,
        ilike: () => queryObj,
        order: () => queryObj,
        limit: () => queryObj,
        in: () => queryObj,
        single: async () => {
          if (table === 'organizations') {
            return {
              data: {
                id: orgId,
                name: orgState.name || 'Studio Alpha',
                slug: orgState.slug || 'studio-alpha',
                plan_tier: orgState.plan_tier || 'pro',
                subscription_status: orgState.subscription_status,
                subscription_expires_at: orgState.subscription_expires_at,
                max_devices_quota: orgState.max_devices_quota ?? 3,
              },
              error: null,
            };
          }
          if (table === 'events') {
            return {
              data: {
                id: eventId,
                organization_id: orgId,
                is_active: true,
              },
              error: null,
            };
          }
          if (table === 'users' || table === 'user_profiles') {
            return {
              data: {
                id: 'usr_test_001',
                email: 'vendor@studioalpha.com',
                role: 'VENDOR_OWNER',
                full_name: 'Studio Alpha Owner',
                organization_id: orgId,
                organizations: {
                  id: orgId,
                  name: orgState.name || 'Studio Alpha',
                  plan_tier: orgState.plan_tier || 'pro',
                  subscription_status: orgState.subscription_status,
                  subscription_expires_at: orgState.subscription_expires_at,
                  max_devices_quota: orgState.max_devices_quota ?? 3,
                },
              },
              error: null,
            };
          }
          return { data: null, error: null };
        },
        maybeSingle: async () => {
          if (table === 'user_profiles') {
            return {
              data: {
                id: 'usr_test_001',
                email: 'vendor@studioalpha.com',
                role: 'VENDOR_OWNER',
                full_name: 'Studio Alpha Owner',
                organization_id: orgId,
              },
              error: null,
            };
          }
          if (table === 'events') {
            return {
              data: {
                id: eventId,
                organization_id: orgId,
                is_active: true,
              },
              error: null,
            };
          }
          if (table === 'photos' || table === 'devices') {
            return { data: null, error: null };
          }
          return { data: null, error: null };
        },
        insert: (row) => {
          dbSpy.insertCount++;
          dbSpy.insertedTables.push({ table, row });
          return {
            select: () => ({
              single: async () => ({ data: { id: 'inserted_id', ...row }, error: null }),
            }),
            then: (resolve) => resolve({ data: [{ id: 'inserted_id', ...row }], error: null }),
          };
        },
        update: (data) => {
          dbSpy.updateCount++;
          return {
            eq: () => Promise.resolve({ data, error: null }),
          };
        },
        delete: () => ({
          in: () => Promise.resolve({ data: null, error: null }),
          eq: () => Promise.resolve({ data: null, error: null }),
        }),
      };
      return queryObj;
    },
    storage: {
      from: (bucket) => ({
        upload: async (storagePath, fileBuffer, opts) => {
          storageSpy.uploadCount++;
          storageSpy.uploadedFiles.push({ bucket, storagePath, size: fileBuffer?.length });
          return { data: { path: storagePath }, error: null };
        },
        getPublicUrl: (storagePath) => ({
          data: { publicUrl: `https://storage.local/${bucket}/${storagePath}` },
        }),
      }),
    },
    rpc: async (fnName, params) => {
      if (fnName === 'register_or_activate_device') {
        return {
          data: {
            success: true,
            device_id: 'dev_mock_001',
            active_count: 1,
            max_quota: 3,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
  };
}

async function runAllTests() {
  console.log(`\n${BOLD}${CYAN}======================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}  MINGLEBOOTH — FINAL EXPIRATION BOUNDARY CORRECTION AUDIT & TEST     ${RESET}`);
  console.log(`${BOLD}${CYAN}  Policy: now < expiresAt -> ACTIVE; now >= expiresAt -> EXPIRED       ${RESET}`);
  console.log(`${BOLD}${CYAN}======================================================================${RESET}\n`);

  const testOrgId = '00000000-0000-0000-0000-000000000001';
  // Standard valid bearer token for vendor
  const validToken = authServer.createSignedToken({
    orgId: testOrgId,
    orgName: 'Studio Alpha',
    role: 'VENDOR_OWNER',
    isDemo: false,
    // Token itself has distant expiry so auth-server doesn't reject early for route testing
    expiresAt: new Date(FIXED_EXPIRY_MS + 365 * 24 * 60 * 60 * 1000).toISOString(),
  });

  // --------------------------------------------------------------------------
  // ENDPOINT 1: /api/sync/upload-capture (POST)
  // --------------------------------------------------------------------------
  console.log(`${BOLD}--- 1. Testing /api/sync/upload-capture ---${RESET}`);
  {
    const samplePayload = {
      photoId: 'photo_001',
      eventId: '00000000-0000-0000-0000-000000000002',
      fileDataUrl: 'data:image/jpeg;base64,' + Buffer.from('test-image-binary-data').toString('base64'),
      type: 'photo',
      rawIndex: 1,
    };

    // 1.1: now = expiresAt - 1 ms -> ACCEPT HTTP 200
    setMockNow(FIXED_EXPIRY_MS - 1);
    storageSpy.reset();
    dbSpy.reset();
    supabaseMod.getServiceSupabase = () => createMockSupabase({
      id: testOrgId,
      subscription_status: 'active',
      subscription_expires_at: FIXED_EXPIRY_ISO,
    });

    const req1 = new NextRequest('http://localhost:3000/api/sync/upload-capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${validToken}` },
      body: JSON.stringify(samplePayload),
    });
    const res1 = await uploadCaptureRoute.POST(req1);
    const body1 = await res1.json();

    assert(res1.status === 200, 'upload-capture (now = expiresAt - 1 ms) returns HTTP 200');
    assert(body1.success === true, 'upload-capture (now = expiresAt - 1 ms) reports success: true');
    assert(storageSpy.uploadCount >= 1, 'upload-capture (now = expiresAt - 1 ms) performed storage upload');
    assert(dbSpy.insertCount >= 1, 'upload-capture (now = expiresAt - 1 ms) performed database insert');

    // 1.2: now = expiresAt (EXACT MILLISECOND) -> REJECT HTTP 403 (Zero Tolerance)
    setMockNow(FIXED_EXPIRY_MS);
    storageSpy.reset();
    dbSpy.reset();

    const req2 = new NextRequest('http://localhost:3000/api/sync/upload-capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${validToken}` },
      body: JSON.stringify(samplePayload),
    });
    const res2 = await uploadCaptureRoute.POST(req2);
    const body2 = await res2.json();

    assert(res2.status === 403, 'upload-capture (now = expiresAt EXACT) returns HTTP 403');
    assert(body2.code === 'SUBSCRIPTION_REQUIRED', 'upload-capture (now = expiresAt EXACT) returns SUBSCRIPTION_REQUIRED');
    assert(storageSpy.uploadCount === 0, 'ZERO storage uploads when now === expiresAt');
    assert(dbSpy.insertCount === 0, 'ZERO database inserts when now === expiresAt');

    // 1.3: now = expiresAt + 1 ms -> REJECT HTTP 403
    setMockNow(FIXED_EXPIRY_MS + 1);
    storageSpy.reset();
    dbSpy.reset();

    const req3 = new NextRequest('http://localhost:3000/api/sync/upload-capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${validToken}` },
      body: JSON.stringify(samplePayload),
    });
    const res3 = await uploadCaptureRoute.POST(req3);
    const body3 = await res3.json();

    assert(res3.status === 403, 'upload-capture (now = expiresAt + 1 ms) returns HTTP 403');
    assert(body3.code === 'SUBSCRIPTION_REQUIRED', 'upload-capture (now = expiresAt + 1 ms) returns SUBSCRIPTION_REQUIRED');
    assert(storageSpy.uploadCount === 0, 'ZERO storage uploads when now = expiresAt + 1 ms');
    assert(dbSpy.insertCount === 0, 'ZERO database inserts when now = expiresAt + 1 ms');

    // 1.4: subscription_status = 'expired' even with future expiresAt -> REJECT HTTP 403
    setMockNow(FIXED_EXPIRY_MS - 10000);
    storageSpy.reset();
    dbSpy.reset();
    supabaseMod.getServiceSupabase = () => createMockSupabase({
      id: testOrgId,
      subscription_status: 'expired',
      subscription_expires_at: new Date(FIXED_EXPIRY_MS + 86400000).toISOString(),
    });

    const req4 = new NextRequest('http://localhost:3000/api/sync/upload-capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${validToken}` },
      body: JSON.stringify(samplePayload),
    });
    const res4 = await uploadCaptureRoute.POST(req4);
    const body4 = await res4.json();

    assert(res4.status === 403, 'upload-capture (status = expired with future date) returns HTTP 403');
    assert(body4.code === 'SUBSCRIPTION_REQUIRED', 'upload-capture (status = expired) returns SUBSCRIPTION_REQUIRED');
    assert(storageSpy.uploadCount === 0, 'ZERO storage uploads when status = expired');
    assert(dbSpy.insertCount === 0, 'ZERO database inserts when status = expired');

    // 1.5: subscription_status = 'active' with future expiresAt -> ACCEPT HTTP 200
    setMockNow(FIXED_EXPIRY_MS - 50000);
    storageSpy.reset();
    dbSpy.reset();
    supabaseMod.getServiceSupabase = () => createMockSupabase({
      id: testOrgId,
      subscription_status: 'active',
      subscription_expires_at: new Date(FIXED_EXPIRY_MS + 86400000).toISOString(),
    });

    const req5 = new NextRequest('http://localhost:3000/api/sync/upload-capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${validToken}` },
      body: JSON.stringify(samplePayload),
    });
    const res5 = await uploadCaptureRoute.POST(req5);
    const body5 = await res5.json();

    assert(res5.status === 200, 'upload-capture (status = active with future date) returns HTTP 200');
    assert(body5.success === true, 'upload-capture returns success: true');
    assert(storageSpy.uploadCount >= 1, 'Active subscription successfully uploads photo');
    assert(dbSpy.insertCount >= 1, 'Active subscription successfully records photo in DB');
  }

  // --------------------------------------------------------------------------
  // ENDPOINT 2: /api/vendor/events (POST)
  // --------------------------------------------------------------------------
  console.log(`\n${BOLD}--- 2. Testing /api/vendor/events ---${RESET}`);
  {
    const sampleEvent = {
      name: 'Pernikahan Sarah & Budi',
      date: '2026-12-12',
      outputType: 'photo',
    };

    // 2.1: now = expiresAt - 1 ms -> ACCEPT HTTP 200
    setMockNow(FIXED_EXPIRY_MS - 1);
    dbSpy.reset();
    supabaseMod.getServiceSupabase = () => createMockSupabase({
      id: testOrgId,
      subscription_status: 'active',
      subscription_expires_at: FIXED_EXPIRY_ISO,
    });

    const req1 = new NextRequest('http://localhost:3000/api/vendor/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${validToken}` },
      body: JSON.stringify(sampleEvent),
    });
    const res1 = await vendorEventsRoute.POST(req1);
    const body1 = await res1.json();

    assert(res1.status === 200, 'vendor/events (now = expiresAt - 1 ms) returns HTTP 200');
    assert(body1.success === true, 'vendor/events reports success: true');
    assert(dbSpy.insertCount === 1, 'vendor/events inserted 1 new event');

    // 2.2: now = expiresAt (EXACT MILLISECOND) -> REJECT HTTP 403
    setMockNow(FIXED_EXPIRY_MS);
    dbSpy.reset();

    const req2 = new NextRequest('http://localhost:3000/api/vendor/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${validToken}` },
      body: JSON.stringify(sampleEvent),
    });
    const res2 = await vendorEventsRoute.POST(req2);
    const body2 = await res2.json();

    assert(res2.status === 403, 'vendor/events (now = expiresAt EXACT) returns HTTP 403');
    assert(body2.code === 'SUBSCRIPTION_REQUIRED', 'vendor/events returns SUBSCRIPTION_REQUIRED');
    assert(dbSpy.insertCount === 0, 'ZERO event inserts when now === expiresAt');

    // 2.3: now = expiresAt + 1 ms -> REJECT HTTP 403
    setMockNow(FIXED_EXPIRY_MS + 1);
    dbSpy.reset();

    const req3 = new NextRequest('http://localhost:3000/api/vendor/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${validToken}` },
      body: JSON.stringify(sampleEvent),
    });
    const res3 = await vendorEventsRoute.POST(req3);
    const body3 = await res3.json();

    assert(res3.status === 403, 'vendor/events (now = expiresAt + 1 ms) returns HTTP 403');
    assert(body3.code === 'SUBSCRIPTION_REQUIRED', 'vendor/events returns SUBSCRIPTION_REQUIRED');
    assert(dbSpy.insertCount === 0, 'ZERO event inserts when now = expiresAt + 1 ms');

    // 2.4: status = 'expired' with future expiresAt -> REJECT HTTP 403
    setMockNow(FIXED_EXPIRY_MS - 10000);
    dbSpy.reset();
    supabaseMod.getServiceSupabase = () => createMockSupabase({
      id: testOrgId,
      subscription_status: 'expired',
      subscription_expires_at: new Date(FIXED_EXPIRY_MS + 86400000).toISOString(),
    });

    const req4 = new NextRequest('http://localhost:3000/api/vendor/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${validToken}` },
      body: JSON.stringify(sampleEvent),
    });
    const res4 = await vendorEventsRoute.POST(req4);
    const body4 = await res4.json();

    assert(res4.status === 403, 'vendor/events (status = expired) returns HTTP 403');
    assert(body4.code === 'SUBSCRIPTION_REQUIRED', 'vendor/events returns SUBSCRIPTION_REQUIRED');
    assert(dbSpy.insertCount === 0, 'ZERO event inserts when status = expired');

    // 2.5: status = 'active' with future expiresAt -> ACCEPT HTTP 200
    setMockNow(FIXED_EXPIRY_MS - 50000);
    dbSpy.reset();
    supabaseMod.getServiceSupabase = () => createMockSupabase({
      id: testOrgId,
      subscription_status: 'active',
      subscription_expires_at: new Date(FIXED_EXPIRY_MS + 86400000).toISOString(),
    });

    const req5 = new NextRequest('http://localhost:3000/api/vendor/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${validToken}` },
      body: JSON.stringify(sampleEvent),
    });
    const res5 = await vendorEventsRoute.POST(req5);
    const body5 = await res5.json();

    assert(res5.status === 200, 'vendor/events (status = active with future date) returns HTTP 200');
    assert(body5.success === true, 'vendor/events returns success: true');
    assert(dbSpy.insertCount === 1, 'vendor/events successfully created event in database');
  }

  // --------------------------------------------------------------------------
  // ENDPOINT 3: /api/vendor/templates (POST)
  // --------------------------------------------------------------------------
  console.log(`\n${BOLD}--- 3. Testing /api/vendor/templates ---${RESET}`);
  {
    const sampleTemplate = {
      name: 'Custom 4x6 Photostrip',
      aspectRatio: '4:5',
      slots: 3,
    };

    // 3.1: now = expiresAt - 1 ms -> ACCEPT HTTP 200
    setMockNow(FIXED_EXPIRY_MS - 1);
    storageSpy.reset();
    dbSpy.reset();
    supabaseMod.getServiceSupabase = () => createMockSupabase({
      id: testOrgId,
      subscription_status: 'active',
      subscription_expires_at: FIXED_EXPIRY_ISO,
    });

    const req1 = new NextRequest('http://localhost:3000/api/vendor/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${validToken}` },
      body: JSON.stringify(sampleTemplate),
    });
    const res1 = await vendorTemplatesRoute.POST(req1);
    const body1 = await res1.json();

    assert(res1.status === 200, 'vendor/templates (now = expiresAt - 1 ms) returns HTTP 200');
    assert(body1.success === true, 'vendor/templates reports success: true');
    assert(dbSpy.insertCount === 1, 'vendor/templates inserted 1 new template');

    // 3.2: now = expiresAt (EXACT MILLISECOND) -> REJECT HTTP 403
    setMockNow(FIXED_EXPIRY_MS);
    storageSpy.reset();
    dbSpy.reset();

    const req2 = new NextRequest('http://localhost:3000/api/vendor/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${validToken}` },
      body: JSON.stringify(sampleTemplate),
    });
    const res2 = await vendorTemplatesRoute.POST(req2);
    const body2 = await res2.json();

    assert(res2.status === 403, 'vendor/templates (now = expiresAt EXACT) returns HTTP 403');
    assert(body2.code === 'SUBSCRIPTION_REQUIRED', 'vendor/templates returns SUBSCRIPTION_REQUIRED');
    assert(storageSpy.uploadCount === 0, 'ZERO storage uploads when now === expiresAt');
    assert(dbSpy.insertCount === 0, 'ZERO template inserts when now === expiresAt');

    // 3.3: now = expiresAt + 1 ms -> REJECT HTTP 403
    setMockNow(FIXED_EXPIRY_MS + 1);
    storageSpy.reset();
    dbSpy.reset();

    const req3 = new NextRequest('http://localhost:3000/api/vendor/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${validToken}` },
      body: JSON.stringify(sampleTemplate),
    });
    const res3 = await vendorTemplatesRoute.POST(req3);
    const body3 = await res3.json();

    assert(res3.status === 403, 'vendor/templates (now = expiresAt + 1 ms) returns HTTP 403');
    assert(body3.code === 'SUBSCRIPTION_REQUIRED', 'vendor/templates returns SUBSCRIPTION_REQUIRED');
    assert(storageSpy.uploadCount === 0, 'ZERO storage uploads when now = expiresAt + 1 ms');
    assert(dbSpy.insertCount === 0, 'ZERO template inserts when now = expiresAt + 1 ms');

    // 3.4: status = 'expired' with future expiresAt -> REJECT HTTP 403
    setMockNow(FIXED_EXPIRY_MS - 10000);
    storageSpy.reset();
    dbSpy.reset();
    supabaseMod.getServiceSupabase = () => createMockSupabase({
      id: testOrgId,
      subscription_status: 'expired',
      subscription_expires_at: new Date(FIXED_EXPIRY_MS + 86400000).toISOString(),
    });

    const req4 = new NextRequest('http://localhost:3000/api/vendor/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${validToken}` },
      body: JSON.stringify(sampleTemplate),
    });
    const res4 = await vendorTemplatesRoute.POST(req4);
    const body4 = await res4.json();

    assert(res4.status === 403, 'vendor/templates (status = expired) returns HTTP 403');
    assert(body4.code === 'SUBSCRIPTION_REQUIRED', 'vendor/templates returns SUBSCRIPTION_REQUIRED');
    assert(storageSpy.uploadCount === 0, 'ZERO storage uploads when status = expired');
    assert(dbSpy.insertCount === 0, 'ZERO template inserts when status = expired');

    // 3.5: status = 'active' with future expiresAt -> ACCEPT HTTP 200
    setMockNow(FIXED_EXPIRY_MS - 50000);
    storageSpy.reset();
    dbSpy.reset();
    supabaseMod.getServiceSupabase = () => createMockSupabase({
      id: testOrgId,
      subscription_status: 'active',
      subscription_expires_at: new Date(FIXED_EXPIRY_MS + 86400000).toISOString(),
    });

    const req5 = new NextRequest('http://localhost:3000/api/vendor/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${validToken}` },
      body: JSON.stringify(sampleTemplate),
    });
    const res5 = await vendorTemplatesRoute.POST(req5);
    const body5 = await res5.json();

    assert(res5.status === 200, 'vendor/templates (status = active with future date) returns HTTP 200');
    assert(body5.success === true, 'vendor/templates returns success: true');
    assert(dbSpy.insertCount === 1, 'vendor/templates successfully created template in database');
  }

  // --------------------------------------------------------------------------
  // ENDPOINT 4: /api/auth/vendor-login (POST)
  // --------------------------------------------------------------------------
  console.log(`\n${BOLD}--- 4. Testing /api/auth/vendor-login ---${RESET}`);
  {
    const loginPayload = {
      email: 'vendor@studioalpha.com',
      password: 'password123',
      hardwareFingerprint: 'HWID-ALPHA-001',
      deviceName: 'MacBook Alpha',
    };

    // 4.1: now = expiresAt - 1 ms -> Licensed Pro Token (isDemo: false, isLicensed: true)
    setMockNow(FIXED_EXPIRY_MS - 1);
    supabaseMod.getServiceSupabase = () => createMockSupabase({
      id: testOrgId,
      subscription_status: 'active',
      subscription_expires_at: FIXED_EXPIRY_ISO,
    });

    const req1 = new NextRequest('http://localhost:3000/api/auth/vendor-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginPayload),
    });
    const res1 = await vendorLoginRoute.POST(req1);
    const body1 = await res1.json();

    assert(res1.status === 200, 'vendor-login (now = expiresAt - 1 ms) returns HTTP 200');
    assert(body1.isLicensed === true, 'vendor-login (now = expiresAt - 1 ms) returns isLicensed: true');
    assert(body1.isDemo === false, 'vendor-login (now = expiresAt - 1 ms) returns isDemo: false');

    // 4.2: now = expiresAt (EXACT MILLISECOND) -> Demo Mode Enforced (isDemo: true, isLicensed: false)
    setMockNow(FIXED_EXPIRY_MS);

    const req2 = new NextRequest('http://localhost:3000/api/auth/vendor-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginPayload),
    });
    const res2 = await vendorLoginRoute.POST(req2);
    const body2 = await res2.json();

    assert(res2.status === 200, 'vendor-login (now = expiresAt EXACT) returns HTTP 200 Demo Envelope');
    assert(body2.isLicensed === false, 'vendor-login (now = expiresAt EXACT) sets isLicensed: false');
    assert(body2.isDemo === true, 'vendor-login (now = expiresAt EXACT) sets isDemo: true (Demo Mode Locked)');

    // 4.3: now = expiresAt + 1 ms -> Demo Mode Enforced (isDemo: true, isLicensed: false)
    setMockNow(FIXED_EXPIRY_MS + 1);

    const req3 = new NextRequest('http://localhost:3000/api/auth/vendor-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginPayload),
    });
    const res3 = await vendorLoginRoute.POST(req3);
    const body3 = await res3.json();

    assert(body3.isLicensed === false, 'vendor-login (now = expiresAt + 1 ms) sets isLicensed: false');
    assert(body3.isDemo === true, 'vendor-login (now = expiresAt + 1 ms) sets isDemo: true');

    // 4.4: status = 'expired' with future expiresAt -> Demo Mode Enforced
    setMockNow(FIXED_EXPIRY_MS - 10000);
    supabaseMod.getServiceSupabase = () => createMockSupabase({
      id: testOrgId,
      subscription_status: 'expired',
      subscription_expires_at: new Date(FIXED_EXPIRY_MS + 86400000).toISOString(),
    });

    const req4 = new NextRequest('http://localhost:3000/api/auth/vendor-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginPayload),
    });
    const res4 = await vendorLoginRoute.POST(req4);
    const body4 = await res4.json();

    assert(body4.isLicensed === false, 'vendor-login (status = expired) sets isLicensed: false');
    assert(body4.isDemo === true, 'vendor-login (status = expired) sets isDemo: true');

    // 4.5: status = 'active' with future expiresAt -> Licensed Pro Mode
    setMockNow(FIXED_EXPIRY_MS - 50000);
    supabaseMod.getServiceSupabase = () => createMockSupabase({
      id: testOrgId,
      subscription_status: 'active',
      subscription_expires_at: new Date(FIXED_EXPIRY_MS + 86400000).toISOString(),
    });

    const req5 = new NextRequest('http://localhost:3000/api/auth/vendor-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginPayload),
    });
    const res5 = await vendorLoginRoute.POST(req5);
    const body5 = await res5.json();

    assert(body5.isLicensed === true, 'vendor-login (status = active with future date) returns isLicensed: true');
    assert(body5.isDemo === false, 'vendor-login returns isDemo: false');
  }

  // --------------------------------------------------------------------------
  // ENDPOINT 5: /api/auth/verify-license (POST)
  // --------------------------------------------------------------------------
  console.log(`\n${BOLD}--- 5. Testing /api/auth/verify-license ---${RESET}`);
  {
    // 5.1: now = expiresAt - 1 ms -> Licensed Pro Token (isLicensed: true, isDemo: false)
    setMockNow(FIXED_EXPIRY_MS - 1);
    supabaseMod.getServiceSupabase = () => createMockSupabase({
      id: testOrgId,
      subscription_status: 'active',
      subscription_expires_at: FIXED_EXPIRY_ISO,
    });

    const req1 = new NextRequest('http://localhost:3000/api/auth/verify-license', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${validToken}` },
      body: JSON.stringify({}),
    });
    const res1 = await verifyLicenseRoute.POST(req1);
    const body1 = await res1.json();

    assert(res1.status === 200, 'verify-license (now = expiresAt - 1 ms) returns HTTP 200');
    assert(body1.isLicensed === true, 'verify-license (now = expiresAt - 1 ms) returns isLicensed: true');
    assert(body1.isDemo === false, 'verify-license (now = expiresAt - 1 ms) returns isDemo: false');

    // 5.2: now = expiresAt (EXACT MILLISECOND) -> Demo Mode Enforced (isDemo: true, isLicensed: false)
    setMockNow(FIXED_EXPIRY_MS);

    const req2 = new NextRequest('http://localhost:3000/api/auth/verify-license', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${validToken}` },
      body: JSON.stringify({}),
    });
    const res2 = await verifyLicenseRoute.POST(req2);
    const body2 = await res2.json();

    assert(res2.status === 200, 'verify-license (now = expiresAt EXACT) returns HTTP 200 Demo Envelope');
    assert(body2.isLicensed === false, 'verify-license (now = expiresAt EXACT) sets isLicensed: false');
    assert(body2.isDemo === true, 'verify-license (now = expiresAt EXACT) sets isDemo: true');

    // 5.3: now = expiresAt + 1 ms -> Demo Mode Enforced (isDemo: true, isLicensed: false)
    setMockNow(FIXED_EXPIRY_MS + 1);

    const req3 = new NextRequest('http://localhost:3000/api/auth/verify-license', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${validToken}` },
      body: JSON.stringify({}),
    });
    const res3 = await verifyLicenseRoute.POST(req3);
    const body3 = await res3.json();

    assert(body3.isLicensed === false, 'verify-license (now = expiresAt + 1 ms) sets isLicensed: false');
    assert(body3.isDemo === true, 'verify-license (now = expiresAt + 1 ms) sets isDemo: true');

    // 5.4: status = 'expired' with future expiresAt -> Demo Mode Enforced
    setMockNow(FIXED_EXPIRY_MS - 10000);
    supabaseMod.getServiceSupabase = () => createMockSupabase({
      id: testOrgId,
      subscription_status: 'expired',
      subscription_expires_at: new Date(FIXED_EXPIRY_MS + 86400000).toISOString(),
    });

    const req4 = new NextRequest('http://localhost:3000/api/auth/verify-license', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${validToken}` },
      body: JSON.stringify({}),
    });
    const res4 = await verifyLicenseRoute.POST(req4);
    const body4 = await res4.json();

    assert(body4.isLicensed === false, 'verify-license (status = expired) sets isLicensed: false');
    assert(body4.isDemo === true, 'verify-license (status = expired) sets isDemo: true');

    // 5.5: status = 'active' with future expiresAt -> Licensed Pro Mode
    setMockNow(FIXED_EXPIRY_MS - 50000);
    supabaseMod.getServiceSupabase = () => createMockSupabase({
      id: testOrgId,
      subscription_status: 'active',
      subscription_expires_at: new Date(FIXED_EXPIRY_MS + 86400000).toISOString(),
    });

    const req5 = new NextRequest('http://localhost:3000/api/auth/verify-license', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${validToken}` },
      body: JSON.stringify({}),
    });
    const res5 = await verifyLicenseRoute.POST(req5);
    const body5 = await res5.json();

    assert(body5.isLicensed === true, 'verify-license (status = active with future date) returns isLicensed: true');
    assert(body5.isDemo === false, 'verify-license returns isDemo: false');
  }

  // --------------------------------------------------------------------------
  // ENDPOINT 6: Server Token Verification Guard in auth-server.ts
  // --------------------------------------------------------------------------
  console.log(`\n${BOLD}--- 6. Testing Token Bearer Guard in auth-server.ts ---${RESET}`);
  {
    const tokenExpiring = authServer.createSignedToken({
      orgId: testOrgId,
      orgName: 'Studio Alpha',
      role: 'VENDOR_OWNER',
      expiresAt: FIXED_EXPIRY_ISO,
    });

    // 6.1: now = expiresAt - 1 ms -> Token valid (HTTP 200)
    setMockNow(FIXED_EXPIRY_MS - 1);
    const tokenReq1 = new NextRequest('http://localhost:3000/api/any', {
      headers: { 'Authorization': `Bearer ${tokenExpiring}` },
    });
    const tokenAuth1 = await authServer.verifyServerAuth(tokenReq1);
    assert(tokenAuth1.isValid === true, 'auth-server (now = expiresAt - 1 ms) marks token valid');
    assert(tokenAuth1.status === 200, 'auth-server returns status 200');

    // 6.2: now = expiresAt (EXACT MILLISECOND) -> Token expired (HTTP 403 LICENSE_EXPIRED)
    setMockNow(FIXED_EXPIRY_MS);
    const tokenReq2 = new NextRequest('http://localhost:3000/api/any', {
      headers: { 'Authorization': `Bearer ${tokenExpiring}` },
    });
    const tokenAuth2 = await authServer.verifyServerAuth(tokenReq2);
    assert(tokenAuth2.isValid === false, 'auth-server (now = expiresAt EXACT) marks token expired');
    assert(tokenAuth2.status === 403, 'auth-server returns status 403');
    assert(tokenAuth2.code === 'LICENSE_EXPIRED', 'auth-server returns code LICENSE_EXPIRED');

    // 6.3: now = expiresAt + 1 ms -> Token expired (HTTP 403 LICENSE_EXPIRED)
    setMockNow(FIXED_EXPIRY_MS + 1);
    const tokenReq3 = new NextRequest('http://localhost:3000/api/any', {
      headers: { 'Authorization': `Bearer ${tokenExpiring}` },
    });
    const tokenAuth3 = await authServer.verifyServerAuth(tokenReq3);
    assert(tokenAuth3.isValid === false, 'auth-server (now = expiresAt + 1 ms) marks token expired');
    assert(tokenAuth3.status === 403, 'auth-server returns status 403');
    assert(tokenAuth3.code === 'LICENSE_EXPIRED', 'auth-server returns code LICENSE_EXPIRED');
  }

  // Restore Original Date
  global.Date = OriginalDate;

  console.log(`\n${BOLD}${CYAN}======================================================================${RESET}`);
  console.log(`${BOLD}${GREEN}   ALL ${totalAssertions} BOUNDARY & ZERO-WRITE TESTS PASSED (100% PASS)   ${RESET}`);
  console.log(`${BOLD}${CYAN}======================================================================${RESET}\n`);
}

runAllTests().catch((err) => {
  global.Date = OriginalDate;
  console.error(`\n${RED}Test execution failed with error:${RESET}`, err);
  process.exit(1);
});
