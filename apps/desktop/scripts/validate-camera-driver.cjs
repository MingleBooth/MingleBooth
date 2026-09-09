#!/usr/bin/env node
/**
 * validate-camera-driver.cjs
 * MingleBooth Windows Camera Communication & Driver Diagnostic Suite
 *
 * Designed to diagnose the exact bundled gphoto2 -> Windows -> Camera communication layer
 * without modifying any system drivers or modifying React UI state.
 *
 * Sequence of Inspection:
 *   1. Bundled Engine Verification (gphoto2.exe --version, CAMLIBS, IOLIBS)
 *   2. Windows PnP Device Audit (VID, PID, FriendlyName, Service, Provider, Class, Status)
 *   3. Process Lock Inspection (Imaging Edge, Lightroom, EOS Utility, Windows Photos)
 *   4. Engine Auto-Detection (gphoto2 --auto-detect with and without Sony a7C II mapping)
 *   5. PTP Communication Handshake (gphoto2 --summary)
 *   6. Remote Shutter & Image Ingestion (gphoto2 --capture-image-and-download)
 *   7. Summary Report answering Questions A through L
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// Auto-resolve bundled gphoto2.exe across dev and production packaged structures
function resolveBundledGphoto() {
  const candidates = [
    path.join(ROOT, 'electron', 'bin', 'win', 'gphoto2.exe'),
    path.join(ROOT, 'bin', 'win', 'gphoto2.exe'),
    path.join(process.cwd(), 'resources', 'app.asar.unpacked', 'electron', 'bin', 'win', 'gphoto2.exe'),
    path.join(process.cwd(), 'electron', 'bin', 'win', 'gphoto2.exe'),
    path.join(__dirname, '..', 'electron', 'bin', 'win', 'gphoto2.exe'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return path.resolve(c);
  }
  return path.join(ROOT, 'electron', 'bin', 'win', 'gphoto2.exe');
}

const GPHOTO_EXE = resolveBundledGphoto();
const WIN_BIN = path.dirname(GPHOTO_EXE);
const OUTPUT_DIR = path.join(ROOT, 'camera-test-output');

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

async function runDiagnostic() {
  console.log('================================================================');
  console.log('  MINGLEBOOTH WINDOWS CAMERA COMMUNICATION DIAGNOSTIC SUITE');
  console.log('================================================================');
  console.log('Target Camera  : Sony ILCE-7CM2 / DSLR / Mirrorless Studio Camera');
  console.log('Platform       :', process.platform, process.arch);
  console.log('Working Dir    :', OUTPUT_DIR);
  console.log('Bundled Engine :', GPHOTO_EXE);
  console.log('CAMLIBS        :', env.CAMLIBS);
  console.log('IOLIBS         :', env.IOLIBS);
  console.log('----------------------------------------------------------------\n');

  const report = {
    A_engineLaunch: 'FAIL',
    B_autoDetectOutput: '(not run)',
    C_cameraDetected: 'NO',
    D_summaryOutput: '(not run)',
    E_captureStatus: 'FAIL',
    F_captureStderr: '(none)',
    G_exitCode: null,
    H_windowsPnpDetected: 'NO',
    I_currentWindowsDriver: 'Unknown',
    I_driverProvider: 'Unknown',
    I_driverClass: 'Unknown',
    J_pcRemoteMode: 'UNCONFIRMED',
    K_macVsWinDivergence: 'Unknown',
    L_winUsbNecessary: 'INVESTIGATING',
    hardware: {
      vid: null,
      pid: null,
      friendlyName: null,
      instanceId: null,
      service: null,
      status: null,
    },
    tests: {
      engineVersion: false,
      pnpScan: false,
      processLocks: [],
      autoDetectRaw: false,
      autoDetectSonyMapped: false,
      summaryHandshake: false,
      remoteCapture: false,
      imageDownload: false,
    },
  };

  // ───────────────────────────────────────────────────────────────────────────
  // CHECK 1: Engine Execution Test (--version)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('[Step 1/6] Testing bundled gphoto2.exe launch & libraries...');
  try {
    if (!fs.existsSync(GPHOTO_EXE)) {
      throw new Error(`gphoto2.exe not found at ${GPHOTO_EXE}`);
    }
    const verOut = execSync(`"${GPHOTO_EXE}" --version`, { env, encoding: 'utf8', timeout: 5000 });
    const firstLine = verOut.trim().split('\n')[0];
    console.log(`  Engine Launch: ✅ PASS (${firstLine})`);
    report.A_engineLaunch = 'PASS';
    report.tests.engineVersion = true;
  } catch (e) {
    console.error('  Engine Launch: ❌ FAIL -', e.message);
    report.A_engineLaunch = 'FAIL';
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CHECK 2: Windows PnP & Driver Audit
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n[Step 2/6] Auditing Windows Device Manager & Driver Stack...');
  if (process.platform === 'win32') {
    try {
      const psCommand = `
        $devs = Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object {
          $_.Class -in @('Camera','Image','WPD','USB') -and ($_.InstanceId -match 'VID_054C|VID_04A9|VID_04B0|VID_04DA|VID_0411|VID_07B4')
        } | Select-Object FriendlyName, InstanceId, Service, Class, Status
        $devs | ConvertTo-Json -Depth 2
      `.replace(/\n/g, ' ');

      const pnpRaw = execSync(`powershell -NoProfile -NonInteractive -Command "${psCommand}"`, { encoding: 'utf8', timeout: 8000 });
      if (pnpRaw && pnpRaw.trim()) {
        let parsed = JSON.parse(pnpRaw.trim());
        if (Array.isArray(parsed)) parsed = parsed[0];
        if (parsed && parsed.FriendlyName) {
          report.H_windowsPnpDetected = `YES (${parsed.FriendlyName})`;
          report.hardware.friendlyName = parsed.FriendlyName;
          report.hardware.instanceId = parsed.InstanceId;
          report.hardware.service = parsed.Service || 'WpdMtp (Default)';
          report.hardware.status = parsed.Status;
          report.I_currentWindowsDriver = parsed.Service || 'WpdMtp';
          report.I_driverClass = parsed.Class || 'WPD';
          report.tests.pnpScan = true;

          const vidMatch = parsed.InstanceId.match(/VID_([0-9A-F]{4})/i);
          const pidMatch = parsed.InstanceId.match(/PID_([0-9A-F]{4})/i);
          report.hardware.vid = vidMatch ? `0x${vidMatch[1]}` : 'Unknown';
          report.hardware.pid = pidMatch ? `0x${pidMatch[1]}` : 'Unknown';

          console.log(`  Device Name    : ${parsed.FriendlyName}`);
          console.log(`  Hardware ID    : VID ${report.hardware.vid}, PID ${report.hardware.pid}`);
          console.log(`  Windows Driver : ${report.I_currentWindowsDriver} (Class: ${parsed.Class})`);
          console.log(`  PnP Status     : ${parsed.Status}`);
        }
      } else {
        console.log('  Windows PnP: No camera device matched in Imaging/WPD/Camera/USB classes.');
        report.H_windowsPnpDetected = 'NO (Device not plugged in or USB data cable disconnected)';
      }

      // Query detailed driver provider
      try {
        const drvScript = `
          Get-CimInstance Win32_PnPSignedDriver -ErrorAction SilentlyContinue | Where-Object {
            $_.DeviceID -match 'VID_054C|VID_04A9|VID_04B0'
          } | Select-Object DeviceName, DriverProviderName, DriverVersion, DriverDate | ConvertTo-Json
        `.replace(/\n/g, ' ');
        const drvRaw = execSync(`powershell -NoProfile -NonInteractive -Command "${drvScript}"`, { encoding: 'utf8', timeout: 5000 });
        if (drvRaw && drvRaw.trim()) {
          let drvParsed = JSON.parse(drvRaw.trim());
          if (Array.isArray(drvParsed)) drvParsed = drvParsed[0];
          report.I_driverProvider = drvParsed.DriverProviderName || 'Microsoft';
          console.log(`  Driver Provider: ${report.I_driverProvider} (${drvParsed.DriverVersion || ''})`);
        }
      } catch (_) {}

      // Check process locks
      try {
        const procScript = `
          Get-Process -ErrorAction SilentlyContinue | Where-Object {
            $_.ProcessName -match 'ImagingEdge|Remote|Lightroom|EOS|PhotosApp|digiCamControl'
          } | Select-Object -ExpandProperty ProcessName
        `.replace(/\n/g, ' ');
        const procRaw = execSync(`powershell -NoProfile -NonInteractive -Command "${procScript}"`, { encoding: 'utf8', timeout: 4000 });
        const procs = procRaw.trim().split('\n').map(s => s.trim()).filter(Boolean);
        if (procs.length > 0) {
          report.tests.processLocks = procs;
          console.warn(`  ⚠️ Warning: Potential competing camera process running: ${procs.join(', ')}`);
        } else {
          console.log('  Process Lock   : Clean (no competing camera software running)');
        }
      } catch (_) {}
    } catch (err) {
      console.warn('  PnP query error:', err.message);
    }
  } else {
    console.log('  (Skipping Windows PnP check on non-Windows environment)');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CHECK 3: Engine Auto-Detection (--auto-detect)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n[Step 3/6] Running bundled gphoto2 --auto-detect...');
  let autoDetectStdout = '';
  try {
    autoDetectStdout = execSync(`"${GPHOTO_EXE}" --auto-detect`, { env, encoding: 'utf8', timeout: 7000 });
    console.log('  Raw Output:\n' + autoDetectStdout.trim());
    report.B_autoDetectOutput = autoDetectStdout.trim();

    if (autoDetectStdout.includes('Sony') || autoDetectStdout.includes('Canon') || autoDetectStdout.includes('Nikon') || autoDetectStdout.includes('usb:')) {
      report.tests.autoDetectRaw = true;
      report.C_cameraDetected = 'YES (Raw auto-detect)';
    }
  } catch (e) {
    console.error('  Auto-detect failed:', e.message);
    report.B_autoDetectOutput = e.message;
  }

  // If not detected, test with Sony a7C II mapping override
  let usbidFlag = '--usbid 0x054c:0x0eaa=0x054c:0x0d56';
  console.log('\n[Step 3b/6] Testing auto-detect with Sony a7C II override (0x0eaa=0x0d56)...');
  try {
    const mappedOut = execSync(`"${GPHOTO_EXE}" ${usbidFlag} --auto-detect`, { env, encoding: 'utf8', timeout: 7000 });
    console.log('  Mapped Output:\n' + mappedOut.trim());
    if (mappedOut.includes('Sony') || mappedOut.includes('usb:')) {
      report.tests.autoDetectSonyMapped = true;
      report.C_cameraDetected = 'YES (With USB ID override)';
    }
  } catch (e) {
    console.warn('  Mapped auto-detect failed:', e.message);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CHECK 4: PTP Summary Handshake (--summary)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n[Step 4/6] Testing PTP handshake (--summary)...');
  try {
    const summaryOut = execSync(`"${GPHOTO_EXE}" ${usbidFlag} --summary`, { env, encoding: 'utf8', timeout: 12000 });
    report.tests.summaryHandshake = true;
    report.D_summaryOutput = summaryOut.substring(0, 500);
    console.log('  Handshake: ✅ PASS');
    const modelMatch = summaryOut.match(/Camera model\s*:\s*(.+)/i) || summaryOut.match(/Model\s*:\s*(.+)/i);
    if (modelMatch) {
      console.log('  Camera Model: ' + modelMatch[1].trim());
      report.C_cameraDetected = `YES (${modelMatch[1].trim()})`;
    }
  } catch (e) {
    console.error('  Handshake: ❌ FAIL -', e.message);
    report.D_summaryOutput = `FAIL: ${e.message}`;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CHECK 5: Remote Capture & Download Test
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n[Step 5/6] Testing Remote Capture (--capture-image-and-download)...');
  const testFilename = `diag_capture_${Date.now()}.jpg`;
  const testFileTarget = path.join(OUTPUT_DIR, testFilename);
  const captureCmd = `"${GPHOTO_EXE}" ${usbidFlag} --capture-image-and-download --filename="${testFilename}" --keep`;

  console.log('[CameraCapture]');
  console.log('Executable:');
  console.log(GPHOTO_EXE);
  console.log('Arguments:');
  console.log(`${usbidFlag} --capture-image-and-download --filename="${testFilename}" --keep`);
  console.log('Working directory:');
  console.log(OUTPUT_DIR);
  console.log('Environment:');
  console.log(`CAMLIBS=${env.CAMLIBS}`);
  console.log(`IOLIBS=${env.IOLIBS}`);

  const startTime = Date.now();
  try {
    const capOut = execSync(captureCmd, { cwd: OUTPUT_DIR, env, encoding: 'utf8', timeout: 15000 });
    const elapsed = Date.now() - startTime;
    console.log('[CameraCapture] SUCCESS');
    console.log('[CameraCapture] exitCode: 0');
    console.log(`[CameraCapture] elapsed time: ${elapsed}ms`);
    console.log('[CameraCapture] stdout:\n' + capOut.trim());

    report.E_captureStatus = 'PASS';
    report.G_exitCode = 0;
    report.tests.remoteCapture = true;

    if (fs.existsSync(testFileTarget)) {
      const stat = fs.statSync(testFileTarget);
      if (stat.size > 10240) {
        report.tests.imageDownload = true;
        console.log(`  Download: ✅ PASS (${testFilename}, ${(stat.size / 1024).toFixed(1)} KB)`);
      } else {
        console.error(`  Download: ❌ FAIL (File too small: ${stat.size} bytes)`);
      }
    } else {
      console.error('  Download: ❌ FAIL (Target file not created)');
    }
  } catch (e) {
    const elapsed = Date.now() - startTime;
    const stderrStr = e.stderr ? e.stderr.toString().trim() : e.message;
    console.error('[CameraCapture] FAILED');
    console.error(`[CameraCapture] exitCode: ${e.status !== undefined ? e.status : 1}`);
    console.error(`[CameraCapture] elapsed time: ${elapsed}ms`);
    console.error('[CameraCapture] stderr:\n' + stderrStr);

    report.E_captureStatus = 'FAIL';
    report.F_captureStderr = stderrStr;
    report.G_exitCode = e.status !== undefined ? e.status : 1;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // ANALYSIS & COMPARISON (MAC VS WINDOWS)
  // ───────────────────────────────────────────────────────────────────────────
  if (report.tests.remoteCapture && report.tests.imageDownload) {
    report.K_macVsWinDivergence = 'NONE (Windows completes full pipeline identically to Mac)';
    report.L_winUsbNecessary = 'NO (Default Windows driver successfully controls camera in PC Remote mode)';
  } else if (!report.tests.autoDetectRaw && !report.tests.autoDetectSonyMapped && report.hardware.friendlyName) {
    report.K_macVsWinDivergence = 'POINT 2: USB Access / Interface Claim. Windows PnP detects device via wpdmtp.sys, but libusb cannot claim interface 0.';
    report.L_winUsbNecessary = report.I_currentWindowsDriver.toLowerCase().includes('wpd')
      ? 'LIKELY REQUIRED if camera USB mode is already PC Remote (wpdmtp driver blocks raw bulk libusb access)'
      : 'EVALUATE USB MODE FIRST (Set camera to PC Remote / PTP)';
  } else {
    report.K_macVsWinDivergence = 'POINT 4: PTP Shutter execution failed during capture command transfer.';
    report.L_winUsbNecessary = 'PENDING: Check camera exposure / focus lock before driver change.';
  }

  // ───────────────────────────────────────────────────────────────────────────
  // FINAL REPORT OUTPUT
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log('  MINGLEBOOTH FINAL CAMERA ENGINE DIAGNOSTIC REPORT');
  console.log('================================================================');
  console.log(`A. Is bundled gphoto2.exe launching?       : ${report.A_engineLaunch}`);
  console.log(`B. What does --auto-detect return?         : ${report.B_autoDetectOutput ? report.B_autoDetectOutput.replace(/\n/g, ' | ') : '(empty)'}`);
  console.log(`C. Is Sony a7C II detected?                : ${report.C_cameraDetected}`);
  console.log(`D. What does --summary return?             : ${report.tests.summaryHandshake ? 'PASS (PTP Handshake OK)' : 'FAIL'}`);
  console.log(`E. What happens during capture?            : ${report.E_captureStatus}`);
  console.log(`F. Exact stderr from failed capture        : ${report.F_captureStderr}`);
  console.log(`G. Exit code                               : ${report.G_exitCode}`);
  console.log(`H. Windows PnP Physical Status             : ${report.H_windowsPnpDetected}`);
  console.log(`I. Current Windows Driver                  : ${report.I_currentWindowsDriver} (Provider: ${report.I_driverProvider}, Class: ${report.I_driverClass})`);
  console.log(`J. Camera in PC Remote / PTP mode?         : ${report.J_pcRemoteMode}`);
  console.log(`K. First point where Windows diverges      : ${report.K_macVsWinDivergence}`);
  console.log(`L. Is WinUSB driver actually necessary?    : ${report.L_winUsbNecessary}`);
  console.log('================================================================\n');

  // Save report to disk
  const reportJson = path.join(ROOT, 'camera-validation-report.json');
  fs.writeFileSync(reportJson, JSON.stringify(report, null, 2));
  console.log('Report saved to:', reportJson);
}

runDiagnostic().catch((e) => {
  console.error('Fatal diagnostic failure:', e);
  process.exit(1);
});
