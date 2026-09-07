import {
  CameraBrand,
  CameraDevice,
  CameraStatus,
  ICameraAdapter,
  UniversalEventEmitter,
} from '@minglebooth/shared';
import { MockCameraAdapter } from './adapters/mock-camera.adapter';
import { WebcamAdapter } from './adapters/webcam.adapter';
import { NativeUsbCameraAdapter } from './adapters/native-usb.adapter';

export class CameraManager extends UniversalEventEmitter {
  private activeAdapter: ICameraAdapter;
  private adapters: Map<CameraBrand, ICameraAdapter> = new Map();

  constructor(defaultBrand: CameraBrand = 'mock') {
    super();
    // Register available adapters
    this.adapters.set('mock', new MockCameraAdapter());
    this.adapters.set('webcam', new WebcamAdapter());
    this.adapters.set('device', new NativeUsbCameraAdapter());

    this.activeAdapter = this.adapters.get(defaultBrand) || this.adapters.get('mock')!;
    this.bindAdapterEvents(this.activeAdapter);
  }

  public registerAdapter(brand: CameraBrand, adapter: ICameraAdapter) {
    this.adapters.set(brand, adapter);
  }

  public async switchAdapter(brand: CameraBrand): Promise<boolean> {
    const target = this.adapters.get(brand);
    if (!target) {
      throw new Error(`Camera adapter for brand '${brand}' is not registered`);
    }

    if (this.activeAdapter) {
      await this.activeAdapter.disconnect();
    }

    this.activeAdapter = target;
    this.bindAdapterEvents(this.activeAdapter);
    return true;
  }

  public getActiveAdapter(): ICameraAdapter {
    return this.activeAdapter;
  }

  public async connect(deviceId?: string): Promise<boolean> {
    return this.activeAdapter.connect(deviceId);
  }

  public async disconnect(): Promise<void> {
    return this.activeAdapter.disconnect();
  }

  public async getAvailableDevices(): Promise<CameraDevice[]> {
    const allDevices: CameraDevice[] = [];
    for (const [brand, adapter] of this.adapters.entries()) {
      try {
        const devices = await adapter.getAvailableDevices();
        allDevices.push(...devices);
      } catch (err) {
        console.warn(`Failed to query devices for adapter ${brand}:`, err);
      }
    }
    return allDevices;
  }

  public async capture(): Promise<Buffer> {
    return this.activeAdapter.capture() as Promise<Buffer>;
  }

  public async startPreview(onFrame?: (frameBuffer: Buffer | string) => void): Promise<void> {
    return this.activeAdapter.startPreview(onFrame);
  }

  public async stopPreview(): Promise<void> {
    return this.activeAdapter.stopPreview();
  }

  public getStatus(): CameraStatus {
    return this.activeAdapter.getStatus();
  }

  private bindAdapterEvents(adapter: ICameraAdapter) {
    adapter.on('statusChange', (status: CameraStatus) => this.emit('statusChange', status));
    adapter.on('error', (err: any) => this.emit('error', err));
    adapter.on('frame', (frame: any) => this.emit('frame', frame));
  }
}
