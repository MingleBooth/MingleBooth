#!/usr/bin/env node
/**
 * validate-camera-driver.cjs
 * Phase 2 Camera & Driver Validation Tool.
 *
 * Runs the experimental test matrix on a connected camera to determine whether
 * it can be fully controlled using the Windows Default Driver (WPD/MTP) in PC Remote / PTP mode,
 * WITHOUT WinUSB driver replacement.
 *
 * Test Sequence:
 *   1. DETECT (Hardware PnP & bundled gphoto2 --auto-detect)
 *   2. DRIVER AUDIT (Identifies assigned Windows driver service: wpdmtp vs WinUSB)
 *   3. CONNECT (PTP handshake via --summary)
 *   4. CAPTURE (Remote shutter trigger via --capture-image-and-download)
 *   5. DOWNLOAD (Validates photo integrity on disk)
 *
 * Usage:
 *   node scripts/validate-camera-driver.cjs
 */

const fs = require('fs');
const path = require('path');
const { execSync, execFile } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const WIN_BIN = path.join(ROOT, 'electron', 'bin', 'win');
const GPHOTO_EXE = path.join(WIN_BIN, 'gphoto2.exe');
const OUTPUT_DIR = path.join(ROOT, 'camera-test-output');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const env = {
  ...process.env,
  PATH: `${WIN_BIN};${process.env.PATH || ''}`,
  CAMLIBS: path.join(WIN_BIN, 'camlibs'),
  IOLIBS: path.join(WIN_BIN, 'iolibs'),
  LC_ALL: 'C',
  LANG: 'C',
};

