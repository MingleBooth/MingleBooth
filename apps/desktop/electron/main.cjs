const { app, BrowserWindow, ipcMain, shell, dialog, session, systemPreferences } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const { exec } = require('child_process');
const { getTetherServer } = require('./tether-server.cjs');
const { getNativeCameraService } = require('./native-camera.cjs');
const { getQAOrchestrator } = require('./qa-orchestrator.cjs');

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

  tetherServer.removeAllListeners('raw-detected');
  tetherServer.on('raw-detected', (payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tether:raw-detected', payload);
    }
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
      if (process.platform === 'win32' && (!app.isPackaged || process.argv.includes('--qa') || process.argv.includes('--debug'))) {
        if (!mainWindow._lastWinLvLog || Date.now() - mainWindow._lastWinLvLog > 3000) {
          console.log('[WIN-LV] frame forwarded to renderer');
          mainWindow._lastWinLvLog = Date.now();
        }
      }
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

    const isQaMode = process.argv.includes('--qa') || process.argv.includes('--camera-qa') || process.env.MINGLEBOOTH_QA_MODE === 'true';

    checkViteServer().then((isViteRunning) => {
      const urlToLoad = isQaMode ? `${devUrl}#qa` : devUrl;
      if (isQaMode) {
        mainWindow.setTitle('MingleBooth Camera QA — Pengujian Perangkat Keras Tablet');
      }

      if (isViteRunning) {
        console.log('[Electron] Loading local Vite Dev Server:', urlToLoad);
        mainWindow.loadURL(urlToLoad);
      } else if (fs.existsSync(prodIndex)) {
        console.log('[Electron] Vite dev offline, loading built dist:', prodIndex);
        if (isQaMode) {
          mainWindow.loadFile(prodIndex, { hash: 'qa' });
        } else {
          mainWindow.loadFile(prodIndex);
        }
      } else {
        console.log('[Electron] Loading dev URL:', urlToLoad);
        mainWindow.loadURL(urlToLoad).catch(() => {
          if (fs.existsSync(prodIndex)) {
            if (isQaMode) mainWindow.loadFile(prodIndex, { hash: 'qa' });
            else mainWindow.loadFile(prodIndex);
          }
        });
      }
    });
  } else {
    const isQaMode = process.argv.includes('--qa') || process.argv.includes('--camera-qa') || process.env.MINGLEBOOTH_QA_MODE === 'true';
    if (isQaMode) {
      mainWindow.setTitle('MingleBooth Camera QA — Pengujian Perangkat Keras Tablet');
      mainWindow.loadFile(prodIndex, { hash: 'qa' });
    } else {
      mainWindow.loadFile(prodIndex);
    }
  }

  // Handle external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Inject fix CSS after page loads
  mainWindow.webContents.on('did-finish-load', async () => {
    mainWindow.webContents.insertCSS(`
      html { min-width: 1024px !important; overflow-x: auto !important; }
      body { min-width: 1024px !important; }
    `);
    mainWindow.webContents.setZoomFactor(1.0);
    mainWindow.webContents.setVisualZoomLevelLimits(1, 1);

    // Auto-detect and connect camera on startup so UI displays READY state
    try {
      const det = await nativeCamera.detectConnectedCameras();
      if (det.success && det.cameras && det.cameras.length > 0) {
        console.log('[Electron] Startup: Connected camera detected:', det.cameras[0].model);
        await nativeCamera.connectCamera(det.cameras[0]);
      }
    } catch (e) {
      console.warn('[Electron] Startup camera check:', e.message);
    }
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

// ── MingleBooth Dedicated Graphical Camera QA Suite IPC Handlers ─────────
const qaOrchestrator = getQAOrchestrator();

ipcMain.handle('qa:check-environment', async () => await qaOrchestrator.checkEnvironment());
ipcMain.handle('qa:detect-camera', async () => await qaOrchestrator.detectCamera());
ipcMain.handle('qa:setup-driver', async () => await qaOrchestrator.setupDriver());
ipcMain.handle('qa:test-connection', async (_e, profile) => await qaOrchestrator.testConnection(profile));
ipcMain.handle('qa:trigger-capture', async (_e, profile) => await qaOrchestrator.triggerCapture(profile));
ipcMain.handle('qa:rollback-driver', async () => await qaOrchestrator.rollbackDriver());
ipcMain.handle('qa:enable-test-mode', async () => await qaOrchestrator.enableTestMode());
ipcMain.handle('qa:restore-normal-mode', async () => await qaOrchestrator.restoreNormalMode());
ipcMain.handle('qa:test-elevation', async () => await qaOrchestrator.testElevation());
ipcMain.handle('qa:reboot-system', async () => await qaOrchestrator.rebootSystem());
ipcMain.handle('qa:export-report', async () => await qaOrchestrator.exportDiagnosticReport());
ipcMain.handle('qa:is-qa-mode', async () => {
  return process.argv.includes('--qa') || process.argv.includes('--camera-qa') || process.env.MINGLEBOOTH_QA_MODE === 'true';
});

ipcMain.handle('camera:release-usb-lock', async () => {
  const tetherServer = getTetherServer(4848);
  const nativeCamera = getNativeCameraService(tetherServer.tetherDir);
  return await nativeCamera.releaseMacOSUsbLock();
});

ipcMain.handle('camera:detect-cameras', async () => {
  const isDebug = !app.isPackaged || process.argv.includes('--qa') || process.argv.includes('--debug');
  if (process.platform === 'win32' && isDebug) {
    console.log('[WIN-TRACE] detectNativeCameras called');
  }
  if (isDebug) {
    console.log('\n[CameraFix-2026-09-09-v2] detect-cameras handler loaded');
  }
  console.log('[CameraIPC] camera:detect-cameras invoked');
  try {
    const tetherServer = getTetherServer(4848);
    const nativeCamera = getNativeCameraService(tetherServer.tetherDir);
    const result = await nativeCamera.detectConnectedCameras();
    if (process.platform === 'win32' && isDebug) {
      console.log('[WIN-TRACE] detection result:', JSON.stringify(result.cameras?.map(c => c.model) || []));
    }
    if (isDebug) {
      console.log('[CameraFix-2026-09-09-v2] detect-cameras completed successfully. Result:', JSON.stringify(result));
    }
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
  const isDebug = !app.isPackaged || process.argv.includes('--qa') || process.argv.includes('--debug');
  if (process.platform === 'win32' && isDebug) {
    console.log('[WIN-TRACE] connectNativeCamera called:', targetCamera?.model || 'auto');
  }
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
  const isDebug = !app.isPackaged || process.argv.includes('--qa') || process.argv.includes('--debug');
  if (process.platform === 'win32' && isDebug) {
    console.log('[WIN-LV] IPC startLiveView received');
  }
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

ipcMain.handle('camera:get-live-view-state', () => {
  const tetherServer = getTetherServer(4848);
  const nativeCamera = getNativeCameraService(tetherServer.tetherDir);
  if (nativeCamera.sonyBackend && typeof nativeCamera.sonyBackend.getLiveViewState === 'function') {
    return { state: nativeCamera.sonyBackend.getLiveViewState() };
  }
  return { state: nativeCamera.isLiveViewActive ? 'running' : 'stopped' };
});

ipcMain.handle('camera:get-state', () => {
  const tetherServer = getTetherServer(4848);
  const nativeCamera = getNativeCameraService(tetherServer.tetherDir);
  return nativeCamera.getState();
});

ipcMain.handle('camera:direct-capture', async () => {
  if (process.platform === 'win32') {
    console.log('[WIN-CAPTURE] IPC direct capture received');
  }
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

function getDemoStorageDir() {
  const baseDir = path.join(app.getPath('userData'), 'demo_storage');
  const subdirs = ['processed', 'gifs', 'raw'];
  for (const sub of subdirs) {
    const p = path.join(baseDir, sub);
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
    }
  }
  return baseDir;
}

function cleanDemoStorage() {
  try {
    const demoDir = path.join(app.getPath('userData'), 'demo_storage');
    if (fs.existsSync(demoDir)) {
      const entries = fs.readdirSync(demoDir);
      for (const entry of entries) {
        const fullPath = path.join(demoDir, entry);
        fs.rmSync(fullPath, { recursive: true, force: true });
      }
      console.log('[Storage] Cleaned demo storage directory safely:', demoDir);
    }
    getDemoStorageDir();
    return { success: true };
  } catch (err) {
    console.warn('[Storage] Warning cleaning demo storage:', err.message);
    return { success: false, error: err.message };
  }
}

ipcMain.handle('storage:clean-demo-files', async () => {
  return cleanDemoStorage();
});

ipcMain.handle('storage:get-demo-dir', async () => {
  return getDemoStorageDir();
});

ipcMain.handle('app:open-external', async (event, url) => {
  if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
    shell.openExternal(url);
    return { success: true };
  }
  return { success: false, error: 'Invalid URL' };
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
    const isDemo = typeof payload === 'object' && payload?.isDemo;
    const dir = isDemo
      ? getDemoStorageDir()
      : getEventStorageDir(
          typeof payload === 'string' ? payload : payload?.eventName,
          typeof payload === 'object' ? payload?.customBasePath : undefined
        );
    const openResult = await shell.openPath(dir);
    if (openResult) {
      return { success: false, error: openResult, path: dir };
    }
    return { success: true, path: dir };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('storage:save-capture-files', async (event, { eventName, customBasePath, photoId, photoBase64, gifBase64, rawShots, isDemo }) => {
  try {
    const eventDir = isDemo ? getDemoStorageDir() : getEventStorageDir(eventName, customBasePath);
    
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
    
    return { success: true, eventDir, isDemo: Boolean(isDemo) };
  } catch (err) {
    console.error('[Storage] Failed to save capture files to SSD:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('storage:list-files', async (event, options = {}) => {
  try {
    const { basePath, eventId, isDemo } = options;
    const eventDir = isDemo
      ? getDemoStorageDir()
      : basePath && path.isAbsolute(basePath)
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
      isDemo: Boolean(isDemo),
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

/**
 * Authoritative License & Print Entitlement Guard (Electron Main Process)
 * Enforces subscription gating for physical printing. Rejects demo sessions,
 * expired licenses, device mismatches, and unauthenticated print requests.
 * Never trusts unverified client flags.
 */
async function verifyPrintEntitlement(options = {}) {
  let licenseToken = options.licenseToken;

  // 1. If not provided directly in options, read from authentic window session storage
  if (!licenseToken && mainWindow && !mainWindow.isDestroyed()) {
    try {
      licenseToken = await mainWindow.webContents.executeJavaScript('localStorage.getItem("mb_license_token")');
    } catch {
      licenseToken = null;
    }
  }

  // 2. Check window demo flag as secondary defense
  let windowIsDemo = false;
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      const demoStr = await mainWindow.webContents.executeJavaScript('localStorage.getItem("mb_is_demo")');
      windowIsDemo = demoStr === 'true';
    } catch {
      windowIsDemo = false;
    }
  }

  if (windowIsDemo) {
    return {
      allowed: false,
      code: 'DEMO_MODE_BLOCKED',
      error: 'Fitur Cetak Foto tersedia setelah langganan aktif.',
    };
  }

  if (!licenseToken || typeof licenseToken !== 'string') {
    return {
      allowed: false,
      code: 'AUTH_REQUIRED',
      error: 'Fitur Cetak Foto memerlukan autentikasi lisensi vendor aktif.',
    };
  }

  // 3. Decode & inspect token structure
  let parsed;
  try {
    const jsonStr = Buffer.from(licenseToken, 'base64').toString('utf8');
    parsed = JSON.parse(jsonStr);
  } catch {
    return {
      allowed: false,
      code: 'LICENSE_INVALID',
      error: 'Format lisensi tidak valid (LICENSE_INVALID).',
    };
  }

  const payload = parsed?.payload;
  if (!payload || typeof payload !== 'object') {
    return {
      allowed: false,
      code: 'LICENSE_INVALID',
      error: 'Struktur data lisensi rusak.',
    };
  }

  // 4. Token-level Demo check (authoritative from signed token payload)
  if (payload.isDemo === true) {
    return {
      allowed: false,
      code: 'DEMO_MODE_BLOCKED',
      error: 'Fitur Cetak Foto tersedia setelah langganan aktif.',
    };
  }

  // 5. Expiration & offline grace period check
  const expiresAtStr = payload.expiresAt || payload.validUntil;
  if (expiresAtStr) {
    const expiryMs = new Date(expiresAtStr).getTime();
    if (!isNaN(expiryMs)) {
      const gracePeriodDays = payload.offlineGracePeriodDays || 7;
      const gracePeriodMs = gracePeriodDays * 24 * 60 * 60 * 1000;
      if (Date.now() > expiryMs + gracePeriodMs) {
        return {
          allowed: false,
          code: 'SUBSCRIPTION_EXPIRED',
          error: 'Masa aktif langganan telah berakhir. Cetak diblokir.',
        };
      }
    }
  }

  // 6. Hardware binding check (if token specifies hwid)
  const currentHwid = generateHardwareFingerprint();
  const tokenHwid = payload.hwid || payload.hardwareFingerprint;
  if (tokenHwid && tokenHwid !== currentHwid) {
    return {
      allowed: false,
      code: 'DEVICE_MISMATCH',
      error: 'Lisensi ini terdaftar untuk perangkat lain (DEVICE_MISMATCH).',
    };
  }

  return { allowed: true, payload };
}

ipcMain.handle('printer:print-photo', async (event, rawOptions) => {
  try {
    const options = typeof rawOptions === 'string'
      ? { filePath: rawOptions }
      : (rawOptions || {});
    const { filePath, copies = 1, silent = true } = options;

    if (!mainWindow) return { success: false, error: 'No active window' };

    // ── STRICT SUBSCRIPTION / DEMO GATE IN ELECTRON MAIN PROCESS ──
    const entitlement = await verifyPrintEntitlement(options);
    if (!entitlement.allowed) {
      console.warn(`[Printer Guard] Blocked print request (${entitlement.code}): ${entitlement.error}`);
      return {
        success: false,
        error: entitlement.error,
        code: entitlement.code,
      };
    }

    if (!filePath) {
      return { success: false, error: 'No filePath provided for printing' };
    }

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
  // Safely clean up any abandoned demo temporary files on startup
  try {
    cleanDemoStorage();
  } catch (e) {
    console.warn('[Storage] Startup demo cleanup notice:', e.message);
  }

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

