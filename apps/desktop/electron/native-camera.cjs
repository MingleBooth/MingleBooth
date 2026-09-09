const { exec, execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const EventEmitter = require('events');

// ─────────────────────────────────────────────────────────────────────────────
// Production Policy:
// digiCamControl is STRICTLY DEV_ONLY and NEVER used in production camera flow.
// Production builds strictly use the bundled Windows camera engine (MSYS2 MinGW64).
// ─────────────────────────────────────────────────────────────────────────────
const IS_DEV_MODE = process.env.MINGLEBOOTH_DEV_MODE === 'true' || 
  (process.env.NODE_ENV === 'development' && process.env.ENABLE_DIGICAMCONTROL === 'true');

// ─────────────────────────────────────────────────────────────────────────────
// Human-readable error codes for vendor display
// ─────────────────────────────────────────────────────────────────────────────
const CAMERA_ERRORS = {
  CAMERA_NOT_FOUND: {
    code: 'CAMERA_NOT_FOUND',
    message: 'Camera tidak ditemukan.\nPastikan kamera sudah terhubung melalui USB dan kamera dalam keadaan menyala.',
  },
  CAMERA_ENGINE_NOT_FOUND: {
    code: 'CAMERA_ENGINE_NOT_FOUND',
    message: 'Camera engine MingleBooth tidak ditemukan.\nSilakan reinstall MingleBooth.',
  },
  CAMERA_NOT_SUPPORTED: {
    code: 'CAMERA_NOT_SUPPORTED',
    message: 'Kamera terdeteksi tetapi belum mendukung remote capture.\nPastikan USB Connection kamera diset ke "PC Remote" atau "MTP".',
  },
  CAMERA_CONNECTION_FAILED: {
    code: 'CAMERA_CONNECTION_FAILED',
    message: 'Gagal menghubungkan kamera.\nPeriksa kabel USB dan pastikan mode USB kamera diset ke "PC Remote".',
  },
  CAPTURE_FAILED: {
    code: 'CAPTURE_FAILED',
    message: 'Gagal mengambil foto.\nPeriksa koneksi kamera dan coba lagi.',
  },
  DOWNLOAD_FAILED: {
    code: 'DOWNLOAD_FAILED',
    message: 'Foto berhasil diambil tetapi gagal dipindahkan ke MingleBooth.\nPeriksa koneksi USB dan coba lagi.',
  },
  TIMEOUT: {
    code: 'TIMEOUT',
    message: 'Kamera tidak merespons.\nSilakan cabut dan colokkan kembali kabel USB kamera.',
  },
};

function cameraError(code, technicalDetail) {
  const err = CAMERA_ERRORS[code] || CAMERA_ERRORS.CAPTURE_FAILED;
  if (technicalDetail) {
    console.error(`[CameraManager][${code}] Technical: ${technicalDetail}`);
  }
  return { ...err, error: err.message, message: err.message, technical: technicalDetail || '' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Photo deduplication
// ─────────────────────────────────────────────────────────────────────────────
class PhotoDeduplicator {
  constructor(ttlMs = 15000) {
    this.processed = new Map();
    this.ttlMs = ttlMs;
  }

  isDuplicate(key) {
    const now = Date.now();
    for (const [k, ts] of this.processed.entries()) {
      if (now - ts > this.ttlMs) {
        this.processed.delete(k);
      }
    }
    if (this.processed.has(key)) {
      return true;
    }
    this.processed.set(key, now);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Camera State: 'DISCONNECTED' → 'DETECTING' → 'CONNECTING' → 'CONNECTED'
//               → 'READY' → 'CAPTURING' → 'TRANSFERRING' → 'COMPLETED' → 'ERROR'
// ─────────────────────────────────────────────────────────────────────────────

function getDefaultTetherDir() {
  try {
    const home = os.homedir();
    return path.join(home, 'Pictures', 'MingleBooth', 'Tether-Inbox');
  } catch {
    return path.resolve(__dirname, '../../../data/tether-inbox');
  }
}

class NativeCameraService extends EventEmitter {
  constructor(tetherDir) {
    super();
    this.tetherDir = tetherDir || getDefaultTetherDir();
    this.hubProcess = null;
    this.tetherProcess = null;
    this.liveViewProcess = null;
    this.isLiveViewActive = false;
    this.isTetherActive = false;
    this.isInstalling = false;
    this.state = 'DISCONNECTED';
    this.cameraState = {
      status: 'DISCONNECTED',
      state: 'DISCONNECTED',
      camera: null,
      cameras: [],
      error: null,
      isLiveViewActive: false,
      engineReady: true,
      timestamp: Date.now(),
    };
    this.errorMessage = null;
    this.connectedCamera = null;
    this.detectedCameras = [];
    this.activeCameraModel = null;
    this.deduplicator = new PhotoDeduplicator(15000);
    this.pendingCapturePromise = null;
    this.tetherServerRef = null;
    this.wasExplicitlyStoppingLiveView = false;
    this.selfTestResult = null;

    if (!fs.existsSync(this.tetherDir)) {
      try {
        fs.mkdirSync(this.tetherDir, { recursive: true });
      } catch (e) {
        console.warn('[CameraManager] Could not create tether dir:', e.message);
      }
    }

    console.log(`[CameraManager] Initialized. Platform: ${process.platform}. Tether dir: ${this.tetherDir}`);
  }

  setTetherServer(tetherServer) {
    this.tetherServerRef = tetherServer;
  }

  /**
   * Updates the internal backend camera state and emits stateChange & camera-state events.
   * Standard Node.js EventEmitter state architecture (NOT React component state).
   */
  updateState(status, payload = {}) {
    const prevState = this.state;
    this.state = status;
    if (payload.error) {
      this.errorMessage = payload.error;
    } else if (status === 'CONNECTED' || status === 'READY' || status === 'DISCONNECTED') {
      this.errorMessage = null;
    }

    this.cameraState = {
      status,
      state: status,
      prevState,
      camera: this.connectedCamera,
      cameras: this.detectedCameras,
      error: this.errorMessage,
      isLiveViewActive: this.isLiveViewActive,
      engineReady: true,
      timestamp: Date.now(),
      ...payload,
    };

    console.log(`[CameraManager State] ${prevState} ➔ ${this.state}`, payload.error ? `Error: ${payload.error}` : '');
    this.emit('stateChange', this.cameraState);
    this.emit('camera-state', this.cameraState);
    return this.cameraState;
  }

  // Backward-compatibility alias so any external or legacy caller resolves safely
  setState(status, payload = {}) {
    return this.updateState(status, payload);
  }

  getState() {
    return {
      status: this.state,
      state: this.state,
      camera: this.connectedCamera,
      cameras: this.detectedCameras,
      error: this.errorMessage,
      isLiveViewActive: this.isLiveViewActive,
      engineReady: true,
      ...this.cameraState,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PATH RESOLUTION — NEVER falls back to bare 'gphoto2' in PATH
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Resolves the absolute path to the bundled gphoto2 binary.
   * Resolution order:
   *   1. app.asar.unpacked (packaged Electron — production)
   *   2. process.resourcesPath (packaged Electron — alternative)
   *   3. __dirname-relative (development)
   *   4. macOS system paths (macOS only)
   *
   * Returns null if not found — NEVER returns a bare 'gphoto2' string.
   * Callers MUST check for null and return CAMERA_ENGINE_NOT_FOUND.
   */
  findGphotoBinary() {
    const platform = process.platform;

    // ── 1. Production: app.asar.unpacked path ──────────────────────────────
    if (process.resourcesPath) {
      const base = path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'bin');
      if (platform === 'win32') {
        const winPath = path.join(base, 'win', 'gphoto2.exe');
        if (fs.existsSync(winPath)) {
          console.log('[CameraManager] Found bundled gphoto2 (production win):', winPath);
          return winPath;
        }
      } else {
        const unixPath = path.join(base, 'gphoto2');
        if (fs.existsSync(unixPath)) {
          console.log('[CameraManager] Found bundled gphoto2 (production unix):', unixPath);
          return unixPath;
        }
      }
    }

    // ── 2. Development / __dirname-relative ───────────────────────────────
    const dirUnpacked = __dirname.replace('app.asar', 'app.asar.unpacked');
    const devCandidates = platform === 'win32'
      ? [
          path.join(dirUnpacked, 'bin', 'win', 'gphoto2.exe'),
          path.join(__dirname, 'bin', 'win', 'gphoto2.exe'),
          path.resolve(__dirname, '../bin/win/gphoto2.exe'),
        ]
      : [
          path.join(dirUnpacked, 'bin', 'gphoto2'),
          path.join(__dirname, 'bin', 'gphoto2'),
          path.resolve(__dirname, '../bin/gphoto2'),
          path.resolve(__dirname, '../../../electron/bin/gphoto2'),
        ];

    for (const p of devCandidates) {
      if (fs.existsSync(p) && !p.includes('.asar/')) {
        console.log('[CameraManager] Found gphoto2 (dev):', p);
        return p;
      }
    }

    // ── 3. macOS system installations (macOS only) ─────────────────────────
    if (platform === 'darwin') {
      const macPaths = [
        '/usr/local/bin/gphoto2',
        '/opt/homebrew/bin/gphoto2',
        '/usr/bin/gphoto2',
      ];
      for (const p of macPaths) {
        if (fs.existsSync(p)) {
          console.log('[CameraManager] Found gphoto2 (macOS system):', p);
          return p;
        }
      }
    }

    // ── NOT FOUND: return null — callers must handle this explicitly ────────
    console.warn('[CameraManager] gphoto2 binary NOT found. Platform:', platform);
    return null;
  }

  /**
   * Resolves the sony_camera_hub binary (macOS/Linux only).
   * Returns null if not found.
   */
  findHubBinary() {
    // 1. Production: app.asar.unpacked
    if (process.resourcesPath) {
      const unpackedRes = path.join(process.resourcesPath, 'app.asar.unpacked/electron/bin/sony_camera_hub');
      if (fs.existsSync(unpackedRes)) return unpackedRes;
    }

    // 2. __dirname-relative (asar-unpacked or dev)
    const unpackedDir = path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), 'bin/sony_camera_hub');
    if (fs.existsSync(unpackedDir)) return unpackedDir;

    // 3. Development paths
    const candidatePaths = [
      path.join(__dirname, 'bin/sony_camera_hub'),
      path.resolve(__dirname, '../bin/sony_camera_hub'),
      path.resolve(__dirname, '../../../electron/bin/sony_camera_hub'),
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p) && !p.includes('.asar/')) return p;
    }
    return null;
  }

  /**
   * Returns spawn options for gphoto2 on Windows to include bundled DLL directory.
   */
  getGphotoSpawnEnv(binaryPath) {
    if (process.platform !== 'win32') {
      return {
        ...process.env,
        LC_ALL: 'C',
        LANG: 'C',
      };
    }
    // Add the directory containing gphoto2.exe to PATH so DLLs are found
    const binDir = path.dirname(binaryPath);
    return {
      ...process.env,
      PATH: `${binDir};${process.env.PATH || ''}`,
      CAMLIBS: path.join(binDir, 'camlibs'),
      IOLIBS: path.join(binDir, 'iolibs'),
      LC_ALL: 'C',
      LANG: 'C',
    };
  }

  /**
   * Startup Camera Engine Self-Test.
   * Validates binary presence, driver libraries, and CLI execution.
   */
  async runEngineSelfTest() {
    const platform = process.platform;
    const binary = this.findGphotoBinary();
    const hubBinary = this.findHubBinary();

    console.log(`[EngineSelfTest] Executing camera engine self-test on ${platform}...`);

    if (platform === 'win32') {
      if (!binary) {
        this.selfTestResult = {
          ready: false,
          engine: 'none',
          version: null,
          details: { binary: null, camlibs: false, iolibs: false },
          error: 'Bundled Windows camera engine (gphoto2.exe) not found.',
        };
        console.error('[EngineSelfTest] FAILED: Bundled gphoto2.exe not found');
        return this.selfTestResult;
      }

      const binDir = path.dirname(binary);
      const camlibsDir = path.join(binDir, 'camlibs');
      const iolibsDir = path.join(binDir, 'iolibs');

      const camlibsCount = fs.existsSync(camlibsDir) ? fs.readdirSync(camlibsDir).filter(f => f.endsWith('.dll')).length : 0;
      const iolibsCount = fs.existsSync(iolibsDir) ? fs.readdirSync(iolibsDir).filter(f => f.endsWith('.dll')).length : 0;

      // Quick CLI test
      return new Promise((resolve) => {
        execFile(binary, ['--version'], { env: this.getGphotoSpawnEnv(binary), timeout: 5000 }, (err, stdout, stderr) => {
          if (err || !stdout || !stdout.includes('gphoto2')) {
            const detail = stderr || (err ? err.message : 'Invalid output');
            console.error('[EngineSelfTest] Execution failed for bundled engine:', detail);
            this.selfTestResult = {
              ready: false,
              engine: 'bundled-windows-engine',
              version: null,
              details: { binary, camlibsCount, iolibsCount, rawError: detail },
              error: 'Failed to execute bundled engine',
            };
            resolve(this.selfTestResult);
            return;
          }

          const firstLine = stdout.split('\n')[0].trim();
          console.log(`[EngineSelfTest] PASSED: ${firstLine} (camlibs: ${camlibsCount}, iolibs: ${iolibsCount})`);
          this.selfTestResult = {
            ready: true,
            engine: 'bundled-windows-engine',
            version: firstLine,
            details: {
              binary,
              camlibsCount,
              iolibsCount,
              hasPtp: fs.existsSync(path.join(camlibsDir, 'ptp2.dll')),
              hasUsb: fs.existsSync(path.join(iolibsDir, 'usb1.dll')),
            },
            error: null,
          };
          resolve(this.selfTestResult);
        });
      });
    }

    // macOS/Linux
    if (hubBinary) {
      console.log('[EngineSelfTest] PASSED: Native Sony camera hub binary detected');
      this.selfTestResult = {
        ready: true,
        engine: 'sony_camera_hub',
        version: 'Native Sony Camera Hub (libgphoto2)',
        details: { binary: hubBinary },
        error: null,
      };
      return this.selfTestResult;
    }

    if (binary) {
      return new Promise((resolve) => {
        execFile(binary, ['--version'], { timeout: 4000 }, (err, stdout) => {
          const isOk = !err && stdout && stdout.includes('gphoto2');
          this.selfTestResult = {
            ready: isOk,
            engine: isOk ? 'gphoto2-cli' : 'none',
            version: isOk ? stdout.split('\n')[0].trim() : 'Unknown',
            details: { binary },
            error: isOk ? null : 'Failed to execute gphoto2 CLI',
          };
          console.log(`[EngineSelfTest] CLI test result:`, this.selfTestResult.ready ? 'PASSED' : 'FAILED');
          resolve(this.selfTestResult);
        });
      });
    }

    this.selfTestResult = {
      ready: false,
      engine: 'none',
      version: null,
      details: {},
      error: 'No camera engine binary available',
    };
    return this.selfTestResult;
  }

  /**
   * Camera capability detection per target model.
   * Reports support per verified camera model without claiming universal support.
   */
  detectCameraCapabilities(camera) {
    const model = (camera?.model || this.activeCameraModel || '').toLowerCase();

    // Model-specific capability matrix
    const matrix = {
      // 1. Sony a7C II
      'a7c ii': {
        model: 'Sony Alpha 7C II (ILCE-7CM2)',
        detection: true,
        remoteCapture: true,
        imageDownload: true,
        liveView: true,
        usbModeRequired: 'PC Remote',
        verifiedStatus: 'ready-for-testing',
        defaultDriverSupported: true,
        notes: 'Mode FOTO (M) -> USB Connection: PC Remote. USB ID mapping aktif.',
      },
      // 2. Sony a6300
      'a6300': {
        model: 'Sony Alpha 6300 (ILCE-6300)',
        detection: true,
        remoteCapture: true,
        imageDownload: true,
        liveView: true,
        usbModeRequired: 'PC Remote',
        verifiedStatus: 'ready-for-testing',
        defaultDriverSupported: true,
        notes: 'Mode FOTO (M) -> USB Connection: PC Remote.',
      },
      // 3. Sony FX3
      'fx3': {
        model: 'Sony Cinema Line FX3 (ILME-FX3)',
        detection: true,
        remoteCapture: true,
        imageDownload: true,
        liveView: true,
        usbModeRequired: 'PC Remote',
        verifiedStatus: 'ready-for-testing',
        defaultDriverSupported: true,
        notes: 'Mode FOTO -> USB Connection: PC Remote.',
      },
      // 4. Canon EOS target models
      'canon': {
        model: camera?.model || 'Canon EOS Digital Camera',
        detection: true,
        remoteCapture: true,
        imageDownload: true,
        liveView: true,
        usbModeRequired: 'PTP / PC Connection',
        verifiedStatus: 'ready-for-testing',
        defaultDriverSupported: true,
        notes: 'Koneksikan kabel USB ke kamera. Mode PTP standar didukung.',
      },
      // 5. Nikon target models
      'nikon': {
        model: camera?.model || 'Nikon Digital Camera',
        detection: true,
        remoteCapture: true,
        imageDownload: true,
        liveView: true,
        usbModeRequired: 'MTP/PTP',
        verifiedStatus: 'ready-for-testing',
        defaultDriverSupported: true,
        notes: 'Koneksikan kabel USB. Pastikan kamera tidak dalam mode mass storage.',
      },
    };

    for (const [key, cap] of Object.entries(matrix)) {
      if (model.includes(key)) {
        return cap;
      }
    }

    return {
      model: camera?.model || 'Kamera USB Terdeteksi',
      detection: true,
      remoteCapture: true,
      imageDownload: true,
      liveView: false,
      usbModeRequired: 'PC Remote / PTP',
      verifiedStatus: 'experimental',
      defaultDriverSupported: true,
      notes: 'Kamera terdeteksi. Silakan uji capture dari menu photobooth.',
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // DRIVER / ENGINE STATUS CHECK
  // ───────────────────────────────────────────────────────────────────────────

  async checkDriverStatus() {
    const binary = this.findGphotoBinary();
    const hubBinary = this.findHubBinary();

    if (!this.selfTestResult) {
      await this.runEngineSelfTest();
    }

    // Windows: bundled engine is the primary production engine
    if (process.platform === 'win32') {
      if (binary && this.selfTestResult?.ready) {
        return {
          installed: true,
          engine: 'bundled-windows-engine',
          version: this.selfTestResult.version || 'Bundled Camera Engine (MSYS2 MinGW64)',
          binaryPath: binary,
          selfTest: this.selfTestResult,
        };
      }

      // DEV_ONLY check if explicitly enabled
      if (IS_DEV_MODE) {
        const dccAvailable = await this.checkDigiCamControl();
        if (dccAvailable) {
          return {
            installed: true,
            engine: 'digiCamControl (DEV_ONLY)',
            version: 'digiCamControl HTTP API (DEV_ONLY)',
            binaryPath: null,
            selfTest: this.selfTestResult,
          };
        }
      }

      return {
        installed: false,
        engine: null,
        message: 'Camera engine MingleBooth tidak ditemukan. Silakan reinstall MingleBooth.',
        binaryPath: binary || null,
        selfTest: this.selfTestResult,
      };
    }

    // macOS/Linux: prefer hub binary, then gphoto2 CLI
    if (hubBinary) {
      return {
        installed: true,
        engine: 'sony_camera_hub',
        version: 'Native Sony Camera Hub (libgphoto2)',
        binaryPath: hubBinary,
        selfTest: this.selfTestResult,
      };
    }

    if (binary && this.selfTestResult?.ready) {
      return {
        installed: true,
        engine: 'gphoto2-cli',
        version: this.selfTestResult.version || 'gphoto2 CLI',
        binaryPath: binary,
        selfTest: this.selfTestResult,
      };
    }

    return {
      installed: false,
      engine: null,
      message: 'Camera engine universal belum terpasang.',
      binaryPath: binary || null,
      selfTest: this.selfTestResult,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // DEV_ONLY: digiCamControl HTTP API (Disabled by default in production)
  // ───────────────────────────────────────────────────────────────────────────

  async checkDigiCamControl() {
    if (!IS_DEV_MODE) {
      return false;
    }
    return new Promise((resolve) => {
      const req = http.get('http://127.0.0.1:5513//?CMD=List&param1=cameras', (res) => {
        res.resume();
        resolve(res.statusCode < 500);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(1200, () => { req.destroy(); resolve(false); });
    });
  }

  async captureViaDigiCamControl() {
    const filename = `capture_${Date.now()}.jpg`;
    const targetPath = path.join(this.tetherDir, filename);

    console.log('[CameraManager] Capturing via digiCamControl HTTP API...');
    this.updateState('CAPTURING');

    return new Promise((resolve) => {
      // digiCamControl: CMD=Capture saves to default folder, CMD=CaptureNoAf is silent
      const captureUrl = `http://127.0.0.1:5513//?CMD=Capture`;
      const req = http.get(captureUrl, (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', async () => {
          console.log('[CameraManager] digiCamControl response:', body.substring(0, 200));
          // digiCamControl returns the captured file path in response
          const fileMatch = body.match(/[A-Z]:\\[^<"\n\r]+\.(jpg|JPG|jpeg|JPEG)/);
          if (fileMatch) {
            const capturedPath = fileMatch[0];
            this.updateState('TRANSFERRING', { filename });
            // Copy from digiCamControl output path to our tether dir
            try {
              if (fs.existsSync(capturedPath)) {
                fs.copyFileSync(capturedPath, targetPath);
                const ingested = await this.ingestPhotoFile(targetPath, filename, 'windows_dcc');
                if (ingested) return resolve(ingested);
              }
            } catch (copyErr) {
              console.warn('[CameraManager] DCC file copy error:', copyErr.message);
            }
          }
          // If no path in response, try to get latest file from tether dir
          const ingested = await this.waitForNewPhotoInTetherDir(5000);
          if (ingested) return resolve(ingested);
          const err = cameraError('CAPTURE_FAILED', `DCC response: ${body.substring(0, 200)}`);
          this.updateState('ERROR', { error: err.message });
          resolve({ success: false, ...err });
        });
      });
      req.on('error', (e) => {
        const err = cameraError('CAMERA_CONNECTION_FAILED', e.message);
        this.updateState('ERROR', { error: err.message });
        resolve({ success: false, ...err });
      });
      req.setTimeout(10000, () => {
        req.destroy();
        const err = cameraError('TIMEOUT', 'digiCamControl capture timeout');
        this.updateState('ERROR', { error: err.message });
        resolve({ success: false, ...err });
      });
    });
  }

  async waitForNewPhotoInTetherDir(timeoutMs = 5000) {
    const start = Date.now();
    const known = new Set(fs.existsSync(this.tetherDir) ? fs.readdirSync(this.tetherDir) : []);
    return new Promise((resolve) => {
      const poll = setInterval(async () => {
        if (!fs.existsSync(this.tetherDir)) return;
        const files = fs.readdirSync(this.tetherDir);
        for (const f of files) {
          if (!known.has(f) && /\.(jpg|jpeg|png)$/i.test(f)) {
            clearInterval(poll);
            const fp = path.join(this.tetherDir, f);
            const ingested = await this.ingestPhotoFile(fp, f, 'windows_dcc_hotfolder');
            resolve(ingested);
            return;
          }
        }
        if (Date.now() - start > timeoutMs) {
          clearInterval(poll);
          resolve(null);
        }
      }, 200);
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // DRIVER INSTALL (macOS via Homebrew only)
  // ───────────────────────────────────────────────────────────────────────────

  async installDriver(onProgress) {
    if (process.platform === 'win32') {
      const msg = 'Camera engine sudah termasuk dalam MingleBooth untuk Windows. Silakan reinstall MingleBooth jika camera engine tidak ditemukan.';
      if (typeof onProgress === 'function') onProgress(msg);
      return { success: false, message: msg };
    }

    if (this.isInstalling) {
      return { success: false, message: 'Instalasi sedang berjalan...' };
    }

    this.isInstalling = true;
    return new Promise((resolve) => {
      const brewCmd = fs.existsSync('/usr/local/bin/brew')
        ? '/usr/local/bin/brew'
        : fs.existsSync('/opt/homebrew/bin/brew')
        ? '/opt/homebrew/bin/brew'
        : null;

      const log = (msg) => {
        console.log('[CameraManager Install]', msg);
        if (typeof onProgress === 'function') onProgress(msg);
        this.emit('installLog', msg);
      };

      if (!brewCmd) {
        this.isInstalling = false;
        log('Homebrew tidak ditemukan. Install Homebrew terlebih dahulu: https://brew.sh');
        resolve({ success: false, message: 'Homebrew tidak tersedia.' });
        return;
      }

      log('Memulai instalasi driver universal gphoto2 via Homebrew...');
      const child = spawn(brewCmd, ['install', 'gphoto2'], {
        env: {
          ...process.env,
          HOMEBREW_NO_AUTO_UPDATE: '1',
          HOMEBREW_NO_INSTALL_CLEANUP: '1',
        },
      });

      child.stdout.on('data', (d) => { const t = d.toString().trim(); if (t) log(t); });
      child.stderr.on('data', (d) => { const t = d.toString().trim(); if (t) log(t); });

      child.on('close', (code) => {
        this.isInstalling = false;
        if (code === 0) {
          log('✅ Instalasi gphoto2 BERHASIL! Kamera siap digunakan.');
          resolve({ success: true, message: 'Driver gphoto2 berhasil terpasang!' });
        } else {
          this.checkDriverStatus().then((status) => {
            if (status.installed) {
              resolve({ success: true, message: 'Driver gphoto2 tersedia.' });
            } else {
              resolve({ success: false, message: `Instalasi gagal (exit code ${code}).` });
            }
          });
        }
      });

      child.on('error', (err) => {
        this.isInstalling = false;
        log(`Error: ${err.message}`);
        resolve({ success: false, error: err.message });
      });
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // macOS: Release PTPCamera lock
  // ───────────────────────────────────────────────────────────────────────────

  async releaseMacOSUsbLock() {
    return new Promise((resolve) => {
      if (process.platform !== 'darwin') {
        resolve({ released: true, platform: process.platform });
        return;
      }

      const cmd = `
        launchctl stop com.apple.ptpcamerad 2>/dev/null;
        pkill -STOP -f ptpcamerad 2>/dev/null;
        killall -9 PTPCamera 2>/dev/null;
        pkill -9 -f PTPCamera 2>/dev/null;
      `;

      exec(cmd, () => {
        console.log('[CameraManager] Released macOS PTPCamera & ptpcamerad locks.');
        resolve({ released: true, message: 'Port USB dibebaskan dari Apple PTPCamera & ptpcamerad.' });
      });
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CAMERA DETECTION
  // ───────────────────────────────────────────────────────────────────────────

  async detectConnectedCameras() {
    console.log('[CameraFix-2026-09-09-v2] NativeCameraService.detectConnectedCameras started');
    console.log('[CameraManager] detectConnectedCameras started');
    this.updateState('DETECTING');

    if (process.platform === 'darwin') {
      await this.releaseMacOSUsbLock();
    }

    return new Promise((resolve) => {
      // ── Windows: use PowerShell WMI/PnP detection ─────────────────────────
      if (process.platform === 'win32') {
        this._detectWindowsCameras(resolve);
        return;
      }

      // ── macOS: try gphoto2 --auto-detect first, fallback to ioreg ─────────
      const binary = this.findGphotoBinary();
      console.log('[CameraEngine] engine path =', binary || '(none)');
      if (!binary) {
        // No gphoto2 CLI, fall back to ioreg USB scan
        this._detectMacOSCamerasViaIoreg(resolve);
        return;
      }

      console.log('[CameraEngine] running --auto-detect');
      execFile(binary, ['--auto-detect'], { timeout: 8000 }, (err, stdout) => {
        console.log('[CameraEngine] result =', stdout ? stdout.trim() : (err ? err.message : '(empty)'));
        if (err || !stdout) {
          this._detectMacOSCamerasViaIoreg(resolve);
          return;
        }

        const lines = stdout.trim().split('\n');
        const cameras = [];

        for (let i = 2; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const match = line.match(/^(.+?)\s{2,}(usb:\S+.*)$/);
          if (match) {
            cameras.push({ model: match[1].trim(), port: match[2].trim() });
          } else {
            cameras.push({ model: line, port: 'usb' });
          }
        }

        if (cameras.length > 0) {
          this.finishDetection(cameras, resolve);
          return;
        }

        // gphoto2 found no cameras, try ioreg fallback
        this._detectMacOSCamerasViaIoreg(resolve);
      });
    });
  }

  _detectMacOSCamerasViaIoreg(resolve) {
    exec('ioreg -p IOUSB -l -w 0', { timeout: 8000 }, (ioErr, ioOut) => {
      const cameras = [];
      if (!ioErr && ioOut) {
        const usbBlocks = ioOut.split(/\+-o\s+/);
        for (const block of usbBlocks) {
          const vidMatch = block.match(/"idVendor"\s*=\s*(\d+)/);
          const pidMatch = block.match(/"idProduct"\s*=\s*(\d+)/);
          const vendorStrMatch = block.match(/"kUSBVendorString"\s*=\s*"([^"]+)"/i);
          const prodStrMatch =
            block.match(/"kUSBProductString"\s*=\s*"([^"]+)"/i) ||
            block.match(/"USB Product Name"\s*=\s*"([^"]+)"/i);

          const vid = vidMatch ? parseInt(vidMatch[1], 10) : 0;
          const pid = pidMatch ? parseInt(pidMatch[1], 10) : 0;
          const vendorStr = vendorStrMatch ? vendorStrMatch[1] : '';
          const prodStr = prodStrMatch ? prodStrMatch[1] : '';

          // Decimal Vendor IDs: Sony=1356, Canon=1193, Nikon=1200, Fuji=1041, Panasonic=1242, Olympus=1972
          const isKnownCameraVendor =
            vid === 1356 || vid === 1193 || vid === 1200 || vid === 1041 || vid === 1242 || vid === 1972 ||
            /sony|canon|nikon|fujifilm|panasonic|lumix|olympus/i.test(vendorStr) ||
            /camera|ptp|ilce|dsc|alpha|eos|lumix/i.test(prodStr);

          if (isKnownCameraVendor) {
            let modelLabel = prodStr || (vendorStr ? `${vendorStr} Digital Camera` : 'Kamera DSLR / Mirrorless');
            if (!/hub|controller|root|simulation/i.test(modelLabel)) {
              cameras.push({
                model: modelLabel,
                vendorId: vid,
                productId: pid,
                vendor: vendorStr,
                product: prodStr,
                port: 'usb:camera',
              });
            }
          }
        }
      }
      this.finishDetection(cameras, resolve);
    });
  }

  _detectWindowsCameras(resolve) {
    console.log('[CameraManager] Detecting Windows cameras via bundled engine...');
    const binary = this.findGphotoBinary();
    console.log('[CameraEngine] engine path =', binary || '(none)');

    if (!binary) {
      const err = cameraError('CAMERA_ENGINE_NOT_FOUND', 'Bundled camera engine not found on Windows');
      this.updateState('ERROR', { error: err.message });
      resolve({
        success: false,
        ...err,
        cameras: [],
        engineReady: false,
        status: 'ERROR',
        state: 'ERROR',
      });
      return;
    }

    // Step 1: Scan Windows PnP for physical USB camera presence
    this._scanWindowsPnpCameras((pnpCameras) => {
      console.log(`[CameraManager] Windows PnP hardware scan found ${pnpCameras.length} physical device(s):`, pnpCameras.map(c => c.model));

      if (pnpCameras.length === 0) {
        console.log('[CameraManager] No physical camera found in Windows PnP.');
        this.finishDetection([], resolve);
        return;
      }

      // Check if Sony a7C II or known camera is connected to apply USB ID override
      const hasSonyA7C2 = pnpCameras.some(c => {
        const m = (c.model || '').toLowerCase();
        const id = (c.instanceId || '').toUpperCase();
        return m.includes('ilce-7cm2') || m.includes('a7c ii') || m.includes('a7cii') || (id.includes('054C') && id.includes('0EAA'));
      });

      const autoDetectArgs = ['--auto-detect'];
      if (hasSonyA7C2) {
        autoDetectArgs.unshift('--usbid', '0x054c:0x0eaa=0x054c:0x0d56');
      }

      const spawnEnv = this.getGphotoSpawnEnv(binary);
      console.log('[CameraEngine] Running bundled gphoto2 auto-detect:', binary, autoDetectArgs.join(' '));

      // Step 2: Test bundled engine communication (--auto-detect)
      execFile(binary, autoDetectArgs, { env: spawnEnv, timeout: 7000 }, (err, stdout, stderr) => {
        const rawOutput = stdout ? stdout.trim() : (err ? err.message : '(empty)');
        console.log('[CameraEngine] auto-detect result =', rawOutput);
        if (stderr && stderr.trim()) {
          console.warn('[CameraEngine] auto-detect stderr =', stderr.trim());
        }

        const engineCameras = [];
        if (!err && stdout) {
          const lines = stdout.split('\n');
          let tableStarted = false;
          for (const line of lines) {
            if (line.includes('-----------------')) {
              tableStarted = true;
              continue;
            }
            if (tableStarted && line.trim()) {
              const match = line.match(/^(.+?)\s{2,}(usb:\S+)/);
              if (match) {
                const model = match[1].trim();
                const port = match[2].trim();
                const pnpMatch = pnpCameras.find(p => p.model.toLowerCase().includes(model.toLowerCase()) || model.toLowerCase().includes(p.model.toLowerCase())) || pnpCameras[0];
                engineCameras.push({
                  model,
                  port,
                  instanceId: pnpMatch ? pnpMatch.instanceId : null,
                  vendorId: pnpMatch ? pnpMatch.vendorId : null,
                  productId: pnpMatch ? pnpMatch.productId : null,
                  source: 'bundled_gphoto2',
                  engine: 'bundled-windows-engine',
                });
              }
            }
          }
        }

        // Section 7 Critical Rule:
        // DO NOT mark camera as READY merely because Windows PnP detects a Sony device!
        // CAMERA READY must require the actual camera engine to establish communication.
        if (engineCameras.length === 0) {
          const primaryPnp = pnpCameras[0];
          console.warn(`[CameraManager] ⚠️ Physical camera detected via Windows PnP (${primaryPnp.model}), but bundled gphoto2 --auto-detect found 0 cameras.`);
          console.warn('[CameraManager] ⚠️ Cause: Windows driver (WPD/MTP) or camera USB mode is blocking libusb communication.');

          const blockedMsg = `Kamera fisik terdeteksi di Windows (${primaryPnp.model}), tetapi camera engine (gphoto2) belum dapat mengakses port USB kamera.\nPastikan mode USB kamera diset ke "PC Remote" / "PC Remote (PTP)", bukan Mass Storage / MTP.`;

          this.connectedCamera = null;
          this.detectedCameras = [];
          this.updateState('DISCONNECTED', {
            cameras: [],
            error: blockedMsg,
            pnpDevice: primaryPnp,
          });

          resolve({
            success: false,
            cameras: [],
            pnpDetected: true,
            pnpCamera: primaryPnp,
            engineReady: true,
            status: 'DISCONNECTED',
            state: 'DISCONNECTED',
            error: blockedMsg,
            message: blockedMsg,
            hint: 'Kamera fisik terdeteksi di Windows, namun mode USB atau driver Windows belum mengizinkan akses PTP. Periksa menu kamera: USB Connection ➔ PC Remote.',
          });
          return;
        }

        console.log(`[CameraManager] Bundled engine auto-detect SUCCESS (${engineCameras.length} camera):`, engineCameras.map(c => c.model));
        this.finishDetection(engineCameras, resolve);
      });
    });
  }

  _scanWindowsPnpCameras(callback) {
    console.log('[CameraManager] Scanning Windows PnP devices for camera presence...');

    // PowerShell: scan for Image/Camera/WPD class devices + known camera vendor IDs
    const psScript = `
      $devices = @()
      $classes = @('Camera', 'Image', 'WPD', 'USB')
      $vendorIds = @('VID_054C', 'VID_04A9', 'VID_04B0', 'VID_0411', 'VID_04DA', 'VID_07B4')
      $allDevices = Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue
      foreach ($d in $allDevices) {
        $isCamera = $false
        if ($d.Class -in $classes) { $isCamera = $true }
        foreach ($vid in $vendorIds) {
          if ($d.InstanceId -match $vid) { $isCamera = $true }
        }
        if ($isCamera -and $d.Status -eq 'OK') {
          $devices += [PSCustomObject]@{
            model = $d.FriendlyName
            instanceId = $d.InstanceId
            class = $d.Class
            status = $d.Status
          }
        }
      }
      $devices | ConvertTo-Json -Depth 2
    `.trim();

    exec(
      `powershell -NoProfile -NonInteractive -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
      { timeout: 8000 },
      (winErr, winOut) => {
        const cameras = [];
        if (!winErr && winOut && winOut.trim()) {
          try {
            let parsed = JSON.parse(winOut.trim());
            if (!Array.isArray(parsed)) parsed = [parsed];
            for (const item of parsed) {
              if (item && item.model && typeof item.model === 'string') {
                const name = item.model.trim();
                // Filter out generic USB hubs and WPD disk devices
                if (!/hub|root|composite|disk|storage|volume|partition/i.test(name)) {
                  const vidMatch = item.instanceId ? item.instanceId.match(/VID_([0-9A-Fa-f]{4})/i) : null;
                  const pidMatch = item.instanceId ? item.instanceId.match(/PID_([0-9A-Fa-f]{4})/i) : null;
                  const vendorId = vidMatch ? parseInt(vidMatch[1], 16) : null;
                  const productId = pidMatch ? parseInt(pidMatch[1], 16) : null;

                  cameras.push({
                    model: name,
                    port: 'usb:pnp',
                    instanceId: item.instanceId,
                    class: item.class,
                    vendorId,
                    productId,
                    source: 'windows_pnp',
                  });
                }
              }
            }
          } catch (parseErr) {
            console.warn('[CameraManager] PowerShell JSON parse error:', parseErr.message);
          }
        }
        callback(cameras);
      }
    );
  }

  _detectCamerasViaDigiCamControl(resolve) {
    if (!IS_DEV_MODE) {
      this.finishDetection([], resolve);
      return;
    }
    const req = http.get('http://127.0.0.1:5513//?CMD=List&param1=cameras', { timeout: 3000 }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => {
        const cameras = [];
        const matches = body.matchAll(/<val>(.*?)<\/val>/gi);
        for (const m of matches) {
          if (m[1] && m[1].trim()) {
            cameras.push({ model: m[1].trim(), port: 'usb:dcc', source: 'dcc_dev_only' });
          }
        }
        if (cameras.length === 0 && (body.includes('Canon') || body.includes('Nikon') || body.includes('Sony'))) {
          cameras.push({ model: 'Camera (digiCamControl DEV_ONLY)', port: 'usb:dcc', source: 'dcc_dev_only' });
        }
        this.finishDetection(cameras, resolve);
      });
    });
    req.on('error', () => this.finishDetection([], resolve));
    req.setTimeout(3000, () => { req.destroy(); this.finishDetection([], resolve); });
  }

  finishDetection(cameras, resolve) {
    console.log('[CameraManager] detection completed');
    const enrichedCameras = (cameras || []).map((c) => {
      const caps = this.detectCameraCapabilities(c);
      return {
        model: c.model || 'Kamera Studio USB',
        port: c.port || 'usb',
        source: c.source || 'native',
        engine: c.engine || 'bundled-windows-engine',
        detected: true,
        connected: Boolean(this.connectedCamera && this.connectedCamera.model === c.model),
        capabilities: {
          capture: caps.remoteCapture ?? true,
          download: caps.imageDownload ?? true,
          liveView: caps.liveView ?? true,
        },
      };
    });

    this.detectedCameras = enrichedCameras;
    if (enrichedCameras.length > 0) {
      this.activeCameraModel = enrichedCameras[0].model;
      this.errorMessage = null;
      this.updateState(this.connectedCamera ? 'CONNECTED' : 'DISCONNECTED', { cameras: enrichedCameras, error: null });
      console.log(`[CameraManager] Detection complete: ${enrichedCameras.length} camera(s) found.`);
      resolve({
        success: true,
        cameras: enrichedCameras,
        activeModel: this.activeCameraModel,
        engineReady: true,
        status: this.connectedCamera ? 'CONNECTED' : 'DISCONNECTED',
        state: this.connectedCamera ? 'CONNECTED' : 'DISCONNECTED',
      });
    } else {
      this.activeCameraModel = null;
      this.connectedCamera = null;
      this.errorMessage = null;
      this.updateState('DISCONNECTED', { cameras: [], error: null });
      console.log('[CameraManager] Detection complete: No cameras found.');
      resolve({
        success: false,
        cameras: [],
        engineReady: true,
        status: 'DISCONNECTED',
        state: 'DISCONNECTED',
      });
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // USB ID HELPERS (Sony a7C II workaround)
  // ───────────────────────────────────────────────────────────────────────────

  getUsbidArgs() {
    const cam = this.connectedCamera || (this.detectedCameras && this.detectedCameras[0]);
    if (!cam) return [];
    const model = (cam.model || '').toLowerCase();
    const instanceId = (cam.instanceId || '').toUpperCase();
    const isSonyA7C2 =
      (cam.vendorId === 1356 && cam.productId === 3754) ||
      (cam.vendorId === 0x054c && cam.productId === 0x0eaa) ||
      model.includes('ilce-7cm2') ||
      model.includes('a7c ii') ||
      model.includes('a7cii') ||
      (instanceId.includes('054C') && instanceId.includes('0EAA'));
    if (isSonyA7C2) {
      return ['--usbid', '0x054c:0x0eaa=0x054c:0x0d56'];
    }
    return [];
  }

  getUsbidFlag() {
    const args = this.getUsbidArgs();
    return args.length > 0 ? args.join(' ') : '';
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CONNECT CAMERA
  // ───────────────────────────────────────────────────────────────────────────

  async connectCamera(targetCamera) {
    this.errorMessage = null;
    this.updateState('CONNECTING', { error: null });

    if (process.platform === 'darwin') {
      await this.releaseMacOSUsbLock();
    }

    const cameraToConnect = targetCamera || this.detectedCameras[0];
    if (!cameraToConnect) {
      const err = cameraError('CAMERA_NOT_FOUND', 'No camera in detectedCameras list');
      this.updateState('DISCONNECTED', { error: err.message });
      return { success: false, ...err };
    }

    console.log('[CameraManager] Connecting to:', cameraToConnect.model);

    // ── Windows path ───────────────────────────────────────────────────────
    if (process.platform === 'win32') {
      return this._connectWindowsCamera(cameraToConnect);
    }

    // ── macOS/Linux: prefer sony_camera_hub (libgphoto2 native) ───────────
    const hubBinary = this.findHubBinary();
    if (hubBinary) {
      return new Promise((resolve) => {
        this.startUnifiedHubSession(resolve, cameraToConnect);
      });
    }

    // ── macOS/Linux: gphoto2 CLI fallback ─────────────────────────────────
    const binary = this.findGphotoBinary();
    if (!binary) {
      const err = cameraError('CAMERA_ENGINE_NOT_FOUND', 'Neither hub binary nor gphoto2 found on macOS/Linux');
      this.updateState('ERROR', { error: err.message });
      return { success: false, ...err };
    }

    return new Promise((resolve) => {
      const usbidFlag = this.getUsbidFlag();
      const args = [...this.getUsbidArgs(), '--summary'];
      console.log('[CameraManager] Establishing PTP connection handshake (CLI fallback):', binary, args);

      const execWithTimeout = (args, cb) => {
        const timer = setTimeout(() => {
          const err = cameraError('TIMEOUT', 'gphoto2 --summary timed out');
          cb(new Error(err.message), null, null);
        }, 12000);

        execFile(binary, args, { env: this.getGphotoSpawnEnv(binary) }, (err, stdout, stderr) => {
          clearTimeout(timer);
          cb(err, stdout, stderr);
        });
      };

      execWithTimeout(args, async (err, stdout, stderr) => {
        if (err) {
          console.warn('[CameraManager] PTP handshake failed (attempt 1):', stderr || err.message);
          await this.releaseMacOSUsbLock();
          execWithTimeout(['--summary'], (err2, stdout2, stderr2) => {
            if (err2) {
              const cErr = cameraError('CAMERA_CONNECTION_FAILED', stderr2 || err2.message);
              this.connectedCamera = null;
              this.updateState('ERROR', { error: cErr.message });
              resolve({ success: false, ...cErr });
              return;
            }
            this.handleSuccessfulConnection(cameraToConnect, stdout2, resolve);
          });
          return;
        }
        this.handleSuccessfulConnection(cameraToConnect, stdout, resolve);
      });
    });
  }

  async _connectWindowsCamera(cameraToConnect) {
    // DEV_ONLY DCC fallback if explicitly enabled
    if (IS_DEV_MODE) {
      const dccAvailable = await this.checkDigiCamControl();
      if (dccAvailable) {
        console.log('[CameraManager] [DEV_ONLY] Connecting via digiCamControl HTTP API...');
        this.connectedCamera = {
          model: cameraToConnect.model,
          port: cameraToConnect.port || 'usb:dcc',
          engine: 'digiCamControl (DEV_ONLY)',
          connectedAt: Date.now(),
        };
        this.activeCameraModel = cameraToConnect.model;
        this.errorMessage = null;
        this.updateState('CONNECTED', { camera: this.connectedCamera, error: null });
        this.updateState('READY', { camera: this.connectedCamera, error: null });
        return { success: true, state: 'READY', camera: this.connectedCamera, engine: 'digiCamControl (DEV_ONLY)' };
      }
    }

    // Bundled Windows camera engine
    const binary = this.findGphotoBinary();
    if (!binary) {
      console.error('[CameraConnect] FAILED: Bundled camera engine not found on Windows');
      const err = cameraError('CAMERA_ENGINE_NOT_FOUND', 'Bundled camera engine not found on Windows');
      this.updateState('ERROR', { error: err.message });
      return {
        success: false,
        ...err,
        hint: 'Camera engine MingleBooth tidak ditemukan. Silakan reinstall MingleBooth.',
      };
    }

    return new Promise((resolve) => {
      const usbidArgs = this.getUsbidArgs();
      const args = [...usbidArgs, '--summary'];
      const spawnEnv = this.getGphotoSpawnEnv(binary);

      console.log('[CameraConnect]');
      console.log('Executable:');
      console.log(binary);
      console.log('Arguments:');
      console.log(args.join(' '));
      console.log('Environment:');
      console.log(`CAMLIBS=${spawnEnv.CAMLIBS || '(none)'}`);
      console.log(`IOLIBS=${spawnEnv.IOLIBS || '(none)'}`);

      const startTime = Date.now();
      let isTimedOut = false;
      const timer = setTimeout(() => {
        isTimedOut = true;
        const elapsed = Date.now() - startTime;
        console.error('[CameraConnect] FAILED');
        console.error('exitCode: null');
        console.error('signal: SIGTERM');
        console.error('timeout: true');
        console.error(`elapsed time: ${elapsed}ms`);
        console.error('stderr: Camera connection timed out after 12s');

        const err = cameraError('TIMEOUT', 'Camera connection timed out after 12s');
        this.updateState('ERROR', { error: err.message });
        resolve({ success: false, ...err, timeout: true, elapsedTimeMs: elapsed });
      }, 12000);

      execFile(binary, args, { env: spawnEnv, timeout: 11000 }, (err, stdout, stderr) => {
        clearTimeout(timer);
        if (isTimedOut) return;

        const elapsed = Date.now() - startTime;
        const exitCode = err ? (err.code !== undefined ? err.code : (err.status !== undefined ? err.status : 1)) : 0;

        if (err) {
          const technicalStderr = (stderr && stderr.trim()) || err.message || '(empty)';
          const technicalStdout = (stdout && stdout.trim()) || '(empty)';

          console.error('[CameraConnect] FAILED');
          console.error(`exitCode: ${exitCode}`);
          console.error(`elapsed time: ${elapsed}ms`);
          console.error('stdout:');
          console.error(technicalStdout);
          console.error('stderr:');
          console.error(technicalStderr);

          const cErr = cameraError('CAMERA_CONNECTION_FAILED', technicalStderr);
          this.connectedCamera = null;
          this.updateState('ERROR', { error: cErr.message });
          resolve({
            success: false,
            ...cErr,
            error: cErr.message,
            message: cErr.message,
            exitCode,
            elapsedTimeMs: elapsed,
            stdout: technicalStdout,
            stderr: technicalStderr,
            hint: 'Pastikan kamera menyala, kabel USB terhubung dengan baik, dan mode USB kamera diset ke PC Remote.',
          });
          return;
        }

        console.log('[CameraConnect] SUCCESS');
        console.log('exitCode: 0');
        console.log(`elapsed time: ${elapsed}ms`);
        this.handleSuccessfulConnection(cameraToConnect, stdout, resolve);
      });
    });
  }

  handleSuccessfulConnection(cameraInfo, summaryStdout, resolve) {
    let identifiedModel = cameraInfo.model;
    const modelMatch = summaryStdout.match(/Camera model\s*:\s*(.+)/i) || summaryStdout.match(/Model\s*:\s*(.+)/i);
    if (modelMatch && modelMatch[1]) {
      identifiedModel = modelMatch[1].trim();
    }

    this.connectedCamera = {
      model: identifiedModel,
      port: cameraInfo.port || 'usb:ptp',
      connectedAt: Date.now(),
    };
    this.activeCameraModel = identifiedModel;

    console.log('[CameraManager] ✅ Connected to camera:', identifiedModel);
    this.errorMessage = null;
    this.updateState('CONNECTED', { camera: this.connectedCamera, error: null });
    this.updateState('READY', { camera: this.connectedCamera, error: null });

    // Start background tether listener for physical shutter
    if (process.platform !== 'win32') {
      this.startNativeTether();
    }

    resolve({ success: true, state: 'READY', camera: this.connectedCamera });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // UNIFIED HUB SESSION (macOS/Linux only — Sony Camera Hub native binary)
  // ───────────────────────────────────────────────────────────────────────────

  startUnifiedHubSession(resolve, targetCamera) {
    let resolvedOnce = false;
    this.stopUnifiedHubSession();
    const hubBinary = this.findHubBinary();
    if (!hubBinary) {
      if (resolve) resolve({ success: false, error: 'Hub binary not found' });
      return;
    }

    console.log('[CameraManager] 🚀 Spawning Unified Camera Hub session:', hubBinary);

    try {
      this.hubProcess = spawn(hubBinary, [this.tetherDir], {
        cwd: this.tetherDir,
        env: process.env,
      });

      this.isLiveViewActive = true;
      this.isTetherActive = true;

      let buffer = Buffer.alloc(0);

      this.hubProcess.stdout.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);

        let startIndex = buffer.indexOf(Buffer.from([0xff, 0xd8]));
        while (startIndex !== -1) {
          const endIndex = buffer.indexOf(Buffer.from([0xff, 0xd9]), startIndex + 2);
          if (endIndex === -1) break;

          const jpegFrame = buffer.slice(startIndex, endIndex + 2);
          buffer = buffer.slice(endIndex + 2);

          const base64 = `data:image/jpeg;base64,${jpegFrame.toString('base64')}`;
          this.emit('liveFrame', { frameDataUrl: base64, timestamp: Date.now() });

          startIndex = buffer.indexOf(Buffer.from([0xff, 0xd8]));
        }

        if (buffer.length > 5 * 1024 * 1024) buffer = Buffer.alloc(0);
      });

      let stderrAccumulator = '';
      this.hubProcess.stderr.on('data', (data) => {
        const text = data.toString();
        stderrAccumulator += text;

        const lines = stderrAccumulator.split('\n');
        stderrAccumulator = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (trimmed.startsWith('STATUS:READY:')) {
            let model = trimmed.substring('STATUS:READY:'.length).trim();
            if ((!model || model === 'USB PTP Class Camera') && (targetCamera?.model || this.detectedCameras[0]?.model)) {
              model = targetCamera?.model || this.detectedCameras[0]?.model;
            }
            this.connectedCamera = {
              model: model || 'Sony Digital Camera',
              port: 'usb:ptp',
              connectedAt: Date.now(),
            };
            this.activeCameraModel = this.connectedCamera.model;
            this.errorMessage = null;
            this.updateState('CONNECTED', { camera: this.connectedCamera, error: null });
            this.updateState('READY', { camera: this.connectedCamera, error: null });
            if (!resolvedOnce && resolve) {
              resolvedOnce = true;
              resolve({ success: true, state: 'READY', camera: this.connectedCamera });
            }
          } else if (trimmed.startsWith('PHOTO:CAPTURED:')) {
            const filePath = trimmed.substring('PHOTO:CAPTURED:'.length).trim();
            console.log('[CameraManager] 📷 Photo captured via hub:', filePath);
            const source = this.pendingCapturePromise ? 'sony_ui_capture' : 'sony_physical_shutter';
            this.ingestPhotoFile(filePath, path.basename(filePath), source);
          } else if (trimmed.startsWith('STATUS:CAPTURING')) {
            this.updateState('CAPTURING');
          } else if (trimmed.startsWith('STATUS:PHYSICAL_SHUTTER:')) {
            console.log('[CameraManager] 🔘 Physical shutter pressed:', trimmed);
          } else if (trimmed.startsWith('STATUS:ERROR:') || trimmed.startsWith('STATUS:FATAL_ERROR:')) {
            console.warn('[CameraManager Hub]', trimmed);
            if (!resolvedOnce && resolve) {
              resolvedOnce = true;
              const errMsg = cameraError('CAMERA_CONNECTION_FAILED', trimmed).message;
              this.connectedCamera = null;
              this.updateState('ERROR', { error: errMsg });
              resolve({ success: false, error: errMsg });
            }
          } else {
            console.log('[CameraManager Hub]', trimmed);
          }
        }
      });

      this.hubProcess.on('close', (code) => {
        console.log('[CameraManager Hub] Process ended with code:', code);
        this.hubProcess = null;
        this.isLiveViewActive = false;
        this.isTetherActive = false;
        this.connectedCamera = null;
        this.updateState('DISCONNECTED', { error: null });
        if (!resolvedOnce && resolve) {
          resolvedOnce = true;
          resolve({ success: false, error: 'Hub process terminated' });
        }
      });

      this.hubProcess.on('error', (err) => {
        console.error('[CameraManager Hub] Spawn error:', err);
        this.hubProcess = null;
        this.isLiveViewActive = false;
        this.isTetherActive = false;
        const cErr = cameraError('CAMERA_CONNECTION_FAILED', err.message);
        this.updateState('ERROR', { error: cErr.message });
        if (!resolvedOnce && resolve) {
          resolvedOnce = true;
          resolve({ success: false, ...cErr });
        }
      });
    } catch (err) {
      console.error('[CameraManager Hub] Exception starting hub session:', err);
      this.isLiveViewActive = false;
      this.isTetherActive = false;
      if (!resolvedOnce && resolve) {
        resolvedOnce = true;
        const cErr = cameraError('CAMERA_CONNECTION_FAILED', err.message);
        resolve({ success: false, ...cErr });
      }
    }
  }

  stopUnifiedHubSession() {
    if (this.hubProcess) {
      try {
        this.hubProcess.stdin.write('QUIT\n');
        setTimeout(() => {
          if (this.hubProcess) {
            try { this.hubProcess.kill('SIGINT'); } catch (e) {}
          }
        }, 150);
      } catch (e) {
        try { this.hubProcess.kill('SIGINT'); } catch (err) {}
      }
      this.hubProcess = null;
    }
    this.isLiveViewActive = false;
    this.isTetherActive = false;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // LIVE VIEW
  // ───────────────────────────────────────────────────────────────────────────

  startLiveView() {
    // Hub handles live view natively
    if (this.hubProcess && !this.hubProcess.killed) {
      this.isLiveViewActive = true;
      try { this.hubProcess.stdin.write('RESUME_PREVIEW\n'); } catch (e) {}
      return;
    }

    // Windows: no CLI live view — not supported without DCC streaming
    if (process.platform === 'win32') {
      console.log('[CameraManager] Live view not available via CLI on Windows. Hub session required.');
      return;
    }

    if (this.isLiveViewActive || this.liveViewProcess) return;

    const binary = this.findGphotoBinary();
    if (!binary) {
      console.warn('[CameraManager] Cannot start live view: gphoto2 binary not found.');
      return;
    }

    const args = [...this.getUsbidArgs(), '--capture-movie', '--stdout'];
    console.log('[CameraManager] Starting PC Remote Live View stream...');
    this.isLiveViewActive = true;

    try {
      this.liveViewProcess = spawn(binary, args, {
        cwd: this.tetherDir,
        env: this.getGphotoSpawnEnv(binary),
      });

      let buffer = Buffer.alloc(0);

      this.liveViewProcess.stdout.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);

        let startIndex = buffer.indexOf(Buffer.from([0xff, 0xd8]));
        while (startIndex !== -1) {
          const endIndex = buffer.indexOf(Buffer.from([0xff, 0xd9]), startIndex + 2);
          if (endIndex === -1) break;

          const jpegFrame = buffer.slice(startIndex, endIndex + 2);
          buffer = buffer.slice(endIndex + 2);

          const base64 = `data:image/jpeg;base64,${jpegFrame.toString('base64')}`;
          this.emit('liveFrame', { frameDataUrl: base64, timestamp: Date.now() });

          startIndex = buffer.indexOf(Buffer.from([0xff, 0xd8]));
        }

        if (buffer.length > 5 * 1024 * 1024) buffer = Buffer.alloc(0);
      });

      this.liveViewProcess.stderr.on('data', (d) => {
        const text = d.toString().trim();
        if (!text.includes('Capturing preview frames') && !text.includes('Movie-capture')) {
          console.log('[CameraManager LiveView stderr]', text);
        }
      });

      this.liveViewProcess.on('close', async (code) => {
        console.log('[CameraManager] Live view process exited:', code);
        this.liveViewProcess = null;
        this.isLiveViewActive = false;

        if (this.wasExplicitlyStoppingLiveView) {
          this.wasExplicitlyStoppingLiveView = false;
          return;
        }

        const stillAttached = await this.isCameraStillAttached();
        if (!stillAttached) {
          console.log('[CameraManager] Camera unplugged. Transitioning to DISCONNECTED.');
          this.connectedCamera = null;
          this.errorMessage = null;
          this.updateState('DISCONNECTED', { error: null });
          return;
        }

        if (this.connectedCamera && this.state === 'READY') {
          console.log('[CameraManager] Live view closed. Restarting...');
          setTimeout(async () => {
            if (this.connectedCamera && this.state === 'READY' && !this.isLiveViewActive) {
              await this.checkAndPullPhysicalShutterPhoto();
              this.startLiveView();
            }
          }, 300);
        }
      });

      this.liveViewProcess.on('error', (err) => {
        console.warn('[CameraManager] Live view process error:', err.message);
        this.liveViewProcess = null;
        this.isLiveViewActive = false;
      });
    } catch (err) {
      console.error('[CameraManager] Failed to spawn live view process:', err);
      this.isLiveViewActive = false;
    }
  }

  async isCameraStillAttached() {
    return new Promise((resolve) => {
      if (process.platform === 'darwin') {
        exec('ioreg -p IOUSB -l -w 0', { timeout: 5000 }, (err, stdout) => {
          if (err || !stdout) { resolve(false); return; }
          const hasCamera = /1356|1193|1200|1041|1242|1972|sony|canon|nikon|fujifilm|lumix|olympus|ilce|alpha|camera|ptp/i.test(stdout);
          resolve(hasCamera);
        });
      } else if (process.platform === 'win32') {
        exec(
          'powershell -NoProfile -Command "Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match \'VID_(054C|04A9|04B0|0411|04DA|07B4)\' } | Measure-Object | Select-Object -ExpandProperty Count"',
          { timeout: 5000 },
          (err, stdout) => {
            if (err || !stdout) { resolve(false); return; }
            resolve(parseInt(stdout.trim(), 10) > 0);
          }
        );
      } else {
        const binary = this.findGphotoBinary();
        if (!binary) { resolve(false); return; }
        execFile(binary, ['--auto-detect'], { timeout: 5000 }, (err, stdout) => {
          if (err || !stdout) { resolve(false); return; }
          resolve(stdout.trim().split('\n').length > 2);
        });
      }
    });
  }

  stopLiveView() {
    this.wasExplicitlyStoppingLiveView = true;
    if (this.hubProcess && !this.hubProcess.killed) {
      try { this.hubProcess.stdin.write('PAUSE_PREVIEW\n'); } catch (e) {}
      this.isLiveViewActive = false;
      return;
    }
    if (this.liveViewProcess) {
      try { this.liveViewProcess.kill('SIGINT'); } catch (e) {}
      this.liveViewProcess = null;
    }
    this.isLiveViewActive = false;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PHYSICAL SHUTTER PULL (macOS/Linux only — CLI fallback)
  // ───────────────────────────────────────────────────────────────────────────

  async checkAndPullPhysicalShutterPhoto() {
    const binary = this.findGphotoBinary();
    if (!binary) {
      console.log('[CameraManager] Skipping physical shutter pull: gphoto2 not available.');
      return;
    }

    const args = [
      ...this.getUsbidArgs(),
      '--new',
      '--get-all-files',
      '--filename=sony_%Y%m%d_%H%M%S_%04n.%C',
      '--keep',
    ];

    return new Promise((resolve) => {
      const proc = execFile(binary, args, { cwd: this.tetherDir, env: this.getGphotoSpawnEnv(binary), timeout: 10000 }, (err, stdout) => {
        if (!err && stdout) {
          const matches = stdout.matchAll(/(?:Saving file as|New file is at)\s+(.+)/gi);
          for (const match of matches) {
            if (match && match[1]) {
              const rawFile = match[1].trim().replace(/['"]/g, '');
              console.log('[CameraManager] 📷 Physical shutter photo detected via pull:', rawFile);
              this.ingestPhotoFile(rawFile, path.basename(rawFile), 'sony_physical_shutter');
            }
          }
        }
        resolve();
      });
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // DISCONNECT
  // ───────────────────────────────────────────────────────────────────────────

  async disconnectCamera() {
    console.log('[CameraManager] Disconnecting camera...');
    this.stopUnifiedHubSession();
    this.stopLiveView();
    this.stopNativeTether();
    this.connectedCamera = null;
    this.errorMessage = null;
    this.updateState('DISCONNECTED', { error: null });
    if (process.platform === 'darwin') await this.releaseMacOSUsbLock();
    return { success: true, state: 'DISCONNECTED' };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TETHER LISTENER (macOS/Linux CLI fallback)
  // ───────────────────────────────────────────────────────────────────────────

  async startNativeTether() {
    if (process.platform === 'win32') {
      console.log('[CameraManager] Tether listener not used on Windows (uses DCC or hub).');
      return { success: true, message: 'Windows uses digiCamControl or hub session.' };
    }

    if (this.hubProcess && !this.hubProcess.killed) {
      console.log('[CameraManager] Hub session already listening for physical shutter.');
      this.isTetherActive = true;
      return { success: true };
    }

    if (this.tetherProcess && !this.tetherProcess.killed) {
      return { success: true, message: 'Tether process already running.' };
    }

    this.stopLiveView();

    const binary = this.findGphotoBinary();
    if (!binary) {
      console.warn('[CameraManager] Cannot start tether: gphoto2 binary not found.');
      return { success: false, error: cameraError('CAMERA_ENGINE_NOT_FOUND').message };
    }

    const args = [
      ...this.getUsbidArgs(),
      '--capture-tethered',
      '--filename=sony_%Y%m%d_%H%M%S_%04n.%C',
      '--keep',
    ];

    console.log('[CameraManager] 🚀 Spawning tether listener:', binary, args.join(' '));

    try {
      this.tetherProcess = spawn(binary, args, {
        cwd: this.tetherDir,
        env: this.getGphotoSpawnEnv(binary),
      });

      this.isTetherActive = true;

      let stdoutAccumulator = '';
      this.tetherProcess.stdout.on('data', (data) => {
        const text = data.toString();
        stdoutAccumulator += text;

        const lines = stdoutAccumulator.split('\n');
        stdoutAccumulator = lines.pop() || '';

        for (const line of lines) {
          const match = line.match(/(?:Saving file as|New file is at)\s+(.+)/i);
          if (match && match[1]) {
            const rawFile = match[1].trim().replace(/['"]/g, '');
            console.log('[CameraManager] 📷 Photo from tether stream:', rawFile);
            this.ingestPhotoFile(rawFile, path.basename(rawFile), 'sony_physical_shutter');
          }
        }
      });

      this.tetherProcess.stderr.on('data', (d) => {
        const text = d.toString().trim();
        if (text && !text.includes('UNKNOWN') && !text.includes('Capturing preview')) {
          console.log('[CameraManager Tether]', text);
        }
      });

      this.tetherProcess.on('close', (code) => {
        console.log('[CameraManager] Tether process ended:', code);
        this.tetherProcess = null;
        this.isTetherActive = false;
      });

      this.tetherProcess.on('error', (err) => {
        console.error('[CameraManager] Tether spawn error:', err);
        this.tetherProcess = null;
        this.isTetherActive = false;
      });

      return { success: true };
    } catch (e) {
      console.warn('[CameraManager] Could not start tether watcher:', e);
      this.isTetherActive = false;
      return { success: false, error: e.message };
    }
  }

  stopNativeTether() {
    if (this.tetherProcess) {
      try {
        if (process.platform !== 'win32') {
          this.tetherProcess.kill('SIGUSR2');
          setTimeout(() => {
            if (this.tetherProcess) {
              try { this.tetherProcess.kill('SIGINT'); } catch (e) {}
            }
          }, 250);
        } else {
          this.tetherProcess.kill();
        }
      } catch (e) {
        try { this.tetherProcess.kill(); } catch (e2) {}
      }
      this.tetherProcess = null;
      this.isTetherActive = false;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PHOTO INGESTION — validates, deduplicates, and emits photo payload
  // ───────────────────────────────────────────────────────────────────────────

  async ingestPhotoFile(filePath, filename, source = 'sony_pc_remote') {
    if (!filePath || !filename) return null;

    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.tetherDir, filename);

    // Wait for file write flush
    await new Promise((r) => setTimeout(r, 200));

    let resolvedPath = fullPath;
    if (!fs.existsSync(resolvedPath)) {
      const baseNoExt = fullPath.replace(/\.[^/.]+$/, '');
      const candidates = [
        fullPath,
        `${baseNoExt}.JPG`,
        `${baseNoExt}.jpg`,
        `${baseNoExt}.jpeg`,
        `${baseNoExt}.JPEG`,
        `${baseNoExt}.arw`,
        `${baseNoExt}.ARW`,
      ];
      const found = candidates.find((p) => fs.existsSync(p));
      if (!found) {
        console.warn('[CameraManager] Photo file not found on disk:', fullPath);
        return null;
      }
      resolvedPath = found;
    }

    try {
      const stat = fs.statSync(resolvedPath);
      if (stat.size < 10240) {
        console.warn('[CameraManager] File too small (<10KB):', stat.size, 'bytes');
        return null;
      }

      const baseName = path.basename(resolvedPath);
      const dedupKey = `${baseName}_${stat.size}`;
      if (this.deduplicator.isDuplicate(dedupKey)) {
        console.log('[CameraManager] Duplicate photo suppressed:', dedupKey);
        return null;
      }

      // Magic bytes validation
      const fd = fs.openSync(resolvedPath, 'r');
      const headerBuf = Buffer.alloc(4);
      fs.readSync(fd, headerBuf, 0, 4, 0);
      fs.closeSync(fd);

      const isJpeg = headerBuf[0] === 0xff && headerBuf[1] === 0xd8;
      const isPng = headerBuf[0] === 0x89 && headerBuf[1] === 0x50 && headerBuf[2] === 0x4e && headerBuf[3] === 0x47;
      const isRaw = (headerBuf[0] === 0x49 && headerBuf[1] === 0x49) || (headerBuf[0] === 0x4d && headerBuf[1] === 0x4d);

      if (!isJpeg && !isPng && !isRaw) {
        console.warn('[CameraManager] Invalid image magic bytes:', resolvedPath);
        return null;
      }

      const fileBuffer = fs.readFileSync(resolvedPath);
      const mime = resolvedPath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      const base64 = `data:${mime};base64,${fileBuffer.toString('base64')}`;

      const photoPayload = {
        success: true,
        source,
        filename: baseName,
        filePath: resolvedPath,
        photoDataUrl: base64,
        byteSize: stat.size,
        timestamp: Date.now(),
      };

      console.log(`[CameraManager] ✅ Photo verified (${source}): ${baseName} (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`);

      if (this.tetherServerRef && typeof this.tetherServerRef.markProcessed === 'function') {
        this.tetherServerRef.markProcessed(baseName, stat.size, stat.mtimeMs);
      }

      this.emit('photoCaptured', photoPayload);
      this.updateState('READY', { lastCapturedFile: photoPayload.filename });

      if (this.pendingCapturePromise) {
        const { resolve, timer } = this.pendingCapturePromise;
        clearTimeout(timer);
        this.pendingCapturePromise = null;
        resolve(photoPayload);
      }

      return photoPayload;
    } catch (err) {
      console.error('[CameraManager] Error ingesting photo:', err);
      return null;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CAPTURE — main entry point for UI-triggered capture
  // ───────────────────────────────────────────────────────────────────────────

  async triggerDirectCapture(options = {}) {
    if (this.state === 'CAPTURING' || this.state === 'TRANSFERRING') {
      return { success: false, error: 'Camera is busy' };
    }

    console.log('[CameraManager] Capture triggered. Platform:', process.platform, '| State:', this.state);

    // ── CASE 0: Unified Hub process running (macOS/Linux, Sony) ───────────
    if (this.hubProcess && !this.hubProcess.killed) {
      console.log('[CameraManager] Triggering via unified hub session...');
      this.updateState('CAPTURING');
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          console.warn('[CameraManager] Hub capture timed out (8s)');
          this.pendingCapturePromise = null;
          this.updateState('READY');
          resolve({ success: false, ...cameraError('TIMEOUT', 'Hub capture timed out after 8s') });
        }, 8000);

        this.pendingCapturePromise = { resolve, timer };
        try {
          this.hubProcess.stdin.write('CAPTURE\n');
        } catch (err) {
          try {
            this.hubProcess.kill('SIGUSR1');
          } catch (e) {
            clearTimeout(timer);
            this.pendingCapturePromise = null;
            this.updateState('READY');
            resolve({ success: false, ...cameraError('CAPTURE_FAILED', err.message) });
          }
        }
      });
    }

    // ── CASE 1: Windows — bundled camera engine ───────────────────────────
    if (process.platform === 'win32') {
      if (IS_DEV_MODE) {
        const dccAvailable = await this.checkDigiCamControl();
        if (dccAvailable) {
          console.log('[CameraManager] [DEV_ONLY] Capturing via digiCamControl...');
          return this.captureViaDigiCamControl();
        }
      }

      const binary = this.findGphotoBinary();
      if (!binary) {
        const err = cameraError('CAMERA_ENGINE_NOT_FOUND', 'Bundled camera engine not found on Windows');
        this.updateState('ERROR', { error: err.message });
        return {
          success: false,
          ...err,
          hint: 'Camera engine MingleBooth tidak ditemukan. Silakan reinstall MingleBooth.',
        };
      }
      return this.executeDirectCliCapture();
    }

    // ── CASE 2: macOS/Linux Tether listener running → SIGUSR1 ─────────────
    const hadLiveView = this.isLiveViewActive;
    if (hadLiveView) {
      console.log('[CameraManager] Pausing Live View for capture...');
      this.stopLiveView();
      await new Promise((r) => setTimeout(r, 250));
    }

    this.updateState('CAPTURING');

    if (this.tetherProcess && !this.tetherProcess.killed) {
      console.log('[CameraManager] Triggering via SIGUSR1 to tether process...');
      return new Promise((resolve) => {
        const timer = setTimeout(async () => {
          console.warn('[CameraManager] SIGUSR1 capture timed out (7s). Falling back to direct CLI...');
          this.pendingCapturePromise = null;
          this.stopNativeTether();
          await this.releaseMacOSUsbLock();
          const fallbackRes = await this.executeDirectCliCapture();
          if (hadLiveView && this.connectedCamera) {
            setTimeout(() => this.startLiveView(), 400);
          } else {
            this.startNativeTether();
          }
          resolve(fallbackRes);
        }, 7000);

        this.pendingCapturePromise = { resolve, timer };
        try {
          this.tetherProcess.kill('SIGUSR1');
        } catch (err) {
          clearTimeout(timer);
          this.pendingCapturePromise = null;
          this.executeDirectCliCapture().then((res) => {
            if (hadLiveView && this.connectedCamera) {
              setTimeout(() => this.startLiveView(), 400);
            } else {
              this.startNativeTether();
            }
            resolve(res);
          });
        }
      });
    }

    // ── CASE 3: Direct CLI capture ─────────────────────────────────────────
    await this.releaseMacOSUsbLock();
    const result = await this.executeDirectCliCapture();
    if (hadLiveView && this.connectedCamera) {
      console.log('[CameraManager] Resuming Live View after capture...');
      setTimeout(() => this.startLiveView(), 400);
    } else {
      this.startNativeTether();
    }
    return result;
  }

  /**
   * Execute direct PTP capture command via gphoto2 CLI.
   * Returns human-readable error on failure. Never throws.
   */
  async executeDirectCliCapture() {
    const binary = this.findGphotoBinary();
    if (!binary) {
      console.error('[CameraCapture] FAILED: Camera engine binary not found.');
      const err = cameraError('CAMERA_ENGINE_NOT_FOUND', 'gphoto2 binary not found during capture');
      this.updateState('ERROR', { error: err.message });
      return { success: false, ...err, error: err.message, message: err.message };
    }

    const spawnEnv = this.getGphotoSpawnEnv(binary);
    const filename = `capture_${Date.now()}.jpg`;
    const targetFilePath = path.join(this.tetherDir, filename);
    const usbidArgs = this.getUsbidArgs();
    const args = [
      ...usbidArgs,
      '--capture-image-and-download',
      `--filename=${filename}`,
      '--keep',
    ];

    console.log('[CameraCapture]');
    console.log('Executable:');
    console.log(binary);
    console.log('Arguments:');
    console.log(args.join(' '));
    console.log('Working directory:');
    console.log(this.tetherDir);
    console.log('Environment:');
    console.log(`CAMLIBS=${spawnEnv.CAMLIBS || '(none)'}`);
    console.log(`IOLIBS=${spawnEnv.IOLIBS || '(none)'}`);

    const startTime = Date.now();

    return new Promise((resolve) => {
      let isTimedOut = false;
      const timer = setTimeout(() => {
        isTimedOut = true;
        const elapsed = Date.now() - startTime;
        console.error('[CameraCapture] FAILED');
        console.error('[CameraCapture]');
        console.error('exitCode: null');
        console.error('[CameraCapture]');
        console.error('signal: SIGTERM');
        console.error('[CameraCapture]');
        console.error('timeout: true');
        console.error('[CameraCapture]');
        console.error(`elapsed time: ${elapsed}ms`);
        console.error('[CameraCapture]');
        console.error('stderr:');
        console.error('gphoto2 capture timed out after 15s');

        const err = cameraError('TIMEOUT', 'gphoto2 capture timed out after 15s');
        this.updateState('ERROR', { error: err.message });
        resolve({
          success: false,
          ...err,
          error: err.message,
          message: err.message,
          exitCode: null,
          signal: 'SIGTERM',
          timeout: true,
          elapsedTimeMs: elapsed,
          stderr: 'gphoto2 capture timed out after 15s',
          stdout: '',
        });
      }, 15000);

      execFile(binary, args, { cwd: this.tetherDir, env: spawnEnv }, async (err, stdout, stderr) => {
        clearTimeout(timer);
        if (isTimedOut) return;

        const elapsed = Date.now() - startTime;
        const exitCode = err ? (err.code !== undefined ? err.code : (err.status !== undefined ? err.status : 1)) : 0;
        const signal = err ? (err.signal || 'none') : 'none';

        if (err) {
          const technicalStderr = (stderr && stderr.trim()) || err.message || '(empty)';
          const technicalStdout = (stdout && stdout.trim()) || '(empty)';

          console.error('[CameraCapture] FAILED');
          console.error('[CameraCapture]');
          console.error(`exitCode: ${exitCode}`);
          console.error('[CameraCapture]');
          console.error(`signal: ${signal}`);
          console.error('[CameraCapture]');
          console.error('timeout: false');
          console.error('[CameraCapture]');
          console.error(`elapsed time: ${elapsed}ms`);
          console.error('[CameraCapture]');
          console.error('stdout:');
          console.error(technicalStdout);
          console.error('[CameraCapture]');
          console.error('stderr:');
          console.error(technicalStderr);

          const cErr = cameraError('CAPTURE_FAILED', technicalStderr);
          this.updateState('ERROR', { error: cErr.message });
          resolve({
            success: false,
            ...cErr,
            error: cErr.message,
            message: cErr.message,
            exitCode,
            signal,
            timeout: false,
            elapsedTimeMs: elapsed,
            stdout: technicalStdout,
            stderr: technicalStderr,
          });
          return;
        }

        console.log('[CameraCapture] SUCCESS');
        console.log('[CameraCapture]');
        console.log('exitCode: 0');
        console.log('[CameraCapture]');
        console.log(`elapsed time: ${elapsed}ms`);
        if (stdout && stdout.trim()) {
          console.log('[CameraCapture]');
          console.log('stdout:');
          console.log(stdout.trim());
        }

        this.updateState('TRANSFERRING', { filename });

        // Validate that photo was actually downloaded
        if (!fs.existsSync(targetFilePath)) {
          const cErr = cameraError('DOWNLOAD_FAILED', `Downloaded file ${filename} not found in tether directory`);
          this.updateState('ERROR', { error: cErr.message });
          resolve({
            success: false,
            ...cErr,
            error: cErr.message,
            message: cErr.message,
            exitCode: 0,
            elapsedTimeMs: elapsed,
          });
          return;
        }

        const stat = fs.statSync(targetFilePath);
        if (stat.size < 1024) {
          const cErr = cameraError('DOWNLOAD_FAILED', `Captured file is too small (${stat.size} bytes)`);
          this.updateState('ERROR', { error: cErr.message });
          resolve({
            success: false,
            ...cErr,
            error: cErr.message,
            message: cErr.message,
            exitCode: 0,
            elapsedTimeMs: elapsed,
          });
          return;
        }

        const ingested = await this.ingestPhotoFile(targetFilePath, filename, 'ptp_direct_capture');
        if (ingested) {
          this.updateState('READY');
          resolve({ ...ingested, exitCode: 0, elapsedTimeMs: elapsed });
        } else {
          const err = cameraError('DOWNLOAD_FAILED', `Ingest failed for ${filename}`);
          this.updateState('ERROR', { error: err.message });
          resolve({
            success: false,
            ...err,
            error: err.message,
            message: err.message,
            exitCode: 0,
            elapsedTimeMs: elapsed,
          });
        }
      });
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton factory
// ─────────────────────────────────────────────────────────────────────────────
let nativeInstance = null;
function getNativeCameraService(tetherDir) {
  if (!nativeInstance) {
    nativeInstance = new NativeCameraService(tetherDir);
  }
  return nativeInstance;
}

module.exports = { NativeCameraService, getNativeCameraService };