async function runValidation() {
  console.log('====================================================');
  console.log('MingleBooth — Phase 2 Camera & Driver Validation');
  console.log('====================================================\n');
  console.log('Target: Validate camera control on Windows Default Driver');
  console.log('Platform:', process.platform, process.arch);
  console.log('Bundled Engine:', GPHOTO_EXE, fs.existsSync(GPHOTO_EXE) ? '✅ Present' : '❌ Missing');

  const report = {
    timestamp: new Date().toISOString(),
    platform: process.platform,
    cameraModel: null,
    usbModeRequired: null,
    windowsDriverAssigned: null,
    tests: {
      detect: false,
      connect: false,
      capture: false,
      download: false,
    },
    verdict: null,
    rawDetails: {},
  };

  if (process.platform !== 'win32') {
    console.log('\n⚠️  Notice: You are currently running on', process.platform);
    console.log('   Windows driver inspection (PnP/wpdmtp) is skipped.');
    console.log('   Running bundled engine CLI compatibility check...\n');
  } else {
    // ── STEP 1: Windows PnP Driver Audit ──
    console.log('\n[Step 1/5] Auditing Windows Device Manager for connected camera...');
    try {
      const psCommand = `
        Get-PnpDevice -PresentOnly | Where-Object { 
          $_.Class -in @('Camera','Image','WPD','USB') -and ($_.InstanceId -match 'VID_054C|VID_04A9|VID_04B0|VID_04DA') 
        } | Select-Object FriendlyName, InstanceId, Service, Class, Status | ConvertTo-Json
      `.replace(/\n/g, ' ');

      const out = execSync(`powershell -NoProfile -Command "${psCommand}"`, { encoding: 'utf8', timeout: 8000 });
      if (out && out.trim()) {
        const pnp = JSON.parse(out.trim());
        const dev = Array.isArray(pnp) ? pnp[0] : pnp;
        report.windowsDriverAssigned = dev.Service || 'Unknown';
        report.cameraModel = dev.FriendlyName;
        console.log(`  Found Device: ${dev.FriendlyName}`);
        console.log(`  Assigned Driver Service: ${dev.Service || 'N/A'}`);
        console.log(`  Status: ${dev.Status}`);
      } else {
        console.log('  No camera recognized in Windows PnP scan.');
      }
    } catch (e) {
      console.warn('  PnP audit warning:', e.message);
    }
  }

  // ── STEP 2: Engine Auto-Detect ──
  console.log('\n[Step 2/5] Running bundled engine auto-detect (--auto-detect)...');
  let detectedPort = null;
  try {
    const detectOut = execSync(`"${GPHOTO_EXE}" --auto-detect`, { env, encoding: 'utf8', timeout: 10000 });
    console.log(detectOut.trim());
    report.rawDetails.autoDetect = detectOut;

    const lines = detectOut.split('\n');
    let inTable = false;
    for (const l of lines) {
      if (l.includes('------------------')) { inTable = true; continue; }
      if (inTable && l.trim()) {
        const match = l.match(/^(.+?)\s{2,}(usb:\S+)/);
        if (match) {
          report.cameraModel = report.cameraModel || match[1].trim();
          detectedPort = match[2].trim();
          report.tests.detect = true;
          break;
        }
      }
    }
  } catch (e) {
    console.error('  Auto-detect failed:', e.message);
    report.rawDetails.autoDetectError = e.message;
  }

  console.log('  Detection Result:', report.tests.detect ? '✅ SUCCESS' : '❌ FAILED');

  // ── STEP 3: PTP Connection Handshake (--summary) ──
  console.log('\n[Step 3/5] Testing PTP handshake (--summary)...');
  let usbidFlag = '';
  // Check if Sony a7C II workaround is needed
  if (report.cameraModel && /a7c\s*ii|ilce-7cm2/i.test(report.cameraModel)) {
    usbidFlag = '--usbid 0x054c:0x0eaa=0x054c:0x0d56';
    console.log('  Applied Sony a7C II USB ID mapping override.');
  }

  try {
    const summaryCmd = `"${GPHOTO_EXE}" ${usbidFlag} --summary`;
    const summaryOut = execSync(summaryCmd, { env, encoding: 'utf8', timeout: 12000 });
    report.tests.connect = true;
    report.rawDetails.summary = summaryOut.substring(0, 1000);
    console.log('  PTP Handshake: ✅ CONNECTED');
    const modelMatch = summaryOut.match(/Camera model\s*:\s*(.+)/i) || summaryOut.match(/Model\s*:\s*(.+)/i);
    if (modelMatch) {
      console.log('  Identified Model:', modelMatch[1].trim());
    }
  } catch (e) {
    console.error('  PTP Connection Failed:', e.message);
    report.rawDetails.summaryError = e.message;
  }

  // ── STEP 4 & 5: Remote Capture & Download ──
  if (report.tests.connect) {
    console.log('\n[Step 4/5] Testing Remote Capture & Download...');
    const testFile = `driver_val_${Date.now()}.jpg`;
    const targetPath = path.join(OUTPUT_DIR, testFile);

    try {
      const captureCmd = `"${GPHOTO_EXE}" ${usbidFlag} --capture-image-and-download --filename="${testFile}" --keep`;
      const captureOut = execSync(captureCmd, { cwd: OUTPUT_DIR, env, encoding: 'utf8', timeout: 16000 });
      console.log('  Capture stdout:', captureOut.trim());
      report.tests.capture = true;

      // Validate download
      if (fs.existsSync(targetPath)) {
        const stat = fs.statSync(targetPath);
        if (stat.size > 10240) {
          report.tests.download = true;
          console.log(`\n[Step 5/5] Download Validated: ✅ ${testFile} (${(stat.size / 1024).toFixed(1)} KB)`);
        } else {
          console.error(`\n[Step 5/5] Download Error: File is too small (${stat.size} bytes)`);
        }
      } else {
        console.error(`\n[Step 5/5] Download Error: File not saved at ${targetPath}`);
      }
    } catch (e) {
      console.error('  Capture/Download failed:', e.message);
      report.rawDetails.captureError = e.message;
    }
  } else {
    console.log('\n[Step 4/5 & 5/5] Skipped capture test because PTP handshake did not succeed.');
  }

  // ── FINAL VERDICT ──
  console.log('\n====================================================');
  console.log('PHASE 2 VALIDATION VERDICT:');
  console.log('====================================================');
  console.log(`  Detect:   ${report.tests.detect ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Connect:  ${report.tests.connect ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Capture:  ${report.tests.capture ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Download: ${report.tests.download ? '✅ PASS' : '❌ FAIL'}`);
  console.log('----------------------------------------------------');

  if (report.tests.detect && report.tests.connect && report.tests.capture && report.tests.download) {
    report.verdict = 'PASSED_WITH_DEFAULT_DRIVER';
    console.log('🎉 VERDICT: SUCCESS WITH WINDOWS DEFAULT DRIVER!');
    console.log('   Camera works completely with default driver + PC Remote mode.');
    console.log('   SAFETY RULE APPLIES: DO NOT REPLACE DRIVERS WITH WINUSB.');
  } else {
    report.verdict = 'FAILED_REQUIRES_INVESTIGATION_OR_WINUSB';
    console.log('⚠️  VERDICT: INCOMPLETE WORKFLOW.');
    console.log('   The camera did not complete the full workflow with default driver.');
    console.log('   Evaluate whether mode is set to PC Remote or if WinUSB setup is necessary.');
  }
  console.log('====================================================\n');

  // Save report
  const reportPath = path.join(ROOT, 'camera-validation-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log('Validation report saved to:', reportPath);
}

runValidation().catch((err) => {
  console.error('Validation script error:', err);
  process.exit(1);
});
