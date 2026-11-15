import { create } from 'zustand';
import { TemplateConfig, PlanTier } from '@minglebooth/shared';
import { IS_TEST_ISOLATION, assertValidBackendUrl } from '../lib/networkGuard';
import {
  verifyMobileLicenseSession,
  getCachedVendorUser,
  setCachedVendorUser,
  setCachedLicenseToken,
  clearCachedLicenseSession,
  onLicenseUpdate,
  MobileLicenseStatus,
  MB_BACKEND_URL_KEY,
  MB_IS_DEMO_KEY,
} from '../lib/mobileLicense';
import {
  FormatConfig,
  FrameOverlayItem,
  PRESET_FORMATS,
  getStoredActiveFormat,
  saveStoredActiveFormat,
  getStoredCustomFormats,
  saveStoredCustomFormats,
  buildMobileDynamicTemplate,
  getStoredActiveFrame,
  saveStoredActiveFrame,
  DEFAULT_FLORAL_FRAME,
} from '../lib/mobileTemplateEngine';

export interface MobileVendorUser {
  id: string;
  email: string;
  vendorName: string;
  organizationId: string;
  planTier: PlanTier | 'free';
  deviceLimit: number;
  activeDevicesCount: number;
  isDemo: boolean;
  token: string;
}

export interface MobileEvent {
  id: string;
  name: string;
  code: string;
  date: string;
  hashtag?: string;
  templateId?: string;
}

interface MobileBoothState {
  // Auth & Subscription
  user: MobileVendorUser | null;
  isDemoMode: boolean;
  backendUrl: string;
  licenseStatus: MobileLicenseStatus;
  licenseMessage: string | null;
  gracePeriodNotice: string | null;
  initLicense: () => Promise<void>;
  setUser: (user: MobileVendorUser | null) => void;
  setBackendUrl: (url: string) => void;
  logout: () => void;

  // Format, Canvas & Custom PNG Frame (P1.1 & P1.2)
  activeFormat: FormatConfig;
  customFormats: FormatConfig[];
  shotsCount: number;
  activeFrameOverlay: FrameOverlayItem | null;
  isLiveFrameVisible: boolean;
  setFormat: (format: FormatConfig) => void;
  setShotsCount: (count: number) => void;
  setActiveFrameOverlay: (frame: FrameOverlayItem | null) => void;
  toggleLiveFrameVisibility: () => void;
  addCustomFormat: (fmt: FormatConfig) => void;
  removeCustomFormat: (id: string) => void;
  isCustomFormatOpen: boolean;
  setIsCustomFormatOpen: (val: boolean) => void;

  // Event & Template
  currentEvent: MobileEvent;
  currentTemplate: TemplateConfig;
  eventsList: MobileEvent[];
  templatesList: TemplateConfig[];
  setCurrentEvent: (event: MobileEvent) => void;
  setCurrentTemplate: (template: TemplateConfig) => void;
  setEventsList: (list: MobileEvent[]) => void;
  setTemplatesList: (list: TemplateConfig[]) => void;

  // Camera & Capture Session
  cameraFacing: 'user' | 'environment';
  toggleCameraFacing: () => void;
  countdownDuration: number;
  setCountdownDuration: (sec: number) => void;
  isCountingDown: boolean;
  countdownValue: number;
  setIsCountingDown: (val: boolean, currentSec?: number) => void;
  setCountdownValue: (val: number) => void;

  // Capture Data & P1.3 PIP Retake
  currentSlotIndex: number;
  retakeSlotIndex: number | null;
  rawShots: Array<{ index: number; dataUrl: string }>;
  addRawShot: (dataUrl: string) => void;
  removeLastRawShot: () => void;
  resetRawShots: () => void;
  retakeSlot: (slotIndex: number) => void;
  setRetakeSlotIndex: (index: number | null) => void;

