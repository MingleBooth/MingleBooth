import { TemplateConfig, PhotoSlot } from '@minglebooth/shared';
import { FrameHoleDetector, DetectedCutout } from '@minglebooth/template-engine';

export interface FormatConfig {
  id: string;
  name: string;
  label: string;
  category: 'print' | 'digital' | 'custom';
  width: number;
  height: number;
  ratio: string;
  description?: string;
  isCustom?: boolean;
}

export interface FrameOverlayItem {
  id: string;
  name: string;
  base64: string;
  path?: string;
  slotsCount?: number;
  cutoutCanvasWidth?: number;
  cutoutCanvasHeight?: number;
  customCutouts?: DetectedCutout[];
}

export const PRESET_FORMATS: FormatConfig[] = [
  {
    id: 'format_4r_portrait',
    name: '4R Portrait (4×6")',
    label: '4R (4×6")',
    category: 'print',
    width: 1200,
    height: 1800,
    ratio: '4:6',
    description: 'Standar cetak lab & printer photobooth (DNP / HiTi)',
  },
  {
    id: 'format_4r_landscape',
    name: '4R Landscape (6×4")',
    label: '4R Wide (6×4")',
    category: 'print',
    width: 1800,
    height: 1200,
    ratio: '6:4',
    description: 'Standar cetak landscape 4R',
  },
  {
    id: 'format_2r',
    name: '2R Mini / Wallet (2×3")',
    label: '2R (2×3")',
    category: 'print',
    width: 600,
    height: 900,
    ratio: '2:3',
    description: 'Ukuran foto saku / dompet mini',
  },
  {
    id: 'format_strip',
    name: 'Photo Strip (2×6")',
    label: 'Strip (2×6")',
    category: 'print',
    width: 600,
    height: 1800,
    ratio: '2:6',
    description: 'Strip photobooth ganda klasik',
  },
  {
    id: 'format_portrait_4_5',
    name: 'Portrait Digital (4:5)',
    label: 'Portrait (4:5)',
    category: 'digital',
    width: 1200,
    height: 1500,
    ratio: '4:5',
    description: 'Format optimal untuk feed media sosial',
  },
  {
    id: 'format_square',
    name: 'Square Digital (1:1)',
    label: 'Square (1:1)',
    category: 'digital',
    width: 1200,
    height: 1200,
    ratio: '1:1',
    description: 'Format persegi 1:1',
  },
];

const CUSTOM_FORMATS_STORAGE_KEY = 'minglebooth_mobile_custom_formats';
const ACTIVE_FORMAT_STORAGE_KEY = 'minglebooth_mobile_active_format_id';
const ACTIVE_FRAME_STORAGE_KEY = 'minglebooth_mobile_active_frame_overlay';

// No default hardcoded frame auto-populated; users upload their custom frame or use clean mode
export const DEFAULT_FLORAL_FRAME: FrameOverlayItem | null = null;

export function getStoredCustomFormats(): FormatConfig[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_FORMATS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveStoredCustomFormats(formats: FormatConfig[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CUSTOM_FORMATS_STORAGE_KEY, JSON.stringify(formats));
  } catch {}
}

export function getStoredActiveFormat(): FormatConfig {
  if (typeof window === 'undefined') return PRESET_FORMATS[0];
  try {
    const savedId = localStorage.getItem(ACTIVE_FORMAT_STORAGE_KEY);
    if (savedId) {
      const all = [...PRESET_FORMATS, ...getStoredCustomFormats()];
      const found = all.find((f) => f.id === savedId || f.ratio === savedId);
      if (found) return found;
    }
  } catch {}
  return PRESET_FORMATS[0]; // Default: 4R Portrait (4×6")
}

export function saveStoredActiveFormat(format: FormatConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ACTIVE_FORMAT_STORAGE_KEY, format.id);
  } catch {}
}

export function getStoredActiveFrame(): FrameOverlayItem | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ACTIVE_FRAME_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.base64 || parsed.path)) return parsed;
    }
  } catch {}
  return null;
}

export function saveStoredActiveFrame(frame: FrameOverlayItem | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (frame) {
      localStorage.setItem(ACTIVE_FRAME_STORAGE_KEY, JSON.stringify(frame));
    } else {
      localStorage.removeItem(ACTIVE_FRAME_STORAGE_KEY);
    }
  } catch {}
}

/**
 * Membangun template dinamis berdasarkan format, frame overlay, dan jumlah slot aktif.
 * Jumlah slot dan tata letak strictly mengikuti konfigurasi frame yang dipilih.
 */
