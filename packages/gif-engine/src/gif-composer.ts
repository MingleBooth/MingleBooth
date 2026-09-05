// @ts-ignore
import * as gifencPkg from 'gifenc';

// Safely extract encoder utilities across CJS and ESM module wrappers
const GIFEncoder =
  (gifencPkg as any)?.GIFEncoder ||
  (gifencPkg as any)?.default?.GIFEncoder ||
  (typeof (gifencPkg as any)?.default === 'function' ? (gifencPkg as any).default : null) ||
  (gifencPkg as any)?.default;

const quantize =
  (gifencPkg as any)?.quantize ||
  (gifencPkg as any)?.default?.quantize;

const applyPalette =
  (gifencPkg as any)?.applyPalette ||
  (gifencPkg as any)?.default?.applyPalette;

export interface GifCompositionOptions {
  frameDelayMs?: number; // default 320ms
  playbackMode?: 'loop' | 'boomerang';
  repeat?: number; // 0 for infinite loop
  width?: number;
  height?: number;
  frameOverlayBase64?: string | null;
  cutoutSlot?: { x: number; y: number; width: number; height: number } | null;
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
      frameDelayMs = 750,
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

    // 3. Detect or use explicit transparent cutout hole from PNG
    const slot = options.cutoutSlot
      ? {
          x: Math.round((options.cutoutSlot.x * targetWidth) / (options.width || targetWidth)),
          y: Math.round((options.cutoutSlot.y * targetHeight) / (options.height || targetHeight)),
          width: Math.round((options.cutoutSlot.width * targetWidth) / (options.width || targetWidth)),
          height: Math.round((options.cutoutSlot.height * targetHeight) / (options.height || targetHeight)),
        }
      : overlayImg
      ? this.detectCutoutArea(overlayImg, targetWidth, targetHeight)
      : { x: 0, y: 0, width: targetWidth, height: targetHeight };

    // 4. Initialize GIFEncoder
    const gif = GIFEncoder();

    // 5. Render and encode each frame inside cutout aperture
    for (const frameSrc of sequence) {
      ctx.clearRect(0, 0, targetWidth, targetHeight);

      // Fill clean white background (matches real photo paper and prevents dark dirty bleed)
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, targetWidth, targetHeight);

      try {
        const img = await this.loadImage(frameSrc);

        // Aspect Fill / Center Crop the photo precisely inside the cutout hole
        const imgAspect = img.width / img.height;
        const slotAspect = slot.width / slot.height;

        let drawW = slot.width;
        let drawH = slot.height;
        let drawX = slot.x;
        let drawY = slot.y;

        if (imgAspect > slotAspect) {
          drawW = slot.height * imgAspect;
          drawX = slot.x + (slot.width - drawW) / 2;
        } else {
          drawH = slot.width / imgAspect;
          drawY = slot.y + (slot.height - drawH) / 2;
        }

        ctx.save();
        ctx.beginPath();
        ctx.rect(slot.x, slot.y, slot.width, slot.height);
        ctx.clip();
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
        ctx.restore();
      } catch (err) {
        console.warn('[GifComposer] Error loading frame image, drawing placeholder', err);
        ctx.fillStyle = '#181B20';
        ctx.fillRect(slot.x, slot.y, slot.width, slot.height);
      }

