import React, { useState, useEffect, useRef, useCallback } from 'react';
import QRCode from 'qrcode';
import {
  Camera,
  Video,
  Play,
  Settings,
  X,
  Check,
  Download,
  Share2,
  Maximize2,
  Minimize2,
  Clock,
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
  Sparkles,
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
} from 'lucide-react';
import { FrameHoleDetector, DetectedCutout } from '@minglebooth/template-engine';
import { GifComposer } from '@minglebooth/gif-engine';
import {
  saveOfflineCapture,
  getOfflineCaptures,
  deleteOfflineCapture,
  OfflineCaptureItem,
} from './lib/offlineStorage';
import { VendorAuthGate } from './components/VendorAuthGate';
import { API_BASE_URL } from './config';
import logoHeader from './assets/logo-minglebooth-header.png';
import appIcon from './assets/icon.png';

interface DiscoveredCamera {
  deviceId: string;
  label: string;
  type: 'webcam' | 'sony_tether';
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

const TabletStudioContent: React.FC = () => {
  // Phase: 'setup' | 'kiosk' | 'review' | 'gallery'
  const [phase, setPhase] = useState<'setup' | 'kiosk' | 'review' | 'gallery'>('setup');
  const [previousPhase, setPreviousPhase] = useState<'setup' | 'kiosk' | 'review'>('setup');

  // Camera State
  const [cameraMode, setCameraMode] = useState<'webcam' | 'sony'>('webcam');
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedWebcamId, setSelectedWebcamId] = useState<string>('');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Sony / DSLR Tether Server State (Local Port 4848)
  const [tetherUrl, setTetherUrl] = useState<string>('http://localhost:4848');
  const [tetherStatus, setTetherStatus] = useState<'checking' | 'connected' | 'disconnected'>('disconnected');
  const [tetherLiveFrame, setTetherLiveFrame] = useState<string | null>(null);

  // Events & Templates
  const [events, setEvents] = useState<EventItem[]>([
    {
      id: 'default_event',
      name: 'Pesta Pernikahan (Default Event)',
      hostNames: 'Bayu & Irma',
      date: new Date().toLocaleDateString('id-ID'),
    },
  ]);
  const [selectedEventId, setSelectedEventId] = useState<string>('default_event');
  const currentEvent = events.find((e) => e.id === selectedEventId) || events[0];

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
  const [isScreensaverActive, setIsScreensaverActive] = useState<boolean>(false);
  const [showWallpaperSettingModal, setShowWallpaperSettingModal] = useState<boolean>(false);


