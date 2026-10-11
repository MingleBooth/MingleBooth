/**
 * backends/sony-camera-backend.cjs
 * Universal Camera Architecture - Sony Camera Remote SDK Concrete Backend
 *
 * Implements CameraBackend using official Sony Camera Remote SDK 2.02.00.
 * Strictly scoped to physically verified camera model: Sony ILCE-7CM2 (α7C II)
 *
 * Adheres to MingleBooth production constraints:
 * - No gphoto2/libusb manual
 * - Preserves original JPG/RAW, no re-encoding, full EXIF intact
 * - Serialized capture queue / mutex (no overlapping captures)
 * - State machine: DISCONNECTED -> CONNECTING -> READY -> FOCUSING -> CAPTURING -> TRANSFERRING -> SAVED -> ERROR
 * - Clean disconnect & session release
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { CameraBackend } = require('./camera-backend.cjs');

class SonyCameraBackend extends CameraBackend {
  constructor(options = {}) {
    super('SonyCameraBackend', options);
    this.binDir = options.binDir || this.resolveBinDir();
    this.runnerPath = this.resolveRunnerExecutable();
    this.runnerProcess = null;
    this.state = 'DISCONNECTED';
    this.liveViewState = 'stopped'; // 'stopped' | 'starting' | 'running' | 'stopping' | 'error'
    this.concurrencyLock = false;
    this.currentModel = null;
    this.batteryLevel = null;
    this.pendingConnect = null;
    this.pendingCapture = null;
    this.pendingStatus = null;
    this.tetherDir = options.tetherDir || path.join(process.cwd(), 'output');
    this.stdoutBuffer = '';
  }

  resolveBinDir() {
    if (process.platform === 'win32') {
      const candidates = [
        path.join(process.resourcesPath || '', 'app.asar.unpacked', 'electron', 'native', 'windows'),
        path.join(process.cwd(), 'resources', 'app.asar.unpacked', 'electron', 'native', 'windows'),
        path.resolve(__dirname.replace('app.asar', 'app.asar.unpacked'), '..', 'native', 'windows'),
        path.resolve(__dirname, '..', 'native', 'windows'),
        path.resolve(__dirname, '..', 'native', 'windows', 'build', 'Release'),
        path.resolve(__dirname, '..', '..', 'native', 'windows'),
      ];
      for (const c of candidates) {
        if (c && fs.existsSync(c)) {
          if (
            fs.existsSync(path.join(c, 'sony_camera_runner.exe')) ||
            fs.existsSync(path.join(c, 'sony_camera_runner_win.exe')) ||
            fs.existsSync(path.join(c, 'Cr_Core.dll'))
          ) {
            return c;
          }
        }
      }
      return path.resolve(__dirname, '..', 'native', 'windows');
    }

    const candidates = [
      path.join(
        process.resourcesPath || '',
        'app.asar.unpacked',
        'electron',
        'bin',
        'mac'
      ),
      path.resolve(
        __dirname.replace('app.asar', 'app.asar.unpacked'),
        '..',
        'bin',
        'mac'
      ),
      path.join(
        process.cwd(),
        'resources',
        'app.asar.unpacked',
        'electron',
        'bin',
        'mac'
      ),
      path.resolve(__dirname, '..', 'bin', 'mac'),
      path.resolve(__dirname, '..', '..', 'bin', 'mac'),
    ];
    for (const c of candidates) {
      if (
        c &&
        !c.includes('.asar/') &&
        !c.includes('.asar\\') &&
        fs.existsSync(c) &&
        fs.existsSync(path.join(c, 'sony_camera_runner'))
      ) {
        return c;
      }
    }
    const unpackedFallback = path.join(
      process.resourcesPath || '',
      'app.asar.unpacked',
      'electron',
      'bin',
      'mac'
    );
    if (process.resourcesPath && fs.existsSync(unpackedFallback)) {
      return unpackedFallback;
    }
    return path.resolve(__dirname.replace('app.asar', 'app.asar.unpacked'), '..', 'bin', 'mac');
  }

  resolveRunnerExecutable() {
    if (process.platform === 'win32') {
      const standardPath = path.join(this.binDir, 'sony_camera_runner.exe');
      if (fs.existsSync(standardPath)) return standardPath;
      const altPath = path.join(this.binDir, 'sony_camera_runner_win.exe');
      if (fs.existsSync(altPath)) return altPath;
      const buildRelPath = path.join(this.binDir, 'build', 'Release', 'sony_camera_runner.exe');
      if (fs.existsSync(buildRelPath)) return buildRelPath;
      const buildRelAlt = path.join(this.binDir, 'build', 'Release', 'sony_camera_runner_win.exe');
      if (fs.existsSync(buildRelAlt)) return buildRelAlt;
      return standardPath;
    }
    return path.join(this.binDir, 'sony_camera_runner');
  }

  getCapabilities(profile) {
    return {
      capture: true,
      download: true,
      liveView: true,
      batteryStatus: true,
    };
  }

  getState() {
    return this.state;
  }

  /**
   * Fast detection of Sony ILCE-7CM2 via native runner preflight
   */
  async detect(profile = null) {
    if (process.platform !== 'darwin' && process.platform !== 'win32') {
      return { success: false, cameras: [], error: 'Sony SDK currently enabled for macOS and Windows only' };
    }

    if (!fs.existsSync(this.runnerPath)) {
      return { success: false, cameras: [], error: `Sony runner binary not found at ${this.runnerPath}` };
    }

    // If runner is already running and connected
    if (this.runnerProcess && this.state === 'READY' && this.currentModel) {
      return {
        success: true,
        cameras: [
          {
            model: this.currentModel,
            manufacturer: 'Sony',
            connection: 'USB (PC Remote)',
            backend: 'sony-sdk',
            capabilities: this.getCapabilities(profile),
          },
        ],
      };
    }

    if (process.platform === 'darwin') {
      // Check via IOReg for Sony USB VID 054C & PID 0E8C
      return new Promise((resolve) => {
        const { exec } = require('child_process');
        exec('ioreg -p IOUSB -l -w 0', { timeout: 5000 }, (err, stdout) => {
          if (err || !stdout) {
            return resolve({ success: false, cameras: [] });
          }

          const isSonyPnp = stdout.includes('1356') && stdout.includes('3724'); // Dec 1356 = 0x054C, Dec 3724 = 0x0E8C
          const isIlce7cm2 = /ILCE-7CM2|Sony Alpha/i.test(stdout);

          if (isSonyPnp || isIlce7cm2) {
            resolve({
              success: true,
              cameras: [
                {
                  model: 'ILCE-7CM2',
                  displayName: 'Sony α7C II',
                  manufacturer: 'Sony',
                  vendorId: 1356,
                  productId: 3724,
                  connection: 'USB (PC Remote)',
                  backend: 'sony-sdk',
                  capabilities: this.getCapabilities(profile),
                },
              ],
            });
          } else {
            resolve({ success: false, cameras: [] });
          }
        });
      });
    }

    if (process.platform === 'win32') {
      // Check via PowerShell PnP for Sony USB VID 054C & PID 0E8C
      return new Promise((resolve) => {
        exec('powershell -NoProfile -NonInteractive -Command "Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match \'VID_054C.*PID_0E8C\' -or $_.FriendlyName -match \'ILCE-7CM2|Sony Remote Control Camera\' } | Select-Object -First 1 FriendlyName, InstanceId | ConvertTo-Json"', { timeout: 5000 }, (err, stdout) => {
          if (err || !stdout || !stdout.trim()) {
            return resolve({ success: false, cameras: [] });
          }
          try {
            const dev = JSON.parse(stdout.trim());
            if (dev && (dev.FriendlyName || dev.InstanceId)) {
              return resolve({
                success: true,
                cameras: [
                  {
                    model: 'ILCE-7CM2',
                    displayName: 'Sony α7C II',
                    manufacturer: 'Sony',
                    vendorId: 1356,
                    productId: 3724,
                    connection: 'USB (PC Remote)',
                    backend: 'sony-sdk',
                    capabilities: this.getCapabilities(profile),
                  },
                ],
              });
            }
          } catch (_) {}
          resolve({ success: false, cameras: [] });
        });
      });
    }

    return { success: false, cameras: [] };
  }

  /**
   * Connect to camera using official Sony Camera Remote SDK
   */
  async connect(profile = null) {
    if (this.state === 'READY' && this.runnerProcess) {
      return { success: true, model: this.currentModel, backend: this.name };
    }
    if (this.runnerProcess) {
      await this.disconnect();
    }

    this.state = 'CONNECTING';

    return new Promise((resolve) => {
      const connectTimeout = setTimeout(() => {
        if (this.pendingConnect) {
          this.pendingConnect = null;
          this.state = 'ERROR';
          this.disconnect();
          resolve({ success: false, error: 'Kamera tidak merespons (Timeout koneksi SDK).' });
        }
      }, 10000);

      this.pendingConnect = (res) => {
        clearTimeout(connectTimeout);
        resolve(res);
      };

      try {
        if (process.platform === 'win32') {
          console.log('[WIN-TRACE] SonyCameraBackend.connect called');
          console.log(`[WIN-INTEGRATION] platform=${process.platform}`);
          console.log(`[WIN-INTEGRATION] runnerPath=${this.runnerPath}`);
          console.log(`[WIN-INTEGRATION] runnerExists=${fs.existsSync(this.runnerPath)}`);
          console.log(`[WIN-INTEGRATION] cwd=${this.binDir}`);
        }

        console.log(`[SonyCameraBackend] Spawning runner: ${this.runnerPath} (saveDir: ${this.tetherDir})`);
        const spawnEnv = { ...process.env };
        if (process.platform === 'darwin') {
          spawnEnv.DYLD_LIBRARY_PATH = `${this.binDir}:${this.binDir}/CrAdapter:${process.env.DYLD_LIBRARY_PATH || ''}`;
        } else if (process.platform === 'win32') {
          const adapterDir = path.join(this.binDir, 'CrAdapter');
          spawnEnv.PATH = `${this.binDir};${adapterDir};${process.env.PATH || ''}`;
        }

        this.runnerProcess = spawn(this.runnerPath, [this.tetherDir], {
          cwd: this.binDir,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: spawnEnv,
        });

        if (process.platform === 'win32') {
          console.log('[WIN-TRACE] runner spawned');
          console.log(`[WIN-INTEGRATION] spawn=${this.runnerProcess.pid ? `PID ${this.runnerProcess.pid}` : 'started'}`);
        }

        this.runnerProcess.on('error', (err) => {
          console.error('[SonyCameraBackend] Spawn error on runner process:', err);
          if (process.platform === 'win32') {
            console.error(`[WIN-INTEGRATION] spawn error=${err.message}`);
          }
          this.state = 'ERROR';
          this.liveViewState = 'stopped';
          this.emit('liveViewStateChange', { state: 'stopped' });
          this.emit('stateChange', { state: 'ERROR', error: `Gagal menjalankan Sony SDK runner: ${err.message}` });
          this.concurrencyLock = false;
          this.runnerProcess = null;
          this.currentModel = null;
          if (this.pendingConnect) {
            const cb = this.pendingConnect;
            this.pendingConnect = null;
            cb({ success: false, error: `Gagal menjalankan Sony SDK runner: ${err.message}` });
          }
          if (this.pendingCapture) {
            const { resolve } = this.pendingCapture;
            this.pendingCapture = null;
            resolve({ success: false, error: `Gagal menjalankan Sony SDK runner: ${err.message}` });
          }
        });

        this.runnerProcess.stdout.on('data', (data) => {
          this._handleStdout(data.toString());
        });

        this.runnerProcess.stderr.on('data', (data) => {
          const str = data.toString().trim();
          console.warn(`[SonyRunner stderr] ${str}`);
          if (str.includes('UNSUPPORTED_MODEL')) {
            if (this.pendingConnect) {
              const cb = this.pendingConnect;
              this.pendingConnect = null;
              this.state = 'ERROR';
              cb({ success: false, error: 'Model kamera Sony ini belum didukung (Hanya ILCE-7CM2 yang diverifikasi).' });
            }
          }
        });

        this.runnerProcess.on('close', (code) => {
          console.log(`[SonyRunner] Process exited with code ${code}`);
          this.state = 'DISCONNECTED';
          this.liveViewState = 'stopped';
          this.emit('liveViewStateChange', { state: 'stopped' });
          this.emit('stateChange', { state: 'DISCONNECTED', error: 'Kamera terputus.' });
          this.concurrencyLock = false;
          this.runnerProcess = null;
          this.currentModel = null;
          if (this.pendingConnect) {
            const cb = this.pendingConnect;
            this.pendingConnect = null;
            cb({ success: false, error: 'Koneksi ke kamera Sony terputus.' });
          }
          if (this.pendingCapture) {
            const { resolve } = this.pendingCapture;
            this.pendingCapture = null;
            resolve({ success: false, error: 'Proses kamera terputus saat mengambil foto.' });
          }
        });
      } catch (err) {
        clearTimeout(connectTimeout);
        this.state = 'ERROR';
        resolve({ success: false, error: `Gagal menjalankan Sony SDK: ${err.message}` });
      }
    });
  }

  _handleStdout(text) {
    this.stdoutBuffer += text;
    const lines = this.stdoutBuffer.split('\n');
    this.stdoutBuffer = lines.pop(); // keep last partial line

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('LV_FRAME:')) {
        this.liveViewState = 'running';
        const b64 = trimmed.substring(9);
        if (b64.length > 10) {
          if (process.platform === 'win32') {
            if (!this._lastWinLvFrameLog || Date.now() - this._lastWinLvFrameLog > 3000) {
              console.log('[WIN-LV] LV_FRAME received');
              this._lastWinLvFrameLog = Date.now();
            }
          }
          const dataUrl = 'data:image/jpeg;base64,' + b64;
          this.emit('liveFrame', { frameDataUrl: dataUrl, timestamp: Date.now() });
        }
        continue;
      }

      console.log(`[SonyRunner stdout] ${trimmed}`);

      if (trimmed.includes('LIVEVIEW_STARTED') || trimmed.includes('LIVEVIEW_RESUMED')) {
        if (process.platform === 'win32') {
          console.log('[WIN-LV] LIVEVIEW_STARTED received');
        }
        this.liveViewState = 'running';
        this.emit('liveViewStateChange', { state: 'running' });
      }

      if (trimmed.includes('LIVEVIEW_STOPPED')) {
        this.liveViewState = 'stopped';
        this.emit('liveViewStateChange', { state: 'stopped' });
      }

      if (trimmed.includes('OnDisconnected') || trimmed.includes('DEVICE_DISCONNECTED')) {
        console.log('[SonyCameraBackend] Camera disconnected by hardware/USB.');
        this.state = 'DISCONNECTED';
        this.liveViewState = 'stopped';
        this.emit('liveViewStateChange', { state: 'stopped' });
        this.emit('stateChange', { state: 'DISCONNECTED', error: 'Kamera terputus (USB dicabut).' });
        if (this.runnerProcess) {
          try {
            this.runnerProcess.stdin.write('QUIT\n');
          } catch (_) {}
        }
      }

      if (trimmed.includes('CAMERA_MODEL:')) {
        const match = trimmed.match(/CAMERA_MODEL:([^\r\n]+)/);
        if (match) {
          this.currentModel = match[1].trim();
        }
        if (process.platform === 'win32') {
          console.log('[WIN-TRACE] CAMERA_MODEL received');
          console.log('[WIN-INTEGRATION] CAMERA_MODEL received');
        }
      }

      if (trimmed.includes('READY_FOR_SHUTTER')) {
        this.state = 'READY';
        if (process.platform === 'win32') {
          console.log('[WIN-TRACE] READY_FOR_SHUTTER received');
          console.log('[WIN-INTEGRATION] READY_FOR_SHUTTER received');
        }
        if (this.pendingConnect) {
          const cb = this.pendingConnect;
          this.pendingConnect = null;
          if (process.platform === 'win32') {
            console.log('[WIN-TRACE] connect resolved');
            console.log('[WIN-INTEGRATION] connect promise resolved');
          }
          cb({ success: true, model: this.currentModel, backend: this.name });
        }
      }

      if (trimmed.startsWith('CAPTURE_SUCCESS:')) {
        if (process.platform === 'win32') {
          console.log('[WIN-CAPTURE] CAPTURE_SUCCESS received');
        }
        const payload = trimmed.substring('CAPTURE_SUCCESS:'.length);
        const lastColonIdx = payload.lastIndexOf(':');
        let savedPath = payload;
        let durationMs = 0;
        if (lastColonIdx !== -1) {
          savedPath = payload.substring(0, lastColonIdx);
          durationMs = parseInt(payload.substring(lastColonIdx + 1) || '0', 10) || 0;
        }
        this.state = 'SAVED';

        if (this.pendingCapture) {
          const { resolve, timer } = this.pendingCapture;
          clearTimeout(timer);
          this.pendingCapture = null;
          resolve({
            success: true,
            filePath: savedPath,
            durationMs,
            format: 'JPG',
          });
        }
      }

      if (trimmed.includes('CAPTURE_FAILED:')) {
        this.state = 'ERROR';
        if (this.pendingCapture) {
          const { resolve, timer } = this.pendingCapture;
          clearTimeout(timer);
          this.pendingCapture = null;
          resolve({ success: false, error: 'Gagal mentransfer foto dari kamera Sony.' });
        }
      }

      if (trimmed.includes('CAMERA_RECOVERED_READY')) {
        if (process.platform === 'win32') {
          console.log('[WIN-CAPTURE] CAMERA_RECOVERED_READY received');
        }
        this.state = 'READY';
        this.concurrencyLock = false;
      }

      if (trimmed.includes('STATUS_OK:')) {
        const batMatch = trimmed.match(/battery=(\d+)/);
        if (batMatch) {
          this.batteryLevel = parseInt(batMatch[1], 10);
        }
        if (this.pendingStatus) {
          const cb = this.pendingStatus;
          this.pendingStatus = null;
          cb({ success: true, batteryLevel: this.batteryLevel, model: this.currentModel });
        }
      }
    }
  }

  /**
   * Execute single capture and download image
   * Adheres strictly to serialized concurrency lock.
   */
  async capture(profile, destinationPath, options = {}) {
    if (this.concurrencyLock || this.state === 'CAPTURING' || this.state === 'TRANSFERRING') {
      return { success: false, error: 'Kamera sedang sibuk memproses foto sebelumnya.' };
    }

    if (process.platform === 'win32') {
      console.log('[WIN-CAPTURE] SonyCameraBackend.capture called');
    }

    if (!this.runnerProcess || (this.state !== 'READY' && this.state !== 'LIVE_VIEW')) {
      return { success: false, error: 'Kamera Sony belum siap. Periksa koneksi USB.' };
    }

    this.concurrencyLock = true;
    this.state = 'CAPTURING';

    return new Promise((resolve) => {
      const timeoutMs = options.timeoutMs || 25000;
      const timer = setTimeout(() => {
        if (this.pendingCapture) {
          this.pendingCapture = null;
          this.concurrencyLock = false;
          this.state = 'ERROR';
          resolve({ success: false, error: 'Waktu tunggu foto Sony habis (Timeout 25s).' });
        }
      }, timeoutMs);

      this.pendingCapture = { resolve, timer };

      // Issue CAPTURE command with destination file path
      const cmd = destinationPath ? `CAPTURE ${destinationPath}\n` : 'CAPTURE\n';
      try {
        this.runnerProcess.stdin.write(cmd);
        if (process.platform === 'win32') {
          console.log('[WIN-CAPTURE] CAPTURE command written to runner:', cmd.trim());
        }
      } catch (err) {
        clearTimeout(timer);
        this.pendingCapture = null;
        this.concurrencyLock = false;
        this.state = 'ERROR';
        resolve({ success: false, error: `Gagal mengirim shutter command: ${err.message}` });
      }
    });
  }

  async getStatus(profile = null) {
    if (!this.runnerProcess || this.state === 'DISCONNECTED') {
      return { success: false, ready: false, batteryLevel: null };
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.pendingStatus) {
          this.pendingStatus = null;
          resolve({ success: true, ready: this.state === 'READY', batteryLevel: this.batteryLevel });
        }
      }, 3000);

      this.pendingStatus = (res) => {
        clearTimeout(timer);
        resolve({ ...res, ready: this.state === 'READY' });
      };

      try {
        this.runnerProcess.stdin.write('STATUS\n');
      } catch (e) {
        clearTimeout(timer);
        resolve({ success: false, ready: false, error: e.message });
      }
    });
  }

  async startLiveView() {
    if (this.liveViewState === 'running') {
      return { success: true, state: this.liveViewState };
    }
    if (!this.runnerProcess || this.state === 'DISCONNECTED' || this.state === 'ERROR') {
      return { success: false, error: 'Kamera belum terhubung' };
    }
    this.liveViewState = 'starting';
    this.emit('liveViewStateChange', { state: 'starting' });
    try {
      this.runnerProcess.stdin.write('START_LIVEVIEW\n');
      if (process.platform === 'win32') {
        console.log('[WIN-LV] START_LIVEVIEW written to runner');
      }
      return { success: true, state: 'starting' };
    } catch (err) {
      this.liveViewState = 'error';
      this.emit('liveViewStateChange', { state: 'error', error: err.message });
      return { success: false, error: err.message };
    }
  }

  async stopLiveView() {
    if (this.liveViewState === 'stopped') {
      return { success: true, state: 'stopped' };
    }
    this.liveViewState = 'stopping';
    this.emit('liveViewStateChange', { state: 'stopping' });
    if (this.runnerProcess) {
      try {
        this.runnerProcess.stdin.write('STOP_LIVEVIEW\n');
      } catch (_) {}
    }
    this.liveViewState = 'stopped';
    this.emit('liveViewStateChange', { state: 'stopped' });
    return { success: true, state: 'stopped' };
  }

  getLiveViewState() {
    return this.liveViewState;
  }

  async disconnect() {
    if (this.liveViewState !== 'stopped') {
      await this.stopLiveView();
    }
    if (this.runnerProcess) {
      try {
        this.runnerProcess.stdin.write('QUIT\n');
      } catch (_) {}

      setTimeout(() => {
        if (this.runnerProcess) {
          try {
            this.runnerProcess.kill('SIGTERM');
          } catch (_) {}
          this.runnerProcess = null;
        }
      }, 1000);
    }
    this.state = 'DISCONNECTED';
    this.concurrencyLock = false;
    this.currentModel = null;
    return { success: true };
  }
}

module.exports = {
  SonyCameraBackend,
};
