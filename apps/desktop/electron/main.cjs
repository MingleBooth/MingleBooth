const { app, BrowserWindow, ipcMain, shell, dialog, session } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const { exec } = require('child_process');
const { getTetherServer } = require('./tether-server.cjs');

// ── Fix Windows DPI / HiDPI scaling so viewport renders at correct CSS pixel width ──
app.commandLine.appendSwitch('high-dpi-support', '1');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('disable-pinch');

let mainWindow = null;
let kioskTabWindow = null;

function generateHardwareFingerprint() {
  const cpus = os.cpus();
  const model = cpus.length > 0 ? cpus[0].model : 'generic';
  const networkInterfaces = os.networkInterfaces();
  let mac = '';
  for (const name of Object.keys(networkInterfaces)) {
    for (const net of networkInterfaces[name]) {
      if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
        mac = net.mac;
        break;
      }
    }
    if (mac) break;
  }
  const rawString = `${os.hostname()}-${os.platform()}-${os.arch()}-${model}-${mac}`;
  return crypto.createHash('sha256').update(rawString).digest('hex').substring(0, 32);
}

// ── Trigger Sony Camera shutter via gphoto2 (if available) ──
function triggerSonyShutter(tetherDir) {
  return new Promise((resolve) => {
    // Try gphoto2 first (Mac/Linux)
    exec('gphoto2 --capture-image-and-download --filename=%Y%m%d_%H%M%S.jpg', { cwd: tetherDir }, (err, stdout, stderr) => {
      if (!err) {
        console.log('[Electron] gphoto2 shutter triggered:', stdout);
        resolve({ success: true, method: 'gphoto2' });
        return;
      }

      // Try digiCamControl HTTP API (Windows - runs on port 5513 by default)
      const http = require('http');
      const req = http.get('http://127.0.0.1:5513//?CMD=Capture', (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => {
          console.log('[Electron] digiCamControl shutter triggered:', body);
          resolve({ success: true, method: 'digiCamControl' });
        });
      });
      req.on('error', () => {
        // No auto-trigger available, tether server will wait for hot folder
        resolve({ success: false, method: 'hotfolder_only', message: 'No auto-trigger available. Waiting for hot folder.' });
      });
      req.setTimeout(2000, () => {
        req.destroy();
        resolve({ success: false, method: 'hotfolder_only', message: 'Trigger timeout.' });
      });
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    backgroundColor: '#090A0C',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../build/icon.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Allows local webcam and local storage streaming
    },
  });

  const devUrl = 'http://localhost:5173';
  const prodIndex = path.join(__dirname, '../dist/index.html');

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL(devUrl).catch(() => {
      // Fallback to built dist if dev server is starting
      mainWindow.loadFile(prodIndex);
    });
  } else {
    mainWindow.loadFile(prodIndex);
  }

  // Handle external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Enable DevTools via F12 or Cmd+Alt+I (Mac) / Ctrl+Shift+I (Windows)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (
      input.key === 'F12' ||
      ((input.control || input.meta) && input.alt && input.key.toLowerCase() === 'i') ||
      ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i')
    ) {
      mainWindow.webContents.toggleDevTools();
    }
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[Electron] Page failed to load:', errorCode, errorDescription);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── Open Mode Tab Kiosk Window (Fullscreen photobooth UI) ──
function openKioskTabWindow(tabUrl) {
  if (kioskTabWindow && !kioskTabWindow.isDestroyed()) {
    kioskTabWindow.focus();
    kioskTabWindow.loadURL(tabUrl);
    return;
  }

  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = primaryDisplay.workAreaSize;

  kioskTabWindow = new BrowserWindow({
    width: screenW,
    height: screenH,
    minWidth: 1024,
    minHeight: 768,
    backgroundColor: '#090A0C',
    autoHideMenuBar: true,
    fullscreen: false,
    icon: path.join(__dirname, '../build/icon.png'),
    title: 'MingleBooth — Mode Tab (Kiosk)',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Allow webcam + tether server access
    },
  });

  // Auto-grant media/camera permissions for Kiosk window
  if (kioskTabWindow.webContents.session) {
    kioskTabWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
      callback(true);
    });
    kioskTabWindow.webContents.session.setPermissionCheckHandler(() => true);
  }

  kioskTabWindow.maximize();
  kioskTabWindow.loadURL(tabUrl);

  // Inject fix CSS after page loads to ensure proper layout regardless of zoom
  kioskTabWindow.webContents.on('did-finish-load', () => {
    kioskTabWindow.webContents.insertCSS(`
      html { min-width: 1024px !important; overflow-x: auto !important; }
      body { min-width: 1024px !important; }
    `);
    kioskTabWindow.webContents.setZoomFactor(1.0);
    kioskTabWindow.webContents.setVisualZoomLevelLimits(1, 1);
  });

  // Exit kiosk mode on Escape key
  kioskTabWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape') {
      if (kioskTabWindow.isKiosk()) {
        kioskTabWindow.setKiosk(false);
      }
    }
    if (input.key === 'F12') {
      kioskTabWindow.webContents.toggleDevTools();
    }
    // F11 = toggle kiosk fullscreen
    if (input.key === 'F11') {
      kioskTabWindow.setKiosk(!kioskTabWindow.isKiosk());
    }
  });

  kioskTabWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.warn('[Electron] Kiosk Tab failed to load:', validatedURL, errorCode, errorDescription);
    if (errorCode !== -3) {
      kioskTabWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>MingleBooth Kiosk</title>
          <style>
            body { background: #07090E; color: #fff; font-family: -apple-system, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            h1 { font-size: 22px; margin-bottom: 8px; }
            p { color: #888; font-size: 13px; max-width: 440px; text-align: center; line-height: 1.5; margin-bottom: 24px; }
            button { background: #7C3AED; color: #fff; border: none; padding: 10px 24px; border-radius: 10px; font-weight: 600; cursor: pointer; font-size: 13px; }
            button:hover { background: #6D28D9; }
          </style>
        </head>
        <body>
          <h1>Gagal Menghubungkan ke Mode Tab</h1>
          <p>Koneksi internet tidak terhubung atau server sedang memuat ulang. Pastikan koneksi aktif lalu klik tombol di bawah.</p>
          <button onclick="window.location.href='${tabUrl}'">Muat Ulang Halaman</button>
        </body>
        </html>
      `)}`);
    }
  });

  kioskTabWindow.on('closed', () => {
    kioskTabWindow = null;
  });

  console.log('[Electron] Mode Tab Kiosk Window opened:', tabUrl);
}

