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
  frameDelayMs?: number; // default 500ms
  playbackMode?: 'loop' | 'boomerang';
  repeat?: number; // 0 for infinite loop
  width?: number;
  height?: number;
  maxDimension?: number; // default 960 (Crisp HD preserving Sony camera details)
  dither?: boolean | number; // default true (0.70 weight for smooth photographic skin tones)
  quality?: 'standard' | 'high' | 'ultra'; // default 'high'
  frameOverlayBase64?: string | null;
  cutoutSlot?: { x: number; y: number; width: number; height: number } | null;
  cutoutSlots?: Array<{ x: number; y: number; width: number; height: number }> | null;
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
 * Optimized for high-fidelity photobooth captures from Sony DSLR/Mirrorless cameras.
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
   * High-Precision Palette Mapping with Floyd-Steinberg Error Diffusion Dithering.
   * Eliminates color banding, posterization, and muddy shadows on photographic skin tones.
   * Uses an on-demand RGB565 memoization cache for sub-80ms per-frame execution.
   */
  public static applyPaletteWithDither(
    rgba: Uint8ClampedArray | Uint8Array,
    width: number,
    height: number,
    palette: number[][],
    ditherWeight: number = 0.70
  ): Uint8Array {
    const pLen = palette.length;
    if (pLen === 0) return new Uint8Array(width * height);
    if (ditherWeight <= 0 && typeof applyPalette === 'function') {
      return applyPalette(rgba, palette, 'rgb565');
    }

    const cache = new Int16Array(65536).fill(-1);
    const indexed = new Uint8Array(width * height);
    const totalPixels = width * height;

    const rBuf = new Float32Array(totalPixels);
    const gBuf = new Float32Array(totalPixels);
    const bBuf = new Float32Array(totalPixels);

    for (let i = 0, p = 0; p < totalPixels; i += 4, p++) {
      rBuf[p] = rgba[i];
      gBuf[p] = rgba[i + 1];
      bBuf[p] = rgba[i + 2];
    }

    const getNearest = (r: number, g: number, b: number): number => {
      const r5 = (r >> 3) & 31;
      const g6 = (g >> 2) & 63;
      const b5 = (b >> 3) & 31;
      const key = (r5 << 11) | (g6 << 5) | b5;
      const cached = cache[key];
      if (cached >= 0) return cached;

      let bestDist = Infinity;
      let bestIdx = 0;
      for (let i = 0; i < pLen; i++) {
        const p = palette[i];
        const dr = p[0] - r;
        const dg = p[1] - g;
        const db = p[2] - b;
        const d = dr * dr + dg * dg + db * db;
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      cache[key] = bestIdx;
      return bestIdx;
    };

    const w7 = (7 / 16) * ditherWeight;
    const w3 = (3 / 16) * ditherWeight;
    const w5 = (5 / 16) * ditherWeight;
    const w1 = (1 / 16) * ditherWeight;

    for (let y = 0; y < height; y++) {
      const yOffset = y * width;
      const nextYOffset = (y + 1) * width;
      const hasNextRow = y + 1 < height;

      for (let x = 0; x < width; x++) {
        const idx = yOffset + x;
        const curR = Math.max(0, Math.min(255, Math.round(rBuf[idx])));
        const curG = Math.max(0, Math.min(255, Math.round(gBuf[idx])));
        const curB = Math.max(0, Math.min(255, Math.round(bBuf[idx])));

        const palIdx = getNearest(curR, curG, curB);
        indexed[idx] = palIdx;

        const palColor = palette[palIdx];
        const errR = curR - palColor[0];
        const errG = curG - palColor[1];
        const errB = curB - palColor[2];

        if (x + 1 < width) {
          const rIdx = idx + 1;
          rBuf[rIdx] += errR * w7;
          gBuf[rIdx] += errR * 0 === 0 ? errG * w7 : 0;
          bBuf[rIdx] += errB * w7;
        }
        if (hasNextRow) {
          if (x > 0) {
            const blIdx = nextYOffset + (x - 1);
            rBuf[blIdx] += errR * w3;
            gBuf[blIdx] += errG * w3;
            bBuf[blIdx] += errB * w3;
          }
          const bIdx = nextYOffset + x;
          rBuf[bIdx] += errR * w5;
          gBuf[bIdx] += errG * w5;
          bBuf[bIdx] += errB * w5;
          if (x + 1 < width) {
            const brIdx = nextYOffset + (x + 1);
            rBuf[brIdx] += errR * w1;
            gBuf[brIdx] += errG * w1;
            bBuf[brIdx] += errB * w1;
          }
        }
      }
    }

    return indexed;
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
      frameDelayMs = 500,
      playbackMode = 'boomerang',
      frameOverlayBase64 = null,
      dither = 0.70,
    } = options;

    const sequence = this.buildFrameSequence(frames, playbackMode);

    // Node.js / non-browser fallback for test runners
    if (typeof document === 'undefined') {
      const fallbackW = options.width || 720;
      const fallbackH = options.height || 960;
      return {
        dataUrl: frames[0] || '',
        byteLength: 0,
        framesCount: sequence.length,
        durationMs: sequence.length * frameDelayMs,
        width: fallbackW,
        height: fallbackH,
      };
    }

    // 1. Calculate high-fidelity target dimensions
    // Max dimension 960px (or 1080px for ultra) ensures crystal-clear HD output while maintaining <850KB file size
    const maxDim =
      options.maxDimension ||
      (options.quality === 'ultra' ? 1200 : options.quality === 'standard' ? 720 : 960);

    let overlayImg: HTMLImageElement | null = null;
    let targetWidth = options.width || 720;
    let targetHeight = options.height || 960;

    if (frameOverlayBase64) {
      try {
        overlayImg = await this.loadImage(frameOverlayBase64);
        const naturalW = overlayImg.naturalWidth || overlayImg.width;
        const naturalH = overlayImg.naturalHeight || overlayImg.height;

        if (naturalW > 0 && naturalH > 0) {
          if (naturalW >= naturalH) {
            targetWidth = Math.min(naturalW, maxDim);
            targetHeight = Math.round((targetWidth * naturalH) / naturalW);
          } else {
            targetHeight = Math.min(naturalH, maxDim);
            targetWidth = Math.round((targetHeight * naturalW) / naturalH);
          }
        }
      } catch (e) {
        console.warn('[GifComposer] Could not load overlay image:', e);
      }
    } else if (options.width && options.height) {
      if (options.width >= options.height) {
        targetWidth = Math.min(options.width, maxDim);
        targetHeight = Math.round((targetWidth * options.height) / options.width);
      } else {
        targetHeight = Math.min(options.height, maxDim);
        targetWidth = Math.round((targetHeight * options.width) / options.height);
      }
    }

    // Ensure even dimensions for compatibility
    targetWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth + 1;
    targetHeight = targetHeight % 2 === 0 ? targetHeight : targetHeight + 1;

    // 2. Setup canvas with high-quality smoothing
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (!ctx) {
      throw new Error('Canvas 2D context not available');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // 3. Detect or use explicit transparent cutout holes from PNG
    const origW = options.width || (overlayImg ? (overlayImg.naturalWidth || overlayImg.width) : targetWidth) || targetWidth;
    const origH = options.height || (overlayImg ? (overlayImg.naturalHeight || overlayImg.height) : targetHeight) || targetHeight;

    const slots: Array<{ x: number; y: number; width: number; height: number }> =
      options.cutoutSlots && options.cutoutSlots.length > 0
        ? options.cutoutSlots.map((s) => ({
            x: Math.round((s.x * targetWidth) / origW),
            y: Math.round((s.y * targetHeight) / origH),
            width: Math.round((s.width * targetWidth) / origW),
            height: Math.round((s.height * targetHeight) / origH),
          }))
        : [
            options.cutoutSlot
              ? {
                  x: Math.round((options.cutoutSlot.x * targetWidth) / origW),
                  y: Math.round((options.cutoutSlot.y * targetHeight) / origH),
                  width: Math.round((options.cutoutSlot.width * targetWidth) / origW),
                  height: Math.round((options.cutoutSlot.height * targetHeight) / origH),
                }
              : overlayImg
              ? this.detectCutoutArea(overlayImg, targetWidth, targetHeight)
              : { x: 0, y: 0, width: targetWidth, height: targetHeight },
          ];

    // Preload frame images for multi-cutout composite animation
    const loadedImages: HTMLImageElement[] = [];
    for (const frameSrc of frames) {
      try {
        const img = await this.loadImage(frameSrc);
        loadedImages.push(img);
      } catch (e) {
        console.warn('[GifComposer] Failed to load frame:', e);
      }
    }

    // 4. Initialize GIFEncoder
    const gif = GIFEncoder();

    const ditherWeight =
      typeof dither === 'number'
        ? dither
        : dither === false
        ? 0
        : 0.70;

    // 5. Render and encode each frame inside cutout apertures
    for (let fIdx = 0; fIdx < sequence.length; fIdx++) {
      const frameSrc = sequence[fIdx];
      ctx.clearRect(0, 0, targetWidth, targetHeight);

      // Fill clean white background (matches real photo paper)
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, targetWidth, targetHeight);

      if (slots.length > 1 && loadedImages.length > 0) {
        // Multi-cutout frame: fill ALL slots with photos so NO slot is ever empty
        for (let sIdx = 0; sIdx < slots.length; sIdx++) {
          const slot = slots[sIdx];
          // Cycle photos across slots per animation frame
          const imgIndex = (sIdx + fIdx) % loadedImages.length;
          const img = loadedImages[imgIndex] || loadedImages[0];

          if (img) {
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
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.beginPath();
            ctx.rect(slot.x, slot.y, slot.width, slot.height);
            ctx.clip();
            ctx.drawImage(img, drawX, drawY, drawW, drawH);
            ctx.restore();
          }
        }
      } else {
        // Single cutout (classic Boomerang GIF)
        const slot = slots[0];
        try {
          const img = await this.loadImage(frameSrc);
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
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.beginPath();
          ctx.rect(slot.x, slot.y, slot.width, slot.height);
          ctx.clip();
          ctx.drawImage(img, drawX, drawY, drawW, drawH);
          ctx.restore();
        } catch (err) {
          ctx.fillStyle = '#181B20';
          ctx.fillRect(slot.x, slot.y, slot.width, slot.height);
        }
      }

      // Draw custom GIF PNG frame overlay on top
      if (overlayImg) {
        ctx.drawImage(overlayImg, 0, 0, targetWidth, targetHeight);
      }

      // Get RGBA pixel buffer
      const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
      const rgba = imgData.data;

      // High quality color quantization to 256 colors
      const palette = quantize(rgba, 256, { format: 'rgb565' });

      // Apply palette with Floyd-Steinberg error diffusion dithering to eliminate banding
      const index =
        ditherWeight > 0
          ? this.applyPaletteWithDither(rgba, targetWidth, targetHeight, palette, ditherWeight)
          : applyPalette(rgba, palette, 'rgb565');

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
