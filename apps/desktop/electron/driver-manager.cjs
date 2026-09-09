/**
 * driver-manager.cjs
 * MingleBooth Windows Camera Driver Manager (Development / QA Prototype)
 *
 * Implements the state machine:
 *   IDLE -> DRIVER_SETUP_REQUIRED -> UAC_PENDING -> PREFLIGHT -> INSTALLING
 *   -> RESTARTING -> VERIFYING_PNP -> VERIFYING_LIBUSB -> VERIFYING_PTP -> READY (or FAILED / ROLLBACK)
 *
 * Strictly scoped to Sony ILCE-7CM2 (054C:0E8C).
 * Non-destructive verification only (NO test shots / NO shutter actuation).
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const { findSupportedCamera } = require('./camera-matrix.cjs');

class DriverManager {
  constructor(options = {}) {
    this.rootPath = options.rootPath || path.resolve(__dirname, '..');
    this.binDir = options.binDir || path.resolve(__dirname, 'bin', 'win');
    this.driverDevDir = options.driverDevDir || path.resolve(__dirname, '..', 'driver-dev');
    if (!fs.existsSync(this.driverDevDir)) {
      this.driverDevDir = path.resolve(__dirname, 'driver-dev');
    }
    this.state = 'IDLE';
    this.lastPreflight = null;
    this.lastError = null;
    this.diagnosticBundle = null;
    this.listeners = [];
  }

  onStateChange(fn) {
    this.listeners.push(fn);
  }

  setState(newState, payload = {}) {
    console.log(`[DriverManager] State Transition: ${this.state} -> ${newState}`, payload);
    this.state = newState;
    for (const fn of this.listeners) {
      try {
        fn(this.state, payload);
      } catch (err) {
        console.error('[DriverManager] State listener error:', err);
      }
    }
  }

  /**
   * Inspect current Windows PnP driver state for the Sony camera
   */
  async inspectDriverState() {
    if (process.platform !== 'win32') {
      return {
        state: 'READY',
        platform: process.platform,
        supported: true,
        message: 'Non-Windows platform does not require WinUSB driver binding.',
      };
    }

    try {
      const psCommand = `
        $dev = Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object {
          $_.InstanceId -match 'VID_054C&PID_0E8C'
        }
        if ($dev) {
          @{
            Found = $true
            InstanceId = $dev.InstanceId
            Service = $dev.Service
            Class = $dev.Class
            Status = $dev.Status
            FriendlyName = $dev.FriendlyName
          } | ConvertTo-Json
        } else {
          @{ Found = $false } | ConvertTo-Json
        }
      `.replace(/\n/g, ' ');

      const raw = execSync(`powershell -NoProfile -NonInteractive -Command "${psCommand}"`, {
        encoding: 'utf8',
        timeout: 6000,
      });

      const parsed = JSON.parse(raw.trim());

      if (!parsed.Found) {
        this.setState('IDLE');
        return {
          state: 'IDLE',
          connected: false,
          message: 'Sony ILCE-7CM2 (054C:0E8C) not detected in PC Remote mode.',
        };
      }

      const isWinUsb = (parsed.Service || '').toLowerCase() === 'winusb';
      const isWpd = (parsed.Service || '').toLowerCase().includes('wpd') || (parsed.Class || '').toUpperCase() === 'WPD';

      if (isWinUsb && parsed.Status === 'OK') {
        this.setState('READY');
        return {
          state: 'READY',
          connected: true,
          device: parsed,
          message: 'Camera is bound to WinUSB and ready for PTP communication.',
        };
      }

      if (isWpd) {
        this.setState('DRIVER_SETUP_REQUIRED', { device: parsed });
        return {
          state: 'DRIVER_SETUP_REQUIRED',
          connected: true,
          device: parsed,
          message: 'Camera is currently owned by Windows WPD/MTP. WinUSB setup required.',
        };
      }

      this.setState('DRIVER_SETUP_REQUIRED', { device: parsed });
      return {
        state: 'DRIVER_SETUP_REQUIRED',
        connected: true,
        device: parsed,
        message: `Camera is currently using service '${parsed.Service}'. WinUSB setup required.`,
      };
    } catch (e) {
      console.error('[DriverManager] inspectDriverState error:', e.message);
      return { state: 'IDLE', error: e.message };
    }
  }

  /**
   * Run preflight check script
   */
  async runPreflight() {
    this.setState('PREFLIGHT');
    const preflightScript = path.join(this.driverDevDir, 'preflight-check.ps1');

    if (!fs.existsSync(preflightScript)) {
      throw new Error(`preflight-check.ps1 not found at ${preflightScript}`);
    }

    try {
      const raw = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${preflightScript}" -AsJson`, {
        encoding: 'utf8',
        timeout: 10000,
      });
      const res = JSON.parse(raw.trim());
      this.lastPreflight = res;

      if (!res.PreflightPassed) {
        throw new Error(`Preflight check failed: ${res.FailReasons.join('; ')}`);
      }
      return res;
    } catch (err) {
      this.lastError = err.message;
      throw err;
    }
  }

  /**
   * Start elevated driver setup with progress tracking
   */
  async startDriverSetup() {
    console.log('[DriverManager] Starting driver setup sequence...');

    // 1. Preflight
    let preflight;
    try {
      preflight = await this.runPreflight();
    } catch (err) {
      this.setState('FAILED', { stage: 'PREFLIGHT', error: err.message });
      await this.collectDiagnosticBundle('PREFLIGHT_FAILED', err.message);
      return { success: false, state: 'FAILED', error: err.message };
    }

    // 2. Request UAC & Launch Elevated Helper
    this.setState('UAC_PENDING');
    const installScript = path.join(this.driverDevDir, 'install-camera-driver.ps1');
    const infPath = path.join(this.driverDevDir, 'MingleBoothCamera.inf');

    if (!fs.existsSync(installScript) || !fs.existsSync(infPath)) {
      const err = `Missing driver installer files in ${this.driverDevDir}`;
      this.setState('FAILED', { stage: 'UAC_PENDING', error: err });
      return { success: false, state: 'FAILED', error: err };
    }

    this.setState('INSTALLING');

    // Execute PowerShell Start-Process with -Verb RunAs and -Wait
    const uacCommand = `
      $p = Start-Process powershell.exe -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File "${installScript}" -InfPath "${infPath}"' -Verb RunAs -Wait -PassThru
      exit $p.ExitCode
    `.replace(/\n/g, ' ');

    try {
      execSync(`powershell -NoProfile -Command "${uacCommand}"`, {
        encoding: 'utf8',
        timeout: 45000, // 45s hard watchdog
      });
    } catch (uacErr) {
      const exitCode = uacErr.status;
      let errMsg = `Installer process failed with exit code: ${exitCode}`;
      if (exitCode === 2) errMsg = 'Izin Administrator (UAC) ditolak atau dibatalkan oleh pengguna.';
      if (exitCode === 1) errMsg = 'Pemeriksaan profil kamera (Preflight) gagal.';

      this.setState('FAILED', { stage: 'INSTALLING', exitCode, error: errMsg });
      await this.collectDiagnosticBundle(`INSTALL_EXIT_${exitCode}`, errMsg);
      return { success: false, state: 'FAILED', exitCode, error: errMsg };
    }

    // 3. Restarting & PnP Verification
    this.setState('RESTARTING');
    await new Promise((r) => setTimeout(r, 2000));

    this.setState('VERIFYING_PNP');
    const pnpStatus = await this.inspectDriverState();
    if (pnpStatus.state !== 'READY') {
      const err = `PnP Verification failed: Service is '${pnpStatus.device ? pnpStatus.device.Service : 'Unknown'}'`;
      this.setState('FAILED', { stage: 'VERIFYING_PNP', error: err });
      await this.collectDiagnosticBundle('PNP_VERIFY_FAILED', err);
      return { success: false, state: 'FAILED', error: err };
    }

    // 4. Non-Destructive libusb Claim Verification
    this.setState('VERIFYING_LIBUSB');
    const gphotoExe = path.join(this.binDir, 'gphoto2.exe');
    const spawnEnv = {
      ...process.env,
      PATH: `${this.binDir};${process.env.PATH || ''}`,
      CAMLIBS: path.join(this.binDir, 'camlibs'),
      IOLIBS: path.join(this.binDir, 'iolibs'),
      LC_ALL: 'C',
    };

    const usbidFlag = '--usbid 0x054c:0x0e8c=0x054c:0x0d56';

    try {
      const autoDetectOut = execSync(`"${gphotoExe}" ${usbidFlag} --auto-detect`, {
        env: spawnEnv,
        encoding: 'utf8',
        timeout: 10000,
      });
      if (!autoDetectOut.includes('Sony') && !autoDetectOut.includes('usb:')) {
        throw new Error(`gphoto2 auto-detect did not return Sony camera port:\n${autoDetectOut}`);
      }
    } catch (e) {
      const err = `libusb interface claim / auto-detect failed: ${e.message}`;
      this.setState('FAILED', { stage: 'VERIFYING_LIBUSB', error: err });
      await this.collectDiagnosticBundle('LIBUSB_CLAIM_FAILED', err);
      return { success: false, state: 'FAILED', error: err };
    }

    // 5. Non-Destructive PTP Handshake & Property Query (NO SHUTTER)
    this.setState('VERIFYING_PTP');
    try {
      // 5a. Summary Handshake
      execSync(`"${gphotoExe}" ${usbidFlag} --summary`, {
        env: spawnEnv,
        encoding: 'utf8',
        timeout: 12000,
      });

      // 5b. Non-destructive Property Query (battery level)
      execSync(`"${gphotoExe}" ${usbidFlag} --get-config /main/status/batterylevel`, {
        env: spawnEnv,
        encoding: 'utf8',
        timeout: 10000,
      });
    } catch (e) {
      const err = `PTP Handshake / Property query failed: ${e.message}`;
      this.setState('FAILED', { stage: 'VERIFYING_PTP', error: err });
      await this.collectDiagnosticBundle('PTP_HANDSHAKE_FAILED', err);
      return { success: false, state: 'FAILED', error: err };
    }

    // ALL 4 TIERS PASSED!
    this.setState('READY');
    return {
      success: true,
      state: 'READY',
      message: 'Camera driver successfully bound and verified via non-destructive PTP check.',
    };
  }

  /**
   * Safe Rollback restoring Microsoft inbox WPD/MTP driver
   */
  async rollbackDriver() {
    console.log('[DriverManager] Triggering safe driver rollback...');
    this.setState('ROLLBACK');

    const rollbackScript = path.join(this.driverDevDir, 'rollback-camera-driver.ps1');
    if (!fs.existsSync(rollbackScript)) {
      const err = `rollback-camera-driver.ps1 not found in ${this.driverDevDir}`;
      this.setState('FAILED', { stage: 'ROLLBACK', error: err });
      return { success: false, error: err };
    }

    const uacCommand = `
      $p = Start-Process powershell.exe -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File "${rollbackScript}"' -Verb RunAs -Wait -PassThru
      exit $p.ExitCode
    `.replace(/\n/g, ' ');

    try {
      execSync(`powershell -NoProfile -Command "${uacCommand}"`, {
        encoding: 'utf8',
        timeout: 30000,
      });
      const pnpStatus = await this.inspectDriverState();
      this.setState('DRIVER_SETUP_REQUIRED', { device: pnpStatus.device });
      return {
        success: true,
        state: 'DRIVER_SETUP_REQUIRED',
        message: 'Rollback successful: Microsoft WPD/MTP driver restored.',
      };
    } catch (e) {
      const err = `Rollback process failed: ${e.message}`;
      this.setState('FAILED', { stage: 'ROLLBACK', error: err });
      return { success: false, error: err };
    }
  }

  /**
   * Automatically collect comprehensive diagnostic bundle on failure
   */
  async collectDiagnosticBundle(failureStage, failureMessage) {
    console.warn(`[DriverManager] Collecting diagnostic bundle for ${failureStage}...`);
    const bundle = {
      timestamp: new Date().toISOString(),
      failureStage,
      failureMessage,
      targetCamera: 'Sony ILCE-7CM2 (054C:0E8C)',
      pnpStatus: null,
      setupApiLogTail: null,
      driverHelperLog: null,
    };

    try {
      if (process.platform === 'win32') {
        const psCheck = `
          Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match '054C' } |
            Select-Object FriendlyName, InstanceId, Service, Class, Status | ConvertTo-Json
        `.replace(/\n/g, ' ');
        bundle.pnpStatus = JSON.parse(execSync(`powershell -NoProfile -Command "${psCheck}"`, { encoding: 'utf8' }).trim() || 'null');

        // Tail setupapi.dev.log
        const setupLog = 'C:\\Windows\\INF\\setupapi.dev.log';
        if (fs.existsSync(setupLog)) {
          const tailCmd = `Get-Content '${setupLog}' | Select-Object -Last 60`.replace(/\n/g, ' ');
          bundle.setupApiLogTail = execSync(`powershell -NoProfile -Command "${tailCmd}"`, { encoding: 'utf8' }).trim();
        }

        // Driver helper log
        const helperLog = path.join(process.env.LOCALAPPDATA || '', 'MingleBooth', 'driver-helper.log');
        if (fs.existsSync(helperLog)) {
          bundle.driverHelperLog = fs.readFileSync(helperLog, 'utf8');
        }
      }
    } catch (err) {
      bundle.collectionError = err.message;
    }

    this.diagnosticBundle = bundle;
    const dumpPath = path.join(this.rootPath, 'camera-driver-failure-report.json');
    try {
      fs.writeFileSync(dumpPath, JSON.stringify(bundle, null, 2), 'utf8');
      console.log(`[DriverManager] Failure report saved to: ${dumpPath}`);
    } catch (_) {}

    return bundle;
  }
}

module.exports = {
  DriverManager,
};
