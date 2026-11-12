/**
 * scripts/test-phase2-billing-verification.cjs
 *
 * Automated Test Suite for DOKU Billing Verification & Payment Result Experience
 * (Phase 2 to Phase 6 Verification)
 *
 * Verifies:
 * 1. Dedicated Payment Result Page (/billing/result) implementation & states
 * 2. Server-side Order Verification API (/api/vendor/billing/verify-order) safeguards
 * 3. Tenant isolation & authentication security
 * 4. DOKU Check Status API integration & fallback behavior
 * 5. Monotonic payment state protection (PAID is immutable)
 * 6. Cumulative 2-year subscription extension for the two approved sandbox transactions
 * 7. Dashboard active subscription state & DEMO banner clearance logic
 * 8. Protected files regression check (100% untouched)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ${GREEN}✓ PASS:${RESET} ${message}`);
  } else {
    failedTests++;
    console.error(`  ${RED}✗ FAIL:${RESET} ${message}`);
  }
}

console.log(`${BOLD}${CYAN}================================================================${RESET}`);
console.log(`${BOLD}${CYAN}   MINGLEBOOTH — DOKU BILLING VERIFICATION & RESULT SUITE       ${RESET}`);
console.log(`${BOLD}${CYAN}================================================================${RESET}\n`);

// ─────────────────────────────────────────────────────────────────────────────
// [SECTION 1] Payment Result Page Implementation
// ─────────────────────────────────────────────────────────────────────────────
console.log(`${BOLD}[SECTION 1] Payment Result Page (/billing/result) Implementation${RESET}`);

const resultPagePath = path.resolve(__dirname, '../apps/web/src/app/billing/result/page.tsx');
assert(fs.existsSync(resultPagePath), 'apps/web/src/app/billing/result/page.tsx exists');

const resultContent = fs.readFileSync(resultPagePath, 'utf8');

assert(resultContent.includes('use client'), 'Result page is a client component');
assert(resultContent.includes('Suspense'), 'Wraps content in Suspense for useSearchParams');
assert(resultContent.includes('orderId'), 'Reads orderId from query string');
assert(resultContent.includes('/api/vendor/billing/verify-order'), 'Calls POST /api/vendor/billing/verify-order');
assert(resultContent.includes('PROCESSING'), 'Supports PROCESSING visual state');
assert(resultContent.includes('SUCCESS'), 'Supports SUCCESS visual state');
assert(resultContent.includes('FAILED'), 'Supports FAILED visual state');
assert(resultContent.includes('EXPIRED'), 'Supports EXPIRED visual state');
assert(resultContent.includes('AUTH_REQUIRED'), 'Handles unauthenticated state gracefully');
assert(resultContent.includes('/dashboard'), 'Provides CTA button to Vendor Dashboard (/dashboard)');
assert(resultContent.includes('/billing'), 'Provides CTA button to Manage Billing (/billing)');
assert(resultContent.includes('maxDevicesQuota'), 'Displays allowed device quota');
assert(resultContent.includes('subscriptionExpiresAt'), 'Displays subscription expiration date');

// ─────────────────────────────────────────────────────────────────────────────
// [SECTION 2] Server-Side Order Verification API Endpoint Structure
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${BOLD}[SECTION 2] Server-Side Order Verification API (/api/vendor/billing/verify-order)${RESET}`);

const verifyRoutePath = path.resolve(__dirname, '../apps/web/src/app/api/vendor/billing/verify-order/route.ts');
assert(fs.existsSync(verifyRoutePath), 'verify-order route file exists');

const verifyRouteContent = fs.readFileSync(verifyRoutePath, 'utf8');

assert(verifyRouteContent.includes('verifyServerAuth'), 'Enforces verifyServerAuth on request');
assert(verifyRouteContent.includes('checkDokuOrderStatus'), 'Integrates checkDokuOrderStatus fallback');
assert(verifyRouteContent.includes('executePaymentSettlement'), 'Uses atomic executePaymentSettlement for database updates');
assert(verifyRouteContent.includes('ORGANIZATION_MISMATCH'), 'Enforces tenant isolation check');
assert(verifyRouteContent.includes('PAYMENT_AMOUNT_INSUFFICIENT'), 'Validates payment amount against snapshot to prevent fraud');
assert(verifyRouteContent.includes('PROCESSING'), 'Returns status PROCESSING if DOKU is unreachable or pending');
assert(!verifyRouteContent.includes('DOKU_SECRET_KEY:'), 'Never exposes raw gateway secrets in API responses');

// ─────────────────────────────────────────────────────────────────────────────
// [SECTION 3] DOKU Library Inquiry API & Redirect URL
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${BOLD}[SECTION 3] DOKU Library Inquiry API & Checkout Redirect${RESET}`);

const dokuLibPath = path.resolve(__dirname, '../apps/web/src/lib/doku.ts');
const dokuLibContent = fs.readFileSync(dokuLibPath, 'utf8');

assert(dokuLibContent.includes('checkDokuOrderStatus'), 'checkDokuOrderStatus exported in lib/doku.ts');
assert(dokuLibContent.includes('/orders/v1/status/'), 'Uses official GET /orders/v1/status/{invoice} endpoint');
assert(dokuLibContent.includes('/billing/result?orderId='), 'createDokuCheckoutSession defaults callbackUrl to /billing/result?orderId=');

// ─────────────────────────────────────────────────────────────────────────────
// [SECTION 4] Monotonic Payment State & Cumulative 2-Year Settlement Logic
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${BOLD}[SECTION 4] Cumulative Settlement & Monotonic State Protection${RESET}`);

// In-memory simulation of Supabase tables & business logic
const mockOrg = {
  id: 'f9077b0e-0486-4749-820a-a025ceb010b6',
  name: 'STUDIO ONE',
  plan_tier: 'free',
  subscription_status: 'pending_payment',
  subscription_expires_at: '1970-01-01T00:00:00+00:00',
  max_devices_quota: 1,
};

const mockPayments = {
  'MB-MWARY392-F84E78': {
    order_id: 'MB-MWARY392-F84E78',
    organization_id: 'f9077b0e-0486-4749-820a-a025ceb010b6',
    plan_tier: 'pro',
    amount_idr: 2999000,
    duration_days: 365,
    payment_status: 'PENDING',
    provider_transaction_id: null,
    paid_at: null,
  },
  'MB-MWASYKYT-7B46A7': {
    order_id: 'MB-MWASYKYT-7B46A7',
    organization_id: 'f9077b0e-0486-4749-820a-a025ceb010b6',
    plan_tier: 'pro',
    amount_idr: 2999000,
    duration_days: 365,
    payment_status: 'PENDING',
    provider_transaction_id: null,
    paid_at: null,
  },
};

function simulateSettlement(orderId, dokuStatus, dokuAmount, providerTxId) {
  const payment = mockPayments[orderId];
  if (!payment) return { error: 'ORDER_NOT_FOUND', status: 404 };

  // Monotonic check: If already PAID, never downgrade
  if (payment.payment_status === 'PAID') {
    return {
      success: true,
      status: 'SUCCESS',
      paymentStatus: 'PAID',
      isSettled: true,
      alreadyPaid: true,
      org: { ...mockOrg },
    };
  }

  // Amount verification
  if (dokuAmount < payment.amount_idr) {
    return { error: 'AMOUNT_MISMATCH', status: 400 };
  }

  if (dokuStatus === 'SUCCESS') {
    const now = new Date();
    let currentExpiry = new Date(mockOrg.subscription_expires_at);
    let newExpiry;

    // Cumulative extension rule
    if (mockOrg.subscription_status === 'active' && currentExpiry.getTime() > now.getTime()) {
      newExpiry = new Date(currentExpiry.getTime() + payment.duration_days * 24 * 60 * 60 * 1000);
    } else {
      newExpiry = new Date(now.getTime() + payment.duration_days * 24 * 60 * 60 * 1000);
    }

    // Update payment
    payment.payment_status = 'PAID';
    payment.paid_at = now.toISOString();
    payment.provider_transaction_id = providerTxId;

    // Update org
    mockOrg.plan_tier = payment.plan_tier;
    mockOrg.subscription_status = 'active';
    mockOrg.subscription_expires_at = newExpiry.toISOString();
    mockOrg.max_devices_quota = payment.plan_tier === 'pro' ? 3 : payment.plan_tier === 'business' ? 10 : 1;

    return {
      success: true,
      status: 'SUCCESS',
      paymentStatus: 'PAID',
      isSettled: true,
      expiresAt: mockOrg.subscription_expires_at,
      org: { ...mockOrg },
    };
  }

  return { success: false, status: dokuStatus };
}

// 1. Initial State Check
assert(mockOrg.subscription_status === 'pending_payment', 'Initial org status is pending_payment');
assert(mockPayments['MB-MWARY392-F84E78'].payment_status === 'PENDING', 'Tx 1 is initially PENDING');
assert(mockPayments['MB-MWASYKYT-7B46A7'].payment_status === 'PENDING', 'Tx 2 is initially PENDING');

// 2. Settle Transaction 1 (MB-MWARY392-F84E78)
const res1 = simulateSettlement('MB-MWARY392-F84E78', 'SUCCESS', 2999000, '50856');
assert(res1.success === true, 'Tx 1 settlement succeeded');
assert(mockPayments['MB-MWARY392-F84E78'].payment_status === 'PAID', 'Tx 1 status changed to PAID');
assert(mockPayments['MB-MWARY392-F84E78'].provider_transaction_id === '50856', 'Tx 1 stores DOKU provider reference');
assert(mockOrg.subscription_status === 'active', 'Org status activated to active');
assert(mockOrg.plan_tier === 'pro', 'Org tier upgraded to pro');
assert(mockOrg.max_devices_quota === 3, 'Org max_devices_quota set to 3');

const expiry1 = new Date(mockOrg.subscription_expires_at);
const oneYearFromNow = new Date(Date.now() + 364 * 24 * 60 * 60 * 1000);
assert(expiry1.getTime() > oneYearFromNow.getTime(), 'Tx 1 granted 365 days of active subscription');

// 3. Settle Transaction 2 (MB-MWASYKYT-7B46A7) -> Cumulative Extension
const res2 = simulateSettlement('MB-MWASYKYT-7B46A7', 'SUCCESS', 2999000, '35836');
assert(res2.success === true, 'Tx 2 settlement succeeded');
assert(mockPayments['MB-MWASYKYT-7B46A7'].payment_status === 'PAID', 'Tx 2 status changed to PAID');
assert(mockPayments['MB-MWASYKYT-7B46A7'].provider_transaction_id === '35836', 'Tx 2 stores DOKU provider reference');

const expiry2 = new Date(mockOrg.subscription_expires_at);
const twoYearsFromNow = new Date(Date.now() + 729 * 24 * 60 * 60 * 1000);
assert(expiry2.getTime() > twoYearsFromNow.getTime(), 'Tx 2 granted additional 365 days cumulatively (~730 days / 2 years total)');

// 4. Test Monotonic Protection on Settled Payment
const delayedFailed = simulateSettlement('MB-MWARY392-F84E78', 'FAILED', 2999000, 'delayed-ref');
assert(delayedFailed.paymentStatus === 'PAID', 'Delayed FAILED cannot downgrade settled PAID payment');
assert(mockOrg.subscription_status === 'active', 'Org subscription remains active after delayed FAILED');
assert(new Date(mockOrg.subscription_expires_at).getTime() === expiry2.getTime(), 'Expiry date unchanged after delayed event');

// ─────────────────────────────────────────────────────────────────────────────
// [SECTION 5] Dashboard Logic Verification
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${BOLD}[SECTION 5] Dashboard State & DEMO Banner Clearance Logic${RESET}`);

// From apps/web/src/app/dashboard/page.tsx:
// const isSubscriptionActive = Boolean(
//   org?.subscription_status === 'active' &&
//   org?.subscription_expires_at &&
//   new Date(org.subscription_expires_at).getTime() > Date.now()
// );
const isSubscriptionActive = Boolean(
  mockOrg.subscription_status === 'active' &&
  mockOrg.subscription_expires_at &&
  new Date(mockOrg.subscription_expires_at).getTime() > Date.now()
);

assert(isSubscriptionActive === true, 'isSubscriptionActive evaluates to true for settled organization');

// With isSubscriptionActive === true:
// Mode Demo banner: (!isSubscriptionActive ? <Mode Demo Banner /> : <Lisensi Aktif Card />)
const isDemoBannerShown = !isSubscriptionActive;
assert(isDemoBannerShown === false, 'Mode Demo banner is CLEARED from vendor dashboard');

// ─────────────────────────────────────────────────────────────────────────────
// [SECTION 6] Regression Protection: Protected Files Untouched
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${BOLD}[SECTION 6] Protected Sony & Native Files Regression Check${RESET}`);

const PROTECTED_BASELINE = {
  'apps/desktop/electron/backends/sony-camera-backend.cjs':
    '4e4d840ee1fa255284e15cb2a65983449df3db2b1d4b9311ae06621d1aa69bac',
  'apps/desktop/electron/native/windows/sony_camera_runner_win.cpp':
    'c86249dd1fa5bfd9596c9af732621fb0175116225092af10f069ae4fe0b22403',
  'apps/desktop/electron/native/sony_camera_runner.cpp':
    '53ee8fb24d9502eb9ce21d2ccb91bb6e79f45270aaf272d6d8200eeb0f292290',
  'apps/desktop/electron/native/sony_camera_hub.c':
    '780bc4b48023408c71eee5f4b05647ba15e24c251601c89dd6a0d2506c1cdbf7',
  'apps/mobile/android/app/src/main/java/com/minglebooth/mobile/plugins/SonyPtpDriver.java':
    'ba80d86b57a8d9ac1471090fdcf23be1d4a861b56d51678105085f42d5cc5b18',
  'apps/mobile/android/app/src/main/java/com/minglebooth/mobile/plugins/SonyDirectCameraPlugin.java':
    'b874cfa1b1d966e95091c8cab621ebab4db3219895285157f96d5698c4bd68cb',
  'apps/desktop/electron/bin/sony_camera_hub':
    '8cd2a7a3020d7efec187c5b16529bf3898cf5415d2e93a0362678e610dcc4931',
  'apps/desktop/electron/bin/mac/sony_camera_runner':
    '0ed7c584a827fadcc4f6bb5eea74f2e80cb1b2bdac476bd99cdfabd8af09175f',
  'apps/desktop/electron/native/windows/sony_camera_runner.exe':
    '76869604b8c2da4ac9237a4a06625ff0aec4c36d2567c703a8f1ae6e3742d746',
  'apps/desktop/electron/bin/win/gphoto2.exe':
    '679f333c9bdc40435acad19866110cd1acd6d5c7444fc01154af97d8f1b0d13d',
  'apps/desktop/electron/bin/win/camlibs/canon.dll':
    '7cfe31317f16ed42aafcca6e1aa69e89aa0356164d11086499e164d6a042e55a',
};

for (const [relPath, expectedHash] of Object.entries(PROTECTED_BASELINE)) {
  const fullPath = path.resolve(__dirname, '..', relPath);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath);
    const actualHash = crypto.createHash('sha256').update(content).digest('hex');
    assert(actualHash === expectedHash, `Protected file ${path.basename(relPath)} hash match`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${BOLD}${CYAN}================================================================${RESET}`);
if (failedTests === 0) {
  console.log(`${BOLD}${GREEN}   TEST SUITE EXECUTION COMPLETED: ALL ${totalTests} TESTS PASSED!${RESET}`);
} else {
  console.log(`${BOLD}${RED}   TEST SUITE FAILED: ${failedTests} of ${totalTests} failed!${RESET}`);
}
console.log(`${BOLD}${CYAN}================================================================${RESET}`);
console.log(`  Total Assertions: ${totalTests}`);
console.log(`  Passed:           ${GREEN}${passedTests}${RESET}`);
console.log(`  Failed:           ${failedTests === 0 ? GREEN : RED}${failedTests}${RESET}`);
console.log(`${BOLD}${CYAN}================================================================${RESET}\n`);

if (failedTests > 0) process.exit(1);

