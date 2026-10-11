import React, { useState, useEffect, useRef, useCallback } from 'react';
import QRCode from 'qrcode';
import {
  Camera,
  Video,
  Play,
  QrCode,
  Settings,
  X,
  Check,
  Download,
  Share2,
  Maximize2,
  Minimize2,
  Clock,
  Lock,
  Printer,
  Images,
  FolderCheck,
  Folder,
  FolderOpen,
  FolderPlus,
  Archive,
  ArrowLeft,
  ChevronLeft,
  Monitor,
  Laptop,
  Wifi,
  WifiOff,
  LogOut,
  RefreshCw,
  Film,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  CameraOff,
  RotateCcw,
  Upload,
  Layers,
  CheckCircle2,
  Eye,
  Palette,
  Plus,
  CloudUpload,
  AlertCircle,
  Info,
  Calendar,
} from 'lucide-react';
import { FrameHoleDetector, DetectedCutout } from '@minglebooth/template-engine';
import { GifComposer } from '@minglebooth/gif-engine';
import {
  saveOfflineCapture,
  getOfflineCaptures,
  getPendingOfflineCaptures,
  updateOfflineCaptureSyncStatus,
  deleteOfflineCapture,
  clearDemoCaptures,
  OfflineCaptureItem,
} from './lib/offlineStorage';
import { VendorAuthGate } from './components/VendorAuthGate';
import { EventManagerModal } from './components/EventManagerModal';
import { CameraQAPanel } from './components/CameraQAPanel';
import { API_BASE_URL } from './config';
import logoHeader from './assets/logo-minglebooth-header.png';
import appIcon from './assets/icon.png';

interface DiscoveredCamera {
  deviceId: string;
  label: string;
  type: 'webcam' | 'dslr_tether' | 'sony_tether';
}

interface EventItem {
  id: string;
  name: string;
  hostNames?: string;
  date?: string;
}

interface TemplateItem {
  id: string;
  name: string;
  path: string;
  base64?: string;
  ratio: string;
}

const DEFAULT_TEMPLATES: TemplateItem[] = [
  {
    id: 'tmpl_wedding_bayu_irma',
    name: 'Wedding Bayu & Irma (Floral Strip)',
    path: 'frames/wedding_bayu_irma.png',
    ratio: '2:3',
  },
];

export interface WallpaperPresetItem {
  id: string;
  name: string;
  subtitle: string;
  path: string;
}

const DEFAULT_WALLPAPERS: WallpaperPresetItem[] = [
  {
    id: 'flower',
    name: 'Bunga Putih Langit Biru',
    subtitle: 'Minimalis & Estetik',
    path: 'wallpapers/default_flower.jpg',
  },
  {
    id: 'building',
    name: 'Apartemen Malam Hangat',
    subtitle: 'Cozy Architectural Art',
    path: 'wallpapers/default_building.jpg',
  },
  {
    id: 'coastal',
    name: 'Pesisir Pantai Sunset',
    subtitle: 'Golden Hour Ocean View',
    path: 'wallpapers/default_coastal.jpg',
  },
];


// Audio feedback synthesizer
function playBeep(frequency = 880, duration = 0.08, type: OscillatorType = 'sine') {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {}
}

function playShutterSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(250, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch {}
}

interface ToastNotice {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  message: string;
}

interface TabletStudioContentProps {
  onOpenQA?: () => void;
  isDemoMode?: boolean;
  onEndDemo?: () => void;
}