  // ── 1. HARDWARE DISCOVERY & WEBCAM INITIALIZATION (UNIVERSAL & ERROR-FREE) ──
  const enumerateCameras = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === 'videoinput');
      setCameras(videoInputs);

      if (videoInputs.length > 0 && !selectedWebcamId) {
        setSelectedWebcamId(videoInputs[0].deviceId);
      }
    } catch (err) {
      console.warn('enumerateDevices error:', err);
    }
  }, [selectedWebcamId]);

  const startWebcamStream = useCallback(async (deviceId?: string) => {
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
      let msg = 'Kamera laptop tidak dapat diakses.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Izin kamera belum aktif. Buka Pengaturan Mac > Privasi & Keamanan > Kamera, lalu centang MingleBooth Studio.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        msg = 'Kamera sedang dipakai oleh aplikasi lain (FaceTime, Zoom, atau Photo Booth). Silakan tutup aplikasi tersebut lalu klik Sambungkan Ulang.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'Tidak ada perangkat kamera yang terdeteksi di laptop ini.';
      } else {
        msg = `Kamera belum terhubung (${err.name || err.message}). Pastikan kamera laptop tidak terkunci.`;
      }
      setCameraError(msg);
    } finally {
      setIsCameraLoading(false);
    }
  }, [selectedWebcamId, enumerateCameras]);

  // Video Ref attachment callbacks that guarantee immediate playback when DOM mounts
  const attachVideoRef = useCallback(
    (el: HTMLVideoElement | null) => {
      videoRef.current = el;
      if (el) {
        el.muted = true;
        el.defaultMuted = true;
        el.playsInline = true;
        if (cameraStream) {
          if (el.srcObject !== cameraStream) {
            el.srcObject = cameraStream;
          }
          el.play().catch(() => {});
        } else if (cameraMode === 'webcam' && !isCameraLoading) {
          startWebcamStream();
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
        if (cameraStream) {
          if (el.srcObject !== cameraStream) {
            el.srcObject = cameraStream;
          }
          el.play().catch(() => {});
        } else if (cameraMode === 'webcam' && !isCameraLoading) {
          startWebcamStream();
        }
      }
    },
    [cameraStream, cameraMode, isCameraLoading, startWebcamStream]
  );

  // Sync active stream across phase transitions
  useEffect(() => {
    if (cameraStream) {
      if (videoRef.current && videoRef.current.srcObject !== cameraStream) {
        videoRef.current.srcObject = cameraStream;
        videoRef.current.play().catch(() => {});
      }
      if (previewVideoRef.current && previewVideoRef.current.srcObject !== cameraStream) {
        previewVideoRef.current.srcObject = cameraStream;
        previewVideoRef.current.play().catch(() => {});
      }
    }
  }, [phase, cameraStream]);

  // Initial mount: start camera
  useEffect(() => {
    if (cameraMode === 'webcam') {
      startWebcamStream();
    }
  }, []);

  // Monitor Sony Tether server if selected
  useEffect(() => {
    if (cameraMode !== 'sony') return;

    let isMounted = true;
    const checkTether = async () => {
      try {
        const res = await fetch(`${tetherUrl}/api/tether/status`);
        const data = await res.json();
        if (isMounted) {
          setTetherStatus(data.success ? 'connected' : 'disconnected');
        }
      } catch {
        if (isMounted) setTetherStatus('disconnected');
      }
    };

    checkTether();
    const interval = setInterval(checkTether, 2000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [cameraMode, tetherUrl]);

  // Sony Live View Polling
  useEffect(() => {
    if (cameraMode !== 'sony' || tetherStatus !== 'connected') return;

    let isMounted = true;
    let timer: any = null;

    const pollFrame = async () => {
      try {
        const res = await fetch(`${tetherUrl}/api/tether/liveview`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.liveFrame && isMounted) {
            setTetherLiveFrame(data.liveFrame);
          }
        }
      } catch {}
      if (isMounted) {
        timer = setTimeout(pollFrame, 90);
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
        if (Array.isArray(evData.events) && evData.events.length > 0) {
          const mappedEvents = evData.events.map((e: any) => ({
            id: e.id,
            name: e.name,
            hostNames: e.branding?.hostNames || e.branding?.eventName || e.name,
            date: e.date,
          }));
          setEvents(mappedEvents);
          setSelectedEventId(mappedEvents[0].id);
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
            eventName: currentEvent.name,
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
  }, [selectedEventId, currentEvent.name]);

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
          alert(`Folder penyimpanan foto berhasil diatur ke:\n${res.selectedPath}`);
        }
      } else {
        alert('Fitur pemilihan folder aktif di aplikasi desktop MingleBooth.');
      }
    } catch (e: any) {
      alert(`Gagal memilih folder: ${e?.message || e}`);
    }
  };

  // Handle open storage folder directly in Finder / File Explorer
  const handleOpenEventStorageFolder = async () => {
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.openEventFolder) {
        const res = await (window as any).electronAPI.openEventFolder({
          eventName: currentEvent.name,
          customBasePath: customStorageDir || undefined,
        });
        if (res && !res.success && res.error) {
          alert(`Gagal membuka folder: ${res.error}`);
        }
      } else {
        alert('Fitur buka folder penyimpanan lokal aktif di aplikasi desktop MingleBooth.');
      }
    } catch (e: any) {
      alert(`Gagal membuka folder: ${e?.message || e}`);
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

  // Camera Mode Switcher
  const handleSwitchCameraMode = (mode: 'webcam' | 'sony') => {
    setCameraMode(mode);
    setCameraError(null);
    if (mode === 'webcam') {
      startWebcamStream();
    } else {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (cameraStream) {
        cameraStream.getTracks().forEach((t) => t.stop());
        setCameraStream(null);
      }
    }
  };

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
        executeShot(shotIdx);
      }
    }, 1000);
  };

  const executeShot = async (shotIdx: number) => {
    setIsFlashing(true);
    playShutterSound();

    let frameData: string | null = null;

    if (cameraMode === 'sony') {
      try {
        const res = await fetch(`${tetherUrl}/api/tether/trigger`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timeoutMs: 7000, mockFallback: true }),
        });
        const data = await res.json();
        if (data.success && data.photoDataUrl) {
          frameData = data.photoDataUrl;
        }
      } catch {}

      if (!frameData && tetherLiveFrame) {
        frameData = tetherLiveFrame;
      }
    } else {
      frameData = grabVideoFrame();
    }

    setTimeout(() => {
      setIsFlashing(false);

      if (!frameData) {
        alert('Gagal mengambil foto dari kamera. Pastikan kamera menyala dan terhubung dengan baik.');
        setSessionStep('idle');
        return;
      }

      const nextPhotos = [...capturedPhotos];
      nextPhotos[shotIdx] = frameData;
      setCapturedPhotos(nextPhotos);

      const nextIdx = shotIdx + 1;
      if (nextIdx < shotsCount) {
        setCurrentShotIndex(nextIdx);
        setSessionStep('paused_between_poses');
      } else {
        setSessionStep('processing');
        composeFinalPhoto(nextPhotos);
      }
    }, 180);
  };

  // ── 5. COMPOSE FINAL PHOTO & GIF BOOMERANG ──
  const composeFinalPhoto = async (photos: string[]) => {
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
        await new Promise((res) => { img.onload = res; });

        // Center-crop into cutout
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

      // Unique Photo ID
      const photoId = `MB_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const galleryUrl = `https://www.minglebooth.id/gallery/${selectedEventId}?p=${photoId}`;
      setGuestGalleryUrl(galleryUrl);

      // Generate QR Code
      const qrData = await QRCode.toDataURL(galleryUrl, { margin: 1, width: 320, color: { dark: '#000000', light: '#ffffff' } });
      setQrCodeDataUrl(qrData);

      // Compose GIF Boomerang in background
      let gifDataUrl: string | null = null;
      if (enableGif && photos.length > 0) {
        try {
          const gifResult = await GifComposer.composeGif(photos, {
            frameDelayMs: 600,
            playbackMode: 'boomerang',
            frameOverlayBase64: gifOverlayPath,
            cutoutSlots: customGifCutouts.length > 0 ? customGifCutouts : undefined,
          });
          gifDataUrl = gifResult.dataUrl;
          setFinalGifDataUrl(gifDataUrl);
        } catch (e) {
          console.warn('GIF creation notice:', e);
        }
      }

      const rawShotsPayload = photos.map((p, idx) => ({ index: idx + 1, dataUrl: p }));

      // Save to Offline Storage (IndexedDB)
      saveOfflineCapture({
        photoId,
        eventId: selectedEventId,
        eventName: currentEvent.name,
        photoDataUrl: compositeDataUrl,
        gifDataUrl,
        hasGif: Boolean(gifDataUrl),
        rawShots: rawShotsPayload,
        createdAt: new Date().toISOString(),
      }).catch(() => {});

      // Save directly to local SSD folder ~/Pictures/MingleBooth/[Nama Acara] or custom folder
      if (typeof window !== 'undefined' && (window as any).electronAPI?.saveCaptureFiles) {
        (window as any).electronAPI.saveCaptureFiles({
          eventName: currentEvent.name,
          customBasePath: customStorageDir || undefined,
          photoId,
          photoBase64: compositeDataUrl,
          gifBase64: gifDataUrl,
          rawShots: rawShotsPayload,
        }).catch((e: any) => console.warn('Could not save to local SSD:', e));
      }

      // Background Cloud Sync to Supabase
      if (navigator.onLine) {
        fetch(`${API_BASE_URL}/api/sync/upload-capture`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('mb_license_token') || ''}`,
          },
          body: JSON.stringify({
            photoId,
            eventId: selectedEventId,
            fileDataUrl: compositeDataUrl,
            type: 'photo',
            rawShots: photos,
          }),
        }).catch(() => {});
      }

      setReviewRawIndex(0);

      setPhase('review');
      setSessionStep('idle');
      setReviewCountdown(30);
    } catch (err) {
      console.error('Compositing failed:', err);
      setSessionStep('idle');
      alert('Gagal menyusun foto. Silakan coba lagi.');
    }
  };

  // Direct Print
  const handlePrintPhoto = () => {
    if (!finalPhotoDataUrl) return;

    if (typeof window !== 'undefined' && (window as any).electronAPI?.printPhoto) {
      (window as any).electronAPI.printPhoto({ filePath: finalPhotoDataUrl, silent: false, copies: 1 })
        .then(() => console.log('Native print triggered'))
        .catch(() => {});
      return;
    }

    setPrintImageUrl(finalPhotoDataUrl);
    setTimeout(() => {
      window.focus();
      window.print();
    }, 200);
  };

  // Keyboard navigation (Escape = return to setup, Space = shoot)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (phase === 'kiosk' || phase === 'review') {
          setPhase('setup');
          setSessionStep('idle');
          setCapturedPhotos([]);
        }
      } else if (e.code === 'Space') {
        if (phase === 'kiosk' && (sessionStep === 'idle' || sessionStep === 'paused_between_poses')) {
          triggerPoseShot(currentShotIndex);
        }
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [phase, sessionStep, currentShotIndex]);

  // Review Timer Countdown
  useEffect(() => {
    if (phase !== 'review') return;

    const timer = setInterval(() => {
      setReviewCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setPhase('kiosk');
          setCapturedPhotos([]);
          setCurrentShotIndex(0);
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
    setCapturedPhotos([]);
    setCurrentShotIndex(0);
    setFinalPhotoDataUrl(null);
    setFinalGifDataUrl(null);
    setResultTab('photo');
    setSessionStep('idle');
  };

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
                <Sparkles className="w-5 h-5 text-amber-300" />
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

            {/* Presets Grid */}
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
                    <div className="aspect-[9/14] w-full bg-black/40 overflow-hidden">
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

          {/* Footer Action Buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-white/[0.08] gap-3">
            <button
              type="button"
              onClick={() => {
                setShowWallpaperSettingModal(false);
                if (phase === 'kiosk') {
                  setIsScreensaverActive(true);
                } else {
                  alert('Layar standby akan aktif saat masuk ke Mode Kiosk.');
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
                  Galeri Foto: {currentEvent.name}
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
            Acara aktif: <span className="text-white font-medium">{currentEvent.name}</span>
          </div>
        </div>

        {/* Gallery Grid Body (Proportional and Uncropped) */}
        <main className="flex-1 overflow-y-auto p-6 min-h-0">
          {isEventGalleryLoading ? (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-xs text-neutral-400 gap-3">
              <RefreshCw className="w-7 h-7 animate-spin text-white" />
              <span>Memuat galeri acara {currentEvent.name}...</span>
            </div>
          ) : filteredPhotos.length === 0 ? (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-6 gap-3">
              <div className="w-16 h-16 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-neutral-400">
                <Camera className="w-8 h-8 text-neutral-300" />
              </div>
              <div>
                <h4 className="text-base font-semibold text-white">Belum Ada Sesi Foto</h4>
                <p className="text-xs text-neutral-400 max-w-md mt-1.5 leading-relaxed">
                  Foto yang diambil pada sesi photobooth acara <strong className="text-neutral-200">"{currentEvent.name}"</strong> akan otomatis tersimpan di laptop ini dan siap dicetak ulang atau diekspor.
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
                      try {
                        const targetUrl =
                          galleryLightboxTab === 'original' &&
                          selectedGalleryPreviewItem.rawShots &&
                          selectedGalleryPreviewItem.rawShots.length > 0
                            ? selectedGalleryPreviewItem.rawShots[lightboxRawIndex]?.dataUrl ||
                              selectedGalleryPreviewItem.photoDataUrl
                            : selectedGalleryPreviewItem.photoDataUrl;

                        if (typeof window !== 'undefined' && (window as any).electronAPI?.printPhoto) {
                          await (window as any).electronAPI.printPhoto(targetUrl, 1, false);
                          alert('Perintah cetak berhasil dikirim ke printer!');
                        } else {
                          const win = window.open('');
                          win?.document.write(`<img src="${targetUrl}" style="width:100%"/>`);
                          win?.print();
                        }
                      } catch (e: any) {
                        alert(`Gagal mencetak: ${e.message}`);
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
        {/* Top Minimal Header */}
        <header className="h-16 px-6 border-b border-white/[0.08] bg-[#0F1014] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <img
              src={logoHeader}
              alt="MingleBooth"
              className="h-7 sm:h-8 w-auto object-contain"
            />
            <div className="h-4 w-[1px] bg-white/10 hidden sm:block" />
            <span className="text-xs font-semibold tracking-wide text-neutral-300 hidden sm:inline">
              Studio Photobooth Kiosk
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleChooseOrNewFolder}
              className="h-9 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-medium text-neutral-200 hover:text-white flex items-center gap-2 transition-all cursor-pointer"
              title="Pilih atau buat folder baru di laptop untuk meletakkan foto"
            >
              <FolderPlus className="w-3.5 h-3.5 text-neutral-300" />
              <span>Atur Folder</span>
            </button>

            <button
              onClick={handleOpenEventStorageFolder}
              className="h-9 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-medium text-neutral-200 hover:text-white flex items-center gap-2 transition-all cursor-pointer"
              title="Buka folder penyimpanan foto acara di laptop"
            >
              <FolderOpen className="w-3.5 h-3.5 text-neutral-300" />
              <span>Buka Folder Foto</span>
            </button>

            <button
              onClick={openEventGallery}
              className="h-9 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-medium text-neutral-200 hover:text-white flex items-center gap-2 transition-all cursor-pointer"
            >
              <Images className="w-3.5 h-3.5 text-neutral-300" />
              <span>Galeri Acara</span>
            </button>

            <button
              onClick={() => {
                if (confirm('Keluar dari sesi operator dan nonaktifkan perangkat laptop ini?')) {
                  localStorage.removeItem('mb_license_token');
                  window.location.reload();
                }
              }}
              className="h-9 px-3.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-xs font-medium text-neutral-400 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Ganti Akun</span>
            </button>
          </div>
        </header>

        {/* Studio Split Layout */}
        <main className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
          {/* SISI KIRI: LIVE CAMERA & TEMPLATE PREVIEW CANVAS */}
          <section className="flex-1 bg-[#090A0C] flex flex-col items-center justify-center p-6 min-h-0 border-b lg:border-b-0 lg:border-r border-white/[0.06] relative">
            <div className="w-full max-w-md flex items-center justify-between mb-3 text-xs text-neutral-400">
              <span className="flex items-center gap-2">
                {cameraMode === 'webcam' ? (
                  cameraStream ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                      <span className="text-white font-medium">Webcam Laptop Aktif</span>
                    </>
                  ) : isCameraLoading ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-neutral-400 animate-spin" />
                      <span className="text-neutral-300 font-medium">Menghubungkan Kamera...</span>
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 rounded-full bg-neutral-500" />
                      <span className="text-neutral-400 font-medium">Kamera Belum Terhubung</span>
                    </>
                  )
                ) : tetherStatus === 'connected' ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    <span className="text-white font-medium">Kamera Sony USB Siap</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-neutral-500" />
                    <span className="text-neutral-400 font-medium">Menunggu Kamera Sony USB</span>
                  </>
                )}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowFrameOverlayInPreview(!showFrameOverlayInPreview)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                    showFrameOverlayInPreview
                      ? 'bg-white text-black font-semibold shadow-sm'
                      : 'bg-white/[0.06] text-neutral-300 hover:text-white border border-white/10'
                  }`}
                  title="Lihat bagaimana foto akan pas di dalam lubang bingkai"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>{showFrameOverlayInPreview ? 'Sembunyikan Bingkai' : 'Intip Bingkai'}</span>
                </button>
                <span className="font-mono text-[11px] bg-white/[0.06] px-2 py-0.5 rounded text-neutral-300">
                  Rasio: {currentTemplate.ratio} ({frameDimensions.width}x{frameDimensions.height})
                </span>
              </div>
            </div>

            {/* Framing Box (Full Wide Clean Viewport by default, or Frame Aspect when toggled) */}
            <div
              style={{
                aspectRatio: showFrameOverlayInPreview
                  ? `${frameDimensions.width} / ${frameDimensions.height}`
                  : '4 / 3',
              }}
              className="h-full max-h-[68vh] rounded-2xl bg-[#090A0C] border border-white/[0.1] overflow-hidden relative shadow-2xl flex items-center justify-center group transition-all duration-300"
            >
              {cameraMode === 'webcam' ? (
                cameraStream ? (
                  <video
                    ref={attachPreviewVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover transform -scale-x-100"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center p-6 text-center text-xs text-neutral-400 gap-3 z-0">
                    <div className="w-12 h-12 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-neutral-300">
                      {isCameraLoading ? (
                        <RefreshCw className="w-6 h-6 animate-spin text-white" />
                      ) : (
                        <Laptop className="w-6 h-6 text-neutral-300" />
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-white">
                        {isCameraLoading ? 'Menghubungkan Kamera Laptop...' : 'Kamera Laptop Belum Terhubung'}
                      </p>
                      {cameraError && (
                        <p className="text-[11px] text-neutral-300 max-w-xs mt-1.5 leading-relaxed bg-white/[0.04] p-2 rounded-lg border border-white/[0.08]">
                          {cameraError}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startWebcamStream()}
                        className="px-4 py-2 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-xs flex items-center gap-1.5 shadow-lg active:scale-95 transition-all cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Sambungkan Kamera</span>
                      </button>
                      {typeof window !== 'undefined' && (window as any).electronAPI?.openCameraPrivacySettings && (
                        <button
                          type="button"
                          onClick={() => (window as any).electronAPI.openCameraPrivacySettings()}
                          className="px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-neutral-300 hover:text-white font-medium text-xs transition-colors cursor-pointer"
                          title="Buka Pengaturan Privasi Kamera di macOS"
                        >
                          Buka Privasi Mac
                        </button>
                      )}
                    </div>
                  </div>
                )
              ) : tetherLiveFrame ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tetherLiveFrame} alt="Sony Live View" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center justify-center p-6 text-center text-xs text-neutral-400 gap-3 z-0">
                  <div className="w-12 h-12 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-neutral-300">
                    <Camera className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">Mode Kamera Sony / DSLR USB Siap</p>
                    <p className="text-[11px] text-neutral-400 max-w-xs mt-1 leading-tight">
                      {tetherStatus === 'connected'
                        ? 'Kamera terdeteksi via kabel USB. Foto tajam otomatis tersinkron saat memotret.'
                        : 'Hubungkan kamera via kabel USB (Mode PC Remote). Tombol potret akan langsung mengambil foto dengan flash.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      fetch(`${tetherUrl}/api/tether/status`)
                        .then((r) => r.json())
                        .then((d) => setTetherStatus(d.success ? 'connected' : 'disconnected'))
                        .catch(() => setTetherStatus('disconnected'));
                    }}
                    className="px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-white font-semibold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Cek Sambungan Kamera</span>
                  </button>
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

          {/* SISI KANAN: STUDIO CONFIGURATION PANEL (CLEAN MONOCHROME) */}
          <aside className="w-full lg:w-[460px] bg-[#0F1014] p-6 flex flex-col justify-between overflow-y-auto min-h-0">
            <div className="space-y-5">
              {/* 1. Event Selection Card (Clean & Zero Jargon) */}
              <div className="p-4 rounded-2xl bg-[#14161C] border border-white/[0.06] space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block">
                    1. Pilih Acara
                  </label>
                  <button
                    type="button"
                    onClick={fetchVendorData}
                    disabled={isLoadingVendorData}
                    className="text-[11px] text-neutral-300 hover:text-white flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                    title="Perbarui daftar acara dari server"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingVendorData ? 'animate-spin' : ''}`} />
                    <span>{isLoadingVendorData ? 'Memperbarui...' : 'Perbarui Acara'}</span>
                  </button>
                </div>
                <select
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-[#1A1C24] border border-white/[0.08] text-xs font-medium text-white outline-none focus:border-white/30 transition-colors"
                >
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name} {ev.date ? `(${ev.date})` : ''}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1.5 text-[10px] text-neutral-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/60" />
                  <span>{events.length} Acara Siap Digunakan</span>
                </div>
              </div>

              {/* 2. Template & GIF Card (Clean Monochrome) */}
              <div className="p-4 rounded-2xl bg-[#14161C] border border-white/[0.06] space-y-3">
                {/* Hidden File Inputs for Custom Uploads */}
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
                  <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block">
                    2. Desain Bingkai &amp; GIF
                  </label>
                  <span className="text-[11px] text-neutral-400 font-mono">
                    {templates.length} Pilihan Bingkai
                  </span>
                </div>

                {/* Templates Thumbnail Selector */}
                <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
                  {templates.map((tmpl) => {
                    const isSelected = tmpl.id === selectedTemplateId;
                    return (
                      <button
                        key={tmpl.id}
                        type="button"
                        onClick={() => setSelectedTemplateId(tmpl.id)}
                        className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-white text-black border-white shadow-md font-medium'
                            : 'bg-[#1A1C24] border-white/[0.06] text-neutral-300 hover:border-white/20'
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={tmpl.path}
                          alt={tmpl.name}
                          className="w-8 h-10 object-contain rounded bg-black/40 flex-shrink-0"
                        />
                        <span className="text-[11px] font-semibold truncate leading-tight">
                          {tmpl.name}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Upload Action Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => customFileInputRef.current?.click()}
                    className="h-10 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] hover:border-white/20 text-xs font-semibold text-white flex items-center justify-center gap-2 transition-all cursor-pointer"
                    title="Upload template bingkai cetak format PNG transparan"
                  >
                    <Upload className="w-3.5 h-3.5 text-neutral-300" />
                    <span className="truncate">{customPhotoFileName ? 'Ganti Bingkai Foto' : 'Upload Bingkai (.PNG)'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => customGifFileInputRef.current?.click()}
                    className="h-10 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] hover:border-white/20 text-xs font-semibold text-white flex items-center justify-center gap-2 transition-all cursor-pointer"
                    title="Upload bingkai overlay khusus untuk animasi GIF Boomerang"
                  >
                    <Film className="w-3.5 h-3.5 text-neutral-300" />
                    <span className="truncate">{customGifFileName ? 'Ganti Bingkai GIF' : 'Upload Bingkai GIF'}</span>
                  </button>
                </div>

                {/* Uploaded Files & GIF Toggle Indicator */}
                <div className="space-y-1.5 pt-1 text-[11px]">
                  {customPhotoFileName && (
                    <div className="flex items-center gap-1.5 text-neutral-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-white flex-shrink-0" />
                      <span className="truncate">Bingkai Foto: <strong>{customPhotoFileName}</strong></span>
                    </div>
                  )}

                  <div className="flex items-center justify-between p-2 rounded-xl bg-[#1A1C24] border border-white/[0.06]">
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <Film className="w-3.5 h-3.5 text-neutral-300 flex-shrink-0" />
                      <div className="truncate text-neutral-300">
                        <span className="truncate">
                          {customGifFileName ? `GIF: ${customGifFileName}` : 'GIF: Kosongan Murni (Tanpa Bingkai/Watermark)'}
                        </span>
                        {customGifCutouts.length > 1 && (
                          <span className="ml-1 text-[10px] text-neutral-400">
                            ({customGifCutouts.length} Lubang Aktif)
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {customGifFileName && (
                        <button
                          type="button"
                          onClick={() => {
                            setGifOverlayPath(null);
                            setCustomGifFileName('');
                            setCustomGifCutouts([]);
                          }}
                          className="px-2 py-0.5 rounded text-[10px] text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                          title="Hapus bingkai GIF khusus dan kembalikan ke video kosongan murni"
                        >
                          Reset
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setEnableGif(!enableGif)}
                        className={`px-3 py-1 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-all cursor-pointer ${
                          enableGif
                            ? 'bg-white text-black shadow-sm'
                            : 'bg-white/10 text-neutral-400 hover:text-white'
                        }`}
                      >
                        {enableGif ? 'Aktif' : 'Mati'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Camera Source Selector */}
              <div className="p-4 rounded-2xl bg-[#14161C] border border-white/[0.06] space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block">
                    3. Sumber Kamera
                  </label>
                  {cameraMode === 'webcam' && (
                    <button
                      type="button"
                      onClick={() => startWebcamStream()}
                      className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Sambungkan Ulang</span>
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 p-1 rounded-xl bg-[#1A1C24] border border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => handleSwitchCameraMode('webcam')}
                    className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      cameraMode === 'webcam'
                        ? 'bg-white text-black shadow-sm'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    <Laptop className="w-3.5 h-3.5" />
                    <span>Webcam Laptop</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchCameraMode('sony')}
                    className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      cameraMode === 'sony'
                        ? 'bg-white text-black shadow-sm'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Sony / DSLR USB</span>
                  </button>
                </div>

                {cameraMode === 'webcam' && cameras.length > 1 && (
                  <select
                    value={selectedWebcamId}
                    onChange={(e) => {
                      setSelectedWebcamId(e.target.value);
                      startWebcamStream(e.target.value);
                    }}
                    className="w-full h-9 px-3 rounded-lg bg-[#1A1C24] border border-white/[0.06] text-[11px] text-neutral-300 outline-none"
                  >
                    {cameras.map((c, i) => (
                      <option key={c.deviceId || i} value={c.deviceId}>
                        {c.label || `Kamera ${i + 1}`}
                      </option>
                    ))}
                  </select>
                )}

                {cameraMode === 'sony' && (
                  <div className="p-2.5 rounded-xl bg-[#1A1C24] border border-white/[0.06] flex items-center justify-between text-xs">
                    <span className="text-neutral-400 flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          tetherStatus === 'connected' ? 'bg-white animate-pulse' : 'bg-neutral-500'
                        }`}
                      />
                      <span>{tetherStatus === 'connected' ? 'Sony USB Siap' : 'Menunggu Sambungan USB'}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        fetch(`${tetherUrl}/api/tether/status`)
                          .then((r) => r.json())
                          .then((d) => setTetherStatus(d.success ? 'connected' : 'disconnected'))
                          .catch(() => setTetherStatus('disconnected'));
                      }}
                      className="text-[11px] text-neutral-300 hover:text-white underline cursor-pointer"
                    >
                      Uji Sambungan
                    </button>
                  </div>
                )}
              </div>

              {/* 4. Capture Parameters: Flexible Custom Pose + Countdown */}
              <div className="p-4 rounded-2xl bg-[#14161C] border border-white/[0.06] space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                      Jumlah Pose:
                    </span>
                    <span className="text-xs font-bold text-white bg-white/10 px-2.5 py-0.5 rounded-md border border-white/10">
                      {shotsCount} Pose
                    </span>
                  </div>

                  {/* Quick Preset Buttons + Custom Stepper & Direct Input */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 grid grid-cols-5 gap-1 bg-[#1A1C24] p-1 rounded-xl border border-white/[0.06]">
                      {[1, 2, 3, 4, 6].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setShotsCount(num)}
                          className={`py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                            shotsCount === num
                              ? 'bg-white text-black shadow-sm font-bold'
                              : 'text-neutral-400 hover:text-white'
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>

                    {/* Flexible Stepper & Direct Custom Input */}
                    <div className="flex items-center bg-[#1A1C24] border border-white/[0.08] rounded-xl p-0.5 h-[38px]">
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
                        title="Ketik jumlah pose yang diinginkan secara bebas"
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
                  <p className="text-[10px] text-neutral-400">
                    Pilih preset atau ketik angka bebas (misal 5, 8, atau 10 pose). Layout otomatis menyesuaikan.
                  </p>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                    Countdown:
                  </span>
                  <div className="flex items-center gap-1 bg-[#1A1C24] p-1 rounded-xl border border-white/[0.06]">
                    {[0, 3, 5, 10].map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => setCountdownSeconds(sec)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          countdownSeconds === sec
                            ? 'bg-white text-black shadow-sm'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        {sec === 0 ? 'Off' : `${sec}s`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 5. Standby Wallpaper (Screensaver) Card */}
              <div className="p-4 rounded-2xl bg-[#14161C] border border-white/[0.06] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block">
                      5. Wallpaper Standby (Screensaver)
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleStandbyWallpaper(!enableStandbyWallpaper)}
                    className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      enableStandbyWallpaper
                        ? 'bg-white text-black shadow-sm'
                        : 'bg-white/10 text-neutral-400 hover:text-white'
                    }`}
                  >
                    {enableStandbyWallpaper ? 'Aktif' : 'Mati'}
                  </button>
                </div>

                {enableStandbyWallpaper && (
                  <div className="space-y-2.5 pt-1">
                    {/* Timer selector */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-neutral-300 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-neutral-400" />
                        <span>Timer Standby:</span>
                      </span>
                      <div className="flex items-center gap-1 bg-[#1A1C24] p-1 rounded-xl border border-white/[0.06]">
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
                            className={`px-2 py-0.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              standbyTimeoutMinutes === item.val
                                ? 'bg-white text-black shadow-sm'
                                : 'text-neutral-400 hover:text-white'
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Presets Row */}
                    <div className="grid grid-cols-4 gap-1.5 pt-1">
                      {DEFAULT_WALLPAPERS.map((preset) => {
                        const isSelected = selectedWallpaperId === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => handleSelectWallpaperPreset(preset.id)}
                            className={`relative rounded-xl overflow-hidden border text-left transition-all group cursor-pointer ${
                              isSelected
                                ? 'border-white ring-1 ring-white shadow-md'
                                : 'border-white/10 opacity-70 hover:opacity-100'
                            }`}
                            title={preset.name}
                          >
                            <div className="aspect-[9/13] w-full bg-black/40 overflow-hidden">
                              <img
                                src={preset.path}
                                alt={preset.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <span className="text-[9px] font-medium text-neutral-300 block truncate p-1 bg-[#1A1C24]">
                              {preset.name.split(' ')[0]}
                            </span>
                          </button>
                        );
                      })}

                      {/* Custom Upload Trigger */}
                      <button
                        type="button"
                        onClick={() => setShowWallpaperSettingModal(true)}
                        className={`rounded-xl border flex flex-col items-center justify-center p-1 transition-all cursor-pointer ${
                          selectedWallpaperId === 'custom'
                            ? 'border-white bg-[#1A1C24]'
                            : 'border-white/10 bg-[#1A1C24]/60 hover:bg-[#1A1C24]'
                        }`}
                        title="Atur atau Upload Wallpaper Sendiri"
                      >
                        <Sparkles className="w-4 h-4 text-amber-300 mb-1" />
                        <span className="text-[9px] text-neutral-300 text-center leading-tight">
                          {selectedWallpaperId === 'custom' ? 'Kustom' : 'Atur...'}
                        </span>
                      </button>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-neutral-400 truncate max-w-[170px]">
                        {selectedWallpaperId === 'custom'
                          ? `Kustom: ${customWallpaperFileName || 'Upload File'}`
                          : DEFAULT_WALLPAPERS.find((w) => w.id === selectedWallpaperId)?.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowWallpaperSettingModal(true)}
                        className="text-[11px] text-neutral-300 hover:text-white underline cursor-pointer"
                      >
                        Pengaturan Lengkap &rarr;
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Launch Kiosk Button */}
            <div className="pt-4 border-t border-white/[0.06] mt-4">
              <button
                onClick={() => {
                  setPhase('kiosk');
                  setSessionStep('idle');
                  setCurrentShotIndex(0);
                  setCapturedPhotos([]);
                }}
                className="w-full h-14 rounded-2xl bg-white hover:bg-neutral-200 text-black font-bold text-sm flex items-center justify-center gap-2 shadow-2xl transition-all active:scale-[0.99] cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Mulai Sesi Photobooth (Kiosk)</span>
              </button>
            </div>
          </aside>
        </main>

        {renderWallpaperSettingModal()}
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
          if (sessionStep === 'idle') {
            triggerPoseShot(0);
          } else if (sessionStep === 'paused_between_poses') {
            triggerPoseShot(currentShotIndex);
          }
        }}
        className={`relative h-screen w-screen bg-black overflow-hidden select-none touch-none font-sans ${
          sessionStep === 'idle' || sessionStep === 'paused_between_poses' ? 'cursor-pointer' : ''
        }`}
      >
        {/* Shutter White Flash Screen */}
        {isFlashing && (
          <div className="absolute inset-0 z-50 bg-white pointer-events-none transition-opacity duration-150" />
        )}

        {/* ── 100% FULL SCREEN CAMERA FEED (EDGE-TO-EDGE 1 TAB) ── */}
        {cameraMode === 'sony' ? (
          tetherLiveFrame ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tetherLiveFrame}
              alt="Sony Live View"
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            />
          ) : (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-0 bg-[#090A0C] flex flex-col items-center justify-center p-6 text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-white mb-4 animate-pulse">
                <Camera className="w-8 h-8 text-neutral-300" />
              </div>
              <h2 className="text-lg font-semibold text-white mb-1">Kamera Sony / DSLR di Laptop Siap</h2>
              <p className="text-xs text-neutral-400 max-w-sm mb-4 leading-relaxed">
                Kamera Sony USB siap memotret dengan hasil tajam dan lampu flash fisik.
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCameraMode('webcam');
                  startWebcamStream();
                }}
                className="mt-2 px-5 py-2.5 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-xs flex items-center gap-2 transition-all shadow-xl active:scale-95 cursor-pointer"
              >
                <Camera className="w-4 h-4 fill-black" />
                <span>Gunakan Webcam Laptop</span>
              </button>
            </div>
          )
        ) : (
          <video
            ref={attachVideoRef}
            autoPlay
            playsInline
            muted
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
            {currentEvent.hostNames || currentEvent.name}
          </span>
          <span className="text-xs font-medium text-white/75 drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]">
            {currentEvent.date || 'Photobooth Edition'}
          </span>
        </div>

        {/* Top-Left: PIP Pose Thumbnails */}
        {capturedPhotos.length > 0 && sessionStep !== 'countdown' && (
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
        )}

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
            <Sparkles className="w-4 h-4 text-amber-300" />
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
              setShowEventGalleryModal(true);
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
        </div>

        {/* Countdown Overlay HUD */}
        {sessionStep === 'countdown' && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/25 pointer-events-none">
            <span className="text-[140px] font-bold text-white drop-shadow-[0_10px_35px_rgba(0,0,0,0.95)] animate-pulse leading-none">
              {countdownRemaining}
            </span>
            <span className="text-xs font-bold tracking-widest uppercase text-white drop-shadow-md bg-black/70 px-5 py-2 rounded-full mt-4">
              Senyum untuk Pose {currentShotIndex + 1}!
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
            className="absolute bottom-10 inset-x-0 z-20 flex flex-col items-center justify-center pointer-events-auto animate-fadeIn"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                triggerPoseShot(0);
              }}
              className="px-9 py-4 rounded-full bg-white text-black font-bold text-sm tracking-wider uppercase flex items-center gap-3 shadow-[0_10px_35px_rgba(0,0,0,0.6)] active:scale-95 transition-all hover:bg-neutral-200 cursor-pointer"
            >
              <Camera className="w-5 h-5 fill-black" />
              <span>SENTUH LAYAR ATAU TEKAN SPACE UNTUK MEMOTRET</span>
            </button>
            <span className="text-[11px] font-medium text-white/90 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] mt-2.5">
              Total {shotsCount} Pose bergantian santai
            </span>
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
            className="absolute inset-0 z-50 bg-black animate-fadeIn cursor-pointer select-none"
          >
            {/* Background Image / Animation */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getActiveWallpaperUrl()}
              alt="Standby Wallpaper"
              className="w-full h-full object-cover select-none pointer-events-none"
            />

            {/* Dark Vignette Overlay for Readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/60 pointer-events-none" />

            {/* Top Bar: Clock, Date, & Quick Settings */}
            <div className="absolute top-8 inset-x-8 flex items-start justify-between">
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
            <div className="absolute inset-x-6 bottom-16 flex flex-col items-center justify-center text-center gap-4 pointer-events-none">
              <div className="flex flex-col items-center gap-1 drop-shadow-md">
                <span className="text-xs sm:text-sm font-semibold tracking-widest uppercase text-white/80">
                  {currentEvent.name}
                </span>
                {currentEvent.hostNames && (
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
          {resultTab === 'original' && capturedPhotos.length > 1 && (
            <div className="flex items-center gap-1.5 bg-white/[0.04] p-1 rounded-xl border border-white/[0.06]">
              {capturedPhotos.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setReviewRawIndex(idx)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
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
            className="h-full max-h-[66vh] max-w-full rounded-2xl bg-black border border-white/[0.1] overflow-hidden shadow-2xl flex items-center justify-center p-1 transition-all duration-300"
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
          </div>
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
              className="w-full h-11 rounded-xl bg-white hover:bg-neutral-200 text-black font-bold text-xs tracking-wider uppercase flex items-center justify-center gap-2 shadow-lg transition-all active:scale-98"
            >
              <Printer className="w-4 h-4 text-black" />
              <span>Cetak Foto Langsung</span>
            </button>

            <button
              onClick={() => {
                setPhase('kiosk');
                setCapturedPhotos([]);
                setCurrentShotIndex(0);
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
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <VendorAuthGate>
      <TabletStudioContent />
    </VendorAuthGate>
  );
};