// IPC Handlers
ipcMain.handle('app:toggle-kiosk', () => {
  if (mainWindow) {
    const isKiosk = mainWindow.isKiosk();
    mainWindow.setKiosk(!isKiosk);
    return !isKiosk;
  }
  return false;
});

// ── Open Mode Tab as Kiosk Window ──
ipcMain.handle('app:open-kiosk-tab', async (event, options = {}) => {
  const tetherServer = getTetherServer(4848);
  const ips = tetherServer.getLocalIPs();
  const localIp = ips.find(ip => ip !== '127.0.0.1') || '127.0.0.1';
  const hubParam = encodeURIComponent(`http://${localIp}:4848`);

  // Pass platform=desktop so tablet enables local USB / webcam discovery
  const tabletUrl = options.url || `https://minglebooth.id/tablet?hub=${hubParam}&platform=desktop`;

  openKioskTabWindow(tabletUrl);
  return { success: true, url: tabletUrl };
});

// ── Close Kiosk Tab Window ──
ipcMain.handle('app:close-kiosk-tab', () => {
  if (kioskTabWindow && !kioskTabWindow.isDestroyed()) {
    kioskTabWindow.close();
  }
  return { success: true };
});

// ── Toggle Kiosk Fullscreen on Kiosk Tab Window ──
ipcMain.handle('app:toggle-kiosk-tab-fullscreen', () => {
  if (kioskTabWindow && !kioskTabWindow.isDestroyed()) {
    const isKiosk = kioskTabWindow.isKiosk();
    kioskTabWindow.setKiosk(!isKiosk);
    return !isKiosk;
  }
  return false;
});

// ── Sony Camera Shutter Trigger via USB (gphoto2 / digiCamControl) ──
ipcMain.handle('camera:trigger-shutter', async () => {
  const tetherServer = getTetherServer(4848);
  const result = await triggerSonyShutter(tetherServer.tetherDir);
  return result;
});

ipcMain.handle('system:get-hwid', () => {
  return generateHardwareFingerprint();
});

ipcMain.handle('storage:select-folder', async (event, currentPath) => {
  try {

    const defaultPath = currentPath ? path.resolve(currentPath) : undefined;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Pilih Folder Penyimpanan Foto Photobooth',
      defaultPath,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { canceled: true };
    }
    return { canceled: false, selectedPath: result.filePaths[0] };
  } catch (err) {
    return { canceled: true, error: err.message };
  }
});

