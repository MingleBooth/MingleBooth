import { CameraBrand, CameraDevice } from '@minglebooth/shared';
import { BaseCameraAdapter } from './base-camera.adapter';

export class MockCameraAdapter extends BaseCameraAdapter {
  readonly brand: CameraBrand = 'mock';
  private previewInterval: any = null;
  private frameCount: number = 0;

  async getAvailableDevices(): Promise<CameraDevice[]> {
    return [
      {
        id: 'mock_sony_fx3',
        name: 'Sony Cinema Line (FX3)',
        brand: 'mock',
        model: 'ILME-FX3',
        serialNumber: 'SN-FX3-998822',
        batteryLevel: 94,
        isDefault: true,
      },
    ];
  }

  async connect(deviceId?: string): Promise<boolean> {
    this.setStatus({ status: 'connecting' });
    await new Promise((resolve) => setTimeout(resolve, 100));

    const devices = await this.getAvailableDevices();
    this.currentDevice = devices.find((d) => d.id === deviceId) || devices[0];

    this.setStatus({
      status: 'connected',
      device: this.currentDevice,
      batteryLevel: 94,
      errorMessage: undefined,
    });
    return true;
  }

  async disconnect(): Promise<void> {
    await this.stopPreview();
    this.currentDevice = null;
    this.setStatus({
      status: 'disconnected',
      device: null,
      batteryLevel: null,
    });
  }

  async startPreview(onFrame?: (frameBuffer: any) => void): Promise<void> {
    if (this.isPreviewing) return;
    this.isPreviewing = true;
    this.setStatus({ isPreviewing: true });

    this.previewInterval = setInterval(() => {
      this.frameCount++;
      const frameSvg = this.generateMockFrameSvg(this.frameCount);
      const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(frameSvg)}`;
      if (onFrame) {
        onFrame(dataUrl);
      }
      this.emit('frame', dataUrl);
    }, 100);
  }

  async stopPreview(): Promise<void> {
    if (this.previewInterval) {
      clearInterval(this.previewInterval);
      this.previewInterval = null;
    }
    this.isPreviewing = false;
    this.setStatus({ isPreviewing: false });
  }

  async capture(): Promise<any> {
    this.isCapturing = true;
    this.setStatus({ isCapturing: true, status: 'capturing' });

    await new Promise((resolve) => setTimeout(resolve, 80));

    this.frameCount++;
    const captureSvg = this.generateMockFrameSvg(this.frameCount);
    const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(captureSvg)}`;

    this.isCapturing = false;
    this.setStatus({
      isCapturing: false,
      status: 'connected',
      lastCapturedAt: Date.now(),
    });

    return dataUrl;
  }

  private generateMockFrameSvg(counter: number): string {
    const width = 1080;
    const height = 1350;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="neutralStudio" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#1A1C20" />
          <stop offset="100%" stop-color="#111215" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#neutralStudio)" />
      
      <!-- Minimalist Rule-of-Thirds Grid -->
      <line x1="${width / 3}" y1="0" x2="${width / 3}" y2="${height}" stroke="rgba(255,255,255,0.04)" stroke-width="1" />
      <line x1="${(width / 3) * 2}" y1="0" x2="${(width / 3) * 2}" y2="${height}" stroke="rgba(255,255,255,0.04)" stroke-width="1" />
      <line x1="0" y1="${height / 3}" x2="${width}" y2="${height / 3}" stroke="rgba(255,255,255,0.04)" stroke-width="1" />
      <line x1="0" y1="${(height / 3) * 2}" x2="${width}" y2="${(height / 3) * 2}" stroke="rgba(255,255,255,0.04)" stroke-width="1" />
      
      <!-- Minimalist Center Reticle -->
      <circle cx="${width / 2}" cy="${height / 2 - 30}" r="140" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1.5" />
      <circle cx="${width / 2}" cy="${height / 2 - 30}" r="4" fill="#ffffff" />
      <line x1="${width / 2 - 20}" y1="${height / 2 - 30}" x2="${width / 2 + 20}" y2="${height / 2 - 30}" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" />
      <line x1="${width / 2}" y1="${height / 2 - 50}" x2="${width / 2}" y2="${height / 2 - 10}" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" />
      
      <!-- Clean Minimal Text -->
      <text x="${width / 2}" y="${height / 2 + 160}" fill="#9CA3AF" font-size="22" font-family="Inter, system-ui, sans-serif" font-weight="500" text-anchor="middle" letter-spacing="2">READY TO CAPTURE</text>
    </svg>`;
  }
}
