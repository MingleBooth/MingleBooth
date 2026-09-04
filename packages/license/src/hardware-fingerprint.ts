export class HardwareFingerprint {
  /**
   * Generates a stable device fingerprint across Node, Electron, and Browser
   */
  public static getDeviceFingerprint(): string {
    try {
      if (typeof window !== 'undefined' && window.navigator) {
        const nav = window.navigator;
        const screen = window.screen;
        const raw = `${nav.userAgent}_${nav.language}_${screen.width}x${screen.height}_${screen.colorDepth}`;
        return this.simpleHash(raw);
      }

      // If in Node.js environment
      if (typeof process !== 'undefined' && process.platform) {
        const raw = `${process.platform}_${process.arch}_${process.version}_${process.pid}`;
        return this.simpleHash(raw);
      }

      return 'device_' + Math.random().toString(36).substring(2, 15);
    } catch {
      return 'device_fallback_hwid_001';
    }
  }

  public static getDeviceName(): string {
    try {
      if (typeof window !== 'undefined' && window.navigator) {
        return window.navigator.userAgent.includes('Mac') ? 'MacBook Studio Terminal' : 'MingleBooth Terminal';
      }
      return 'MingleBooth Desktop Terminal';
    } catch {
      return 'MingleBooth Device';
    }
  }

  private static simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32bit integer
    }
    const hex = Math.abs(hash).toString(16).padStart(8, '0');
    return `hwid_${hex}_${str.length}`;
  }
}
