const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

let mainWindow = null;

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

// IPC Handlers
ipcMain.handle('app:toggle-kiosk', () => {
  if (mainWindow) {
    const isKiosk = mainWindow.isKiosk();
    mainWindow.setKiosk(!isKiosk);
    return !isKiosk;
  }
  return false;
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

app.whenReady().then(() => {
  const iconPath = path.join(__dirname, '../build/icon.png');
  if (process.platform === 'darwin' && app.dock && fs.existsSync(iconPath)) {
    try {
      app.dock.setIcon(iconPath);
    } catch (e) {
      console.warn('Could not set dock icon:', e);
    }
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
