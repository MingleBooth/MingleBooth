import { TemplateConfig } from '@minglebooth/shared';

export interface CapturePhotoInput {
  slotId: string;
  imageBufferOrBase64: string;
  mimeType: 'image/jpeg' | 'image/png';
}

export interface ComposeInput {
  template: TemplateConfig;
  capturedPhotos: CapturePhotoInput[];
  customTexts?: Record<string, string>;
}

// Helper: load an Image element and resolve once it's ready
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Only set crossOrigin for real http(s) URLs — NOT for data URIs or relative paths
    if (src.startsWith('http://') || src.startsWith('https://')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error(`Failed to load image src=${src.substring(0, 80)} err=${err}`));
    img.src = src;
    // If browser already cached it
    if (img.complete && img.naturalWidth > 0) {
      resolve(img);
    }
  });
}

// Helper: draw a photo into a rounded-rect clipping region
function drawPhotoIntoSlot(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number, y: number, w: number, h: number, radius: number
) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.clip();

  // Cover-fill maintaining aspect ratio
  const scaleX = w / img.naturalWidth;
  const scaleY = h / img.naturalHeight;
  const scale = Math.max(scaleX, scaleY);
  const drawW = img.naturalWidth * scale;
  const drawH = img.naturalHeight * scale;
  const offsetX = x + (w - drawW) / 2;
  const offsetY = y + (h - drawH) / 2;
  ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
  ctx.restore();
}

export class PhotoCompositor {
  static async composeRasterDataUrl(
    input: ComposeInput,
    outputMime: 'image/jpeg' | 'image/png' = 'image/jpeg',
    quality = 0.92
  ): Promise<string> {
    const { template, capturedPhotos } = input;
    const { canvas: canvasSize, background, photoSlots, overlay, texts } = template;

    if (typeof document === 'undefined') {
      throw new Error('composeRasterDataUrl requires a browser environment');
    }

    const canvas = document.createElement('canvas');
    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D canvas context');

    // 1. Background
    ctx.fillStyle = background?.color ?? '#FFFFFF';
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

    // 2. Photo slots
    for (const slot of photoSlots) {
      const photoInput = capturedPhotos.find((p) => p.slotId === slot.id);
      if (!photoInput) continue;

      let src = photoInput.imageBufferOrBase64;
      if (!src.startsWith('data:') && !src.startsWith('http') && !src.startsWith('/') && !src.startsWith('blob:')) {
        src = `data:${photoInput.mimeType};base64,${src}`;
      }

      try {
        const img = await loadImage(src);
        // If an overlay is present, let the overlay's own borders/rounded corners mask the photo.
        // Don't clip corners via code to prevent white corner gaps under custom frame borders.
        const effectiveRadius = overlay ? 0 : (slot.borderRadius ?? 0);
        drawPhotoIntoSlot(ctx, img, slot.x, slot.y, slot.width, slot.height, effectiveRadius);
      } catch (err) {
        console.warn(`[Compositor] Could not draw photo for slot ${slot.id}:`, err);
        ctx.fillStyle = '#1E293B';
        ctx.fillRect(slot.x, slot.y, slot.width, slot.height);
      }
    }

    // 3. Text labels (only when no frame overlay)
    if (!overlay && texts && texts.length > 0) {
      for (const txt of texts) {
        ctx.save();
        ctx.font = `${txt.fontWeight ?? 'normal'} ${txt.fontSize ?? 24}px ${txt.fontFamily ?? 'sans-serif'}`;
        ctx.fillStyle = txt.color ?? '#FFFFFF';
        ctx.textAlign = (txt.textAlign as CanvasTextAlign) ?? 'left';
        ctx.fillText(txt.text, txt.x, txt.y);
        ctx.restore();
      }
    }

    // 4. Frame overlay — drawn ON TOP of photos
    //    Supports: PNG, JPEG/JPG uploads (as data URLs), raw base64, or path strings.
    if (overlay) {
      let overlaySrc = '';

      // Helper: is this a complete data URL? (handles image/png, image/jpeg, image/jpg, image/webp, etc.)
      const isDataUrl = (s: string) => s.startsWith('data:image/');

      if (overlay.path && isDataUrl(overlay.path)) {
        // User-uploaded frame stored as data URL in path field
        overlaySrc = overlay.path;
      } else if (overlay.base64 && isDataUrl(overlay.base64)) {
        // User-uploaded frame stored as data URL in base64 field
        overlaySrc = overlay.base64;
      } else if (overlay.base64 && overlay.base64.length > 100) {
        // Raw base64 — detect JPEG via magic bytes (/9j… = JPEG SOI marker)
        const isJpeg = overlay.base64.startsWith('/9j') || overlay.base64.startsWith('AABB');
        overlaySrc = `data:${isJpeg ? 'image/jpeg' : 'image/png'};base64,${overlay.base64}`;
      } else if (overlay.path && overlay.path.length > 4) {
        // Relative or absolute URL/filesystem path
        overlaySrc = overlay.path;
      }

      console.log('[Compositor] Overlay src resolved:', overlaySrc ? overlaySrc.substring(0, 80) : 'EMPTY — no overlay will be drawn');

      if (overlaySrc) {
        try {
          const overlayImg = await loadImage(overlaySrc);
          ctx.save();
          ctx.globalAlpha = overlay.opacity ?? 1;
          ctx.drawImage(overlayImg, 0, 0, canvasSize.width, canvasSize.height);
          ctx.restore();
          console.log('[Compositor] ✅ Frame overlay drawn:', overlayImg.naturalWidth, 'x', overlayImg.naturalHeight);
        } catch (err) {
          console.error('[Compositor] ❌ Failed to draw frame overlay:', err);
        }
      } else {
        console.warn('[Compositor] ⚠️ Overlay object exists but src could not be resolved. overlay keys=', Object.keys(overlay).join(', '));
      }
    }

    // toDataURL can throw SecurityError if any drawn image tainted the canvas (e.g. cross-origin)
    try {
      return canvas.toDataURL(outputMime, quality);
    } catch (secErr) {
      console.error('[Compositor] canvas.toDataURL() failed (canvas may be tainted):', secErr);
      throw secErr;
    }
  }