const TabletStudioContent: React.FC<TabletStudioContentProps> = ({
  onOpenQA,
  isDemoMode = false,
  onEndDemo,
}) => {
  // In-app non-blocking toast notification state
  const [toastNotice, setToastNotice] = useState<ToastNotice | null>(null);
  const toastTimerRef = useRef<any>(null);

  // Demo Mode: Open Subscription Portal
  const handleOpenSubscription = useCallback(() => {
    const billingUrl = `${API_BASE_URL}/billing`;
    if (typeof window !== 'undefined' && (window as any).electronAPI?.openExternal) {
      (window as any).electronAPI.openExternal(billingUrl);
    } else {
      window.open(billingUrl, '_blank');
    }
  }, []);

  // Demo Mode: End Demo Session & Safely Clean Temporary Storage
  const handleEndDemo = useCallback(async () => {
    if (confirm('Akhiri sesi Demo Mode? Semua foto dan data pengujian lokal sementara akan dibersihkan.')) {
      try {
        if (typeof window !== 'undefined' && (window as any).electronAPI?.cleanDemoStorage) {
          await (window as any).electronAPI.cleanDemoStorage();
        }
        await clearDemoCaptures();
      } catch (e) {
        console.warn('Demo cleanup notice:', e);
      }
      if (onEndDemo) onEndDemo();
    }
  }, [onEndDemo]);

  // Demo Mode: 30-minute inactivity timeout for safety & cleanup
  useEffect(() => {
    if (!isDemoMode) return;
    const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
    let timeoutId: any = null;

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        console.log('[Demo] Inactivity timeout reached (30m). Ending demo session...');
        try {
          if (typeof window !== 'undefined' && (window as any).electronAPI?.cleanDemoStorage) {
            await (window as any).electronAPI.cleanDemoStorage();
          }
          await clearDemoCaptures();
        } catch (e) {}
        if (onEndDemo) onEndDemo();
      }, INACTIVITY_TIMEOUT_MS);
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'touchstart', 'scroll'];
    events.forEach((evt) => window.addEventListener(evt, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      events.forEach((evt) => window.removeEventListener(evt, resetTimer));
    };
  }, [isDemoMode, onEndDemo]);

  // Startup Cleanup: Safely purge any abandoned demo captures
  useEffect(() => {
    clearDemoCaptures().catch(() => {});
  }, []);

  // Persistent Demo Mode Indicator Banner
  const renderDemoBanner = () => {
    if (!isDemoMode) return null;
    let orgName = '';
    let subStatus = '';
    try {
      const orgData = JSON.parse(localStorage.getItem('mb_vendor_org') || '{}');
      orgName = orgData.name || '';
      subStatus = orgData.subscriptionStatus || orgData.subscription_status || '';
    } catch {}

    const statusLabel = subStatus === 'expired' ? 'Langganan Kedaluwarsa' : 'Langganan Belum Aktif';

    return (
      <div className="z-[9999] bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 text-black font-semibold text-xs px-4 py-2 flex items-center justify-between shadow-lg border-b border-amber-400/40 select-none flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="px-2 py-0.5 rounded bg-black/25 text-black font-mono font-bold text-[10px] uppercase tracking-wider">
            DEMO MODE
          </span>
          <span className="font-medium text-black hidden md:inline">
            {orgName ? `Akun: ${orgName} • ` : ''}{statusLabel} • Fitur Berbayar Terkunci (Pengujian Kamera Lokal)
          </span>
          <span className="font-medium text-black md:hidden">
            Demo Mode ({statusLabel})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpenSubscription}
            className="px-3 py-1 rounded-lg bg-black hover:bg-neutral-800 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
            title="Buka portal langganan website untuk membuka seluruh fitur berbayar"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
            <span>Aktifkan Langganan</span>
          </button>
          <button
            type="button"
            onClick={handleEndDemo}
            className="px-2.5 py-1 rounded-lg bg-black/20 hover:bg-black/30 text-black font-semibold text-xs flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
            title="Keluar dari akun dan bersihkan sesi pengujian"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar</span>
          </button>
        </div>
      </div>
    );
  };

  const showNotification = useCallback((
    message: string,
    type: 'info' | 'success' | 'warning' | 'error' = 'info',
    title?: string,
    duration = 4500
  ) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastNotice({ id: String(Date.now()), type, title, message });
    if (duration > 0) {
      toastTimerRef.current = setTimeout(() => {
        setToastNotice(null);
      }, duration);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Phase: 'setup' | 'kiosk' | 'review' | 'gallery'
  const [phase, setPhase] = useState<'setup' | 'kiosk' | 'review' | 'gallery'>('setup');
  const [previousPhase, setPreviousPhase] = useState<'setup' | 'kiosk' | 'review'>('setup');

  // Camera State
  const [cameraMode, setCameraMode] = useState<'webcam' | 'dslr' | 'sony'>('webcam');
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedWebcamId, setSelectedWebcamId] = useState<string>('');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Universal DSLR / Mirrorless Tether Server State (Local Port 4848)
  const [tetherUrl, setTetherUrl] = useState<string>('http://localhost:4848');
  const [tetherStatus, setTetherStatus] = useState<'checking' | 'connected' | 'disconnected'>('disconnected');
  const [tetherLiveFrame, setTetherLiveFrame] = useState<string | null>(null);
  const [nativeCameraModel, setNativeCameraModel] = useState<string | null>(null);
  const [isDetectingNative, setIsDetectingNative] = useState<boolean>(false);
  const [cameraSessionState, setCameraSessionState] = useState<
    'DISCONNECTED' | 'DETECTING' | 'CONNECTING' | 'CONNECTED' | 'READY' | 'CAPTURING' | 'TRANSFERRING' | 'PROCESSING' | 'COMPLETED' | 'ERROR' | 'DRIVER_SETUP_REQUIRED'
  >('DISCONNECTED');
  const [cameraSessionError, setCameraSessionError] = useState<string | null>(null);

  // Events & Templates
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [showEventManagerModal, setShowEventManagerModal] = useState<boolean>(false);
  const [eventManagerInitialTab, setEventManagerInitialTab] = useState<'list' | 'create'>('create');
  const currentEvent = events.find((e) => e.id === selectedEventId) || events[0] || null;
  const [setupTab, setSetupTab] = useState<'event' | 'frame' | 'camera' | 'photo' | 'standby'>('event');

  const [templates, setTemplates] = useState<TemplateItem[]>(DEFAULT_TEMPLATES);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(DEFAULT_TEMPLATES[0].id);
  const currentTemplate = templates.find((t) => t.id === selectedTemplateId) || templates[0];

  // Capture Settings
  const [countdownSeconds, setCountdownSeconds] = useState<number>(3); // 0, 3, 5, 10
  const [shotsCount, setShotsCount] = useState<number>(2); // 1, 2, 3, 4, 5, 6
  const [enableGif, setEnableGif] = useState<boolean>(true);
  const [gifOverlayPath, setGifOverlayPath] = useState<string | null>(null);
  const [customPhotoFileName, setCustomPhotoFileName] = useState<string>('');
  const [customGifFileName, setCustomGifFileName] = useState<string>('');
  const [customStorageDir, setCustomStorageDir] = useState<string>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('mb_custom_storage_dir') || '' : ''
  );
  const [tetherDisplayPath, setTetherDisplayPath] = useState<string>('~/Pictures/MingleBooth/Tether-Inbox');
  const [isLoadingVendorData, setIsLoadingVendorData] = useState<boolean>(false);

  // Kiosk Session Running State
  const [sessionStep, setSessionStep] = useState<'idle' | 'countdown' | 'flash' | 'paused_between_poses' | 'processing'>('idle');
  const [currentShotIndex, setCurrentShotIndex] = useState<number>(0);
  const [countdownRemaining, setCountdownRemaining] = useState<number>(3);
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const [isFlashing, setIsFlashing] = useState<boolean>(false);

  // Frame detection
  const [frameDimensions, setFrameDimensions] = useState<{ width: number; height: number }>({ width: 682, height: 1024 });
  const [frameCutouts, setFrameCutouts] = useState<DetectedCutout[]>([]);

  // Results & QR
  const [finalPhotoDataUrl, setFinalPhotoDataUrl] = useState<string | null>(null);
  const [finalGifDataUrl, setFinalGifDataUrl] = useState<string | null>(null);
  const [resultTab, setResultTab] = useState<'photo' | 'gif' | 'original'>('photo');
  const [reviewRawIndex, setReviewRawIndex] = useState<number>(0);
  const [retakeSlotIndex, setRetakeSlotIndex] = useState<number | null>(null);
  const [currentPhotoId, setCurrentPhotoId] = useState<string | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [guestGalleryUrl, setGuestGalleryUrl] = useState<string>('');
  const [reviewCountdown, setReviewCountdown] = useState<number>(30);
  const [printImageUrl, setPrintImageUrl] = useState<string | null>(null);

  // Gallery View & Lightbox
  const [showEventGalleryModal, setShowEventGalleryModal] = useState<boolean>(false);
  const [eventGalleryPhotos, setEventGalleryPhotos] = useState<OfflineCaptureItem[]>([]);
  const [isEventGalleryLoading, setIsEventGalleryLoading] = useState<boolean>(false);
  const [galleryFilterTab, setGalleryFilterTab] = useState<'all' | 'photo' | 'gif' | 'original'>('all');
  const [selectedGalleryPreviewItem, setSelectedGalleryPreviewItem] = useState<OfflineCaptureItem | null>(null);
  const [galleryLightboxTab, setGalleryLightboxTab] = useState<'photo' | 'gif' | 'original'>('photo');
  const [lightboxRawIndex, setLightboxRawIndex] = useState<number>(0);
  const [isSyncingAllToCloud, setIsSyncingAllToCloud] = useState<boolean>(false);
  const [cloudSyncFeedback, setCloudSyncFeedback] = useState<string | null>(null);

  // Concurrency & Background Sync Management
  const activeUploadsRef = useRef<Set<string>>(new Set());
  const isProcessingQueueRef = useRef<boolean>(false);
  const [isNetworkOnline, setIsNetworkOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Preview Framing Overlay Toggle (Clean full camera by default)
  const [showFrameOverlayInPreview, setShowFrameOverlayInPreview] = useState<boolean>(false);
  const [customGifCutouts, setCustomGifCutouts] = useState<DetectedCutout[]>([]);

  // Video & File Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const customFileInputRef = useRef<HTMLInputElement | null>(null);
  const customGifFileInputRef = useRef<HTMLInputElement | null>(null);
  const customWallpaperFileInputRef = useRef<HTMLInputElement | null>(null);
  const isCapturingRef = useRef<boolean>(false);
  const lastHandledPhotoRef = useRef<string | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Standby Wallpaper / Screensaver States
  const [enableStandbyWallpaper, setEnableStandbyWallpaper] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mb_enable_standby_wallpaper');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });
  const [standbyTimeoutMinutes, setStandbyTimeoutMinutes] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mb_standby_timeout_minutes');
      return saved ? parseFloat(saved) || 1 : 1;
    }
    return 1;
  });
  const [selectedWallpaperId, setSelectedWallpaperId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('mb_selected_wallpaper_id') || 'flower';
    }
    return 'flower';
  });
  const [customWallpaperUrl, setCustomWallpaperUrl] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('mb_custom_wallpaper_url') || null;
    }
    return null;
  });
  const [customWallpaperFileName, setCustomWallpaperFileName] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('mb_custom_wallpaper_filename') || '';
    }
    return '';
  });
  const [wallpaperFitMode, setWallpaperFitMode] = useState<'cover' | 'contain'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mb_wallpaper_fit_mode');
      return saved === 'contain' ? 'contain' : 'cover';
    }
    return 'cover';
  });
  const [isScreensaverActive, setIsScreensaverActive] = useState<boolean>(false);
  const [showWallpaperSettingModal, setShowWallpaperSettingModal] = useState<boolean>(false);


  // ── 1. HARDWARE DISCOVERY & WEBCAM INITIALIZATION (UNIVERSAL & ERROR-FREE) ──
  const enumerateCameras = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === 'videoinput');
      setCameras(videoInputs);

      // Prioritaskan kamera DSLR / Mirrorless / Cam Link / video capture USB eksternal jika ada
      const preferredCam = videoInputs.find((c) =>
        /dslr|mirrorless|canon|nikon|sony|fuji|lumix|cam link|uvc|usb video|external|elgato|webcam/i.test(c.label)
      );

      if (preferredCam && (!selectedWebcamId || !/dslr|mirrorless|canon|nikon|sony|fuji|lumix|cam link|uvc|usb video|external|elgato/i.test(videoInputs.find((v) => v.deviceId === selectedWebcamId)?.label || ''))) {
        setSelectedWebcamId(preferredCam.deviceId);
      } else if (videoInputs.length > 0 && !selectedWebcamId) {
        setSelectedWebcamId(videoInputs[0].deviceId);
      }
    } catch (err) {
      console.warn('enumerateDevices error:', err);
    }
  }, [selectedWebcamId]);

  // Deteksi perangkat USB otomatis saat dicolokkan (Hotplug listener)
  useEffect(() => {
    if (!navigator.mediaDevices?.addEventListener) return;
    let usbReconnectTimer: any = null;
    const handleDeviceChange = async () => {
      console.log('[Camera] USB device change detected, auto-refreshing devices...');
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
        setCameras(videoInputs);

        const newExternalCam = videoInputs.find((c) =>
          /dslr|mirrorless|canon|nikon|sony|fuji|lumix|cam link|uvc|usb video|external|elgato/i.test(c.label)
        );

        if (newExternalCam && cameraMode === 'webcam') {
          console.log('[Camera] Auto-switching to newly connected camera:', newExternalCam.label);
          setSelectedWebcamId(newExternalCam.deviceId);
          startWebcamStream(newExternalCam.deviceId);
        }

        // Auto-recover PC Remote connection when camera is plugged into USB
        if (cameraMode !== 'webcam') {
          if (usbReconnectTimer) clearTimeout(usbReconnectTimer);
          usbReconnectTimer = setTimeout(async () => {
            if (typeof window !== 'undefined' && (window as any).electronAPI?.detectNativeCameras) {
              const detectRes = await (window as any).electronAPI.detectNativeCameras();
              if (detectRes.success && detectRes.cameras && detectRes.cameras.length > 0) {
                console.log('[Camera] USB plug detected: Auto-connecting camera...', detectRes.cameras[0].model);
                setCameraSessionState('CONNECTING');
                setCameraSessionError(null);
                const connectRes = await (window as any).electronAPI.connectNativeCamera(detectRes.cameras[0]);
                if (connectRes.success) {
                  setNativeCameraModel(connectRes.camera?.model || detectRes.cameras[0].model);
                  setTetherStatus('connected');
                  setCameraSessionState('READY');
                  setCameraSessionError(null);
                }
              }
            }
          }, 1500);
        }
      } catch (e) {
        console.warn('devicechange error:', e);
      }
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => {
      if (usbReconnectTimer) clearTimeout(usbReconnectTimer);
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [cameraMode]);

  // Pemeriksaan Hardware Kamera Fisik untuk Mode PC Remote / Tether Studio
  const checkNativeCameraHardware = useCallback(async () => {
    setIsDetectingNative(true);
    setCameraSessionState('CONNECTING');
    setCameraSessionError(null);
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.detectNativeCameras) {
        if (import.meta.env.DEV) {
          console.log('[CameraFix-2026-09-09-v2] Renderer invoking camera:detect-cameras');
        }
        const detectRes = await (window as any).electronAPI.detectNativeCameras();
        if (import.meta.env.DEV) {
          console.log('[CameraFix-2026-09-09-v2] Renderer received camera detection response:', detectRes);
        }
        if (!detectRes.success || !detectRes.cameras || detectRes.cameras.length === 0) {
          setNativeCameraModel(null);
          setTetherStatus('disconnected');
          setCameraSessionState('DISCONNECTED');
          setCameraSessionError(
            detectRes.message ||
            'Pastikan kamera menyala, kabel USB terhubung, dan mode USB kamera diset ke "PC Remote".'
          );
          return;
        }

        const targetCam = detectRes.cameras[0];
        setNativeCameraModel(targetCam.model || 'Kamera Studio USB');

        // Establish active PTP connection handshake
        setCameraSessionState('CONNECTING');
        setCameraSessionError(null);
        if ((window as any).electronAPI?.connectNativeCamera) {
          const connectRes = await (window as any).electronAPI.connectNativeCamera(targetCam);
          if (connectRes.success) {
            setNativeCameraModel(connectRes.camera?.model || targetCam.model);
            setTetherStatus('connected');
            setCameraSessionState('READY');
            setCameraMode('dslr');
            setCameraSessionError(null);
            const api = (window as any).electronAPI;
            const startFn = api?.startLiveView || api?.startCameraLiveView;
            if (startFn) {
              if (import.meta.env.DEV) {
                console.log('[WIN-LV] renderer requested startLiveView (auto-start on connect)');
              }
              startFn().catch((e: any) => console.warn('startLiveView error:', e));
            }
            return;
          } else {
            setTetherStatus('disconnected');
            setCameraSessionState('ERROR');
            setCameraSessionError(connectRes.error || 'Pastikan kamera menyala, kabel USB terhubung, dan mode USB diset ke PC Remote / PTP.');
            return;
          }
        }
      }

      // Web/Tablet fallback polling
      const res = await fetch(`${tetherUrl}/api/tether/status`);
      const data = await res.json();
      if (data.cameraConnected) {
        setTetherStatus('connected');
        setCameraSessionState('READY');
        setCameraSessionError(null);
        if (data.camera?.model) setNativeCameraModel(data.camera.model);
      } else {
        setTetherStatus('disconnected');
        setCameraSessionState('ERROR');
        setCameraSessionError('PC Remote connection failed. Kamera tidak terhubung ke service lokal.');
      }
    } catch (err: any) {
      setTetherStatus('disconnected');
      setCameraSessionState('ERROR');
      setCameraSessionError(err.message || 'PC Remote connection failed');
    } finally {
      setIsDetectingNative(false);
    }
  }, [tetherUrl]);

  const stopWebcamStream = useCallback(() => {
    console.log('[Camera] 🛑 Stopping all webcam tracks and releasing MediaStream...');
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => {
          track.stop();
          track.enabled = false;
        });
      } catch (e) {
        console.warn('Error stopping streamRef tracks:', e);
      }
      streamRef.current = null;
    }
    if (cameraStream) {
      try {
        cameraStream.getTracks().forEach((track) => {
          track.stop();
          track.enabled = false;
        });
      } catch (e) {
        console.warn('Error stopping cameraStream tracks:', e);
      }
      setCameraStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = null;
    }
    setIsCameraLoading(false);
  }, [cameraStream]);

  const startWebcamStream = useCallback(async (deviceId?: string) => {
    // Strict Mutual Exclusion: Never start webcam if mode is not webcam
    if (cameraMode !== 'webcam') {
      console.log('[Camera] ✋ Skipping startWebcamStream: cameraMode is', cameraMode);
      return;
    }

    setIsCameraLoading(true);
    setCameraError(null);

    // Stop existing tracks safely
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Explicit macOS camera check via IPC in Electron
    if (typeof window !== 'undefined' && (window as any).electronAPI?.requestCameraAccess) {
      try {
        const granted = await (window as any).electronAPI.requestCameraAccess();
        if (!granted) {
          setCameraError('Izin akses kamera Mac belum diberikan. Silakan izinkan di Pengaturan Privasi Mac.');
          setIsCameraLoading(false);
          return;
        }
      } catch (ipcErr) {
        console.warn('IPC camera check notice:', ipcErr);
      }
    }

    const targetId = deviceId || selectedWebcamId;

    try {
      let stream: MediaStream | null = null;

      // Strategy 1: Targeted device with high-res ideal
      if (targetId) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { ideal: targetId },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
            audio: false,
          });
        } catch (e1) {
          console.warn('Targeted stream failed, falling back to default:', e1);
        }
      }

      // Strategy 2: High-res default without deviceId lock
      if (!stream) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
            audio: false,
          });
        } catch (e2) {
          console.warn('High-res stream failed, falling back to basic video:', e2);
        }
      }

      // Strategy 3: Universal standard video constraint
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      // Race-condition check: if user switched mode during getUserMedia, abort and stop stream immediately
      if (cameraMode !== 'webcam') {
        console.log('[Camera] Mode changed during getUserMedia, aborting stream...');
        if (stream) {
          stream.getTracks().forEach((t) => t.stop());
        }
        return;
      }

      streamRef.current = stream;
      setCameraStream(stream);
      setCameraError(null);

      // Immediately sync with any mounted video elements
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
        previewVideoRef.current.play().catch(() => {});
      }
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }

      // Update camera labels once permission granted
      enumerateCameras();
    } catch (err: any) {
      console.error('Webcam connection failed:', err);
      let msg = 'Kamera tidak dapat diakses.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Izin kamera belum aktif. Buka Pengaturan Mac > Privasi & Keamanan > Kamera, lalu centang MingleBooth Studio.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        msg = 'Kamera sedang dipakai oleh aplikasi lain (seperti QuickTime, Photo Booth, OBS, FaceTime, atau browser). Silakan TUTUP aplikasi tersebut sepenuhnya, lalu klik Sambungkan Ulang.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'Tidak ada perangkat kamera yang terdeteksi. Pastikan kabel USB tersambung dengan baik.';
      } else {
        msg = `Kamera belum terhubung (${err.name || err.message}). Pastikan kamera tidak terkunci.`;
      }
      setCameraError(msg);
    } finally {
      setIsCameraLoading(false);
    }
  }, [cameraMode, selectedWebcamId, enumerateCameras]);

  // Video Ref attachment callbacks that guarantee immediate playback when DOM mounts
  const attachVideoRef = useCallback(
    (el: HTMLVideoElement | null) => {
      videoRef.current = el;
      if (el) {
        el.muted = true;
        el.defaultMuted = true;
        el.playsInline = true;
        if (cameraMode === 'webcam') {
          if (cameraStream) {
            if (el.srcObject !== cameraStream) {
              el.srcObject = cameraStream;
            }
            el.play().catch(() => {});
          } else if (!isCameraLoading) {
            startWebcamStream();
          }
        } else {
          el.srcObject = null;
        }
      }
    },
    [cameraStream, cameraMode, isCameraLoading, startWebcamStream]
  );

  const attachPreviewVideoRef = useCallback(
    (el: HTMLVideoElement | null) => {
      previewVideoRef.current = el;
      if (el) {
        el.muted = true;
        el.defaultMuted = true;
        el.playsInline = true;
        if (cameraMode === 'webcam') {
          if (cameraStream) {
            if (el.srcObject !== cameraStream) {
              el.srcObject = cameraStream;
            }
            el.play().catch(() => {});
          } else if (!isCameraLoading) {
            startWebcamStream();
          }
        } else {
          el.srcObject = null;
        }
      }
    },
    [cameraStream, cameraMode, isCameraLoading, startWebcamStream]
  );

  // Sync active stream across phase transitions
  useEffect(() => {
    if (cameraMode === 'webcam' && cameraStream) {
      if (videoRef.current && videoRef.current.srcObject !== cameraStream) {
        videoRef.current.srcObject = cameraStream;
        videoRef.current.play().catch(() => {});
      }
      if (previewVideoRef.current && previewVideoRef.current.srcObject !== cameraStream) {
        previewVideoRef.current.srcObject = cameraStream;
        previewVideoRef.current.play().catch(() => {});
      }
    } else if (cameraMode !== 'webcam') {
      if (videoRef.current) videoRef.current.srcObject = null;
      if (previewVideoRef.current) previewVideoRef.current.srcObject = null;
    }
  }, [phase, cameraStream, cameraMode]);

  // Ensure mutual exclusion whenever cameraMode changes
  useEffect(() => {
    if (cameraMode !== 'webcam') {
      stopWebcamStream();
    }
  }, [cameraMode, stopWebcamStream]);

  // Initial mount: start camera
  useEffect(() => {
    if (cameraMode === 'webcam') {
      startWebcamStream();
    }
  }, []);

  // Initial mount: load tether info (native device path)
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.getTetherInfo) {
      (window as any).electronAPI.getTetherInfo().then((info: any) => {
        if (info?.tetherDir) {
          setTetherDisplayPath(info.tetherDir);
        }
      }).catch((e: any) => console.warn('[Tether] Could not get tether info:', e));
    }
    if (typeof window !== 'undefined' && (window as any).electronAPI?.getNativeCameraStatus) {
      (window as any).electronAPI.getNativeCameraStatus().then((res: any) => {
        if (res?.connected && res?.camera) {
          setNativeCameraModel(res.camera.model);
          setTetherStatus('connected');
          setCameraSessionState('READY');
          setCameraMode('dslr');
        }
      }).catch(() => {});
    }
  }, []);

  // ── Listen to Native Camera IPC Events ──
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let unsubState: any;
    let unsubLive: any;
    let unsubRaw: any;

    if ((window as any).electronAPI?.onCameraStateChange) {
      unsubState = (window as any).electronAPI.onCameraStateChange((payload: any) => {
        if (import.meta.env.DEV) {
          console.log('[WIN-TRACE] renderer state changed:', payload?.state);
        }
        if (payload?.state) {
          setCameraSessionState(payload.state);
          if (payload.state === 'DISCONNECTED') {
            setTetherLiveFrame(null);
            setNativeCameraModel(null);
            setTetherStatus('disconnected');
            setCameraSessionError(payload.error || null);
          } else if (payload.state === 'CONNECTING' || payload.state === 'DETECTING') {
            setCameraSessionError(null);
          } else if (payload.state === 'READY' || payload.state === 'CONNECTED') {
            setCameraSessionError(null);
            setTetherStatus('connected');
            setCameraMode('dslr');
            if (payload.camera?.model) {
              setNativeCameraModel(payload.camera.model);
            }
          } else if (payload.state === 'ERROR') {
            setCameraSessionError(payload.error || 'Connection error');
            setTetherStatus('disconnected');
          }
        }
      });
    }

    if ((window as any).electronAPI?.onCameraLiveFrame) {
      let lastLvLog = 0;
      unsubLive = (window as any).electronAPI.onCameraLiveFrame((payload: any) => {
        if (payload?.frameDataUrl) {
          if (import.meta.env.DEV && Date.now() - lastLvLog > 3000) {
            console.log('[WIN-LV] renderer received frame');
            lastLvLog = Date.now();
          }
          setTetherLiveFrame(payload.frameDataUrl);
        }
      });
    }

    if ((window as any).electronAPI?.onTetherRawDetected) {
      unsubRaw = (window as any).electronAPI.onTetherRawDetected((payload: any) => {
        console.warn('[RAW-WARNING] Kamera menghasilkan foto RAW bukannya JPEG:', payload);
        showNotification(
          `File foto (${payload?.filename || 'RAW'}) terdeteksi berformat RAW/ARW!\nUbah pengaturan kamera Sony ke Format: JPEG (Fine/Extra Fine) agar foto otomatis masuk ke template bingkai.`,
          'warning',
          'Peringatan Format Kamera',
          8000
        );
      });
    }

    return () => {
      if (typeof unsubState === 'function') unsubState();
      if (typeof unsubLive === 'function') unsubLive();
      if (typeof unsubRaw === 'function') unsubRaw();
    };
  }, []);

  // ── Auto-start Live View for PC Remote Studio Camera ──
  useEffect(() => {
    const isNativeReady = cameraSessionState === 'READY' || cameraSessionState === 'CONNECTED';
    if (isNativeReady) {
      if (typeof window !== 'undefined') {
        const api = (window as any).electronAPI;
        const startFn = api?.startCameraLiveView || api?.startLiveView;
        if (startFn) {
          startFn();
        }
      }
    } else if (cameraMode === 'webcam' || cameraSessionState === 'DISCONNECTED') {
      if (typeof window !== 'undefined') {
        const api = (window as any).electronAPI;
        const stopFn = api?.stopCameraLiveView || api?.stopLiveView;
        if (stopFn) {
          stopFn();
        }
      }
    }
  }, [cameraMode, cameraSessionState]);

  // Monitor DSLR/Studio Tether server if selected
  useEffect(() => {
    if (cameraMode === 'webcam') return;

    let isMounted = true;
    const checkTether = async () => {
      try {
        const res = await fetch(`${tetherUrl}/api/tether/status`);
        const data = await res.json();
        if (isMounted) {
          const isConn = Boolean(data.cameraConnected);
          setTetherStatus(isConn ? 'connected' : 'disconnected');
          if (data.cameraState) {
            setCameraSessionState(data.cameraState);
          }
          if (data.camera?.model) {
            setNativeCameraModel(data.camera.model);
          }
        }
      } catch {
        if (isMounted) {
          setTetherStatus('disconnected');
          setCameraSessionState('DISCONNECTED');
        }
      }
    };

    checkTether();
    const interval = setInterval(checkTether, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [cameraMode, tetherUrl]);

  // Studio Live View Polling (for tablet/web client mode)
  useEffect(() => {
    if (cameraMode === 'webcam' || tetherStatus !== 'connected') return;

    let isMounted = true;
    let timer: any = null;

    const pollFrame = async () => {
      try {
        const res = await fetch(`${tetherUrl}/api/tether/liveview`);
        if (res.ok) {
          const data = await res.json();
          const frame = data.frameDataUrl || data.liveFrame;
          if (data.success && frame && isMounted) {
            setTetherLiveFrame(frame);
          }
        }
      } catch {}
      if (isMounted) {
        timer = setTimeout(pollFrame, 100);
      }
    };

    pollFrame();
    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [cameraMode, tetherStatus, tetherUrl]);

  // ── 2. TEMPLATE CUTOUT HOLE DETECTION ──
  useEffect(() => {
    if (!currentTemplate?.path) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = currentTemplate.path;
    img.onload = () => {
      FrameHoleDetector.detectCutouts(currentTemplate.path, img.naturalWidth || 682, img.naturalHeight || 1024)
        .then((cutouts) => {
          if (cutouts && cutouts.length > 0) {
            setFrameCutouts(cutouts);
          }
        })
        .catch((err) => console.warn('Hole detection error:', err));
    };
  }, [currentTemplate]);

  // ── 3. FETCH VENDOR EVENTS & TEMPLATES (LIVE SUPABASE DATABASE SYNC) ──
  const fetchVendorData = useCallback(async () => {
    setIsLoadingVendorData(true);
    if (isDemoMode) {
      const demoEvt: EventItem = {
        id: 'demo_event_local',
        name: 'Sesi Demo MingleBooth',
        hostNames: 'Pengujian Demo',
        date: new Date().toISOString().split('T')[0],
      };
      setEvents([demoEvt]);
      setSelectedEventId('demo_event_local');
      setTemplates(DEFAULT_TEMPLATES);
      setSelectedTemplateId(DEFAULT_TEMPLATES[0].id);
      setIsLoadingVendorData(false);
      return;
    }
    try {
      const token = localStorage.getItem('mb_license_token') || '';
      let orgId = '';
      let vendorEmail = '';
      try {
        const orgData = JSON.parse(localStorage.getItem('mb_vendor_org') || '{}');
        orgId = orgData.id || '';
      } catch {}
      try {
        const devData = JSON.parse(localStorage.getItem('mb_device_info') || '{}');
        vendorEmail = devData.vendorEmail || '';
      } catch {}

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (orgId) headers['x-org-id'] = orgId;
      if (vendorEmail) headers['x-vendor-email'] = vendorEmail;

      // 1. Fetch Events from Supabase
      const evRes = await fetch(`${API_BASE_URL}/api/vendor/events`, { headers });
      if (evRes.ok) {
        const evData = await evRes.json();
        if (Array.isArray(evData.events)) {
          if (evData.events.length > 0) {
            const mappedEvents = evData.events.map((e: any) => ({
              id: e.id,
              name: e.name,
              hostNames: e.branding?.hostNames || e.branding?.eventName || e.name,
              date: e.date,
            }));
            setEvents(mappedEvents);
            setSelectedEventId((prev) => {
              if (prev && mappedEvents.some((m: any) => m.id === prev)) return prev;
              return mappedEvents[0]?.id || '';
            });
          } else {
            setEvents([]);
            setSelectedEventId('');
          }
        }
      }

      // 2. Fetch Templates from Supabase
      const tmplRes = await fetch(`${API_BASE_URL}/api/vendor/templates`, { headers });
      if (tmplRes.ok) {
        const tmplData = await tmplRes.json();
        if (Array.isArray(tmplData.templates) && tmplData.templates.length > 0) {
          const mappedTemplates: TemplateItem[] = tmplData.templates.map((t: any, idx: number) => ({
            id: t.id || `tmpl_db_${idx}`,
            name: t.name || `Template ${idx + 1}`,
            path: t.overlay_base64 || t.preview_url || 'frames/wedding_bayu_irma.png',
            base64: t.overlay_base64,
            ratio: t.aspect_ratio || '2:3',
          }));
          setTemplates((prev) => {
            const ids = new Set(prev.map((p) => p.id));
            const fresh = mappedTemplates.filter((m) => !ids.has(m.id));
            return [...fresh, ...prev];
          });
          if (mappedTemplates[0]?.id) {
            setSelectedTemplateId(mappedTemplates[0].id);
          }
        }
      }
    } catch (e) {
      console.warn('Failed to fetch vendor data:', e);
    } finally {
      setIsLoadingVendorData(false);
    }
  }, []);

  useEffect(() => {
    fetchVendorData();
  }, [fetchVendorData]);

  // Reusable function to load local & Supabase gallery captures
  const loadGalleryData = useCallback(async () => {
    if (!selectedEventId) return;
    setIsEventGalleryLoading(true);
    if (isDemoMode) {
      try {
        const localItems = await getOfflineCaptures(selectedEventId).catch(() => []);
        setEventGalleryPhotos(localItems);
      } catch (err) {
        console.warn('Failed to load demo captures:', err);
      } finally {
        setIsEventGalleryLoading(false);
      }
      return;
    }
    try {
      const [localItems, cloudData] = await Promise.all([
        getOfflineCaptures(selectedEventId).catch(() => []),
        fetch(`${API_BASE_URL}/api/gallery/event/${selectedEventId}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);

      const map = new Map<string, OfflineCaptureItem>();

      // 1. Add cloud photos from Supabase (strictly filtered to selectedEventId)
      if (cloudData && Array.isArray(cloudData.photos)) {
        for (const p of cloudData.photos) {
          const photoUrl = p.fullUrl?.startsWith('http')
            ? p.fullUrl
            : p.thumbUrl?.startsWith('http')
            ? p.thumbUrl
            : `${API_BASE_URL}${p.fullUrl || p.thumbUrl}`;
          const gifUrl = p.gifUrl
            ? p.gifUrl.startsWith('http')
              ? p.gifUrl
              : `${API_BASE_URL}${p.gifUrl}`
            : null;

          const rawShots = Array.isArray(p.rawShots)
            ? p.rawShots.map((r: any) => ({
                index: r.index,
                dataUrl: r.url?.startsWith('http') ? r.url : `${API_BASE_URL}${r.url}`,
              }))
            : [];

          map.set(p.photoId, {
            photoId: p.photoId,
            eventId: selectedEventId,
            eventName: currentEvent?.name || 'Photobooth Event',
            photoDataUrl: photoUrl,
            gifDataUrl: gifUrl,
            hasGif: Boolean(p.hasGif),
            rawShots,
            createdAt: p.createdAt || new Date().toISOString(),
          });
        }
      }

      // 2. Merge local items (local takes priority if same photoId)
      if (Array.isArray(localItems)) {
        for (const item of localItems) {
          map.set(item.photoId, item);
        }
      }

      const combined = Array.from(map.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setEventGalleryPhotos(combined);
    } catch (e) {
      console.warn('Could not load gallery captures:', e);
    } finally {
      setIsEventGalleryLoading(false);
    }
  }, [selectedEventId, currentEvent?.name]);

  // Helper to ensure raw camera captures stay safely below Vercel 4.5MB payload limit
  const compressDataUrl = async (dataUrl: string, maxDimension = 2048, quality = 0.88): Promise<string> => {
    if (!dataUrl || !dataUrl.startsWith('data:image')) return dataUrl;
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (!width || !height) {
          resolve(dataUrl);
          return;
        }
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  };

  // ── CLOUD SYNC: Staged upload with Concurrency Guard & Offline State Tracking ──
  const uploadCaptureToCloud = async (payload: {
    photoId: string;
    eventId: string;
    compositeDataUrl: string;
    gifDataUrl?: string | null;
    rawPhotos?: string[];
  }): Promise<boolean> => {
    if (isDemoMode) {
      console.log('[Cloud Sync] Demo Mode active — uploadCaptureToCloud strictly blocked.');
      return false;
    }
    const { photoId, eventId, compositeDataUrl, gifDataUrl, rawPhotos } = payload;
    if (!eventId || !photoId || !compositeDataUrl) return false;
    if (eventId.startsWith('demo') || photoId.startsWith('DEMO_') || photoId.startsWith('demo_')) {
      console.log('[Cloud Sync] Demo payload detected — uploadCaptureToCloud strictly blocked.');
      return false;
    }

    // Prevent concurrent racing uploads for the same photoId
    if (activeUploadsRef.current.has(photoId)) {
      console.log(`[Cloud Sync] Skipped concurrent upload for active photoId: ${photoId}`);
      return false;
    }

    activeUploadsRef.current.add(photoId);

    const token = localStorage.getItem('mb_license_token') || '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      console.log(`[Cloud Sync] SYNC_START: Uploading session ${photoId}...`);
      await updateOfflineCaptureSyncStatus(photoId, 'uploading');

      // Step 1: Upload main composite photo (< 1.2MB, creates Supabase photos record & storage file)
      const photoRes = await fetch(`${API_BASE_URL}/api/sync/upload-capture`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          photoId,
          eventId,
          fileDataUrl: compositeDataUrl,
          type: 'photo',
        }),
      });

      if (!photoRes.ok) {
        const errJson = await photoRes.json().catch(() => ({}));
        const errMessage = errJson?.error || photoRes.statusText || 'Photo upload failed';
        console.warn(`[Cloud Sync Warning]: Composite upload failed for ${photoId}:`, errMessage);
        await updateOfflineCaptureSyncStatus(photoId, 'failed', errMessage);
        return false;
      }

      console.log('[Cloud Sync] Composite photo synced for', photoId);

      // Step 2: Upload GIF Boomerang if available (< 1.5MB)
      if (gifDataUrl) {
        try {
          const uploadGifOnce = async () => {
            return await fetch(`${API_BASE_URL}/api/sync/upload-capture`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                photoId,
                eventId,
                fileDataUrl: gifDataUrl,
                type: 'gif',
              }),
            });
          };

          let gifRes = await uploadGifOnce();
          if (!gifRes.ok) {
            console.warn('[Cloud Sync Warning]: GIF sync attempt 1 failed, retrying in 1s...', gifRes.status);
            await new Promise((r) => setTimeout(r, 1000));
            gifRes = await uploadGifOnce();
          }

          if (gifRes.ok) {
            console.log('[Cloud Sync] GIF boomerang synced for', photoId);
          } else {
            console.warn('[Cloud Sync Warning]: GIF sync failed with status:', gifRes.status);
          }
        } catch (gifErr) {
          console.warn('[Cloud Sync Warning]: GIF sync error:', gifErr);
        }
      }

      // Step 3: Upload raw camera shots sequentially (each pose individually < 1.5MB)
      if (Array.isArray(rawPhotos) && rawPhotos.length > 0) {
        for (let i = 0; i < rawPhotos.length; i++) {
          const rawShot = rawPhotos[i];
          if (!rawShot) continue;
          try {
            const compressedRaw = await compressDataUrl(rawShot, 2048, 0.88);
            const rawRes = await fetch(`${API_BASE_URL}/api/sync/upload-capture`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                photoId,
                eventId,
                fileDataUrl: compressedRaw,
                type: 'raw',
                rawIndex: i + 1,
              }),
            });
            if (rawRes.ok) {
              console.log(`[Cloud Sync] Raw shot ${i + 1} synced for ${photoId}`);
            } else {
              console.warn(`[Cloud Sync Warning]: Raw shot ${i + 1} sync status: ${rawRes.status}`);
            }
          } catch (rErr) {
            console.warn(`[Cloud Sync Notice]: Raw shot ${i + 1} upload notice:`, rErr);
          }
        }
      }

      // Mark session as successfully synced in local IndexedDB
      await updateOfflineCaptureSyncStatus(photoId, 'synced');
      console.log(`[Cloud Sync] SYNC_SUCCESS: Session ${photoId} fully synced to cloud.`);
      return true;
    } catch (err: any) {
      const errMsg = err?.message || 'Network error';
      console.warn(`[Cloud Sync Error]: SYNC_FAILED for ${photoId}:`, errMsg);
      await updateOfflineCaptureSyncStatus(photoId, 'failed', errMsg);
      return false;
    } finally {
      activeUploadsRef.current.delete(photoId);
    }
  };

  // ── BACKGROUND SYNC WORKER: Processes pending captures non-aggressively ──
  const processPendingSyncQueue = useCallback(async (isManual = false) => {
    if (isDemoMode) {
      console.log('[Cloud Sync] Demo mode active — background queue paused.');
      return;
    }
    if (isProcessingQueueRef.current) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      console.log('[Cloud Sync] Offline mode — background queue paused.');
      return;
    }

    isProcessingQueueRef.current = true;
    try {
      const pendingItems = await getPendingOfflineCaptures(selectedEventId);
      if (!pendingItems || pendingItems.length === 0) return;

      console.log(`[Cloud Sync] Found ${pendingItems.length} pending capture(s) to synchronize.`);

      for (const item of pendingItems) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          console.log('[Cloud Sync] Network disconnected — pausing sync worker.');
          break;
        }

        if (activeUploadsRef.current.has(item.photoId)) continue;

        // Skip any demo items
        if (item.isDemo || item.photoId.startsWith('DEMO_') || (item.eventId && item.eventId.startsWith('demo'))) {
          continue;
        }

        // Skip excessive automated retries unless manually triggered
        if (!isManual && item.retryCount && item.retryCount >= 8) {
          continue;
        }

        const rawPhotos = (item.rawShots || []).map((r: any) => r.dataUrl || r.url).filter(Boolean);
        await uploadCaptureToCloud({
          photoId: item.photoId,
          eventId: item.eventId || selectedEventId,
          compositeDataUrl: item.photoDataUrl,
          gifDataUrl: item.gifDataUrl,
          rawPhotos,
        });

        // Modest pacing delay between captures
        await new Promise((r) => setTimeout(r, 600));
      }
    } catch (queueErr) {
      console.warn('[Cloud Sync Queue Warning]:', queueErr);
    } finally {
      isProcessingQueueRef.current = false;
    }
  }, [selectedEventId, isDemoMode]);

  // Online / Offline Network Listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsNetworkOnline(true);
      console.log('[Network] Online detected — resuming pending cloud sync queue...');
      processPendingSyncQueue();
    };

    const handleOffline = () => {
      setIsNetworkOnline(false);
      console.log('[Network] Offline detected — cloud sync paused.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check on mount
    if (navigator.onLine && selectedEventId) {
      const timer = setTimeout(() => {
        processPendingSyncQueue();
      }, 2500);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [selectedEventId, processPendingSyncQueue]);

  // Periodic Background Sync poll (every 45s) for resilient auto-recovery
  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine && selectedEventId) {
        processPendingSyncQueue();
      }
    }, 45000);
    return () => clearInterval(interval);
  }, [selectedEventId, processPendingSyncQueue]);

  // Sync all local captures for the active event to Supabase Cloud
  const handleSyncAllOfflineCapturesToCloud = async () => {
    if (isDemoMode) {
      showNotification('Sinkronisasi Cloud dinonaktifkan dalam Mode Demo. Foto pengujian hanya tersimpan di folder demo lokal.', 'warning');
      return;
    }
    if (!selectedEventId) {
      showNotification('Silakan pilih acara terlebih dahulu.', 'warning');
      return;
    }
    setIsSyncingAllToCloud(true);
    setCloudSyncFeedback('Mengecek foto lokal...');
    try {
      const localCaptures = await getOfflineCaptures(selectedEventId);
      if (!localCaptures || localCaptures.length === 0) {
        setCloudSyncFeedback('Belum ada foto lokal yang tersimpan untuk acara ini.');
        setTimeout(() => setCloudSyncFeedback(null), 3500);
        setIsSyncingAllToCloud(false);
        return;
      }

      let successCount = 0;
      for (let idx = 0; idx < localCaptures.length; idx++) {
        const item = localCaptures[idx];
        setCloudSyncFeedback(`Mengunggah ke Cloud (${idx + 1}/${localCaptures.length})...`);
        const rawPhotos = (item.rawShots || []).map((r: any) => r.dataUrl || r.url).filter(Boolean);
        const ok = await uploadCaptureToCloud({
          photoId: item.photoId,
          eventId: selectedEventId,
          compositeDataUrl: item.photoDataUrl,
          gifDataUrl: item.gifDataUrl,
          rawPhotos,
        });
        if (ok) successCount++;
      }

      setCloudSyncFeedback(`Berhasil menyinkronkan ${successCount} sesi foto ke Cloud!`);
      loadGalleryData();
      setTimeout(() => setCloudSyncFeedback(null), 4000);
    } catch (err: any) {
      setCloudSyncFeedback(`Gagal sinkron: ${err?.message || 'Error'}`);
      setTimeout(() => setCloudSyncFeedback(null), 4000);
    } finally {
      setIsSyncingAllToCloud(false);
    }
  };

  // Load Offline Captures & Supabase Cloud Captures whenever Event Gallery opens or event changes
  useEffect(() => {
    if (phase === 'gallery' || showEventGalleryModal) {
      loadGalleryData();
    }
  }, [phase, showEventGalleryModal, selectedEventId, loadGalleryData]);

  // Handle choose or create a new custom folder on laptop/SSD
  const handleChooseOrNewFolder = async () => {
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.selectFolder) {
        const res = await (window as any).electronAPI.selectFolder(customStorageDir || undefined);
        if (!res.canceled && res.selectedPath) {
          setCustomStorageDir(res.selectedPath);
          localStorage.setItem('mb_custom_storage_dir', res.selectedPath);
          showNotification(`Folder penyimpanan foto diatur ke:\n${res.selectedPath}`, 'success');
        }
      } else {
        showNotification('Fitur pemilihan folder aktif di aplikasi desktop MingleBooth.', 'info');
      }
    } catch (e: any) {
      console.error('[STORAGE-SELECT-ERROR]', e);
      showNotification('Gagal memilih folder penyimpanan.', 'error');
    }
  };

  // Handle open storage folder directly in Finder / File Explorer
  const handleOpenEventStorageFolder = async () => {
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.openEventFolder) {
        const res = await (window as any).electronAPI.openEventFolder({
          eventName: currentEvent?.name || 'Photobooth',
          customBasePath: customStorageDir || undefined,
          isDemo: isDemoMode,
        });
        if (res && !res.success && res.error) {
          console.error('[STORAGE-OPEN-ERROR]', res.error);
          showNotification('Gagal membuka folder di sistem operasi.', 'error');
        }
      } else {
        showNotification('Fitur buka folder penyimpanan lokal aktif di aplikasi desktop MingleBooth.', 'info');
      }
    } catch (e: any) {
      console.error('[STORAGE-OPEN-ERROR]', e);
      showNotification('Gagal membuka folder penyimpanan.', 'error');
    }
  };

  const openEventGallery = () => {
    setPreviousPhase(phase as 'setup' | 'kiosk' | 'review');
    setPhase('gallery');
  };

  // Upload Custom Photo Frame (.PNG)
  const handleUploadCustomFrame = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      const cleanName = file.name.replace(/\.[^/.]+$/, '');
      const newTmpl: TemplateItem = {
        id: 'custom_' + Date.now(),
        name: cleanName,
        path: base64,
        base64,
        ratio: '2:3',
      };
      setCustomPhotoFileName(file.name);
      setTemplates((prev) => [newTmpl, ...prev]);
      setSelectedTemplateId(newTmpl.id);

      // Detect Cutouts for Custom Frame
      try {
        const detected = await FrameHoleDetector.detectCutouts(base64, 682, 1024);
        if (detected && detected.length > 0) {
          setFrameCutouts(detected);
        }
      } catch (err) {
        console.warn('Frame detection notice:', err);
      }
    };
    reader.readAsDataURL(file);
  };

  // Upload Custom GIF Frame (.PNG)
  const handleUploadCustomGifFrame = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setGifOverlayPath(base64);
      setCustomGifFileName(file.name);
      setEnableGif(true);

      // Detect cutouts with natural dimensions of uploaded image
      try {
        const img = new Image();
        img.src = base64;
        await new Promise((res) => { img.onload = res; });
        const natW = img.naturalWidth || 720;
        const natH = img.naturalHeight || 960;
        const detected = await FrameHoleDetector.detectCutouts(base64, natW, natH);
        if (detected && detected.length > 0) {
          setCustomGifCutouts(detected);
        } else {
          setCustomGifCutouts([]);
        }
      } catch (err) {
        console.warn('GIF frame cutout detection notice:', err);
      }
    };
    reader.readAsDataURL(file);
  };

  // Upload Custom Standby Wallpaper (Image / GIF)
  const handleUploadCustomWallpaper = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setCustomWallpaperUrl(base64);
      setCustomWallpaperFileName(file.name);
      setSelectedWallpaperId('custom');
      localStorage.setItem('mb_custom_wallpaper_url', base64);
      localStorage.setItem('mb_custom_wallpaper_filename', file.name);
      localStorage.setItem('mb_selected_wallpaper_id', 'custom');
    };
    reader.readAsDataURL(file);
  };

  const getActiveWallpaperUrl = useCallback(() => {
    if (selectedWallpaperId === 'custom' && customWallpaperUrl) {
      return customWallpaperUrl;
    }
    const preset = DEFAULT_WALLPAPERS.find((w) => w.id === selectedWallpaperId);
    return preset?.path || DEFAULT_WALLPAPERS[0].path;
  }, [selectedWallpaperId, customWallpaperUrl]);

  const handleUpdateStandbyTimeout = (minutes: number) => {
    const valid = Math.max(0.1, Number(minutes.toFixed(1)));
    setStandbyTimeoutMinutes(valid);
    localStorage.setItem('mb_standby_timeout_minutes', valid.toString());
  };

  const handleToggleStandbyWallpaper = (enabled: boolean) => {
    setEnableStandbyWallpaper(enabled);
    localStorage.setItem('mb_enable_standby_wallpaper', enabled ? 'true' : 'false');
    if (!enabled) {
      setIsScreensaverActive(false);
    }
  };

  const handleSelectWallpaperPreset = (presetId: string) => {
    setSelectedWallpaperId(presetId);
    localStorage.setItem('mb_selected_wallpaper_id', presetId);
  };

  const handleUpdateWallpaperFitMode = (mode: 'cover' | 'contain') => {
    setWallpaperFitMode(mode);
    localStorage.setItem('mb_wallpaper_fit_mode', mode);
  };

  // Idle Activity Tracker in Kiosk Mode for Standby Wallpaper
  useEffect(() => {
    if (
      phase !== 'kiosk' ||
      !enableStandbyWallpaper ||
      sessionStep !== 'idle' ||
      showEventGalleryModal ||
      showWallpaperSettingModal
    ) {
      if (isScreensaverActive && (phase !== 'kiosk' || !enableStandbyWallpaper)) {
        setIsScreensaverActive(false);
      }
      return;
    }

    const timeoutMs = Math.max(5, standbyTimeoutMinutes * 60) * 1000;
    let timer: NodeJS.Timeout;

    const resetIdleTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setIsScreensaverActive(true);
      }, timeoutMs);
    };

    resetIdleTimer();

    const handleUserActivity = () => {
      if (isScreensaverActive) {
        setIsScreensaverActive(false);
      }
      resetIdleTimer();
    };

    window.addEventListener('mousemove', handleUserActivity);
    window.addEventListener('mousedown', handleUserActivity);
    window.addEventListener('touchstart', handleUserActivity);
    window.addEventListener('keydown', handleUserActivity);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', handleUserActivity);
      window.removeEventListener('mousedown', handleUserActivity);
      window.removeEventListener('touchstart', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
    };
  }, [
    phase,
    enableStandbyWallpaper,
    standbyTimeoutMinutes,
    sessionStep,
    showEventGalleryModal,
    showWallpaperSettingModal,
    isScreensaverActive,
  ]);

  // Camera Mode Switcher (Strict Mutual Exclusion)
  const handleSwitchCameraMode = useCallback(async (mode: 'webcam' | 'dslr' | 'sony') => {
    console.log('[Camera] Switching camera mode to:', mode);
    setCameraError(null);

    if (mode === 'webcam') {
      // 1. Stop Sony Live View if running
      if (typeof window !== 'undefined' && (window as any).electronAPI?.stopCameraLiveView) {
        try {
          await (window as any).electronAPI.stopCameraLiveView();
        } catch (e) {
          console.warn('[Camera] Error stopping Sony Live View:', e);
        }
      }
      setTetherLiveFrame(null);
      // 2. Set camera mode to webcam
      setCameraMode('webcam');
      // 3. Request webcam stream
      setTimeout(() => startWebcamStream(), 50);
    } else {
      // 1. Stop all webcam tracks and release video elements immediately
      stopWebcamStream();
      // 2. Clear video element srcObjects
      if (videoRef.current) videoRef.current.srcObject = null;
      if (previewVideoRef.current) previewVideoRef.current.srcObject = null;
      // 3. Switch mode to dslr (PC Remote)
      setCameraMode('dslr');
      // 4. Start Sony Live View if camera is ready
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        const api = (window as any).electronAPI;
        if (cameraSessionState === 'READY' || cameraSessionState === 'CONNECTED') {
          if (api.startCameraLiveView) {
            api.startCameraLiveView();
          }
        } else if (api.detectNativeCameras) {
          api.detectNativeCameras().then(async (det: any) => {
            if (det.success && det.cameras && det.cameras.length > 0) {
              await api.connectNativeCamera(det.cameras[0]);
              if (api.startCameraLiveView) {
                api.startCameraLiveView();
              }
            }
          }).catch((err: any) => console.warn('[Camera] Auto-connect error:', err));
        }
      }
    }
  }, [cameraSessionState, startWebcamStream, stopWebcamStream]);

  // ── 4. GRAB FRAME & CAPTURE SEQUENCE ──
  const grabVideoFrame = (): string | null => {
    const video = videoRef.current || previewVideoRef.current;
    if (!video || video.videoWidth === 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.95);
  };

  const triggerPoseShot = (shotIdx: number) => {
    if (sessionStep === 'countdown' || sessionStep === 'processing') return;

    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    if (countdownSeconds === 0) {
      executeShot(shotIdx);
      return;
    }

    setSessionStep('countdown');
    let count = countdownSeconds;
    setCountdownRemaining(count);
    playBeep(880, 0.08);

    const timer = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdownRemaining(count);
        playBeep(880, 0.08);
      } else {
        clearInterval(timer);
        countdownTimerRef.current = null;
        executeShot(shotIdx);
      }
    }, 1000);
    countdownTimerRef.current = timer;
  };

  const executeShot = async (shotIdx: number) => {
    setIsFlashing(true);
    playShutterSound();

    let frameData: string | null = null;

    const isNativeSonyReady = (cameraSessionState === 'READY' || cameraSessionState === 'CONNECTED') && tetherStatus === 'connected';

    if (isNativeSonyReady || cameraMode !== 'webcam') {
      isCapturingRef.current = true;
      try {
        console.log('[WIN-CAPTURE] renderer shutter clicked (native capture)');
        setCameraSessionState('CAPTURING');
        const api = (window as any).electronAPI;
        const captureFn = api?.triggerNativeCapture || api?.directCapture;
        if (typeof window !== 'undefined' && captureFn) {
          const res = await captureFn();
          if (res && res.success && res.photoDataUrl) {
            frameData = res.photoDataUrl;
            const photoKey = `${res.filename || 'shot'}_${res.byteSize || ''}`;
            lastHandledPhotoRef.current = photoKey;
            setCameraSessionState('PROCESSING');
          } else {
            const errMsg = res?.error || 'Capture failed';
            console.error('[WIN-CAPTURE-ERROR]', errMsg);
            setCameraSessionState('ERROR');
            setCameraSessionError(errMsg);
            setIsFlashing(false);
            isCapturingRef.current = false;
            showNotification('Kamera gagal mengambil foto. Silakan coba lagi.', 'error');
            if (retakeSlotIndex !== null) {
              setRetakeSlotIndex(null);
              setSessionStep('idle');
              setPhase('review');
            } else {
              setSessionStep('idle');
            }
            return;
          }
        } else {
          // Web / Tablet fetch trigger
          const res = await fetch(`${tetherUrl}/api/tether/trigger`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeoutMs: 10000 }),
          });
          const data = await res.json();
          if (data && data.success && data.photoDataUrl) {
            frameData = data.photoDataUrl;
            setCameraSessionState('PROCESSING');
          } else {
            const errMsg = data?.error || 'Photo transfer failed';
            console.error('[TETHER-CAPTURE-ERROR]', errMsg);
            setCameraSessionState('ERROR');
            setCameraSessionError(errMsg);
            setIsFlashing(false);
            isCapturingRef.current = false;
            showNotification('Kamera gagal mengambil foto. Silakan coba lagi.', 'error');
            if (retakeSlotIndex !== null) {
              setRetakeSlotIndex(null);
              setSessionStep('idle');
              setPhase('review');
            } else {
              setSessionStep('idle');
            }
            return;
          }
        }
      } catch (err: any) {
        console.error('[SHUTTER-ERROR]', err);
        setCameraSessionState('ERROR');
        setCameraSessionError(err.message || 'Capture failed');
        setIsFlashing(false);
        isCapturingRef.current = false;
        showNotification('Kamera gagal mengambil foto. Silakan coba lagi.', 'error');
        if (retakeSlotIndex !== null) {
          setRetakeSlotIndex(null);
          setSessionStep('idle');
          setPhase('review');
        } else {
          setSessionStep('idle');
        }
        return;
      } finally {
        isCapturingRef.current = false;
      }
    } else if (cameraMode === 'webcam') {
      frameData = grabVideoFrame();
    } else {
      frameData = grabVideoFrame();
    }

    setIsFlashing(false);

    if (!frameData) {
      showNotification('Gagal mengambil foto dari kamera. Pastikan kamera menyala dan terhubung dengan baik.', 'error');
      if (retakeSlotIndex !== null) {
        setRetakeSlotIndex(null);
        setSessionStep('idle');
        setPhase('review');
      } else {
        setSessionStep('idle');
      }
      return;
    }

    const nextPhotos = [...capturedPhotos];
    nextPhotos[shotIdx] = frameData;
    setCapturedPhotos(nextPhotos);

    // If targeted retake was active for this slot, recompose immediately and return to Result Screen
    if (retakeSlotIndex !== null) {
      const targetSlot = retakeSlotIndex;
      setRetakeSlotIndex(null);
      setSessionStep('processing');
      if (cameraMode !== 'webcam') {
        setCameraSessionState('COMPLETED');
      }
      composeFinalPhoto(nextPhotos, currentPhotoId || undefined, targetSlot);
      return;
    }

    const nextIdx = shotIdx + 1;
    if (nextIdx < shotsCount) {
      setCurrentShotIndex(nextIdx);
      setSessionStep('paused_between_poses');
      if (cameraMode !== 'webcam') {
        setCameraSessionState('READY');
      }
    } else {
      setSessionStep('processing');
      if (cameraMode !== 'webcam') {
        setCameraSessionState('COMPLETED');
      }
      composeFinalPhoto(nextPhotos);
    }
  };

  // ── 5. COMPOSE FINAL PHOTO & GIF BOOMERANG ──
  const composeFinalPhoto = async (photos: string[], overridePhotoId?: string, targetReviewIndex?: number) => {
    try {
      const frameImg = new Image();
      frameImg.crossOrigin = 'anonymous';
      frameImg.src = currentTemplate.path;
      await new Promise((res, rej) => {
        frameImg.onload = res;
        frameImg.onerror = rej;
      });

      const canvas = document.createElement('canvas');
      canvas.width = frameImg.naturalWidth || 682;
      canvas.height = frameImg.naturalHeight || 1024;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Cannot init canvas');

      // Draw user photos into cutout holes (Supports arbitrary flexible photos count dynamically)
      let cutouts = frameCutouts;
      if (!cutouts || cutouts.length < photos.length) {
        cutouts = [];
        const n = photos.length;
        if (n === 1) {
          cutouts.push({
            x: 40,
            y: 40,
            width: canvas.width - 80,
            height: canvas.height - 140,
          });
        } else if (n <= 3) {
          const slotH = Math.floor((canvas.height - 140) / n);
          for (let i = 0; i < n; i++) {
            cutouts.push({
              x: 40,
              y: 40 + i * (slotH + 15),
              width: canvas.width - 80,
              height: slotH - 10,
            });
          }
        } else {
          // Dynamic grid calculation for ANY count N (4, 5, 6, 7, 8, 9, etc.)
          const cols = n <= 4 ? 2 : n <= 6 ? 2 : n <= 9 ? 3 : 4;
          const rows = Math.ceil(n / cols);
          const padX = 30;
          const padY = 35;
          const gapX = 14;
          const gapY = 14;
          const totalGapW = (cols - 1) * gapX;
          const totalGapH = (rows - 1) * gapY;
          const slotW = Math.floor((canvas.width - padX * 2 - totalGapW) / cols);
          const slotH = Math.floor((canvas.height - 130 - totalGapH) / rows);

          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              if (cutouts.length < n) {
                cutouts.push({
                  x: padX + c * (slotW + gapX),
                  y: padY + r * (slotH + gapY),
                  width: slotW,
                  height: slotH,
                });
              }
            }
          }
        }
      }

      for (let i = 0; i < photos.length; i++) {
        const photoData = photos[i];
        if (!photoData) continue;
        const cutout = cutouts[i % cutouts.length];
        const img = new Image();
        img.src = photoData;
        const loaded = await new Promise((res) => {
          img.onload = () => res(true);
          img.onerror = () => {
            console.error('[MingleBooth] Failed to decode image for cutout:', i);
            res(false);
          };
          setTimeout(() => res(false), 4000);
        });

        if (!loaded || !img.width || !img.height) continue;
        const imgAspect = img.width / img.height;
        const cutAspect = cutout.width / cutout.height;
        let sWidth = img.width;
        let sHeight = img.height;
        let sx = 0;
        let sy = 0;

        if (imgAspect > cutAspect) {
          sWidth = img.height * cutAspect;
          sx = (img.width - sWidth) / 2;
        } else {
          sHeight = img.width / cutAspect;
          sy = (img.height - sHeight) / 2;
        }

        ctx.drawImage(img, sx, sy, sWidth, sHeight, cutout.x, cutout.y, cutout.width, cutout.height);
      }

      // Draw transparent frame on top
      ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height);

      const compositeDataUrl = canvas.toDataURL('image/jpeg', 0.95);
      setFinalPhotoDataUrl(compositeDataUrl);

      // Unique Photo ID & Direct Guest Download URL with Instant Event Gallery Reveal
      const photoId = overridePhotoId || currentPhotoId || `MB_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      setCurrentPhotoId(photoId);
      const targetEventId = selectedEventId || (currentEvent?.id ?? '');
      const galleryUrl = targetEventId
        ? `https://www.minglebooth.id/gallery/${targetEventId}?p=${photoId}`
        : `https://www.minglebooth.id/p/${photoId}`;
      setGuestGalleryUrl(galleryUrl);

      // Generate QR Code
      const qrData = await QRCode.toDataURL(galleryUrl, { margin: 1, width: 320, color: { dark: '#000000', light: '#ffffff' } });
      setQrCodeDataUrl(qrData);

      // Compose GIF Boomerang in background
      let gifDataUrl: string | null = null;
      if (enableGif && photos.length > 0) {
        try {
          const gifOverlay = gifOverlayPath || currentTemplate?.path || null;
          const gifSlots = customGifCutouts.length > 0 ? customGifCutouts : (cutouts && cutouts.length > 0 ? cutouts : undefined);
          const gifResult = await GifComposer.composeGif(photos, {
            frameDelayMs: 600,
            playbackMode: 'boomerang',
            frameOverlayBase64: gifOverlay,
            cutoutSlots: gifSlots,
          });
          gifDataUrl = gifResult.dataUrl;
          setFinalGifDataUrl(gifDataUrl);
        } catch (e) {
          console.warn('GIF creation notice:', e);
        }
      }

      const rawShotsPayload = photos.map((p, idx) => ({ index: idx + 1, dataUrl: p }));

      // Save to Offline Storage (IndexedDB) — Guaranteed Local Persistence First
      saveOfflineCapture({
        photoId,
        eventId: isDemoMode ? 'demo_event_local' : selectedEventId,
        eventName: isDemoMode ? 'Demo Photobooth Session' : (currentEvent?.name || 'Photobooth Event'),
        photoDataUrl: compositeDataUrl,
        gifDataUrl,
        hasGif: Boolean(gifDataUrl),
        rawShots: rawShotsPayload,
        createdAt: new Date().toISOString(),
        syncStatus: isDemoMode ? 'demo' : 'pending',
        retryCount: 0,
        isDemo: isDemoMode,
      }).catch((e) => console.warn('Offline storage save notice:', e));

      // Save directly to local SSD folder ~/Pictures/MingleBooth/[Nama Acara] or dedicated demo folder
      if (typeof window !== 'undefined' && (window as any).electronAPI?.saveCaptureFiles) {
        (window as any).electronAPI.saveCaptureFiles({
          eventName: isDemoMode ? 'Demo Photobooth' : (currentEvent?.name || 'Photobooth Event'),
          customBasePath: isDemoMode ? 'data/demo' : (customStorageDir || undefined),
          photoId,
          photoBase64: compositeDataUrl,
          gifBase64: gifDataUrl,
          rawShots: rawShotsPayload,
          isDemo: isDemoMode,
        }).catch((e: any) => console.warn('Could not save to local SSD:', e));
      }

      // Non-blocking Background Cloud Sync: strictly bypassed in Demo Mode
      if (!isDemoMode && typeof navigator !== 'undefined' && navigator.onLine) {
        uploadCaptureToCloud({
          photoId,
          eventId: selectedEventId,
          compositeDataUrl,
          gifDataUrl,
          rawPhotos: photos,
        }).then((ok) => {
          if (!ok) {
            console.log(`[Cloud Sync] Session ${photoId} upload incomplete, pending worker retry.`);
          }
        }).catch(() => {});
      } else if (isDemoMode) {
        console.log(`[Demo Mode] Photo ${photoId} saved strictly locally in demo storage. Cloud upload skipped.`);
      } else {
        console.log(`[Cloud Sync] Offline mode — session ${photoId} saved locally with status PENDING.`);
      }

      if (typeof targetReviewIndex === 'number') {
        setReviewRawIndex(targetReviewIndex);
        setResultTab('original');
      } else {
        setReviewRawIndex(0);
        setResultTab('photo');
      }

      setPhase('review');
      setSessionStep('idle');
      setReviewCountdown(30);
    } catch (err) {
      console.error('Compositing failed:', err);
      setSessionStep('idle');
      showNotification('Gagal menyusun foto ke dalam bingkai. Silakan coba lagi.', 'error');
    }
  };

  // ── Auto-absorb high-res photos captured via PC Remote / Hot Folder ──
  useEffect(() => {
    if (typeof window === 'undefined' || !(window as any).electronAPI?.onTetherPhotoCaptured) {
      return;
    }

    const unsubscribe = (window as any).electronAPI.onTetherPhotoCaptured((payload: any) => {
      if (!payload?.photoDataUrl) return;

      const photoKey = `${payload.filename || 'shot'}_${payload.byteSize || ''}`;
      if (lastHandledPhotoRef.current === photoKey) {
        console.log('[Tether] Duplicate photo ignored in UI:', photoKey);
        return;
      }

      if (isCapturingRef.current) {
        // Ignored: already handled by in-flight executeShot
        return;
      }
      lastHandledPhotoRef.current = photoKey;

      console.log('[Tether] 📸 Physical shutter photo detected from camera:', payload.filename);

      // Cancel running countdown if guest took shot physically
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }

      // Targeted retake handling for physical shutter
      if (retakeSlotIndex !== null) {
        const targetSlot = retakeSlotIndex;
        setRetakeSlotIndex(null);
        setCapturedPhotos((prev) => {
          const nextPhotos = [...prev];
          nextPhotos[targetSlot] = payload.photoDataUrl;
          setSessionStep('processing');
          setCameraSessionState('COMPLETED');
          composeFinalPhoto(nextPhotos, currentPhotoId || undefined, targetSlot);
          return nextPhotos;
        });
        return;
      }

      // If in setup or review, transition smoothly to kiosk
      if (phase === 'setup') {
        setPhase('kiosk');
      } else if (phase === 'review') {
        setFinalPhotoDataUrl(null);
        setFinalGifDataUrl(null);
        setResultTab('photo');
        setPhase('kiosk');
      }

      // Trigger flash & shutter sound
      setIsFlashing(true);
      playShutterSound();
      setTimeout(() => setIsFlashing(false), 180);

      // Automatically store in current shot slot
      setCapturedPhotos((prev) => {
        const nextPhotos = (phase === 'review' || (sessionStep === 'idle' && currentShotIndex === 0)) ? [] : [...prev];
        const targetIdx = currentShotIndex < shotsCount ? currentShotIndex : 0;
        nextPhotos[targetIdx] = payload.photoDataUrl;

        const nextIdx = targetIdx + 1;
        if (nextIdx < shotsCount) {
          setCurrentShotIndex(nextIdx);
          setSessionStep('paused_between_poses');
          setCameraSessionState('READY');
        } else {
          setSessionStep('processing');
          setCameraSessionState('COMPLETED');
          composeFinalPhoto(nextPhotos);
        }
        return nextPhotos;
      });
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [currentShotIndex, shotsCount, composeFinalPhoto, phase, sessionStep, retakeSlotIndex, currentPhotoId]);

  // Direct Print
  const handlePrintPhoto = () => {
    if (isDemoMode) {
      showNotification('Fitur Cetak Foto tersedia setelah langganan aktif.', 'warning');
      return;
    }
    if (!finalPhotoDataUrl) return;

    if (typeof window !== 'undefined' && (window as any).electronAPI?.printPhoto) {
      (window as any).electronAPI.printPhoto({
        filePath: finalPhotoDataUrl,
        silent: false,
        copies: 1,
        licenseToken: typeof window !== 'undefined' ? localStorage.getItem('mb_license_token') : null,
      })
        .then((res: any) => {
          if (res && res.success === false) {
            showNotification(res.error || 'Fitur Cetak Foto tersedia setelah langganan aktif.', 'warning');
          } else {
            showNotification('Perintah cetak berhasil dikirim ke printer!', 'success');
          }
        })
        .catch(() => {});
      return;
    }

    setPrintImageUrl(finalPhotoDataUrl);
    setTimeout(() => {
      window.focus();
      window.print();
    }, 200);
  };

  // Targeted Photo Retake (Phase 10: Retake individual pose slot from review screen)
  const handleStartRetake = (slotIdx: number) => {
    if (slotIdx < 0 || slotIdx >= capturedPhotos.length) return;
    setRetakeSlotIndex(slotIdx);
    setCurrentShotIndex(slotIdx);
    setSessionStep('idle');
    setPhase('kiosk');
  };

  const handleCancelRetake = () => {
    setRetakeSlotIndex(null);
    setSessionStep('idle');
    setPhase('review');
  };

  // Keyboard navigation (Escape = return to setup/kiosk, Space = shoot)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (phase === 'gallery') {
          setPhase(previousPhase || 'setup');
        } else if (phase === 'kiosk' && retakeSlotIndex !== null) {
          handleCancelRetake();
        } else if (phase === 'kiosk' || phase === 'review') {
          handleResetKiosk();
          setPhase('setup');
        }
      } else if (e.code === 'Space') {
        if (phase === 'kiosk' && (sessionStep === 'idle' || sessionStep === 'paused_between_poses')) {
          if (retakeSlotIndex !== null) {
            triggerPoseShot(retakeSlotIndex);
          } else {
            triggerPoseShot(currentShotIndex);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [phase, previousPhase, sessionStep, currentShotIndex, retakeSlotIndex]);

  // Review Timer Countdown
  useEffect(() => {
    if (phase !== 'review') return;

    const timer = setInterval(() => {
      setReviewCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleResetKiosk();
          setPhase('kiosk');
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [phase]);

  // Retake previous pose
  const handleRetakePreviousPose = () => {
    const prevIdx = Math.max(0, currentShotIndex - 1);
    setCurrentShotIndex(prevIdx);
    const trimmed = capturedPhotos.slice(0, prevIdx);
    setCapturedPhotos(trimmed);
    setSessionStep(prevIdx === 0 ? 'idle' : 'paused_between_poses');
  };

  // Reset Kiosk
  const handleResetKiosk = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCapturedPhotos([]);
    setCurrentShotIndex(0);
    setRetakeSlotIndex(null);
    setCurrentPhotoId(null);
    setFinalPhotoDataUrl(null);
    setFinalGifDataUrl(null);
    setQrCodeDataUrl(null);
    setGuestGalleryUrl('');
    setPrintImageUrl(null);
    setReviewCountdown(30);
    setResultTab('photo');
    setReviewRawIndex(0);
    setSessionStep('idle');
  };

  // Reset session whenever active event changes to prevent cross-event state contamination
  useEffect(() => {
    if (selectedEventId) {
      handleResetKiosk();
    }
  }, [selectedEventId]);

  // Download all assets for a session (Framed photo + GIF + All raw poses)
  const handleDownloadAllAssets = async () => {
    if (!selectedGalleryPreviewItem) return;
    const item = selectedGalleryPreviewItem;
    const downloads: Array<{ url: string; filename: string }> = [];

    // 1. Framed composite photo
    if (item.photoDataUrl) {
      downloads.push({
        url: item.photoDataUrl,
        filename: `${item.photoId}_Foto_Bingkai.jpg`,
      });
    }

    // 2. Animated GIF
    if (item.hasGif && item.gifDataUrl) {
      downloads.push({
        url: item.gifDataUrl,
        filename: `${item.photoId}_Animasi.gif`,
      });
    }

    // 3. Raw original shots
    if (item.rawShots && item.rawShots.length > 0) {
      item.rawShots.forEach((shot, sIdx) => {
        downloads.push({
          url: shot.dataUrl,
          filename: `${item.photoId}_Foto_Original_Pose${shot.index || sIdx + 1}.jpg`,
        });
      });
    } else if (item.photoDataUrl && !item.hasGif) {
      downloads.push({
        url: item.photoDataUrl,
        filename: `${item.photoId}_Foto_Original.jpg`,
      });
    }

    for (let i = 0; i < downloads.length; i++) {
      const d = downloads[i];
      const link = document.createElement('a');
      link.href = d.url;
      link.download = d.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      if (downloads.length > 1 && i < downloads.length - 1) {
        await new Promise((r) => setTimeout(r, 250));
      }
    }
  };

  // ── RENDER WALLPAPER & SCREENSAVER SETTINGS MODAL ──
  const renderWallpaperSettingModal = () => {
    if (!showWallpaperSettingModal) return null;

    return (
      <div
        onClick={(e) => {
          e.stopPropagation();
          setShowWallpaperSettingModal(false);
        }}
        className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none animate-fadeIn"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="max-w-xl w-full bg-[#111216] border border-white/[0.12] rounded-3xl p-6 sm:p-7 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white/[0.08] border border-white/15 flex items-center justify-center text-white">
                <Monitor className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-wide">
                  Pengaturan Wallpaper Standby
                </h3>
                <p className="text-xs text-neutral-400">
                  Screensaver otomatis saat bilik photobooth sedang santai tanpa tamu
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowWallpaperSettingModal(false)}
              className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.15] text-neutral-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 1. Toggle Sakelar On / Off */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#171920] border border-white/[0.06]">
            <div>
              <span className="text-xs font-semibold text-white block">
                Status Wallpaper Standby
              </span>
              <span className="text-[11px] text-neutral-400">
                Tampilkan wallpaper estetik saat tidak ada tamu yang berfoto
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleToggleStandbyWallpaper(!enableStandbyWallpaper)}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                enableStandbyWallpaper
                  ? 'bg-white text-black shadow-md'
                  : 'bg-white/10 text-neutral-400 hover:text-white'
              }`}
            >
              {enableStandbyWallpaper ? 'Aktif' : 'Mati'}
            </button>
          </div>

          {/* 2. Timer Setup (Vendor Bebas Mengatur) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-neutral-400" />
                <span>Waktu Tunggu Standby (Idle Timeout):</span>
              </label>
              <span className="text-xs font-bold text-white bg-white/10 px-2.5 py-0.5 rounded-md border border-white/10 font-mono">
                {standbyTimeoutMinutes < 1
                  ? `${Math.round(standbyTimeoutMinutes * 60)} Detik`
                  : `${standbyTimeoutMinutes} Menit`}
              </span>
            </div>

            {/* Quick buttons + Stepper */}
            <div className="flex items-center gap-2">
              <div className="flex-1 grid grid-cols-4 gap-1.5 bg-[#171920] p-1 rounded-xl border border-white/[0.06]">
                {[
                  { label: '30s', val: 0.5 },
                  { label: '1m', val: 1 },
                  { label: '2m', val: 2 },
                  { label: '5m', val: 5 },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => handleUpdateStandbyTimeout(item.val)}
                    className={`py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      standbyTimeoutMinutes === item.val
                        ? 'bg-white text-black shadow-sm font-bold'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Direct input number in minutes */}
              <div className="flex items-center bg-[#171920] border border-white/[0.08] rounded-xl p-0.5 h-[42px]">
                <button
                  type="button"
                  onClick={() => handleUpdateStandbyTimeout(Math.max(0.2, Number((standbyTimeoutMinutes - 0.5).toFixed(1))))}
                  className="w-8 h-full flex items-center justify-center text-neutral-300 hover:text-white hover:bg-white/10 rounded-lg text-sm font-bold transition-colors cursor-pointer"
                  title="Kurangi Waktu"
                >
                  -
                </button>
                <div className="flex items-center px-1">
                  <input
                    type="number"
                    step="0.5"
                    min="0.1"
                    max="60"
                    value={standbyTimeoutMinutes}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v > 0) {
                        handleUpdateStandbyTimeout(v);
                      }
                    }}
                    className="w-10 text-center bg-transparent text-white font-bold text-xs outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    title="Ketik durasi menit bebas"
                  />
                  <span className="text-[10px] text-neutral-400 font-medium mr-1">m</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleUpdateStandbyTimeout(Number((standbyTimeoutMinutes + 0.5).toFixed(1)))}
                  className="w-8 h-full flex items-center justify-center text-neutral-300 hover:text-white hover:bg-white/10 rounded-lg text-sm font-bold transition-colors cursor-pointer"
                  title="Tambah Waktu"
                >
                  +
                </button>
              </div>
            </div>
            <p className="text-[10px] text-neutral-400">
              Jika bilik foto tidak disentuh selama durasi di atas, wallpaper akan otomatis tampil.
            </p>
          </div>

          {/* 3. Pilihan Wallpaper (3 Preset Referensi + Upload Kustom) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-neutral-400" />
                <span>Pilih Tampilan Wallpaper:</span>
              </label>
              <span className="text-[11px] text-neutral-400">
                {DEFAULT_WALLPAPERS.length} Preset Bawaan + Kustom
              </span>
            </div>

            {/* Presets Grid (Landscape 16:10 Preview) */}
            <div className="grid grid-cols-3 gap-2.5">
              {DEFAULT_WALLPAPERS.map((preset) => {
                const isSelected = selectedWallpaperId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectWallpaperPreset(preset.id)}
                    className={`relative rounded-2xl overflow-hidden border text-left transition-all group cursor-pointer ${
                      isSelected
                        ? 'border-white ring-2 ring-white/50 shadow-xl'
                        : 'border-white/10 hover:border-white/30 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <div className="aspect-[16/10] w-full bg-black/40 overflow-hidden">
                      <img
                        src={preset.path}
                        alt={preset.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                    <div className="p-2 bg-[#171920]">
                      <span className="text-[11px] font-semibold text-white block truncate">
                        {preset.name}
                      </span>
                      <span className="text-[9px] text-neutral-400 block truncate">
                        {preset.subtitle}
                      </span>
                    </div>
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-white text-black flex items-center justify-center shadow-md">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Custom Upload Card */}
            <div
              className={`p-3.5 rounded-2xl border transition-all ${
                selectedWallpaperId === 'custom'
                  ? 'bg-[#1A1C24] border-white shadow-md'
                  : 'bg-[#14161C] border-white/[0.08]'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <div className="w-8 h-8 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center flex-shrink-0">
                    <Upload className="w-4 h-4 text-neutral-300" />
                  </div>
                  <div className="truncate">
                    <span className="text-xs font-semibold text-white block truncate">
                      {customWallpaperFileName ? `Kustom: ${customWallpaperFileName}` : 'Upload Wallpaper / Animasi Sendiri'}
                    </span>
                    <span className="text-[10px] text-neutral-400 block truncate">
                      Foto prewedding, logo acara, atau animasi GIF (.jpg, .png, .gif)
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <input
                    ref={customWallpaperFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleUploadCustomWallpaper}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => customWallpaperFileInputRef.current?.click()}
                    className="h-8 px-3 rounded-lg bg-white/[0.08] hover:bg-white/[0.15] border border-white/15 text-[11px] font-semibold text-white flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>{customWallpaperUrl ? 'Ganti File' : 'Pilih File'}</span>
                  </button>
                  {customWallpaperUrl && (
                    <button
                      type="button"
                      onClick={() => handleSelectWallpaperPreset('flower')}
                      className="h-8 px-2.5 rounded-lg text-[11px] text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                      title="Kembali ke preset bunga bawaan"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 4. Gaya Tampilan Wallpaper (Crop / Penuh vs Utuh Tanpa Potong) */}
          <div className="space-y-2.5 p-3.5 rounded-2xl bg-[#171920] border border-white/[0.06]">
            <div>
              <span className="text-xs font-semibold text-white block">
                Gaya Tampilan / Pemotongan Wallpaper
              </span>
              <span className="text-[11px] text-neutral-400">
                Pilih apakah gambar dipotong memenuhi layar penuh atau ditampilkan utuh di layar
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => handleUpdateWallpaperFitMode('cover')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  wallpaperFitMode === 'cover'
                    ? 'bg-white text-black border-white shadow-md'
                    : 'bg-[#12141A] text-neutral-300 border-white/10 hover:border-white/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Maximize2 className="w-4 h-4" />
                  <span className="text-xs font-bold">Penuhi Layar (Crop / Full)</span>
                </div>
                <p className={`text-[10px] mt-1.5 leading-relaxed ${wallpaperFitMode === 'cover' ? 'text-neutral-700 font-medium' : 'text-neutral-400'}`}>
                  Gambar mengisi seluruh layar laptop tanpa tepi hitam (tepi foto dipotong sesuai rasio layar).
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleUpdateWallpaperFitMode('contain')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  wallpaperFitMode === 'contain'
                    ? 'bg-white text-black border-white shadow-md'
                    : 'bg-[#12141A] text-neutral-300 border-white/10 hover:border-white/30'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Minimize2 className="w-4 h-4" />
                  <span className="text-xs font-bold">Utuh Tanpa Potong (Fit)</span>
                </div>
                <p className={`text-[10px] mt-1.5 leading-relaxed ${wallpaperFitMode === 'contain' ? 'text-neutral-700 font-medium' : 'text-neutral-400'}`}>
                  Gambar tampil 100% utuh di tengah, dengan latar belakang Ambient Blur elegan di sisi kiri & kanan.
                </p>
              </button>
            </div>
          </div>

          {/* Footer Action Buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-white/[0.08] gap-3">
            <button
              type="button"
              onClick={() => {
                setShowWallpaperSettingModal(false);
                if (phase === 'kiosk') {
                  setIsScreensaverActive(true);
                } else {
                  showNotification('Layar standby akan aktif saat masuk ke Mode Kiosk.', 'info');
                }
              }}
              className="h-11 px-4 rounded-2xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/15 text-xs font-semibold text-white flex items-center gap-2 transition-all cursor-pointer"
              title="Coba dan lihat tampilan wallpaper sekarang juga"
            >
              <Eye className="w-4 h-4 text-neutral-300" />
              <span>Pratinjau / Uji Sekarang</span>
            </button>

            <button
              type="button"
              onClick={() => setShowWallpaperSettingModal(false)}
              className="h-11 px-6 rounded-2xl bg-white hover:bg-neutral-200 text-black font-bold text-xs flex items-center gap-2 shadow-xl transition-all cursor-pointer"
            >
              <span>Simpan & Selesai</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE: DEDICATED FULL-PAGE EVENT GALLERY
  // ═══════════════════════════════════════════════════════════════════════════
  if (phase === 'gallery') {
    const totalSessions = eventGalleryPhotos.length;
    const photoCount = eventGalleryPhotos.length;
    const gifCount = eventGalleryPhotos.filter((p) => p.hasGif && p.gifDataUrl).length;
    const totalRawPoses = eventGalleryPhotos.reduce(
      (acc, item) => acc + (item.rawShots ? item.rawShots.length : 0),
      0
    );

    const filteredPhotos = eventGalleryPhotos.filter((item) => {
      if (galleryFilterTab === 'photo') return true;
      if (galleryFilterTab === 'gif') return item.hasGif && Boolean(item.gifDataUrl);
      if (galleryFilterTab === 'original') return item.rawShots && item.rawShots.length > 0;
      return true;
    });

    return (
      <div className="flex flex-col h-screen w-screen bg-[#090A0C] text-[#EDEDED] font-sans select-none overflow-hidden antialiased">
        {renderDemoBanner()}
        {/* Top Minimal Header (Responsive & Proportional) */}
        <header className="px-6 py-2.5 border-b border-white/[0.08] bg-[#0F1014] flex flex-wrap items-center justify-between gap-3 flex-shrink-0 min-h-[64px]">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setPhase(previousPhase || 'setup')}
              className="h-9 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-semibold text-neutral-200 hover:text-white flex items-center gap-2 transition-all cursor-pointer flex-shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Kembali ke Studio</span>
            </button>

            <div className="h-4 w-[1px] bg-white/10 hidden sm:block flex-shrink-0" />

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-semibold text-white truncate max-w-[220px] sm:max-w-md">
                  Galeri Foto: {currentEvent?.name || 'Acara Photobooth'}
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-[10px] font-medium text-neutral-300 flex-shrink-0">
                  Khusus Acara Terpilih
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 truncate">
                {totalSessions} sesi foto tersimpan • {customStorageDir ? `Folder: ${customStorageDir}` : 'Penyimpanan Laptop Aktif'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
            <button
              onClick={handleChooseOrNewFolder}
              className="h-9 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-medium text-neutral-200 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer"
              title="Pilih atau buat folder baru di laptop untuk meletakkan foto"
            >
              <FolderPlus className="w-3.5 h-3.5 text-neutral-300" />
              <span>Atur / Buat Folder</span>
            </button>

            <button
              onClick={handleOpenEventStorageFolder}
              className="h-9 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-medium text-neutral-200 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer"
              title="Buka folder foto acara ini di Finder / File Explorer"
            >
              <FolderOpen className="w-3.5 h-3.5 text-neutral-300" />
              <span>Buka Folder</span>
            </button>

            <button
              onClick={handleSyncAllOfflineCapturesToCloud}
              disabled={isSyncingAllToCloud}
              className={`h-9 px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                isSyncingAllToCloud
                  ? 'bg-blue-600/20 border-blue-500/30 text-blue-300 animate-pulse'
                  : 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-400 hover:text-emerald-300'
              }`}
              title="Unggah semua foto lokal acara ini ke Cloud Supabase agar bisa di-scan dari HP"
            >
              <CloudUpload className={`w-3.5 h-3.5 ${isSyncingAllToCloud ? 'animate-bounce' : ''}`} />
              <span>{isSyncingAllToCloud ? 'Menyinkronkan...' : 'Sinkronkan ke Cloud'}</span>
            </button>

            {cloudSyncFeedback && (
              <span className="text-xs px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-medium">
                {cloudSyncFeedback}
              </span>
            )}

            <button
              onClick={() => loadGalleryData()}
              className="h-9 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-medium text-neutral-200 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer"
              title="Muat ulang galeri"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isEventGalleryLoading ? 'animate-spin' : ''}`} />
              <span>Perbarui</span>
            </button>
          </div>
        </header>

        {/* Filter Navigation Bar */}
        <div className="px-6 py-2.5 border-b border-white/[0.06] bg-[#0C0D10] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-1.5 bg-[#141519] p-1 rounded-xl border border-white/[0.08] flex-wrap">
            <button
              onClick={() => setGalleryFilterTab('all')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                galleryFilterTab === 'all'
                  ? 'bg-white text-black font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Semua ({totalSessions})
            </button>
            <button
              onClick={() => setGalleryFilterTab('photo')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                galleryFilterTab === 'photo'
                  ? 'bg-white text-black font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Foto Cetak ({photoCount})
            </button>
            <button
              onClick={() => setGalleryFilterTab('gif')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                galleryFilterTab === 'gif'
                  ? 'bg-white text-black font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>Animasi GIF ({gifCount})</span>
            </button>
            <button
              onClick={() => setGalleryFilterTab('original')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                galleryFilterTab === 'original'
                  ? 'bg-white text-black font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Foto Original ({totalRawPoses > 0 ? totalRawPoses : totalSessions})</span>
            </button>
          </div>

          <div className="text-xs text-neutral-400 hidden lg:block">
            Acara aktif: <span className="text-white font-medium">{currentEvent?.name || 'Acara Photobooth'}</span>
          </div>
        </div>

        {/* Gallery Grid Body (Proportional and Uncropped) */}
        <main className="flex-1 overflow-y-auto p-6 min-h-0">
          {isEventGalleryLoading ? (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-xs text-neutral-400 gap-3">
              <RefreshCw className="w-7 h-7 animate-spin text-white" />
              <span>Memuat galeri acara {currentEvent?.name || 'Acara Photobooth'}...</span>
            </div>
          ) : filteredPhotos.length === 0 ? (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-6 gap-3">
              <div className="w-16 h-16 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-neutral-400">
                <Camera className="w-8 h-8 text-neutral-300" />
              </div>
              <div>
                <h4 className="text-base font-semibold text-white">Belum Ada Sesi Foto</h4>
                <p className="text-xs text-neutral-400 max-w-md mt-1.5 leading-relaxed">
                  Foto yang diambil pada sesi photobooth acara <strong className="text-neutral-200">&quot;{currentEvent?.name || 'Acara Photobooth'}&quot;</strong> akan otomatis tersimpan di laptop ini dan siap dicetak ulang atau diekspor.
                </p>
              </div>
              <button
                onClick={() => setPhase('setup')}
                className="mt-2 h-9 px-4 rounded-xl bg-white text-black font-semibold text-xs transition-all hover:bg-neutral-200 cursor-pointer shadow-md"
              >
                Mulai Sesi Photobooth
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {filteredPhotos.map((item, idx) => (
                <div
                  key={item.photoId || idx}
                  onClick={() => {
                    setSelectedGalleryPreviewItem(item);
                    setGalleryLightboxTab(
                      galleryFilterTab === 'gif' && item.hasGif
                        ? 'gif'
                        : galleryFilterTab === 'original'
                        ? 'original'
                        : 'photo'
                    );
                    setLightboxRawIndex(0);
                  }}
                  className="group relative aspect-[2/3] rounded-2xl overflow-hidden bg-[#0A0B0E] border border-white/[0.08] hover:border-white/30 transition-all cursor-pointer shadow-lg hover:shadow-2xl flex items-center justify-center p-1"
                >
                  {/* Proportional object-contain so frame is 100% visible without cropping */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      galleryFilterTab === 'original' && item.rawShots && item.rawShots.length > 0
                        ? item.rawShots[0].dataUrl
                        : item.photoDataUrl
                    }
                    alt={item.photoId}
                    className="w-full h-full object-contain rounded-xl group-hover:scale-[1.02] transition-transform duration-300"
                  />

                  {/* Badges Top */}
                  <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                    {item.hasGif && (
                      <div className="px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-sm border border-white/20 text-[10px] font-bold text-white flex items-center gap-1 shadow-sm">
                        <Film className="w-2.5 h-2.5" />
                        <span>GIF</span>
                      </div>
                    )}
                    {item.rawShots && item.rawShots.length > 0 && (
                      <div className="px-1.5 py-0.5 rounded-md bg-black/75 backdrop-blur-sm border border-white/20 text-[10px] font-medium text-neutral-300 shadow-sm">
                        {item.rawShots.length} Pose
                      </div>
                    )}
                  </div>

                  {/* Bottom Details Overlay */}
                  <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex items-end justify-between">
                    <span className="text-[11px] font-mono text-white/90">
                      {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-[11px] text-white/70 group-hover:text-white transition-colors font-medium">
                      Buka &rarr;
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        {/* Lightbox / Detail Modal (Unified All-in-One Package) */}
        {selectedGalleryPreviewItem && (
          <div
            onClick={() => setSelectedGalleryPreviewItem(null)}
            className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 select-none animate-fadeIn"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="max-w-3xl w-full bg-[#121316] border border-white/15 rounded-3xl p-5 flex flex-col gap-4 shadow-2xl max-h-[92vh] overflow-hidden"
            >
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono text-neutral-300">
                    ID: {selectedGalleryPreviewItem.photoId}
                  </span>
                  <span className="text-neutral-500">•</span>
                  <span className="text-xs text-neutral-400">
                    {new Date(selectedGalleryPreviewItem.createdAt).toLocaleString('id-ID')}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedGalleryPreviewItem(null)}
                  className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-neutral-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Mode Switcher Tabs: 1. Foto Cetak | 2. Animasi GIF | 3. Foto Original (All-in-One) */}
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-1 bg-[#1A1C24] p-1 rounded-xl border border-white/[0.08] flex-wrap justify-center">
                  <button
                    type="button"
                    onClick={() => setGalleryLightboxTab('photo')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      galleryLightboxTab === 'photo'
                        ? 'bg-white text-black shadow-sm'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    1. Foto Bingkai (Cetak)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (selectedGalleryPreviewItem.hasGif && selectedGalleryPreviewItem.gifDataUrl) {
                        setGalleryLightboxTab('gif');
                      }
                    }}
                    disabled={!selectedGalleryPreviewItem.hasGif || !selectedGalleryPreviewItem.gifDataUrl}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                      !selectedGalleryPreviewItem.hasGif || !selectedGalleryPreviewItem.gifDataUrl
                        ? 'opacity-40 cursor-not-allowed text-neutral-500'
                        : galleryLightboxTab === 'gif'
                        ? 'bg-white text-black shadow-sm cursor-pointer'
                        : 'text-neutral-400 hover:text-white cursor-pointer'
                    }`}
                  >
                    <Film className="w-3.5 h-3.5" />
                    <span>2. Animasi GIF</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setGalleryLightboxTab('original')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                      galleryLightboxTab === 'original'
                        ? 'bg-white text-black shadow-sm'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>3. Foto Original Mentah</span>
                  </button>
                </div>

                {/* Sub-selector for raw poses if original tab is selected */}
                {galleryLightboxTab === 'original' && (
                  <div className="flex items-center gap-1.5 bg-white/[0.04] p-1 rounded-xl border border-white/[0.06] flex-wrap justify-center">
                    {selectedGalleryPreviewItem.rawShots && selectedGalleryPreviewItem.rawShots.length > 0 ? (
                      selectedGalleryPreviewItem.rawShots.map((shot, sIdx) => (
                        <button
                          key={sIdx}
                          type="button"
                          onClick={() => setLightboxRawIndex(sIdx)}
                          className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                            lightboxRawIndex === sIdx
                              ? 'bg-white text-black font-semibold shadow-sm'
                              : 'text-neutral-400 hover:text-white'
                          }`}
                        >
                          Pose {shot.index || sIdx + 1}
                        </button>
                      ))
                    ) : (
                      <span className="text-[11px] text-neutral-400 px-2 py-0.5">
                        Foto Asli Kamera Sesi Ini
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Preview Image Display */}
              <div className="flex-1 min-h-0 flex items-center justify-center p-2 bg-black/60 rounded-2xl border border-white/[0.06]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    galleryLightboxTab === 'gif' && selectedGalleryPreviewItem.gifDataUrl
                      ? selectedGalleryPreviewItem.gifDataUrl
                      : galleryLightboxTab === 'original' &&
                        selectedGalleryPreviewItem.rawShots &&
                        selectedGalleryPreviewItem.rawShots.length > 0
                      ? selectedGalleryPreviewItem.rawShots[lightboxRawIndex]?.dataUrl ||
                        selectedGalleryPreviewItem.photoDataUrl
                      : selectedGalleryPreviewItem.photoDataUrl
                  }
                  alt="Preview"
                  className="max-h-[55vh] max-w-full object-contain rounded-xl shadow-lg"
                />
              </div>

              {/* Actions Bottom Bar: Download All-in-One + Individual Options */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/[0.08]">
                {/* Primary Button: Download All Assets at Once */}
                <button
                  type="button"
                  onClick={handleDownloadAllAssets}
                  className="h-10 px-4 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-xs flex items-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
                  title="Unduh seluruh foto berbingkai, animasi GIF, dan seluruh foto original dalam 1 klik"
                >
                  <Archive className="w-4 h-4 text-black" />
                  <span>Unduh Semua (Bingkai + GIF + Original)</span>
                </button>

                <div className="flex items-center gap-2 flex-wrap">
                  <a
                    href={
                      galleryLightboxTab === 'gif' && selectedGalleryPreviewItem.gifDataUrl
                        ? selectedGalleryPreviewItem.gifDataUrl
                        : galleryLightboxTab === 'original' &&
                          selectedGalleryPreviewItem.rawShots &&
                          selectedGalleryPreviewItem.rawShots.length > 0
                        ? selectedGalleryPreviewItem.rawShots[lightboxRawIndex]?.dataUrl ||
                          selectedGalleryPreviewItem.photoDataUrl
                        : selectedGalleryPreviewItem.photoDataUrl
                    }
                    download={`${selectedGalleryPreviewItem.photoId}_${galleryLightboxTab}${
                      galleryLightboxTab === 'original' ? `_pose${lightboxRawIndex + 1}` : ''
                    }.${galleryLightboxTab === 'gif' ? 'gif' : 'jpg'}`}
                    className="h-10 px-3.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-xs font-semibold text-white flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Unduh hanya file yang sedang dilihat"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Unduh File Ini</span>
                  </a>

                  <button
                    type="button"
                    onClick={handleOpenEventStorageFolder}
                    className="h-10 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-medium text-neutral-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-neutral-300" />
                    <span>Buka Folder</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      if (isDemoMode) {
                        showNotification('Fitur Cetak Foto tersedia setelah langganan aktif.', 'warning');
                        return;
                      }
                      try {
                        const targetUrl =
                          galleryLightboxTab === 'original' &&
                          selectedGalleryPreviewItem.rawShots &&
                          selectedGalleryPreviewItem.rawShots.length > 0
                            ? selectedGalleryPreviewItem.rawShots[lightboxRawIndex]?.dataUrl ||
                              selectedGalleryPreviewItem.photoDataUrl
                            : selectedGalleryPreviewItem.photoDataUrl;

                        if (isDemoMode) return;
                        if (typeof window !== 'undefined' && (window as any).electronAPI?.printPhoto) {
                          await (window as any).electronAPI?.printPhoto(targetUrl, 1, false);
                          showNotification('Perintah cetak berhasil dikirim ke printer!', 'success');
                        } else {
                          const win = window.open('');
                          win?.document.write(`<img src="${targetUrl}" style="width:100%"/>`);
                          win?.print();
                        }
                      } catch (e: any) {
                        console.error('[PRINT-ERROR]', e);
                        showNotification('Gagal mencetak: periksa koneksi printer.', 'error');
                      }
                    }}
                    className="h-10 px-4 rounded-xl bg-white/[0.12] hover:bg-white/[0.2] border border-white/20 text-white font-semibold text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Cetak Foto</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1: SETUP VIEW (MINIMAL PRO STUDIO)
  // ═══════════════════════════════════════════════════════════════════════════
  if (phase === 'setup') {
    return (
      <div className="flex flex-col h-screen w-screen bg-[#090A0C] text-[#EDEDED] font-sans select-none overflow-hidden antialiased">
        {renderDemoBanner()}
        {/* Top Minimal Header (56px) */}
        <header className="h-14 px-5 border-b border-white/[0.08] bg-[#0F1014] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <img
              src={logoHeader}
              alt="MingleBooth"
              className="h-6 sm:h-7 w-auto object-contain"
            />
            <div className="h-3.5 w-[1px] bg-white/10 hidden sm:block" />
            <span className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase hidden sm:inline">
              Studio Setup
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleChooseOrNewFolder}
              className="h-8 px-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-neutral-300 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer"
              title="Atur atau pilih folder penyimpanan foto"
            >
              <FolderPlus className="w-3.5 h-3.5 text-neutral-400" />
              <span>Folder</span>
            </button>

            <button
              onClick={openEventGallery}
              className="h-8 px-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-neutral-300 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer"
              title="Buka galeri foto acara"
            >
              <Images className="w-3.5 h-3.5 text-neutral-400" />
              <span>Galeri</span>
            </button>

            <button
              onClick={() => {
                if (confirm('Keluar dari sesi operator dan nonaktifkan perangkat ini?')) {
                  localStorage.removeItem('mb_license_token');
                  window.location.reload();
                }
              }}
              className="h-8 px-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-neutral-400 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer"
              title="Ganti akun operator"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Akun</span>
            </button>
          </div>
        </header>

        {/* Studio Split Layout: Large Dominant Preview + Compact Right Panel */}
        <main className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
          {/* SISI KIRI: LARGE CAMERA & TEMPLATE PREVIEW VIEWPORT */}
          <section className="flex-1 bg-[#0A0A0B] flex items-center justify-center p-4 sm:p-6 min-h-0 min-w-0 relative overflow-hidden">
            {/* Large Framing Box (Full Wide Clean Viewport by default, or Frame Aspect when toggled) */}
            <div
              style={{
                aspectRatio: showFrameOverlayInPreview
                  ? `${frameDimensions.width} / ${frameDimensions.height}`
                  : '4 / 3',
              }}
              className="w-full max-w-full h-full max-h-[82vh] rounded-2xl bg-[#0F1014] border border-white/[0.08] overflow-hidden relative shadow-2xl flex items-center justify-center transition-all duration-300"
            >
              {/* Top Floating Badges INSIDE the camera box with generous breathing room away from borders */}
              <div className="absolute top-6 left-6 z-20 flex items-center gap-2.5 bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 text-xs text-neutral-200 shadow-xl pointer-events-auto">
                <span
                  className={`w-2 h-2 rounded-full ${
                    cameraMode === 'webcam'
                      ? cameraStream
                        ? 'bg-emerald-400 animate-pulse'
                        : isCameraLoading
                        ? 'bg-amber-400 animate-spin'
                        : 'bg-neutral-500'
                      : cameraSessionState === 'READY' || cameraSessionState === 'CONNECTED'
                      ? 'bg-emerald-400 animate-pulse'
                      : cameraSessionState === 'CONNECTING' || cameraSessionState === 'DETECTING'
                      ? 'bg-amber-400 animate-spin'
                      : cameraSessionState === 'ERROR'
                      ? 'bg-rose-500'
                      : 'bg-neutral-500'
                  }`}
                />
                <span className="font-medium">
                  {cameraMode === 'webcam'
                    ? cameraStream
                      ? 'Webcam Aktif'
                      : isCameraLoading
                      ? 'Menghubungkan Webcam...'
                      : 'Webcam Offline'
                    : cameraSessionState === 'READY' || cameraSessionState === 'CONNECTED'
                    ? nativeCameraModel || 'Sony USB Siap'
                    : cameraSessionState === 'CONNECTING' || cameraSessionState === 'DETECTING'
                    ? 'Menyiapkan Sony...'
                    : 'Sony Belum Terhubung'}
                </span>
              </div>

              <div className="absolute top-6 right-6 z-20 flex items-center gap-2.5 pointer-events-auto">
                <button
                  type="button"
                  onClick={() => setShowFrameOverlayInPreview(!showFrameOverlayInPreview)}
                  className={`h-9 px-3.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 backdrop-blur-md border shadow-xl cursor-pointer ${
                    showFrameOverlayInPreview
                      ? 'bg-white text-black border-white font-semibold'
                      : 'bg-black/60 text-neutral-300 hover:text-white border-white/10'
                  }`}
                  title="Lihat bagaimana foto akan pas di dalam bingkai"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>{showFrameOverlayInPreview ? 'Tutup Bingkai' : 'Intip Bingkai'}</span>
                </button>
                <span className="h-9 px-3.5 rounded-full text-xs font-mono bg-black/60 backdrop-blur-md border border-white/10 text-neutral-300 flex items-center shadow-xl">
                  Rasio: {currentTemplate.ratio} ({frameDimensions.width}x{frameDimensions.height})
                </span>
              </div>
              {cameraMode === 'webcam' ? (
                cameraStream ? (
                  <video
                    ref={attachPreviewVideoRef}
                    autoPlay
                    playsInline
                    muted
                    onLoadedMetadata={(e) => {
                      const v = e.target as HTMLVideoElement;
                      v.play().catch(() => {});
                    }}
                    className="w-full h-full object-cover transform -scale-x-100"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 text-center max-w-md w-full mx-auto select-none z-0">
                    <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-neutral-300 mb-4 shadow-xl">
                      {isCameraLoading ? (
                        <RefreshCw className="w-7 h-7 animate-spin text-white" />
                      ) : (
                        <Laptop className="w-8 h-8 text-neutral-300 stroke-[1.5]" />
                      )}
                    </div>
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-mono uppercase tracking-wider text-neutral-400 bg-white/[0.04] border border-white/[0.08] mb-3">
                      Mode Video (Webcam / Streaming)
                    </span>
                    <h3 className="text-lg font-semibold text-white tracking-tight mb-2">
                      {isCameraLoading ? 'Menghubungkan Kamera Laptop...' : 'Kamera Laptop Belum Terhubung'}
                    </h3>
                    {cameraError ? (
                      <p className="text-xs text-rose-300 max-w-sm mb-6 leading-relaxed bg-rose-500/10 px-3.5 py-2.5 rounded-xl border border-rose-500/20">
                        {cameraError}
                      </p>
                    ) : (
                      <p className="text-xs text-neutral-400 max-w-sm mb-6 leading-relaxed">
                        Aktifkan kamera laptop atau hubungkan capture card USB.
                      </p>
                    )}
                    <div className="flex items-center justify-center">
                      <button
                        type="button"
                        onClick={() => startWebcamStream()}
                        className="px-6 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] hover:border-white/20 text-white font-medium text-xs flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-[0.98]"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Sambungkan Kamera</span>
                      </button>
                    </div>
                  </div>
                )
              ) : tetherLiveFrame ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tetherLiveFrame} alt="Live View Studio" className="w-full h-full object-contain pointer-events-none" />
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center max-w-md w-full mx-auto select-none z-0">
                  <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-neutral-300 mb-4 shadow-xl">
                    <Camera className="w-8 h-8 text-white stroke-[1.5]" />
                  </div>

                  <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-mono uppercase tracking-wider text-neutral-400 bg-white/[0.04] border border-white/[0.08] mb-3">
                    Mode Foto Studio (PC Remote)
                  </span>

                  <h3 className="text-lg font-semibold text-white tracking-tight mb-2">
                    {cameraSessionState === 'READY' || cameraSessionState === 'CONNECTED'
                      ? 'Menghubungkan Live View...'
                      : cameraSessionState === 'CONNECTING'
                      ? 'Menyiapkan kamera...'
                      : cameraSessionState === 'DETECTING'
                      ? 'Mendeteksi port USB...'
                      : cameraSessionState === 'ERROR'
                      ? 'Kamera Belum Terhubung'
                      : 'Kamera Belum Terhubung'}
                  </h3>

                  {cameraSessionState === 'ERROR' && cameraSessionError ? (
                    <p className="text-xs text-rose-300 max-w-sm mb-6 leading-relaxed bg-rose-500/10 px-3.5 py-2.5 rounded-xl border border-rose-500/20">
                      {cameraSessionError}
                    </p>
                  ) : (
                    <p className="text-xs text-neutral-400 max-w-sm mb-6 leading-relaxed">
                      Hubungkan kamera via kabel USB. Pastikan kamera menyala dan diset ke mode <span className="text-neutral-200 font-medium">FOTO ➔ USB: PC Remote / PTP</span>.
                    </p>
                  )}

                  <div className="flex items-center justify-center">
                    <button
                      type="button"
                      onClick={checkNativeCameraHardware}
                      disabled={isDetectingNative}
                      className="px-6 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] hover:border-white/20 text-white font-medium text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 active:scale-[0.98]"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isDetectingNative ? 'animate-spin' : ''}`} />
                      <span>{isDetectingNative ? 'Menyiapkan kamera...' : 'Sambungkan Kamera'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Template Frame Overlay (Only shown when operator toggles Intip Bingkai) */}
              {showFrameOverlayInPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={currentTemplate.path}
                  alt=""
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10 animate-fadeIn"
                />
              )}
            </div>
          </section>

          {/* SISI KANAN: STUDIO CONTROL RAIL & COMPACT PANEL (~400px) */}
          <aside className="w-full lg:w-[400px] xl:w-[410px] flex-none bg-[#0F1014] border-t lg:border-t-0 lg:border-l border-white/[0.08] flex flex-col justify-between min-h-0">
            {/* Top Navigation Rail (5 Categories) */}
            <div className="p-2.5 border-b border-white/[0.08] flex gap-1.5 flex-none bg-[#0F1014]">
              {[
                { id: 'event', label: 'Acara', icon: Calendar },
                { id: 'frame', label: 'Bingkai', icon: Layers },
                { id: 'camera', label: 'Kamera', icon: Camera },
                { id: 'photo', label: 'Foto', icon: Clock },
                { id: 'standby', label: 'Standby', icon: Monitor },
              ].map((tab) => {
                const IconComp = tab.icon;
                const isActive = setupTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSetupTab(tab.id as any)}
                    className={`flex-1 h-11 rounded-xl flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 text-xs font-medium transition-all cursor-pointer ${
                      isActive
                        ? 'bg-white text-black font-semibold shadow-sm'
                        : 'text-neutral-400 hover:text-white hover:bg-white/[0.06]'
                    }`}
                    title={tab.label}
                  >
                    <IconComp className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="text-[11px] font-semibold">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Scrollable Active Tab Content Panel */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
              {/* 1. ACARA (EVENT) TAB */}
              {setupTab === 'event' && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                      Pilih Acara
                    </span>
                    <span className="text-[11px] text-neutral-500 font-mono">
                      {events.length} Acara Terdaftar
                    </span>
                  </div>

                  {/* Events List */}
                  <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-0.5">
                    {events.length === 0 ? (
                      <div className="p-5 rounded-2xl bg-[#14161C] border border-dashed border-white/10 text-center space-y-2.5">
                        <p className="text-xs text-neutral-400">Belum ada acara photobooth tersimpan.</p>
                        <button
                          type="button"
                          onClick={() => {
                            setEventManagerInitialTab('create');
                            setShowEventManagerModal(true);
                          }}
                          className="px-4 py-2 rounded-xl bg-white text-black text-xs font-semibold cursor-pointer shadow-sm hover:bg-neutral-200 transition-colors"
                        >
                          + Buat Acara Baru
                        </button>
                      </div>
                    ) : (
                      events.map((ev) => {
                        const isSelected = ev.id === selectedEventId;
                        return (
                          <button
                            key={ev.id}
                            type="button"
                            onClick={() => setSelectedEventId(ev.id)}
                            className={`w-full p-3.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-[#14161C] border-white text-white shadow-sm ring-1 ring-white'
                                : 'bg-[#14161C] border-white/[0.06] text-neutral-300 hover:border-white/20'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0 pr-2">
                              <Calendar className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-white' : 'text-neutral-500'}`} />
                              <div className="truncate">
                                <div className="text-xs font-semibold truncate text-white">{ev.name}</div>
                                {ev.date && <div className="text-[10px] text-neutral-400 mt-0.5 font-mono">{ev.date}</div>}
                              </div>
                            </div>
                            {isSelected && <Check className="w-4 h-4 text-white flex-shrink-0" />}
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* Event Management Action Bar */}
                  <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
                    <button
                      type="button"
                      onClick={() => {
                        setEventManagerInitialTab('create');
                        setShowEventManagerModal(true);
                      }}
                      className="flex-1 h-10 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Buat Acara</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEventManagerInitialTab(events.length === 0 ? 'create' : 'list');
                        setShowEventManagerModal(true);
                      }}
                      className="h-10 px-3.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-xs font-medium text-neutral-300 hover:text-white transition-all cursor-pointer"
                      title="Kelola data acara (Edit / Hapus / Tambah)"
                    >
                      Kelola Acara
                    </button>
                    <button
                      type="button"
                      onClick={fetchVendorData}
                      disabled={isLoadingVendorData}
                      className="h-10 w-10 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-neutral-400 hover:text-white flex items-center justify-center transition-all cursor-pointer disabled:opacity-50"
                      title="Perbarui daftar acara dari server"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingVendorData ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>
              )}

              {/* 2. BINGKAI (FRAME) TAB */}
              {setupTab === 'frame' && (
                <div className="space-y-4 animate-fadeIn">
                  {/* Hidden File Inputs */}
                  <input
                    ref={customFileInputRef}
                    type="file"
                    accept="image/png"
                    onChange={handleUploadCustomFrame}
                    className="hidden"
                  />
                  <input
                    ref={customGifFileInputRef}
                    type="file"
                    accept="image/png"
                    onChange={handleUploadCustomGifFrame}
                    className="hidden"
                  />

                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                      Desain Bingkai Cetak
                    </span>
                    <span className="text-[11px] text-neutral-500 font-mono">
                      {templates.length} Pilihan
                    </span>
                  </div>

                  {/* Thumbnail Selector Grid */}
                  <div className="grid grid-cols-2 gap-2.5 max-h-[46vh] overflow-y-auto pr-0.5">
                    {templates.map((tmpl) => {
                      const isSelected = tmpl.id === selectedTemplateId;
                      return (
                        <button
                          key={tmpl.id}
                          type="button"
                          onClick={() => setSelectedTemplateId(tmpl.id)}
                          className={`p-2.5 rounded-xl border text-left flex flex-col items-center gap-2 transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#14161C] border-white shadow-sm ring-1 ring-white'
                              : 'bg-[#14161C] border-white/[0.06] hover:border-white/20'
                          }`}
                        >
                          <div className="w-full aspect-[2/3] rounded-lg bg-black/50 overflow-hidden flex items-center justify-center p-1">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={tmpl.path}
                              alt={tmpl.name}
                              className="w-full h-full object-contain"
                            />
                          </div>
                          <span className="text-[11px] font-semibold text-white truncate w-full text-center">
                            {tmpl.name}
                          </span>
                        </button>
                      );
                    })}

                    {/* Upload Frame Card */}
                    <button
                      type="button"
                      onClick={() => customFileInputRef.current?.click()}
                      className="p-2.5 rounded-xl border border-dashed border-white/10 hover:border-white/30 bg-[#14161C]/50 hover:bg-[#14161C] text-left flex flex-col items-center justify-center gap-2 transition-all cursor-pointer min-h-[140px]"
                    >
                      <div className="w-10 h-10 rounded-full bg-white/[0.06] flex items-center justify-center text-neutral-300">
                        <Upload className="w-4 h-4" />
                      </div>
                      <span className="text-[11px] font-semibold text-neutral-300 text-center">
                        {customPhotoFileName ? 'Ganti Frame' : '+ Upload PNG'}
                      </span>
                    </button>
                  </div>

                  {customPhotoFileName && (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-xs text-neutral-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-white flex-shrink-0" />
                      <span className="truncate">Frame Kustom: <strong>{customPhotoFileName}</strong></span>
                    </div>
                  )}

                  {/* GIF Boomerang Toggle & Options */}
                  <div className="pt-2 border-t border-white/[0.08] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Film className="w-3.5 h-3.5 text-neutral-400" />
                        <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                          Animasi GIF Boomerang
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEnableGif(!enableGif)}
                        className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                          enableGif ? 'bg-white text-black shadow-sm' : 'bg-white/10 text-neutral-400 hover:text-white'
                        }`}
                      >
                        {enableGif ? 'Aktif' : 'Mati'}
                      </button>
                    </div>

                    {enableGif && (
                      <div className="p-3 rounded-xl bg-[#14161C] border border-white/[0.06] space-y-2.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-neutral-300 truncate">
                            {customGifFileName ? `Frame GIF: ${customGifFileName}` : 'Format: Video Murni (Tanpa Frame)'}
                          </span>
                          {customGifFileName && (
                            <button
                              type="button"
                              onClick={() => {
                                setGifOverlayPath(null);
                                setCustomGifFileName('');
                                setCustomGifCutouts([]);
                              }}
                              className="text-[10px] text-neutral-400 hover:text-white underline cursor-pointer ml-2 flex-shrink-0"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => customGifFileInputRef.current?.click()}
                          className="w-full h-9 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-medium text-white flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5 text-neutral-300" />
                          <span>{customGifFileName ? 'Ganti Frame GIF (.PNG)' : 'Upload Frame GIF Khusus (.PNG)'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 3. KAMERA (CAMERA) TAB */}
              {setupTab === 'camera' && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                      Sumber Kamera
                    </span>
                  </div>

                  {/* Compact Source Switcher */}
                  <div className="grid grid-cols-2 p-1 rounded-xl bg-[#1A1C24] border border-white/[0.06]">
                    <button
                      type="button"
                      onClick={() => handleSwitchCameraMode('webcam')}
                      className={`py-2 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        cameraMode === 'webcam'
                          ? 'bg-white text-black shadow-sm font-bold'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      <Laptop className="w-3.5 h-3.5" />
                      <span>Live View</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchCameraMode('dslr')}
                      className={`py-2 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        cameraMode !== 'webcam'
                          ? 'bg-white text-black shadow-sm font-bold'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>PC Remote</span>
                    </button>
                  </div>

                  {/* Webcam Controls */}
                  {cameraMode === 'webcam' && (
                    <div className="space-y-3 p-3.5 rounded-xl bg-[#14161C] border border-white/[0.06]">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white font-medium flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${cameraStream ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-500'}`} />
                          <span>{cameraStream ? 'Webcam Aktif' : 'Webcam Belum Terhubung'}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            enumerateCameras().then(() => {
                              if (selectedWebcamId) startWebcamStream(selectedWebcamId);
                            });
                          }}
                          className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Pindai</span>
                        </button>
                      </div>

                      <select
                        value={selectedWebcamId}
                        onChange={(e) => {
                          setSelectedWebcamId(e.target.value);
                          startWebcamStream(e.target.value);
                        }}
                        className="w-full h-10 px-3 rounded-xl bg-[#1A1C24] border border-white/[0.08] text-xs text-white outline-none focus:border-white/30"
                      >
                        {cameras.map((c, i) => (
                          <option key={c.deviceId || i} value={c.deviceId}>
                            {c.label || `Kamera Video ${i + 1}`}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() => startWebcamStream()}
                        className="w-full h-9 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.1] text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Sambungkan Kamera</span>
                      </button>

                      <p className="text-[10px] text-neutral-400 leading-relaxed pt-1 border-t border-white/[0.04]">
                        Mendukung webcam laptop, USB webcam eksternal, dan HDMI capture card (Cam Link).
                      </p>
                    </div>
                  )}

                  {/* Sony / PC Remote Controls */}
                  {cameraMode !== 'webcam' && (
                    <div className="space-y-3 p-3.5 rounded-xl bg-[#14161C] border border-white/[0.06]">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white font-medium flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              cameraSessionState === 'READY' || cameraSessionState === 'CONNECTED'
                                ? 'bg-emerald-400 animate-pulse'
                                : cameraSessionState === 'CONNECTING' || cameraSessionState === 'DETECTING'
                                ? 'bg-amber-400 animate-spin'
                                : cameraSessionState === 'ERROR'
                                ? 'bg-rose-500'
                                : 'bg-neutral-500'
                            }`}
                          />
                          <span className="truncate max-w-[200px]">
                            {cameraSessionState === 'READY' || cameraSessionState === 'CONNECTED'
                              ? nativeCameraModel || 'Sony α7C II Connected'
                              : cameraSessionState === 'CONNECTING'
                              ? 'Menyiapkan Sony...'
                              : cameraSessionState === 'DETECTING'
                              ? 'Mendeteksi USB...'
                              : cameraSessionState === 'ERROR'
                              ? cameraSessionError || 'Error Kamera'
                              : 'Kamera Belum Terhubung'}
                          </span>
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={checkNativeCameraHardware}
                        disabled={isDetectingNative}
                        className="w-full h-10 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] text-xs font-semibold text-white flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isDetectingNative ? 'animate-spin' : ''}`} />
                        <span>{isDetectingNative ? 'Menghubungkan...' : 'Sambungkan Kamera'}</span>
                      </button>

                      {/* Hot Folder Info */}
                      <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2">
                        <div className="truncate min-w-0">
                          <span className="text-[10px] text-neutral-400 block">Hot Folder Shutter:</span>
                          <span className="text-[10px] text-neutral-300 font-mono truncate block" title={tetherDisplayPath}>
                            {tetherDisplayPath}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (typeof window !== 'undefined' && (window as any).electronAPI?.openFolder) {
                              (window as any).electronAPI.openFolder(tetherDisplayPath);
                            }
                          }}
                          className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-neutral-300 hover:text-white text-[10px] font-medium flex items-center gap-1 transition-colors flex-shrink-0 cursor-pointer"
                        >
                          <FolderOpen className="w-3 h-3" />
                          <span>Buka Folder</span>
                        </button>
                      </div>

                      {/* SOP Reminder */}
                      <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] text-neutral-300 space-y-1">
                        <div className="font-semibold text-amber-300 flex items-center gap-1 text-[11px]">
                          <AlertCircle className="w-3 h-3 text-amber-400 flex-shrink-0" />
                          <span>SOP Kamera Sony (WAJIB)</span>
                        </div>
                        <p>1. Format Foto: <strong className="text-white">JPEG Fine</strong> (Bukan RAW/ARW).</p>
                        <p>2. Shutter: <strong className="text-white">Silent Mode = OFF</strong>.</p>
                        <p>3. USB Mode: <strong className="text-white">PC Remote</strong>.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 4. FOTO (PHOTO) TAB */}
              {setupTab === 'photo' && (
                <div className="space-y-4 animate-fadeIn">
                  {/* Jumlah Pose */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                        Jumlah Pose
                      </span>
                      <span className="text-xs font-bold text-white bg-white/10 px-2.5 py-0.5 rounded-md border border-white/10 font-mono">
                        {shotsCount} Pose
                      </span>
                    </div>

                    {/* Presets Row */}
                    <div className="flex items-center gap-1.5">
                      {[1, 2, 3, 4, 6].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setShotsCount(num)}
                          className={`flex-1 h-11 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                            shotsCount === num
                              ? 'bg-white text-black shadow-sm font-bold'
                              : 'bg-[#14161C] border border-white/[0.06] text-neutral-300 hover:border-white/20'
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>

                    {/* Stepper + Manual Input */}
                    <div className="flex items-center justify-between p-2 rounded-xl bg-[#14161C] border border-white/[0.06]">
                      <span className="text-xs text-neutral-300">Kustom Pose:</span>
                      <div className="flex items-center bg-[#1A1C24] border border-white/[0.08] rounded-xl p-0.5 h-9">
                        <button
                          type="button"
                          onClick={() => setShotsCount((prev) => Math.max(1, prev - 1))}
                          className="w-7 h-full flex items-center justify-center text-neutral-300 hover:text-white hover:bg-white/10 rounded-lg text-sm font-bold transition-colors cursor-pointer"
                          title="Kurangi Pose"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={24}
                          value={shotsCount}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            if (!isNaN(val) && val >= 1) {
                              setShotsCount(Math.min(24, val));
                            }
                          }}
                          className="w-10 text-center bg-transparent text-white font-bold text-xs outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShotsCount((prev) => Math.min(24, prev + 1))}
                          className="w-7 h-full flex items-center justify-center text-neutral-300 hover:text-white hover:bg-white/10 rounded-lg text-sm font-bold transition-colors cursor-pointer"
                          title="Tambah Pose"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Timer Countdown */}
                  <div className="space-y-2.5 pt-2 border-t border-white/[0.08]">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                        Countdown Timer
                      </span>
                      <span className="text-xs font-mono text-neutral-400">
                        {countdownSeconds === 0 ? 'Mati' : `${countdownSeconds} Detik`}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {[0, 3, 5, 10].map((sec) => (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => setCountdownSeconds(sec)}
                          className={`flex-1 h-11 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                            countdownSeconds === sec
                              ? 'bg-white text-black shadow-sm font-bold'
                              : 'bg-[#14161C] border border-white/[0.06] text-neutral-300 hover:border-white/20'
                          }`}
                        >
                          {sec === 0 ? 'Off' : `${sec}s`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 5. STANDBY TAB */}
              {setupTab === 'standby' && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                      Wallpaper Standby (Screensaver)
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleStandbyWallpaper(!enableStandbyWallpaper)}
                      className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        enableStandbyWallpaper ? 'bg-white text-black shadow-sm' : 'bg-white/10 text-neutral-400 hover:text-white'
                      }`}
                    >
                      {enableStandbyWallpaper ? 'Aktif' : 'Mati'}
                    </button>
                  </div>

                  {enableStandbyWallpaper && (
                    <div className="space-y-3.5">
                      {/* Standby Timeout */}
                      <div className="space-y-2">
                        <span className="text-[11px] text-neutral-400">Durasi Timer Diam:</span>
                        <div className="flex items-center gap-1.5">
                          {[
                            { label: '30s', val: 0.5 },
                            { label: '1m', val: 1 },
                            { label: '2m', val: 2 },
                            { label: '5m', val: 5 },
                          ].map((item) => (
                            <button
                              key={item.label}
                              type="button"
                              onClick={() => handleUpdateStandbyTimeout(item.val)}
                              className={`flex-1 h-9 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                                standbyTimeoutMinutes === item.val
                                  ? 'bg-white text-black shadow-sm font-bold'
                                  : 'bg-[#14161C] border border-white/[0.06] text-neutral-300 hover:border-white/20'
                              }`}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Mode Tampilan */}
                      <div className="space-y-2">
                        <span className="text-[11px] text-neutral-400">Mode Tampilan:</span>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => handleUpdateWallpaperFitMode('cover')}
                            className={`h-9 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                              wallpaperFitMode === 'cover'
                                ? 'bg-white text-black shadow-sm font-bold'
                                : 'bg-[#14161C] border border-white/[0.06] text-neutral-300 hover:border-white/20'
                            }`}
                          >
                            Penuh (Crop)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateWallpaperFitMode('contain')}
                            className={`h-9 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                              wallpaperFitMode === 'contain'
                                ? 'bg-white text-black shadow-sm font-bold'
                                : 'bg-[#14161C] border border-white/[0.06] text-neutral-300 hover:border-white/20'
                            }`}
                          >
                            Utuh (Fit)
                          </button>
                        </div>
                      </div>

                      {/* Presets */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-neutral-400">Pilih Latar Belakang:</span>
                          <button
                            type="button"
                            onClick={() => setShowWallpaperSettingModal(true)}
                            className="text-[10px] text-neutral-400 hover:text-white underline cursor-pointer"
                          >
                            Atur Lengkap &rarr;
                          </button>
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                          {DEFAULT_WALLPAPERS.map((preset) => {
                            const isSelected = selectedWallpaperId === preset.id;
                            return (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() => handleSelectWallpaperPreset(preset.id)}
                                className={`relative rounded-xl overflow-hidden border text-left transition-all cursor-pointer ${
                                  isSelected
                                    ? 'border-white ring-1 ring-white shadow-md'
                                    : 'border-white/10 opacity-70 hover:opacity-100'
                                }`}
                                title={preset.name}
                              >
                                <div className="aspect-[16/10] w-full bg-black/40 overflow-hidden">
                                  <img
                                    src={preset.path}
                                    alt={preset.name}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                                <span className="text-[9px] font-medium text-neutral-300 block truncate p-1 bg-[#1A1C24] text-center">
                                  {preset.name.split(' ')[0]}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Bottom Panel Primary Action */}
            <div className="p-4 border-t border-white/[0.08] bg-[#0F1014] flex-shrink-0">
              <button
                onClick={() => {
                  if (events.length === 0 || !selectedEventId) {
                    showNotification('Silakan buat atau pilih acara terlebih dahulu sebelum memulai sesi photobooth.', 'warning');
                    setEventManagerInitialTab('create');
                    setShowEventManagerModal(true);
                    return;
                  }
                  handleResetKiosk();
                  setPhase('kiosk');
                }}
                className="w-full h-14 rounded-2xl bg-white hover:bg-neutral-200 text-black font-bold text-base flex items-center justify-center gap-2.5 transition-all shadow-lg active:scale-[0.99] cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Mulai Sesi Photobooth</span>
              </button>
            </div>
          </aside>
        </main>

        {renderWallpaperSettingModal()}

        <EventManagerModal
          isOpen={showEventManagerModal}
          onClose={() => setShowEventManagerModal(false)}
          events={events}
          selectedEventId={selectedEventId}
          onSelectEvent={(id) => setSelectedEventId(id)}
          onEventsUpdated={(updatedEvents, newSelectedId) => {
            setEvents(updatedEvents);
            if (newSelectedId && updatedEvents.some((e) => e.id === newSelectedId)) {
              setSelectedEventId(newSelectedId);
            } else {
              setSelectedEventId(updatedEvents[0]?.id || '');
            }
          }}
          initialTab={eventManagerInitialTab}
        />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2: GUEST KIOSK VIEW (100% FULLSCREEN EDGE-TO-EDGE PHOTOBOTH)
  // ═══════════════════════════════════════════════════════════════════════════
  if (phase === 'kiosk') {
    return (
      <div
        onClick={() => {
          if (showEventGalleryModal || showWallpaperSettingModal) return;
          if (isScreensaverActive) {
            setIsScreensaverActive(false);
            return;
          }
          if (retakeSlotIndex !== null) {
            if (sessionStep === 'idle') {
              triggerPoseShot(retakeSlotIndex);
            }
            return;
          }
          if (sessionStep === 'idle') {
            triggerPoseShot(0);
          } else if (sessionStep === 'paused_between_poses') {
            triggerPoseShot(currentShotIndex);
          }
        }}
        className={`relative h-screen w-screen bg-black overflow-hidden select-none touch-none font-sans flex flex-col ${
          sessionStep === 'idle' || sessionStep === 'paused_between_poses' ? 'cursor-pointer' : ''
        }`}
      >
        {renderDemoBanner()}

        {/* Shutter White Flash Screen */}
        {isFlashing && (
          <div className="absolute inset-0 z-50 bg-white pointer-events-none transition-opacity duration-150" />
        )}

        {/* ── 100% FULL SCREEN CAMERA FEED (EDGE-TO-EDGE 1 TAB) ── */}
        {cameraMode !== 'webcam' ? (
          tetherLiveFrame ? (
            <div className="relative w-full h-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={tetherLiveFrame}
                alt="Live View Studio"
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              />
            </div>
          ) : (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-0 bg-[#090A0C] flex flex-col items-center justify-center p-6 text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-neutral-300 mb-4 shadow-2xl">
                <Camera className="w-8 h-8 text-white stroke-[1.5]" />
              </div>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-mono uppercase tracking-wider text-neutral-400 bg-white/[0.04] border border-white/[0.08] mb-3">
                Mode Foto Studio (PC Remote)
              </span>
              <h2 className="text-xl font-bold text-white tracking-tight mb-2">
                {cameraSessionState === 'READY' || cameraSessionState === 'CONNECTED'
                  ? nativeCameraModel || 'Kamera Studio Shutter Siap'
                  : cameraSessionState === 'CONNECTING'
                  ? 'Menghubungkan ke Kamera via PC Remote...'
                  : cameraSessionState === 'DETECTING'
                  ? 'Memindai Port USB...'
                  : cameraSessionState === 'ERROR'
                  ? 'Kamera Belum Terhubung'
                  : 'Kamera Belum Terhubung'}
              </h2>
              {cameraSessionState === 'ERROR' && cameraSessionError ? (
                <p className="text-xs text-rose-300 max-w-md mb-6 leading-relaxed bg-rose-500/10 px-3.5 py-2.5 rounded-xl border border-rose-500/20">
                  {cameraSessionError}
                </p>
              ) : (
                <p className="text-xs text-neutral-400 max-w-md mb-6 leading-relaxed">
                  Sambungkan kamera Sony melalui PC Remote. Atur kamera di mode <span className="text-neutral-200 font-medium">FOTO (M) ➔ USB Connection: PC Remote</span>.
                </p>
              )}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={checkNativeCameraHardware}
                  disabled={isDetectingNative}
                  className="px-6 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] hover:border-white/20 text-white font-medium text-xs flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 active:scale-[0.98]"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isDetectingNative ? 'animate-spin' : ''}`} />
                  <span>{isDetectingNative ? 'Menghubungkan...' : 'Sambungkan Kamera PC Remote'}</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSwitchCameraMode('webcam');
                  }}
                  className="px-5 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-neutral-300 hover:text-white font-medium text-xs flex items-center gap-2 transition-all cursor-pointer"
                >
                  <Video className="w-3.5 h-3.5 text-neutral-300" />
                  <span>Beralih ke Live View Streaming</span>
                </button>
              </div>
            </div>
          )
        ) : (
          <video
            ref={attachVideoRef}
            autoPlay
            playsInline
            muted
            onLoadedMetadata={(e) => {
              const v = e.target as HTMLVideoElement;
              v.play().catch(() => {});
            }}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none transform -scale-x-100"
          />
        )}

        {/* Camera Starting Up Indicator */}
        {cameraMode === 'webcam' && isCameraLoading && !cameraStream && (
          <div className="absolute inset-0 z-35 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center text-white gap-3 select-none pointer-events-none">
            <RefreshCw className="w-8 h-8 animate-spin text-white" />
            <span className="text-xs font-semibold tracking-wide">Menyalakan Kamera...</span>
          </div>
        )}

        {/* Camera Inactive / Error Overlay */}
        {cameraMode === 'webcam' && !isCameraLoading && (!cameraStream || cameraError) && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 z-40 bg-neutral-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center select-none"
          >
            <div className="w-16 h-16 rounded-2xl bg-white/[0.06] border border-white/[0.1] flex items-center justify-center text-neutral-300 mb-4">
              <CameraOff className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Kamera Belum Terhubung</h2>
            <p className="text-xs sm:text-sm text-neutral-400 max-w-md mb-6 leading-relaxed">
              {cameraError || 'Pastikan webcam laptop tidak sedang digunakan oleh aplikasi lain.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  startWebcamStream();
                }}
                className="h-11 px-6 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-xs flex items-center gap-2 shadow-lg transition-all active:scale-95 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Hubungkan Ulang Kamera</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleResetKiosk();
                  setPhase('setup');
                }}
                className="h-11 px-5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white font-semibold text-xs transition-colors cursor-pointer"
              >
                Kembali ke Pengaturan
              </button>
            </div>
          </div>
        )}

        {/* Subtle Event Watermark (Floating Elegantly in Top-Center) */}
        <div className="absolute top-6 inset-x-0 z-20 flex flex-col items-center justify-center pointer-events-none text-center">
          <span className="text-base font-semibold tracking-wider text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]">
            {currentEvent?.hostNames || currentEvent?.name || 'Photobooth'}
          </span>
          <span className="text-xs font-medium text-white/75 drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]">
            {currentEvent?.date || 'Photobooth Edition'}
          </span>
        </div>

        {/* Top-Left: PIP Pose Thumbnails or Targeted Retake Indicator */}
        {retakeSlotIndex !== null ? (
          <div className="absolute top-6 left-6 z-30 flex items-center gap-3 bg-black/75 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/20 shadow-2xl pointer-events-none animate-fadeIn">
            {capturedPhotos[retakeSlotIndex] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={capturedPhotos[retakeSlotIndex]}
                alt={`Foto Lama Pose ${retakeSlotIndex + 1}`}
                className="w-10 h-14 rounded-lg object-cover border border-white/30"
              />
            )}
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-1">
                <RotateCcw className="w-3 h-3 text-neutral-300" /> Target Ambil Ulang
              </span>
              <span className="text-xs font-semibold text-white">
                Pose {retakeSlotIndex + 1}
              </span>
            </div>
          </div>
        ) : capturedPhotos.length > 0 && sessionStep !== 'countdown' ? (
          <div className="absolute top-6 left-6 z-30 flex flex-col gap-2 pointer-events-none animate-fadeIn">
            {capturedPhotos.map((photo, pIdx) => (
              <div
                key={pIdx}
                className="w-20 h-24 sm:w-24 sm:h-28 rounded-xl overflow-hidden border-2 border-white/80 shadow-[0_8px_24px_rgba(0,0,0,0.7)] bg-black relative"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo} alt={`Pose ${pIdx + 1}`} className="w-full h-full object-cover" />
                <div className="absolute bottom-0 inset-x-0 py-0.5 bg-black/70 text-center text-[9px] font-bold text-white uppercase tracking-wider">
                  Pose {pIdx + 1}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/* Top-Right: Quick Controls (Standby Wallpaper, Galeri Foto & Pengaturan) */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute top-6 right-6 z-40 pointer-events-auto flex items-center gap-2.5"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowWallpaperSettingModal(true);
            }}
            className="h-10 px-3.5 rounded-full bg-black/60 hover:bg-black/85 backdrop-blur-md border border-white/20 hover:border-white/40 flex items-center gap-1.5 text-white/90 hover:text-white text-xs font-semibold shadow-2xl active:scale-95 transition-all cursor-pointer"
            title="Pengaturan Timer & Wallpaper Standby"
          >
            <Clock className="w-4 h-4 text-neutral-300" />
            <span className="hidden sm:inline">Standby:</span>
            <span className="font-mono">
              {enableStandbyWallpaper
                ? standbyTimeoutMinutes < 1
                  ? `${Math.round(standbyTimeoutMinutes * 60)}s`
                  : `${standbyTimeoutMinutes}m`
                : 'Mati'}
            </span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openEventGallery();
            }}
            className="h-10 px-4 rounded-full bg-black/60 hover:bg-black/85 backdrop-blur-md border border-white/20 hover:border-white/40 flex items-center gap-2 text-white/95 hover:text-white text-xs font-semibold shadow-2xl active:scale-95 transition-all cursor-pointer group"
            title="Lihat Galeri Foto Acara"
          >
            <Images className="w-4 h-4 text-neutral-300 group-hover:scale-110 transition-transform" />
            <span>Galeri Foto</span>
            {eventGalleryPhotos.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-white/15 border border-white/25 text-[10px] text-white font-mono font-bold leading-none">
                {eventGalleryPhotos.length}
              </span>
            )}
          </button>

          {retakeSlotIndex !== null ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleCancelRetake();
              }}
              className="h-10 px-4 rounded-full bg-black/60 hover:bg-black/85 backdrop-blur-md border border-white/20 flex items-center gap-2 text-white/90 hover:text-white text-xs font-semibold shadow-2xl active:scale-95 transition-all hover:border-white/40 cursor-pointer"
              title="Batalkan ambil ulang dan kembali ke hasil foto (ESC)"
            >
              <X className="w-4 h-4 text-white" />
              <span>Batal Ambil Ulang</span>
              <span className="hidden sm:inline px-1.5 py-0.5 rounded bg-white/15 text-[10px] text-neutral-300 font-mono">
                ESC
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleResetKiosk();
                setPhase('setup');
              }}
              className="h-10 px-4 rounded-full bg-black/60 hover:bg-black/85 backdrop-blur-md border border-white/20 flex items-center gap-2 text-white/90 hover:text-white text-xs font-semibold shadow-2xl active:scale-95 transition-all hover:border-white/40 cursor-pointer"
              title="Kembali ke Layar Pengaturan (ESC)"
            >
              <ChevronLeft className="w-4 h-4 text-white" />
              <span>Pengaturan</span>
              <span className="hidden sm:inline px-1.5 py-0.5 rounded bg-white/15 text-[10px] text-neutral-300 font-mono">
                ESC
              </span>
            </button>
          )}
        </div>

        {/* Countdown Overlay HUD */}
        {sessionStep === 'countdown' && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/25 pointer-events-none">
            <span className="text-[140px] font-bold text-white drop-shadow-[0_10px_35px_rgba(0,0,0,0.95)] animate-pulse leading-none">
              {countdownRemaining}
            </span>
            <span className="text-xs font-bold tracking-widest uppercase text-white drop-shadow-md bg-black/70 px-5 py-2 rounded-full mt-4">
              {retakeSlotIndex !== null
                ? `Senyum untuk Pose ${retakeSlotIndex + 1}!`
                : `Senyum untuk Pose ${currentShotIndex + 1}!`}
            </span>
          </div>
        )}

        {/* Processing HUD */}
        {sessionStep === 'processing' && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md pointer-events-none">
            <RefreshCw className="w-10 h-10 text-white animate-spin mb-4" />
            <span className="text-base font-semibold text-white tracking-wide">
              {shotsCount > 1 ? 'Menyiapkan Foto & Animasi GIF...' : 'Memasang Foto ke Bingkai...'}
            </span>
          </div>
        )}

        {/* Bottom Shutter Controls */}
        {sessionStep === 'idle' && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-10 inset-x-0 z-20 flex flex-col items-center justify-center pointer-events-auto animate-fadeIn gap-2.5"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (retakeSlotIndex !== null) {
                  triggerPoseShot(retakeSlotIndex);
                } else {
                  triggerPoseShot(0);
                }
              }}
              className="px-9 py-4 rounded-full bg-white text-black font-bold text-sm tracking-wider uppercase flex items-center gap-3 shadow-[0_10px_35px_rgba(0,0,0,0.6)] active:scale-95 transition-all hover:bg-neutral-200 cursor-pointer"
            >
              <Camera className="w-5 h-5 fill-black" />
              <span>
                {retakeSlotIndex !== null
                  ? `AMBIL FOTO UNTUK POSE ${retakeSlotIndex + 1}`
                  : 'SENTUH LAYAR ATAU TEKAN SPACE UNTUK MEMOTRET'}
              </span>
            </button>
            {retakeSlotIndex !== null ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCancelRetake();
                }}
                className="text-xs text-neutral-300 hover:text-white flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 transition-colors shadow-md cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Batal & Kembali ke Hasil</span>
              </button>
            ) : (
              <span className="text-[11px] font-medium text-white/90 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                Total {shotsCount} Pose bergantian santai
              </span>
            )}
          </div>
        )}

        {sessionStep === 'paused_between_poses' && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-10 inset-x-4 z-20 flex flex-col items-center justify-center pointer-events-auto gap-3 animate-fadeIn"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                triggerPoseShot(currentShotIndex);
              }}
              className="px-9 py-4 rounded-full bg-white text-black font-bold text-sm tracking-wider uppercase flex items-center gap-3 shadow-[0_10px_35px_rgba(0,0,0,0.6)] active:scale-95 transition-all hover:bg-neutral-200 animate-pulse cursor-pointer"
            >
              <Camera className="w-5 h-5 fill-black" />
              <span>SENTUH UNTUK FOTO {currentShotIndex + 1}</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRetakePreviousPose();
              }}
              className="text-xs text-white/90 hover:text-white flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-black/50 backdrop-blur-md border border-white/20 transition-colors shadow-md cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Ulangi Pose {currentShotIndex}</span>
            </button>
          </div>
        )}

        {/* ── FULLSCREEN STANDBY WALLPAPER SCREENSAVER ── */}
        {isScreensaverActive && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              setIsScreensaverActive(false);
            }}
            className="absolute inset-0 z-50 bg-black animate-fadeIn cursor-pointer select-none overflow-hidden"
          >
            {/* Background Image / Animation: Cover vs Contain with Ambient Blur */}
            {wallpaperFitMode === 'contain' ? (
              <>
                {/* Ambient Blurred Backdrop */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getActiveWallpaperUrl()}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 w-full h-full object-cover blur-3xl scale-115 opacity-40 brightness-75 select-none pointer-events-none"
                />
                {/* Centered Uncropped Main Image */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getActiveWallpaperUrl()}
                  alt="Standby Wallpaper"
                  className="relative z-10 w-full h-full object-contain drop-shadow-2xl select-none pointer-events-none"
                />
              </>
            ) : (
              // Fullscreen Edge-to-Edge Cover
              <img
                src={getActiveWallpaperUrl()}
                alt="Standby Wallpaper"
                className="w-full h-full object-cover select-none pointer-events-none"
              />
            )}

            {/* Dark Vignette Overlay for Readability */}
            <div className="absolute inset-0 z-20 bg-gradient-to-t from-black/85 via-black/25 to-black/60 pointer-events-none" />

            {/* Top Bar: Clock, Date, & Quick Settings */}
            <div className="absolute top-8 inset-x-8 z-30 flex items-start justify-between">
              <div>
                <div className="text-5xl sm:text-7xl font-extralight tracking-tight text-white drop-shadow-lg font-sans">
                  {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="text-sm sm:text-base font-medium text-white/90 mt-1 drop-shadow-md">
                  {new Date().toLocaleDateString('id-ID', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowWallpaperSettingModal(true);
                }}
                className="h-10 px-4 rounded-full bg-black/50 hover:bg-black/80 backdrop-blur-md border border-white/25 hover:border-white/50 text-white text-xs font-semibold flex items-center gap-2 shadow-2xl transition-all cursor-pointer active:scale-95"
                title="Buka Pengaturan Wallpaper & Timer"
              >
                <Settings className="w-4 h-4 text-white" />
                <span>Pengaturan</span>
              </button>
            </div>

            {/* Bottom: Event Branding & Touch to Start Prompt */}
            <div className="absolute inset-x-6 bottom-16 z-30 flex flex-col items-center justify-center text-center gap-4 pointer-events-none">
              <div className="flex flex-col items-center gap-1 drop-shadow-md">
                <span className="text-xs sm:text-sm font-semibold tracking-widest uppercase text-white/80">
                  {currentEvent?.name || 'MingleBooth Studio'}
                </span>
                {currentEvent?.hostNames && (
                  <span className="text-sm sm:text-base font-medium text-white">
                    {currentEvent.hostNames}
                  </span>
                )}
              </div>

              <div className="px-8 py-4 rounded-full bg-white hover:bg-neutral-200 text-black font-bold text-sm sm:text-base flex items-center gap-3 shadow-2xl animate-pulse tracking-wide pointer-events-auto transition-all cursor-pointer active:scale-95">
                <Camera className="w-5 h-5 fill-black" />
                <span>SENTUH LAYAR UNTUK MEMULAI PHOTOBOOTH</span>
              </div>

              <p className="text-xs text-white/70 font-medium drop-shadow">
                Sentuh layar di mana saja untuk menyalakan kamera
              </p>
            </div>
          </div>
        )}

        {renderWallpaperSettingModal()}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 3: REVIEW, PRINT & QR VIEW (MINIMAL PRO STUDIO)
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="h-screen w-screen bg-[#090A0C] text-[#EDEDED] flex flex-col font-sans select-none overflow-hidden antialiased">
      {renderDemoBanner()}
      {/* Top Header Bar */}
      <header className="h-16 px-6 sm:px-10 border-b border-white/[0.08] bg-[#0F1014] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <img
            src={logoHeader}
            alt="MingleBooth"
            className="h-7 sm:h-8 w-auto object-contain"
          />
          <div className="h-4 w-[1px] bg-white/10 hidden sm:block" />
          <span className="text-xs font-medium text-neutral-400 hidden sm:inline">
            Foto Berhasil Diambil
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              handleResetKiosk();
              setPhase('setup');
            }}
            className="h-9 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-neutral-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
            title="Kembali ke Layar Pengaturan (ESC)"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Pengaturan</span>
          </button>

          <button
            onClick={openEventGallery}
            className="h-9 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-neutral-200 flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Images className="w-3.5 h-3.5 text-neutral-300" />
            <span>Galeri Acara</span>
          </button>

          <span className="text-xs text-neutral-400 font-mono hidden sm:inline px-2">
            Reset dalam {reviewCountdown}s
          </span>

          <button
            onClick={() => {
              handleResetKiosk();
              setPhase('kiosk');
            }}
            className="h-9 px-5 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-xs transition-all shadow-md active:scale-98 cursor-pointer"
          >
            Foto Tamu Berikutnya
          </button>
        </div>
      </header>

      {/* Main Review Body: Split Canvas */}
      <main className="flex-1 w-full max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-center gap-8 px-6 py-6 min-h-0 overflow-hidden">
        {/* Left Side: Photo Frame & GIF Boomerang & Raw Photo Toggle */}
        <div className="flex-1 h-full max-h-[75vh] flex flex-col items-center justify-center min-w-0 gap-3">
          {/* Result Mode Switcher: Foto Cetak | Animasi GIF | Foto Original */}
          <div className="flex items-center p-1 rounded-xl bg-white/[0.06] border border-white/[0.08] gap-1">
            <button
              onClick={() => setResultTab('photo')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                resultTab === 'photo' ? 'bg-white text-black shadow-sm' : 'text-neutral-400 hover:text-white'
              }`}
            >
              Foto Cetak
            </button>
            {finalGifDataUrl && (
              <button
                onClick={() => setResultTab('gif')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  resultTab === 'gif' ? 'bg-white text-black shadow-sm' : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Film className="w-3.5 h-3.5" />
                <span>Animasi GIF</span>
              </button>
            )}
            {capturedPhotos.length > 0 && (
              <button
                onClick={() => setResultTab('original')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  resultTab === 'original' ? 'bg-white text-black shadow-sm' : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Foto Original</span>
              </button>
            )}
          </div>

          {/* Sub-selector for raw poses if original tab is selected */}
          {resultTab === 'original' && capturedPhotos.length >= 1 && (
            <div className="flex items-center gap-1.5 bg-white/[0.04] p-1 rounded-xl border border-white/[0.06] overflow-x-auto max-w-full">
              {capturedPhotos.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setReviewRawIndex(idx)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                    reviewRawIndex === idx
                      ? 'bg-white text-black font-semibold shadow-sm'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Pose {idx + 1}
                </button>
              ))}
            </div>
          )}

          <div
            style={{
              aspectRatio: resultTab === 'photo' ? `${frameDimensions.width} / ${frameDimensions.height}` : undefined,
            }}
            className="relative h-full max-h-[66vh] max-w-full rounded-2xl bg-black border border-white/[0.1] overflow-hidden shadow-2xl flex items-center justify-center p-1 transition-all duration-300"
          >
            {resultTab === 'photo' ? (
              finalPhotoDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={finalPhotoDataUrl} alt="Hasil Foto" className="w-full h-full object-contain rounded-xl" />
              )
            ) : resultTab === 'gif' ? (
              finalGifDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={finalGifDataUrl} alt="Hasil GIF" className="w-full h-full object-contain rounded-xl" />
              )
            ) : (
              capturedPhotos[reviewRawIndex] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={capturedPhotos[reviewRawIndex]}
                  alt={`Foto Original Pose ${reviewRawIndex + 1}`}
                  className="w-full h-full object-contain rounded-xl"
                />
              )
            )}

            {/* Visual Demo Watermark Overlay */}
            {isDemoMode && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="rotate-[-25deg] border-2 border-amber-400/40 bg-black/60 backdrop-blur-[2px] px-6 py-2 rounded-xl text-amber-300/80 font-black tracking-widest text-xs uppercase shadow-2xl select-none">
                  MINGLEBOOTH DEMO • CETAK TERKUNCI
                </div>
              </div>
            )}
          </div>

          {/* Targeted Retake Button for selected pose */}
          {resultTab === 'original' && capturedPhotos[reviewRawIndex] && (
            <button
              type="button"
              onClick={() => handleStartRetake(reviewRawIndex)}
              className="px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] hover:border-white/20 text-white font-medium text-xs flex items-center gap-2 transition-all cursor-pointer active:scale-98 shadow-md"
            >
              <RotateCcw className="w-3.5 h-3.5 text-neutral-300" />
              <span>Ulangi Foto</span>
            </button>
          )}
        </div>

        {/* Right Side: QR Code Card & Print Trigger */}
        <div className="w-full md:w-[360px] flex flex-col items-center justify-center gap-5 p-6 rounded-3xl bg-[#121316] border border-white/[0.08] shadow-2xl flex-shrink-0">
          {/* QR Code Container */}
          <div className="p-3 bg-white rounded-2xl shadow-md">
            {qrCodeDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrCodeDataUrl} alt="Scan QR Code" className="w-48 h-48 sm:w-56 sm:h-56 object-contain" />
            ) : (
              <div className="w-48 h-48 bg-neutral-200 flex items-center justify-center text-xs text-black">
                Memuat QR...
              </div>
            )}
          </div>

          <div className="text-center">
            <h3 className="text-sm font-semibold text-white">Scan QR untuk Unduh Foto</h3>
            <p className="text-xs text-neutral-400 mt-1">
              Arahkan kamera smartphone untuk menyimpan foto &amp; animasi langsung ke HP.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="w-full space-y-2 pt-1">
            <button
              onClick={handlePrintPhoto}
              className={`w-full h-11 rounded-xl font-bold text-xs tracking-wider uppercase flex items-center justify-center gap-2 shadow-lg transition-all ${
                isDemoMode
                  ? 'bg-neutral-800 text-neutral-400 border border-white/[0.08] hover:bg-neutral-700 active:scale-98'
                  : 'bg-white hover:bg-neutral-200 text-black active:scale-98'
              }`}
              title={isDemoMode ? 'Fitur Cetak Foto tersedia setelah langganan aktif.' : 'Cetak Foto Langsung'}
            >
              <Printer className={`w-4 h-4 ${isDemoMode ? 'text-amber-400' : 'text-black'}`} />
              <span>{isDemoMode ? 'Cetak Terkunci (Demo)' : 'Cetak Foto Langsung'}</span>
            </button>

            <button
              onClick={() => {
                handleResetKiosk();
                setPhase('kiosk');
              }}
              className="w-full h-10 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>Foto Tamu Berikutnya</span>
            </button>
          </div>
        </div>
      </main>

      {/* Hidden Print Mount */}
      {printImageUrl && (
        <div id="minglebooth-print-mount">
          <style>{`
            @media print {
              @page { size: auto; margin: 0mm !important; }
              html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
              body > * { display: none !important; }
              #minglebooth-print-mount { display: flex !important; position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important; align-items: center !important; justify-content: center !important; }
              #minglebooth-print-mount img { max-width: 100% !important; max-height: 100% !important; object-fit: contain !important; }
            }
          `}</style>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={printImageUrl} alt="Print Preview" />
        </div>
      )}

      {/* In-app Non-blocking Touch-friendly Toast Notification Banner */}
      {toastNotice && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[99999] max-w-lg w-[calc(100%-3rem)] pointer-events-auto animate-fadeIn select-none">
          <div
            className={`p-4 rounded-2xl border shadow-2xl backdrop-blur-xl flex items-start gap-3.5 transition-all ${
              toastNotice.type === 'error'
                ? 'bg-[#1a0f12]/95 border-rose-500/30 text-rose-200 shadow-rose-950/40'
                : toastNotice.type === 'warning'
                ? 'bg-[#1c1608]/95 border-amber-500/30 text-amber-200 shadow-amber-950/40'
                : toastNotice.type === 'success'
                ? 'bg-[#0b1c14]/95 border-emerald-500/30 text-emerald-200 shadow-emerald-950/40'
                : 'bg-[#121316]/95 border-white/15 text-neutral-200 shadow-black/60'
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {toastNotice.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-400" />}
              {toastNotice.type === 'warning' && <AlertCircle className="w-5 h-5 text-amber-400" />}
              {toastNotice.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
              {toastNotice.type === 'info' && <Info className="w-5 h-5 text-blue-400" />}
            </div>
            <div className="flex-1 min-w-0 pr-2">
              {toastNotice.title && (
                <h4 className="text-xs font-bold uppercase tracking-wider mb-1 text-white">
                  {toastNotice.title}
                </h4>
              )}
              <p className="text-xs font-medium leading-relaxed break-words whitespace-pre-line">
                {toastNotice.message}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setToastNotice(null)}
              className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
              title="Tutup pemberitahuan"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class StudioErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Studio render error caught by boundary:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-[#0A0B0E] text-white flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="max-w-md w-full p-6 rounded-3xl bg-[#14161C] border border-white/10 space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mx-auto flex items-center justify-center text-xl font-bold">
              !
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Sistem Mengalami Kendala</h3>
              <p className="text-xs text-neutral-400 mt-1">
                Terjadi kesalahan tampilan sementara: {this.state.error?.message || 'Error tak terduga'}.
              </p>
            </div>
            <button
              onClick={this.handleReset}
              className="w-full py-3 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-xs transition-colors cursor-pointer"
            >
              Muat Ulang Studio Photobooth
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const App: React.FC = () => {
  const [showCameraQA, setShowCameraQA] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.location.hash === '#qa' || window.location.search.includes('qa');
    }
    return false;
  });
  const [isDemoMode, setIsDemoMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('mb_is_demo') === 'true';
    }
    return false;
  });

  useEffect(() => {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.qa?.isQaMode) {
      electronAPI.qa.isQaMode().then((isQa: boolean) => {
        if (isQa) setShowCameraQA(true);
      });
    }
    const handleHashChange = () => {
      if (window.location.hash === '#qa') setShowCameraQA(true);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (showCameraQA) {
    return (
      <CameraQAPanel
        onClose={() => {
          setShowCameraQA(false);
          if (typeof window !== 'undefined' && window.location.hash === '#qa') {
            window.history.replaceState(null, '', window.location.pathname);
          }
        }}
      />
    );
  }

  return (
    <StudioErrorBoundary>
      <VendorAuthGate
        onOpenQA={() => setShowCameraQA(true)}
        onAuthSuccess={(demoState) => setIsDemoMode(demoState)}
      >
        <TabletStudioContent
          onOpenQA={() => setShowCameraQA(true)}
          isDemoMode={isDemoMode}
          onEndDemo={() => {
            localStorage.removeItem('mb_license_token');
            localStorage.removeItem('mb_is_demo');
            setIsDemoMode(false);
          }}
        />
      </VendorAuthGate>
    </StudioErrorBoundary>
  );
};
