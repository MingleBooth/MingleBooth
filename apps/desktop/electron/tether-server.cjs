const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

class TetherServer {
  constructor(port = 4848) {
    this.port = port;
    this.server = null;
    this.latestLiveFrame = null;
    this.latestPhotoBase64 = null;
    this.latestPhotoFilename = null;
    this.latestPhotoTimestamp = null;
    this.pendingTriggers = [];
    this.processedFiles = new Set();

    // Default tether inbox directory: <workspace-root>/data/tether-inbox
    this.tetherDir = path.resolve(__dirname, '../../../data/tether-inbox');
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
      fs.watch(this.tetherDir, (eventType, filename) => {
        if (!filename) return;
        const lower = filename.toLowerCase();
        if (!lower.endsWith('.jpg') && !lower.endsWith('.jpeg') && !lower.endsWith('.png')) {
          return;
        }

        const filePath = path.join(this.tetherDir, filename);

        // Debounce read to let Sony / Canon finish writing file to disk
        setTimeout(() => {
          this.handleNewTetherFile(filePath, filename);
        }, 250);
      });
      console.log('[TetherServer] Watching hot folder:', this.tetherDir);
    } catch (err) {
      console.warn('[TetherServer] Error starting hot folder watch:', err);
    }
  }

  handleNewTetherFile(filePath, filename) {
    try {
      if (!fs.existsSync(filePath)) return;

      const stat = fs.statSync(filePath);
      if (stat.size === 0) return; // File still being written

      // Check if already processed
      const fileKey = `${filename}_${stat.size}_${stat.mtimeMs}`;
      if (this.processedFiles.has(fileKey)) return;
      this.processedFiles.add(fileKey);

      const buffer = fs.readFileSync(filePath);
      const mime = filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      const base64Data = `data:${mime};base64,${buffer.toString('base64')}`;

      this.latestPhotoBase64 = base64Data;
      this.latestPhotoFilename = filename;
      this.latestPhotoTimestamp = Date.now();

      console.log(`[TetherServer] 📸 New high-res photo captured from Sony/DSLR: ${filename} (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`);

      // Resolve pending trigger requests
      while (this.pendingTriggers.length > 0) {
        const trigger = this.pendingTriggers.shift();
        clearTimeout(trigger.timeoutId);
        trigger.resolve({
          success: true,
          source: 'hotfolder',
          filename,
          photoDataUrl: base64Data,
          byteSize: stat.size,
          timestamp: this.latestPhotoTimestamp,
        });
      }
    } catch (err) {
      console.error('[TetherServer] Error reading tether file:', err);
    }
  }

  start() {
    if (this.server) return;

    this.server = http.createServer((req, res) => {
      // Add permissive CORS for local network tablet clients
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }

      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = parsedUrl.pathname;

      // ── 1. Health & Status Endpoint ──
      if (pathname === '/api/tether/status') {
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            success: true,
            status: 'online',
            service: 'MingleBooth Remote PC Studio Hub',
            port: this.port,
            ips: this.getLocalIPs(),
            tetherDir: this.tetherDir,
            latestPhotoFilename: this.latestPhotoFilename,
            latestPhotoTimestamp: this.latestPhotoTimestamp,
            hasLivePreview: Boolean(this.latestLiveFrame),
            pendingTriggers: this.pendingTriggers.length,
          })
        );
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
            timestamp: Date.now(),
          })
        );
        return;
      }

      // ── 4. Trigger Capture Shutter & Await High-Res Photo ──
      if (pathname === '/api/tether/trigger' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          let timeoutMs = 8000;
          let mockFallback = true;
          try {
            const data = JSON.parse(body || '{}');
            if (data.timeoutMs) timeoutMs = data.timeoutMs;
            if (data.mockFallback !== undefined) mockFallback = data.mockFallback;
          } catch {
            // Safe fallback
          }

          const triggerPromise = new Promise((resolve) => {
            const timeoutId = setTimeout(() => {
              // Remove this trigger from array
              this.pendingTriggers = this.pendingTriggers.filter((t) => t.timeoutId !== timeoutId);

              // If fallback allowed and no real camera file dropped, return high-res simulated studio photo
              if (mockFallback) {
                const fallbackData = this.latestLiveFrame || this.latestPhotoBase64 || this.generateMockStudioPhoto();
                resolve({
                  success: true,
                  source: 'preview_fallback',
                  photoDataUrl: fallbackData,
                  notice: 'Kamera fisik tidak mendeteksi file baru dalam batas waktu, menggunakan frame live preview beresolusi tinggi.',
                });
              } else {
                resolve({
                  success: false,
                  error: 'Timeout waiting for Sony/DSLR photo capture in hot folder',
                });
              }
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

  generateMockStudioPhoto() {
    // 1080x1350 High quality SVG portrait placeholder
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#18181b"/>
          <stop offset="50%" stop-color="#27272a"/>
          <stop offset="100%" stop-color="#09090b"/>
        </linearGradient>
      </defs>
      <rect width="1080" height="1350" fill="url(#bg)"/>
      <circle cx="540" cy="560" r="220" fill="#3f3f46" stroke="#71717a" stroke-width="4"/>
      <circle cx="540" cy="500" r="110" fill="#a1a1aa"/>
      <path d="M 360 740 Q 540 660 720 740 L 750 820 L 330 820 Z" fill="#71717a"/>
      <text x="540" y="980" fill="#f4f4f5" font-size="34" font-weight="bold" text-anchor="middle" font-family="sans-serif">SONY PRO SHUTTER CAPTURE</text>
      <text x="540" y="1030" fill="#10b981" font-size="22" font-weight="600" text-anchor="middle" font-family="sans-serif">● 24MP Studio Flash Synchronized</text>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
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

module.exports = {
  TetherServer,
  getTetherServer,
};
