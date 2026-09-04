import { CameraBrand, CameraDevice } from '@minglebooth/shared';
import { BaseCameraAdapter } from './base-camera.adapter';

export class WebcamAdapter extends BaseCameraAdapter {
  readonly brand: CameraBrand = 'webcam';

  async getAvailableDevices(): Promise<CameraDevice[]> {
    return [
      {
        id: 'default_webcam',
        name: 'Integrated HD Camera / USB UVC',
        brand: 'webcam',
        isDefault: true,
      },
    ];
  }

  async connect(deviceId?: string): Promise<boolean> {
    this.setStatus({ status: 'connecting' });
    const devices = await this.getAvailableDevices();
    this.currentDevice = devices.find((d) => d.id === deviceId) || devices[0];
    this.setStatus({
      status: 'connected',
      device: this.currentDevice,
      batteryLevel: 100,
    });
    return true;
  }

  async disconnect(): Promise<void> {
    await this.stopPreview();
    this.currentDevice = null;
    this.setStatus({ status: 'disconnected', device: null });
  }

  async startPreview(onFrame?: (frameBuffer: Buffer | string) => void): Promise<void> {
    this.isPreviewing = true;
    this.setStatus({ isPreviewing: true });
    // In Electron Renderer, mediaDevices.getUserMedia provides the direct stream.
  }

  async stopPreview(): Promise<void> {
    this.isPreviewing = false;
    this.setStatus({ isPreviewing: false });
  }

  async capture(): Promise<Buffer> {
    this.isCapturing = true;
    this.setStatus({ isCapturing: true, status: 'capturing' });

    // Fallback frame if invoked from node
    const dummySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">
      <rect width="1080" height="1350" fill="#1e293b"/>
      <text x="540" y="675" fill="#f8fafc" font-size="32" text-anchor="middle" font-family="sans-serif">WEBCAM CAPTURE</text>
    </svg>`;

    this.isCapturing = false;
    this.setStatus({ isCapturing: false, status: 'connected' });
    return Buffer.from(dummySvg);
  }
}
