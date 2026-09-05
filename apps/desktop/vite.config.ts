import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { exec } from 'child_process';
import fs from 'fs';
import os from 'os';

function localDevStoragePlugin(): Plugin {
  return {
    name: 'local-dev-storage-plugin',
    configureServer(server) {
      // 1. Open Folder Endpoint
      server.middlewares.use('/api/storage/open-folder', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            const data = JSON.parse(body || '{}');
            const folderPath = data.folderPath || './data';
            const eventId = data.eventId;
            const subPath = data.subPath;

            let targetDir: string;
            if (path.isAbsolute(folderPath)) {
              targetDir = subPath ? path.join(folderPath, subPath) : folderPath;
            } else {
              const rootDir = path.resolve(__dirname, '../../data');
              targetDir = subPath
                ? path.join(rootDir, 'events', eventId, subPath)
                : path.join(rootDir, 'events', eventId);
            }

            if (!fs.existsSync(targetDir)) {
              fs.mkdirSync(targetDir, { recursive: true });
            }

            const platform = os.platform();
            const cmd =
              platform === 'darwin'
                ? `open "${targetDir}"`
                : platform === 'win32'
                ? `explorer.exe "${targetDir}"`
                : `xdg-open "${targetDir}"`;

            exec(cmd, (err) => {
              if (err) {
                console.error('[Vite Dev Storage] Open folder error:', err);
              }
            });

            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(JSON.stringify({ success: true, path: targetDir }));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: e?.message }));
          }
        });
      });

      // 2. Select Folder Endpoint (Native OS Dialog)
      server.middlewares.use('/api/storage/select-folder', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }

        const platform = os.platform();
        if (platform === 'darwin') {
          const script = `osascript -e 'try' -e 'set chosen to choose folder with prompt "Pilih Folder Penyimpanan Foto MingleBooth"' -e 'return POSIX path of chosen' -e 'on error' -e 'return "CANCELED"' -e 'end try'`;
          exec(script, (err, stdout) => {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            if (err) {
              res.end(JSON.stringify({ canceled: true, error: err.message }));
              return;
            }
            const result = stdout.trim();
            if (result === 'CANCELED' || !result) {
              res.end(JSON.stringify({ canceled: true }));
            } else {
              res.end(JSON.stringify({ canceled: false, selectedPath: result.replace(/\/$/, '') }));
            }
          });
        } else if (platform === 'win32') {
          const psCommand = `powershell -NoProfile -Command "[System.Reflection.Assembly]::LoadWithPartialName('System.windows.forms') | Out-Null; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Pilih Folder Penyimpanan Foto'; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.SelectedPath } else { Write-Output 'CANCELED' }"`;
          exec(psCommand, (err, stdout) => {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            const result = stdout ? stdout.trim() : '';
            if (err || result === 'CANCELED' || !result) {
              res.end(JSON.stringify({ canceled: true }));
            } else {
              res.end(JSON.stringify({ canceled: false, selectedPath: result }));
            }
          });
        } else {
          exec('zenity --file-selection --directory --title="Pilih Folder Penyimpanan Foto"', (err, stdout) => {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            if (err || !stdout.trim()) {
              res.end(JSON.stringify({ canceled: true }));
            } else {
              res.end(JSON.stringify({ canceled: false, selectedPath: stdout.trim() }));
            }
          });
        }
      });

      // 3. Persist Capture Endpoint (Physical Disk Write)
      server.middlewares.use('/api/storage/persist-capture', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', async () => {
          try {
            const data = JSON.parse(body || '{}');
            const { eventId, photoId, compositeDataUrl, gifDataUrl, rawPhotos, customStoragePath } = data;

            let baseDir: string;
            if (customStoragePath && path.isAbsolute(customStoragePath)) {
              baseDir = customStoragePath;
            } else if (customStoragePath) {
              baseDir = path.resolve(__dirname, '../../', customStoragePath.replace(/^\.\//, ''));
            } else {
              baseDir = path.resolve(__dirname, '../../data/events', eventId || 'evt');
            }

            const rawDir = path.join(baseDir, 'raw');
            const processedDir = path.join(baseDir, 'processed');
            const thumbnailsDir = path.join(baseDir, 'thumbnails');
            const gifsDir = path.join(baseDir, 'gifs');
            const metadataDir = path.join(baseDir, 'metadata');

            fs.mkdirSync(rawDir, { recursive: true });
            fs.mkdirSync(processedDir, { recursive: true });
            fs.mkdirSync(thumbnailsDir, { recursive: true });
            fs.mkdirSync(gifsDir, { recursive: true });
            fs.mkdirSync(metadataDir, { recursive: true });

            // Process composite image buffer
            let rawBuffer: Buffer;
            if (compositeDataUrl.includes(';base64,')) {
              const base64Data = compositeDataUrl.split(';base64,')[1];
              rawBuffer = Buffer.from(base64Data, 'base64');
            } else if (compositeDataUrl.startsWith('data:image/svg+xml;utf8,')) {
              const svgText = decodeURIComponent(compositeDataUrl.replace('data:image/svg+xml;utf8,', ''));
              rawBuffer = Buffer.from(svgText, 'utf-8');
            } else {
              rawBuffer = Buffer.from(compositeDataUrl, 'utf-8');
            }

            let sharpModule: any = null;
            try {
              sharpModule = (await import('sharp')).default;
            } catch (e) {
              // fallback
            }

            let processedBuffer = rawBuffer;
            if (sharpModule) {
              try {
                processedBuffer = await sharpModule(rawBuffer).jpeg({ quality: 95 }).toBuffer();
              } catch (e) {}
            }

            const processedFilePath = path.join(processedDir, `${photoId}.jpg`);
            fs.writeFileSync(processedFilePath, processedBuffer);

            // Thumbnail
            if (sharpModule) {
              try {
                const thumbBuf = await sharpModule(processedBuffer)
                  .resize(300, 375, { fit: 'cover' })
                  .jpeg({ quality: 80 })
                  .toBuffer();
                fs.writeFileSync(path.join(thumbnailsDir, `${photoId}_thumb.jpg`), thumbBuf);
              } catch (e) {}
            }

            // Save animated GIF
            let hasGif = false;
            if (gifDataUrl && typeof gifDataUrl === 'string' && gifDataUrl.includes(';base64,')) {
              const gifBase64 = gifDataUrl.split(';base64,')[1];
              const gifBuf = Buffer.from(gifBase64, 'base64');
              const gifFilePath = path.join(gifsDir, `${photoId}.gif`);
              fs.writeFileSync(gifFilePath, gifBuf);
              hasGif = true;
            }

            // Raw photos
            const rawFileCount = Array.isArray(rawPhotos) ? rawPhotos.length : 0;
            if (Array.isArray(rawPhotos)) {
              for (let i = 0; i < rawPhotos.length; i++) {
                const rawItem = rawPhotos[i];
                let itemBuf: Buffer;
                if (typeof rawItem === 'string' && rawItem.includes(';base64,')) {
                  itemBuf = Buffer.from(rawItem.split(';base64,')[1], 'base64');
                } else if (typeof rawItem === 'string' && rawItem.startsWith('data:image/svg+xml;utf8,')) {
                  itemBuf = Buffer.from(decodeURIComponent(rawItem.replace('data:image/svg+xml;utf8,', '')), 'utf-8');
                } else {
                  itemBuf = Buffer.from(rawItem, 'utf-8');
                }

                let finalRaw = itemBuf;
                if (sharpModule) {
                  try {
                    finalRaw = await sharpModule(itemBuf).jpeg({ quality: 95 }).toBuffer();
                  } catch (e) {}
                }
                fs.writeFileSync(path.join(rawDir, `${photoId}_raw_${i + 1}.jpg`), finalRaw);
              }
            }

            // Save session metadata
            fs.writeFileSync(
              path.join(metadataDir, `${photoId}.json`),
              JSON.stringify(
                {
                  photoId,
                  eventId: eventId || 'evt_bayu_irma_2026',
                  createdAt: new Date().toISOString(),
                  hasGif,
                  rawCount: rawFileCount,
                },
                null,
                2
              )
            );

            console.log(`[Storage Persist] Saved photo ${photoId} (GIF: ${hasGif}, Raw: ${rawFileCount}) to ${baseDir}`);

            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(JSON.stringify({ success: true, photoId, eventId, processedFilePath, hasGif, rawFileCount }));
          } catch (err: any) {
            console.error('[Vite Storage Persist Capture Error]:', err);
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: err?.message }));
          }
        });
      });

      // 4. List Event Files Endpoint
      server.middlewares.use('/api/storage/list-event-files', (req, res) => {
        try {
          const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
          const eventId = url.searchParams.get('eventId') || 'evt';
          const customStoragePath = url.searchParams.get('customStoragePath');

          let eventDir: string;
          if (customStoragePath && path.isAbsolute(customStoragePath)) {
            eventDir = customStoragePath;
          } else if (customStoragePath) {
            eventDir = path.resolve(__dirname, '../../', customStoragePath.replace(/^\.\//, ''));
          } else {
            eventDir = path.resolve(__dirname, '../../data/events', eventId);
          }

          const processedDir = path.join(eventDir, 'processed');
          const rawDir = path.join(eventDir, 'raw');
          const thumbnailsDir = path.join(eventDir, 'thumbnails');
          const gifsDir = path.join(eventDir, 'gifs');

          const getFiles = (dir: string) => {
            try {
              return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => !f.startsWith('.')) : [];
            } catch {
              return [];
            }
          };

          const processedFiles = getFiles(processedDir);
          const rawFiles = getFiles(rawDir);
          const thumbnailFiles = getFiles(thumbnailsDir);
          const gifFiles = getFiles(gifsDir);

          let totalBytes = 0;
          const calcDirSize = (dir: string): number => {
            try {
              if (!fs.existsSync(dir)) return 0;
              let size = 0;
              const entries = fs.readdirSync(dir, { withFileTypes: true });
              for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isFile()) {
                  size += fs.statSync(fullPath).size;
                } else if (entry.isDirectory()) {
                  size += calcDirSize(fullPath);
                }
              }
              return size;
            } catch {
              return 0;
            }
          };

          totalBytes = calcDirSize(eventDir);

          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(
            JSON.stringify({
              success: true,
              eventId,
              eventDir,
              processedCount: processedFiles.length,
              rawCount: rawFiles.length,
              thumbnailsCount: thumbnailFiles.length,
              gifsCount: gifFiles.length,
              totalBytes,
              processedFiles: processedFiles.slice(-10),
            })
          );
        } catch (err: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ success: false, error: err?.message }));
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), localDevStoragePlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@minglebooth/shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@minglebooth/photo-engine': path.resolve(__dirname, '../../packages/photo-engine/src'),
      '@minglebooth/camera': path.resolve(__dirname, '../../packages/camera/src'),
      '@minglebooth/sync-engine': path.resolve(__dirname, '../../packages/sync-engine/src'),
      '@minglebooth/gif-engine': path.resolve(__dirname, '../../packages/gif-engine/src'),
      '@minglebooth/event-core': path.resolve(__dirname, '../../packages/event-core/src'),
      '@minglebooth/license': path.resolve(__dirname, '../../packages/license/src'),
      '@minglebooth/template-engine': path.resolve(__dirname, '../../packages/template-engine/src'),
    },
  },
  server: {
    port: 5173,
  },
});