  static composeSvg(input: ComposeInput): string {
    const { template, capturedPhotos } = input;
    const { canvas: canvasSize, background, photoSlots, overlay, texts } = template;

    const photoParts = photoSlots.map((slot) => {
      const photoInput = capturedPhotos.find((p) => p.slotId === slot.id);
      if (!photoInput) return '';
      let src = photoInput.imageBufferOrBase64;
      if (!src.startsWith('data:') && src.length > 100) {
        src = `data:${photoInput.mimeType};base64,${src}`;
      }
      const r = slot.borderRadius ?? 0;
      return `<clipPath id="clip_${slot.id}"><rect x="${slot.x}" y="${slot.y}" width="${slot.width}" height="${slot.height}" rx="${r}" ry="${r}"/></clipPath>
<image href="${src}" x="${slot.x}" y="${slot.y}" width="${slot.width}" height="${slot.height}" clip-path="url(#clip_${slot.id})" preserveAspectRatio="xMidYMid slice"/>`;
    });

    let overlayPart = '';
    if (overlay?.path) {
      overlayPart = `<image href="${overlay.path}" x="0" y="0" width="${canvasSize.width}" height="${canvasSize.height}" opacity="${overlay.opacity ?? 1}"/>`;
    } else if (overlay?.base64) {
      const b64src = overlay.base64.startsWith('data:') ? overlay.base64 : `data:image/png;base64,${overlay.base64}`;
      overlayPart = `<image href="${b64src}" x="0" y="0" width="${canvasSize.width}" height="${canvasSize.height}" opacity="${overlay.opacity ?? 1}"/>`;
    }

    const textParts = (!overlay && texts)
      ? texts.map((t) => `<text x="${t.x}" y="${t.y}" font-size="${t.fontSize ?? 24}" font-family="${t.fontFamily ?? 'sans-serif'}" fill="${t.color ?? '#fff'}" text-anchor="${t.textAlign === 'center' ? 'middle' : t.textAlign ?? 'start'}" font-weight="${t.fontWeight ?? 'normal'}">${t.text}</text>`)
      : [];

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasSize.width}" height="${canvasSize.height}">
<rect width="${canvasSize.width}" height="${canvasSize.height}" fill="${background?.color ?? '#090A0C'}"/>
${photoParts.join('\n')}
${overlayPart}
${textParts.join('\n')}
</svg>`;
  }
}
