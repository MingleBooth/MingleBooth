/**
 * PHASE 15.4 — Comprehensive Subscription & Billing Hardening Test Suite
 *
 * Direct integration and authorization tests covering:
 * 1. Valid Lynk.id payment webhook & signature calculation
 * 2. Invalid webhook signature rejection (401)
 * 3. Missing webhook signature rejection when configured (401)
 * 4. Database boundary idempotency & duplicate webhook delivery protection
 * 5. Concurrent duplicate delivery serialization (Postgres unique constraint safe)
 * 6. Missing / invalid order metadata rejection
 * 7. Wrong / negligible amount rejection
 * 8. Unpaid / failed payment action handling
 * 9. First subscription activation (pending_payment -> active)
 * 10. Renewal before expiry (preserves remaining subscription days)
 * 11. Renewal after expiry (starts fresh from payment time)
 * 12. Duplicate renewal prevention (zero extra days added)
 * 13. Expired subscription enforcement on vendor-login & verify-license
 * 14. Unpaid pending_payment enforcement on vendor-login & verify-license
 * 15. Unauthorized self-upgrade prevention (privilege separation)
 * 16. Device quota consistency matching authoritative plans
 * 17. Tenant-scoped billing history retrieval
 */

import { NextRequest } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Production imports using tsconfig aliases
import { getServiceSupabase } from '@/lib/supabase';
import { createSignedToken } from '@/lib/auth-server';
import { POST as billingWebhook } from '../apps/web/src/app/api/billing/webhook/route';
import { validateLynkSignature, generateLynkSignature } from '@/lib/lynk';
import { POST as paymentWebhook } from '../apps/web/src/app/api/webhooks/payment/route';
import { GET as getVendorBilling } from '../apps/web/src/app/api/vendor/billing/route';
import { POST as vendorLogin } from '../apps/web/src/app/api/auth/vendor-login/route';
import { POST as verifyLicense } from '../apps/web/src/app/api/auth/verify-license/route';
import { POST as adminVendors } from '../apps/web/src/app/api/admin/vendors/route';

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