ipcMain.handle('storage:open-folder', async (event, folderPath) => {
  try {
    let resolvedPath;
    if (folderPath && path.isAbsolute(folderPath)) {
      resolvedPath = folderPath;
    } else if (folderPath) {
      resolvedPath = path.resolve(__dirname, '../../', folderPath.replace(/^\.\//, ''));
    } else {
      resolvedPath = path.resolve(__dirname, '../../data');
    }

    if (!fs.existsSync(resolvedPath)) {
      fs.mkdirSync(resolvedPath, { recursive: true });
    }
    const openResult = await shell.openPath(resolvedPath);
    if (openResult) {
      return { success: false, error: openResult };
    }
    return { success: true, path: resolvedPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('storage:list-files', async (event, { basePath, eventId }) => {
  try {
    const eventDir =
      basePath && path.isAbsolute(basePath)
        ? basePath
        : path.join(path.resolve(__dirname, '../../data'), 'events', eventId || '');
    const processedDir = path.join(eventDir, 'processed');
    const rawDir = path.join(eventDir, 'raw');

    const processedFiles = fs.existsSync(processedDir) ? fs.readdirSync(processedDir) : [];
    const rawFiles = fs.existsSync(rawDir) ? fs.readdirSync(rawDir) : [];

    let totalBytes = 0;
    const calculateSize = (dir) => {
      if (!fs.existsSync(dir)) return 0;
      let size = 0;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isFile()) {
          size += fs.statSync(fullPath).size;
        } else if (entry.isDirectory()) {
          size += calculateSize(fullPath);
        }
      }
      return size;
    };

    totalBytes = calculateSize(eventDir);

    return {
      success: true,
      eventDir,
      processedCount: processedFiles.filter((f) => !f.startsWith('.')).length,
      rawCount: rawFiles.filter((f) => !f.startsWith('.')).length,
      totalBytes,
    };
  } catch (err) {
    return { success: false, error: err.message, processedCount: 0, rawCount: 0, totalBytes: 0 };
  }
});

ipcMain.handle('printer:get-printers', async () => {
  if (mainWindow) {
    return await mainWindow.webContents.getPrintersAsync();
  }
  return [];
});

ipcMain.handle('printer:print-photo', async (event, { filePath, copies = 1, silent = true }) => {
  try {
    if (!mainWindow) return { success: false, error: 'No active window' };

    // Create invisible print worker window
    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const fileUrl = filePath.startsWith('http') || filePath.startsWith('file://')
      ? filePath
      : `file://${path.resolve(filePath)}`;

    await printWindow.loadURL(fileUrl);

    return new Promise((resolve) => {
      printWindow.webContents.print(
        {
          silent: silent,
          printBackground: true,
          copies: copies,
          margins: { marginType: 'none' },
        },
        (success, failureReason) => {
          printWindow.close();
          if (success) {
            resolve({ success: true, message: `Print job sent (${copies} copies)` });
          } else {
            resolve({ success: false, error: failureReason || 'Print failed' });
          }
        }
      );
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('tether:get-info', () => {
  try {
    const tetherServer = getTetherServer(4848);
    return {
      port: tetherServer.port,
      ips: tetherServer.getLocalIPs(),
      tetherDir: tetherServer.tetherDir,
      status: 'online',
    };
  } catch (err) {
    return { status: 'error', error: err.message, port: 4848, ips: ['127.0.0.1'] };
  }
});

app.whenReady().then(() => {
  // Start Tether Server for Remote PC / Tablet Hub
  try {
    const tetherServer = getTetherServer(4848);
    tetherServer.start();
  } catch (e) {
    console.error('[Electron] Failed to start Tether Server:', e);
  }

  const iconPath = path.join(__dirname, '../build/icon.png');
  if (process.platform === 'darwin' && app.dock && fs.existsSync(iconPath)) {
    try {
      app.dock.setIcon(iconPath);
    } catch (e) {
      console.warn('Could not set dock icon:', e);
    }
  }

  createWindow();

  // Auto-grant media (camera / microphone) permissions globally
  if (session && session.defaultSession) {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      callback(true);
    });
    session.defaultSession.setPermissionCheckHandler(() => true);
  }

  // Auto-launch Mode Tab Kiosk window so vendor gets Mode Tab directly on startup!
  setTimeout(() => {
    try {
      const tetherServer = getTetherServer(4848);
      const ips = tetherServer.getLocalIPs();
      const localIp = ips.find(ip => ip !== '127.0.0.1') || '127.0.0.1';
      const hubParam = encodeURIComponent(`http://${localIp}:4848`);
      const tabletUrl = `https://minglebooth.id/tablet?hub=${hubParam}&platform=desktop`;
      openKioskTabWindow(tabletUrl);
    } catch (e) {
      console.warn('[Electron] Could not auto-launch Mode Tab:', e);
    }
  }, 1200);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

