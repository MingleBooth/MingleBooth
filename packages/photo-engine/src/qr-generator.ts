import QRCode from 'qrcode';

export interface QROptions {
  width?: number;
  margin?: number;
  darkColor?: string;
  lightColor?: string;
}

export class QRGenerator {
  /**
   * Generates deterministic guest gallery URL
   */
  public static buildGalleryUrl(baseUrl: string, photoId: string): string {
    const cleanBase = baseUrl.replace(/\/+$/, '');
    return `${cleanBase}/p/${photoId}`;
  }

  /**
   * Generates QR Code as a Data URL (base64 PNG) for instant display on UI/HUD
   */
  public static async generateDataUrl(url: string, options?: QROptions): Promise<string> {
    return QRCode.toDataURL(url, {
      width: options?.width || 320,
      margin: options?.margin || 2,
      color: {
        dark: options?.darkColor || '#000000',
        light: options?.lightColor || '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    });
  }

  /**
   * Generates QR Code as an SVG string for clean vector embedding
   */
  public static async generateSvg(url: string, options?: QROptions): Promise<string> {
    return QRCode.toString(url, {
      type: 'svg',
      width: options?.width || 320,
      margin: options?.margin || 2,
      color: {
        dark: options?.darkColor || '#000000',
        light: options?.lightColor || '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    });
  }
}
