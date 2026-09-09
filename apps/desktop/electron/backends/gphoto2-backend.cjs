/**
 * backends/gphoto2-backend.cjs
 * Universal Camera Architecture - GPhoto2 Concrete Backend
 *
 * Implements CameraBackend using bundled gphoto2 engine.
 * Dynamic argument injection: injects profile-specific USB ID arguments
 * without hardcoding manufacturer rules inside the backend.
 */

const { execFile, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { CameraBackend } = require('./camera-backend.cjs');

class GPhoto2Backend extends CameraBackend {
  constructor(options = {}) {
    super('GPhoto2Backend', options);
    this.binDir = options.binDir || this.resolveBinDir();
    this.gphotoExe = this.resolveExecutable();
    this.env = this.buildEnvironment();
  }

  resolveBinDir() {
    if (process.platform === 'win32') {
      const candidates = [
        path.resolve(__dirname, '..', 'bin', 'win'),
        path.resolve(__dirname, '..', '..', 'bin', 'win'),
        path.join(process.cwd(), 'resources', 'app.asar.unpacked', 'electron', 'bin', 'win'),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) return c;
      }
      return path.resolve(__dirname, '..', 'bin', 'win');
    }
    return '';
  }

  resolveExecutable() {
    if (process.platform === 'win32') {
      return path.join(this.binDir, 'gphoto2.exe');
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

  getProfileArgs(profile) {
    if (profile && profile.backendOptions && Array.isArray(profile.backendOptions.usbidArgs)) {
      return [...profile.backendOptions.usbidArgs];
    }
    return [];
  }

  /**
   * Run auto-detect using dynamic profile flags
   */
  async detect(profile = null) {
    return new Promise((resolve) => {
      const profileArgs = this.getProfileArgs(profile);
      const args = [...profileArgs, '--auto-detect'];

      execFile(this.gphotoExe, args, { env: this.env, timeout: 10000 }, (err, stdout) => {
        if (err) {
          return resolve({ success: false, cameras: [], error: err.message });
        }
        const lines = (stdout || '').split('\n').filter((l) => l.trim() && !l.includes('---') && !l.toLowerCase().includes('model'));
        const cameras = lines.map((l) => {
          const parts = l.trim().split(/\s{2,}/);
          return {
            model: parts[0] || 'Unknown Camera',
            port: parts[1] || 'usb:',
          };
        });
        resolve({ success: true, cameras });
      });
    });
  }

  /**
   * Connect and handshake via summary
   */
  async connect(profile) {
    return new Promise((resolve) => {
      const profileArgs = this.getProfileArgs(profile);
      const args = [...profileArgs, '--summary'];

      execFile(this.gphotoExe, args, { env: this.env, timeout: 12000 }, (err, stdout) => {
        if (err) {
          return resolve({ success: false, error: err.message });
        }
        resolve({
          success: true,
          summary: stdout,
          backend: this.name,
        });
      });
    });
  }

  async disconnect() {
    // Stateless PTP does not keep an open socket across invocations
    return { success: true };
  }

  /**
   * Query status / battery level
   */
  async getStatus(profile) {
    return new Promise((resolve) => {
      const profileArgs = this.getProfileArgs(profile);
      const args = [...profileArgs, '--get-config', '/main/status/batterylevel'];

      execFile(this.gphotoExe, args, { env: this.env, timeout: 8000 }, (err, stdout) => {
        if (err) {
          return resolve({ success: false, batteryLevel: null, error: err.message });
        }
        const match = stdout.match(/Current:\s*(\d+)/i) || stdout.match(/Current:\s*(.+)/i);
        const val = match ? match[1].trim() : 'OK';
        resolve({ success: true, batteryLevel: val });
      });
    });
  }

  /**
   * Execute capture and download
   */
  async capture(profile, destinationPath, options = {}) {
    return new Promise((resolve) => {
      const profileArgs = this.getProfileArgs(profile);
      const timeoutMs = options.timeoutMs || 25000;
      const args = [
        ...profileArgs,
        '--capture-image-and-download',
        '--filename',
        destinationPath,
        '--force-overwrite',
      ];

      execFile(this.gphotoExe, args, { env: this.env, timeout: timeoutMs }, (err, stdout, stderr) => {
        if (err) {
          return resolve({
            success: false,
            error: err.message,
            stderr: stderr || '',
            exitCode: err.code,
          });
        }
        const downloaded = fs.existsSync(destinationPath);
        resolve({
          success: downloaded,
          filePath: destinationPath,
          stdout,
          stderr,
        });
      });
    });
  }
}

module.exports = {
  GPhoto2Backend,
};
