import { create } from 'zustand';
import {
  CameraBrand,
  CameraDevice,
  CameraStatus,
  DEFAULT_PORTRAIT_TEMPLATE,
  DEFAULT_STRIP_TEMPLATE,
  EventConfig,
  PhotoCaptureItem,
  SyncQueueStats,
  TemplateConfig,
} from '@minglebooth/shared';
import { CameraManager } from '@minglebooth/camera';
import { PhotoCompositor, QRGenerator } from '@minglebooth/photo-engine';
import { SyncManager } from '@minglebooth/sync-engine';
import { GifComposer } from '@minglebooth/gif-engine';
import { LocalCaptureRepository, LocalStorageManager } from '@minglebooth/event-core';
import { API_BASE_URL } from '../config';

export type SessionStep = 'idle' | 'countdown' | 'capturing' | 'waiting_next_shot' | 'processing' | 'review';
export type CaptureMode = 'photo' | 'gif';
export type AspectRatioType = string;

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

export function getInitialCustomFormats(): FormatConfig[] {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      const saved = localStorage.getItem('minglebooth_custom_formats');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {}
  }
  return [];
}

export function getInitialActiveFormat(): FormatConfig {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      const savedId = localStorage.getItem('minglebooth_active_format_id');
      if (savedId) {
        const custom = getInitialCustomFormats();
        const all = [...PRESET_FORMATS, ...custom];
        const found = all.find((f) => f.id === savedId || f.ratio === savedId);
        if (found) return found;
      }
    } catch {}
  }
  return PRESET_FORMATS[0]; // Default: 4R Portrait (4×6")
}

export interface FrameOverlayItem {
  id: string;
  name: string;
  base64: string;
  path: string;
  customCutouts?: { x: number; y: number; width: number; height: number }[];
}

export const DEFAULT_WEDDING_FRAME: FrameOverlayItem = {
  id: 'frame_wedding_bayu_irma',
  name: 'Wedding Bayu & Irma Floral',
  base64: '',
  path: '/frames/wedding_bayu_irma.png',
};

interface PhotoboothState {
  currentEvent: EventConfig;
  availableEvents: EventConfig[];

  // Clear separation of Format, Shots, and Frame
  aspectRatio: AspectRatioType;
  activeFormat: FormatConfig;
  customFormats: FormatConfig[];
  shotsCount: number;
  activeFrameOverlay: FrameOverlayItem | null;
  activeGifFrameOverlay: FrameOverlayItem | null;
  selectedTemplate: TemplateConfig;
  isLiveFrameVisible: boolean; // Toggle for live viewfinder frame overlay

  captureMode: CaptureMode;
  countdownSeconds: number;

  cameraManager: CameraManager;
  cameraStatus: CameraStatus;
  availableDevices: CameraDevice[];
  currentBrand: CameraBrand;

  sessionStep: SessionStep;
  countdownRemaining: number;
  capturedPhotos: string[];
  gifFrames: string[];
  currentShotIndex: number;
  lastCompositePhoto: {
    photoId: string;
    svgContent: string;
    dataUrl: string;
    gifDataUrl?: string;
    rawPhotos?: string[];
    isGifAvailable?: boolean;
    qrUrl: string;
    qrDataUrl: string;
    localFilePath?: string;
    fileSizeBytes?: number;
    isGif?: boolean;
    gifFramesSequence?: string[];
  } | null;

  isFlashing: boolean;

  localStorageManager: LocalStorageManager;
  localCaptureRepository: LocalCaptureRepository;
  totalSavedLocallyCount: number;

  syncManager: SyncManager;
  syncStats: SyncQueueStats;
  isOnline: boolean;

  isAdminTestingOpen: boolean;
  isStorageModalOpen: boolean;
  customStorageDir: string;
  isHotFolderActive: boolean;
  hotFolderDir: string;
  isNativeDriverInstalled: boolean;
  nativeDriverVersion: string;
  detectedNativeCameras: Array<{ model: string; port: string }>;
  activeNativeCameraModel: string | null;
  isInstallingDriver: boolean;
  driverInstallLogs: string[];

  initialize: () => Promise<void>;
  setEvent: (event: EventConfig) => void;
  fetchEventsFromCloud: () => Promise<void>;
  fetchTemplatesFromCloud: () => Promise<void>;

  setFormat: (format: FormatConfig) => void;
  addCustomFormat: (format: FormatConfig) => void;
  removeCustomFormat: (formatId: string) => void;
  setAspectRatio: (ratio: AspectRatioType) => void;
  setShotsCount: (shots: number) => void;
  setActiveFrameOverlay: (frame: FrameOverlayItem | null) => void;
  setActiveGifFrameOverlay: (frame: FrameOverlayItem | null) => void;
  toggleLiveFrameVisibility: () => void;

  setCaptureMode: (mode: CaptureMode) => void;
  setCountdownSeconds: (seconds: number) => void;
  switchCameraBrand: (brand: CameraBrand) => Promise<void>;
  startSession: () => Promise<void>;
  captureNextShot: () => Promise<void>;
  cancelSession: () => void;
  retakeSession: () => void;
  confirmSession: () => void;
  toggleAdminTesting: () => void;
  toggleStorageModal: (open?: boolean) => void;
  setCustomStorageDir: (dir: string) => void;
  selectStorageFolder: () => Promise<string | null>;
  openStorageFolder: (subPath?: string) => Promise<void>;
  resetStorageDir: () => void;
  toggleNetworkStatus: () => void;
  triggerMockSync: () => Promise<void>;
  handleExternalPhotoCapture: (photoDataUrl: string, filename?: string) => Promise<void>;
  setHotFolderDir: (dir: string) => Promise<void>;
  checkNativeDriverStatus: () => Promise<void>;
  installNativeDriver: () => Promise<boolean>;
  detectNativeCameras: () => Promise<void>;
  releaseUsbLock: () => Promise<void>;
  triggerNativeDirectCapture: () => Promise<void>;
}

