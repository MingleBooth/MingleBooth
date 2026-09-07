const { app, BrowserWindow, ipcMain, shell, dialog, session, systemPreferences } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const { exec } = require('child_process');
const { getTetherServer } = require('./tether-server.cjs');
const { getNativeCameraService } = require('./native-camera.cjs');

// ── Configure full media (camera/mic/device) permissions for WebContents session ──
function configureSessionPermissions(ses) {
  if (!ses) return;
  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(true);
  });
  ses.setPermissionCheckHandler(() => true);
  if (typeof ses.setDevicePermissionHandler === 'function') {
    ses.setDevicePermissionHandler(() => true);
  }
}

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
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: screenW,
    height: screenH,
    minWidth: 1024,
    minHeight: 768,
    backgroundColor: '#090A0C',
    autoHideMenuBar: true,
    fullscreen: false,
    icon: path.join(__dirname, '../build/icon.png'),
    title: 'MingleBooth Tablet Studio — Operator Photobooth',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Allows local webcam and local storage streaming
    },
  });

  // Auto-grant full media permissions for mainWindow
  if (mainWindow.webContents.session) {
    configureSessionPermissions(mainWindow.webContents.session);
  }

  mainWindow.maximize();

  const tetherServer = getTetherServer(4848);
  tetherServer.removeAllListeners('photo');
  tetherServer.on('photo', (payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      console.log('[Electron] 📸 Forwarding tether photo to photobooth UI:', payload.filename);
      mainWindow.webContents.send('tether:photo-captured', payload);
    }
  });

  const nativeCamera = getNativeCameraService(tetherServer.tetherDir);
  nativeCamera.removeAllListeners('installLog');
  nativeCamera.on('installLog', (logMsg) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('camera:driver-install-log', logMsg);
    }
  });

  const devUrl = 'http://localhost:5173';
  const prodIndex = path.join(__dirname, '../dist/index.html');

  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    const http = require('http');
    const checkViteServer = () => new Promise((resolve) => {
      const req = http.get(devUrl, (res) => resolve(res.statusCode < 500));
      req.on('error', () => resolve(false));
      req.setTimeout(800, () => { req.destroy(); resolve(false); });
    });

    checkViteServer().then((isViteRunning) => {
      if (isViteRunning) {
        console.log('[Electron] Loading local Vite Dev Server:', devUrl);
        mainWindow.loadURL(devUrl);
      } else if (fs.existsSync(prodIndex)) {
        console.log('[Electron] Vite dev offline, loading built dist:', prodIndex);
        mainWindow.loadFile(prodIndex);
      } else {
        console.log('[Electron] Loading dev URL:', devUrl);
        mainWindow.loadURL(devUrl).catch(() => {
          if (fs.existsSync(prodIndex)) mainWindow.loadFile(prodIndex);
        });
      }
    });
  } else {
    mainWindow.loadFile(prodIndex);
  }

  // Handle external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Inject fix CSS after page loads
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.insertCSS(`
      html { min-width: 1024px !important; overflow-x: auto !important; }
      body { min-width: 1024px !important; }
    `);
    mainWindow.webContents.setZoomFactor(1.0);
    mainWindow.webContents.setVisualZoomLevelLimits(1, 1);
  });

  // Keyboard shortcuts: Escape to exit kiosk, F11 for Kiosk fullscreen, F12 for DevTools
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape' && mainWindow.isKiosk()) {
      mainWindow.setKiosk(false);
    }
    if (
      input.key === 'F12' ||
      ((input.control || input.meta) && input.alt && input.key.toLowerCase() === 'i') ||
      ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i')
    ) {
      mainWindow.webContents.toggleDevTools();
    }
    if (input.key === 'F11') {
      mainWindow.setKiosk(!mainWindow.isKiosk());
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── Open / Focus Tablet Studio Window ──
function openKioskTabWindow(tabUrl) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    if (tabUrl) mainWindow.loadURL(tabUrl);
  } else {
    createWindow();
  }
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
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    if (options.url) mainWindow.loadURL(options.url);
  }
  return { success: true };
});

// ── Close Kiosk Tab Window ──
ipcMain.handle('app:close-kiosk-tab', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
  return { success: true };
});

// ── Toggle Kiosk Fullscreen on Kiosk Tab Window ──
ipcMain.handle('app:toggle-kiosk-tab-fullscreen', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const isKiosk = mainWindow.isKiosk();
    mainWindow.setKiosk(!isKiosk);
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

ipcMain.handle('tether:set-folder', async (event, folderPath) => {
  const tetherServer = getTetherServer(4848);
  tetherServer.setTetherDirectory(folderPath);
  return { success: true, tetherDir: tetherServer.tetherDir };
});

// ── Native Direct USB Camera Operations (No 3rd Party App Required) ──
ipcMain.handle('camera:get-native-status', async () => {
  const tetherServer = getTetherServer(4848);
  const nativeCamera = getNativeCameraService(tetherServer.tetherDir);
  return await nativeCamera.checkDriverStatus();
});

ipcMain.handle('camera:install-driver', async () => {
  const tetherServer = getTetherServer(4848);
  const nativeCamera = getNativeCameraService(tetherServer.tetherDir);
  return await nativeCamera.installDriver((logMsg) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('camera:driver-install-log', logMsg);
    }
  });
});

ipcMain.handle('camera:release-usb-lock', async () => {
  const tetherServer = getTetherServer(4848);
  const nativeCamera = getNativeCameraService(tetherServer.tetherDir);
  return await nativeCamera.releaseMacOSUsbLock();
});

ipcMain.handle('camera:detect-cameras', async () => {
  const tetherServer = getTetherServer(4848);
  const nativeCamera = getNativeCameraService(tetherServer.tetherDir);
  return await nativeCamera.detectConnectedCameras();
});

ipcMain.handle('camera:start-native-tether', async () => {
  const tetherServer = getTetherServer(4848);
  const nativeCamera = getNativeCameraService(tetherServer.tetherDir);
  return await nativeCamera.startNativeTether();
});

ipcMain.handle('camera:stop-native-tether', async () => {
  const tetherServer = getTetherServer(4848);
  const nativeCamera = getNativeCameraService(tetherServer.tetherDir);
  nativeCamera.stopNativeTether();
  return { success: true };
});

ipcMain.handle('camera:direct-capture', async () => {
  const tetherServer = getTetherServer(4848);
  const nativeCamera = getNativeCameraService(tetherServer.tetherDir);
  return await nativeCamera.triggerDirectCapture();
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
  // Auto-grant media (camera / microphone) permissions globally
  if (session && session.defaultSession) {
    configureSessionPermissions(session.defaultSession);
  }

  // Request native OS camera / microphone permissions on macOS explicitly
  if (process.platform === 'darwin' && systemPreferences?.askForMediaAccess) {
    try {
      const cameraStatus = systemPreferences.getMediaAccessStatus('camera');
      if (cameraStatus !== 'granted') {
        systemPreferences.askForMediaAccess('camera').then((granted) => {
          console.log('[Electron] macOS Camera access granted:', granted);
        }).catch((e) => console.warn('[Electron] Camera permission error:', e));
      }
    } catch (e) {
      console.warn('Media access check failed:', e);
    }
    systemPreferences.askForMediaAccess('microphone').catch(() => {});
  }

  createWindow();



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