export function buildMobileDynamicTemplate(
  format: FormatConfig,
  shotsCount: number,
  frame: FrameOverlayItem | null,
  eventName: string
): TemplateConfig {
  const width = format.width;
  const height = format.height;
  const isStrip = format.ratio === '2:6' || height / width >= 2.5;
  const isLandscape = width > height;

  const photoSlots: PhotoSlot[] = [];

  let effectiveSlots = shotsCount;
  if (frame) {
    if (typeof frame.slotsCount === 'number' && frame.slotsCount > 0) {
      effectiveSlots = frame.slotsCount;
    } else if (frame.customCutouts && frame.customCutouts.length > 0) {
      effectiveSlots = frame.customCutouts.length;
    }
  }

  if (frame?.customCutouts && frame.customCutouts.length >= effectiveSlots) {
    // Frame custom dengan deteksi lubang otomatis
    const srcW = frame.cutoutCanvasWidth || width;
    const srcH = frame.cutoutCanvasHeight || height;
    const scaleX = width / srcW;
    const scaleY = height / srcH;
    for (let i = 0; i < effectiveSlots; i++) {
      const c = frame.customCutouts[i];
      photoSlots.push({
        id: `slot_${i + 1}`,
        x: Math.round(c.x * scaleX),
        y: Math.round(c.y * scaleY),
        width: Math.round(c.width * scaleX),
        height: Math.round(c.height * scaleY),
        fit: 'cover',
        borderRadius: 0,
      });
    }
  } else if (effectiveSlots === 2) {
    // 3. Template 2 slot standar (tanpa lubang custom)
    if (isLandscape) {
      const slotW = Math.round(width * 0.46);
      const slotH = Math.round(height * 0.82);
      const slotY = Math.round((height - slotH) / 2);
      photoSlots.push(
        { id: 'slot_1', x: Math.round(width * 0.03), y: slotY, width: slotW, height: slotH, fit: 'cover', borderRadius: frame ? 0 : 16 },
        { id: 'slot_2', x: Math.round(width * 0.51), y: slotY, width: slotW, height: slotH, fit: 'cover', borderRadius: frame ? 0 : 16 }
      );
    } else {
      // 2-slot portrait mulus tanpa celah putih di antara slot
      const slotWidth = Math.round(width * 0.92);
      const slotX = Math.round((width - slotWidth) / 2);
      const slotHeight = Math.round(height * 0.38);
      photoSlots.push(
        {
          id: 'slot_1',
          x: slotX,
          y: Math.round(height * 0.04),
          width: slotWidth,
          height: slotHeight,
          fit: 'cover',
          borderRadius: frame ? 0 : 20,
        },
        {
          id: 'slot_2',
          x: slotX,
          y: Math.round(height * 0.43),
          width: slotWidth,
          height: slotHeight,
          fit: 'cover',
          borderRadius: frame ? 0 : 20,
        }
      );
    }
  } else if (effectiveSlots === 3) {
    // 4. Template 3 slot
    if (isLandscape) {
      const slotW = Math.round(width * 0.30);
      const slotH = Math.round(height * 0.82);
      const slotY = Math.round((height - slotH) / 2);
      photoSlots.push(
        { id: 'slot_1', x: Math.round(width * 0.03), y: slotY, width: slotW, height: slotH, fit: 'cover', borderRadius: frame ? 0 : 14 },
        { id: 'slot_2', x: Math.round(width * 0.35), y: slotY, width: slotW, height: slotH, fit: 'cover', borderRadius: frame ? 0 : 14 },
        { id: 'slot_3', x: Math.round(width * 0.67), y: slotY, width: slotW, height: slotH, fit: 'cover', borderRadius: frame ? 0 : 14 }
      );
    } else {
      const slotWidth = Math.round(width * 0.94);
      const slotX = Math.round((width - slotWidth) / 2);
      const slotHeight = Math.round(height * 0.275);
      photoSlots.push(
        { id: 'slot_1', x: slotX, y: Math.round(height * 0.035), width: slotWidth, height: slotHeight, fit: 'cover', borderRadius: frame ? 0 : 16 },
        { id: 'slot_2', x: slotX, y: Math.round(height * 0.29), width: slotWidth, height: slotHeight, fit: 'cover', borderRadius: frame ? 0 : 16 },
        { id: 'slot_3', x: slotX, y: Math.round(height * 0.545), width: slotWidth, height: slotHeight, fit: 'cover', borderRadius: frame ? 0 : 16 }
      );
    }
  } else if (effectiveSlots === 4) {
    // 5. Template 4 slot
    if (isStrip) {
      const slotWidth = Math.round(width * 0.92);
      const slotX = Math.round((width - slotWidth) / 2);
      const slotHeight = Math.round(height * 0.205);
      photoSlots.push(
        { id: 'slot_1', x: slotX, y: Math.round(height * 0.035), width: slotWidth, height: slotHeight, fit: 'cover', borderRadius: frame ? 0 : 12 },
        { id: 'slot_2', x: slotX, y: Math.round(height * 0.22), width: slotWidth, height: slotHeight, fit: 'cover', borderRadius: frame ? 0 : 12 },
        { id: 'slot_3', x: slotX, y: Math.round(height * 0.405), width: slotWidth, height: slotHeight, fit: 'cover', borderRadius: frame ? 0 : 12 },
        { id: 'slot_4', x: slotX, y: Math.round(height * 0.59), width: slotWidth, height: slotHeight, fit: 'cover', borderRadius: frame ? 0 : 12 }
      );
    } else {
      const slotW = Math.round(width * 0.47);
      const slotH = Math.round(height * 0.38);
      photoSlots.push(
        { id: 'slot_1', x: Math.round(width * 0.03), y: Math.round(height * 0.045), width: slotW, height: slotH, fit: 'cover', borderRadius: frame ? 0 : 16 },
        { id: 'slot_2', x: Math.round(width * 0.50), y: Math.round(height * 0.045), width: slotW, height: slotH, fit: 'cover', borderRadius: frame ? 0 : 16 },
        { id: 'slot_3', x: Math.round(width * 0.03), y: Math.round(height * 0.415), width: slotW, height: slotH, fit: 'cover', borderRadius: frame ? 0 : 16 },
        { id: 'slot_4', x: Math.round(width * 0.50), y: Math.round(height * 0.415), width: slotW, height: slotH, fit: 'cover', borderRadius: frame ? 0 : 16 }
      );
    }
  } else {
    // 6. 1 Single Shot Slot
    const slotWidth = Math.round(width * (frame ? 0.90 : 0.94));
    const slotX = Math.round((width - slotWidth) / 2);
    const slotHeight = Math.round(height * (frame ? 0.74 : 0.79));
    const slotY = Math.round(height * (frame ? 0.045 : 0.035));
    photoSlots.push({
      id: 'slot_1',
      x: slotX,
      y: slotY,
      width: slotWidth,
      height: slotHeight,
      fit: 'cover',
      borderRadius: frame ? 0 : 20,
    });
  }

  // Tentukan overlay sumber jika frame ada
  let overlayObj: { path: string; base64?: string; opacity?: number } | undefined = undefined;
  if (frame) {
    const rawSrc = frame.base64 || frame.path || '';
    let src = rawSrc;
    if (rawSrc.startsWith('data:') || rawSrc.startsWith('http') || rawSrc.startsWith('/')) {
      src = rawSrc;
    } else if (rawSrc.length > 50) {
      src = `data:image/png;base64,${rawSrc}`;
    }
    if (src) {
      overlayObj = {
        path: src,
        base64: src,
        opacity: 1,
      };
    }
  }

  return {
    id: `tmpl_${format.id}_${shotsCount}shots_${Date.now()}`,
    name: `${format.name} (${shotsCount} Pose)`,
    aspectRatio: format.ratio,
    dpi: 300,
    canvas: {
      width,
      height,
    },
    background: {
      type: 'color',
      color: frame ? '#FFFFFF' : '#090A0C',
    },
    photoSlots,
    overlay: overlayObj,
    texts: [
      {
        id: 'txt_event_title',
        text: eventName || 'MingleBooth Studio',
        x: Math.round(width / 2),
        y: Math.round(height * 0.92),
        fontSize: Math.round(width * 0.045),
        fontFamily: 'Inter',
        fontWeight: 'bold',
        color: '#F8FAFC',
        textAlign: 'center',
      },
      {
        id: 'txt_event_sub',
        text: '#MingleMoments',
        x: Math.round(width / 2),
        y: Math.round(height * 0.955),
        fontSize: Math.round(width * 0.03),
        fontFamily: 'Inter',
        fontWeight: 'normal',
        color: '#94A3B8',
        textAlign: 'center',
      },
    ],
  };
}

