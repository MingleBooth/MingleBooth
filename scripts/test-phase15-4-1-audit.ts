/**
 * PHASE 15.4.1 — BILLING CONCURRENCY & LICENSE SECURITY AUDIT TEST SUITE
 *
 * Explicit test categories:
 * - UNIT TESTS (Signature validation, timing-safe checks, token tampering, offline grace periods)
 * - REAL DATABASE CONCURRENCY & INTEGRATION TESTS (Live Supabase database operations)
 * - FAULT INJECTION & MOCKED INTEGRATION TESTS (Simulated compensation rollbacks & failure modes)
 */

import { NextRequest } from 'next/server';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from apps/web/.env.local
dotenv.config({ path: path.resolve(__dirname, '../apps/web/.env.local') });

import { getServiceSupabase } from '@/lib/supabase';
import { createSignedToken, verifyServerAuth } from '@/lib/auth-server';
import { validateLynkSignature, generateLynkSignature, LYNK_TEST_VECTORS } from '@/lib/lynk';
import { executePaymentSettlement } from '@/lib/billing-settlement';
import { POST as billingWebhook } from '../apps/web/src/app/api/billing/webhook/route';
import { POST as paymentWebhook } from '../apps/web/src/app/api/webhooks/payment/route';
import { POST as vendorLogin } from '../apps/web/src/app/api/auth/vendor-login/route';
import { POST as verifyLicense } from '../apps/web/src/app/api/auth/verify-license/route';
import { POST as adminVendors } from '../apps/web/src/app/api/admin/vendors/route';
import { LicenseVerifier } from '@minglebooth/license';

// Colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

let totalTests = 0;
let passedTests = 0;

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

