export type CameraBrand = 'sony' | 'canon' | 'webcam' | 'device' | 'mock';

export type CameraConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'busy'
  | 'capturing';

export interface CameraDevice {
  id: string;
  name: string;
  brand: CameraBrand;
  model?: string;
  serialNumber?: string;
  batteryLevel?: number; // 0 - 100 percentage
  isDefault?: boolean;
}

export interface CameraSettings {
  iso?: number;
  shutterSpeed?: string;
  aperture?: string;
  whiteBalance?: string;
  exposureCompensation?: string;
  resolution?: {
    width: number;
    height: number;
  };
  mirrorPreview?: boolean;
  aspectRatio?: '4:3' | '16:9' | '3:2' | '1:1';
}

export interface CameraStatus {
  status: CameraConnectionStatus;
  device: CameraDevice | null;
  isPreviewing: boolean;
  isCapturing: boolean;
  batteryLevel: number | null;
  errorMessage?: string;
  lastCapturedAt?: number;
}

export interface ICameraAdapter {
  readonly brand: CameraBrand;
  connect(deviceId?: string): Promise<boolean>;
  disconnect(): Promise<void>;
  getStatus(): CameraStatus;
  getAvailableDevices(): Promise<CameraDevice[]>;
  capture(): Promise<Buffer | Blob>;
  startPreview(onFrame?: (frameBuffer: Buffer | string) => void): Promise<void>;
  stopPreview(): Promise<void>;
  updateSettings(settings: Partial<CameraSettings>): Promise<void>;
  on(event: 'statusChange' | 'error' | 'frame', listener: (...args: any[]) => void): void;
  off(event: string, listener: (...args: any[]) => void): void;
}
