const { app, BrowserWindow, ipcMain, shell, dialog, session, systemPreferences } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const { exec } = require('child_process');
const { getTetherServer } = require('./tether-server.cjs');
const { getNativeCameraService } = require('./native-camera.cjs');

// ── Enforce Single Instance so earlier background processes never hold the camera ──
const gotSingleLock = app.requestSingleInstanceLock();
if (!gotSingleLock) {
  console.log('[Electron] Another instance is already running. Exiting.');
  app.quit();
  process.exit(0);
}

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

// ── HiDPI scaling – let the OS control device scale factor naturally ──
app.commandLine.appendSwitch('high-dpi-support', '1');
// NOTE: Do NOT force-device-scale-factor here; tablets/iPads need their
// native scale (e.g. 2×) so the UI renders at a legible physical size.

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

// ── Camera shutter trigger — routed through NativeCameraService (bundled engine) ──
// NOTE: The old triggerUniversalCameraShutter() calling bare 'gphoto2' via global PATH
// has been removed. All camera operations now go through NativeCameraService which
// uses absolute bundled binary paths and never relies on PATH.
async function triggerUniversalCameraShutter(tetherDir) {
  const nativeCamera = getNativeCameraService(tetherDir);
  console.log('[Electron] camera:trigger-shutter → NativeCameraService.triggerDirectCapture()');
  const result = await nativeCamera.triggerDirectCapture();
  return result;
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
  const nativeCamera = getNativeCameraService(tetherServer.tetherDir);
  nativeCamera.setTetherServer(tetherServer);

  const recentCapturedPhotos = new Set();
  const forwardPhotoToRenderer = (payload, origin) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const key = `${payload.filename}_${payload.byteSize || ''}`;
    if (recentCapturedPhotos.has(key)) {
      console.log(`[Electron] Duplicate photo from ${origin} suppressed:`, payload.filename);
      return;
    }
    recentCapturedPhotos.add(key);
    setTimeout(() => recentCapturedPhotos.delete(key), 15000);

    console.log(`[Electron] 📸 Forwarding photo (${origin}) to photobooth UI:`, payload.filename);
    mainWindow.webContents.send('tether:photo-captured', payload);
  };

  tetherServer.removeAllListeners('photo');
  tetherServer.on('photo', (payload) => {
    forwardPhotoToRenderer(payload, 'tetherServer');
  });

  nativeCamera.removeAllListeners('installLog');
  nativeCamera.removeAllListeners('stateChange');
  nativeCamera.removeAllListeners('liveFrame');
  nativeCamera.removeAllListeners('photoCaptured');

  nativeCamera.on('installLog', (logMsg) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('camera:driver-install-log', logMsg);
    }
  });

  nativeCamera.on('stateChange', (payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('camera:state-change', payload);
    }
  });

  nativeCamera.on('liveFrame', (payload) => {
    tetherServer.latestLiveFrame = payload.frameDataUrl;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('camera:live-frame', payload);
    }
  });

  nativeCamera.on('photoCaptured', (payload) => {
    tetherServer.latestPhotoBase64 = payload.photoDataUrl;
    tetherServer.latestPhotoFilename = payload.filename;
    tetherServer.latestPhotoTimestamp = payload.timestamp;
    tetherServer.markProcessed(payload.filename, payload.byteSize);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('camera:photo-captured', payload);
    }
    forwardPhotoToRenderer(payload, 'nativeCamera');
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

// ── Camera Shutter Trigger via USB (routed through NativeCameraService — bundled engine) ──
ipcMain.handle('camera:trigger-shutter', async () => {
  const tetherServer = getTetherServer(4848);
  const result = await triggerUniversalCameraShutter(tetherServer.tetherDir);
  if (!result.success && result.hint) {
    console.warn('[Electron] Camera trigger failed with hint:', result.hint);
  }
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

ipcMain.handle('camera:engine-self-test', async () => {
  const tetherServer = getTetherServer(4848);
  const nativeCamera = getNativeCameraService(tetherServer.tetherDir);
  return await nativeCamera.runEngineSelfTest();
});

ipcMain.handle('camera:get-capabilities', async (event, camera) => {
  const tetherServer = getTetherServer(4848);
  const nativeCamera = getNativeCameraService(tetherServer.tetherDir);
  return nativeCamera.detectCameraCapabilities(camera);
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

ipcMain.handle('camera:get-driver-state', async () => {
  const tetherServer = getTetherServer(4848);
  const nativeCamera = getNativeCameraService(tetherServer.tetherDir);
  return await nativeCamera.getDriverState();
});

ipcMain.handle('camera:start-driver-setup', async () => {
  const tetherServer = getTetherServer(4848);
  const nativeCamera = getNativeCameraService(tetherServer.tetherDir);
  return await nativeCamera.startDriverSetup();
});

ipcMain.handle('camera:rollback-driver', async () => {
  const tetherServer = getTetherServer(4848);
  const nativeCamera = getNativeCameraService(tetherServer.tetherDir);
  return await nativeCamera.rollbackDriver();
});

ipcMain.handle('camera:release-usb-lock', async () => {
  const tetherServer = getTetherServer(4848);
  const nativeCamera = getNativeCameraService(tetherServer.tetherDir);
  return await nativeCamera.releaseMacOSUsbLock();
});

ipcMain.handle('camera:detect-cameras', async () => {
  console.log('\n[CameraFix-2026-09-09-v2] detect-cameras handler loaded');
  console.log('[CameraIPC] camera:detect-cameras invoked');
  try {
    const tetherServer = getTetherServer(4848);
    const nativeCamera = getNativeCameraService(tetherServer.tetherDir);
    const result = await nativeCamera.detectConnectedCameras();
    console.log('[CameraFix-2026-09-09-v2] detect-cameras completed successfully. Result:', JSON.stringify(result));
    return result;
  } catch (error) {
    console.error('[CameraIPC] detect-cameras FAILED');
    console.error(error);
    console.error(error?.stack);
    throw error;
  }
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

ipcMain.handle('camera:connect', async (event, targetCamera) => {
  const tetherServer = getTetherServer(4848);
  const nativeCamera = getNativeCameraService(tetherServer.tetherDir);
  return await nativeCamera.connectCamera(targetCamera);
});

ipcMain.handle('camera:disconnect', async () => {
  const tetherServer = getTetherServer(4848);
  const nativeCamera = getNativeCameraService(tetherServer.tetherDir);
  return await nativeCamera.disconnectCamera();
});

ipcMain.handle('camera:start-liveview', async () => {
  const tetherServer = getTetherServer(4848);
  const nativeCamera = getNativeCameraService(tetherServer.tetherDir);
  nativeCamera.startLiveView();
  return { success: true };
});

ipcMain.handle('camera:stop-liveview', async () => {
  const tetherServer = getTetherServer(4848);
  const nativeCamera = getNativeCameraService(tetherServer.tetherDir);
  nativeCamera.stopLiveView();
  return { success: true };
});

ipcMain.handle('camera:get-state', () => {
  const tetherServer = getTetherServer(4848);
  const nativeCamera = getNativeCameraService(tetherServer.tetherDir);
  return nativeCamera.getState();
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
    if (folderPath && (folderPath.includes('tether-inbox') || folderPath.includes('hotfolder'))) {
      const home = os.homedir();
      resolvedPath = path.join(home, 'Pictures', 'MingleBooth', 'Tether-Inbox');
    } else if (folderPath && path.isAbsolute(folderPath)) {
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

function getEventStorageDir(eventName, customBasePath) {
  let baseDir;
  if (customBasePath && typeof customBasePath === 'string' && customBasePath.trim() !== '') {
    baseDir = customBasePath.trim();
  } else {
    const sanitized = (eventName || 'Acara_Photobooth')
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
    let basePictures;
    try {
      basePictures = app.getPath('pictures');
    } catch (e) {
      basePictures = path.join(os.homedir(), 'Pictures');
    }
    baseDir = path.join(basePictures, 'MingleBooth', sanitized);
  }
  const subdirs = ['processed', 'gifs', 'raw'];
  for (const sub of subdirs) {
    const p = path.join(baseDir, sub);
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
    }
  }
  return baseDir;
}

ipcMain.handle('storage:open-event-folder', async (event, payload) => {
  try {
    const eventName = typeof payload === 'string' ? payload : payload?.eventName;
    const customBasePath = typeof payload === 'object' ? payload?.customBasePath : undefined;
    const dir = getEventStorageDir(eventName, customBasePath);
    const openResult = await shell.openPath(dir);
    if (openResult) {
      return { success: false, error: openResult, path: dir };
    }
    return { success: true, path: dir };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('storage:save-capture-files', async (event, { eventName, customBasePath, photoId, photoBase64, gifBase64, rawShots }) => {
  try {
    const eventDir = getEventStorageDir(eventName, customBasePath);
    
    // 1. Save processed composite photo (JPG)
    if (photoBase64) {
      const match = photoBase64.match(/^data:image\/\w+;base64,(.+)$/);
      const buffer = Buffer.from(match ? match[1] : photoBase64, 'base64');
      fs.writeFileSync(path.join(eventDir, 'processed', `${photoId}.jpg`), buffer);
    }
    
    // 2. Save GIF (if available)
    if (gifBase64) {
      const match = gifBase64.match(/^data:image\/\w+;base64,(.+)$/);
      const buffer = Buffer.from(match ? match[1] : gifBase64, 'base64');
      fs.writeFileSync(path.join(eventDir, 'gifs', `${photoId}.gif`), buffer);
    }
    
    // 3. Save raw camera poses
    if (Array.isArray(rawShots)) {
      rawShots.forEach((shot, idx) => {
        const shotData = typeof shot === 'string' ? shot : shot.dataUrl;
        const index = typeof shot === 'object' && shot.index !== undefined ? shot.index : idx + 1;
        if (shotData) {
          const match = shotData.match(/^data:image\/\w+;base64,(.+)$/);
          const buffer = Buffer.from(match ? match[1] : shotData, 'base64');
          fs.writeFileSync(path.join(eventDir, 'raw', `${photoId}_raw_${index}.jpg`), buffer);
        }
      });
    }
    
    return { success: true, eventDir };
  } catch (err) {
    console.error('[Storage] Failed to save capture files to SSD:', err);
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

ipcMain.handle('camera:request-access', async () => {
  if (process.platform === 'darwin' && systemPreferences?.askForMediaAccess) {
    try {
      return await systemPreferences.askForMediaAccess('camera');
    } catch (e) {
      console.warn('[Electron] askForMediaAccess camera failed:', e);
      return false;
    }
  }
  return true;
});

ipcMain.handle('camera:get-status', () => {
  if (process.platform === 'darwin' && systemPreferences?.getMediaAccessStatus) {
    return systemPreferences.getMediaAccessStatus('camera');
  }
  return 'granted';
});

ipcMain.handle('camera:open-privacy-settings', () => {
  if (process.platform === 'darwin') {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Camera');
  }
  return true;
});

app.whenReady().then(async () => {
  // Start Tether Server for Remote PC / Tablet Hub
  try {
    const tetherServer = getTetherServer(4848);
    tetherServer.start();

    // Camera Engine Startup Self-Test (logged to developer logs only)
    const nativeCamera = getNativeCameraService(tetherServer.tetherDir);
    nativeCamera.runEngineSelfTest().then((res) => {
      console.log(`[StartupCameraTest] Engine: ${res.engine} | Ready: ${res.ready ? 'YES' : 'NO'}${res.version ? ' | ' + res.version : ''}`);
    }).catch((err) => {
      console.error('[StartupCameraTest] Engine self-test error:', err.message);
    });
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

  // Auto-grant media (camera / microphone) permissions globally
  if (session && session.defaultSession) {
    configureSessionPermissions(session.defaultSession);
  }

  // Request native OS camera / microphone permissions on macOS explicitly BEFORE creating window
  if (process.platform === 'darwin' && systemPreferences?.askForMediaAccess) {
    try {
      const cameraStatus = systemPreferences.getMediaAccessStatus('camera');
      if (cameraStatus !== 'granted') {
        const granted = await systemPreferences.askForMediaAccess('camera');
        console.log('[Electron] macOS Camera access granted on startup:', granted);
      }
    } catch (e) {
      console.warn('Media access check failed:', e);
    }
    systemPreferences.askForMediaAccess('microphone').catch(() => {});
  }

  createWindow();

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });



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

app.on('before-quit', async () => {
  try {
    const tetherServer = getTetherServer(4848);
    const nativeCamera = getNativeCameraService(tetherServer.tetherDir);
    await nativeCamera.disconnectCamera();
  } catch (e) {}
});