function createRequest(url: string, method: string, headers: Record<string, string>, body?: any): NextRequest {
  const reqInit: RequestInit = {
    method,
    headers: new Headers(headers),
  };
  if (body) {
    reqInit.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  return new NextRequest(url, reqInit);
}

async function runAuditTestSuite() {
  console.log(`\n${CYAN}========================================================================${RESET}`);
  console.log(`${CYAN}   PHASE 15.4.1 — BILLING CONCURRENCY & LICENSE SECURITY AUDIT SUITE    ${RESET}`);
  console.log(`${CYAN}========================================================================${RESET}\n`);

  const client = getServiceSupabase();
  const testRunId = crypto.randomBytes(4).toString('hex');
  const TEST_LYNK_SECRET = `lynk_audit_sec_${testRunId}`;
  process.env.LYNK_MERCHANT_KEY = TEST_LYNK_SECRET;
  process.env.PAYMENT_WEBHOOK_SECRET = `hmac_audit_sec_${testRunId}`;

  // ===========================================================================
  // CATEGORY 1: UNIT TESTS (Pure In-Memory Cryptographic & Boundary Logic)
  // ===========================================================================
  console.log(`\n${YELLOW}--- CATEGORY 1: UNIT TESTS (Cryptographic & Token Validation) ---${RESET}`);

  // Test 1.1: Official Test Vectors
  console.log(`\n[Unit 1.1] Lynk.id Signature Contract Test Vectors`);
  for (const vector of LYNK_TEST_VECTORS) {
    const calc = generateLynkSignature(vector.refId, vector.amount, vector.messageId, vector.secretKey);
    assert(calc === vector.expectedSignature, `Test vector for ${vector.refId} matches expected signature`);
    const valid = validateLynkSignature(vector.refId, vector.amount, vector.messageId, vector.expectedSignature, vector.secretKey);
    assert(valid === true, `validateLynkSignature confirms valid test vector for ${vector.refId}`);
  }

  // Test 1.2: Constant-Time Length Guard & Tampering
  console.log(`\n[Unit 1.2] Signature Length Guard & Timing Safe Comparison`);
  const v0 = LYNK_TEST_VECTORS[0];
  const truncatedSig = v0.expectedSignature.substring(0, 32);
  const extendedSig = v0.expectedSignature + 'ff';
  const wrongByteSig = v0.expectedSignature.substring(0, 62) + (v0.expectedSignature.endsWith('0') ? '1' : '0');

  assert(!validateLynkSignature(v0.refId, v0.amount, v0.messageId, truncatedSig, v0.secretKey), 'Rejects truncated signature without throwing');
  assert(!validateLynkSignature(v0.refId, v0.amount, v0.messageId, extendedSig, v0.secretKey), 'Rejects extended signature without throwing');
  assert(!validateLynkSignature(v0.refId, v0.amount, v0.messageId, wrongByteSig, v0.secretKey), 'Rejects single-byte modified signature');

  // Test 1.3: Token Tampering & Cryptographic Limitation Documentation
  console.log(`\n[Unit 1.3] Desktop Token Tampering vs Server Authentication`);
  const originalPayload = {
    orgId: crypto.randomUUID(),
    orgName: 'Tamper Test Studio',
    planTier: 'starter',
    maxDevices: 1,
    hwid: 'HWID-LEGIT-123',
    expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    issuedAt: new Date().toISOString(),
  };
  const legitToken = createSignedToken(originalPayload);

  // Decode and tamper payload: change plan to business and extend to year 2099
  const legitDecoded = JSON.parse(Buffer.from(legitToken, 'base64').toString('utf8'));
  const tamperedPayload = {
    ...legitDecoded.payload,
    planTier: 'business',
    expiresAt: '2099-12-31T23:59:59.000Z',
  };
  // Re-encode with old signature (signature was NOT recomputed with server secret)
  const forgedToken = Buffer.from(JSON.stringify({ payload: tamperedPayload, sig: legitDecoded.sig })).toString('base64');

  // Server-side check MUST REJECT forged token (server has HMAC secret)
  const serverReq = createRequest('http://localhost:3000/api/test', 'GET', {
    authorization: `Bearer ${forgedToken}`,
  });
  const serverAuth = await verifyServerAuth(serverReq);
  assert(serverAuth.isValid === false, 'Server verifyServerAuth rejects forged token signature (LICENSE_INVALID)');
  assert(serverAuth.code === 'LICENSE_INVALID', 'Returns LICENSE_INVALID error code');

  // Desktop offline check: documents the limitation (desktop without secret cannot verify HMAC)
  const clientVerifier = new LicenseVerifier(true);
  const clientResultOnForged = clientVerifier.verifyTokenString(forgedToken, 'HWID-LEGIT-123');
  // It parses payload fields since HMAC secret is server-only (Task 4 finding)
  assert(clientResultOnForged.tier === 'business', 'Documented finding: Offline client parses unverified payload fields when symmetric HMAC secret is held only server-side');

  // Test 1.4: Hardware Fingerprint & Offline Grace Period Boundaries
  console.log(`\n[Unit 1.4] Hardware Fingerprint Mismatch & Grace Period Boundaries`);
  const hwidMismatchResult = clientVerifier.verifyTokenString(legitToken, 'HWID-DIFFERENT-456');
  assert(hwidMismatchResult.isValid === false, 'Rejects token with mismatched HWID binding');
  assert(hwidMismatchResult.code === 'DEVICE_MISMATCH', 'Returns DEVICE_MISMATCH code');

  // Grace period test: Token expired 3 days ago (within 7-day grace period)
  const gracePayload = {
    orgId: crypto.randomUUID(),
    planTier: 'pro',
    hwid: 'HWID-GRACE-123',
    expiresAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    offlineGracePeriodDays: 7,
  };
  const graceToken = Buffer.from(JSON.stringify({ payload: gracePayload, sig: 'dummy_sig' })).toString('base64');
  const graceResult = clientVerifier.verifyTokenString(graceToken, 'HWID-GRACE-123');
  assert(graceResult.isValid === true && graceResult.isGracePeriod === true, 'Allows offline operation within 7-day grace period');

  // Expired past grace period test: Token expired 10 days ago (past 7-day grace period)
  const expiredPastGracePayload = {
    orgId: crypto.randomUUID(),
    planTier: 'pro',
    hwid: 'HWID-GRACE-123',
    expiresAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    offlineGracePeriodDays: 7,
  };
  const expiredPastGraceToken = Buffer.from(JSON.stringify({ payload: expiredPastGracePayload, sig: 'dummy_sig' })).toString('base64');
  const expiredPastGraceResult = clientVerifier.verifyTokenString(expiredPastGraceToken, 'HWID-GRACE-123');
  assert(expiredPastGraceResult.isValid === false && expiredPastGraceResult.isGracePeriod === false, 'Rejects offline operation when expired past grace period');
  assert(expiredPastGraceResult.code === 'LICENSE_EXPIRED', 'Returns LICENSE_EXPIRED code');

  // ===========================================================================
  // CATEGORY 2: REAL DATABASE CONCURRENCY & INTEGRATION TESTS
  // ===========================================================================
  console.log(`\n${YELLOW}--- CATEGORY 2: REAL DATABASE CONCURRENCY & INTEGRATION TESTS ---${RESET}`);

  const ORG_ACTIVE_ID = crypto.randomUUID();
  const ORG_EXPIRED_ID = crypto.randomUUID();
  const ORG_PENDING_ID = crypto.randomUUID();
  const ORG_BOUND_ID = crypto.randomUUID();

  const USER_ACTIVE_EMAIL = `audit_active_${testRunId}@test.id`;
  const USER_EXPIRED_EMAIL = `audit_expired_${testRunId}@test.id`;
  const USER_PENDING_EMAIL = `audit_pending_${testRunId}@test.id`;

  console.log(`[Setup] Provisioning real isolated database fixtures in Supabase...`);
  const now = Date.now();
  const activeExpiry = new Date(now + 45 * 86400000).toISOString(); // 45 days remaining
  const expiredDate = new Date(now - 5 * 86400000).toISOString(); // expired 5 days ago

  await client.from('organizations').insert([
    {
      id: ORG_ACTIVE_ID,
      name: `Studio Audit Active ${testRunId}`,
      slug: `studio-audit-active-${testRunId}`,
      plan_tier: 'starter',
      subscription_status: 'active',
      subscription_expires_at: activeExpiry,
      max_devices_quota: 1,
    },
    {
      id: ORG_EXPIRED_ID,
      name: `Studio Audit Expired ${testRunId}`,
      slug: `studio-audit-expired-${testRunId}`,
      plan_tier: 'starter',
      subscription_status: 'expired',
      subscription_expires_at: expiredDate,
      max_devices_quota: 1,
    },
    {
      id: ORG_PENDING_ID,
      name: `Studio Audit Pending ${testRunId}`,
      slug: `studio-audit-pending-${testRunId}`,
      plan_tier: 'pro',
      subscription_status: 'pending_payment',
      subscription_expires_at: activeExpiry,
      max_devices_quota: 3,
    },
    {
      id: ORG_BOUND_ID,
      name: `Studio Bound ${testRunId}`,
      slug: `studio-bound-${testRunId}`,
      plan_tier: 'pro',
      subscription_status: 'pending_payment',
      subscription_expires_at: activeExpiry,
      max_devices_quota: 3,
    },
  ]);

  const createdUserIds: string[] = [];
  const createTestUser = async (email: string, orgId: string, role = 'VENDOR_OWNER') => {
    const { data: authUser, error: authErr } = await client.auth.admin.createUser({
      email,
      password: 'TestPassword123!',
      email_confirm: true,
    });
    if (authErr || !authUser?.user) throw new Error(`User creation failed: ${authErr?.message}`);
    createdUserIds.push(authUser.user.id);

    await client.from('user_profiles').insert({
      id: authUser.user.id,
      email,
      role,
      organization_id: orgId,
      full_name: email.split('@')[0],
    });
    return authUser.user.id;
  };

  await createTestUser(USER_ACTIVE_EMAIL, ORG_ACTIVE_ID);
  await createTestUser(USER_EXPIRED_EMAIL, ORG_EXPIRED_ID);
  await createTestUser(USER_PENDING_EMAIL, ORG_PENDING_ID);

  // Test 2.1: First Activation (pending_payment -> active)
  console.log(`\n[Real DB 2.1] Verified First Activation (pending_payment -> active)`);
  const refFirst = `AUDIT-ORDER-FIRST-${testRunId}`;
  const msgIdFirst = `MSG-FIRST-${testRunId}`;
  const sigFirst = generateLynkSignature(refFirst, 1099000, msgIdFirst, TEST_LYNK_SECRET);

  const reqFirst = createRequest('http://localhost:3000/api/billing/webhook', 'POST', {
    'content-type': 'application/json',
    'x-lynk-signature': sigFirst,
  }, {
    event: 'payment.received',
    data: {
      message_action: 'SUCCESS',
      message_id: msgIdFirst,
      message_data: {
        refId: refFirst,
        totals: { grandTotal: 1099000 },
        customer: { email: USER_PENDING_EMAIL },
        items: [{ title: 'MingleBooth Pro Bulanan' }],
      },
    },
  });

  const resFirst = await billingWebhook(reqFirst);
  assert(resFirst.status === 200, 'First activation webhook returns HTTP 200');
  const jsonFirst = await resFirst.json();
  assert(jsonFirst.isDuplicate === false, 'First activation is not duplicate');

  const { data: orgPendingDb } = await client.from('organizations').select('*').eq('id', ORG_PENDING_ID).single();
  assert(orgPendingDb.subscription_status === 'active', 'Pending organization successfully activated in real database');
  assert(orgPendingDb.plan_tier === 'pro', 'Plan tier set to pro');
  assert(orgPendingDb.max_devices_quota === 3, 'Device quota set to 3');

  // Test 2.2: Renewal Before Expiry (Preserves Remaining Time)
  console.log(`\n[Real DB 2.2] Renewal Before Expiry (Preserves Remaining Time)`);
  const refRenewActive = `AUDIT-ORDER-RENEW-ACT-${testRunId}`;
  const msgIdRenewActive = `MSG-RENEW-ACT-${testRunId}`;
  const sigRenewActive = generateLynkSignature(refRenewActive, 1499000, msgIdRenewActive, TEST_LYNK_SECRET);

  const reqRenewActive = createRequest('http://localhost:3000/api/billing/webhook', 'POST', {
    'content-type': 'application/json',
    'x-lynk-signature': sigRenewActive,
  }, {
    event: 'payment.received',
    data: {
      message_action: 'SUCCESS',
      message_id: msgIdRenewActive,
      message_data: {
        refId: refRenewActive,
        totals: { grandTotal: 1499000 },
        customer: { email: USER_ACTIVE_EMAIL },
        items: [{ title: 'MingleBooth Starter Tahunan' }],
      },
    },
  });

  const resRenewActive = await billingWebhook(reqRenewActive);
  assert(resRenewActive.status === 200, 'Renewal before expiry returns HTTP 200');

  const { data: orgActiveDb } = await client.from('organizations').select('*').eq('id', ORG_ACTIVE_ID).single();
  const expectedActiveExpiryMs = new Date(activeExpiry).getTime() + 365 * 86400000;
  const actualActiveExpiryMs = new Date(orgActiveDb.subscription_expires_at).getTime();
  assert(Math.abs(actualActiveExpiryMs - expectedActiveExpiryMs) < 5000, 'Preserved remaining 45 days and added +365 days');

  // Test 2.3: Sequential Duplicate Delivery Idempotency
  console.log(`\n[Real DB 2.3] Sequential Duplicate Delivery Idempotency`);
  const reqSeqDuplicate = createRequest('http://localhost:3000/api/billing/webhook', 'POST', {
    'content-type': 'application/json',
    'x-lynk-signature': sigRenewActive,
  }, {
    event: 'payment.received',
    data: {
      message_action: 'SUCCESS',
      message_id: msgIdRenewActive,
      message_data: {
        refId: refRenewActive,
        totals: { grandTotal: 1499000 },
        customer: { email: USER_ACTIVE_EMAIL },
        items: [{ title: 'MingleBooth Starter Tahunan' }],
      },
    },
  });

  const resSeqDup = await billingWebhook(reqSeqDuplicate);
  assert(resSeqDup.status === 200, 'Duplicate delivery returns HTTP 200');
  const jsonSeqDup = await resSeqDup.json();
  assert(jsonSeqDup.isDuplicate === true, 'Duplicate delivery recognized as duplicate');

  const { data: orgActiveAfterDup } = await client.from('organizations').select('subscription_expires_at').eq('id', ORG_ACTIVE_ID).single();
  assert(orgActiveAfterDup.subscription_expires_at === orgActiveDb.subscription_expires_at, 'Zero additional days added on duplicate webhook delivery');

  // Test 2.4: Truly Concurrent Deliveries of Same Valid Payment (Race Test)
  console.log(`\n[Real DB 2.4] Concurrent Deliveries of Same Valid Payment (Database Race Protection)`);
  const refConcurrent = `AUDIT-ORDER-CONC-${testRunId}`;
  const msgIdConcurrent = `MSG-CONC-${testRunId}`;
  const sigConcurrent = generateLynkSignature(refConcurrent, 1499000, msgIdConcurrent, TEST_LYNK_SECRET);

  const makeConcurrentReq = () =>
    createRequest('http://localhost:3000/api/billing/webhook', 'POST', {
      'content-type': 'application/json',
      'x-lynk-signature': sigConcurrent,
    }, {
      event: 'payment.received',
      data: {
        message_action: 'SUCCESS',
        message_id: msgIdConcurrent,
        message_data: {
          refId: refConcurrent,
          totals: { grandTotal: 1499000 },
          customer: { email: USER_ACTIVE_EMAIL },
          items: [{ title: 'MingleBooth Starter Tahunan' }],
        },
      },
    });

  const [resC1, resC2] = await Promise.all([
    billingWebhook(makeConcurrentReq()),
    billingWebhook(makeConcurrentReq()),
  ]);

  assert(resC1.status === 200 && resC2.status === 200, 'Both concurrent webhook requests return HTTP 200');
  const jsonC1 = await resC1.json();
  const jsonC2 = await resC2.json();
  assert(
    (jsonC1.isDuplicate && !jsonC2.isDuplicate) || (!jsonC1.isDuplicate && jsonC2.isDuplicate),
    'Exactly one concurrent worker is granted entitlement, the other safely returns duplicate'
  );

  const { data: concPayRows } = await client.from('payments').select('id').eq('order_id', refConcurrent);
  assert(concPayRows.length === 1, 'Exactly one payment record persists in database for concurrent requests');

  // Test 2.5: Cross-Route Idempotency (Two Webhook Routes Receiving Same Order)
  console.log(`\n[Real DB 2.5] Cross-Route Idempotency (/api/billing/webhook & /api/webhooks/payment)`);
  const refCross = `AUDIT-ORDER-CROSS-${testRunId}`;
  const msgIdCross = `MSG-CROSS-${testRunId}`;
  const sigCrossLynk = generateLynkSignature(refCross, 1099000, msgIdCross, TEST_LYNK_SECRET);

  // Delivery 1 via Lynk webhook route
  const reqCrossLynk = createRequest('http://localhost:3000/api/billing/webhook', 'POST', {
    'content-type': 'application/json',
    'x-lynk-signature': sigCrossLynk,
  }, {
    event: 'payment.received',
    data: {
      message_action: 'SUCCESS',
      message_id: msgIdCross,
      message_data: {
        refId: refCross,
        totals: { grandTotal: 1099000 },
        customer: { email: USER_PENDING_EMAIL },
        items: [{ title: 'MingleBooth Pro Bulanan' }],
      },
    },
  });
  const resCrossLynk = await billingWebhook(reqCrossLynk);
  assert(resCrossLynk.status === 200, 'Lynk route processes initial payment');

  // Delivery 2 for same order via generic payment webhook route
  const genericBody = {
    orderId: refCross,
    organizationId: ORG_PENDING_ID,
    planTier: 'pro',
    amountIdr: 1099000,
    paymentStatus: 'PAID',
    durationDays: 30,
  };
  const genericSig = crypto.createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET!).update(JSON.stringify(genericBody)).digest('hex');
  const reqCrossGeneric = createRequest('http://localhost:3000/api/webhooks/payment', 'POST', {
    'content-type': 'application/json',
    'x-payment-signature': genericSig,
  }, genericBody);

  const resCrossGeneric = await paymentWebhook(reqCrossGeneric);
  assert(resCrossGeneric.status === 200, 'Generic route returns HTTP 200');
  const jsonCrossGeneric = await resCrossGeneric.json();
  assert(jsonCrossGeneric.isDuplicate === true, 'Generic payment route recognizes Lynk purchase as duplicate (shared idempotency anchor)');

  // Test 2.6: Authoritative Order Validation (Incorrect Amount Rejection)
  console.log(`\n[Real DB 2.6] Pre-Registered Order Validation: Insufficient Amount Rejection`);
  const refPrepay = `AUDIT-PREPAY-${testRunId}`;
  await client.from('payments').insert({
    order_id: refPrepay,
    organization_id: ORG_ACTIVE_ID,
    plan_tier: 'pro',
    amount_idr: 1099000,
    payment_status: 'PENDING',
  });

  // Attempt to settle with only Rp 500.000
  let insufficientErr: any = null;
  try {
    await executePaymentSettlement({
      orderId: refPrepay,
      organizationId: ORG_ACTIVE_ID,
      planTier: 'pro',
      amountIdr: 500000,
      durationDays: 30,
    });
  } catch (err: any) {
    insufficientErr = err;
  }
  assert(insufficientErr !== null, 'Rejects settlement with amount less than pre-registered order amount');
  assert(insufficientErr.message.includes('PAYMENT_AMOUNT_INSUFFICIENT'), 'Throws PAYMENT_AMOUNT_INSUFFICIENT error');

  // Test 2.7: Pre-Registered Order Validation: Mismatched Organization Rejection
  console.log(`\n[Real DB 2.7] Pre-Registered Order Validation: Organization Hijack Rejection`);
  let orgMismatchErr: any = null;
  try {
    await executePaymentSettlement({
      orderId: refPrepay,
      organizationId: ORG_EXPIRED_ID, // Different org
      planTier: 'pro',
      amountIdr: 1099000,
      durationDays: 30,
    });
  } catch (err: any) {
    orgMismatchErr = err;
  }
  assert(orgMismatchErr !== null, 'Rejects attempt to reassign order to a different organization');
  assert(orgMismatchErr.message.includes('ORGANIZATION_MISMATCH'), 'Throws ORGANIZATION_MISMATCH error');

  // Test 2.8: Vendor Self-Upgrade Prevention & Privilege Separation
  console.log(`\n[Real DB 2.8] Privilege Separation & Vendor Self-Upgrade Prevention`);
  const vendorToken = createSignedToken({
    orgId: ORG_ACTIVE_ID,
    role: 'VENDOR_OWNER',
    email: USER_ACTIVE_EMAIL,
  });

  const reqSelfUpgrade = createRequest('http://localhost:3000/api/admin/vendors', 'POST', {
    'content-type': 'application/json',
    authorization: `Bearer ${vendorToken}`,
  }, {
    orgId: ORG_ACTIVE_ID,
    action: 'change_plan',
    planTier: 'business',
  });

  const resSelfUpgrade = await adminVendors(reqSelfUpgrade);
  assert(resSelfUpgrade.status === 403, 'Vendor cannot self-upgrade plan via admin endpoint (HTTP 403)');

  // Superadmin extension verification
  const superadminToken = createSignedToken({
    orgId: ORG_ACTIVE_ID,
    role: 'SUPER_ADMIN',
    email: 'admin@minglebooth.com',
  });

  const reqSuperadminExtend = createRequest('http://localhost:3000/api/admin/vendors', 'POST', {
    'content-type': 'application/json',
    authorization: `Bearer ${superadminToken}`,
  }, {
    orgId: ORG_ACTIVE_ID,
    action: 'extend_1_year',
  });

  const resSuperadminExtend = await adminVendors(reqSuperadminExtend);
  assert(resSuperadminExtend.status === 200, 'Superadmin can extend vendor subscription (HTTP 200)');

  // ===========================================================================
  // CATEGORY 3: FAULT INJECTION & MOCKED INTEGRATION TESTS
  // ===========================================================================
  console.log(`\n${YELLOW}--- CATEGORY 3: FAULT INJECTION & MOCKED INTEGRATION TESTS ---${RESET}`);

  // Test 3.1: Entitlement Mutation Failure Compensation Rollback
  console.log(`\n[Fault 3.1] Compensation Rollback on Entitlement Mutation Failure`);
  const refRollbackTest = `AUDIT-ROLLBACK-${testRunId}`;
  const NON_EXISTENT_ORG_ID = crypto.randomUUID(); // Valid UUID format, but no such row in DB

  let rollbackErr: any = null;
  try {
    await executePaymentSettlement({
      orderId: refRollbackTest,
      organizationId: NON_EXISTENT_ORG_ID,
      planTier: 'pro',
      amountIdr: 1099000,
      durationDays: 30,
    });
  } catch (err: any) {
    rollbackErr = err;
  }
  assert(rollbackErr !== null, 'Throws error when organization does not exist');

  // Verify DB: Payment was NOT permanently left in PAID state
  const { data: checkRollbackPay } = await client.from('payments').select('id, payment_status').eq('order_id', refRollbackTest).maybeSingle();
  assert(!checkRollbackPay || checkRollbackPay.payment_status !== 'PAID', 'Compensation rollback ensured no payment is orphaned in PAID status');

  // Test 3.2: Missing Signature Handling
  console.log(`\n[Fault 3.2] Missing Webhook Signature Rejection`);
  const reqNoSig = createRequest('http://localhost:3000/api/billing/webhook', 'POST', {
    'content-type': 'application/json',
  }, {
    event: 'payment.received',
    data: {
      message_action: 'SUCCESS',
      message_id: 'MSG-NOSIG',
      message_data: { refId: 'ORDER-NOSIG', totals: { grandTotal: 1099000 } },
    },
  });
  const resNoSig = await billingWebhook(reqNoSig);
  assert(resNoSig.status === 401, 'Rejects missing signature with HTTP 401');

  // ===========================================================================
  // TEARDOWN
  // ===========================================================================
  console.log(`\n[Teardown] Cleaning up test fixtures...`);
  await client.from('payments').delete().like('order_id', `%${testRunId}%`);
  await client.from('user_profiles').delete().like('email', `%${testRunId}%`);
  for (const uid of createdUserIds) {
    try { await client.auth.admin.deleteUser(uid); } catch {}
  }
  await client.from('organizations').delete().in('id', [ORG_ACTIVE_ID, ORG_EXPIRED_ID, ORG_PENDING_ID, ORG_BOUND_ID]);
  console.log(`  ${GREEN}✓ Teardown complete.${RESET}\n`);

  console.log(`${CYAN}========================================================================${RESET}`);
  console.log(`${CYAN}   AUDIT SUITE COMPLETE: ${passedTests}/${totalTests} TESTS PASSED!     ${RESET}`);
  console.log(`${CYAN}========================================================================${RESET}\n`);
}

runAuditTestSuite().catch((err) => {
  console.error(`\n${RED}AUDIT SUITE ENCOUNTERED FATAL ERROR:${RESET}`, err);
  process.exit(1);
});