function buildDynamicTemplate(
  format: FormatConfig | AspectRatioType,
  shotsCount: number,
  frame: FrameOverlayItem | null,
  eventName: string
): TemplateConfig {
  let activeFmt: FormatConfig;
  if (typeof format === 'string') {
    const custom = getInitialCustomFormats();
    const all = [...PRESET_FORMATS, ...custom];
    activeFmt = all.find((f) => f.ratio === format || f.id === format) || PRESET_FORMATS[0];
  } else {
    activeFmt = format;
  }

  const width = activeFmt.width;
  const height = activeFmt.height;
  const isStrip = activeFmt.ratio === '2:6' || height / width >= 2.5;
  const isLandscape = width > height;

  // PhotoSlot[] — fit field is required by the shared type
  const photoSlots: import('@minglebooth/shared').PhotoSlot[] = [];

  // Check if frame has auto-detected cutout holes
  if (frame?.customCutouts && frame.customCutouts.length >= shotsCount) {
    for (let i = 0; i < shotsCount; i++) {
      const c = frame.customCutouts[i];
      photoSlots.push({
        id: `slot_${i + 1}`,
        x: c.x,
        y: c.y,
        width: c.width,
        height: c.height,
        fit: 'cover',
        borderRadius: 0, // Frame provides its own vector rounded corners
      });
    }
  } else if (shotsCount === 2) {
    if (isLandscape) {
      const slotW = Math.round(width * 0.46);
      const slotH = Math.round(height * 0.82);
      const slotY = Math.round((height - slotH) / 2);
      photoSlots.push(
        { id: 'slot_1', x: Math.round(width * 0.03), y: slotY, width: slotW, height: slotH, fit: 'cover', borderRadius: frame ? 0 : 16 },
        { id: 'slot_2', x: Math.round(width * 0.51), y: slotY, width: slotW, height: slotH, fit: 'cover', borderRadius: frame ? 0 : 16 }
      );
    } else {
      // 2-Shot Portrait / Strip / 4R / 2R:
      const slotWidth = Math.round(width * 0.94);
      const slotX = Math.round((width - slotWidth) / 2);
      photoSlots.push(
        {
          id: 'slot_1',
          x: slotX,
          y: Math.round(height * 0.035),
          width: slotWidth,
          height: Math.round(height * 0.405),
          fit: 'cover',
          borderRadius: frame ? 0 : 20,
        },
        {
          id: 'slot_2',
          x: slotX,
          y: Math.round(height * 0.415),
          width: slotWidth,
          height: Math.round(height * 0.415),
          fit: 'cover',
          borderRadius: frame ? 0 : 20,
        }
      );
    }
  } else if (shotsCount === 3) {
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
  } else if (shotsCount === 4) {
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
      // 2x2 Grid with bleed under center cross dividers
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
    // 1 Single Shot
    const slotWidth = Math.round(width * 0.94);
    const slotX = Math.round((width - slotWidth) / 2);
    photoSlots.push({
      id: 'slot_1',
      x: slotX,
      y: Math.round(height * 0.035),
      width: slotWidth,
      height: Math.round(height * 0.79),
      fit: 'cover',
      borderRadius: frame ? 0 : 20,
    });
  }

  // Resolve overlay src from a FrameOverlayItem.
  // Handles: data URLs (image/png, image/jpeg, image/jpg), raw base64, and path strings.
  function resolveOverlaySrc(f: FrameOverlayItem): string {
    const b64 = f.base64 || '';
    const p   = f.path  || '';

    // Already a complete data URL (covers both PNG and JPG uploads)
    if (b64.startsWith('data:')) return b64;
    if (p.startsWith('data:'))  return p;

    // Raw base64 string — detect JPEG magic bytes (starts with /9j or AABB) else default to PNG
    if (b64.length > 100) {
      const mime = (b64.startsWith('/9j') || b64.startsWith('AABB')) ? 'image/jpeg' : 'image/png';
      return `data:${mime};base64,${b64}`;
    }

    // Absolute/relative URL or filesystem path
    if (p.length > 4) return p;

    return '';
  }

  const overlaySrc = frame ? resolveOverlaySrc(frame) : '';

  return {
    id: 'dynamic_tpl_' + activeFmt.id + '_' + shotsCount + (frame ? '_' + frame.id : ''),
    name: `${activeFmt.name} • ${shotsCount} Shots`,
    aspectRatio: activeFmt.ratio,
    canvas: { width, height },
    photoSlots,
    // BackgroundLayer requires 'type' field
    background: { type: 'color', color: frame ? '#FFFFFF' : '#090A0C' },
    overlay: (frame && overlaySrc)
      ? { path: overlaySrc, base64: overlaySrc, opacity: 1 }
      : undefined,

    texts: frame
      ? []
      : [
          {
            id: 'txt_event',
            text: eventName,
            x: Math.round(width / 2),
            y: Math.round(height * 0.92),
            fontSize: isStrip ? 20 : 28,
            fontFamily: 'sans-serif',
            color: '#FFFFFF',
            textAlign: 'center',
            fontWeight: 'bold',
          },
          {
            id: 'txt_date',
            text: 'MINGLEBOOTH',
            x: Math.round(width / 2),
            y: Math.round(height * 0.96),
            fontSize: isStrip ? 13 : 16,
            fontFamily: 'monospace',
            color: '#94A3B8',
            textAlign: 'center',
          },
        ],
  };
}

