/**
 * driver-manager.cjs
 * MingleBooth Windows Camera Driver Manager (Boot Camp QA Hardened)
 *
 * Implements the Universal Driver Strategy State Machine:
 *   IDLE -> DRIVER_SETUP_REQUIRED -> UAC_PENDING -> PREFLIGHT -> INSTALLING
 *   -> RESTARTING -> VERIFYING_PNP -> VERIFYING_LIBUSB -> VERIFYING_PTP -> READY
 *   (or automatic ROLLBACK -> FAILED upon post-switch failure)
 *
 * Safety Rules:
 *   1. Strictly requires profile.status === 'SUPPORTED' and profile.driverStrategy === 'WINUSB_REQUIRED'.
 *   2. Unknown, unverified, or non-WinUSB cameras will NEVER have their Windows drivers modified.
 *   3. Non-destructive verification only (NO test shots / NO shutter actuation).
 *   4. Automatic rollback to Microsoft WPD/MTP if any verification check fails after driver switching.
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const { identifyCamera, findSupportedCamera } = require('./camera-profiles/index.cjs');
const { runPowerShellScript } = require('./qa-orchestrator.cjs');

class DriverManager {
  constructor(options = {}) {
    this.rootPath = options.rootPath || path.resolve(__dirname, '..');
    this.binDir = options.binDir || path.resolve(__dirname, 'bin', 'win');
    
    const resourcesPath = process.resourcesPath || path.join(process.cwd(), 'resources');
    const candidates = [
      path.join(resourcesPath, 'app.asar.unpacked', 'driver-dev'),
      path.join(resourcesPath, 'driver-dev'),
      options.driverDevDir,
      path.resolve(__dirname, '..', 'driver-dev'),
      path.resolve(__dirname, 'driver-dev'),
      path.join(process.cwd(), 'driver-dev'),
      path.join(process.cwd(), 'resources', 'app.asar.unpacked', 'driver-dev'),
      path.join(__dirname, '..', '..', 'driver-dev'),
    ].filter(Boolean);

    this.driverDevDir = candidates.find(c => fs.existsSync(c)) || path.resolve(__dirname, '..', 'driver-dev');
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
   * Inspect current Windows PnP driver state for the connected camera
   */
  async inspectDriverState(targetCamera = null) {
    if (process.platform !== 'win32') {
      return {
        state: 'READY',
        platform: process.platform,
        supported: true,
        message: 'Non-Windows platform does not require WinUSB driver binding.',
      };
    }

    try {
      // Query Sony ILCE-7CM2 instance (physical target 054C:0E8C)
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
          message: 'Kamera tidak terdeteksi dalam mode PC Remote.',
        };
      }

      // Check Profile & Driver Strategy
      const profile = identifyCamera('054C', '0E8C', parsed.FriendlyName);

      if (!profile || profile.status !== 'SUPPORTED') {
        this.setState('IDLE');
        return {
          state: 'IDLE',
          connected: true,
          device: parsed,
          profile,
          message: profile?.vendorMessage || 'Model kamera ini belum didukung MingleBooth.',
        };
      }

      // If camera does not require WinUSB, it's ready natively
      if (profile.driverStrategy !== 'WINUSB_REQUIRED') {
        this.setState('READY');
        return {
          state: 'READY',
          connected: true,
          device: parsed,
          profile,
          message: 'Kamera siap digunakan dengan driver native sistem.',
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
          profile,
          message: 'Kamera telah terhubung dan siap mengambil foto.',
        };
      }

      if (isWpd) {
        this.setState('DRIVER_SETUP_REQUIRED', { device: parsed, profile });
        return {
          state: 'DRIVER_SETUP_REQUIRED',
          connected: true,
          device: parsed,
          profile,
          message: 'Pengaturan kamera diperlukan satu kali.',
        };
      }

      this.setState('DRIVER_SETUP_REQUIRED', { device: parsed, profile });
      return {
        state: 'DRIVER_SETUP_REQUIRED',
        connected: true,
        device: parsed,
        profile,
        message: 'Pengaturan kamera diperlukan satu kali.',
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
      const preRes = runPowerShellScript(preflightScript, ['-AsJson'], 15000);
      if (!preRes.success) {
        throw new Error(preRes.friendlyError || `Preflight execution failed: ${preRes.stderr}`);
      }
      const res = JSON.parse(preRes.stdout.trim());
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
   * Start elevated driver setup with progress tracking and automatic rollback safety
   */
  async startDriverSetup() {
    console.log('[DriverManager] Starting driver setup sequence...');

    // 0. Safety Gate: Verify Camera Profile & Strategy
    const pnpInitial = await this.inspectDriverState();
    const profile = pnpInitial.profile || identifyCamera('054C', '0E8C');

    if (!profile || profile.status !== 'SUPPORTED' || profile.driverStrategy !== 'WINUSB_REQUIRED') {
      const safeError = profile?.vendorMessage || 'Model kamera ini belum didukung MingleBooth.';
      console.warn(`[DriverManager] Safety Gate Refused Setup:`, safeError);
      this.setState('FAILED', { stage: 'SAFETY_CHECK', error: safeError });
      return { success: false, state: 'FAILED', error: safeError };
    }

    // 1. Preflight Audit
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

    const installRes = runPowerShellScript(installScript, ['-InfPath', infPath], 60000);
    if (!installRes.success) {
      const exitCode = installRes.exitCode;
      let errMsg = installRes.friendlyError || `Installer process failed with exit code: ${exitCode}`;
      if (exitCode === 2) errMsg = 'Izin Administrator (UAC) ditolak atau dibatalkan oleh pengguna.';
      if (exitCode === 1) errMsg = 'Pemeriksaan profil kamera (Preflight) gagal.';
      if (exitCode === 6) errMsg = 'Windows memilih driver lain atau verifikasi driver rank gagal.';

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
      console.error('[DriverManager] VERIFYING_PNP failed. Triggering automatic rollback...');
      await this.rollbackDriver();
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
      console.error('[DriverManager] VERIFYING_LIBUSB failed. Triggering automatic rollback...');
      await this.rollbackDriver();
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
      console.error('[DriverManager] VERIFYING_PTP failed. Triggering automatic rollback...');
      await this.rollbackDriver();
      this.setState('FAILED', { stage: 'VERIFYING_PTP', error: err });
      await this.collectDiagnosticBundle('PTP_HANDSHAKE_FAILED', err);
      return { success: false, state: 'FAILED', error: err };
    }

    // ALL 4 TIERS PASSED!
    this.setState('READY');
    return {
      success: true,
      state: 'READY',
      message: 'Kamera berhasil disiapkan dan siap digunakan.',
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

    const rollbackRes = runPowerShellScript(rollbackScript, [], 45000);
    if (!rollbackRes.success) {
      const err = rollbackRes.friendlyError || `Rollback process failed: exit code ${rollbackRes.exitCode}`;
      this.setState('FAILED', { stage: 'ROLLBACK', error: err });
      return { success: false, error: err };
    }

    const pnpStatus = await this.inspectDriverState();
    this.setState('DRIVER_SETUP_REQUIRED', { device: pnpStatus.device });
    return {
      success: true,
      state: 'DRIVER_SETUP_REQUIRED',
      message: 'Driver sistem berhasil dipulihkan.',
    };
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
