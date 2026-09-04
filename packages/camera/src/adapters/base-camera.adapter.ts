import {
  CameraBrand,
  CameraDevice,
  CameraSettings,
  CameraStatus,
  ICameraAdapter,
  UniversalEventEmitter,
} from '@minglebooth/shared';

export abstract class BaseCameraAdapter extends UniversalEventEmitter implements ICameraAdapter {
  abstract readonly brand: CameraBrand;
  protected currentDevice: CameraDevice | null = null;
  protected isPreviewing: boolean = false;
  protected isCapturing: boolean = false;
  protected status: CameraStatus = {
    status: 'disconnected',
    device: null,
    isPreviewing: false,
    isCapturing: false,
    batteryLevel: null,
  };
  protected settings: CameraSettings = {
    resolution: { width: 1920, height: 1080 },
    mirrorPreview: false,
  };

  abstract connect(deviceId?: string): Promise<boolean>;
  abstract disconnect(): Promise<void>;
  abstract getAvailableDevices(): Promise<CameraDevice[]>;
  abstract capture(): Promise<Buffer>;
  abstract startPreview(onFrame?: (frameBuffer: Buffer | string) => void): Promise<void>;
  abstract stopPreview(): Promise<void>;

  public getStatus(): CameraStatus {
    return {
      ...this.status,
      device: this.currentDevice,
      isPreviewing: this.isPreviewing,
      isCapturing: this.isCapturing,
    };
  }

  public async updateSettings(settings: Partial<CameraSettings>): Promise<void> {
    this.settings = { ...this.settings, ...settings };
    this.emit('settingsChange', this.settings);
  }

  protected setStatus(newStatus: Partial<CameraStatus>) {
    this.status = { ...this.status, ...newStatus };
    this.emit('statusChange', this.getStatus());
  }

  protected emitError(message: string, error?: any) {
    this.setStatus({ status: 'error', errorMessage: message });
    this.emit('error', { message, error });
  }
}