const defaultEvent: EventConfig = {
  id: 'evt_bayu_irma_2026',
  organizationId: 'org_test_vendor',
  name: 'Wedding Bayu & Irma',
  slug: 'bayu-irma-wedding',
  date: '2026-08-29',
  status: 'active',
  outputType: 'both',
  countdownSeconds: 0,
  shotsPerSession: 2,
  templates: [DEFAULT_PORTRAIT_TEMPLATE, DEFAULT_STRIP_TEMPLATE],
  selectedTemplateId: DEFAULT_PORTRAIT_TEMPLATE.id,
  branding: {
    eventName: 'Wedding Bayu & Irma',
    hostNames: 'Bayu & Irma',
    dateFormatted: '29 August 2026',
    primaryColor: '#38bdf8',
    hashtag: '#BayuIrmaForever',
  },
  qrBaseUrl: API_BASE_URL,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function createMockPortraitDataUrl(shotNumber = 1): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1500;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const bgGradient = ctx.createLinearGradient(0, 0, 1200, 1500);
  bgGradient.addColorStop(0, '#1E293B');
  bgGradient.addColorStop(1, '#0F172A');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, 1200, 1500);

  const radial = ctx.createRadialGradient(600, 600, 50, 600, 600, 700);
  radial.addColorStop(0, 'rgba(56, 189, 248, 0.25)');
  radial.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, 1200, 1500);

  ctx.fillStyle = '#334155';
  ctx.beginPath();
  ctx.arc(600, 550, 180, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(600, 1050, 360, 260, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(600, 550, 190, 0, Math.PI * 2);
  ctx.stroke();

  return canvas.toDataURL('image/jpeg', 0.95);
}

// Load saved frame from localStorage
// Returns null if no frame saved (DEFAULT_WEDDING_FRAME file doesn't exist on disk)
function getInitialFrame(): FrameOverlayItem | null {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('minglebooth_active_frame');
      if (saved) {
        const parsed = JSON.parse(saved);
        // base64 / path should already be the full data URL (saved correctly now)
        // Legacy fallback: try sessionStorage if base64 is empty
        if (!parsed.base64 || parsed.base64.length < 10) {
          const sessionBase64 = sessionStorage.getItem('minglebooth_frame_base64_' + parsed.id);
          if (sessionBase64) {
            parsed.base64 = sessionBase64;
            parsed.path = sessionBase64;
          } else {
            // Cannot restore frame data — discard stale entry
            localStorage.removeItem('minglebooth_active_frame');
            return null;
          }
        }
        return parsed;
      }
    } catch {
      // ignore parse errors
    }
  }
  return null;
}

function getInitialGifFrame(): FrameOverlayItem | null {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('minglebooth_active_gif_frame');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {}
  }
  return null;
}

let activeCountdownTimer: any = null;

function playShutterSound() {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // 1. Shutter front-curtain noise burst
    const bufferSize = Math.floor(ctx.sampleRate * 0.045);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.Q.setValueAtTime(3.5, now);

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.7, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.045);

    whiteNoise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);
    whiteNoise.start(now);

    // 2. Shutter rear-curtain slap after 60ms
    setTimeout(() => {
      try {
        const curtainTime = ctx.currentTime;
        const curtainNoise = ctx.createBufferSource();
        curtainNoise.buffer = noiseBuffer;
        const curtainFilter = ctx.createBiquadFilter();
        curtainFilter.type = 'lowpass';
        curtainFilter.frequency.setValueAtTime(900, curtainTime);
        const curtainGain = ctx.createGain();
        curtainGain.gain.setValueAtTime(0.5, curtainTime);
        curtainGain.gain.exponentialRampToValueAtTime(0.01, curtainTime + 0.05);
        curtainNoise.connect(curtainFilter);
        curtainFilter.connect(curtainGain);
        curtainGain.connect(ctx.destination);
        curtainNoise.start(curtainTime);
      } catch {}
    }, 60);
  } catch {}
}

