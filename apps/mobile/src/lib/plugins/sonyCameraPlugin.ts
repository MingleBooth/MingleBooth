/**
 * MingleBooth Sony Direct USB Camera Plugin Interface (Capacitor 6)
 * 
 * Defines the contract for direct USB communication with Sony cameras (ImageCaptureCore on iPadOS / PTP Driver on Android).
 */

import { registerPlugin, PluginListenerHandle } from '@capacitor/core';

export type CameraConnectionState =
  | 'disconnected'
  | 'discovering'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'error'
  | 'DISCONNECTED'
  | 'USB_CONNECTED'
  | 'USB_DEVICE_DETECTED'
  | 'USB_PERMISSION_GRANTED'
  | 'USB_INTERFACE_CLAIMED'
  | 'PTP_SESSION_OPEN'
  | 'CAMERA_READY'
  | 'LIVE_VIEW_STARTING'
  | 'LIVE_VIEW_STREAMING'
  | 'LIVE_VIEW_ERROR'
  | 'CAPTURE_IN_PROGRESS'
  | 'ERROR';

export interface DiscoveredCamera {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  connectionType: 'usb' | 'wifi';
  serialNumber?: string;
  hasPermission?: boolean;
  vendorId?: number;
  productId?: number;
}

export interface CameraStatus {
  isConnected: boolean;
  state: CameraConnectionState | string;
  model: string;
  manufacturer?: string;
  serialNumber?: string;
  batteryLevel?: number; // 0 - 100 %
  isBatteryCharging?: boolean;
  storageRemainingShots?: number;
  currentIso?: string;
  currentAperture?: string;
  currentShutterSpeed?: string;
  message?: string;
  error?: string;
  liveViewError?: string;
  isLiveViewStreaming?: boolean;
  fps?: number;
  totalFrames?: number;
  firstValidFrameTimeMs?: number;
  diagnosticReport?: string;
}

export interface CameraCapabilities {
  supportsLiveView: boolean;
  supportsCapture: boolean;
  supportsApertureControl: boolean;
  supportsShutterSpeedControl: boolean;
  supportsIsoControl: boolean;
  supportedIsoValues: string[];
  supportedApertures: string[];
  supportedShutterSpeeds: string[];
}

export interface CapturedImageResult {
  photoId: string;
  nativeFilePath: string; // File stored in native Documents folder
  dataUrl?: string;       // Fast base64 preview for instant UI display
  width: number;
  height: number;
  format: 'jpeg' | 'raw';
  correlationId?: string;
}

export interface LiveViewStreamInfo {
  streamUrl: string; // Local loopback MJPEG stream URL (e.g., http://127.0.0.1:4949/liveview)
  width: number;
  height: number;
  fps: number;
}

export interface SonyDirectCameraPlugin {
  /**
   * Mulai memindai kamera yang terhubung via kabel USB.
   */
  discoverCameras(): Promise<{ cameras: DiscoveredCamera[] }>;

  /**
   * Hubungkan ke kamera yang dipilih berdasarkan cameraId.
   */
  connectCamera(options: { cameraId: string }): Promise<{ success: boolean; status: CameraStatus }>;

  /**
   * Sambungkan ulang koneksi kamera Sony USB (membersihkan resource sebelum membuat koneksi baru).
   */
  reconnectCamera(options?: { cameraId?: string }): Promise<{ success: boolean; status?: CameraStatus }>;

  /**
   * Putuskan koneksi kamera secara aman.
   */
  disconnectCamera(): Promise<{ success: boolean }>;

  /**
   * Dapatkan status operasional kamera saat ini.
   */
  getCameraStatus(): Promise<CameraStatus>;

  /**
   * Dapatkan informasi diagnostik USB mendalam (descriptor tree, opcode, endpoint status).
   */
  getUsbDiagnostics(): Promise<{
    diagnosticReport: string;
    lastError: string;
    currentState: string;
    lastSuccessfulStage?: string;
    failedStage?: string;
    lastEndpoint?: string;
    lastOpCode?: string;
    lastReturnCode?: number;
    lastHaltRecoveryStatus?: string;
    buildIdentifier?: string;
    versionCode?: number;
    versionName?: string;
  }>;

  /**
   * Dapatkan kapabilitas fungsional kamera terhubung.
   */
  getCameraCapabilities(): Promise<CameraCapabilities>;

  /**
   * Mulai streaming Live View dari sensor kamera Sony.
   * Mengembalikan local loopback HTTP stream URL untuk ditampilkan langsung di WebView.
   */
  startLiveView(): Promise<LiveViewStreamInfo>;

  /**
   * Hentikan streaming Live View untuk menghemat daya kamera.
   */
  stopLiveView(): Promise<{ success: boolean }>;

  /**
   * Picu penangkapan foto resolusi penuh (Full-Res Shutter Capture).
   */
  capturePhoto(options?: { correlationId?: string }): Promise<CapturedImageResult>;

  /**
   * Listener event penangkapan foto selesai dari kamera.
   */
  addListener(
    eventName: 'onPhotoCaptured',
    listenerFunc: (result: CapturedImageResult) => void
  ): Promise<PluginListenerHandle>;

  /**
   * Listener perubahan status koneksi kamera (connect, disconnect, battery low).
   */
  addListener(
    eventName: 'onCameraStatusChanged',
    listenerFunc: (status: CameraStatus) => void
  ): Promise<PluginListenerHandle>;
}

export const SonyDirectCamera = registerPlugin<SonyDirectCameraPlugin>('SonyDirectCamera', {
  web: () => ({
    discoverCameras: async () => {
      console.warn('[SonyDirectCamera] Web fallback: Direct USB requires Android or iPadOS native environment.');
      return { cameras: [] };
    },
    connectCamera: async () => ({
      success: false,
      status: { isConnected: false, state: 'disconnected', model: 'None' },
    }),
    reconnectCamera: async () => ({
      success: false,
      status: { isConnected: false, state: 'disconnected', model: 'None' },
    }),
    disconnectCamera: async () => ({ success: true }),
    getCameraStatus: async () => ({ isConnected: false, state: 'disconnected', model: 'None' }),
    getUsbDiagnostics: async () => ({
      diagnosticReport: 'Web mock: Direct USB requires Android native device.',
      lastError: '',
      currentState: 'DISCONNECTED',
      lastSuccessfulStage: 'NONE',
      failedStage: 'NONE',
      lastEndpoint: '',
      lastOpCode: '',
      lastReturnCode: 0,
      lastHaltRecoveryStatus: 'NONE',
      buildIdentifier: '20261020-P0-SONY-SHUTTER-FIX-02',
      versionCode: 8,
      versionName: '1.0.0-rc.3',
    }),
    getCameraCapabilities: async () => ({
      supportsLiveView: false,
      supportsCapture: false,
      supportsApertureControl: false,
      supportsShutterSpeedControl: false,
      supportsIsoControl: false,
      supportedIsoValues: [],
      supportedApertures: [],
      supportedShutterSpeeds: [],
    }),
    startLiveView: async () => {
      throw new Error('Direct USB Live View requires Android or iPadOS native device with USB OTG cable.');
    },
    stopLiveView: async () => ({ success: true }),
    capturePhoto: async (_options?: { correlationId?: string }) => {
      throw new Error('Direct USB Capture requires Android or iPadOS native device with USB OTG cable.');
    },
    addListener: async () => ({ remove: async () => {} }),
  }),
});
