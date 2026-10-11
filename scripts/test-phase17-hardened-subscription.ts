import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function assert(name: string, condition: boolean, details: string) {
  results.push({
    name,
    passed: condition,
    details,
  });
}

const rootDir = process.cwd();

// 1. Sony Camera Runner Checksums
const macRunnerPath = path.join(rootDir, 'apps/desktop/electron/bin/mac/sony_camera_runner');
const winRunnerPath = path.join(rootDir, 'apps/desktop/electron/native/windows/sony_camera_runner_win.exe');

const EXPECTED_MAC_SHA = '0ed7c584a827fadcc4f6bb5eea74f2e80cb1b2bdac476bd99cdfabd8af09175f';
const EXPECTED_WIN_SHA = '76869604b8c2da4ac9237a4a06625ff0aec4c36d2567c703a8f1ae6e3742d746';

const macHash = crypto.createHash('sha256').update(fs.readFileSync(macRunnerPath)).digest('hex');
const winHash = crypto.createHash('sha256').update(fs.readFileSync(winRunnerPath)).digest('hex');

assert(
  'Sony Camera Runner (macOS) SHA-256 Intact',
  macHash === EXPECTED_MAC_SHA,
  `Expected: ${EXPECTED_MAC_SHA}, Got: ${macHash}`
);

assert(
  'Sony Camera Runner (Windows) SHA-256 Intact',
  winHash === EXPECTED_WIN_SHA,
  `Expected: ${EXPECTED_WIN_SHA}, Got: ${winHash}`
);

// 2. Server-side Gate: upload-capture
const uploadCapturePath = path.join(rootDir, 'apps/web/src/app/api/sync/upload-capture/route.ts');
const uploadCaptureContent = fs.readFileSync(uploadCapturePath, 'utf8');

assert(
  'Server Gate: upload-capture requires server auth',
  uploadCaptureContent.includes('const auth = await verifyServerAuth(req);') &&
    uploadCaptureContent.includes('AUTH_REQUIRED'),
  'upload-capture strictly requires authentication token'
);

assert(
  'Server Gate: upload-capture blocks demo mode tokens',
  uploadCaptureContent.includes('auth.payload?.isDemo') &&
    uploadCaptureContent.includes('DEMO_MODE_BLOCKED'),
  'upload-capture rejects demo tokens with 403 DEMO_MODE_BLOCKED'
);

assert(
  'Server Gate: upload-capture verifies authoritative subscription in database',
  uploadCaptureContent.includes('subscription_status, subscription_expires_at') &&
    uploadCaptureContent.includes('SUBSCRIPTION_REQUIRED'),
  'upload-capture strictly checks active subscription status and expiry date in organizations table'
);

assert(
  'Server Gate: upload-capture strictly verifies event tenant ownership',
  uploadCaptureContent.includes('matchedEvt.organization_id !== validOrgId') &&
    uploadCaptureContent.includes('ORG_ACCESS_DENIED'),
  'upload-capture blocks cross-tenant event uploads'
);

// 3. Server-side Gate: events route
const eventsRoutePath = path.join(rootDir, 'apps/web/src/app/api/vendor/events/route.ts');
const eventsRouteContent = fs.readFileSync(eventsRoutePath, 'utf8');

assert(
  'Server Gate: POST events blocks demo mode tokens',
  eventsRouteContent.includes('auth.payload?.isDemo') &&
    eventsRouteContent.includes('DEMO_MODE_BLOCKED'),
  'POST /api/vendor/events rejects demo tokens with 403 DEMO_MODE_BLOCKED'
);

assert(
  'Server Gate: POST events verifies authoritative subscription in database',
  eventsRouteContent.includes('subscription_status, subscription_expires_at') &&
    eventsRouteContent.includes('SUBSCRIPTION_REQUIRED'),
  'POST /api/vendor/events checks active subscription before inserting new event'
);

// 4. Server-side Gate: templates route
const templatesRoutePath = path.join(rootDir, 'apps/web/src/app/api/vendor/templates/route.ts');
const templatesRouteContent = fs.readFileSync(templatesRoutePath, 'utf8');

