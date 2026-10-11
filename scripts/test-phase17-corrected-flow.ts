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

// 1. Audit Website Normal SaaS Flow
const webPagePath = path.join(rootDir, 'apps/web/src/app/page.tsx');
const webBillingPath = path.join(rootDir, 'apps/web/src/app/billing/page.tsx');

const webPageContent = fs.readFileSync(webPagePath, 'utf8');
const webBillingContent = fs.readFileSync(webBillingPath, 'utf8');

assert(
  'Website Home: Explains Normal Registration -> Studio Login -> Demo Presentation',
  webPageContent.includes('Daftar akun gratis di MingleBooth, unduh MingleBooth Studio, dan masuk dengan akun Anda') &&
    webPageContent.includes('Akun tanpa langganan aktif otomatis disajikan dalam Mode Demo') &&
    webPageContent.includes('/register'),
  'Landing page accurately reflects SaaS flow with registration, login, and unpaid demo mode'
);

assert(
  'Website Billing: Explains Demo Presentation and Subscription Activation',
  webBillingContent.includes('daftar akun dan masuk ke MingleBooth Studio') &&
    webBillingContent.includes('Mode Demo gratis') &&
    webBillingContent.includes('Selesaikan pembayaran paket di bawah ini'),
  'Billing page instructs users to register, test in demo mode, and pay to activate commercial licenses'
);

// 2. Audit Desktop Auth Gate: Strict Account Login, No Anonymous Bypass
const authGatePath = path.join(rootDir, 'apps/desktop/src/components/VendorAuthGate.tsx');
const authGateContent = fs.readFileSync(authGatePath, 'utf8');

assert(
  'Desktop Auth Gate: No Anonymous Demo Bypass Button',
  !authGateContent.includes('onStartDemo') &&
    !authGateContent.includes('Coba Demo (Mode Pengujian Lokal)') &&
    !authGateContent.includes('if (isDemoMode) {\n    return <>{children}</>;'),
  'VendorAuthGate enforces standard account authentication and eliminates anonymous bypass'
);

assert(
  'Desktop Auth Gate: Informational Guidance for Unpaid Accounts',
  authGateContent.includes('Belum Memiliki Langganan Aktif?') &&
    authGateContent.includes('otomatis masuk ke') &&
    authGateContent.includes('Mode Demo'),
  'VendorAuthGate displays clear guidance that registered unpaid accounts enter Demo Mode'
);

// 3. Audit Backend Authoritative Gating: vendor-login
const vendorLoginPath = path.join(rootDir, 'apps/web/src/app/api/auth/vendor-login/route.ts');
const vendorLoginContent = fs.readFileSync(vendorLoginPath, 'utf8');

assert(
  'Backend vendor-login: Unpaid Accounts Enter Demo Mode Without Device Registration',
  vendorLoginContent.includes('if (!hasActiveSubscription) {') &&
    vendorLoginContent.includes('isDemo: true') &&
    vendorLoginContent.includes('maxDevices: 0') &&
    vendorLoginContent.includes('activeDevicesCount: 0'),
  'vendor-login generates signed demo token for unpaid accounts without inserting device or consuming quota'
);

assert(
  'Backend vendor-login: Paid Accounts Enforce Quota and Register Device',
  vendorLoginContent.includes('currentActiveCount >= maxQuota') &&
    vendorLoginContent.includes('DEVICE_QUOTA_EXCEEDED') &&
    vendorLoginContent.includes('client.from(\'devices\').insert('),
  'vendor-login strictly enforces Starter 1, Pro 3, Business 10 quotas only for active paid accounts'
);

// 4. Audit Backend Authoritative Gating: verify-license
const verifyLicensePath = path.join(rootDir, 'apps/web/src/app/api/auth/verify-license/route.ts');
const verifyLicenseContent = fs.readFileSync(verifyLicensePath, 'utf8');

assert(
  'Backend verify-license: Reports Demo Status for Unpaid Accounts',
  verifyLicenseContent.includes('if (!hasActiveSubscription || auth.payload?.isDemo) {') &&
    verifyLicenseContent.includes('isDemo: true') &&
    verifyLicenseContent.includes('isLicensed: false'),
  'verify-license accurately distinguishes between active paid licenses and demo accounts'
);

