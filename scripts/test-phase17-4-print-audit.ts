/**
 * MINGLEBOOTH PHASE 17.4 — FINAL PRINT IPC & ENTITLEMENT AUDIT
 * Strictly read-only verification of print pathways, Electron IPC guards,
 * subscription verification, and camera runner integrity.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

interface AuditResult {
  title: string;
  passed: boolean;
  details: string;
}

const results: AuditResult[] = [];

function assert(condition: boolean, title: string, details: string) {
  results.push({
    title,
    passed: condition,
    details,
  });
}

function computeSha256(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

console.log('================================================================');
console.log('MINGLEBOOTH PHASE 17.4 — AUDIT JALUR CETAK & PRINT IPC ELECTRON');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// 1. Audit apps/desktop/electron/main.cjs
// -----------------------------------------------------------------------------
const mainCjsPath = path.resolve('apps/desktop/electron/main.cjs');
const mainCjsSrc = fs.readFileSync(mainCjsPath, 'utf8');

assert(
  mainCjsSrc.includes('verifyPrintEntitlement') && mainCjsSrc.includes("ipcMain.handle('printer:print-photo'"),
  '1.1 Electron Main Process Memiliki Handler & Guard Cetak Independen',
  'main.cjs mengimplementasikan verifyPrintEntitlement() yang dipanggil sebelum printer:print-photo memproses dokumen.'
);

assert(
  mainCjsSrc.includes("code: 'DEMO_MODE_BLOCKED'") &&
  mainCjsSrc.includes('payload.isDemo === true'),
  '1.2 Main Process Memvalidasi Payload Token (Bukan Hanya Renderer Flag)',
  'main.cjs mendekode token lisensi dan menolak cetak jika payload.isDemo === true tanpa mempercayai argumen renderer semata.'
);

assert(
  mainCjsSrc.includes("code: 'AUTH_REQUIRED'") &&
  mainCjsSrc.includes("code: 'LICENSE_INVALID'") &&
  mainCjsSrc.includes("code: 'SUBSCRIPTION_EXPIRED'") &&
  mainCjsSrc.includes("code: 'DEVICE_MISMATCH'"),
  '1.3 Pertahanan Ganda: Token Malformed, Expired, dan HWID Mismatch Diblokir',
  'main.cjs menangani seluruh kasus kegagalan lisensi (AUTH_REQUIRED, LICENSE_INVALID, SUBSCRIPTION_EXPIRED, DEVICE_MISMATCH).'
);

// -----------------------------------------------------------------------------
// 2. Audit apps/desktop/src/App.tsx
// -----------------------------------------------------------------------------
const appSrc = path.resolve('apps/desktop/src/App.tsx');
const appContent = fs.readFileSync(appSrc, 'utf8');

assert(
  appContent.includes('const handlePrintPhoto = () => {') &&
  appContent.includes("if (isDemoMode) {\n      showNotification('Fitur Cetak Foto tersedia setelah langganan aktif.', 'warning');\n      return;\n    }"),
  '2.1 Tombol Utama Review Screen Mengunci Cetak pada Mode Demo',
  'handlePrintPhoto() memeriksa isDemoMode dan langsung menghentikan proses sebelum memanggil electronAPI atau browser print.'
);

assert(
  appContent.includes("if (isDemoMode) {\n                        showNotification('Fitur Cetak Foto tersedia setelah langganan aktif.', 'warning');\n                        return;\n                      }") &&
  appContent.includes('if (isDemoMode) return;'),
  '2.2 Galeri Lightbox Mengunci Cetak pada Mode Demo',
  'Handler cetak galeri lightbox memeriksa isDemoMode dua kali dan menghentikan proses cetak foto original maupun composite.'
);

// -----------------------------------------------------------------------------
// 3. Audit apps/desktop/src/components/InstantResultModal.tsx
// -----------------------------------------------------------------------------
const modalPath = path.resolve('apps/desktop/src/components/InstantResultModal.tsx');
const modalSrc = fs.readFileSync(modalPath, 'utf8');

assert(
  modalSrc.includes('if (isDemoMode) {') &&
  modalSrc.includes("setPrintBlockedNotice('Fitur Cetak Foto tersedia setelah langganan aktif.');") &&
  modalSrc.includes('return;'),
  '3.1 Modal Hasil Instan Mengunci Handler Cetak pada Mode Demo',
  'Tombol cetak di InstantResultModal menghentikan proses dan tidak mengeksekusi printPhoto maupun browser print fallback saat isDemoMode.'
);

assert(
  modalSrc.includes('bg-amber-500/10') &&
  modalSrc.includes('cursor-not-allowed') &&
  modalSrc.includes('Cetak Terkunci (Demo)'),
  '3.2 Tombol Cetak di InstantResultModal Menampilkan Indikator Visual Terkunci',
  'UI tombol cetak diwarnai amber dengan kursor not-allowed dan badge terkunci saat aplikasi berada di mode demo.'
);

// -----------------------------------------------------------------------------
// 4. Simulasi Kriptografis / Logic Test verifyPrintEntitlement
// -----------------------------------------------------------------------------
function simulateVerifyPrintEntitlement(options: {
  licenseToken?: string | null;
  windowIsDemo?: boolean;
  currentHwid?: string;
}) {
  const { licenseToken, windowIsDemo = false, currentHwid = 'HWID-TEST-123' } = options;

  if (windowIsDemo) {
    return {
      allowed: false,
      code: 'DEMO_MODE_BLOCKED',
      error: 'Fitur Cetak Foto tersedia setelah langganan aktif.',
    };
  }

  if (!licenseToken || typeof licenseToken !== 'string') {
    return {
      allowed: false,
      code: 'AUTH_REQUIRED',
      error: 'Fitur Cetak Foto memerlukan autentikasi lisensi vendor aktif.',
    };
  }

  let parsed: any;
  try {
    const jsonStr = Buffer.from(licenseToken, 'base64').toString('utf8');
    parsed = JSON.parse(jsonStr);
  } catch {
    return {
      allowed: false,
      code: 'LICENSE_INVALID',
      error: 'Format lisensi tidak valid (LICENSE_INVALID).',
    };
  }

  const payload = parsed?.payload;
  if (!payload || typeof payload !== 'object') {
    return {
      allowed: false,
      code: 'LICENSE_INVALID',
      error: 'Struktur data lisensi rusak.',
    };
  }

  if (payload.isDemo === true) {
    return {
      allowed: false,
      code: 'DEMO_MODE_BLOCKED',
      error: 'Fitur Cetak Foto tersedia setelah langganan aktif.',
    };
  }

  const expiresAtStr = payload.expiresAt || payload.validUntil;
  if (expiresAtStr) {
    const expiryMs = new Date(expiresAtStr).getTime();
    if (!isNaN(expiryMs)) {
      const gracePeriodDays = payload.offlineGracePeriodDays || 7;
      const gracePeriodMs = gracePeriodDays * 24 * 60 * 60 * 1000;
      if (Date.now() > expiryMs + gracePeriodMs) {
        return {
          allowed: false,
          code: 'SUBSCRIPTION_EXPIRED',
          error: 'Masa aktif langganan telah berakhir. Cetak diblokir.',
        };
      }
    }
  }

  const tokenHwid = payload.hwid || payload.hardwareFingerprint;
  if (tokenHwid && tokenHwid !== currentHwid) {
    return {
      allowed: false,
      code: 'DEVICE_MISMATCH',
      error: 'Lisensi ini terdaftar untuk perangkat lain (DEVICE_MISMATCH).',
    };
  }

  return { allowed: true, payload };
}

// Scenario 1: Demo Token
const demoToken = Buffer.from(JSON.stringify({
  payload: { orgId: 'org-demo', isDemo: true, expiresAt: new Date(Date.now() + 86400000).toISOString() },
  sig: 'dummy_sig',
})).toString('base64');
const resDemo = simulateVerifyPrintEntitlement({ licenseToken: demoToken });
assert(resDemo.allowed === false && resDemo.code === 'DEMO_MODE_BLOCKED',
  '4.1 Simulasi: Token Demo Ditolak (DEMO_MODE_BLOCKED)',
  `Hasil: allowed=${resDemo.allowed}, code=${resDemo.code}`
);

// Scenario 2: Tampered options { isDemo: false } with Demo Token
const resDemoTamper = simulateVerifyPrintEntitlement({ licenseToken: demoToken, windowIsDemo: false });
assert(resDemoTamper.allowed === false && resDemoTamper.code === 'DEMO_MODE_BLOCKED',
  '4.2 Simulasi: Tampered Options Mengklaim Non-Demo Tetap Ditolak oleh Token Payload',
  `Hasil: allowed=${resDemoTamper.allowed}, code=${resDemoTamper.code}`
);

// Scenario 3: Anonymous / Tanpa Token
const resNoToken = simulateVerifyPrintEntitlement({ licenseToken: null });
assert(resNoToken.allowed === false && resNoToken.code === 'AUTH_REQUIRED',
  '4.3 Simulasi: Pemanggilan Tanpa Token Ditolak (AUTH_REQUIRED)',
  `Hasil: allowed=${resNoToken.allowed}, code=${resNoToken.code}`
);

// Scenario 4: Token Kedaluwarsa Lewat Grace Period
const expiredToken = Buffer.from(JSON.stringify({
  payload: {
    orgId: 'org-paid',
    isDemo: false,
    expiresAt: new Date(Date.now() - 30 * 86400000).toISOString(), // 30 days ago
    offlineGracePeriodDays: 7,
    hwid: 'HWID-TEST-123',
  },
  sig: 'dummy_sig',
})).toString('base64');
const resExpired = simulateVerifyPrintEntitlement({ licenseToken: expiredToken });
assert(resExpired.allowed === false && resExpired.code === 'SUBSCRIPTION_EXPIRED',
  '4.4 Simulasi: Token Berlangganan Kedaluwarsa Ditolak (SUBSCRIPTION_EXPIRED)',
  `Hasil: allowed=${resExpired.allowed}, code=${resExpired.code}`
);

// Scenario 5: HWID Mismatch
const mismatchToken = Buffer.from(JSON.stringify({
  payload: {
    orgId: 'org-paid',
    isDemo: false,
    expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    hwid: 'HWID-OTHER-COMPUTER',
  },
  sig: 'dummy_sig',
})).toString('base64');
const resMismatch = simulateVerifyPrintEntitlement({ licenseToken: mismatchToken, currentHwid: 'HWID-THIS-COMPUTER' });
assert(resMismatch.allowed === false && resMismatch.code === 'DEVICE_MISMATCH',
  '4.5 Simulasi: Lisensi Terdaftar di Perangkat Lain Ditolak (DEVICE_MISMATCH)',
  `Hasil: allowed=${resMismatch.allowed}, code=${resMismatch.code}`
);

// Scenario 6: Akun Berlangganan Aktif Sah
const activeToken = Buffer.from(JSON.stringify({
  payload: {
    orgId: 'org-pro-123',
    planTier: 'pro',
    isDemo: false,
    expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(), // 30 days ahead
    hwid: 'HWID-MY-LAPTOP',
  },
  sig: 'valid_sig_from_server',
})).toString('base64');
const resActive = simulateVerifyPrintEntitlement({ licenseToken: activeToken, currentHwid: 'HWID-MY-LAPTOP' });
assert(resActive.allowed === true && resActive.payload.planTier === 'pro',
  '4.6 Simulasi: Akun Berlangganan Aktif Berhasil Diizinkan Mencetak',
  `Hasil: allowed=${resActive.allowed}, planTier=${resActive.payload?.planTier}`
);

// -----------------------------------------------------------------------------
// 5. Integritas Binary Sony Camera Runner & Kuota Perangkat
// -----------------------------------------------------------------------------
const macRunnerPath = path.resolve('apps/desktop/electron/bin/mac/sony_camera_runner');
const winRunnerPath = path.resolve('apps/desktop/electron/native/windows/sony_camera_runner_win.exe');

const EXPECTED_MAC_HASH = '0ed7c584a827fadcc4f6bb5eea74f2e80cb1b2bdac476bd99cdfabd8af09175f';
const EXPECTED_WIN_HASH = '76869604b8c2da4ac9237a4a06625ff0aec4c36d2567c703a8f1ae6e3742d746';

const macHash = fs.existsSync(macRunnerPath) ? computeSha256(macRunnerPath) : '';
const winHash = fs.existsSync(winRunnerPath) ? computeSha256(winRunnerPath) : '';

assert(macHash === EXPECTED_MAC_HASH, '5.1 Integritas Binary macOS Sony Camera Runner Terjaga (SHA-256)', `Hash: ${macHash}`);
assert(winHash === EXPECTED_WIN_HASH, '5.2 Integritas Binary Windows Sony Camera Runner Terjaga (SHA-256)', `Hash: ${winHash}`);

// Pipeline & Quota check
const billingSettlementPath = path.resolve('apps/web/src/lib/billing-settlement.ts');
const billingSrc = fs.readFileSync(billingSettlementPath, 'utf8');
const pricingPath = path.resolve('apps/web/src/lib/pricing.ts');
const pricingSrc = fs.readFileSync(pricingPath, 'utf8');

assert(
  billingSrc.includes("effectivePlan === 'business' ? 10 : (effectivePlan === 'starter' ? 1 : 3)") &&
  pricingSrc.includes('maxDevicesQuota: 1') &&
  pricingSrc.includes('maxDevicesQuota: 3') &&
  pricingSrc.includes('maxDevicesQuota: 10'),
  '5.3 Kuota Perangkat Tidak Berubah (Starter: 1, Pro: 3, Business: 10)',
  'Plan limits tetap Starter 1, Pro 3, Business 10.'
);

// -----------------------------------------------------------------------------
// 6. Ringkasan Hasil
// -----------------------------------------------------------------------------
let allPass = true;
results.forEach((r, idx) => {
  const statusStr = r.passed ? '[PASS]' : '[FAIL]';
  if (!r.passed) allPass = false;
  console.log(`${idx + 1}. ${statusStr} ${r.title}`);
  console.log(`   Bukti/Detail: ${r.details}\n`);
});

console.log('----------------------------------------------------------------');
const passCount = results.filter(r => r.passed).length;
const failCount = results.filter(r => !r.passed).length;
console.log(`TOTAL AUDIT POINTS: ${results.length} | PASS: ${passCount} | FAIL: ${failCount}`);
console.log('----------------------------------------------------------------\n');

if (!allPass) {
  process.exit(1);
} else {
  process.exit(0);
}