  // Processed Composite & GIF
  isProcessing: boolean;
  setIsProcessing: (val: boolean) => void;
  composedPhotoUrl: string | null;
  composedGifUrl: string | null;
  setComposedResult: (photoUrl: string | null, gifUrl: string | null) => void;

  // Modals & UI States
  isReviewOpen: boolean;
  setIsReviewOpen: (val: boolean) => void;
  isEventSelectOpen: boolean;
  setIsEventSelectOpen: (val: boolean) => void;
  isTemplateSelectOpen: boolean;
  setIsTemplateSelectOpen: (val: boolean) => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (val: boolean) => void;
  isGalleryOpen: boolean;
  setIsGalleryOpen: (val: boolean) => void;
  isEventQrModalOpen: boolean;
  setIsEventQrModalOpen: (val: boolean) => void;
  isAuthOpen: boolean;
  setIsAuthOpen: (val: boolean) => void;

  // Burst / Boomerang mode
  isBurstEnabled: boolean;
  setIsBurstEnabled: (val: boolean) => void;

  // Desktop 1:1 Parity: Phase & Setup Rail Navigation
  phase: 'setup' | 'kiosk';
  setPhase: (phase: 'setup' | 'kiosk') => void;
  setupTab: 'event' | 'frame' | 'camera' | 'photo' | 'standby';
  setSetupTab: (tab: 'event' | 'frame' | 'camera' | 'photo' | 'standby') => void;

  // Standby Screensaver & Wallpaper
  enableStandbyWallpaper: boolean;
  standbyTimeoutMinutes: number;
  wallpaperFitMode: 'cover' | 'contain';
  selectedWallpaperId: string;
  customWallpaperUrl: string | null;
  isScreensaverActive: boolean;
  isWallpaperModalOpen: boolean;
  setEnableStandbyWallpaper: (val: boolean) => void;
  setStandbyTimeoutMinutes: (val: number) => void;
  setWallpaperFitMode: (mode: 'cover' | 'contain') => void;
  setSelectedWallpaperId: (id: string) => void;
  setCustomWallpaperUrl: (url: string | null) => void;
  setIsScreensaverActive: (val: boolean) => void;
  setIsWallpaperModalOpen: (val: boolean) => void;

  // Camera Mode (Tablet Live View vs Standalone Sony USB Direct vs PC Remote Desktop Hub)
  cameraMode: 'tablet' | 'usb_direct' | 'pcremote';
  setCameraMode: (mode: 'tablet' | 'usb_direct' | 'pcremote') => void;

  // Standalone Sony USB Direct State (USB-OTG Cable - No PC/Hub)
  usbCameraConnected: boolean;
  setUsbCameraConnected: (connected: boolean) => void;
  usbCameraModel: string;
  setUsbCameraModel: (model: string) => void;
  usbCameraState: string;
  setUsbCameraState: (state: string) => void;
  usbLiveViewUrl: string | null;
  setUsbLiveViewUrl: (url: string | null) => void;
  usbLiveViewError: string | null;
  setUsbLiveViewError: (err: string | null) => void;
  usbBatteryLevel: number | null;
  setUsbBatteryLevel: (level: number | null) => void;
  usbError: string | null;
  setUsbError: (err: string | null) => void;

  // Tether / PC Remote Desktop Hub State
  tetherHostUrl: string;
  setTetherHostUrl: (url: string) => void;
  tetherStatus: 'checking' | 'connected' | 'disconnected';
  setTetherStatus: (status: 'checking' | 'connected' | 'disconnected') => void;
  tetherCameraConnected: boolean;
  setTetherCameraConnected: (connected: boolean) => void;
  tetherCameraState: string;
  setTetherCameraState: (state: string) => void;
  tetherCameraModel: string | null;
  setTetherCameraModel: (model: string | null) => void;
  tetherLiveFrame: string | null;
  setTetherLiveFrame: (frame: string | null) => void;
  tetherError: string | null;
  setTetherError: (err: string | null) => void;