assert(
  'Server Gate: POST templates blocks demo mode tokens',
  templatesRouteContent.includes('auth.payload?.isDemo') &&
    templatesRouteContent.includes('DEMO_MODE_BLOCKED'),
  'POST /api/vendor/templates rejects demo tokens with 403 DEMO_MODE_BLOCKED'
);

assert(
  'Server Gate: POST templates verifies authoritative subscription in database',
  templatesRouteContent.includes('subscription_status, subscription_expires_at') &&
    templatesRouteContent.includes('SUBSCRIPTION_REQUIRED'),
  'POST /api/vendor/templates checks active subscription before creating custom template'
);

// 5. Desktop App: Print Lock and Watermark
const appTsxPath = path.join(rootDir, 'apps/desktop/src/App.tsx');
const appTsxContent = fs.readFileSync(appTsxPath, 'utf8');

assert(
  'Desktop App: handlePrintPhoto blocked during demo',
  appTsxContent.includes('if (isDemoMode) {') &&
    appTsxContent.includes('Fitur Cetak Foto tersedia setelah langganan aktif.'),
  'Physical printing blocked in demo mode with informative user message'
);

assert(
  'Desktop App: Visual watermark applied in review screen during demo',
  appTsxContent.includes('MINGLEBOOTH DEMO • CETAK TERKUNCI') &&
    appTsxContent.includes('isDemoMode && ('),
  'Review screen renders visual overlay watermark when demo mode is active'
);

assert(
  'Desktop App: Print button styled as locked during demo',
  appTsxContent.includes('Cetak Terkunci (Demo)') &&
    appTsxContent.includes('bg-neutral-800 text-neutral-400'),
  'Print button indicates locked status with appropriate styling'
);

// 6. Device Quota and Settlement Rules Invariant
const settlementPath = path.join(rootDir, 'apps/web/src/lib/billing-settlement.ts');
const webRegisterPath = path.join(rootDir, 'apps/web/src/app/api/auth/web-register/route.ts');
const vendorLoginPath = path.join(rootDir, 'apps/web/src/app/api/auth/vendor-login/route.ts');
const settlementContent = fs.readFileSync(settlementPath, 'utf8');
const webRegisterContent = fs.readFileSync(webRegisterPath, 'utf8');
const vendorLoginContent = fs.readFileSync(vendorLoginPath, 'utf8');

assert(
  'Device Quota Rules Invariant: Starter 1, Pro 3, Business 10',
  settlementContent.includes("effectivePlan === 'business' ? 10 : (effectivePlan === 'starter' ? 1 : 3)") &&
    webRegisterContent.includes('starter: 1') &&
    webRegisterContent.includes('pro: 3') &&
    webRegisterContent.includes('business: 10'),
  'Device quotas strictly Starter 1, Pro 3, Business 10'
);

assert(
  'Vendor Login: Demo account does not consume quota',
  vendorLoginContent.includes('maxDevices: 0') &&
    vendorLoginContent.includes('activeDevicesCount: 0') &&
    vendorLoginContent.includes('isDemo: true'),
  'Unpaid accounts receive 0 quota and do not register active device'
);

// 7. Preview Mutation Guard Invariant
const previewGuardPath = path.join(rootDir, 'apps/web/src/lib/preview-guard.ts');
const previewGuardContent = fs.readFileSync(previewGuardPath, 'utf8');

assert(
  'Preview Guard Intact',
  previewGuardContent.includes('export function isPreviewDeployment()') &&
    previewGuardContent.includes('PREVIEW_MUTATION_BLOCKED'),
  'Preview protection guard remains functional'
);

console.log('\n======================================================');
console.log('PHASE 17 — HARDENED DEMO & SUBSCRIPTION GATE AUDIT');
console.log('======================================================\n');

let allPassed = true;
results.forEach((r, idx) => {
  const status = r.passed ? '✓ PASS' : '✗ FAIL';
  if (!r.passed) allPassed = false;
  console.log(`${idx + 1}. [${status}] ${r.name}`);
  console.log(`   Details: ${r.details}\n`);
});

console.log('======================================================');
console.log(`Summary: ${results.filter((r) => r.passed).length}/${results.length} tests passed.`);
console.log(`Overall Status: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
console.log('======================================================\n');

if (!allPassed) {
  process.exit(1);
}
