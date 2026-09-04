import { GIFEncoder, quantize, applyPalette } from 'gifenc';

export interface GifCompositionOptions {
  frameDelayMs?: number; // default 320ms
  playbackMode?: 'loop' | 'boomerang';
  repeat?: number; // 0 for infinite loop
  width?: number;
  height?: number;
  frameOverlayBase64?: string | null;
}

export interface GifCompositionResult {
  dataUrl: string;
  byteLength: number;
  framesCount: number;
  durationMs: number;
  width: number;
  height: number;
}

/**
 * High-Performance Animated GIF Encoder & Auto-Aspect Compositor
 */
export class GifComposer {
  /**
   * Generates frame sequence order based on playback mode (Loop or Boomerang)
   */
  public static buildFrameSequence<T>(frames: T[], mode: 'loop' | 'boomerang' = 'boomerang'): T[] {
    if (!frames || frames.length <= 1) return [...(frames || [])];

    if (mode === 'loop') {
      return [...frames];
    }

    // Boomerang: 1, 2, 3, 4, 3, 2
    const reversedMiddle = frames.slice(1, -1).reverse();
    return [...frames, ...reversedMiddle];
  }

  /**
   * Composes an animated GIF from frame data URLs, automatically matching the exact
   * aspect ratio of the uploaded GIF frame (Landscape, Portrait, or Square).
   */
  public static async composeGif(
    frames: string[],
    options: GifCompositionOptions = {}
  ): Promise<GifCompositionResult> {
    if (!frames || frames.length === 0) {
      throw new Error('No frames provided for GIF composition');
    }

    const {
      frameDelayMs = 320,
      playbackMode = 'boomerang',
      frameOverlayBase64 = null,
    } = options;

    const sequence = this.buildFrameSequence(frames, playbackMode);

    if (typeof document === 'undefined') {
      return {
        dataUrl: frames[0] || '',
        byteLength: 0,
        framesCount: sequence.length,
        durationMs: sequence.length * frameDelayMs,
        width: 720,
        height: 900,
      };
    }

    // 1. Load overlay frame if provided to determine natural aspect ratio
    let overlayImg: HTMLImageElement | null = null;
    let targetWidth = options.width || 720;
    let targetHeight = options.height || 900;

    if (frameOverlayBase64) {
      try {
        overlayImg = await this.loadImage(frameOverlayBase64);
        const naturalW = overlayImg.naturalWidth || overlayImg.width;
        const naturalH = overlayImg.naturalHeight || overlayImg.height;

        if (naturalW > 0 && naturalH > 0) {
          // Scale to optimized dimensions (max dimension 960px for fast encoding & sharp HD preview)
          const maxDim = 960;
          if (naturalW >= naturalH) {
            targetWidth = Math.min(naturalW, maxDim);
            targetHeight = Math.round((targetWidth * naturalH) / naturalW);
          } else {
            targetHeight = Math.min(naturalH, maxDim);
            targetWidth = Math.round((targetHeight * naturalW) / naturalH);
          }
          // Ensure even dimensions
          targetWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth + 1;
          targetHeight = targetHeight % 2 === 0 ? targetHeight : targetHeight + 1;
        }
      } catch (e) {
        console.warn('[GifComposer] Could not load overlay image:', e);
      }
    }

    // 2. Setup canvas
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (!ctx) {
      throw new Error('Canvas 2D context not available');
    }

    // 3. Initialize GIFEncoder
    const gif = GIFEncoder();

    // 4. Render and encode each frame
    for (const frameSrc of sequence) {
      ctx.clearRect(0, 0, targetWidth, targetHeight);

      try {
        const img = await this.loadImage(frameSrc);

        // Aspect Fill / Center Crop the photo inside the canvas
        const imgAspect = img.width / img.height;
        const canvasAspect = targetWidth / targetHeight;

        let drawW = targetWidth;
        let drawH = targetHeight;
        let drawX = 0;
        let drawY = 0;

        if (imgAspect > canvasAspect) {
          drawW = targetHeight * imgAspect;
          drawX = (targetWidth - drawW) / 2;
        } else {
          drawH = targetWidth / imgAspect;
          drawY = (targetHeight - drawH) / 2;
        }

        ctx.drawImage(img, drawX, drawY, drawW, drawH);
      } catch (err) {
        console.warn('[GifComposer] Error loading frame image, drawing placeholder', err);
        ctx.fillStyle = '#181B20';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
      }

      // Draw custom GIF frame overlay on top
      if (overlayImg) {
        ctx.drawImage(overlayImg, 0, 0, targetWidth, targetHeight);
      }

      // Get RGBA pixel buffer
      const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
      const rgba = imgData.data;

      // Quantize to 256 colors
      const palette = quantize(rgba, 256);
      const index = applyPalette(rgba, palette);

      // Write frame
      gif.writeFrame(index, targetWidth, targetHeight, {
        palette,
        delay: frameDelayMs,
        repeat: 0, // Infinite loop
      });
    }

    gif.finish();
    const bytes = gif.bytes();

    // Convert Uint8Array to base64 Data URL
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = typeof btoa !== 'undefined' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
    const dataUrl = `data:image/gif;base64,${base64}`;

    return {
      dataUrl,
      byteLength: bytes.byteLength,
      framesCount: sequence.length,
      durationMs: sequence.length * frameDelayMs,
      width: targetWidth,
      height: targetHeight,
    };
  }

  private static loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = src;
    });
  }
}