/**
 * Validasi dan deteksi lubang otomatis frame PNG menggunakan FrameHoleDetector.
 */
export async function processCustomFramePng(
  file: File,
  format: FormatConfig
): Promise<{ frame: FrameOverlayItem | null; error?: string }> {
  // 1. Validasi format file
  if (!file.type.includes('png') && !file.name.toLowerCase().endsWith('.png')) {
    return { frame: null, error: 'Hanya file PNG transparan yang didukung sebagai frame overlay.' };
  }

  // 2. Baca file ke data URL
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.readAsDataURL(file);
  });

  // 3. Deteksi lubang transparan otomatis
  let detectedCutouts: DetectedCutout[] | null = null;
  try {
    detectedCutouts = await FrameHoleDetector.detectCutouts(
      dataUrl,
      format.width,
      format.height,
      8 // 8px bleed margin
    );
  } catch (err: any) {
    console.warn('[TemplateEngine] Hole detector failed, falling back to dynamic layout:', err);
  }

  const frameId = `frame_custom_${Date.now()}`;
  const frameName = file.name.replace(/\.[^/.]+$/, '');
  const slotsCount = detectedCutouts && detectedCutouts.length > 0 ? detectedCutouts.length : 1;

  const frame: FrameOverlayItem = {
    id: frameId,
    name: frameName,
    base64: dataUrl,
    slotsCount,
    cutoutCanvasWidth: format.width,
    cutoutCanvasHeight: format.height,
    customCutouts: detectedCutouts && detectedCutouts.length > 0 ? detectedCutouts : undefined,
  };

  return { frame };
}
