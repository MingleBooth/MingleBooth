export interface DetectedCutout {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Automatically inspects a PNG frame overlay's alpha channel
 * and detects transparent cutout windows (photo boxes).
 */
export class FrameHoleDetector {
  public static async detectCutouts(
    imageSrc: string,
    canvasWidth = 1200,
    canvasHeight = 1800,
    bleedPx = 12
  ): Promise<DetectedCutout[] | null> {
    if (typeof document === 'undefined') return null;

    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        if (imageSrc.startsWith('http://') || imageSrc.startsWith('https://')) {
          el.crossOrigin = 'anonymous';
        }
        el.onload = () => resolve(el);
        el.onerror = (e) => reject(e);
        el.src = imageSrc;
        if (el.complete && el.naturalWidth > 0) resolve(el);
      });

      // Downscale to a fast analysis grid (e.g. 200 x 300)
      const scaleW = 200;
      const scaleH = Math.round(scaleW * (canvasHeight / canvasWidth));
      const offscreen = document.createElement('canvas');
      offscreen.width = scaleW;
      offscreen.height = scaleH;
      const ctx = offscreen.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;

      ctx.drawImage(img, 0, 0, scaleW, scaleH);
      const imgData = ctx.getImageData(0, 0, scaleW, scaleH);
      const data = imgData.data;

      // Create a 2D boolean grid of transparent pixels (alpha < 75 out of 255)
      const isTrans: boolean[][] = Array.from({ length: scaleH }, () => new Array(scaleW).fill(false));
      let totalTransparentPixels = 0;

      for (let y = 0; y < scaleH; y++) {
        for (let x = 0; x < scaleW; x++) {
          const idx = (y * scaleW + x) * 4;
          const alpha = data[idx + 3];
          if (alpha < 75) {
            isTrans[y][x] = true;
            totalTransparentPixels++;
          }
        }
      }

      // If virtually no transparency (e.g. solid JPG or opaque PNG), return null
      const totalPixels = scaleW * scaleH;
      if (totalTransparentPixels < totalPixels * 0.05) {
        return null;
      }

      // Connected component analysis / Flood Fill on transparent regions
      const visited: boolean[][] = Array.from({ length: scaleH }, () => new Array(scaleW).fill(false));
      const rawBoxes: { minX: number; maxX: number; minY: number; maxY: number; pixelCount: number }[] = [];

      for (let y = 0; y < scaleH; y++) {
        for (let x = 0; x < scaleW; x++) {
          if (isTrans[y][x] && !visited[y][x]) {
            let minX = x;
            let maxX = x;
            let minY = y;
            let maxY = y;
            let pixelCount = 0;

            const queue: [number, number][] = [[x, y]];
            visited[y][x] = true;

            while (queue.length > 0) {
              const [cx, cy] = queue.pop()!;
              pixelCount++;

              if (cx < minX) minX = cx;
              if (cx > maxX) maxX = cx;
              if (cy < minY) minY = cy;
              if (cy > maxY) maxY = cy;

              // Check 4 neighbors
              const neighbors = [
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

            // Keep boxes that occupy a reasonable area (at least 3% of canvas)
            const boxW = maxX - minX + 1;
            const boxH = maxY - minY + 1;
            if (pixelCount > totalPixels * 0.03 && boxW > scaleW * 0.25 && boxH > scaleH * 0.1) {
              rawBoxes.push({ minX, maxX, minY, maxY, pixelCount });
            }
          }
        }
      }

      if (rawBoxes.length === 0) return null;

      // Sort boxes vertically (top to bottom)
      rawBoxes.sort((a, b) => a.minY - b.minY);

      // Scale coordinates back to original canvas dimensions and apply bleed
      const scaleFactorX = canvasWidth / scaleW;
      const scaleFactorY = canvasHeight / scaleH;

      const cutouts: DetectedCutout[] = rawBoxes.map((box) => {
        let x = Math.round(box.minX * scaleFactorX) - bleedPx;
        let y = Math.round(box.minY * scaleFactorY) - bleedPx;
        let width = Math.round((box.maxX - box.minX + 1) * scaleFactorX) + bleedPx * 2;
        let height = Math.round((box.maxY - box.minY + 1) * scaleFactorY) + bleedPx * 2;

        // Clamp to canvas bounds
        if (x < 0) { width += x; x = 0; }
        if (y < 0) { height += y; y = 0; }
        if (x + width > canvasWidth) width = canvasWidth - x;
        if (y + height > canvasHeight) height = canvasHeight - y;

        return { x, y, width, height };
      });

      console.log(`[FrameHoleDetector] ✅ Auto-detected ${cutouts.length} cutout holes in PNG overlay:`, cutouts);
      return cutouts;
    } catch (err) {
      console.warn('[FrameHoleDetector] Could not auto-detect holes:', err);
      return null;
    }
  }
}