  // Frame Overlay & Preview Inspection
  customGifOverlayUrl: string | null;
  setCustomGifOverlayUrl: (url: string | null) => void;
  showFrameOverlayInPreview: boolean;
  setShowFrameOverlayInPreview: (val: boolean) => void;
}

export interface WallpaperPresetItem {
  id: string;
  name: string;
  subtitle: string;
  path: string;
}

export const DEFAULT_WALLPAPERS: WallpaperPresetItem[] = [
  {
    id: 'flower',
    name: 'Bunga Putih Langit Biru',
    subtitle: 'Minimalis & Estetik',
    path: '/wallpapers/default_flower.jpg',
  },
  {
    id: 'building',
    name: 'Apartemen Malam Hangat',
    subtitle: 'Cozy Architectural Art',
    path: '/wallpapers/default_building.jpg',
  },
  {
    id: 'coastal',
    name: 'Pesisir Pantai Sunset',
    subtitle: 'Golden Hour Ocean View',
    path: '/wallpapers/default_coastal.jpg',
  },
];

const DEFAULT_EVENT: MobileEvent = {
  id: 'evt_demo_mobile',
  name: 'Pengujian Sesi Photobooth',
  code: 'DEMO2026',
  date: '2026-10-15',
  hashtag: '#MingleBooth',
};

const getInitialBackendUrl = (): string => {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(MB_BACKEND_URL_KEY);
      if (stored) {
        if (IS_TEST_ISOLATION) {
          try {
            return assertValidBackendUrl(stored);
          } catch {
            localStorage.removeItem(MB_BACKEND_URL_KEY);
            return '';
          }
        }
        return stored;
      }
    } catch {}
  }
  if (IS_TEST_ISOLATION) {
    return '';
  }
  return 'https://www.minglebooth.id';
};

const initialUser = getCachedVendorUser();
const isStoredDemo = typeof window !== 'undefined' && localStorage.getItem(MB_IS_DEMO_KEY) === 'true';
const initialActiveFormat = getStoredActiveFormat();
const initialCustomFormats = getStoredCustomFormats();
const initialActiveFrame = getStoredActiveFrame();
const initialShotsCount = 2;
const initialDynamicTemplate = buildMobileDynamicTemplate(
  initialActiveFormat,
  initialShotsCount,
  initialActiveFrame,
  DEFAULT_EVENT.name
);

let licenseListenerBound = false;
let autoSyncIntervalId: any = null;
let visibilityListenerBound = false;
let isResumeVerificationInFlight = false;
let lastResumeVerificationTime = 0;
export const RESUME_DEBOUNCE_WINDOW_MS = 2000;

/**
 * Executes foreground resume license verification with debounce and in-flight lock.
 * Prevents duplicate concurrent HTTP requests when window.focus and document.visibilitychange
 * fire almost simultaneously on mobile/Capacitor resume.
 */
export async function executeDebouncedResumeVerification(
  verifyFn: () => Promise<any>
): Promise<boolean> {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
    return false;
  }
  const now = Date.now();
  // 1. Debounce Window Check
  if (now - lastResumeVerificationTime < RESUME_DEBOUNCE_WINDOW_MS) {
    return false;
  }
  // 2. In-flight Lock Check
  if (isResumeVerificationInFlight) {
    return false;
  }

  isResumeVerificationInFlight = true;
  lastResumeVerificationTime = now;
  try {
    await verifyFn();
    return true;
  } catch (err) {
    // Gracefully catch error without leaving lock stuck
    return false;
  } finally {
    isResumeVerificationInFlight = false;
  }
}

/**
 * Resets the in-flight lock and timestamp (strictly for testing).
 */
export function _resetResumeVerificationState(): void {
  isResumeVerificationInFlight = false;
  lastResumeVerificationTime = 0;
}

let exactMobileExpiryTimer: any = null;

