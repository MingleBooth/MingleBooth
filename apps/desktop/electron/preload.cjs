const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use IPC safely
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  toggleKiosk: () => ipcRenderer.invoke('app:toggle-kiosk'),
  openKioskTab: (options) => ipcRenderer.invoke('app:open-kiosk-tab', options),
  closeKioskTab: () => ipcRenderer.invoke('app:close-kiosk-tab'),
  toggleKioskTabFullscreen: () => ipcRenderer.invoke('app:toggle-kiosk-tab-fullscreen'),
  triggerCameraShutter: () => ipcRenderer.invoke('camera:trigger-shutter'),
  getHWID: () => ipcRenderer.invoke('system:get-hwid'),
  printPhoto: (options, copies, silent) => {
    const payload = typeof options === 'string'
      ? { filePath: options, copies: copies || 1, silent: silent !== undefined ? silent : true }
      : (options || {});
    return ipcRenderer.invoke('printer:print-photo', payload);
  },
  openFolder: (folderPath) => ipcRenderer.invoke('storage:open-folder', folderPath),
  openEventFolder: (payload) => ipcRenderer.invoke('storage:open-event-folder', payload),
  saveCaptureFiles: (data) => ipcRenderer.invoke('storage:save-capture-files', data),
  cleanDemoStorage: () => ipcRenderer.invoke('storage:clean-demo-files'),
  getDemoStorageDir: () => ipcRenderer.invoke('storage:get-demo-dir'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  selectFolder: (currentPath) => ipcRenderer.invoke('storage:select-folder', currentPath),
  listFiles: (options) => ipcRenderer.invoke('storage:list-files', options),
  getPrinters: () => ipcRenderer.invoke('printer:get-printers'),
  getTetherInfo: () => ipcRenderer.invoke('tether:get-info'),
  setTetherFolder: (folderPath) => ipcRenderer.invoke('tether:set-folder', folderPath),
  onTetherPhotoCaptured: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('tether:photo-captured', handler);
    return () => ipcRenderer.removeListener('tether:photo-captured', handler);
  },
  onTetherRawDetected: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('tether:raw-detected', handler);
    return () => ipcRenderer.removeListener('tether:raw-detected', handler);
  },
  // Native Direct USB Camera Controls
  getNativeCameraStatus: () => ipcRenderer.invoke('camera:get-native-status'),
  getCameraEngineSelfTest: () => ipcRenderer.invoke('camera:engine-self-test'),
  getCameraCapabilities: (camera) => ipcRenderer.invoke('camera:get-capabilities', camera),
  installCameraDriver: () => ipcRenderer.invoke('camera:install-driver'),
  releaseUsbLock: () => ipcRenderer.invoke('camera:release-usb-lock'),
  detectNativeCameras: () => ipcRenderer.invoke('camera:detect-cameras'),
  connectNativeCamera: (targetCamera) => ipcRenderer.invoke('camera:connect', targetCamera),
  disconnectNativeCamera: () => ipcRenderer.invoke('camera:disconnect'),
  startCameraLiveView: () => ipcRenderer.invoke('camera:start-liveview'),
  startLiveView: () => ipcRenderer.invoke('camera:start-liveview'),
  stopCameraLiveView: () => ipcRenderer.invoke('camera:stop-liveview'),
  stopLiveView: () => ipcRenderer.invoke('camera:stop-liveview'),
  getCameraLiveViewState: () => ipcRenderer.invoke('camera:get-live-view-state'),
  getNativeCameraState: () => ipcRenderer.invoke('camera:get-state'),
  startNativeTether: () => ipcRenderer.invoke('camera:start-native-tether'),
  stopNativeTether: () => ipcRenderer.invoke('camera:stop-native-tether'),
  triggerNativeCapture: () => ipcRenderer.invoke('camera:direct-capture'),
  directCapture: () => ipcRenderer.invoke('camera:direct-capture'),
  onCameraStateChange: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('camera:state-change', handler);
    return () => ipcRenderer.removeListener('camera:state-change', handler);
  },
  onCameraLiveFrame: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('camera:live-frame', handler);
    return () => ipcRenderer.removeListener('camera:live-frame', handler);
  },
  onCameraPhotoCaptured: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('camera:photo-captured', handler);
    return () => ipcRenderer.removeListener('camera:photo-captured', handler);
  },
  onDriverInstallLog: (callback) => {
    const handler = (_event, logMsg) => callback(logMsg);
    ipcRenderer.on('camera:driver-install-log', handler);
    return () => ipcRenderer.removeListener('camera:driver-install-log', handler);
  },
  // Windows Dedicated Driver Manager
  getDriverState: () => ipcRenderer.invoke('camera:get-driver-state'),
  startDriverSetup: () => ipcRenderer.invoke('camera:start-driver-setup'),
  rollbackCameraDriver: () => ipcRenderer.invoke('camera:rollback-driver'),
  onDriverStateChange: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('camera:driver-state-change', handler);
    return () => ipcRenderer.removeListener('camera:driver-state-change', handler);
  },
  // macOS Native Camera Permissions
  requestCameraAccess: () => ipcRenderer.invoke('camera:request-access'),
  getCameraAccessStatus: () => ipcRenderer.invoke('camera:get-status'),
  openCameraPrivacySettings: () => ipcRenderer.invoke('camera:open-privacy-settings'),
  // MingleBooth Dedicated Graphical Camera QA Suite
  qa: {
    checkEnvironment: () => ipcRenderer.invoke('qa:check-environment'),
    detectCamera: () => ipcRenderer.invoke('qa:detect-camera'),
    setupDriver: () => ipcRenderer.invoke('qa:setup-driver'),
    testConnection: (profile) => ipcRenderer.invoke('qa:test-connection', profile),
    triggerCapture: (profile) => ipcRenderer.invoke('qa:trigger-capture', profile),
    rollbackDriver: () => ipcRenderer.invoke('qa:rollback-driver'),
    enableTestMode: () => ipcRenderer.invoke('qa:enable-test-mode'),
    restoreNormalMode: () => ipcRenderer.invoke('qa:restore-normal-mode'),
    testElevation: () => ipcRenderer.invoke('qa:test-elevation'),
    rebootSystem: () => ipcRenderer.invoke('qa:reboot-system'),
    exportReport: () => ipcRenderer.invoke('qa:export-report'),
    isQaMode: () => ipcRenderer.invoke('qa:is-qa-mode'),
  },
});

