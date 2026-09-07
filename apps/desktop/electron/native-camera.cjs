const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const EventEmitter = require('events');

class NativeCameraService extends EventEmitter {
  constructor(tetherDir) {
    super();
    this.tetherDir = tetherDir || path.resolve(__dirname, '../../../data/tether-inbox');
    this.tetherProcess = null;
    this.isInstalling = false;
    this.detectedCameras = [];
    this.activeCameraModel = null;
    this.gphotoBinary = this.findGphotoBinary();

    if (!fs.existsSync(this.tetherDir)) {
      try {
        fs.mkdirSync(this.tetherDir, { recursive: true });
      } catch (e) {}
    }
  }

  findGphotoBinary() {
    const candidatePaths = [
      '/usr/local/bin/gphoto2',
      '/opt/homebrew/bin/gphoto2',
      '/usr/bin/gphoto2',
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) return p;
    }
    return 'gphoto2'; // fallback to PATH
  }

  async checkDriverStatus() {
    return new Promise((resolve) => {
      const binary = this.findGphotoBinary();
      exec(`"${binary}" --version`, (err, stdout) => {
        if (!err && stdout && stdout.includes('gphoto2')) {
          this.gphotoBinary = binary;
          resolve({
            installed: true,
            version: stdout.split('\n')[0] || 'gphoto2 available',
            binaryPath: binary,
          });
        } else {
          // Also check which brew is available
          exec('which brew', (brewErr, brewOut) => {
            resolve({
              installed: false,
              hasHomebrew: !brewErr && Boolean(brewOut.trim()),
              brewPath: brewOut.trim() || null,
              message: 'Universal gphoto2 driver belum terpasang.',
            });
          });
        }
      });
    });
  }

  async installDriver(onProgress) {
    if (this.isInstalling) {
      return { success: false, message: 'Instalasi sedang berjalan...' };
    }

    this.isInstalling = true;
    return new Promise((resolve) => {
      // Find brew path
      const brewCmd = fs.existsSync('/usr/local/bin/brew')
        ? '/usr/local/bin/brew'
        : fs.existsSync('/opt/homebrew/bin/brew')
        ? '/opt/homebrew/bin/brew'
        : 'brew';

      const log = (msg) => {
        console.log('[NativeCamera Install]', msg);
        if (typeof onProgress === 'function') onProgress(msg);
        this.emit('installLog', msg);
      };

      log('Memulai instalasi driver universal gphoto2 via Homebrew...');
      const child = spawn(brewCmd, ['install', 'gphoto2'], {
        env: {
          ...process.env,
          HOMEBREW_NO_AUTO_UPDATE: '1',
          HOMEBREW_NO_INSTALL_CLEANUP: '1',
        },
      });

      child.stdout.on('data', (d) => {
        const text = d.toString().trim();
        if (text) log(text);
      });

      child.stderr.on('data', (d) => {
        const text = d.toString().trim();
        if (text) log(text);
      });

      child.on('close', (code) => {
        this.isInstalling = false;
        this.gphotoBinary = this.findGphotoBinary();
        if (code === 0) {
          log('✅ Instalasi gphoto2 BERHASIL! Kamera siap digunakan langsung.');
          resolve({ success: true, message: 'Driver gphoto2 berhasil terpasang!' });
        } else {
          log(`⚠️ Instalasi selesai dengan exit code: ${code}`);
          // Re-verify if binary was actually installed
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
        log(`Error menjalankan brew: ${err.message}`);
        resolve({ success: false, error: err.message });
      });
    });
  }

  // Release macOS PTPCamera process that locks USB camera port
  async releaseMacOSUsbLock() {
    return new Promise((resolve) => {
      if (process.platform !== 'darwin') {
        resolve({ released: true, platform: process.platform });
        return;
      }

      exec('killall PTPCamera', (err, stdout, stderr) => {
        console.log('[NativeCamera] Released PTPCamera process lock (if any).');
        resolve({ released: true, message: 'Port USB dibebaskan dari Apple PTPCamera.' });
      });
    });
  }

  // Detect connected cameras via USB
  async detectConnectedCameras() {
    await this.releaseMacOSUsbLock();
    const binary = this.findGphotoBinary();

    return new Promise((resolve) => {
      exec(`"${binary}" --auto-detect`, (err, stdout, stderr) => {
        if (err) {
          console.warn('[NativeCamera] Error during auto-detect:', err.message);
          resolve({ success: false, cameras: [], error: err.message });
          return;
        }

        const lines = stdout.trim().split('\n');
        const cameras = [];

        // Format is typically:
        // Model                          Port
        // ----------------------------------------------------------
        // Sony Alpha 7 IV                usb:001,005
        for (let i = 2; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const match = line.match(/^(.+?)\s{2,}(usb:\S+.*)$/);
          if (match) {
            cameras.push({
              model: match[1].trim(),
              port: match[2].trim(),
            });
          } else {
            cameras.push({
              model: line,
              port: 'usb',
            });
          }
        }

        this.detectedCameras = cameras;
        if (cameras.length > 0) {
          this.activeCameraModel = cameras[0].model;
        }
        console.log('[NativeCamera] Detected cameras:', cameras);
        resolve({
          success: true,
          cameras,
          activeModel: this.activeCameraModel,
        });
      });
    });
  }

  // Start background tethered watcher: listens for physical shutter clicks directly
  async startNativeTether() {
    if (this.tetherProcess) {
      return { success: true, message: 'Native tethering process already running.' };
    }

    await this.releaseMacOSUsbLock();
    const binary = this.findGphotoBinary();

    console.log(`[NativeCamera] Starting tether capture process in ${this.tetherDir}...`);

    return new Promise((resolve) => {
      const args = [
        '--capture-tethered',
        '--filename=%Y%m%d_%H%M%S.%C',
        '--keep', // Keep photo on SD card as backup
      ];

      this.tetherProcess = spawn(binary, args, {
        cwd: this.tetherDir,
        env: process.env,
      });

      this.tetherProcess.stdout.on('data', (data) => {
        const text = data.toString();
        console.log('[NativeCamera stdout]', text.trim());
        if (text.includes('Saving file as') || text.includes('New file is at')) {
          this.emit('shutterFired', { raw: text });
        }
      });

      this.tetherProcess.stderr.on('data', (data) => {
        console.warn('[NativeCamera stderr]', data.toString().trim());
      });

      this.tetherProcess.on('close', (code) => {
        console.log('[NativeCamera] Tether process closed with code:', code);
        this.tetherProcess = null;
        this.emit('tetherClosed', code);
      });

      this.tetherProcess.on('error', (err) => {
        console.error('[NativeCamera] Failed to start tether process:', err);
        this.tetherProcess = null;
      });

      // Give process 600ms to establish connection
      setTimeout(() => {
        resolve({
          success: Boolean(this.tetherProcess),
          tetherDir: this.tetherDir,
        });
      }, 600);
    });
  }

  stopNativeTether() {
    if (this.tetherProcess) {
      try {
        this.tetherProcess.kill('SIGINT');
      } catch (e) {}
      this.tetherProcess = null;
      console.log('[NativeCamera] Stopped native tether process.');
    }
  }

  // Direct trigger shutter via USB (when button on screen is clicked)
  async triggerDirectCapture() {
    await this.releaseMacOSUsbLock();
    const binary = this.findGphotoBinary();

    return new Promise((resolve) => {
      const filename = `direct_${Date.now()}.jpg`;
      const fullPath = path.join(this.tetherDir, filename);

      const cmd = `"${binary}" --capture-image-and-download --filename="${filename}" --keep`;

      console.log('[NativeCamera] Executing direct shutter trigger:', cmd);

      exec(cmd, { cwd: this.tetherDir }, (err, stdout, stderr) => {
        if (err) {
          console.error('[NativeCamera] Direct capture error:', err.message);
          resolve({ success: false, error: err.message });
          return;
        }

        console.log('[NativeCamera] Direct capture success:', stdout);
        resolve({
          success: true,
          filename,
          filePath: fullPath,
          stdout,
        });
      });
    });
  }
}

// Singleton factory
let nativeInstance = null;
function getNativeCameraService(tetherDir) {
  if (!nativeInstance) {
    nativeInstance = new NativeCameraService(tetherDir);
  }
  return nativeInstance;
}

module.exports = {
  NativeCameraService,
  getNativeCameraService,
};
