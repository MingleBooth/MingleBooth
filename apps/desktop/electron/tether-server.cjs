const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const EventEmitter = require('events');

function getDefaultTetherDir() {
  try {
    const home = os.homedir();
    return path.join(home, 'Pictures', 'MingleBooth', 'Tether-Inbox');
  } catch {
    return path.resolve(__dirname, '../../../data/tether-inbox');
  }
}

class TetherServer extends EventEmitter {
  constructor(port = 4848) {
    super();
    this.port = port;
    this.server = null;
    this.latestLiveFrame = null;
    this.latestPhotoBase64 = null;
    this.latestPhotoFilename = null;
    this.latestPhotoTimestamp = null;
    this.pendingTriggers = [];
    this.processedFiles = new Set();
    this.sseClients = new Set();
    this.fsWatcher = null;

    // Default tether inbox directory: native user Pictures folder
    this.tetherDir = getDefaultTetherDir();
    this.ensureDirectory();
    this.initWatcher();
  }

  ensureDirectory() {
    try {
      if (!fs.existsSync(this.tetherDir)) {
        fs.mkdirSync(this.tetherDir, { recursive: true });
      }
      // Populate existing files to avoid re-triggering old photos
      const files = fs.readdirSync(this.tetherDir);
      for (const file of files) {
        this.processedFiles.add(file);
      }
    } catch (err) {
      console.error('[TetherServer] Failed to prepare tether folder:', err);
    }
  }

  setTetherDirectory(newPath) {
    if (!newPath || typeof newPath !== 'string') return;
    try {
      if (this.fsWatcher) {
        this.fsWatcher.close();
        this.fsWatcher = null;
      }
      this.tetherDir = path.resolve(newPath);
      this.ensureDirectory();
      this.initWatcher();
      console.log('[TetherServer] Updated hot folder directory to:', this.tetherDir);
      this.emit('directoryChange', this.tetherDir);
    } catch (err) {
      console.error('[TetherServer] Failed to switch directory:', err);
    }
  }