      // Draw custom GIF PNG frame overlay on top
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
      // Only set crossOrigin for real http(s) URLs — NOT for data URIs or relative paths
      if (src.startsWith('http://') || src.startsWith('https://')) {
        img.crossOrigin = 'anonymous';
      }
      let settled = false;
      img.onload = () => {
        if (!settled) {
          settled = true;
          resolve(img);
        }
      };
      img.onerror = (e) => {
        if (!settled) {
          settled = true;
          reject(e);
        }
      };
      img.src = src;
      if (img.complete && img.naturalWidth > 0 && !settled) {
        settled = true;
        resolve(img);
      }
    });
  }

  /**
   * Reads PNG frame transparency channel to extract the exact cutout shape & coordinates
   */
  public static detectCutoutArea(
    overlayImg: HTMLImageElement,
    width: number,
    height: number
  ): { x: number; y: number; width: number; height: number } {
    try {
      const offscreen = document.createElement('canvas');
      offscreen.width = 160;
      offscreen.height = Math.round(160 * (height / width));
      const ctx = offscreen.getContext('2d', { willReadFrequently: true });
      if (!ctx) return { x: 0, y: 0, width, height };

      ctx.drawImage(overlayImg, 0, 0, offscreen.width, offscreen.height);
      const imgData = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
      const data = imgData.data;

      const scaleW = offscreen.width;
      const scaleH = offscreen.height;

      // 1. Grid of transparent pixels (alpha < 75)
      const isTrans: boolean[][] = Array.from({ length: scaleH }, () => new Array(scaleW).fill(false));
      let totalTransparent = 0;
      for (let y = 0; y < scaleH; y++) {
        for (let x = 0; x < scaleW; x++) {
          const idx = (y * scaleW + x) * 4;
          if (data[idx + 3] < 75) {
            isTrans[y][x] = true;
            totalTransparent++;
          }
        }
      }

      if (totalTransparent < (scaleW * scaleH) * 0.05) {
        return { x: 0, y: 0, width, height };
      }

      // 2. Find starting seed point near the center of the aperture
      let startX = -1, startY = -1;
      const midX = Math.floor(scaleW / 2);
      const midY = Math.floor(scaleH * 0.45);

      if (isTrans[midY][midX]) {
        startX = midX;
        startY = midY;
      } else {
        // Spiral scan outward from center to find first transparent window pixel
        let found = false;
        for (let r = 1; r < scaleW / 2 && !found; r++) {
          for (let dy = -r; dy <= r && !found; dy++) {
            for (let dx = -r; dx <= r && !found; dx++) {
              const cy = midY + dy;
              const cx = midX + dx;
              if (cy >= 0 && cy < scaleH && cx >= 0 && cx < scaleW) {
                if (isTrans[cy][cx]) {
                  startX = cx;
                  startY = cy;
                  found = true;
                }
              }
            }
          }
        }
      }

      if (startX === -1) {
        return { x: 0, y: 0, width, height };
      }

      // 3. Flood fill connected transparent aperture from center seed
      const visited: boolean[][] = Array.from({ length: scaleH }, () => new Array(scaleW).fill(false));
      const queue: [number, number][] = [[startX, startY]];
      visited[startY][startX] = true;

      let minX = startX, maxX = startX, minY = startY, maxY = startY;
      let count = 0;

      while (queue.length > 0) {
        const [cx, cy] = queue.pop()!;
        count++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const neighbors: [number, number][] = [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ];
        for (const [nx, ny] of neighbors) {
          if (nx >= 0 && nx < scaleW && ny >= 0 && ny < scaleH) {
            if (isTrans[ny][nx] && !visited[ny][nx]) {
              visited[ny][nx] = true;
              queue.push([nx, ny]);
            }
          }
        }
      }

      const scaleX = width / scaleW;
      const scaleY = height / scaleH;
      const bleed = 2; // subtle 2px bleed so no blank seams show, but never bleeding behind frame
      const x = Math.max(0, Math.round(minX * scaleX) - bleed);
      const y = Math.max(0, Math.round(minY * scaleY) - bleed);
      const w = Math.min(width - x, Math.round((maxX - minX + 1) * scaleX) + bleed * 2);
      const h = Math.min(height - y, Math.round((maxY - minY + 1) * scaleY) + bleed * 2);

      return { x, y, width: w, height: h };
    } catch (e) {
      console.warn('[GifComposer] Error detecting cutout area from PNG:', e);
    }
    return { x: 0, y: 0, width, height };
  }
}
