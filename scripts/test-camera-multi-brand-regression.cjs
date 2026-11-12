/**
 * scripts/test-camera-multi-brand-regression.cjs
 * Automated Regression Test for Universal Multi-Brand Camera Integration (Sony & Canon)
 *
 * Verifies:
 * 1. Strict SHA-256 integrity of all protected Sony files and native binaries.
 * 2. Proper identification and taxonomy of camera profiles (Sony vs Canon).
 * 3. Backend factory routing (SonyCameraBackend vs CanonCameraBackend).
 * 4. CanonCameraBackend initialization, capability detection, and safe execution.
 * 5. NativeCameraService routing logic separation.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// ── 1. Baseline SHA-256 Hashes of Protected Sony Files ──
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

function sha256(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

console.log('================================================================');
console.log(' MINGLEBOOTH MULTI-BRAND CAMERA REGRESSION TEST (SONY & CANON)');
console.log('================================================================\n');

// ── TEST 1: Protected File Integrity ──
console.log('[TEST 1] Verifying SHA-256 of protected Sony files & native binaries...');
let integrityPassed = true;
for (const [relPath, expectedHash] of Object.entries(PROTECTED_BASELINE)) {
  const fullPath = path.resolve(__dirname, '..', relPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`  ❌ Missing protected file: ${relPath}`);
    integrityPassed = false;
    continue;
  }
  const actualHash = sha256(fullPath);
  if (actualHash !== expectedHash) {
    console.error(`  ❌ CHECKSUM MISMATCH: ${relPath}`);
    console.error(`     Expected: ${expectedHash}`);
    console.error(`     Actual:   ${actualHash}`);
    integrityPassed = false;
  } else {
    console.log(`  ✅ Verified intact: ${path.basename(relPath)} (${actualHash.substring(0, 12)}...)`);
  }
}
assert(integrityPassed, 'Integrity check failed: Protected Sony files have been altered!');
console.log('=> TEST 1 PASSED: All protected Sony files are 100% untouched.\n');

// ── TEST 2: Camera Profiles & Taxonomy Verification ──
console.log('[TEST 2] Testing camera identification and verification taxonomy...');
const {
  identifyCamera,
  VERIFICATION_STATUS,
  DRIVER_STRATEGY,
} = require('../apps/desktop/electron/camera-profiles/index.cjs');

// Test 2a: Sony α7C II
const sonyDev = identifyCamera('054C', '0E8C', 'ILCE-7CM2');
console.log(`  Sony identified: ${sonyDev.brand} ${sonyDev.model} -> Status: ${sonyDev.status}`);
assert.strictEqual(sonyDev.brand, 'Sony');
assert.strictEqual(sonyDev.model, 'ILCE-7CM2');
assert.strictEqual(sonyDev.backendType, 'sony-sdk');
assert.strictEqual(sonyDev.status, VERIFICATION_STATUS.VERIFIED);

// Test 2b: Canon EOS R6 (Supported PTP, but not physically tested on unit -> COMPATIBLE_UNTESTED)
const canonR6 = identifyCamera('04A9', '3293', 'Canon EOS R6');
console.log(`  Canon R6 identified: ${canonR6.brand} ${canonR6.model} -> Status: ${canonR6.status}`);
assert.strictEqual(canonR6.brand, 'Canon');
assert.strictEqual(canonR6.model, 'EOS R6');
assert.strictEqual(canonR6.backendType, 'canon-ptp');
assert.strictEqual(canonR6.status, VERIFICATION_STATUS.COMPATIBLE_UNTESTED);
assert.strictEqual(canonR6.capabilities.remoteCapture, true);
assert.strictEqual(canonR6.capabilities.liveView, true);

// Test 2c: Canon EOS 3000D (Partial Live View support)
const canon3000D = identifyCamera('04A9', '3282', 'Canon EOS 3000D');
console.log(`  Canon 3000D identified: ${canon3000D.brand} ${canon3000D.model} -> Status: ${canon3000D.status}`);
assert.strictEqual(canon3000D.status, VERIFICATION_STATUS.PARTIAL);
assert.strictEqual(canon3000D.capabilities.liveView, false);
assert.strictEqual(canon3000D.capabilities.remoteCapture, true);

// Test 2d: Unknown Canon Model (Fallback profile)
const canonUnknown = identifyCamera('04A9', '9999', 'Canon Custom Device');
console.log(`  Canon unknown device: ${canonUnknown.brand} ${canonUnknown.model} -> Status: ${canonUnknown.status}`);
assert.strictEqual(canonUnknown.brand, 'Canon');
assert.strictEqual(canonUnknown.status, VERIFICATION_STATUS.UNKNOWN);

console.log('=> TEST 2 PASSED: Camera identification & taxonomy follow strict verification rules.\n');

// ── TEST 3: Backend Factory Routing ──
console.log('[TEST 3] Testing backend factory routing...');
const {
  getBackendForProfile,
  SonyCameraBackend,
  CanonCameraBackend,
  GPhoto2Backend,
} = require('../apps/desktop/electron/backends/index.cjs');

const sonyBackend = getBackendForProfile(sonyDev);
console.log(`  Backend for Sony: ${sonyBackend.constructor.name}`);
assert(sonyBackend instanceof SonyCameraBackend);

const canonBackend = getBackendForProfile(canonR6);
console.log(`  Backend for Canon: ${canonBackend.constructor.name}`);
assert(canonBackend instanceof CanonCameraBackend);

const genericBackend = getBackendForProfile({ backendType: 'gphoto2' });
console.log(`  Backend for Generic: ${genericBackend.constructor.name}`);
assert(genericBackend instanceof GPhoto2Backend);

console.log('=> TEST 3 PASSED: Backend factory cleanly routes Sony, Canon, and generic PTP.\n');

// ── TEST 4: CanonCameraBackend Interface & Capabilities ──
console.log('[TEST 4] Testing CanonCameraBackend interface contract...');
assert.strictEqual(typeof canonBackend.detect, 'function');
assert.strictEqual(typeof canonBackend.connect, 'function');
assert.strictEqual(typeof canonBackend.disconnect, 'function');
assert.strictEqual(typeof canonBackend.capture, 'function');
assert.strictEqual(typeof canonBackend.startLiveView, 'function');
assert.strictEqual(typeof canonBackend.stopLiveView, 'function');
assert.strictEqual(typeof canonBackend.getStatus, 'function');
assert.strictEqual(typeof canonBackend.getCapabilities, 'function');

const capsR6 = canonBackend.getCapabilities(canonR6);
console.log('  Capabilities for EOS R6:', capsR6);
assert.strictEqual(capsR6.capture, true);
assert.strictEqual(capsR6.liveView, true);

const caps3000D = canonBackend.getCapabilities(canon3000D);
console.log('  Capabilities for EOS 3000D:', caps3000D);
assert.strictEqual(caps3000D.capture, true);
assert.strictEqual(caps3000D.liveView, false);

console.log('=> TEST 4 PASSED: CanonCameraBackend fulfills the universal interface.\n');

// ── TEST 5: NativeCameraService Routing Separation ──
console.log('[TEST 5] Testing NativeCameraService routing separation...');
const { NativeCameraService } = require('../apps/desktop/electron/native-camera.cjs');
const testTetherDir = path.join(__dirname, '../data/test-tether');
const service = new NativeCameraService(testTetherDir);

// Verify initial state
assert.strictEqual(service.sonyBackend, null);
assert.strictEqual(service.canonBackend, null);

// Test detectCameraCapabilities for Sony vs Canon
const sonyCapsReport = service.detectCameraCapabilities({ profile: sonyDev });
console.log('  Sony capability report:', sonyCapsReport.model, '| Mode required:', sonyCapsReport.usbModeRequired);
assert.strictEqual(sonyCapsReport.brand, 'Sony');
assert.strictEqual(sonyCapsReport.usbModeRequired, 'PC Remote');

const canonCapsReport = service.detectCameraCapabilities({ profile: canonR6 });
console.log('  Canon capability report:', canonCapsReport.model, '| Mode required:', canonCapsReport.usbModeRequired);
assert.strictEqual(canonCapsReport.brand, 'Canon');
assert.strictEqual(canonCapsReport.usbModeRequired, 'USB PTP (Matikan Wi-Fi kamera)');
assert.strictEqual(canonCapsReport.liveView, true);

const canon3000DCapsReport = service.detectCameraCapabilities({ profile: canon3000D });
console.log('  Canon 3000D capability report:', canon3000DCapsReport.model, '| LiveView:', canon3000DCapsReport.liveView);
assert.strictEqual(canon3000DCapsReport.liveView, false);

console.log('=> TEST 5 PASSED: NativeCameraService routes dynamically and preserves brand isolation.\n');

console.log('================================================================');
console.log(' ALL REGRESSION TESTS PASSED SUCCESSFULLY! (5/5)');
console.log('================================================================');

