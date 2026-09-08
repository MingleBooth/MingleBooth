const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const EventEmitter = require('events');

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

/**
 * Camera Session States:
 * 'DISCONNECTED' -> 'DETECTING' -> 'CONNECTING' -> 'CONNECTED' -> 'READY' -> 'CAPTURING' -> 'TRANSFERRING' -> 'PROCESSING' -> 'COMPLETED' -> 'ERROR'
 */
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
    this.errorMessage = null;
    this.connectedCamera = null;
    this.detectedCameras = [];
    this.activeCameraModel = null;
    this.gphotoBinary = this.findGphotoBinary();
    this.deduplicator = new PhotoDeduplicator(15000);
    this.pendingCapturePromise = null;
    this.tetherServerRef = null;

    if (!fs.existsSync(this.tetherDir)) {
      try {
        fs.mkdirSync(this.tetherDir, { recursive: true });
      } catch (e) {}
    }
  }

  setTetherServer(tetherServer) {
    this.tetherServerRef = tetherServer;
  }

  setState(newState, payload = {}) {
    const prevState = this.state;
    this.state = newState;
    if (payload.error) {
      this.errorMessage = payload.error;
    } else if (newState === 'CONNECTED' || newState === 'READY' || newState === 'DISCONNECTED') {
      this.errorMessage = null;
    }

    const eventPayload = {
      prevState,
      state: this.state,
      camera: this.connectedCamera,
      error: this.errorMessage,
      timestamp: Date.now(),
      ...payload,
    };

    console.log(`[NativeCamera State] ${prevState} ➔ ${this.state}`, payload.error ? `Error: ${payload.error}` : '');
    this.emit('stateChange', eventPayload);
  }

  getState() {
    return {
      state: this.state,
      camera: this.connectedCamera,
      error: this.errorMessage,
      isLiveViewActive: this.isLiveViewActive,
    };
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
    return 'gphoto2';
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

  /**
   * Release macOS PTPCamera & ptpcamerad processes that aggressively lock USB camera port.
   * Notice: ptpcamerad is a launchd daemon (com.apple.ptpcamerad). Simply killall -9 causes launchd
   * to immediately respawn it. We use launchctl stop + pkill -STOP to prevent respawning.
   */
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
        console.log('[NativeCamera] Released macOS PTPCamera & ptpcamerad process locks.');
        resolve({ released: true, message: 'Port USB dibebaskan dari Apple PTPCamera & ptpcamerad.' });
      });
    });
  }

  /**
   * Detect connected physical cameras via USB
   */
  async detectConnectedCameras() {
    this.setState('DETECTING');
    await this.releaseMacOSUsbLock();

    return new Promise((resolve) => {
      const scanSystemUsb = () => {
        const cameras = [];

        if (process.platform === 'darwin') {
          exec('ioreg -p IOUSB -l -w 0', (ioErr, ioOut) => {
            if (!ioErr && ioOut) {
              const usbBlocks = ioOut.split(/\+\-o\s+/);
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

                // Decimal Vendor IDs:
                // 1356 = Sony (0x054c)
                // 1193 = Canon (0x04a9)
                // 1200 = Nikon (0x04b0)
                // 1041 = Fujifilm (0x0411)
                // 1242 = Panasonic/Lumix (0x04da)
                // 1972 = Olympus/OM System (0x07b4)
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
          return;
        }

        if (process.platform === 'win32') {
          exec(
            'powershell -NoProfile -Command "Get-PnpDevice -PresentOnly | Where-Object { $_.Class -in @(\'Camera\',\'Image\',\'WPD\') -or $_.InstanceId -match \'VID_(054C|04A9|04B0|0411|04DA|07B4)\' } | Select-Object -ExpandProperty FriendlyName | ConvertTo-Json"',
            (winErr, winOut) => {
              if (!winErr && winOut) {
                try {
                  const parsed = JSON.parse(winOut);
                  const names = Array.isArray(parsed) ? parsed : [parsed];
                  for (const name of names) {
                    if (name && typeof name === 'string') {
                      cameras.push({ model: name, port: 'usb:camera' });
                    }
                  }
                } catch {
                  if (/Sony/i.test(winOut)) cameras.push({ model: 'Sony Digital Camera', port: 'usb:camera' });
                  else if (/Canon/i.test(winOut)) cameras.push({ model: 'Canon EOS Digital Camera', port: 'usb:camera' });
                  else if (/Nikon/i.test(winOut)) cameras.push({ model: 'Nikon Digital Camera', port: 'usb:camera' });
                  else cameras.push({ model: 'Kamera DSLR / Mirrorless USB', port: 'usb:camera' });
                }
              }
              this.finishDetection(cameras, resolve);
            }
          );
          return;
        }

        this.finishDetection(cameras, resolve);
      };

      const binary = this.findGphotoBinary();
      exec(`"${binary}" --auto-detect`, (err, stdout) => {
        if (err || !stdout) {
          scanSystemUsb();
          return;
        }

        const lines = stdout.trim().split('\n');
        const cameras = [];

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

        if (cameras.length > 0) {
          this.finishDetection(cameras, resolve);
          return;
        }

        scanSystemUsb();
      });
    });
  }

  finishDetection(cameras, resolve) {
    this.detectedCameras = cameras;
    if (cameras.length > 0) {
      this.activeCameraModel = cameras[0].model;
      this.errorMessage = null;
      this.setState(this.connectedCamera ? 'CONNECTED' : 'DISCONNECTED', {
        cameras,
        error: null,
      });
      resolve({
        success: true,
        cameras,
        activeModel: this.activeCameraModel,
      });
    } else {
      this.activeCameraModel = null;
      this.connectedCamera = null;
      this.errorMessage = null;
      this.setState('DISCONNECTED', {
        cameras: [],
        error: null,
      });
      resolve({
        success: false,
        cameras: [],
      });
    }
  }

  getUsbidArgs() {
    const cam = this.connectedCamera || (this.detectedCameras && this.detectedCameras[0]);
    if (cam && cam.vendorId === 1356 && cam.productId === 3754) {
      return ['--usbid', '0x054c:0x0eaa=0x054c:0x0d56'];
    }
    return [];
  }

  getUsbidFlag() {
    const args = this.getUsbidArgs();
    return args.length > 0 ? args.join(' ') : '';
  }

  findHubBinary() {
    // 1. If running inside packaged Electron app, check app.asar.unpacked
    if (process.resourcesPath) {
      const unpackedRes = path.join(process.resourcesPath, 'app.asar.unpacked/electron/bin/sony_camera_hub');
      if (fs.existsSync(unpackedRes)) return unpackedRes;
    }

    // 2. If __dirname is inside app.asar, rewrite path to app.asar.unpacked
    const unpackedDir = path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), 'bin/sony_camera_hub');
    if (fs.existsSync(unpackedDir)) return unpackedDir;

    // 3. Development / source candidate paths
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
   * Start Unified Camera Hub session (Native C runner linking directly to libgphoto2)
   * Delivers simultaneous Live View MJPEG stream + Physical Shutter event detection + High-res transfer
   */
  startUnifiedHubSession(resolve, targetCamera) {
    let resolvedOnce = false;
    this.stopUnifiedHubSession();
    const hubBinary = this.findHubBinary();
    if (!hubBinary) {
      if (resolve) resolve({ success: false, error: 'Hub binary not found' });
      return;
    }

    console.log('[NativeCamera] 🚀 Spawning Unified Camera Hub session:', hubBinary, this.tetherDir);

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
          this.emit('liveFrame', {
            frameDataUrl: base64,
            timestamp: Date.now(),
          });

          startIndex = buffer.indexOf(Buffer.from([0xff, 0xd8]));
        }

        if (buffer.length > 5 * 1024 * 1024) {
          buffer = Buffer.alloc(0);
        }
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
              model: model || 'Sony ILCE-7CM2',
              port: 'usb:ptp',
              connectedAt: Date.now(),
            };
            this.activeCameraModel = this.connectedCamera.model;
            this.errorMessage = null;
            this.setState('CONNECTED', { camera: this.connectedCamera, error: null });
            this.setState('READY', { camera: this.connectedCamera, error: null });
            if (!resolvedOnce && resolve) {
              resolvedOnce = true;
              resolve({ success: true, state: 'READY', camera: this.connectedCamera });
            }
          } else if (trimmed.startsWith('PHOTO:CAPTURED:')) {
            const filePath = trimmed.substring('PHOTO:CAPTURED:'.length).trim();
            console.log('[NativeCamera Hub] 📷 Photo captured event from camera:', filePath);
            const source = this.pendingCapturePromise ? 'sony_ui_capture' : 'sony_physical_shutter';
            this.ingestPhotoFile(filePath, path.basename(filePath), source);
          } else if (trimmed.startsWith('STATUS:CAPTURING')) {
            this.setState('CAPTURING');
          } else if (trimmed.startsWith('STATUS:PHYSICAL_SHUTTER:')) {
            console.log('[NativeCamera Hub] 🔘 Physical shutter pressed on Sony camera body:', trimmed);
          } else if (trimmed.startsWith('STATUS:ERROR:') || trimmed.startsWith('STATUS:FATAL_ERROR:')) {
            console.warn('[NativeCamera Hub]', trimmed);
            if (!resolvedOnce && resolve) {
              resolvedOnce = true;
              const errMsg = 'PC Remote connection failed. Pastikan kamera di mode FOTO (M) -> USB Connection: PC Remote dan port USB tidak terkunci.';
              this.connectedCamera = null;
              this.setState('ERROR', { error: errMsg });
              resolve({ success: false, error: errMsg });
            }
          } else {
            console.log('[NativeCamera Hub log]', trimmed);
          }
        }
      });

      this.hubProcess.on('close', (code) => {
        console.log('[NativeCamera Hub] Process ended with code:', code);
        this.hubProcess = null;
        this.isLiveViewActive = false;
        this.isTetherActive = false;
        this.connectedCamera = null;
        this.setState('DISCONNECTED', { error: null });
        if (!resolvedOnce && resolve) {
          resolvedOnce = true;
          resolve({ success: false, error: 'Hub process terminated' });
        }
      });

      this.hubProcess.on('error', (err) => {
        console.error('[NativeCamera Hub] Spawn error:', err);
        this.hubProcess = null;
        this.isLiveViewActive = false;
        this.isTetherActive = false;
        this.setState('ERROR', { error: err.message });
        if (!resolvedOnce && resolve) {
          resolvedOnce = true;
          resolve({ success: false, error: err.message });
        }
      });
    } catch (err) {
      console.error('[NativeCamera Hub] Exception starting hub session:', err);
      this.isLiveViewActive = false;
      this.isTetherActive = false;
      if (!resolvedOnce && resolve) {
        resolvedOnce = true;
        resolve({ success: false, error: err.message });
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

  /**
   * Connect to physical camera via PTP PC Remote protocol
   */
  async connectCamera(targetCamera) {
    this.errorMessage = null;
    this.setState('CONNECTING', { error: null });
    await this.releaseMacOSUsbLock();

    const cameraToConnect = targetCamera || this.detectedCameras[0];
    if (!cameraToConnect) {
      const errMsg = 'Kamera tidak terdeteksi pada port USB. Pastikan kabel USB terhubung dan kamera menyala pada mode PC Remote.';
      this.setState('DISCONNECTED', { error: errMsg });
      return { success: false, error: errMsg };
    }

    const hubBinary = this.findHubBinary();
    if (hubBinary) {
      return new Promise((resolve) => {
        this.startUnifiedHubSession(resolve, cameraToConnect);
      });
    }

    return new Promise((resolve) => {
      const usbidFlag = this.getUsbidFlag();
      const binary = this.findGphotoBinary();
      const cmd = `"${binary}" ${usbidFlag} --summary`.replace(/\s+/g, ' ').trim();

      console.log('[NativeCamera] Establishing PTP connection handshake (CLI fallback):', cmd);

      exec(cmd, async (err, stdout, stderr) => {
        if (err) {
          console.warn('[NativeCamera] PTP connection handshake failed:', stderr || err.message);

          // Second attempt with strict release lock
          await this.releaseMacOSUsbLock();
          exec(`"${binary}" --summary`, (err2, stdout2) => {
            if (err2) {
              const errMsg = 'PC Remote connection failed. Pastikan kamera di mode FOTO (M) -> USB Connection: PC Remote dan port USB tidak terkunci.';
              this.connectedCamera = null;
              this.setState('ERROR', { error: errMsg, stderr });
              resolve({ success: false, error: errMsg });
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

  handleSuccessfulConnection(cameraInfo, summaryStdout, resolve) {
    // Extract real camera model from summary if available
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

    console.log('[NativeCamera] ✅ Connected to camera via PC Remote (CLI fallback):', identifiedModel);
    this.errorMessage = null;
    this.setState('CONNECTED', { camera: this.connectedCamera, error: null });
    this.setState('READY', { camera: this.connectedCamera, error: null });

    // Start background tether watcher for physical shutter
    this.startNativeTether();

    resolve({
      success: true,
      state: 'READY',
      camera: this.connectedCamera,
    });
  }

  /**
   * Start Live View Stream from Sony PC Remote
   * Streams MJPEG frames directly from camera sensor via PTP movie capture
   */
  startLiveView() {
    if (this.hubProcess && !this.hubProcess.killed) {
      this.isLiveViewActive = true;
      try {
        this.hubProcess.stdin.write('RESUME_PREVIEW\n');
      } catch (e) {}
      return;
    }

    if (this.isLiveViewActive || this.liveViewProcess) {
      return;
    }

    const binary = this.findGphotoBinary();
    const args = [
      ...this.getUsbidArgs(),
      '--capture-movie',
      '--stdout',
    ];

    console.log('[NativeCamera] Starting PC Remote Live View stream...');
    this.isLiveViewActive = true;

    try {
      this.liveViewProcess = spawn(binary, args, {
        cwd: this.tetherDir,
        env: process.env,
      });

      let buffer = Buffer.alloc(0);

      this.liveViewProcess.stdout.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);

        // Find JPEG Start of Image (0xFF, 0xD8) and End of Image (0xFF, 0xD9)
        let startIndex = buffer.indexOf(Buffer.from([0xff, 0xd8]));
        while (startIndex !== -1) {
          const endIndex = buffer.indexOf(Buffer.from([0xff, 0xd9]), startIndex + 2);
          if (endIndex === -1) break;

          const jpegFrame = buffer.slice(startIndex, endIndex + 2);
          buffer = buffer.slice(endIndex + 2);

          const base64 = `data:image/jpeg;base64,${jpegFrame.toString('base64')}`;
          this.emit('liveFrame', {
            frameDataUrl: base64,
            timestamp: Date.now(),
          });

          startIndex = buffer.indexOf(Buffer.from([0xff, 0xd8]));
        }

        // Prevent unbounded memory growth if no SOI/EOI
        if (buffer.length > 5 * 1024 * 1024) {
          buffer = Buffer.alloc(0);
        }
      });

      this.liveViewProcess.stderr.on('data', (d) => {
        const text = d.toString().trim();
        // Ignore normal movie streaming progress
        if (!text.includes('Capturing preview frames') && !text.includes('Movie-capture')) {
          console.log('[LiveView stderr]', text);
        }
      });

      this.liveViewProcess.on('close', async (code) => {
        console.log('[NativeCamera] Live view process exited with code:', code);
        this.liveViewProcess = null;
        this.isLiveViewActive = false;

        if (this.wasExplicitlyStoppingLiveView) {
          this.wasExplicitlyStoppingLiveView = false;
          return;
        }

        // Verify if camera was unplugged from USB
        const stillAttached = await this.isCameraStillAttached();
        if (!stillAttached) {
          console.log('[NativeCamera] 🔌 Camera was unplugged from USB. Transitioning cleanly to DISCONNECTED.');
          this.connectedCamera = null;
          this.errorMessage = null;
          this.setState('DISCONNECTED', { error: null });
          return;
        }

        // Auto-recover live view if still connected
        if (this.connectedCamera && this.state === 'READY') {
          console.log('[NativeCamera] Live view closed with camera attached. Checking for physical shutter & restarting preview...');
          setTimeout(async () => {
            if (this.connectedCamera && this.state === 'READY' && !this.isLiveViewActive) {
              await this.checkAndPullPhysicalShutterPhoto();
              this.startLiveView();
            }
          }, 300);
        }
      });

      this.liveViewProcess.on('error', (err) => {
        console.warn('[NativeCamera] Live view process error:', err.message);
        this.liveViewProcess = null;
        this.isLiveViewActive = false;
      });
    } catch (err) {
      console.error('[NativeCamera] Failed to spawn live view process:', err);
      this.isLiveViewActive = false;
    }
  }

  async isCameraStillAttached() {
    return new Promise((resolve) => {
      if (process.platform === 'darwin') {
        exec('ioreg -p IOUSB -l -w 0', (err, stdout) => {
          if (err || !stdout) {
            resolve(false);
            return;
          }
          const hasCamera = /1356|1193|1200|1041|1242|1972|sony|canon|nikon|fujifilm|lumix|olympus|ilce|alpha|camera|ptp/i.test(stdout);
          resolve(hasCamera);
        });
      } else {
        const binary = this.findGphotoBinary();
        exec(`"${binary}" --auto-detect`, (err, stdout) => {
          if (err || !stdout) {
            resolve(false);
            return;
          }
          resolve(stdout.trim().split('\n').length > 2);
        });
      }
    });
  }

  stopLiveView() {
    this.wasExplicitlyStoppingLiveView = true;
    if (this.hubProcess && !this.hubProcess.killed) {
      try {
        this.hubProcess.stdin.write('PAUSE_PREVIEW\n');
      } catch (e) {}
      this.isLiveViewActive = false;
      return;
    }
    if (this.liveViewProcess) {
      try {
        this.liveViewProcess.kill('SIGINT');
      } catch (e) {}
      this.liveViewProcess = null;
    }
    this.isLiveViewActive = false;
  }

  /**
   * Check and pull any newly taken still photos from camera after physical shutter click
   */
  async checkAndPullPhysicalShutterPhoto() {
    const binary = this.findGphotoBinary();
    const usbidFlag = this.getUsbidFlag();
    const cmd = `"${binary}" ${usbidFlag} --new --get-all-files --filename=sony_%Y%m%d_%H%M%S_%04n.%C --keep`.replace(/\s+/g, ' ').trim();
    return new Promise((resolve) => {
      exec(cmd, { cwd: this.tetherDir }, (err, stdout) => {
        if (!err && stdout) {
          const matches = stdout.matchAll(/(?:Saving file as|New file is at)\s+(.+)/gi);
          for (const match of matches) {
            if (match && match[1]) {
              const rawFile = match[1].trim().replace(/['"]/g, '');
              console.log('[NativeCamera] 📷 Physical shutter photo detected via pull:', rawFile);
              this.ingestPhotoFile(rawFile, path.basename(rawFile), 'sony_physical_shutter');
            }
          }
        }
        resolve();
      });
    });
  }

  /**
   * Disconnect from camera
   */
  async disconnectCamera() {
    this.stopUnifiedHubSession();
    this.stopLiveView();
    this.stopNativeTether();
    this.connectedCamera = null;
    this.errorMessage = null;
    this.setState('DISCONNECTED', { error: null });
    await this.releaseMacOSUsbLock();
    return { success: true, state: 'DISCONNECTED' };
  }

  /**
   * Start background tether watcher for Sony physical shutter clicks
   */
  async startNativeTether() {
    if (this.hubProcess && !this.hubProcess.killed) {
      console.log('[NativeCamera] Unified hub session is already listening for physical shutter events.');
      this.isTetherActive = true;
      return { success: true };
    }

    if (this.tetherProcess && !this.tetherProcess.killed) {
      return { success: true, message: 'Tether process already running.' };
    }

    // Stop live view if active so PTP channel is dedicated to tether listener
    this.stopLiveView();

    const binary = this.findGphotoBinary();
    const args = [
      ...this.getUsbidArgs(),
      '--capture-tethered',
      '--filename=sony_%Y%m%d_%H%M%S_%04n.%C',
      '--keep',
    ];

    console.log('[NativeCamera] 🚀 Spawning background tether listener for physical shutter:', binary, args.join(' '));

    try {
      this.tetherProcess = spawn(binary, args, {
        cwd: this.tetherDir,
        env: process.env,
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
            console.log('[NativeCamera] 📷 Photo detected from camera tether stream:', rawFile);
            this.ingestPhotoFile(rawFile, path.basename(rawFile), 'sony_physical_shutter');
          }
        }
      });

      this.tetherProcess.stderr.on('data', (d) => {
        const text = d.toString().trim();
        if (text && !text.includes('UNKNOWN') && !text.includes('Capturing preview')) {
          console.log('[NativeCamera Tether stderr]', text);
        }
      });

      this.tetherProcess.on('close', (code) => {
        console.log('[NativeCamera] Tether process ended with code:', code);
        this.tetherProcess = null;
        this.isTetherActive = false;
      });

      this.tetherProcess.on('error', (err) => {
        console.error('[NativeCamera] Tether process spawn error:', err);
        this.tetherProcess = null;
        this.isTetherActive = false;
      });

      return { success: true };
    } catch (e) {
      console.warn('[NativeCamera] Could not start tether watcher:', e);
      this.isTetherActive = false;
      return { success: false, error: e.message };
    }
  }

  stopNativeTether() {
    if (this.tetherProcess) {
      try {
        this.tetherProcess.kill('SIGUSR2');
        setTimeout(() => {
          if (this.tetherProcess) {
            try { this.tetherProcess.kill('SIGINT'); } catch (e) {}
          }
        }, 250);
      } catch (e) {
        try { this.tetherProcess.kill('SIGINT'); } catch (e) {}
      }
      this.tetherProcess = null;
      this.isTetherActive = false;
    }
  }

  /**
   * Ingest and validate a photo file written by the physical camera.
   * Performs deduplication, magic bytes validation, and emits verified payload.
   */
  async ingestPhotoFile(filePath, filename, source = 'sony_pc_remote') {
    if (!filePath || !filename) return null;

    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.tetherDir, filename);

    // Wait 200ms to ensure file writing is fully flushed to disk
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
        console.warn('[NativeCamera] Photo file not found on disk:', fullPath);
        return null;
      }
      resolvedPath = found;
    }

    try {
      const stat = fs.statSync(resolvedPath);
      // Ensure file has completed writing (> 10KB)
      if (stat.size < 10240) {
        console.warn('[NativeCamera] File incomplete or too small (<10KB):', stat.size);
        return null;
      }

      // Check Deduplicator (15-second TTL per unique filename & size)
      const baseName = path.basename(resolvedPath);
      const dedupKey = `${baseName}_${stat.size}`;
      if (this.deduplicator.isDuplicate(dedupKey)) {
        console.log('[NativeCamera] Duplicate photo event suppressed:', dedupKey);
        return null;
      }

      // Validate header magic bytes (JPEG: 0xFF 0xD8 0xFF, PNG: 0x89 0x50, RAW: 0x49 0x49 or 0x4D 0x4D)
      const fd = fs.openSync(resolvedPath, 'r');
      const headerBuf = Buffer.alloc(4);
      fs.readSync(fd, headerBuf, 0, 4, 0);
      fs.closeSync(fd);

      const isJpeg = headerBuf[0] === 0xff && headerBuf[1] === 0xd8;
      const isPng = headerBuf[0] === 0x89 && headerBuf[1] === 0x50 && headerBuf[2] === 0x4e && headerBuf[3] === 0x47;
      const isRaw = (headerBuf[0] === 0x49 && headerBuf[1] === 0x49) || (headerBuf[0] === 0x4d && headerBuf[1] === 0x4d);

      if (!isJpeg && !isPng && !isRaw) {
        console.warn('[NativeCamera] File does not match valid image magic bytes:', resolvedPath);
        return null;
      }

      // Read file into memory buffer
      const fileBuffer = fs.readFileSync(resolvedPath);
      const mime = resolvedPath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      const base64 = `data:${mime};base64,${fileBuffer.toString('base64')}`;

      const photoPayload = {
        success: true,
        source, // 'sony_physical_shutter' or 'sony_ui_capture'
        filename: baseName,
        filePath: resolvedPath,
        photoDataUrl: base64,
        byteSize: stat.size,
        timestamp: Date.now(),
      };

      console.log(`[NativeCamera] ✅ Verified photo ingested (${source}): ${photoPayload.filename} (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`);

      // Cross-mark in tetherServer hot folder to prevent duplicate emission
      if (this.tetherServerRef && typeof this.tetherServerRef.markProcessed === 'function') {
        this.tetherServerRef.markProcessed(baseName, stat.size, stat.mtimeMs);
      }

      // Emit event for Electron main process
      this.emit('photoCaptured', photoPayload);
      this.setState('READY', { lastCapturedFile: photoPayload.filename });

      // Resolve any pending UI capture promise waiting for this shutter
      if (this.pendingCapturePromise) {
        const { resolve, timer } = this.pendingCapturePromise;
        clearTimeout(timer);
        this.pendingCapturePromise = null;
        resolve(photoPayload);
      }

      return photoPayload;
    } catch (err) {
      console.error('[NativeCamera] Error ingesting photo:', err);
      return null;
    }
  }

  /**
   * Trigger Shutter via PTP and wait for verified photo file transfer.
   * STRICT NO MOCK: Never returns fake photo or fake success.
   * Uses SIGUSR1 if background tether listener is running, or direct CLI fallback.
   */
  async triggerDirectCapture(options = {}) {
    if (this.state === 'CAPTURING' || this.state === 'TRANSFERRING') {
      return { success: false, error: 'Camera is busy' };
    }

    // Case 0: Unified Hub process is running -> Send CAPTURE command to stdin (or SIGUSR1)
    if (this.hubProcess && !this.hubProcess.killed) {
      console.log('[NativeCamera Hub] Triggering Sony capture via unified session...');
      this.setState('CAPTURING');
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          console.warn('[NativeCamera Hub] Direct capture timed out (8s)');
          this.pendingCapturePromise = null;
          this.setState('READY');
          resolve({ success: false, error: 'Camera capture timed out' });
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
            this.setState('READY');
            resolve({ success: false, error: err.message });
          }
        }
      });
    }

    this.setState('CAPTURING');

    const hadLiveView = this.isLiveViewActive;
    if (hadLiveView) {
      console.log('[NativeCamera] Pausing Live View for UI direct capture...');
      this.stopLiveView();
      await new Promise((r) => setTimeout(r, 250));
    }

    // Case 1: Tether listener is running ➔ Send SIGUSR1 to take photo over existing PTP session
    if (this.tetherProcess && !this.tetherProcess.killed) {
      console.log('[NativeCamera] Triggering Sony shutter via SIGUSR1 to active tether process...');
      return new Promise((resolve) => {
        const timer = setTimeout(async () => {
          console.warn('[NativeCamera] SIGUSR1 capture timed out (7s). Falling back to direct CLI capture...');
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

    // Case 2: Tether listener not active ➔ Run direct CLI capture
    await this.releaseMacOSUsbLock();
    const result = await this.executeDirectCliCapture();
    if (hadLiveView && this.connectedCamera) {
      console.log('[NativeCamera] Direct capture completed. Resuming Live View...');
      setTimeout(() => this.startLiveView(), 400);
    } else {
      this.startNativeTether();
    }
    return result;
  }

  /**
   * Execute direct PTP capture command via gphoto2 CLI
   */
  async executeDirectCliCapture() {
    const binary = this.findGphotoBinary();
    const filename = `sony_ui_${Date.now()}.jpg`;
    const targetFilePath = path.join(this.tetherDir, filename);
    const usbidFlag = this.getUsbidFlag();
    const cmd = `"${binary}" ${usbidFlag} --capture-image-and-download --filename="${filename}" --keep`.replace(/\s+/g, ' ').trim();

    console.log('[NativeCamera] Executing direct PTP shutter command:', cmd);

    return new Promise((resolve) => {
      exec(cmd, { cwd: this.tetherDir }, async (err, stdout, stderr) => {
        if (err) {
          console.error('[NativeCamera] Direct capture CLI error:', stderr || err.message);
          this.setState('ERROR', { error: 'Capture failed: ' + (stderr || err.message) });
          resolve({ success: false, error: 'Capture failed', details: stderr || err.message });
          return;
        }

        this.setState('TRANSFERRING', { filename });
        const ingested = await this.ingestPhotoFile(targetFilePath, filename, 'sony_ui_capture');
        if (ingested) {
          resolve(ingested);
        } else {
          this.setState('ERROR', { error: 'Photo transfer failed: File invalid' });
          resolve({ success: false, error: 'Photo transfer failed' });
        }
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
