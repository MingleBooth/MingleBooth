/**
 * backends/canon-camera-backend.cjs
 * Universal Camera Architecture - Canon PTP Concrete Backend
 *
 * Implements CameraBackend using PTP (Picture Transfer Protocol) via bundled libgphoto2 engine.
 * Strictly isolated from Sony Camera Remote SDK.
 *
 * Supported camera brands: Canon (EOS DSLR & EOS R Mirrorless series)
 * Supported platforms: Windows (bundled gphoto2.exe + camlibs/canon.dll) & macOS
 *
 * Safe macOS USB Access Handling:
 * - Checks whether device is actually locked before requesting process release.
 * - Uses graceful SIGTERM before SIGKILL only when PTP device claim error is returned.
 */

const { spawn, execFile, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { CameraBackend } = require('./camera-backend.cjs');

class CanonCameraBackend extends CameraBackend {
  constructor(options = {}) {
    super('CanonCameraBackend', options);
    this.binDir = options.binDir || this.resolveBinDir();
    this.gphotoExe = this.resolveExecutable();
    this.env = this.buildEnvironment();
    this.state = 'DISCONNECTED'; // 'DISCONNECTED' | 'CONNECTING' | 'READY' | 'CAPTURING' | 'ERROR'
    this.liveViewState = 'stopped'; // 'stopped' | 'starting' | 'running' | 'stopping' | 'error'
    this.liveViewProcess = null;
    this.concurrencyLock = false;
    this.currentProfile = null;
    this.activeModel = null;
    this.batteryLevel = null;
    this.tetherDir = options.tetherDir || path.join(process.cwd(), 'output');
    this.liveViewSupported = true;
  }

  resolveBinDir() {
    if (process.platform === 'win32') {
      const candidates = [
        path.join(process.resourcesPath || '', 'app.asar.unpacked', 'electron', 'bin', 'win'),
        path.join(process.cwd(), 'resources', 'app.asar.unpacked', 'electron', 'bin', 'win'),
        path.resolve(__dirname.replace('app.asar', 'app.asar.unpacked'), '..', 'bin', 'win'),
        path.resolve(__dirname, '..', 'bin', 'win'),
        path.resolve(__dirname, '..', '..', 'bin', 'win'),
      ];
      for (const c of candidates) {
        if (c && fs.existsSync(c)) {
          if (fs.existsSync(path.join(c, 'gphoto2.exe'))) {
            return c;
          }
        }
      }
      return path.resolve(__dirname, '..', 'bin', 'win');
    }

    // macOS / Linux
    const candidates = [
      path.join(process.resourcesPath || '', 'app.asar.unpacked', 'electron', 'bin'),
      path.resolve(__dirname.replace('app.asar', 'app.asar.unpacked'), '..', 'bin'),
      path.resolve(__dirname, '..', 'bin'),
      '/usr/local/bin',
      '/opt/homebrew/bin',
      '/usr/bin',
    ];
    for (const c of candidates) {
      if (c && fs.existsSync(path.join(c, 'gphoto2'))) {
        return c;
      }
    }
    return '/usr/local/bin';
  }

  resolveExecutable() {
    if (process.platform === 'win32') {
      const p = path.join(this.binDir, 'gphoto2.exe');
      if (fs.existsSync(p)) return p;
      return 'gphoto2.exe';
    }
    const macCandidate = path.join(this.binDir, 'gphoto2');
    if (fs.existsSync(macCandidate)) return macCandidate;
    // Check known system paths
    for (const p of ['/usr/local/bin/gphoto2', '/opt/homebrew/bin/gphoto2', '/usr/bin/gphoto2']) {
      if (fs.existsSync(p)) return p;
    }
    return 'gphoto2';
  }

  buildEnvironment() {
    if (process.platform === 'win32') {
      return {
        ...process.env,
        PATH: `${this.binDir};${process.env.PATH || ''}`,
        CAMLIBS: path.join(this.binDir, 'camlibs'),
        IOLIBS: path.join(this.binDir, 'iolibs'),
        LC_ALL: 'C',
        LANG: 'C',
      };
    }
    return {
      ...process.env,
      LC_ALL: 'C',
      LANG: 'C',
    };
  }

  /**
   * Safe check and release of macOS PTP lock only when needed.
   * Avoids blind pkill commands that could affect other applications.
   */
  async _safelyReleaseMacOSUsbLockIfNeeded() {
    if (process.platform !== 'darwin') return;

    try {
      // Check if PTPCamera process is actually running before doing anything
      const pidStr = execSync('pgrep -x PTPCamera || true', { encoding: 'utf8', timeout: 2000 }).trim();
      if (!pidStr) {
        return; // Process is not running; no action needed
      }

      console.log(`[CanonCameraBackend] macOS PTPCamera daemon detected (PID: ${pidStr}). Sending graceful SIGTERM...`);
      execSync(`kill -15 ${pidStr} 2>/dev/null || true`, { timeout: 2000 });
      // Brief pause for port release
      await new Promise((r) => setTimeout(r, 200));

      // Re-check if still alive
      const remainingPid = execSync('pgrep -x PTPCamera || true', { encoding: 'utf8', timeout: 2000 }).trim();
      if (remainingPid) {
        console.warn(`[CanonCameraBackend] PTPCamera still running, applying SIGKILL...`);
        execSync(`kill -9 ${remainingPid} 2>/dev/null || true`, { timeout: 2000 });
        await new Promise((r) => setTimeout(r, 150));
      }
    } catch (err) {
      console.warn('[CanonCameraBackend] Safe USB lock release warning (non-fatal):', err.message);
    }
  }

  /**
   * Return dynamic capabilities based on identified profile
   */
  getCapabilities(profile) {
    const prof = profile || this.currentProfile;
    if (prof && prof.capabilities) {
      return {
        capture: prof.capabilities.remoteCapture !== false,
        download: prof.capabilities.imageDownload !== false,
        liveView: prof.capabilities.liveView === true,
        batteryStatus: prof.capabilities.batteryStatus !== false,
        identification: prof.capabilities.identification !== false,
      };
    }
    return {
      capture: true,
      download: true,
      liveView: this.liveViewSupported,
      batteryStatus: true,
      identification: false,
    };
  }

  getState() {
    return this.state;
  }

  getLiveViewState() {
    return this.liveViewState;
  }

  /**
   * Detect Canon cameras connected to USB bus
   */
  async detect(profile = null) {
    return new Promise((resolve) => {
      if (!this.gphotoExe || (!fs.existsSync(this.gphotoExe) && process.platform === 'win32')) {
        return resolve({
          success: false,
          cameras: [],
          error: 'Engine PTP Canon tidak ditemukan pada sistem.',
        });
      }

      const args = ['--auto-detect'];
      execFile(this.gphotoExe, args, { env: this.env, timeout: 8000 }, (err, stdout, stderr) => {
        if (err || !stdout) {
          return resolve({ success: false, cameras: [], error: stderr || err?.message });
        }

        const lines = stdout.split('\n');
        const cameras = [];
        let tableHeaderFound = false;

        for (const line of lines) {
          if (line.includes('-----------------')) {
            tableHeaderFound = true;
            continue;
          }
          if (tableHeaderFound && line.trim()) {
            const match = line.match(/^(.+?)\s{2,}(usb:\S+.*)$/);
            if (match) {
              const modelName = match[1].trim();
              const portName = match[2].trim();
              if (/canon|eos/i.test(modelName)) {
                cameras.push({
                  model: modelName,
                  manufacturer: 'Canon',
                  port: portName,
                  backend: 'canon-ptp',
                  connection: 'USB (PTP)',
                });
              }
            }
          }
        }

        resolve({ success: true, cameras });
      });
    });
  }

  /**
   * Connect to Canon camera via PTP handshake (--summary)
   */
  async connect(profile = null) {
    if (this.state === 'READY' && this.activeModel) {
      return { success: true, model: this.activeModel, backend: this.name };
    }

    this.state = 'CONNECTING';
    this.currentProfile = profile;

    if (profile && profile.capabilities && profile.capabilities.liveView === false) {
      this.liveViewSupported = false;
    } else {
      this.liveViewSupported = true;
    }

    return new Promise(async (resolve) => {
      const executeHandshake = (attempt = 1) => {
        const args = ['--summary'];
        console.log(`[CanonCameraBackend] Connecting to Canon camera (Attempt ${attempt}): ${this.gphotoExe} ${args.join(' ')}`);

        execFile(this.gphotoExe, args, { env: this.env, timeout: 12000 }, async (err, stdout, stderr) => {
          if (err) {
            const errStr = (stderr || err.message || '').toLowerCase();
            console.warn(`[CanonCameraBackend] PTP handshake error (Attempt ${attempt}):`, errStr);

            // If macOS device is busy or claimed, attempt safe condition-checked release once
            if (process.platform === 'darwin' && attempt === 1 && (errStr.includes('claim') || errStr.includes('busy') || errStr.includes('-53'))) {
              console.log('[CanonCameraBackend] Device busy on macOS. Evaluating safe USB release...');
              await this._safelyReleaseMacOSUsbLockIfNeeded();
              return executeHandshake(2);
            }

            this.state = 'ERROR';
            this.emit('stateChange', { state: 'ERROR', error: 'Gagal menghubungkan kamera Canon.' });
            return resolve({
              success: false,
              error: 'Tidak dapat membuka sesi PTP dengan kamera Canon. Pastikan Wi-Fi kamera dimatikan dan kabel USB terpasang kencang.',
              technicalError: stderr || err.message,
            });
          }

          // Parse model from summary output
          let modelName = profile?.displayName || profile?.model || 'Canon EOS Camera';
          const modelMatch = stdout.match(/Camera model\s*:\s*(.+)/i) || stdout.match(/Model\s*:\s*(.+)/i);
          if (modelMatch && modelMatch[1]) {
            modelName = modelMatch[1].trim();
          }

          // Parse battery level if available in summary
          const batMatch = stdout.match(/Battery Level\s*:\s*(.+)/i) || stdout.match(/batterylevel\s*:\s*(\d+)%/i);
          if (batMatch && batMatch[1]) {
            const rawBat = batMatch[1].trim();
            const num = parseInt(rawBat, 10);
            this.batteryLevel = !isNaN(num) ? num : null;
          }

          this.activeModel = modelName;
          this.state = 'READY';
          this.emit('stateChange', { state: 'READY', camera: { model: this.activeModel, brand: 'Canon' } });

          resolve({
            success: true,
            model: this.activeModel,
            batteryLevel: this.batteryLevel,
            backend: this.name,
            capabilities: this.getCapabilities(profile),
          });
        });
      };

      executeHandshake(1);
    });
  }

  /**
   * Disconnect active Canon session and stop any live view
   */
  async disconnect() {
    if (this.liveViewState !== 'stopped') {
      await this.stopLiveView();
    }
    this.state = 'DISCONNECTED';
    this.concurrencyLock = false;
    this.activeModel = null;
    this.currentProfile = null;
    this.emit('stateChange', { state: 'DISCONNECTED' });
    return { success: true };
  }

  /**
   * Query status / battery level
   */
  async getStatus(profile = null) {
    if (this.state === 'DISCONNECTED') {
      return { success: false, ready: false, batteryLevel: null };
    }

    return new Promise((resolve) => {
      const args = ['--get-config', '/main/status/batterylevel'];
      execFile(this.gphotoExe, args, { env: this.env, timeout: 6000 }, (err, stdout) => {
        if (err || !stdout) {
          return resolve({ success: true, ready: this.state === 'READY', batteryLevel: this.batteryLevel });
        }
        const match = stdout.match(/Current:\s*(\d+)/i) || stdout.match(/Current:\s*(.+)/i);
        if (match) {
          const val = match[1].trim();
          const parsed = parseInt(val, 10);
          if (!isNaN(parsed)) {
            this.batteryLevel = parsed;
          }
        }
        resolve({ success: true, ready: this.state === 'READY', batteryLevel: this.batteryLevel });
      });
    });
  }

  /**
   * Trigger capture and download image with concurrency protection
   */
  async capture(profile, destinationPath, options = {}) {
    if (this.concurrencyLock || this.state === 'CAPTURING') {
      return { success: false, error: 'Kamera Canon sedang sibuk memproses foto sebelumnya.' };
    }

    if (this.state !== 'READY') {
      return { success: false, error: 'Kamera Canon belum siap. Periksa kabel USB.' };
    }

    this.concurrencyLock = true;
    this.state = 'CAPTURING';
    this.emit('stateChange', { state: 'CAPTURING' });

    // Ensure target directory exists
    const destDir = path.dirname(destinationPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // If live view is active, pause it cleanly so USB bus is fully dedicated to shutter transfer
    const wasLiveViewRunning = this.liveViewState === 'running';
    if (wasLiveViewRunning) {
      console.log('[CanonCameraBackend] Pausing Live View during capture...');
      await this.stopLiveView();
      await new Promise((r) => setTimeout(r, 200));
    }

    return new Promise((resolve) => {
      const timeoutMs = options.timeoutMs || 25000;
      const startTime = Date.now();
      const args = [
        '--capture-image-and-download',
        '--filename',
        destinationPath,
        '--force-overwrite',
      ];

      console.log(`[CanonCameraBackend] Triggering capture: ${this.gphotoExe} ${args.join(' ')}`);

      execFile(this.gphotoExe, args, { env: this.env, timeout: timeoutMs }, async (err, stdout, stderr) => {
        const durationMs = Date.now() - startTime;
        this.concurrencyLock = false;

        if (err) {
          console.error('[CanonCameraBackend] Capture failed:', stderr || err.message);
          this.state = 'READY'; // Recover back to READY
          this.emit('stateChange', { state: 'READY' });

          // Resume live view if it was active
          if (wasLiveViewRunning) {
            this.startLiveView(profile).catch(() => {});
          }

          return resolve({
            success: false,
            error: 'Gagal mengambil foto dari kamera Canon. Pastikan kamera tidak dalam mode burst dan memori kartu/buffer tersedia.',
            technicalError: stderr || err.message,
          });
        }

        const fileExists = fs.existsSync(destinationPath);
        this.state = 'READY';
        this.emit('stateChange', { state: 'READY' });

        // Resume live view if it was active
        if (wasLiveViewRunning) {
          this.startLiveView(profile).catch(() => {});
        }

        if (fileExists) {
          resolve({
            success: true,
            filePath: destinationPath,
            durationMs,
            format: 'JPG',
          });
        } else {
          resolve({
            success: false,
            error: 'Foto diambil tetapi file tidak ditemukan di hot folder tujuan.',
          });
        }
      });
    });
  }

  /**
   * Start Live View stream (MJPEG frame demuxing)
   */
  async startLiveView(profile = null) {
    if (!this.liveViewSupported) {
      return { success: false, supported: false, error: 'Fitur Live View tidak didukung pada model Canon ini.' };
    }

    if (this.liveViewState === 'running') {
      return { success: true, state: this.liveViewState };
    }

    if (this.state === 'DISCONNECTED' || this.state === 'ERROR') {
      return { success: false, error: 'Kamera belum terhubung' };
    }

    this.liveViewState = 'starting';
    this.emit('liveViewStateChange', { state: 'starting' });

    try {
      const args = ['--capture-movie', '--stdout'];
      console.log(`[CanonCameraBackend] Starting Live View stream: ${this.gphotoExe} ${args.join(' ')}`);

      this.liveViewProcess = spawn(this.gphotoExe, args, {
        env: this.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let buffer = Buffer.alloc(0);
      this.liveViewState = 'running';
      this.emit('liveViewStateChange', { state: 'running' });

      this.liveViewProcess.stdout.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);

        // Find JPEG Start Of Image (0xFF, 0xD8) and End Of Image (0xFF, 0xD9)
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

        // Safety cap buffer to 5MB to prevent memory leak
        if (buffer.length > 5 * 1024 * 1024) {
          buffer = Buffer.alloc(0);
        }
      });

      this.liveViewProcess.stderr.on('data', (chunk) => {
        const text = chunk.toString().trim();
        if (text && !text.includes('Capturing preview frames') && !text.includes('Movie-capture')) {
          console.warn('[CanonLiveView stderr]', text);
        }
      });

      this.liveViewProcess.on('close', (code) => {
        console.log(`[CanonLiveView] Process closed with code ${code}`);
        this.liveViewProcess = null;
        this.liveViewState = 'stopped';
        this.emit('liveViewStateChange', { state: 'stopped' });
      });

      this.liveViewProcess.on('error', (err) => {
        console.error('[CanonLiveView] Process error:', err);
        this.liveViewProcess = null;
        this.liveViewState = 'error';
        this.emit('liveViewStateChange', { state: 'error', error: err.message });
      });

      return { success: true, state: 'running' };
    } catch (err) {
      this.liveViewState = 'error';
      this.emit('liveViewStateChange', { state: 'error', error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Stop Live View stream cleanly
   */
  async stopLiveView() {
    if (this.liveViewState === 'stopped' || !this.liveViewProcess) {
      this.liveViewState = 'stopped';
      return { success: true, state: 'stopped' };
    }

    this.liveViewState = 'stopping';
    this.emit('liveViewStateChange', { state: 'stopping' });

    return new Promise((resolve) => {
      const proc = this.liveViewProcess;
      this.liveViewProcess = null;

      if (proc) {
        try {
          proc.kill('SIGTERM');
        } catch (_) {}

        setTimeout(() => {
          try {
            if (proc.exitCode === null) {
              proc.kill('SIGKILL');
            }
          } catch (_) {}
          this.liveViewState = 'stopped';
          this.emit('liveViewStateChange', { state: 'stopped' });
          resolve({ success: true, state: 'stopped' });
        }, 300);
      } else {
        this.liveViewState = 'stopped';
        this.emit('liveViewStateChange', { state: 'stopped' });
        resolve({ success: true, state: 'stopped' });
      }
    });
  }
}

module.exports = {
  CanonCameraBackend,
};