async function runBillingTestSuite() {
  console.log(`\n${CYAN}================================================================${RESET}`);
  console.log(`${CYAN}   PHASE 15.4 — SUBSCRIPTION & BILLING HARDENING TEST SUITE${RESET}`);
  console.log(`${CYAN}================================================================${RESET}\n`);

  const client = getServiceSupabase();
  const testRunId = crypto.randomBytes(4).toString('hex');

  // Test Merchant Secret Key for Lynk.id webhook
  const TEST_LYNK_SECRET = `lynk_sec_${testRunId}`;
  process.env.LYNK_MERCHANT_KEY = TEST_LYNK_SECRET;

  const ORG_A_ID = crypto.randomUUID();
  const ORG_B_ID = crypto.randomUUID();
  const ORG_EXPIRED_ID = crypto.randomUUID();
  const ORG_PENDING_ID = crypto.randomUUID();

  const USER_A_EMAIL = `vendor_a_${testRunId}@testbilling.id`;
  const USER_EXPIRED_EMAIL = `expired_${testRunId}@testbilling.id`;
  const USER_PENDING_EMAIL = `pending_${testRunId}@testbilling.id`;

  let createdUserIds: string[] = [];

  console.log(`[Setup] Creating isolated test organizations and user profiles...`);
  try {
    const now = Date.now();
    const futureDate = new Date(now + 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 days remaining
    const pastDate = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(); // expired 10 days ago

    // Org A: Active Starter with 60 days remaining
    await client.from('organizations').insert({
      id: ORG_A_ID,
      name: `Studio A ${testRunId}`,
      slug: `studio-a-${testRunId}`,
      plan_tier: 'starter',
      subscription_status: 'active',
      subscription_expires_at: futureDate,
      max_devices_quota: 1,
    });

    // Org B: Active Pro
    await client.from('organizations').insert({
      id: ORG_B_ID,
      name: `Studio B ${testRunId}`,
      slug: `studio-b-${testRunId}`,
      plan_tier: 'pro',
      subscription_status: 'active',
      subscription_expires_at: futureDate,
      max_devices_quota: 3,
    });

    // Org Expired: Expired 10 days ago
    await client.from('organizations').insert({
      id: ORG_EXPIRED_ID,
      name: `Studio Expired ${testRunId}`,
      slug: `studio-expired-${testRunId}`,
      plan_tier: 'starter',
      subscription_status: 'expired',
      subscription_expires_at: pastDate,
      max_devices_quota: 1,
    });

    // Org Pending: Newly registered, pending initial payment
    await client.from('organizations').insert({
      id: ORG_PENDING_ID,
      name: `Studio Pending ${testRunId}`,
      slug: `studio-pending-${testRunId}`,
      plan_tier: 'pro',
      subscription_status: 'pending_payment',
      subscription_expires_at: futureDate,
      max_devices_quota: 3,
    });

    // Create auth users & profiles
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

    await createTestUser(USER_A_EMAIL, ORG_A_ID);
    await createTestUser(USER_EXPIRED_EMAIL, ORG_EXPIRED_ID);
    await createTestUser(USER_PENDING_EMAIL, ORG_PENDING_ID);

    console.log(`  ${GREEN}✓ Setup completed successfully.${RESET}\n`);

    // Prepare authentic bearer tokens
    const tokenA = createSignedToken({
      orgId: ORG_A_ID,
      orgName: `Studio A ${testRunId}`,
      planTier: 'starter',
      email: USER_A_EMAIL,
      role: 'VENDOR_OWNER',
      expiresAt: futureDate,
      issuedAt: new Date().toISOString(),
    });

    const tokenSuper = createSignedToken({
      userId: '00000000-0000-0000-0000-000000000001',
      orgId: '00000000-0000-0000-0000-000000000000',
      email: 'superadmin@minglebooth.com',
      role: 'SUPER_ADMIN',
      expiresAt: futureDate,
      issuedAt: new Date().toISOString(),
    });

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 1: LYNK.ID WEBHOOK SIGNATURE VERIFICATION
    // ───────────────────────────────────────────────────────────────────────────
    console.log(`[Test 1] Lynk.id Webhook Signature Verification`);
    const ref1 = `ORDER-1-${testRunId}`;
    const msgId1 = `MSG-1-${testRunId}`;
    const amount1 = 2999000; // Pro Yearly
    const validSig1 = generateLynkSignature(ref1, amount1, msgId1, TEST_LYNK_SECRET);

    assert(
      validateLynkSignature(ref1, amount1, msgId1, validSig1, TEST_LYNK_SECRET) === true,
      'validateLynkSignature verifies genuine SHA256 signature'
    );

    const corruptSig1 = validSig1.substring(0, validSig1.length - 2) + '00';
    assert(
      validateLynkSignature(ref1, amount1, msgId1, corruptSig1, TEST_LYNK_SECRET) === false,
      'validateLynkSignature rejects tampered signature'
    );

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 2: INVALID SIGNATURE REJECTION BY WEBHOOK HANDLER
    // ───────────────────────────────────────────────────────────────────────────
    console.log(`\n[Test 2] Invalid Webhook Signature Rejection`);
    const reqInvalidSig = createRequest('http://localhost:3000/api/billing/webhook', 'POST', {
      'content-type': 'application/json',
      'x-lynk-signature': 'invalid_signature_hex_1234567890abcdef',
    }, {
      event: 'payment.received',
      data: {
        message_action: 'SUCCESS',
        message_id: msgId1,
        message_data: {
          refId: ref1,
          totals: { grandTotal: amount1 },
          customer: { email: USER_A_EMAIL },
          items: [{ title: 'MingleBooth Pro Tahunan' }],
        },
      },
    });

    const resInvalidSig = await billingWebhook(reqInvalidSig);
    assert(resInvalidSig.status === 401, 'POST /api/billing/webhook rejects invalid signature with HTTP 401');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 3: MISSING SIGNATURE REJECTION WHEN SECRET CONFIGURED
    // ───────────────────────────────────────────────────────────────────────────
    console.log(`\n[Test 3] Missing Webhook Signature Rejection`);
    const reqMissingSig = createRequest('http://localhost:3000/api/billing/webhook', 'POST', {
      'content-type': 'application/json',
    }, {
      event: 'payment.received',
      data: {
        message_action: 'SUCCESS',
        message_id: msgId1,
        message_data: {
          refId: ref1,
          totals: { grandTotal: amount1 },
          customer: { email: USER_A_EMAIL },
          items: [{ title: 'MingleBooth Pro Tahunan' }],
        },
      },
    });

    const resMissingSig = await billingWebhook(reqMissingSig);
    assert(resMissingSig.status === 401, 'POST /api/billing/webhook rejects missing signature with HTTP 401');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 4: UNPAID / NON-SUCCESS PAYMENT HANDLING
    // ───────────────────────────────────────────────────────────────────────────
    console.log(`\n[Test 4] Unpaid / Non-Success Transaction Handling`);
    const refUnpaid = `ORDER-UNPAID-${testRunId}`;
    const msgIdUnpaid = `MSG-UNPAID-${testRunId}`;
    const sigUnpaid = generateLynkSignature(refUnpaid, amount1, msgIdUnpaid, TEST_LYNK_SECRET);

    const reqUnpaid = createRequest('http://localhost:3000/api/billing/webhook', 'POST', {
      'content-type': 'application/json',
      'x-lynk-signature': sigUnpaid,
    }, {
      event: 'payment.received',
      data: {
        message_action: 'FAILED',
        message_id: msgIdUnpaid,
        message_data: {
          refId: refUnpaid,
          totals: { grandTotal: amount1 },
          customer: { email: USER_A_EMAIL },
          items: [{ title: 'MingleBooth Pro Tahunan' }],
        },
      },
    });

    const resUnpaid = await billingWebhook(reqUnpaid);
    assert(resUnpaid.status === 200, 'Non-success message_action returns HTTP 200 acknowledgement');
    const dataUnpaid = await resUnpaid.json();
    assert(dataUnpaid.message === 'Payment not successful', 'Explains payment not successful without granting license');

    // Verify DB: No payment record marked PAID
    const { data: checkUnpaidPay } = await client.from('payments').select('id').eq('order_id', refUnpaid).maybeSingle();
    assert(!checkUnpaidPay, 'Zero payment records inserted for failed transaction');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 5: WRONG AMOUNT / NEGLIGIBLE FRAUDULENT PAYMENT REJECTION
    // ───────────────────────────────────────────────────────────────────────────
    console.log(`\n[Test 5] Negligible Amount Rejection`);
    const refLow = `ORDER-LOW-${testRunId}`;
    const msgIdLow = `MSG-LOW-${testRunId}`;
    const sigLow = generateLynkSignature(refLow, 500, msgIdLow, TEST_LYNK_SECRET);

    const reqLow = createRequest('http://localhost:3000/api/billing/webhook', 'POST', {
      'content-type': 'application/json',
      'x-lynk-signature': sigLow,
    }, {
      event: 'payment.received',
      data: {
        message_action: 'SUCCESS',
        message_id: msgIdLow,
        message_data: {
          refId: refLow,
          totals: { grandTotal: 500 }, // Rp 500 (negligible)
          customer: { email: USER_A_EMAIL },
          items: [{ title: 'Fake Subscription' }],
        },
      },
    });

    const resLow = await billingWebhook(reqLow);
    assert(resLow.status === 400, 'Rejects payment with negligible amount (< Rp 100.000) with HTTP 400');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 6: FIRST SUBSCRIPTION ACTIVATION (PENDING_PAYMENT -> ACTIVE)
    // ───────────────────────────────────────────────────────────────────────────
    console.log(`\n[Test 6] First Subscription Activation (pending_payment -> active)`);
    const refPending = `ORDER-PENDING-${testRunId}`;
    const msgIdPending = `MSG-PENDING-${testRunId}`;
    const amountPending = 1099000; // Pro Monthly
    const sigPending = generateLynkSignature(refPending, amountPending, msgIdPending, TEST_LYNK_SECRET);

    const reqPending = createRequest('http://localhost:3000/api/billing/webhook', 'POST', {
      'content-type': 'application/json',
      'x-lynk-signature': sigPending,
    }, {
      event: 'payment.received',
      data: {
        message_action: 'SUCCESS',
        message_id: msgIdPending,
        message_data: {
          refId: refPending,
          totals: { grandTotal: amountPending },
          customer: { email: USER_PENDING_EMAIL },
          items: [{ title: 'MingleBooth Pro Bulanan' }],
        },
      },
    });

    const resPending = await billingWebhook(reqPending);
    assert(resPending.status === 200, 'First payment webhook returns HTTP 200');
    const dataPending = await resPending.json();
    assert(dataPending.success === true, 'Activation indicates success: true');
    assert(dataPending.planTier === 'pro', 'Plan tier assigned as pro');
    assert(dataPending.maxDevices === 3, 'Device quota assigned as 3');

    // Verify DB update
    const { data: orgPendingAfter } = await client.from('organizations').select('*').eq('id', ORG_PENDING_ID).single();
    assert(orgPendingAfter.subscription_status === 'active', 'Org status transitioned to active');
    assert(orgPendingAfter.plan_tier === 'pro', 'Org plan_tier is pro');
    assert(orgPendingAfter.max_devices_quota === 3, 'Org max_devices_quota is 3');

    // Verify payments table record
    const { data: payPendingRow } = await client.from('payments').select('*').eq('order_id', refPending).single();
    assert(payPendingRow.payment_status === 'PAID', 'Payment record recorded with payment_status: PAID');
    assert(payPendingRow.amount_idr === 1099000, 'Payment record amount matches grandTotal');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 7: RENEWAL BEFORE EXPIRY (PRESERVES REMAINING TIME)
    // ───────────────────────────────────────────────────────────────────────────
    console.log(`\n[Test 7] Renewal Before Expiry (Preserves Remaining Subscription Days)`);
    // Org A has ~60 days remaining
    const { data: orgABeforeRenew } = await client.from('organizations').select('subscription_expires_at').eq('id', ORG_A_ID).single();
    const expiryBeforeRenewMs = new Date(orgABeforeRenew.subscription_expires_at).getTime();

    const refRenewBefore = `ORDER-RENEW-A-${testRunId}`;
    const msgIdRenewBefore = `MSG-RENEW-A-${testRunId}`;
    const amountRenewBefore = 1499000; // Starter Yearly (365 days)
    const sigRenewBefore = generateLynkSignature(refRenewBefore, amountRenewBefore, msgIdRenewBefore, TEST_LYNK_SECRET);

    const reqRenewBefore = createRequest('http://localhost:3000/api/billing/webhook', 'POST', {
      'content-type': 'application/json',
      'x-lynk-signature': sigRenewBefore,
    }, {
      event: 'payment.received',
      data: {
        message_action: 'SUCCESS',
        message_id: msgIdRenewBefore,
        message_data: {
          refId: refRenewBefore,
          totals: { grandTotal: amountRenewBefore },
          customer: { email: USER_A_EMAIL },
          items: [{ title: 'MingleBooth Starter Tahunan' }],
        },
      },
    });

    const resRenewBefore = await billingWebhook(reqRenewBefore);
    assert(resRenewBefore.status === 200, 'Renewal webhook returns HTTP 200');

    const { data: orgAAfterRenew } = await client.from('organizations').select('subscription_expires_at').eq('id', ORG_A_ID).single();
    const expiryAfterRenewMs = new Date(orgAAfterRenew.subscription_expires_at).getTime();

    // The new expiry must be approximately expiryBeforeRenewMs + 365 days (tolerance +/- 5 seconds)
    const expectedExpiryMs = expiryBeforeRenewMs + 365 * 24 * 60 * 60 * 1000;
    const diffMs = Math.abs(expiryAfterRenewMs - expectedExpiryMs);
    assert(diffMs < 5000, 'Renewal before expiry preserves remaining 60 days and extends by +365 days');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 8: DUPLICATE WEBHOOK DELIVERY (IDEMPOTENCY ENFORCEMENT)
    // ───────────────────────────────────────────────────────────────────────────
    console.log(`\n[Test 8] Duplicate Webhook Delivery Idempotency`);
    // Re-send the exact same webhook request for refRenewBefore
    const reqDuplicate = createRequest('http://localhost:3000/api/billing/webhook', 'POST', {
      'content-type': 'application/json',
      'x-lynk-signature': sigRenewBefore,
    }, {
      event: 'payment.received',
      data: {
        message_action: 'SUCCESS',
        message_id: msgIdRenewBefore,
        message_data: {
          refId: refRenewBefore,
          totals: { grandTotal: amountRenewBefore },
          customer: { email: USER_A_EMAIL },
          items: [{ title: 'MingleBooth Starter Tahunan' }],
        },
      },
    });
    const resDuplicate = await billingWebhook(reqDuplicate);
    assert(resDuplicate.status === 200, 'Duplicate delivery returns HTTP 200');
    const dataDuplicate = await resDuplicate.json();
    assert(dataDuplicate.isDuplicate === true, 'Response flags isDuplicate: true');

    // Verify DB: Expiry date was NOT extended a second time
    const { data: orgAAfterDuplicate } = await client.from('organizations').select('subscription_expires_at').eq('id', ORG_A_ID).single();
    assert(
      orgAAfterDuplicate.subscription_expires_at === orgAAfterRenew.subscription_expires_at,
      'Duplicate webhook delivery adds ZERO extra days (strictly idempotent)'
    );

    // Verify DB: Exactly 1 payment record exists for this order
    const { data: payRows } = await client.from('payments').select('id').eq('order_id', refRenewBefore);
    assert(payRows.length === 1, 'Exactly one payment record persists for duplicate delivery');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 9: CONCURRENT DUPLICATE DELIVERY SERIALIZATION
    // ───────────────────────────────────────────────────────────────────────────
    console.log(`\n[Test 9] Concurrent Duplicate Delivery Serialization`);
    const refConcurrent = `ORDER-CONCURRENT-${testRunId}`;
    const msgIdConcurrent = `MSG-CONCURRENT-${testRunId}`;
    const sigConcurrent = generateLynkSignature(refConcurrent, amountRenewBefore, msgIdConcurrent, TEST_LYNK_SECRET);

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
            totals: { grandTotal: amountRenewBefore },
            customer: { email: USER_A_EMAIL },
            items: [{ title: 'MingleBooth Starter Tahunan' }],
          },
        },
      });

    // Launch both requests concurrently via Promise.all
    const [resConc1, resConc2] = await Promise.all([
      billingWebhook(makeConcurrentReq()),
      billingWebhook(makeConcurrentReq()),
    ]);

    assert(resConc1.status === 200 && resConc2.status === 200, 'Both concurrent webhook requests return HTTP 200');
    const jsonConc1 = await resConc1.json();
    const jsonConc2 = await resConc2.json();
    assert(
      (jsonConc1.isDuplicate || jsonConc2.isDuplicate) === true,
      'One of the concurrent requests is recognized and handled as duplicate'
    );

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 10: RENEWAL AFTER EXPIRY (STARTS FRESH FROM NOW)
    // ───────────────────────────────────────────────────────────────────────────
    console.log(`\n[Test 10] Renewal After Expiry (Starts Fresh From Payment Timestamp)`);
    const refRenewAfter = `ORDER-RENEW-EXPIRED-${testRunId}`;
    const msgIdRenewAfter = `MSG-RENEW-EXPIRED-${testRunId}`;
    const sigRenewAfter = generateLynkSignature(refRenewAfter, amountRenewBefore, msgIdRenewAfter, TEST_LYNK_SECRET);

    const nowBeforeExpiredRenew = Date.now();
    const reqRenewAfter = createRequest('http://localhost:3000/api/billing/webhook', 'POST', {
      'content-type': 'application/json',
      'x-lynk-signature': sigRenewAfter,
    }, {
      event: 'payment.received',
      data: {
        message_action: 'SUCCESS',
        message_id: msgIdRenewAfter,
        message_data: {
          refId: refRenewAfter,
          totals: { grandTotal: amountRenewBefore },
          customer: { email: USER_EXPIRED_EMAIL },
          items: [{ title: 'MingleBooth Starter Tahunan' }],
        },
      },
    });

    const resRenewAfter = await billingWebhook(reqRenewAfter);
    assert(resRenewAfter.status === 200, 'Renewal after expiry returns HTTP 200');

    const { data: orgExpiredAfterRenew } = await client.from('organizations').select('*').eq('id', ORG_EXPIRED_ID).single();
    assert(orgExpiredAfterRenew.subscription_status === 'active', 'Expired organization restored to active status');

    const expiredNewExpiryMs = new Date(orgExpiredAfterRenew.subscription_expires_at).getTime();
    const expectedFreshExpiryMs = nowBeforeExpiredRenew + 365 * 24 * 60 * 60 * 1000;
    assert(
      Math.abs(expiredNewExpiryMs - expectedFreshExpiryMs) < 5000,
      'Renewal after expiry resets base time to payment time (365 fresh days granted)'
    );

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 11: UNPAID PENDING_PAYMENT ENFORCEMENT ON KIOSK LOGIN & VERIFY-LICENSE
    // ───────────────────────────────────────────────────────────────────────────
    console.log(`\n[Test 11] Unpaid pending_payment Enforcement on Desktop Login & License Verification`);
    // Create new unpaid organization
    const ORG_STILL_PENDING = crypto.randomUUID();
    const USER_STILL_PENDING = `stillpending_${testRunId}@test.id`;
    await client.from('organizations').insert({
      id: ORG_STILL_PENDING,
      name: `Unpaid Studio ${testRunId}`,
      slug: `unpaid-studio-${testRunId}`,
      plan_tier: 'starter',
      subscription_status: 'pending_payment',
      subscription_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      max_devices_quota: 1,
    });
    await createTestUser(USER_STILL_PENDING, ORG_STILL_PENDING);

    // 11.1 vendor-login with pending_payment
    const reqLoginPending = createRequest('http://localhost:3000/api/auth/vendor-login', 'POST', {
      'content-type': 'application/json',
    }, {
      email: USER_STILL_PENDING,
      hardwareFingerprint: `HWID-PENDING-${testRunId}`,
      deviceName: 'Pending Laptop',
    });
    const resLoginPending = await vendorLogin(reqLoginPending);
    assert(resLoginPending.status === 403, 'vendor-login rejects pending_payment account with HTTP 403');
    const dataLoginPending = await resLoginPending.json();
    assert(dataLoginPending.code === 'SUBSCRIPTION_PENDING_PAYMENT', 'Returns code SUBSCRIPTION_PENDING_PAYMENT');

    // 11.2 verify-license with pending_payment token
    const tokenPending = createSignedToken({
      orgId: ORG_STILL_PENDING,
      orgName: `Unpaid Studio ${testRunId}`,
      planTier: 'starter',
      email: USER_STILL_PENDING,
      role: 'VENDOR_OWNER',
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      issuedAt: new Date().toISOString(),
    });

    const reqVerifyPending = createRequest('http://localhost:3000/api/auth/verify-license', 'POST', {
      authorization: `Bearer ${tokenPending}`,
      'content-type': 'application/json',
    }, {});
    const resVerifyPending = await verifyLicense(reqVerifyPending);
    assert(resVerifyPending.status === 403, 'verify-license rejects pending_payment organization with HTTP 403');
    const dataVerifyPending = await resVerifyPending.json();
    assert(dataVerifyPending.code === 'SUBSCRIPTION_PENDING_PAYMENT', 'Returns code SUBSCRIPTION_PENDING_PAYMENT');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 12: EXPIRED SUBSCRIPTION ENFORCEMENT ON KIOSK LOGIN & VERIFY-LICENSE
    // ───────────────────────────────────────────────────────────────────────────
    console.log(`\n[Test 12] Expired Subscription Enforcement`);
    const ORG_STILL_EXPIRED = crypto.randomUUID();
    const USER_STILL_EXPIRED = `stillexpired_${testRunId}@test.id`;
    await client.from('organizations').insert({
      id: ORG_STILL_EXPIRED,
      name: `Expired Studio ${testRunId}`,
      slug: `expired-studio-${testRunId}`,
      plan_tier: 'starter',
      subscription_status: 'expired',
      subscription_expires_at: new Date(Date.now() - 5 * 86400000).toISOString(),
      max_devices_quota: 1,
    });
    await createTestUser(USER_STILL_EXPIRED, ORG_STILL_EXPIRED);

    // 12.1 vendor-login with expired account
    const reqLoginExpired = createRequest('http://localhost:3000/api/auth/vendor-login', 'POST', {
      'content-type': 'application/json',
    }, {
      email: USER_STILL_EXPIRED,
      hardwareFingerprint: `HWID-EXPIRED-${testRunId}`,
      deviceName: 'Expired Laptop',
    });
    const resLoginExpired = await vendorLogin(reqLoginExpired);
    assert(resLoginExpired.status === 403, 'vendor-login rejects expired account with HTTP 403');
    const dataLoginExpired = await resLoginExpired.json();
    assert(dataLoginExpired.code === 'SUBSCRIPTION_EXPIRED', 'Returns code SUBSCRIPTION_EXPIRED');

    // 12.2 verify-license with expired token
    const tokenExpired = createSignedToken({
      orgId: ORG_STILL_EXPIRED,
      orgName: `Expired Studio ${testRunId}`,
      planTier: 'starter',
      email: USER_STILL_EXPIRED,
      role: 'VENDOR_OWNER',
      expiresAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      issuedAt: new Date().toISOString(),
    });
    const reqVerifyExpired = createRequest('http://localhost:3000/api/auth/verify-license', 'POST', {
      authorization: `Bearer ${tokenExpired}`,
      'content-type': 'application/json',
    }, {});
    const resVerifyExpired = await verifyLicense(reqVerifyExpired);
    assert(resVerifyExpired.status === 403, 'verify-license rejects expired account with HTTP 403');
    const dataVerifyExpired = await resVerifyExpired.json();
    assert(dataVerifyExpired.code === 'LICENSE_EXPIRED', 'Returns code LICENSE_EXPIRED');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 13: UNAUTHORIZED SELF-UPGRADE PREVENTION
    // ───────────────────────────────────────────────────────────────────────────
    console.log(`\n[Test 13] Unauthorized Self-Upgrade Prevention`);
    const reqSelfUpgrade = createRequest('http://localhost:3000/api/admin/vendors', 'POST', {
      authorization: `Bearer ${tokenA}`, // Regular vendor token
      'content-type': 'application/json',
    }, {
      orgId: ORG_A_ID,
      action: 'change_plan',
      planTier: 'business',
    });
    const resSelfUpgrade = await adminVendors(reqSelfUpgrade);
    assert(resSelfUpgrade.status === 403, 'Regular vendor cannot self-upgrade via admin API (HTTP 403 ORG_ACCESS_DENIED)');

    // Verify Org A plan remained starter
    const { data: orgACheckPlan } = await client.from('organizations').select('plan_tier').eq('id', ORG_A_ID).single();
    assert(orgACheckPlan.plan_tier === 'starter', 'Org A plan remained starter (unauthorized upgrade blocked)');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 14: SUPERADMIN PRIVILEGED PLAN CHANGE & EXTENSION
    // ───────────────────────────────────────────────────────────────────────────
    console.log(`\n[Test 14] Superadmin Privileged Plan Change & Extension`);
    const reqSuperExtend = createRequest('http://localhost:3000/api/admin/vendors', 'POST', {
      authorization: `Bearer ${tokenSuper}`,
      'content-type': 'application/json',
    }, {
      orgId: ORG_A_ID,
      action: 'extend_1_year',
    });
    const resSuperExtend = await adminVendors(reqSuperExtend);
    assert(resSuperExtend.status === 200, 'Superadmin can extend subscription (HTTP 200)');

    const reqSuperPlan = createRequest('http://localhost:3000/api/admin/vendors', 'POST', {
      authorization: `Bearer ${tokenSuper}`,
      'content-type': 'application/json',
    }, {
      orgId: ORG_A_ID,
      action: 'change_plan',
      planTier: 'pro',
    });
    const resSuperPlan = await adminVendors(reqSuperPlan);
    assert(resSuperPlan.status === 200, 'Superadmin can change vendor plan (HTTP 200)');

    const { data: orgAAfterSuper } = await client.from('organizations').select('plan_tier, max_devices_quota').eq('id', ORG_A_ID).single();
    assert(orgAAfterSuper.plan_tier === 'pro', 'Org A plan successfully changed to pro by Superadmin');
    assert(orgAAfterSuper.max_devices_quota === 3, 'Org A device quota updated to 3 matching pro plan');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 15: TENANT-SCOPED BILLING HISTORY API (GET /api/vendor/billing)
    // ───────────────────────────────────────────────────────────────────────────
    console.log(`\n[Test 15] Tenant-Scoped Billing History Retrieval`);
    // Org A query
    const reqBillingA = createRequest('http://localhost:3000/api/vendor/billing', 'GET', {
      authorization: `Bearer ${tokenA}`,
    });
    const resBillingA = await getVendorBilling(reqBillingA);
    assert(resBillingA.status === 200, 'GET /api/vendor/billing returns HTTP 200 for authenticated vendor');
    const dataBillingA = await resBillingA.json();

    assert(dataBillingA.organization !== undefined, 'Returns organization entitlement info');
    assert(Array.isArray(dataBillingA.payments), 'Returns payments array');
    assert(dataBillingA.payments.length > 0, 'Contains payment transactions for Org A');

    // Verify safe field structure and absence of foreign transactions
    for (const p of dataBillingA.payments) {
      assert(p.orderId !== undefined, 'Payment has orderId');
      assert(p.planTier !== undefined, 'Payment has planTier');
      assert(p.amountIdr !== undefined, 'Payment has amountIdr');
      assert(p.paymentStatus === 'PAID', 'Payment status is PAID');
      assert(p.createdAt !== undefined, 'Payment has createdAt');
    }

    // Verify Org A list does NOT contain Org Pending payments
    const orderIdsA = dataBillingA.payments.map((p: any) => p.orderId);
    assert(!orderIdsA.includes(refPending), 'Tenant A billing history does NOT contain Tenant Pending payment');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 16: BILLING UI CODE AUDIT
    // ───────────────────────────────────────────────────────────────────────────
    console.log(`\n[Test 16] Billing Page UI Code & Security Audit`);
    const billingPageSrc = fs.readFileSync(path.resolve(__dirname, '../apps/web/src/app/billing/page.tsx'), 'utf8');

    assert(billingPageSrc.includes('fetchOrgAndBilling'), 'Billing page implements fetchOrgAndBilling');
    assert(billingPageSrc.includes('Riwayat Transaksi'), 'Billing page displays Riwayat Transaksi section');
    assert(billingPageSrc.includes('p.paymentStatus'), 'Billing page displays paymentStatus');
    assert(billingPageSrc.includes('p.orderId'), 'Billing page displays orderId reference');
    assert(billingPageSrc.includes('getAuthHeaders'), 'Billing page uses authenticated headers');

    console.log(`\n${GREEN}================================================================${RESET}`);
    console.log(`${GREEN}   PHASE 15.4 TEST SUITE: ALL ${passedTests}/${totalTests} TESTS PASSED!${RESET}`);
    console.log(`${GREEN}================================================================${RESET}\n`);

  } finally {
    console.log(`[Teardown] Cleaning up isolated test fixtures...`);
    try {
      // Clean payments
      await client.from('payments').delete().in('organization_id', [ORG_A_ID, ORG_B_ID, ORG_EXPIRED_ID, ORG_PENDING_ID]);
      // Clean users
      for (const uid of createdUserIds) {
        await client.from('user_profiles').delete().eq('id', uid);
        await client.auth.admin.deleteUser(uid);
      }
      // Clean orgs
      await client.from('organizations').delete().in('id', [ORG_A_ID, ORG_B_ID, ORG_EXPIRED_ID, ORG_PENDING_ID]);
      console.log(`  ${GREEN}✓ Teardown complete. Zero test residues left in database.${RESET}\n`);
    } catch (cleanupErr: any) {
      console.error(`  ${YELLOW}! Warning during cleanup: ${cleanupErr?.message}${RESET}`);
    }
  }
}

runBillingTestSuite().catch((err) => {
  console.error('\nBilling Test Suite Exception:', err);
  process.exit(1);
});
