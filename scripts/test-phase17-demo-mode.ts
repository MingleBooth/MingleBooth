import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

function computeSha256(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function runVerification() {
  console.log('====================================================');
  console.log('MINGLEBOOTH PHASE 17 — DEMO MODE & SUBSCRIPTION GATE VERIFICATION');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      if (detail) console.error(`       Detail: ${detail}`);
      failed++;
    }
  }

  // 1. Sony Camera Runner Binary Hash Integrity
  const macRunnerPath = path.resolve('apps/desktop/electron/bin/mac/sony_camera_runner');
  const winRunnerPath = path.resolve('apps/desktop/electron/native/windows/sony_camera_runner_win.exe');

  const EXPECTED_MAC_HASH = '0ed7c584a827fadcc4f6bb5eea74f2e80cb1b2bdac476bd99cdfabd8af09175f';
  const EXPECTED_WIN_HASH = '76869604b8c2da4ac9237a4a06625ff0aec4c36d2567c703a8f1ae6e3742d746';

  const macHash = fs.existsSync(macRunnerPath) ? computeSha256(macRunnerPath) : '';
  const winHash = fs.existsSync(winRunnerPath) ? computeSha256(winRunnerPath) : '';

  assert(macHash === EXPECTED_MAC_HASH, 'macOS Camera Runner SHA256 integrity maintained', `Got: ${macHash}`);
  assert(winHash === EXPECTED_WIN_HASH, 'Windows Camera Runner SHA256 integrity maintained', `Got: ${winHash}`);

  // 2. Desktop Auth Gate Verification
  const authGatePath = path.resolve('apps/desktop/src/components/VendorAuthGate.tsx');
  const authGateSrc = fs.readFileSync(authGatePath, 'utf8');
  assert(!authGateSrc.includes('Coba Demo (Mode Pengujian)'), 'VendorAuthGate has removed anonymous demo bypass button');
  assert(authGateSrc.includes('handleLogin') && authGateSrc.includes('api/auth/vendor-login'), 'VendorAuthGate enforces authentic vendor login');
  assert(!authGateSrc.includes('mock_token_for_demo'), 'VendorAuthGate does not issue false auth tokens for demo');

  // 3. Desktop App Data Isolation & Demo Hardening
  const appSrc = fs.readFileSync(path.resolve('apps/desktop/src/App.tsx'), 'utf8');
  assert(appSrc.includes('DEMO MODE') || appSrc.includes('MODE DEMO'), 'App.tsx contains persistent Demo Mode badge');
  assert(appSrc.includes('data/demo'), 'App.tsx points demo storage directory to isolated data/demo folder');
  assert(appSrc.includes('if (isDemoMode)'), 'App.tsx gates upload-capture to prevent any cloud writes during demo');
  assert(appSrc.includes('clearDemoCaptures'), 'App.tsx contains clean-up logic for demo captures');
  assert(appSrc.includes('Aktifkan Langganan'), 'App.tsx includes Aktifkan Langganan button linking to billing');

  // 4. Desktop Offline Storage Isolation
  const offlineStorageSrc = fs.readFileSync(path.resolve('apps/desktop/src/lib/offlineStorage.ts'), 'utf8');
  assert(offlineStorageSrc.includes('isDemo?: boolean'), 'OfflineCaptureItem supports isDemo isolation property');
  assert(offlineStorageSrc.includes('!item.isDemo'), 'getPendingOfflineCaptures filters out demo captures from cloud queue');

  // 5. Web Landing Page Routing Alignment
  const webPageSrc = fs.readFileSync(path.resolve('apps/web/src/app/page.tsx'), 'utf8');
  assert(webPageSrc.includes("demoTarget = user ? '/dashboard' : '/register'"), 'Landing page routes Coba Demo based on auth session');
  assert(webPageSrc.includes("downloadTarget = user ? '/dashboard' : '/register'"), 'Landing page routes Unduh Aplikasi based on auth session');
  assert(!webPageSrc.includes('href="#demo-mode"') || webPageSrc.indexOf('href="#demo-mode"') === -1, 'Landing page does not have dummy #demo-mode scroll link in nav/hero');

  // 6. Web Register Flow (Instant Onboarding)
  const registerSrc = fs.readFileSync(path.resolve('apps/web/src/app/register/page.tsx'), 'utf8');
  assert(registerSrc.includes('/dashboard?welcome=1'), 'Registration automatically redirects to Dashboard onboarding');
  assert(registerSrc.includes("localStorage.setItem('mb_web_user'"), 'Registration stores auth session in localStorage');

  // 7. Web Dashboard Studio Download & Subscription Status Card
  const dashboardSrc = fs.readFileSync(path.resolve('apps/web/src/app/dashboard/page.tsx'), 'utf8');
  assert(dashboardSrc.includes('Unduh MingleBooth Studio Desktop'), 'Dashboard features dedicated MingleBooth Studio card');
  assert(dashboardSrc.includes('Mode Demo • Belum Berlangganan'), 'Dashboard shows authoritative Mode Demo badge for unpaid accounts');
  assert(dashboardSrc.includes('Unduh Windows (.exe)'), 'Dashboard provides direct Windows installer download button');
  assert(dashboardSrc.includes('Unduh Mac (.dmg)'), 'Dashboard provides direct Mac installer download button');

  // 8. Dedicated Tablet / Download Route Protection
  const tabletSrc = fs.readFileSync(path.resolve('apps/web/src/app/tablet/page.tsx'), 'utf8');
  assert(tabletSrc.includes('Buat Akun Vendor Gratis Terlebih Dahulu'), 'Download route gates unauthenticated users with registration requirement');
  assert(tabletSrc.includes('Kembali ke Dashboard'), 'Download route redirects authenticated vendors back to dashboard');

  // 9. Pricing & Device Quota Invariant (Starter 1, Pro 3, Business 10)
  const billingSrc = fs.readFileSync(path.resolve('apps/web/src/app/billing/page.tsx'), 'utf8');
  assert(billingSrc.includes('1 Perangkat Booth'), 'Starter quota remains strictly 1 device');
  assert(billingSrc.includes('3 Perangkat Booth'), 'Pro quota remains strictly 3 devices');
  assert(billingSrc.includes('10 Perangkat Booth'), 'Business quota remains strictly 10 devices');

  console.log('\n----------------------------------------------------');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('----------------------------------------------------');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error('Verification error:', err);
  process.exit(1);
});
