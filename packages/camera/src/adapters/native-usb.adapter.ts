import { CameraBrand, CameraDevice } from '@minglebooth/shared';
import { BaseCameraAdapter } from './base-camera.adapter';

export class NativeUsbCameraAdapter extends BaseCameraAdapter {
  readonly brand: CameraBrand = 'device';

  public async connect(deviceId?: string): Promise<boolean> {
    this.setStatus({ status: 'connecting' });
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.detectNativeCameras) {
        const res = await (window as any).electronAPI.detectNativeCameras();
        if (res.success && res.cameras && res.cameras.length > 0) {
          const cam = res.cameras[0];
          this.currentDevice = {
            id: cam.port || 'usb:native',
            name: cam.model || 'Direct USB Camera',
            brand: 'device',
          };
          this.setStatus({ status: 'connected', device: this.currentDevice });
          // Auto start tether listening
          if ((window as any).electronAPI?.startNativeTether) {
            await (window as any).electronAPI.startNativeTether();
          }
          return true;
        }
      }

      this.currentDevice = {
        id: deviceId || 'usb:native',
        name: 'Direct USB Camera (DSLR/Mirrorless)',
        brand: 'device',
      };
      this.setStatus({ status: 'connected', device: this.currentDevice });
      return true;
    } catch (e: any) {
      this.emitError('Gagal menghubungkan kamera via Direct USB', e);
      return false;
    }
  }

  public async disconnect(): Promise<void> {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.stopNativeTether) {
      await (window as any).electronAPI.stopNativeTether();
    }
    this.currentDevice = null;
    this.setStatus({ status: 'disconnected', device: null });
  }

  public async getAvailableDevices(): Promise<CameraDevice[]> {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.detectNativeCameras) {
      try {
        const res = await (window as any).electronAPI.detectNativeCameras();
        if (res.success && res.cameras && res.cameras.length > 0) {
          return res.cameras.map((c: any, i: number) => ({
            id: c.port || `usb_${i}`,
            name: c.model || 'Direct USB Camera',
            brand: 'device' as CameraBrand,
          }));
        }
      } catch {}
    }
    return [
      {
        id: 'usb:native',
        name: 'Direct USB: Sony / Canon / DSLR (Tanpa Software Lain)',
        brand: 'device',
      },
    ];
  }

  public async capture(): Promise<Buffer> {
    this.isCapturing = true;
    this.setStatus({ isCapturing: true });
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.triggerNativeCapture) {
        await (window as any).electronAPI.triggerNativeCapture();
      }
      return Buffer.from('');
    } finally {
      this.isCapturing = false;
      this.setStatus({ isCapturing: false, lastCapturedAt: Date.now() });
    }
  }

  public async startPreview(onFrame?: (frameBuffer: Buffer | string) => void): Promise<void> {
    this.isPreviewing = true;
    this.setStatus({ isPreviewing: true });
  }

  public async stopPreview(): Promise<void> {
    this.isPreviewing = false;
    this.setStatus({ isPreviewing: false });
  }
}
