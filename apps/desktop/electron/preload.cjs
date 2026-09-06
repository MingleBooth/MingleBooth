const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use IPC safely
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  toggleKiosk: () => ipcRenderer.invoke('app:toggle-kiosk'),
  getHWID: () => ipcRenderer.invoke('system:get-hwid'),
  printPhoto: (options) => ipcRenderer.invoke('printer:print-photo', options),
  openFolder: (folderPath) => ipcRenderer.invoke('storage:open-folder', folderPath),
  selectFolder: (currentPath) => ipcRenderer.invoke('storage:select-folder', currentPath),
  listFiles: (options) => ipcRenderer.invoke('storage:list-files', options),
  getPrinters: () => ipcRenderer.invoke('printer:get-printers'),
  getTetherInfo: () => ipcRenderer.invoke('tether:get-info'),
});