function scheduleExactMobileExpiry(tokenStr?: string | null, onExpire?: () => void) {
  if (exactMobileExpiryTimer) {
    clearTimeout(exactMobileExpiryTimer);
    exactMobileExpiryTimer = null;
  }
  if (!tokenStr) return;
  try {
    let jsonStr: string;
    if (typeof Buffer !== 'undefined') {
      jsonStr = Buffer.from(tokenStr, 'base64').toString('utf8');
    } else if (typeof atob === 'function') {
      jsonStr = atob(tokenStr);
    } else {
      return;
    }
    const parsed = JSON.parse(jsonStr);
    const expiresAtStr = parsed?.payload?.expiresAt || parsed?.payload?.validUntil;
    if (expiresAtStr) {
      const expiryMs = new Date(expiresAtStr).getTime();
      if (!isNaN(expiryMs)) {
        const msUntilExpiry = expiryMs - Date.now();
        if (msUntilExpiry > 0 && msUntilExpiry < 2147483647) {
          exactMobileExpiryTimer = setTimeout(() => {
            console.warn('[MobileStore] Exact expiresAt reached! Immediate transition to Demo Mode.');
            onExpire?.();
          }, msUntilExpiry);
        }
      }
    }
  } catch {}
}

export const useMobileBoothStore = create<MobileBoothState>((set, get) => ({
  user: initialUser,
  isDemoMode: Boolean(!initialUser || initialUser.isDemo || initialUser.planTier === 'free' || isStoredDemo),
  backendUrl: getInitialBackendUrl(),
  licenseStatus: 'loading',
  licenseMessage: null,
  gracePeriodNotice: null,

  initLicense: async () => {
    const { backendUrl } = get();

    // 1. Bind reactive updates from background online license verification once
    if (!licenseListenerBound) {
      licenseListenerBound = true;
      onLicenseUpdate((update) => {
        if (update.isDemo) {
          if (exactMobileExpiryTimer) {
            clearTimeout(exactMobileExpiryTimer);
            exactMobileExpiryTimer = null;
          }
        }
        set({
          isDemoMode: update.isDemo,
          licenseStatus: update.status,
          licenseMessage: update.message || (update.isDemo ? 'Mode Demo Aktif' : 'Lisensi Aktif'),
          gracePeriodNotice: update.status === 'expired' ? 'Masa aktif langganan Anda telah berakhir. Aplikasi berjalan dalam Mode Demo.' : null,
        });
      });
    }

    // 2. Start periodic background revalidation (every 30 seconds for immediate expiration & sync)
    if (!autoSyncIntervalId && typeof window !== 'undefined') {
      const SYNC_INTERVAL_MS = 30 * 1000;
      autoSyncIntervalId = setInterval(() => {
        const { backendUrl: activeUrl } = get();
        verifyMobileLicenseSession(activeUrl)
          .then((verification) => {
            if (!verification.isDemo && verification.user?.token) {
              scheduleExactMobileExpiry(verification.user.token, () => {
                get().initLicense();
              });
            }
            set({
              isDemoMode: verification.isDemo,
              licenseStatus: verification.status,
              licenseMessage: verification.message,
              gracePeriodNotice: verification.gracePeriodNotice,
            });
          })
          .catch(() => {});
      }, SYNC_INTERVAL_MS);
    }

    // 3. Bind foreground / visibilitychange resume listener once with deduplication & in-flight lock
    if (!visibilityListenerBound && typeof window !== 'undefined') {
      visibilityListenerBound = true;
      const handleResume = () => {
        executeDebouncedResumeVerification(async () => {
          const { backendUrl: activeUrl } = get();
          const verification = await verifyMobileLicenseSession(activeUrl);
          if (!verification.isDemo && verification.user?.token) {
            scheduleExactMobileExpiry(verification.user.token, () => {
              get().initLicense();
            });
          }
          set({
            isDemoMode: verification.isDemo,
            licenseStatus: verification.status,
            licenseMessage: verification.message,
            gracePeriodNotice: verification.gracePeriodNotice,
          });
        }).catch(() => {});
      };
      window.addEventListener('focus', handleResume);
      window.addEventListener('pageshow', handleResume);
      document.addEventListener('visibilitychange', handleResume);
    }

    try {
      const verification = await verifyMobileLicenseSession(backendUrl);
      if (!verification.isDemo && verification.user?.token) {
        scheduleExactMobileExpiry(verification.user.token, () => {
          get().initLicense();
        });
      }
      set({
        user: verification.user,
        isDemoMode: verification.isDemo,
        licenseStatus: verification.status,
        licenseMessage: verification.message,
        gracePeriodNotice: verification.gracePeriodNotice,
      });
    } catch (err: any) {
      console.warn('[Store] License init error, checking authentication state:', err);
      const cached = getCachedVendorUser();
      if (!cached || !cached.token) {
        set({
          user: null,
          licenseStatus: 'unauthenticated',
          isDemoMode: true,
          licenseMessage: 'Masuk akun vendor diperlukan.',
        });
      } else {
        // Strict Offline: cryptographic evaluation of cached token - network error must NOT turn valid token to demo
        const { LicenseVerifier } = await import('@minglebooth/license');
        const verifier = new LicenseVerifier(true);
        const check = verifier.verifyTokenString(cached.token);
        const isExpired = !check.isValid && (check.isExpired || check.code === 'LICENSE_EXPIRED');
        const previouslyDemo = typeof window !== 'undefined' && localStorage.getItem(MB_IS_DEMO_KEY) === 'true';
        const isDemo = Boolean(isExpired || check.isDemo || previouslyDemo || !check.isValid);
        if (!isDemo && cached.token) {
          scheduleExactMobileExpiry(cached.token, () => {
            get().initLicense();
          });
        }
        set({
          user: cached,
          licenseStatus: isDemo ? (isExpired ? 'expired' : 'demo') : 'valid',
          isDemoMode: isDemo,
          licenseMessage: isDemo ? 'Masa aktif lisensi telah berakhir.' : `Lisensi Aktif (${check.tier.toUpperCase()} Plan)`,
        });
      }
    }
  },

  setUser: (user) => {
    if (user) {
      setCachedVendorUser(user);
      if (user.token) {
        setCachedLicenseToken(user.token);
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem(MB_IS_DEMO_KEY, (user.isDemo || user.planTier === 'free') ? 'true' : 'false');
      }
    } else {
      clearCachedLicenseSession();
    }
    set({
      user,
      isDemoMode: !user || user.isDemo || user.planTier === 'free',
      licenseStatus: !user ? 'unauthenticated' : (user.isDemo || user.planTier === 'free' ? 'demo' : 'valid'),
    });
  },

  setBackendUrl: (backendUrl) => {
    let cleanUrl = backendUrl;
    if (typeof window !== 'undefined') {
      try {
        if (IS_TEST_ISOLATION && backendUrl) {
          cleanUrl = assertValidBackendUrl(backendUrl);
        }
        localStorage.setItem(MB_BACKEND_URL_KEY, cleanUrl);
      } catch (err) {
        console.warn('[Store] Invalid backend URL rejected by network guard:', err);
        return;
      }
    }
    set({ backendUrl: cleanUrl });
  },

  logout: () => {
    if (autoSyncIntervalId) {
      clearInterval(autoSyncIntervalId);
      autoSyncIntervalId = null;
    }
    clearCachedLicenseSession();
    set({
      user: null,
      isDemoMode: true,
      licenseStatus: 'unauthenticated',
      licenseMessage: 'Mode Demo Aktif — Masuk untuk mengaktifkan lisensi.',
      gracePeriodNotice: null,
    });
  },

  // Format & Custom Frame Overlay (P1.1 & P1.2)
  activeFormat: initialActiveFormat,
  customFormats: initialCustomFormats,
  shotsCount: initialShotsCount,
  activeFrameOverlay: initialActiveFrame,
  isLiveFrameVisible: false,
  isCustomFormatOpen: false,

  setFormat: (format) => {
    saveStoredActiveFormat(format);
    const { shotsCount, activeFrameOverlay, currentEvent } = get();
    const frameSlots = activeFrameOverlay?.slotsCount || (activeFrameOverlay?.customCutouts?.length ? activeFrameOverlay.customCutouts.length : undefined);
    const effectiveShots = frameSlots || shotsCount;
    const updated = buildMobileDynamicTemplate(format, effectiveShots, activeFrameOverlay, currentEvent.name);
    set({
      activeFormat: format,
      shotsCount: effectiveShots,
      currentTemplate: updated,
      rawShots: [],
      currentSlotIndex: 0,
      retakeSlotIndex: null,
      composedPhotoUrl: null,
      composedGifUrl: null,
    });
  },

  setShotsCount: (shotsCount) => {
    const { activeFormat, activeFrameOverlay, currentEvent } = get();
    const updated = buildMobileDynamicTemplate(activeFormat, shotsCount, activeFrameOverlay, currentEvent.name);
    set({
      shotsCount,
      currentTemplate: updated,
      rawShots: [],
      currentSlotIndex: 0,
      retakeSlotIndex: null,
      composedPhotoUrl: null,
      composedGifUrl: null,
    });
  },

  setActiveFrameOverlay: (frame) => {
    const isDemo = get().isDemoMode;
    if (!isDemo) {
      saveStoredActiveFrame(frame);
    }
    const { activeFormat, shotsCount, currentEvent } = get();
    const frameSlots = frame?.slotsCount || (frame?.customCutouts?.length ? frame.customCutouts.length : undefined);
    const effectiveShots = frameSlots || shotsCount;
    const updated = buildMobileDynamicTemplate(activeFormat, effectiveShots, frame, currentEvent.name);
    set({
      activeFrameOverlay: frame,
      shotsCount: effectiveShots,
      currentTemplate: updated,
      rawShots: [],
      currentSlotIndex: 0,
      retakeSlotIndex: null,
      composedPhotoUrl: null,
      composedGifUrl: null,
    });
  },

  toggleLiveFrameVisibility: () =>
    set((state) => ({ isLiveFrameVisible: !state.isLiveFrameVisible })),

  addCustomFormat: (fmt) => {
    const { customFormats, shotsCount, activeFrameOverlay, currentEvent } = get();
    const updatedCustoms = [...customFormats.filter((c) => c.id !== fmt.id), fmt];
    saveStoredCustomFormats(updatedCustoms);
    saveStoredActiveFormat(fmt);
    const frameSlots = activeFrameOverlay?.slotsCount || (activeFrameOverlay?.customCutouts?.length ? activeFrameOverlay.customCutouts.length : undefined);
    const effectiveShots = frameSlots || shotsCount;
    const updatedTemplate = buildMobileDynamicTemplate(fmt, effectiveShots, activeFrameOverlay, currentEvent.name);
    set({
      customFormats: updatedCustoms,
      activeFormat: fmt,
      shotsCount: effectiveShots,
      currentTemplate: updatedTemplate,
      isCustomFormatOpen: false,
      rawShots: [],
      currentSlotIndex: 0,
      retakeSlotIndex: null,
    });
  },

  removeCustomFormat: (id) => {
    const { customFormats, activeFormat } = get();
    const updatedCustoms = customFormats.filter((c) => c.id !== id);
    saveStoredCustomFormats(updatedCustoms);
    if (activeFormat.id === id) {
      const fallback = PRESET_FORMATS[0];
      get().setFormat(fallback);
    }
    set({ customFormats: updatedCustoms });
  },

  setIsCustomFormatOpen: (isCustomFormatOpen) => set({ isCustomFormatOpen }),

  // Event & Template
  currentEvent: DEFAULT_EVENT,
  currentTemplate: initialDynamicTemplate,
  eventsList: [DEFAULT_EVENT],
  templatesList: [initialDynamicTemplate],

  setCurrentEvent: (currentEvent) => {
    const { activeFormat, shotsCount, activeFrameOverlay } = get();
    const updated = buildMobileDynamicTemplate(activeFormat, shotsCount, activeFrameOverlay, currentEvent.name);
    set({ currentEvent, currentTemplate: updated });
  },

  setCurrentTemplate: (currentTemplate) => set({ currentTemplate }),
  setEventsList: (eventsList) => set({ eventsList }),
  setTemplatesList: (templatesList) => set({ templatesList }),

  cameraFacing: 'user', // Front camera default
  toggleCameraFacing: () =>
    set((state) => ({
      cameraFacing: state.cameraFacing === 'user' ? 'environment' : 'user',
    })),

  countdownDuration: 3,
  setCountdownDuration: (countdownDuration) => set({ countdownDuration }),
  isCountingDown: false,
  countdownValue: 3,
  setIsCountingDown: (isCountingDown, currentSec = 3) =>
    set({ isCountingDown, countdownValue: currentSec }),
  setCountdownValue: (countdownValue) => set({ countdownValue }),

  // Capture Data & P1.3 Targeted Retake
  currentSlotIndex: 0,
  retakeSlotIndex: null,
  rawShots: [],

  addRawShot: (dataUrl) =>
    set((state) => {
      let updated: Array<{ index: number; dataUrl: string }>;
      if (state.retakeSlotIndex !== null) {
        // Targeted retake: replace the existing pose at target index
        const exists = state.rawShots.some((s) => s.index === state.retakeSlotIndex);
        if (exists) {
          updated = state.rawShots.map((s) =>
            s.index === state.retakeSlotIndex ? { index: state.retakeSlotIndex!, dataUrl } : s
          );
        } else {
          updated = [...state.rawShots, { index: state.retakeSlotIndex!, dataUrl }].sort(
            (a, b) => a.index - b.index
          );
        }
        return {
          rawShots: updated,
          retakeSlotIndex: null,
          currentSlotIndex: updated.length,
        };
      } else {
        const nextIndex = state.rawShots.length;
        updated = [...state.rawShots, { index: nextIndex, dataUrl }];
        return {
          rawShots: updated,
          currentSlotIndex: updated.length,
        };
      }
    }),

  resetRawShots: () =>
    set({
      rawShots: [],
      currentSlotIndex: 0,
      retakeSlotIndex: null,
      composedPhotoUrl: null,
      composedGifUrl: null,
    }),

  removeLastRawShot: () =>
    set((state) => {
      const trimmed = state.rawShots.slice(0, -1);
      return {
        rawShots: trimmed,
        currentSlotIndex: trimmed.length,
        retakeSlotIndex: null,
      };
    }),

  retakeSlot: (slotIndex) =>
    set((state) => ({
      rawShots: state.rawShots.filter((s) => s.index !== slotIndex),
      currentSlotIndex: slotIndex,
      retakeSlotIndex: slotIndex,
      isReviewOpen: false,
    })),

  setRetakeSlotIndex: (retakeSlotIndex) => set({ retakeSlotIndex }),

  isProcessing: false,
  setIsProcessing: (isProcessing) => set({ isProcessing }),
  composedPhotoUrl: null,
  composedGifUrl: null,
  setComposedResult: (composedPhotoUrl, composedGifUrl) =>
    set({ composedPhotoUrl, composedGifUrl }),

  isReviewOpen: false,
  setIsReviewOpen: (isReviewOpen) => set({ isReviewOpen }),
  isEventSelectOpen: false,
  setIsEventSelectOpen: (isEventSelectOpen) => set({ isEventSelectOpen }),
  isTemplateSelectOpen: false,
  setIsTemplateSelectOpen: (isTemplateSelectOpen) => set({ isTemplateSelectOpen }),
  isSettingsOpen: false,
  setIsSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),
  isGalleryOpen: false,
  setIsGalleryOpen: (isGalleryOpen) => set({ isGalleryOpen }),
  isEventQrModalOpen: false,
  setIsEventQrModalOpen: (isEventQrModalOpen) => set({ isEventQrModalOpen }),
  isAuthOpen: false,
  setIsAuthOpen: (isAuthOpen) => set({ isAuthOpen }),

  isBurstEnabled: true,
  setIsBurstEnabled: (isBurstEnabled) => set({ isBurstEnabled }),

  // Desktop 1:1 Parity States & Actions
  phase: 'setup',
  setPhase: (phase) => set({ phase }),
  setupTab: 'frame',
  setSetupTab: (setupTab) => set({ setupTab }),

  enableStandbyWallpaper: true,
  standbyTimeoutMinutes: 0.5,
  wallpaperFitMode: 'cover',
  selectedWallpaperId: 'flower',
  customWallpaperUrl: null,
  isScreensaverActive: false,
  isWallpaperModalOpen: false,
  setEnableStandbyWallpaper: (enableStandbyWallpaper) => set({ enableStandbyWallpaper }),
  setStandbyTimeoutMinutes: (standbyTimeoutMinutes) => set({ standbyTimeoutMinutes }),
  setWallpaperFitMode: (wallpaperFitMode) => set({ wallpaperFitMode }),
  setSelectedWallpaperId: (selectedWallpaperId) => set({ selectedWallpaperId }),
  setCustomWallpaperUrl: (customWallpaperUrl) => set({ customWallpaperUrl }),
  setIsScreensaverActive: (isScreensaverActive) => set({ isScreensaverActive }),
  setIsWallpaperModalOpen: (isWallpaperModalOpen) => set({ isWallpaperModalOpen }),

  cameraMode: 'tablet',
  setCameraMode: (cameraMode) => set({ cameraMode }),

  usbCameraConnected: false,
  setUsbCameraConnected: (usbCameraConnected) => set({ usbCameraConnected }),
  usbCameraModel: 'Camera',
  setUsbCameraModel: (usbCameraModel) => set({ usbCameraModel }),
  usbCameraState: 'DISCONNECTED',
  setUsbCameraState: (usbCameraState) => set({ usbCameraState }),
  usbLiveViewUrl: null,
  setUsbLiveViewUrl: (usbLiveViewUrl) => set({ usbLiveViewUrl }),
  usbLiveViewError: null,
  setUsbLiveViewError: (usbLiveViewError) => set({ usbLiveViewError }),
  usbBatteryLevel: null,
  setUsbBatteryLevel: (usbBatteryLevel) => set({ usbBatteryLevel }),
  usbError: null,
  setUsbError: (usbError) => set({ usbError }),

  tetherHostUrl:
    typeof window !== 'undefined' && window.localStorage
      ? window.localStorage.getItem('mb_tether_host_url') || 'http://192.168.1.102:4848'
      : 'http://192.168.1.102:4848',
  setTetherHostUrl: (tetherHostUrl) => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('mb_tether_host_url', tetherHostUrl);
    }
    set({ tetherHostUrl });
  },
  tetherStatus: 'disconnected',
  setTetherStatus: (tetherStatus) => set({ tetherStatus }),
  tetherCameraConnected: false,
  setTetherCameraConnected: (tetherCameraConnected) => set({ tetherCameraConnected }),
  tetherCameraState: 'DISCONNECTED',
  setTetherCameraState: (tetherCameraState) => set({ tetherCameraState }),
  tetherCameraModel: null,
  setTetherCameraModel: (tetherCameraModel) => set({ tetherCameraModel }),
  tetherLiveFrame: null,
  setTetherLiveFrame: (tetherLiveFrame) => set({ tetherLiveFrame }),
  tetherError: null,
  setTetherError: (tetherError) => set({ tetherError }),

  customGifOverlayUrl: null,
  setCustomGifOverlayUrl: (customGifOverlayUrl) => set({ customGifOverlayUrl }),
  showFrameOverlayInPreview: false,
  setShowFrameOverlayInPreview: (showFrameOverlayInPreview) => set({ showFrameOverlayInPreview }),
}));