const finishSessionWithPhotos = async (
  updatedPhotos: string[],
  currentEvent: EventConfig,
  get: () => PhotoboothState,
  set: (partial: Partial<PhotoboothState> | ((state: PhotoboothState) => Partial<PhotoboothState>)) => void
) => {
  set({ sessionStep: 'processing', capturedPhotos: updatedPhotos });
  const photoId = 'photo_' + Math.random().toString(36).substring(2, 10);
  const qrUrl = QRGenerator.buildGalleryUrl(currentEvent.qrBaseUrl, photoId);
  const qrDataUrl = await QRGenerator.generateDataUrl(qrUrl);

  let rasterJpegDataUrl = '';
  const activeTpl = get().selectedTemplate;

  try {
    rasterJpegDataUrl = await PhotoCompositor.composeRasterDataUrl(
      {
        template: activeTpl,
        capturedPhotos: updatedPhotos.map((p, i) => ({
          slotId: activeTpl.photoSlots[i]?.id || `slot_${i}`,
          imageBufferOrBase64: p,
          mimeType: 'image/jpeg',
        })),
        customTexts: {
          txt_event: currentEvent.branding.eventName,
          txt_date: currentEvent.branding.dateFormatted || '2026',
        },
      },
      'image/jpeg'
    );
  } catch (err) {
    console.warn('Raster compose error, falling back to SVG:', err);
    const compositeSvg = PhotoCompositor.composeSvg({
      template: activeTpl,
      capturedPhotos: updatedPhotos.map((p, i) => ({
        slotId: activeTpl.photoSlots[i]?.id || `slot_${i}`,
        imageBufferOrBase64: p,
        mimeType: 'image/jpeg',
      })),
      customTexts: {
        txt_event: currentEvent.branding.eventName,
        txt_date: currentEvent.branding.dateFormatted || '2026',
      },
    });
    rasterJpegDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(compositeSvg)}`;
  }

  // Auto-Generate Animated GIF with custom GIF Frame Overlay
  let gifDataUrl = '';
  try {
    const gifOverlay = get().activeGifFrameOverlay || get().activeFrameOverlay;
    const gifResult = await GifComposer.composeGif(updatedPhotos, {
      frameOverlayBase64: gifOverlay?.base64 || null,
      playbackMode: 'boomerang',
      frameDelayMs: 320,
    });
    gifDataUrl = gifResult.dataUrl;
  } catch (gifErr) {
    console.warn('[Auto-GIF] Generation notice:', gifErr);
  }

  const localPaths = get().localStorageManager.formatCaptureRecord({
    eventId: currentEvent.id,
    photoId,
    rawPhotos: updatedPhotos,
    compositeDataUrlOrBuffer: rasterJpegDataUrl,
    mimeType: 'image/jpeg',
  });

  try {
    const persistPayload = JSON.stringify({
      eventId: currentEvent.id,
      photoId,
      compositeDataUrl: rasterJpegDataUrl,
      gifDataUrl,
      rawPhotos: updatedPhotos,
      customStoragePath: get().customStorageDir || undefined,
    });

    fetch('/api/storage/persist-capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: persistPayload,
    }).then((res) => {
      if (!res.ok) {
        fetch('http://localhost:3000/api/storage/persist-capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: persistPayload,
        }).catch(() => {});
      }
    }).catch(() => {
      fetch('http://localhost:3000/api/storage/persist-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: persistPayload,
      }).catch((e) => console.warn('Storage persist error:', e));
    });
  } catch (e) {
    console.warn('Physical disk write notice:', e);
  }

  get().syncManager.enqueue({
    id: 'sync_' + photoId,
    organizationId: currentEvent.organizationId,
    eventId: currentEvent.id,
    entityId: photoId,
    type: 'photo',
    filePath: rasterJpegDataUrl,
    cloudStorageBucket: 'public-gallery',
    cloudStoragePath: `events/${currentEvent.id}/${photoId}.jpg`,
  });

  if (gifDataUrl) {
    get().syncManager.enqueue({
      id: 'sync_gif_' + photoId,
      organizationId: currentEvent.organizationId,
      eventId: currentEvent.id,
      entityId: photoId,
      type: 'gif',
      filePath: gifDataUrl,
      cloudStorageBucket: 'public-gallery',
      cloudStoragePath: `events/${currentEvent.id}/${photoId}.gif`,
    });
  }

  set({
    sessionStep: 'review',
    lastCompositePhoto: {
      photoId,
      svgContent: '',
      dataUrl: rasterJpegDataUrl,
      gifDataUrl,
      rawPhotos: updatedPhotos,
      isGifAvailable: Boolean(gifDataUrl),
      qrUrl,
      qrDataUrl,
      localFilePath: localPaths.processedFilePath.replace('.png', '.jpg'),
      fileSizeBytes: 1024 * 720,
      isGif: false,
    },
  });
};

export const usePhotoboothStore = create<PhotoboothState>((set, get) => {
  const cameraManager = new CameraManager('mock');
  const syncManager = new SyncManager();
  const initialCustomDir = typeof localStorage !== 'undefined' ? (localStorage.getItem('mb_custom_storage_dir') || '') : '';
  const localStorageManager = new LocalStorageManager(initialCustomDir || './data');
  const localCaptureRepository = new LocalCaptureRepository();

  const initialCustomFormats = getInitialCustomFormats();
  const initialActiveFormat = getInitialActiveFormat();
  const initialRatio: AspectRatioType = initialActiveFormat.ratio;
  const initialShots = 2;
  const initialFrame = getInitialFrame();
  const initialGifFrame = getInitialGifFrame();
  const initialTemplate = buildDynamicTemplate(initialActiveFormat, initialShots, initialFrame, defaultEvent.branding.eventName);

  return {
    currentEvent: defaultEvent,
    availableEvents: [defaultEvent],

    aspectRatio: initialRatio,
    activeFormat: initialActiveFormat,
    customFormats: initialCustomFormats,
    shotsCount: initialShots,
    activeFrameOverlay: initialFrame,
    activeGifFrameOverlay: initialGifFrame,
    selectedTemplate: initialTemplate,
    isLiveFrameVisible: false, // Default Clean full screen viewfinder

    captureMode: 'photo',
    countdownSeconds: 0,

    cameraManager,
    cameraStatus: cameraManager.getStatus(),
    availableDevices: [],
    currentBrand: 'mock',

    sessionStep: 'idle',
    countdownRemaining: 0,
    capturedPhotos: [],
    gifFrames: [],
    currentShotIndex: 0,
    lastCompositePhoto: null,
    isFlashing: false,

    localStorageManager,
    localCaptureRepository,
    totalSavedLocallyCount: 0,

    syncManager,
    syncStats: syncManager.getStats(),
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,

    isAdminTestingOpen: false,
    isStorageModalOpen: false,
    customStorageDir: initialCustomDir,
    isHotFolderActive: true,
    hotFolderDir: './data/tether-inbox',
    isNativeDriverInstalled: false,
    nativeDriverVersion: '',
    detectedNativeCameras: [],
    activeNativeCameraModel: null,
    isInstallingDriver: false,
    driverInstallLogs: [],

    initialize: async () => {
      // Sync network status with real browser online/offline events
      if (typeof window !== 'undefined') {
        const handleOnline = () => {
          set({ isOnline: true });
          get().syncManager.resume();
          console.log('[Network] Online — sync resumed.');
        };
        const handleOffline = () => {
          set({ isOnline: false });
          get().syncManager.pause();
          console.log('[Network] Offline — sync paused.');
        };
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Check native camera driver status and scan USB cameras
        get().checkNativeDriverStatus();

        if ((window as any).electronAPI?.onDriverInstallLog) {
          (window as any).electronAPI.onDriverInstallLog((logMsg: string) => {
            set((state) => ({ driverInstallLogs: [...state.driverInstallLogs, logMsg] }));
          });
        }

        // Listen for camera shutter hot folder events via Electron IPC
        if ((window as any).electronAPI?.onTetherPhotoCaptured) {
          (window as any).electronAPI.onTetherPhotoCaptured((payload: any) => {
            if (payload?.photoDataUrl) {
              console.log('[Tether] 📸 Shutter detected via IPC from camera:', payload.filename);
              get().handleExternalPhotoCapture(payload.photoDataUrl, payload.filename);
            }
          });

          if ((window as any).electronAPI?.getTetherInfo) {
            (window as any).electronAPI.getTetherInfo().then((info: any) => {
              if (info?.tetherDir) {
                set({ hotFolderDir: info.tetherDir, isHotFolderActive: true });
              }
            }).catch(() => {});
          }
        }

        // Also connect to Server-Sent Events (SSE) stream on port 4848 (for web tablet or fallback)
        try {
          const hubHost = window.location.hostname || 'localhost';
          const evtSource = new EventSource(`http://${hubHost}:4848/api/tether/events`);
          evtSource.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              if (data.type === 'photo' && data.photoDataUrl) {
                console.log('[Tether] 📸 Shutter detected via SSE from camera:', data.filename);
                get().handleExternalPhotoCapture(data.photoDataUrl, data.filename);
              } else if (data.tetherDir) {
                set({ hotFolderDir: data.tetherDir, isHotFolderActive: true });
              }
            } catch (e) {}
          };
          evtSource.onerror = () => {};
        } catch (e) {}
      }

      await cameraManager.connect();
      const devices = await cameraManager.getAvailableDevices();

      syncManager.setUploadHandler(async (item, onProgress) => {
        onProgress(25);
        try {
          const resp = await fetch(`${API_BASE_URL}/api/sync/upload-capture`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              photoId: item.entityId,
              eventId: item.eventId,
              organizationId: item.organizationId,
              fileDataUrl: item.filePath,
              type: item.type,
            }),
          });

          onProgress(85);
          if (resp.ok) {
            const data = await resp.json();
            onProgress(100);
            return { cloudUrl: data.cloudUrl || `${API_BASE_URL}/p/${item.entityId}` };
          }
        } catch (e) {
          console.warn('Real sync worker notice:', e);
        }

        onProgress(100);
        return { cloudUrl: `${API_BASE_URL}/p/${item.entityId}` };
      });

      cameraManager.on('statusChange', (status: CameraStatus) => {
        set({ cameraStatus: status });
      });

      syncManager.on('statsChange', (stats: SyncQueueStats) => {
        set({ syncStats: stats });
      });

      set({
        cameraStatus: cameraManager.getStatus(),
        availableDevices: devices,
      });

      await get().fetchEventsFromCloud();
      await get().fetchTemplatesFromCloud();
    },

    fetchEventsFromCloud: async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/vendor/events`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.events) && data.events.length > 0) {
            const cloudEvents: EventConfig[] = data.events.map((e: any) => ({
              id: e.id,
              organizationId: e.organization_id || 'org_test_vendor',
              name: e.name,
              slug: e.slug,
              date: e.date,
              status: e.status?.toLowerCase() === 'active' ? 'active' : 'ready',
              outputType: 'both',
              countdownSeconds: 0,
              shotsPerSession: 2,
              templates: [DEFAULT_PORTRAIT_TEMPLATE, DEFAULT_STRIP_TEMPLATE],
              selectedTemplateId: DEFAULT_PORTRAIT_TEMPLATE.id,
              branding: {
                eventName: e.name,
                hostNames: e.branding?.hostNames || e.name,
                dateFormatted: e.branding?.dateFormatted || e.date,
                primaryColor: '#38bdf8',
                hashtag: e.branding?.hashtag || `#${e.slug}`,
              },
              qrBaseUrl: API_BASE_URL,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }));

            set({
              availableEvents: cloudEvents,
              currentEvent: cloudEvents[0] || get().currentEvent,
            });
          }
        }
      } catch (err) {
        console.warn('Fetch events from cloud error:', err);
      }
    },

    fetchTemplatesFromCloud: async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/vendor/templates`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.templates) && data.templates.length > 0) {
            const currentOverlay = get().activeFrameOverlay;
            if (!currentOverlay) {
              const first = data.templates[0];
              if (first.overlay_base64) {
                get().setActiveFrameOverlay({
                  id: first.id,
                  name: first.name,
                  base64: first.overlay_base64,
                  path: first.overlay_base64,
                });
                if (first.aspect_ratio) {
                  get().setAspectRatio(first.aspect_ratio);
                }
                if (first.slots) {
                  get().setShotsCount(first.slots);
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn('Fetch templates from cloud error:', err);
      }
    },

    setFormat: (format: FormatConfig) => {
      const { shotsCount, activeFrameOverlay, currentEvent } = get();
      const updatedTemplate = buildDynamicTemplate(format, shotsCount, activeFrameOverlay, currentEvent.branding.eventName);
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('minglebooth_active_format_id', format.id);
        } catch {}
      }
      set({
        activeFormat: format,
        aspectRatio: format.ratio,
        selectedTemplate: updatedTemplate,
      });
    },

    addCustomFormat: (format: FormatConfig) => {
      const current = get().customFormats;
      const updated = [format, ...current.filter((f) => f.id !== format.id)];
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('minglebooth_custom_formats', JSON.stringify(updated));
        } catch {}
      }
      set({ customFormats: updated });
      get().setFormat(format);
    },

    removeCustomFormat: (formatId: string) => {
      const current = get().customFormats;
      const updated = current.filter((f) => f.id !== formatId);
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('minglebooth_custom_formats', JSON.stringify(updated));
        } catch {}
      }
      const isCurrentlyActive = get().activeFormat.id === formatId;
      set({ customFormats: updated });
      if (isCurrentlyActive) {
        get().setFormat(PRESET_FORMATS[0]);
      }
    },

    setAspectRatio: (ratio: AspectRatioType) => {
      const all = [...PRESET_FORMATS, ...get().customFormats];
      const match = all.find((f) => f.ratio === ratio || f.id === ratio) || all[0];
      get().setFormat(match);
    },

    setShotsCount: (shots: number) => {
      const { activeFormat, activeFrameOverlay, currentEvent } = get();
      const updatedTemplate = buildDynamicTemplate(activeFormat, shots, activeFrameOverlay, currentEvent.branding.eventName);
      set({
        shotsCount: shots,
        selectedTemplate: updatedTemplate,
      });
    },

    setActiveFrameOverlay: (frame: FrameOverlayItem | null) => {
      const { activeFormat, shotsCount, currentEvent } = get();
      const updatedTemplate = buildDynamicTemplate(activeFormat, shotsCount, frame, currentEvent.branding.eventName);

      if (typeof window !== 'undefined') {
        try {
          if (frame) {
            // Try to save the full frame (including base64 data URL) to localStorage.
            // localStorage typically supports 5–10MB; a typical PNG frame is < 2MB.
            // If quota is exceeded, fall back to sessionStorage for the base64 only.
            const fullFrame: FrameOverlayItem = { ...frame };
            try {
              localStorage.setItem('minglebooth_active_frame', JSON.stringify(fullFrame));
              console.log('[Frame] ✅ Saved full frame to localStorage:', frame.name, 'base64 length:', frame.base64.length);
            } catch (quotaErr) {
              console.warn('[Frame] localStorage quota exceeded, saving without base64. Fallback to sessionStorage.', quotaErr);
              // Fallback: save metadata without base64 to localStorage
              const lightweightFrame: FrameOverlayItem = { ...frame, base64: '', path: '' };
              try {
                localStorage.setItem('minglebooth_active_frame', JSON.stringify(lightweightFrame));
              } catch (e2) {
                console.warn('[Frame] Even lightweight localStorage save failed:', e2);
              }
              // Save base64 to sessionStorage as backup
              try {
                sessionStorage.setItem('minglebooth_frame_base64_' + frame.id, frame.base64);
              } catch (e3) {
                console.warn('[Frame] sessionStorage also failed — frame will not persist on reload:', e3);
              }
            }
          } else {
            localStorage.removeItem('minglebooth_active_frame');
            console.log('[Frame] Frame cleared.');
          }
        } catch {
          // ignore
        }
      }

      set({
        activeFrameOverlay: frame,
        selectedTemplate: updatedTemplate,
      });
    },

    setActiveGifFrameOverlay: (frame: FrameOverlayItem | null) => {
      if (typeof window !== 'undefined') {
        try {
          if (frame) {
            localStorage.setItem('minglebooth_active_gif_frame', JSON.stringify(frame));
          } else {
            localStorage.removeItem('minglebooth_active_gif_frame');
          }
        } catch {}
      }
      set({ activeGifFrameOverlay: frame });
    },

    toggleLiveFrameVisibility: () => {
      set((state) => ({ isLiveFrameVisible: !state.isLiveFrameVisible }));
    },

    setEvent: (event: EventConfig) => {
      const { aspectRatio, shotsCount, activeFrameOverlay } = get();
      const updatedTemplate = buildDynamicTemplate(aspectRatio, shotsCount, activeFrameOverlay, event.branding.eventName);
      set({
        currentEvent: event,
        selectedTemplate: updatedTemplate,
      });
    },

    setCaptureMode: (mode: CaptureMode) => {
      set({ captureMode: mode });
    },

    setCountdownSeconds: (seconds: number) => {
      set({ countdownSeconds: seconds });
    },

    switchCameraBrand: async (brand: CameraBrand) => {
      await cameraManager.switchAdapter(brand);
      await cameraManager.connect();
      const devices = await cameraManager.getAvailableDevices();
      set({
        currentBrand: brand,
        cameraStatus: cameraManager.getStatus(),
        availableDevices: devices,
      });

      if (brand === 'device' && typeof window !== 'undefined' && (window as any).electronAPI?.startNativeTether) {
        await (window as any).electronAPI.startNativeTether();
      }
    },

    startSession: async () => {
      const { countdownSeconds, captureMode, currentEvent, shotsCount } = get();

      // GIF Mode
      if (captureMode === 'gif') {
        set({
          sessionStep: countdownSeconds > 0 ? 'countdown' : 'capturing',
          capturedPhotos: [],
          gifFrames: [],
          countdownRemaining: countdownSeconds,
          lastCompositePhoto: null,
        });

        const executeGifBurst = async () => {
          set({ sessionStep: 'capturing' });
          const frames: string[] = [];

          for (let i = 0; i < 4; i++) {
            set({ isFlashing: true });
            setTimeout(() => set({ isFlashing: false }), 80);

            let frameUrl = '';
            if (get().currentBrand === 'webcam' && typeof (window as any).__grabWebcamFrame === 'function') {
              const liveFrame = (window as any).__grabWebcamFrame();
              if (liveFrame) frameUrl = liveFrame;
            }

            if (!frameUrl) {
              frameUrl = createMockPortraitDataUrl(i + 1);
            }

            frames.push(frameUrl);
            await new Promise((r) => setTimeout(r, 180));
          }

          set({ sessionStep: 'processing' });
          const photoId = 'gif_' + Math.random().toString(36).substring(2, 10);
          const qrUrl = QRGenerator.buildGalleryUrl(currentEvent.qrBaseUrl, photoId);
          const qrDataUrl = await QRGenerator.generateDataUrl(qrUrl);

          const boomerangSequence = GifComposer.buildFrameSequence(frames, 'boomerang');
          const previewFrame = frames[0] || createMockPortraitDataUrl(1);

          const localPaths = get().localStorageManager.formatCaptureRecord({
            eventId: currentEvent.id,
            photoId,
            rawPhotos: frames,
            compositeDataUrlOrBuffer: previewFrame,
            mimeType: 'image/gif',
          });

          const persistPayload = JSON.stringify({
            eventId: currentEvent.id,
            photoId,
            compositeDataUrl: previewFrame,
            rawPhotos: frames,
            customStoragePath: get().customStorageDir || undefined,
          });

          fetch('/api/storage/persist-capture', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: persistPayload,
          }).then((res) => {
            if (!res.ok) {
              fetch('http://localhost:3000/api/storage/persist-capture', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: persistPayload,
              }).catch(() => {});
            }
          }).catch(() => {
            fetch('http://localhost:3000/api/storage/persist-capture', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: persistPayload,
            }).catch((e) => console.warn('Storage persist error:', e));
          });

          get().syncManager.enqueue({
            id: 'sync_' + photoId,
            organizationId: currentEvent.organizationId,
            eventId: currentEvent.id,
            entityId: photoId,
            type: 'gif',
            filePath: previewFrame,
            cloudStorageBucket: 'public-gallery',
            cloudStoragePath: `events/${currentEvent.id}/${photoId}.gif`,
          });

          set({
            sessionStep: 'review',
            gifFrames: frames,
            lastCompositePhoto: {
              photoId,
              svgContent: '',
              dataUrl: previewFrame,
              qrUrl,
              qrDataUrl,
              localFilePath: localPaths.processedFilePath.replace('.png', '.gif'),
              fileSizeBytes: 1024 * 850,
              isGif: true,
              gifFramesSequence: boomerangSequence,
            },
          });
        };

        if (countdownSeconds <= 0) {
          executeGifBurst();
        } else {
          let remaining = countdownSeconds;
          set({ countdownRemaining: remaining, sessionStep: 'countdown' });
          const timer = setInterval(() => {
            remaining -= 1;
            if (remaining > 0) {
              set({ countdownRemaining: remaining });
            } else {
              clearInterval(timer);
              executeGifBurst();
            }
          }, 1000);
        }
        return;
      }

      // Standard Still Photo Multi-Shot Flow (1x / 2x / 3x / 4x Take)
      const totalSlots = shotsCount || 2;
      const isTimerOff = countdownSeconds === 0;

      const executeCapture = async (shotIdx: number) => {
        set({ isFlashing: true, sessionStep: 'capturing', currentShotIndex: shotIdx });
        playShutterSound();
        setTimeout(() => set({ isFlashing: false }), 200);

        try {
          // Direct Native USB trigger (Sony / Canon / Nikon / Fuji via USB without 3rd party apps)
          if (get().currentBrand === 'device' && typeof window !== 'undefined' && (window as any).electronAPI?.triggerNativeCapture) {
            console.log('[Capture] Triggering native direct camera shutter via USB...');
            const captureResult = await (window as any).electronAPI.triggerNativeCapture();
            if (captureResult?.success) {
              // Photo will arrive via file watcher in handleExternalPhotoCapture
              return;
            }
            console.warn('[Capture] Native direct capture failed or no camera connected, falling back:', captureResult?.error);
          }

          let photoDataUrl = '';
          if (get().currentBrand === 'webcam' && typeof (window as any).__grabWebcamFrame === 'function') {
            const liveFrame = (window as any).__grabWebcamFrame();
            if (liveFrame) photoDataUrl = liveFrame;
          }

          if (!photoDataUrl) {
            photoDataUrl = createMockPortraitDataUrl(shotIdx + 1);
          }

          const updatedPhotos = [...get().capturedPhotos, photoDataUrl];
          set({ capturedPhotos: updatedPhotos });

          if (updatedPhotos.length < totalSlots) {
            // Wait for manual next shot trigger — show "GANTI POSE" screen
            set({ sessionStep: 'waiting_next_shot' });
          } else {
            await finishSessionWithPhotos(updatedPhotos, currentEvent, get, set);
          }
        } catch (err) {
          console.error('Capture execution error:', err);
          set({ sessionStep: 'idle' });
        }
      };

      const runCountdownForShot = (shotIdx: number, seconds: number) => {
        if (activeCountdownTimer) {
          clearInterval(activeCountdownTimer);
          activeCountdownTimer = null;
        }
        let remaining = seconds;
        set({
          countdownRemaining: remaining,
          sessionStep: 'countdown',
          currentShotIndex: shotIdx,
        });

        activeCountdownTimer = setInterval(() => {
          remaining -= 1;
          if (remaining > 0) {
            set({ countdownRemaining: remaining });
          } else {
            if (activeCountdownTimer) {
              clearInterval(activeCountdownTimer);
              activeCountdownTimer = null;
            }
            executeCapture(shotIdx);
          }
        }, 1000);
      };

      // Expose internal functions so captureNextShot can call them
      (window as any).__minglebooth_captureShot = executeCapture;
      (window as any).__minglebooth_runCountdown = runCountdownForShot;

      if (isTimerOff) {
        // Immediate capture when timer is OFF
        set({
          sessionStep: 'capturing',
          capturedPhotos: [],
          currentShotIndex: 0,
          countdownRemaining: 0,
          lastCompositePhoto: null,
        });
        executeCapture(0);
      } else {
        // Countdown timer when 3s / 5s / 10s is selected
        set({
          sessionStep: 'countdown',
          capturedPhotos: [],
          currentShotIndex: 0,
          countdownRemaining: countdownSeconds,
          lastCompositePhoto: null,
        });
        runCountdownForShot(0, countdownSeconds);
      }
    },

    captureNextShot: async () => {
      const { sessionStep, capturedPhotos, shotsCount, countdownSeconds } = get();
      if (sessionStep !== 'waiting_next_shot') return;
      const nextShotIdx = capturedPhotos.length;
      const isTimerOff = countdownSeconds === 0;
      if (isTimerOff) {
        if (typeof (window as any).__minglebooth_captureShot === 'function') {
          (window as any).__minglebooth_captureShot(nextShotIdx);
        }
      } else {
        if (typeof (window as any).__minglebooth_runCountdown === 'function') {
          (window as any).__minglebooth_runCountdown(nextShotIdx, countdownSeconds);
        }
      }
    },

    handleExternalPhotoCapture: async (photoDataUrl: string, filename?: string) => {
      const { sessionStep, capturedPhotos, shotsCount, selectedTemplate, currentEvent } = get();

      if (sessionStep === 'processing') {
        console.log('[Tether] Ignoring shutter: already processing composite');
        return;
      }

      // Audio shutter click & white flash screen
      playShutterSound();
      set({ isFlashing: true });
      setTimeout(() => set({ isFlashing: false }), 220);

      // Cancel any running countdown timer
      if (activeCountdownTimer) {
        clearInterval(activeCountdownTimer);
        activeCountdownTimer = null;
      }

      const totalSlots = shotsCount || selectedTemplate.photoSlots.length || 2;

      // Start fresh if idle or review, otherwise append
      let basePhotos: string[] = [];
      if (sessionStep === 'idle' || sessionStep === 'review') {
        basePhotos = [];
      } else {
        basePhotos = [...capturedPhotos];
      }

      const updatedPhotos = [...basePhotos, photoDataUrl];
      const nextIdx = updatedPhotos.length;
      console.log(`[Tether] 📸 Shutter accepted: shot ${nextIdx}/${totalSlots} (${filename || 'camera_photo'})`);

      if (updatedPhotos.length < totalSlots) {
        set({
          capturedPhotos: updatedPhotos,
          currentShotIndex: nextIdx,
          countdownRemaining: 0,
          sessionStep: 'waiting_next_shot',
        });
      } else {
        await finishSessionWithPhotos(updatedPhotos, currentEvent, get, set);
      }
    },

    setHotFolderDir: async (dir: string) => {
      set({ hotFolderDir: dir });
      if (typeof window !== 'undefined' && (window as any).electronAPI?.setTetherFolder) {
        await (window as any).electronAPI.setTetherFolder(dir);
      } else {
        fetch('http://localhost:4848/api/tether/set-directory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tetherDir: dir }),
        }).catch(() => {});
      }
    },

    cancelSession: () => {
      if (activeCountdownTimer) {
        clearInterval(activeCountdownTimer);
        activeCountdownTimer = null;
      }
      set({
        sessionStep: 'idle',
        countdownRemaining: 0,
        capturedPhotos: [],
        gifFrames: [],
        currentShotIndex: 0,
        lastCompositePhoto: null,
      });
    },

    retakeSession: () => {
      get().cancelSession();
      get().startSession();
    },

    confirmSession: () => {
      set({
        sessionStep: 'idle',
        capturedPhotos: [],
        gifFrames: [],
        currentShotIndex: 0,
        lastCompositePhoto: null,
      });
    },

    toggleAdminTesting: () => {
      set((state) => ({ isAdminTestingOpen: !state.isAdminTestingOpen }));
    },

    toggleStorageModal: (open?: boolean) => {
      set((state) => ({
        isStorageModalOpen: typeof open === 'boolean' ? open : !state.isStorageModalOpen,
      }));
    },

    setCustomStorageDir: (dir: string) => {
      const trimmed = dir.trim();
      if (typeof localStorage !== 'undefined') {
        if (trimmed) {
          localStorage.setItem('mb_custom_storage_dir', trimmed);
        } else {
          localStorage.removeItem('mb_custom_storage_dir');
        }
      }
      get().localStorageManager.setBaseDataDir(trimmed || './data');
      set({ customStorageDir: trimmed });
    },

    selectStorageFolder: async () => {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.selectFolder) {
        const res = await (window as any).electronAPI.selectFolder(get().customStorageDir || undefined);
        if (!res.canceled && res.selectedPath) {
          get().setCustomStorageDir(res.selectedPath);
          return res.selectedPath;
        }
      } else {
        // Fallback for browser dev mode: call local backend to trigger native OS directory chooser
        try {
          const resp = await fetch('/api/storage/select-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          if (resp.ok) {
            const data = await resp.json();
            if (!data.canceled && data.selectedPath) {
              get().setCustomStorageDir(data.selectedPath);
              return data.selectedPath;
            }
          } else {
            const resp3000 = await fetch('http://localhost:3000/api/storage/select-folder', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            });
            if (resp3000.ok) {
              const data = await resp3000.json();
              if (!data.canceled && data.selectedPath) {
                get().setCustomStorageDir(data.selectedPath);
                return data.selectedPath;
              }
            }
          }
        } catch (e) {
          console.warn('[Storage] Browser select-folder error:', e);
        }
      }
      return null;
    },

    openStorageFolder: async (subPath?: string) => {
      const custom = get().customStorageDir?.trim();
      const eventId = get().currentEvent.id;
      const fullPath = custom
        ? subPath
          ? `${custom}/${subPath}`
          : custom
        : subPath
        ? `./data/events/${eventId}/${subPath}`
        : `./data/events/${eventId}`;

      if (typeof window !== 'undefined' && (window as any).electronAPI?.openFolder) {
        await (window as any).electronAPI.openFolder(fullPath);
      } else {
        // Fallback for web browser dev environment: trigger local dev server to open native OS file manager
        try {
          const payload = JSON.stringify({
            folderPath: custom || './data',
            eventId,
            subPath,
          });
          const res = await fetch('/api/storage/open-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
          });
          if (!res.ok) {
            await fetch('http://localhost:3000/api/storage/open-folder', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: payload,
            });
          }
        } catch (e) {
          console.warn('[Storage] Browser open-folder API notice:', e);
        }
      }
    },

    resetStorageDir: () => {
      get().setCustomStorageDir('');
    },

    toggleNetworkStatus: () => {
      const nextOnline = !get().isOnline;
      set({ isOnline: nextOnline });
      if (nextOnline) {
        get().syncManager.resume();
      } else {
        get().syncManager.pause();
      }
    },

    triggerMockSync: async () => {
      await get().syncManager.processNext();
    },

    checkNativeDriverStatus: async () => {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.getNativeCameraStatus) {
        try {
          const status = await (window as any).electronAPI.getNativeCameraStatus();
          set({
            isNativeDriverInstalled: Boolean(status?.installed),
            nativeDriverVersion: status?.version || '',
          });
          if (status?.installed) {
            get().detectNativeCameras();
          }
        } catch (e) {
          console.warn('Failed to check native camera driver status:', e);
        }
      }
    },

    installNativeDriver: async () => {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.installCameraDriver) {
        set({ isInstallingDriver: true, driverInstallLogs: ['Memulai instalasi driver universal gphoto2...'] });
        try {
          const res = await (window as any).electronAPI.installCameraDriver();
          set({ isInstallingDriver: false });
          if (res?.success) {
            await get().checkNativeDriverStatus();
            return true;
          }
        } catch (err: any) {
          set((state) => ({
            isInstallingDriver: false,
            driverInstallLogs: [...state.driverInstallLogs, `Error: ${err.message}`],
          }));
        }
      }
      return false;
    },

    detectNativeCameras: async () => {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.detectNativeCameras) {
        try {
          const res = await (window as any).electronAPI.detectNativeCameras();
          if (res?.success) {
            const detected = res.cameras || [];
            const activeModel = res.activeModel || (detected[0]?.model ?? null);
            set({
              detectedNativeCameras: detected,
              activeNativeCameraModel: activeModel,
            });
            if (detected.length > 0 && get().currentBrand === 'mock') {
              console.log('[NativeCamera] Auto-switching to detected USB camera:', activeModel);
              get().switchCameraBrand('device');
            }
          }
        } catch (err) {
          console.warn('Failed to detect native USB cameras:', err);
        }
      }
    },

    releaseUsbLock: async () => {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.releaseUsbLock) {
        await (window as any).electronAPI.releaseUsbLock();
      }
    },

    triggerNativeDirectCapture: async () => {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.triggerNativeCapture) {
        await (window as any).electronAPI.triggerNativeCapture();
      }
    },
  };
});