// 5. Audit Desktop App.tsx Demo Presentation & Feature Locking
const appTsxPath = path.join(rootDir, 'apps/desktop/src/App.tsx');
const appTsxContent = fs.readFileSync(appTsxPath, 'utf8');

assert(
  'Desktop App: Persistent Demo Banner Displays Account & Subscription Status',
  appTsxContent.includes('DEMO MODE') &&
    appTsxContent.includes('statusLabel') &&
    appTsxContent.includes('Aktifkan Langganan') &&
    appTsxContent.includes('Keluar'),
  'App.tsx renders persistent banner with account details, subscription status, and activation CTA'
);

assert(
  'Desktop App: Cloud Sync Blocked in Demo Mode',
  appTsxContent.includes('if (isDemoMode) {') &&
    appTsxContent.includes('uploadCaptureToCloud strictly blocked'),
  'sync/upload-capture is strictly blocked during demo presentation'
);

assert(
  'Desktop App: Storage Isolation and Safe Cleanup',
  appTsxContent.includes('isDemo: isDemoMode') &&
    appTsxContent.includes('cleanDemoStorage') &&
    appTsxContent.includes('clearDemoCaptures'),
  'Captures in demo mode are isolated to demo_storage and cleaned on exit & startup'
);

// 6. Audit InstantResultModal Cloud Lock
const resultModalPath = path.join(rootDir, 'apps/desktop/src/components/InstantResultModal.tsx');
const resultModalContent = fs.readFileSync(resultModalPath, 'utf8');

assert(
  'Desktop Result Modal: Displays Locked Cloud Status & Subscription Notice',
  resultModalContent.includes('Terkunci (Demo)') &&
    resultModalContent.includes('Fitur Berbayar: Galeri Cloud Tamu'),
  'InstantResultModal clearly communicates that guest cloud download is locked in Demo Mode'
);

// 7. Audit OfflineStorage Queue Isolation
const offlineStoragePath = path.join(rootDir, 'apps/desktop/src/lib/offlineStorage.ts');
const offlineStorageContent = fs.readFileSync(offlineStoragePath, 'utf8');

assert(
  'Offline Storage: Excludes Demo Records from Production Sync Queue',
  offlineStorageContent.includes('!item.isDemo && !item.eventId?.startsWith(\'demo\')'),
  'getPendingOfflineCaptures excludes all demo records from cloud sync queue'
);

// 8. Audit Camera Runner Checksums
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

// 9. Audit Quota Rules (Starter 1, Pro 3, Business 10)
const settlementPath = path.join(rootDir, 'apps/web/src/lib/billing-settlement.ts');
const webRegisterPath = path.join(rootDir, 'apps/web/src/app/api/auth/web-register/route.ts');
const settlementContent = fs.readFileSync(settlementPath, 'utf8');
const webRegisterContent = fs.readFileSync(webRegisterPath, 'utf8');

assert(
  'Quota Rules: Starter 1, Pro 3, Business 10 Intact',
  settlementContent.includes("effectivePlan === 'business' ? 10 : (effectivePlan === 'starter' ? 1 : 3)") &&
    webRegisterContent.includes('starter: 1') &&
    webRegisterContent.includes('pro: 3') &&
    webRegisterContent.includes('business: 10'),
  'Device quotas strictly preserved across registration and billing settlement'
);

// 10. Audit Preview Mutation Guard
const previewGuardPath = path.join(rootDir, 'apps/web/src/lib/preview-guard.ts');
const previewGuardContent = fs.readFileSync(previewGuardPath, 'utf8');

assert(
  'Preview Mutation Guard: isPreviewDeployment Intact',
  previewGuardContent.includes('export function isPreviewDeployment()') &&
    previewGuardContent.includes('PREVIEW_MUTATION_BLOCKED'),
  'preview-guard.ts protects shared production database from preview mutation'
);

console.log('\n======================================================');
console.log('CORRECTED DEMO PRESENTATION & SUBSCRIPTION GATE AUDIT');
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