  getLocalIPs() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (!iface.internal && iface.family === 'IPv4') {
          ips.push(iface.address);
        }
      }
    }
    return ips.length > 0 ? ips : ['127.0.0.1'];
  }

  initWatcher() {
    try {
      if (this.fsWatcher) {
        this.fsWatcher.close();
      }
      this.fsWatcher = fs.watch(this.tetherDir, (eventType, filename) => {
        if (!filename) return;
        const lower = filename.toLowerCase();
        if (!lower.endsWith('.jpg') && !lower.endsWith('.jpeg') && !lower.endsWith('.png')) {
          return;
        }

        const filePath = path.join(this.tetherDir, filename);

        // Debounce read to let camera finish writing file to disk
        setTimeout(() => {
          this.handleNewTetherFile(filePath, filename);
        }, 250);
      });
      console.log('[TetherServer] Watching hot folder:', this.tetherDir);
    } catch (err) {
      console.warn('[TetherServer] Error starting hot folder watch:', err);
    }
  }

  markProcessed(filename, size, mtimeMs) {
    if (!filename) return;
    this.processedFiles.add(filename);
    if (size) {
      this.processedFiles.add(`${filename}_${size}`);
      if (mtimeMs) this.processedFiles.add(`${filename}_${size}_${mtimeMs}`);
    }
  }

  handleNewTetherFile(filePath, filename) {
    try {
      if (!fs.existsSync(filePath)) return;

      const stat = fs.statSync(filePath);
      if (stat.size < 10240) return; // File still being written or empty (<10KB)

      // Validate header magic bytes: JPEG (0xFF 0xD8), PNG (0x89 0x50), RAW/TIFF (0x49 0x49 or 0x4D 0x4D)
      try {
        const fd = fs.openSync(filePath, 'r');
        const headerBuf = Buffer.alloc(4);
        fs.readSync(fd, headerBuf, 0, 4, 0);
        fs.closeSync(fd);

        const isJpeg = headerBuf[0] === 0xff && headerBuf[1] === 0xd8;
        const isPng = headerBuf[0] === 0x89 && headerBuf[1] === 0x50 && headerBuf[2] === 0x4e && headerBuf[3] === 0x47;
        const isRaw = (headerBuf[0] === 0x49 && headerBuf[1] === 0x49) || (headerBuf[0] === 0x4d && headerBuf[1] === 0x4d);

        if (!isJpeg && !isPng && !isRaw) return;
      } catch {
        return;
      }

      // Check if already processed
      const fileKey = `${filename}_${stat.size}_${stat.mtimeMs}`;
      if (
        this.processedFiles.has(filename) ||
        this.processedFiles.has(`${filename}_${stat.size}`) ||
        this.processedFiles.has(fileKey)
      ) {
        return;
      }
      this.processedFiles.add(fileKey);
      this.processedFiles.add(filename);
      this.processedFiles.add(`${filename}_${stat.size}`);

      const buffer = fs.readFileSync(filePath);
      const mime = filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      const base64Data = `data:${mime};base64,${buffer.toString('base64')}`;

      this.latestPhotoBase64 = base64Data;
      this.latestPhotoFilename = filename;
      this.latestPhotoTimestamp = Date.now();

      console.log(`[TetherServer] 📸 New high-res photo captured from camera: ${filename} (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`);

      const photoPayload = {
        success: true,
        source: 'hotfolder',
        filename,
        filePath,
        photoDataUrl: base64Data,
        byteSize: stat.size,
        timestamp: this.latestPhotoTimestamp,
      };

      // 1. Emit internal event for Electron main process
      this.emit('photo', photoPayload);

      // 2. Broadcast via Server-Sent Events (SSE) to connected web/tablet clients
      const sseData = `data: ${JSON.stringify(photoPayload)}\n\n`;
      for (const client of this.sseClients) {
        try {
          client.write(sseData);
        } catch {
          this.sseClients.delete(client);
        }
      }

      // 3. Resolve any pending manual trigger promises
      while (this.pendingTriggers.length > 0) {
        const trigger = this.pendingTriggers.shift();
        clearTimeout(trigger.timeoutId);
        trigger.resolve(photoPayload);
      }
    } catch (err) {
      console.error('[TetherServer] Error reading tether file:', err);
    }
  }

  start() {
    if (this.server) return;

    this.server = http.createServer((req, res) => {
      // Add permissive CORS for local network tablet clients & Private Network Access
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Access-Control-Allow-Private-Network', 'true');

      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Max-Age', '86400');
        res.statusCode = 204;
        res.end();
        return;
      }

      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = parsedUrl.pathname;

      // ── 1. Health & Status Endpoint ──
      if (pathname === '/api/tether/status') {
        let camState = { state: 'DISCONNECTED', camera: null };
        try {
          const { getNativeCameraService } = require('./native-camera.cjs');
          const nativeCam = getNativeCameraService(this.tetherDir);
          if (nativeCam) {
            camState = nativeCam.getState();
          }
        } catch (e) {}

        const isCamConnected = camState.state === 'CONNECTED' || camState.state === 'READY';

        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            success: true,
            status: isCamConnected ? 'connected' : 'disconnected',
            service: 'MingleBooth Remote PC Studio Hub',
            port: this.port,
            ips: this.getLocalIPs(),
            tetherDir: this.tetherDir,
            cameraState: camState.state,
            camera: camState.camera,
            cameraConnected: isCamConnected,
            latestPhotoFilename: this.latestPhotoFilename,
            latestPhotoTimestamp: this.latestPhotoTimestamp,
            hasLivePreview: Boolean(this.latestLiveFrame),
            pendingTriggers: this.pendingTriggers.length,
          })
        );
        return;
      }

      // ── 1b. Real-time Shutter Event Stream (Server-Sent Events) ──
      if (pathname === '/api/tether/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });
        res.write(`data: ${JSON.stringify({ type: 'connected', tetherDir: this.tetherDir, timestamp: Date.now() })}\n\n`);
        this.sseClients.add(res);

        // Keep connection alive with heartbeat ping every 25s
        const pingInterval = setInterval(() => {
          try {
            res.write(': heartbeat\n\n');
          } catch {
            clearInterval(pingInterval);
            this.sseClients.delete(res);
          }
        }, 25000);

        req.on('close', () => {
          clearInterval(pingInterval);
          this.sseClients.delete(res);
        });
        return;
      }

      // ── 1c. Change Hot Folder Directory Endpoint ──
      if (pathname === '/api/tether/set-directory' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const data = JSON.parse(body || '{}');
            if (data.tetherDir) {
              this.setTetherDirectory(data.tetherDir);
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, tetherDir: this.tetherDir }));
          } catch (err) {
            res.statusCode = 400;
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
        });
        return;
      }

      // ── 2. Live Preview Frame Receiver (From Desktop App) ──
      if (pathname === '/api/tether/update-frame' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const data = JSON.parse(body || '{}');
            if (data.frameDataUrl) {
              this.latestLiveFrame = data.frameDataUrl;
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true }));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ success: false, error: e.message }));
          }
        });
        return;
      }

      // ── 3. Live Preview Stream Endpoint (For Tablet Mode) ──
      if (pathname === '/api/tether/liveview') {
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            success: true,
            frameDataUrl: this.latestLiveFrame || null,
            liveFrame: this.latestLiveFrame || null,
            timestamp: Date.now(),
          })
        );
        return;
      }

      // ── 4. Trigger Capture Shutter & Await High-Res Photo (STRICT NO MOCK) ──
      if (pathname === '/api/tether/trigger' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          let timeoutMs = 9000;
          try {
            const data = JSON.parse(body || '{}');
            if (data.timeoutMs) timeoutMs = data.timeoutMs;
          } catch {}

          // Also trigger direct native capture if native camera is connected & ready
          try {
            const { getNativeCameraService } = require('./native-camera.cjs');
            const nativeCam = getNativeCameraService(this.tetherDir);
            if (nativeCam && (nativeCam.state === 'CONNECTED' || nativeCam.state === 'READY')) {
              nativeCam.triggerDirectCapture().catch((err) => {
                console.warn('[TetherServer] native triggerDirectCapture error:', err);
              });
            }
          } catch (e) {}

          const triggerPromise = new Promise((resolve) => {
            const timeoutId = setTimeout(() => {
              this.pendingTriggers = this.pendingTriggers.filter((t) => t.timeoutId !== timeoutId);
              resolve({
                success: false,
                error: 'Photo transfer failed: Batas waktu menunggu kamera habis tanpa file foto baru di hot folder.',
              });
            }, timeoutMs);

            this.pendingTriggers.push({ resolve, timeoutId });
          });

          triggerPromise.then((result) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
          });
        });
        return;
      }

      // ── 5. Fetch Latest Photo ──
      if (pathname === '/api/tether/latest') {
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            success: Boolean(this.latestPhotoBase64),
            photoDataUrl: this.latestPhotoBase64,
            filename: this.latestPhotoFilename,
            timestamp: this.latestPhotoTimestamp,
          })
        );
        return;
      }

      // ── 6. Tablet Kiosk Redirect — redirect to Vercel production Mode Tab ──
      if (pathname === '/tablet') {
        const primaryIp = this.getLocalIPs().find((ip) => ip !== '127.0.0.1') || this.getLocalIPs()[0] || 'localhost';
        const hubUrl = `http://${primaryIp}:${this.port}`;
        // Redirect to Vercel production (full CSS/JS) with hub pre-configured
        const query = url.search ? url.search : '';
        const hubParam = query.includes('hub=') ? query : `?hub=${encodeURIComponent(hubUrl)}`;
        const redirectUrl = `https://minglebooth.id/tablet${hubParam}`;
        res.statusCode = 302;
        res.setHeader('Location', redirectUrl);
        res.end();
        return;
      }

      // ── 7. Mobile & Tablet Web Landing Page (Direct Hub Dashboard) ──
      if (pathname === '/') {
        const primaryIp = this.getLocalIPs().find((ip) => ip !== '127.0.0.1') || this.getLocalIPs()[0] || 'localhost';
        const hubUrl = `http://${primaryIp}:${this.port}`;
        const tabletLaunchUrl = `https://minglebooth.id/tablet?hub=${encodeURIComponent(hubUrl)}`;

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>MingleBooth — Jembatan Kamera Studio</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: #090A0C; color: #fff; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; text-align: center; }
    .card { background: #121316; border: 1px solid rgba(255,255,255,0.08); border-radius: 24px; padding: 28px; max-width: 440px; width: 100%; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
    .badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(16,185,129,0.15); color: #34d399; padding: 6px 14px; border-radius: 9999px; font-size: 13px; font-weight: 600; border: 1px solid rgba(16,185,129,0.3); margin-bottom: 20px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #10b981; box-shadow: 0 0 10px #10b981; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 8px; }
    p.desc { font-size: 13px; color: #9ca3af; line-height: 1.5; margin-bottom: 24px; }
    .preview-box { width: 100%; aspect-ratio: 3/2; background: #000; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); overflow: hidden; position: relative; margin-bottom: 20px; display: flex; align-items: center; justify-content: center; }
    .preview-box img { width: 100%; height: 100%; object-cover: cover; }
    .preview-empty { color: #6b7280; font-size: 12px; }
    .code-box { background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.06); padding: 12px; border-radius: 12px; font-family: monospace; font-size: 14px; color: #34d399; margin-bottom: 20px; word-break: break-all; }
    .btn { display: block; width: 100%; padding: 14px; border-radius: 14px; font-size: 14px; font-weight: 600; text-decoration: none; cursor: pointer; transition: all 0.2s; border: none; }
    .btn-primary { background: #10b981; color: #000; margin-bottom: 12px; }
    .btn-primary:hover { background: #34d399; }
    .btn-secondary { background: rgba(255,255,255,0.08); color: #fff; }
    .btn-secondary:hover { background: rgba(255,255,255,0.12); }
    .footer { font-size: 11px; color: #4b5563; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge"><span class="dot"></span> Kamera Laptop Terhubung</div>
    <h1>MingleBooth Studio Hub</h1>
    <p class="desc">Sinyal kamera studio (DSLR / Mirrorless) di laptop aktif dan siap memotret dari layar tablet.</p>

    <div class="preview-box" id="previewBox">
      <span class="preview-empty">Menunggu Gambar Kamera...</span>
    </div>

    <div class="code-box">${hubUrl}</div>

    <a href="${tabletLaunchUrl}" class="btn btn-primary">Buka Mode Tab (Tablet Booth)</a>
    <button onclick="testShutter()" id="shutterBtn" class="btn btn-secondary">Tes Jepret Kamera &amp; Flash</button>

    <div class="footer" id="statusMsg">Tersambung di jaringan yang sama</div>
  </div>

  <script>
    const hubUrl = '${hubUrl}';
    const previewBox = document.getElementById('previewBox');
    const statusMsg = document.getElementById('statusMsg');

    setInterval(async () => {
      try {
        const res = await fetch('/api/tether/liveview');
        const data = await res.json();
        if (data.frameDataUrl) {
          previewBox.innerHTML = '<img src="' + data.frameDataUrl + '" alt="Live View">';
        }
      } catch (e) {}
    }, 400);

    async function testShutter() {
      const btn = document.getElementById('shutterBtn');
      btn.innerText = 'Mengirim sinyal jepret...';
      btn.disabled = true;
      try {
        const res = await fetch('/api/tether/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timeoutMs: 5000 })
        });
        const data = await res.json();
        if (data.success) {
          statusMsg.innerText = '✅ Jepret Berhasil! Flash & Shutter sinkron.';
          statusMsg.style.color = '#34d399';
        }
      } catch (err) {
        statusMsg.innerText = 'Gagal jepret: ' + err.message;
        statusMsg.style.color = '#f87171';
      } finally {
        btn.innerText = 'Tes Jepret Kamera & Flash';
        btn.disabled = false;
      }
    }
  </script>
</body>
</html>`);
        return;
      }

      // 404
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Endpoint not found' }));
    });

    this.server.listen(this.port, '0.0.0.0', () => {
      const ips = this.getLocalIPs();
      console.log(`[TetherServer] 🚀 Remote PC Hub Server running on port ${this.port}`);
      console.log(`[TetherServer] Connect from Tablet at: http://${ips[0]}:${this.port}`);
    });

    this.server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[TetherServer] Port ${this.port} is already in use. Server is already running.`);
      } else {
        console.error('[TetherServer] Server error:', err);
      }
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

// Export singleton instance or factory
let tetherInstance = null;
function getTetherServer(port = 4848) {
  if (!tetherInstance) {
    tetherInstance = new TetherServer(port);
  }
  return tetherInstance;
}

if (require.main === module) {
  const server = getTetherServer(4848);
  server.start();
}

module.exports = {
  TetherServer,
  getTetherServer,
};
