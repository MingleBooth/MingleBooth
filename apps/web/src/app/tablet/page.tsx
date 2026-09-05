'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import QRCode from 'qrcode';
import {
  Camera,
  Video,
  Smartphone,
  RefreshCw,
  Play,
  Settings,
  X,
  Check,
  Download,
  Share2,
  Maximize2,
  Minimize2,
  Layers,
  Clock,
  ChevronRight,
  ShieldCheck,
  Upload,
  RotateCcw,
  Film,
  Printer,
  Images,
  HardDrive,
  ExternalLink,
  Trash2,
  Eye,
  Sparkles,
  FolderCheck,
  FolderPlus,
  Folder,
  Info,
  ChevronLeft,
  ArrowLeft,
  CameraOff,
} from 'lucide-react';
import { FrameHoleDetector, DetectedCutout } from '@minglebooth/template-engine';
import { GifComposer } from '@minglebooth/gif-engine';
import {
  saveOfflineCapture,
  getOfflineCaptures,
  deleteOfflineCapture,
  clearOfflineCaptures,
  OfflineCaptureItem,
} from '@/lib/offlineStorage';

interface DiscoveredCamera {
  deviceId: string;
  label: string;
  type: 'external' | 'back' | 'front' | 'generic';
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
    name: 'Wedding Bayu & Irma (Floral)',
    path: '/frames/wedding_bayu_irma.png',
    ratio: '2:3',
  },
];

function cleanTemplateName(raw: string, index?: number): string {
  if (!raw) return `Template Frame ${index !== undefined ? index + 1 : ''}`;
  if (/^[0-9A-Fa-f]{6,}/.test(raw)) {
    return `Frame Koleksi #${(index ?? 0) + 1}`;
  }
  return raw.replace(/_/g, ' ').replace(/\.png$/i, '');
}

// Audio synth via Web Audio API
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
  } catch {
    // Safe ignore
  }
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
  } catch {
    // Safe ignore
  }
}

export default function TabletStudioPage() {
  // App Phase: 'setup' | 'kiosk' | 'review'
  const [phase, setPhase] = useState<'setup' | 'kiosk' | 'review'>('setup');

  // Camera State
  const [cameras, setCameras] = useState<DiscoveredCamera[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Configuration
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
  const selectedEventName = currentEvent?.name || 'MingleBooth Event';
  const [templates, setTemplates] = useState<TemplateItem[]>(DEFAULT_TEMPLATES);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(DEFAULT_TEMPLATES[0].id);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState<boolean>(false);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(3); // 0 = OFF, 3, 5, 10
  const [shotsCount, setShotsCount] = useState<number>(2);
  const [showSonyHelp, setShowSonyHelp] = useState<boolean>(false);

  // Frame Native Resolution & Cutout Hole Detection
  const [frameDimensions, setFrameDimensions] = useState<{ width: number; height: number }>({
    width: 682,
    height: 1024,
  });
  const [frameCutouts, setFrameCutouts] = useState<DetectedCutout[]>([]);

  // Kiosk Session State — Controlled Manual Tap Per Pose Flow
  const [sessionStep, setSessionStep] = useState<
    'idle' | 'countdown' | 'flash' | 'paused_between_poses' | 'processing'
  >('idle');
  const [currentShotIndex, setCurrentShotIndex] = useState<number>(0);
  const [countdownRemaining, setCountdownRemaining] = useState<number>(3);
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const [isFlashing, setIsFlashing] = useState<boolean>(false);

  // Result & QR Code
  const [finalPhotoDataUrl, setFinalPhotoDataUrl] = useState<string | null>(null);
  const [finalGifDataUrl, setFinalGifDataUrl] = useState<string | null>(null);
  const [resultTab, setResultTab] = useState<'photo' | 'gif'>('photo');
  const [isGeneratingGif, setIsGeneratingGif] = useState<boolean>(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [guestGalleryUrl, setGuestGalleryUrl] = useState<string>('');
  const [reviewCountdown, setReviewCountdown] = useState<number>(25);

  // Dedicated GIF Overlay Frame for Vendor
  const [gifOverlayPath, setGifOverlayPath] = useState<string | null>('/frames/wedding_gif_frame.png');
  const [isGifOverlayEnabled, setIsGifOverlayEnabled] = useState<boolean>(true);
  const [customGifFileName, setCustomGifFileName] = useState<string>('Wedding Floral GIF (Default)');
  const [gifDimensions, setGifDimensions] = useState<{ width: number; height: number }>({
    width: 720,
    height: 960,
  });
  const [gifCutout, setGifCutout] = useState<DetectedCutout | null>(null);
  const [gifSpeedMs, setGifSpeedMs] = useState<number>(750);
  const [autoSaveToDevice, setAutoSaveToDevice] = useState<boolean>(true);

  // In-Kiosk Event Gallery Modal (Review Phase)
  const [showEventGalleryModal, setShowEventGalleryModal] = useState<boolean>(false);
  const [eventGalleryPhotos, setEventGalleryPhotos] = useState<any[]>([]);
  const [isEventGalleryLoading, setIsEventGalleryLoading] = useState<boolean>(false);
  const [galleryFilter, setGalleryFilter] = useState<'all' | 'photo' | 'gif' | 'raw'>('all');
  const [previewGalleryPhoto, setPreviewGalleryPhoto] = useState<any | null>(null);
  const [previewGalleryTab, setPreviewGalleryTab] = useState<string>('photo');
  const [printImageUrl, setPrintImageUrl] = useState<string | null>(null);

  // Tablet Local Storage & External SSD Management
  const [showStorageModal, setShowStorageModal] = useState<boolean>(false);
  const [offlineStorageItems, setOfflineStorageItems] = useState<OfflineCaptureItem[]>([]);
  const [isStorageLoading, setIsStorageLoading] = useState<boolean>(false);
  const [customDirHandle, setCustomDirHandle] = useState<any>(null);
  const [customFolderName, setCustomFolderName] = useState<string>('');
  const [showIpadGuideModal, setShowIpadGuideModal] = useState<boolean>(false);
  const [isPickingFolder, setIsPickingFolder] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mb_custom_folder_name');
      if (saved) {
        setCustomFolderName(saved);
      }
    }
  }, []);

  const handlePickStorageDirectory = async () => {
    if (typeof window === 'undefined') return;

    if ('showDirectoryPicker' in window) {
      try {
        setIsPickingFolder(true);
        // 1. Let operator pick their external SSD / HDD drive or root folder
        const rootHandle = await (window as any).showDirectoryPicker({
          id: 'minglebooth_ssd_root',
          mode: 'readwrite',
          startIn: 'documents',
        });

        // 2. Automatically create a clean, dedicated folder for this event!
        const cleanName = (selectedEventName || 'MingleBooth_Acara').replace(/[^a-zA-Z0-9_-]/g, '_');
        const dedicatedFolderName = `MingleBooth_${cleanName}`;
        const eventDir = await rootHandle.getDirectoryHandle(dedicatedFolderName, { create: true });

        // 3. Create structured subfolders: Foto_Berbingkai, Animasi_GIF, Foto_Mentahan
        await eventDir.getDirectoryHandle('Foto_Berbingkai', { create: true });
        await eventDir.getDirectoryHandle('Animasi_GIF', { create: true });
        await eventDir.getDirectoryHandle('Foto_Mentahan', { create: true });

        setCustomDirHandle(eventDir);
        const folderLabel = `${rootHandle.name}/${dedicatedFolderName}`;
        setCustomFolderName(folderLabel);
        localStorage.setItem('mb_custom_folder_name', folderLabel);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Error selecting SSD directory:', err);
        }
      } finally {
        setIsPickingFolder(false);
      }
    } else {
      // iPad Safari does not support showDirectoryPicker - display easy 1-time setup guide
      setShowIpadGuideModal(true);
    }
  };

  // Direct Printer Handler (100% Reliable Native Browser & AirPrint Dialog)
  const handlePrintPhoto = useCallback((photoUrl?: string | null) => {
    const targetUrl = photoUrl || finalPhotoDataUrl;
    if (!targetUrl || typeof window === 'undefined') return;

    setPrintImageUrl(targetUrl);

    // Give browser time to render image into DOM print container
    setTimeout(() => {
      window.focus();
      window.print();
    }, 300);
  }, [finalPhotoDataUrl]);

  useEffect(() => {
    const handleAfterPrint = () => {
      setPrintImageUrl(null);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);


  // Fetch Event Gallery for In-Kiosk Viewing (Merges Local Tablet IndexedDB + Cloud API)
  const loadEventGallery = useCallback(async () => {
    setIsEventGalleryLoading(true);
    try {
      // 1. Instantly fetch from local tablet IndexedDB (0ms instant response)
      let localItems = await getOfflineCaptures(selectedEventId);
      if (localItems.length === 0) {
        const allItems = await getOfflineCaptures('all');
        localItems = allItems.filter(
          (c) => c.eventId === selectedEventId || (selectedEventName && c.eventName === selectedEventName)
        );
        if (localItems.length === 0 && allItems.length > 0) {
          localItems = allItems;
        }
      }

      const localFormatted = localItems.map((item) => ({
        photoId: item.photoId,
        thumbUrl: item.photoDataUrl,
        fullUrl: item.photoDataUrl,
        gifUrl: item.gifDataUrl || null,
        hasGif: !!item.hasGif,
        rawShots: (item.rawShots || []).map((s, idx) => ({ index: s.index ?? idx + 1, url: s.dataUrl })),
        url: `/p/${item.photoId}`,
        createdAt: item.createdAt,
      }));

      // Immediately display local captures so gallery is never blank
      if (localFormatted.length > 0) {
        setEventGalleryPhotos(localFormatted);
      }

      // 2. Fetch from Cloud API and merge seamlessly
      const res = await fetch(`/api/gallery/event/${selectedEventId}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.photos)) {
          const map = new Map<string, any>();
          json.photos.forEach((p: any) => map.set(p.photoId, p));
          localFormatted.forEach((p: any) => {
            const existing = map.get(p.photoId);
            if (existing) {
              map.set(p.photoId, { ...existing, ...p });
            } else {
              map.set(p.photoId, p);
            }
          });

          const merged = Array.from(map.values()).sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          setEventGalleryPhotos(merged);
        }
      }
    } catch (e) {
      console.warn('Failed to load event gallery in tablet:', e);
    } finally {
      setIsEventGalleryLoading(false);
    }
  }, [selectedEventId, selectedEventName]);

  useEffect(() => {
    if (showEventGalleryModal) {
      setGalleryFilter('all');
      loadEventGallery();
    }
  }, [showEventGalleryModal, loadEventGallery]);

  // Tablet Storage Scope: 'current' (only active event) | 'all' (all events in tablet history)
  const [storageFilterScope, setStorageFilterScope] = useState<'current' | 'all'>('current');

  // Load Offline Tablet Storage Items (Filtered by Event by default)
  const loadOfflineItems = useCallback(
    async (scope?: 'current' | 'all') => {
      setIsStorageLoading(true);
      const activeScope = scope || storageFilterScope;
      try {
        const targetEventId = activeScope === 'current' ? selectedEventId : 'all';
        const items = await getOfflineCaptures(targetEventId);
        setOfflineStorageItems(items);
      } catch (e) {
        console.warn('Failed to load offline items:', e);
      } finally {
        setIsStorageLoading(false);
      }
    },
    [selectedEventId, storageFilterScope]
  );

  useEffect(() => {
    if (showStorageModal) {
      loadOfflineItems();
    }
  }, [showStorageModal, selectedEventId, loadOfflineItems]);

  // System
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [exitTapCount, setExitTapCount] = useState<number>(0);

  // DOM Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const miniVideoRef = useRef<HTMLVideoElement | null>(null);
  const frameImageRef = useRef<HTMLImageElement | null>(null);
  const customFileInputRef = useRef<HTMLInputElement | null>(null);
  const customGifFileInputRef = useRef<HTMLInputElement | null>(null);

  // Online / Offline Status
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch Cloud Events & Templates
  useEffect(() => {
    const fetchCloudData = async () => {
      try {
        const evRes = await fetch('/api/vendor/events');
        if (evRes.ok) {
          const evData = await evRes.json();
          if (Array.isArray(evData.events) && evData.events.length > 0) {
            setEvents(
              evData.events.map((e: any) => ({
                id: e.id,
                name: e.name,
                hostNames: e.branding?.hostNames || e.name,
                date: e.date,
              }))
            );
            setSelectedEventId(evData.events[0].id);
          }
        }
      } catch {
        // Safe offline fallback
      }

      try {
        const tmplRes = await fetch('/api/vendor/templates');
        if (tmplRes.ok) {
          const tmplData = await tmplRes.json();
          if (Array.isArray(tmplData.templates) && tmplData.templates.length > 0) {
            const formatted: TemplateItem[] = tmplData.templates.map((t: any, i: number) => ({
              id: t.id,
              name: cleanTemplateName(t.name, i),
              path: t.overlay_base64 || '/frames/wedding_bayu_irma.png',
              base64: t.overlay_base64,
              ratio: t.aspect_ratio || '2:3',
            }));

            setTemplates((prev) => {
              const existingIds = new Set(prev.map((item) => item.id));
              const uniqueNew = formatted.filter((item) => !existingIds.has(item.id));
              return [...prev, ...uniqueNew];
            });
          }
        }
      } catch {
        // Safe offline fallback
      }
    };
    fetchCloudData();
  }, []);

  // Enumerate Cameras
  const refreshCameraList = useCallback(async () => {
    try {
      setIsCameraLoading(true);
      setCameraError(null);

      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        tempStream.getTracks().forEach((track) => track.stop());
      } catch {
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
        tempStream.getTracks().forEach((track) => track.stop());
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');

      const classified: DiscoveredCamera[] = videoDevices.map((dev, idx) => {
        const label = dev.label.toLowerCase();
        let type: DiscoveredCamera['type'] = 'generic';

        if (
          label.includes('sony') ||
          label.includes('cam link') ||
          label.includes('capture') ||
          label.includes('hdmi') ||
          label.includes('usb video') ||
          label.includes('uvc') ||
          label.includes('obs') ||
          label.includes('elgato') ||
          label.includes('mirrorless')
        ) {
          type = 'external';
        } else if (
          label.includes('back') ||
          label.includes('rear') ||
          label.includes('environment') ||
          label.includes('belakang')
        ) {
          type = 'back';
        } else if (
          label.includes('front') ||
          label.includes('user') ||
          label.includes('facetime') ||
          label.includes('depan')
        ) {
          type = 'front';
        }

        return {
          deviceId: dev.deviceId,
          label: dev.label || `Kamera ${idx + 1}`,
          type,
        };
      });

      setCameras(classified);

      if (classified.length > 0) {
        const externalCam = classified.find((c) => c.type === 'external');
        const backCam = classified.find((c) => c.type === 'back');
        const defaultCam = externalCam || backCam || classified[0];
        setSelectedCameraId(defaultCam.deviceId);
      }
    } catch (err: any) {
      console.error('Error discovering cameras:', err);
      setCameraError('Izin kamera belum aktif. Buka Pengaturan > Safari/Chrome > Izinkan Kamera.');
    } finally {
      setIsCameraLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCameraList();
  }, [refreshCameraList]);

  // Dedicated callback refs to ensure instant, reliable video stream binding across phase changes
  const attachVideoRef = useCallback(
    (el: HTMLVideoElement | null) => {
      videoRef.current = el;
      if (el) {
        el.muted = true;
        el.defaultMuted = true;
        el.playsInline = true;
        el.setAttribute('playsinline', 'true');
        el.setAttribute('webkit-playsinline', 'true');
        if (cameraStream && el.srcObject !== cameraStream) {
          el.srcObject = cameraStream;
        }
        el.play().catch((err) => {
          console.warn('Kiosk video playback prevented:', err);
        });
      }
    },
    [cameraStream]
  );

  const attachMiniVideoRef = useCallback(
    (el: HTMLVideoElement | null) => {
      miniVideoRef.current = el;
      if (el) {
        el.muted = true;
        el.defaultMuted = true;
        el.playsInline = true;
        el.setAttribute('playsinline', 'true');
        el.setAttribute('webkit-playsinline', 'true');
        if (cameraStream && el.srcObject !== cameraStream) {
          el.srcObject = cameraStream;
        }
        el.play().catch((err) => {
          console.warn('Mini video playback prevented:', err);
        });
      }
    },
    [cameraStream]
  );

  // Connect Camera Stream
  useEffect(() => {
    if (!selectedCameraId) return;

    let activeStream: MediaStream | null = null;

    const startStream = async () => {
      setIsCameraLoading(true);
      setCameraError(null);

      try {
        if (cameraStream) {
          cameraStream.getTracks().forEach((t) => t.stop());
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: selectedCameraId ? { ideal: selectedCameraId } : undefined,
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        activeStream = stream;
        setCameraStream(stream);

        if (videoRef.current) {
          videoRef.current.muted = true;
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        if (miniVideoRef.current) {
          miniVideoRef.current.muted = true;
          miniVideoRef.current.srcObject = stream;
          miniVideoRef.current.play().catch(() => {});
        }
      } catch (err: any) {
        console.warn('Ideal deviceId constraint error, falling back to any camera:', err);
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
          activeStream = fallbackStream;
          setCameraStream(fallbackStream);
          if (videoRef.current) {
            videoRef.current.muted = true;
            videoRef.current.srcObject = fallbackStream;
            videoRef.current.play().catch(() => {});
          }
          if (miniVideoRef.current) {
            miniVideoRef.current.muted = true;
            miniVideoRef.current.srcObject = fallbackStream;
            miniVideoRef.current.play().catch(() => {});
          }
        } catch (e2: any) {
          setCameraError('Gagal menghubungkan kamera: ' + e2.message);
        }
      } finally {
        setIsCameraLoading(false);
      }
    };

    startStream();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [selectedCameraId]);

  // Re-attach Stream on Phase Change or when stream updates
  useEffect(() => {
    if (cameraStream) {
      const el = phase === 'kiosk' ? videoRef.current : miniVideoRef.current;
      if (el) {
        el.muted = true;
        el.defaultMuted = true;
        el.playsInline = true;
        if (el.srcObject !== cameraStream) {
          el.srcObject = cameraStream;
        }
        el.play().catch((err) => {
          console.warn('Phase change play error:', err);
        });
      }
    }
  }, [phase, cameraStream]);

  // Fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Preload Active Template Image & Detect Exact Cutout Windows
  const activeTemplate = templates.find((t) => t.id === selectedTemplateId) || templates[0];

  useEffect(() => {
    if (!activeTemplate?.path) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      frameImageRef.current = img;
      const w = img.naturalWidth || 682;
      const h = img.naturalHeight || 1024;
      setFrameDimensions({ width: w, height: h });

      try {
        const detected = await FrameHoleDetector.detectCutouts(activeTemplate.path, w, h, 6);
        if (detected && detected.length > 0) {
          setFrameCutouts(detected);
          setShotsCount(detected.length);
        } else {
          setFrameCutouts([
            { x: 39, y: 44, width: 605, height: 364 },
            { x: 39, y: 431, width: 605, height: 365 },
          ]);
        }
      } catch (err) {
        console.warn('Cutout detection notice:', err);
        setFrameCutouts([
          { x: 39, y: 44, width: 605, height: 364 },
          { x: 39, y: 431, width: 605, height: 365 },
        ]);
      }
    };
    img.src = activeTemplate.path;
    if (img.complete && img.naturalWidth > 0) {
      img.onload(new Event('load'));
    }
  }, [activeTemplate]);

  // Preload & Inspect GIF Frame Overlay (Reads Natural PNG Dimensions & Transparent Aperture)
  useEffect(() => {
    if (!gifOverlayPath) {
      setGifCutout(null);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      const w = img.naturalWidth || 720;
      const h = img.naturalHeight || 960;
      setGifDimensions({ width: w, height: h });

      try {
        const detected = await FrameHoleDetector.detectCutouts(gifOverlayPath, w, h, 6);
        if (detected && detected.length > 0) {
          const primary = detected.reduce((prev, curr) =>
            curr.width * curr.height > prev.width * prev.height ? curr : prev
          );
          setGifCutout(primary);
        } else {
          setGifCutout(null);
        }
      } catch {
        setGifCutout(null);
      }
    };
    img.src = gifOverlayPath;
    if (img.complete && img.naturalWidth > 0) {
      img.onload(new Event('load'));
    }
  }, [gifOverlayPath]);

  // Upload Custom PNG Frame
  const handleUploadCustomFrame = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      const newTmpl: TemplateItem = {
        id: 'custom_' + Date.now(),
        name: file.name.replace(/\.[^/.]+$/, ''),
        path: base64,
        base64,
        ratio: '2:3',
      };
      setTemplates((prev) => [newTmpl, ...prev]);
      setSelectedTemplateId(newTmpl.id);
    };
    reader.readAsDataURL(file);
  };

  // Upload Custom PNG Frame for GIF Overlay
  const handleUploadCustomGifFrame = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setGifOverlayPath(base64);
      setCustomGifFileName(file.name.replace(/\.[^/.]+$/, ''));
      setIsGifOverlayEnabled(true);
    };
    reader.readAsDataURL(file);
  };

  // Grab High-Resolution Frame from Camera
  const grabVideoFrame = (): string | null => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return null;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      const currentCam = cameras.find((c) => c.deviceId === selectedCameraId);
      const isFront = currentCam?.type === 'front';

      if (isFront) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.95);
    } catch (e) {
      console.error('Failed to capture frame from video canvas:', e);
      return null;
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTROLLED POSE FLOW (WITH JEDA / PAUSE BETWEEN SHOTS)
  // ═══════════════════════════════════════════════════════════════════════════

  const triggerPoseShot = (shotIdx: number) => {
    if (sessionStep === 'countdown' || sessionStep === 'processing') return;

    // Wake up video element if paused on mobile/desktop
    const video = videoRef.current;
    if (video) {
      video.muted = true;
      if (video.paused) {
        video.play().catch(() => {});
      }
    }

    if (!cameraStream || !video || video.videoWidth === 0) {
      alert('Kamera belum aktif atau belum siap. Silakan periksa izin kamera di browser Anda atau klik tombol Hubungkan Kamera.');
      return;
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
        executeShot(shotIdx);
      }
    }, 1000);
  };

  const executeShot = (shotIdx: number) => {
    setIsFlashing(true);
    playShutterSound();

    setTimeout(() => {
      setIsFlashing(false);
      let frameData = grabVideoFrame();

      // Retry once if readyState is sufficient
      if (!frameData && videoRef.current) {
        try {
          videoRef.current.play().catch(() => {});
          frameData = grabVideoFrame();
        } catch (e) {
          console.error('Retry grab failed:', e);
        }
      }

      if (!frameData) {
        alert('Gagal mengambil foto dari kamera. Pastikan kamera menyala dan izin kamera telah diberikan di browser.');
        setSessionStep('idle');
        return;
      }

      const nextPhotos = [...capturedPhotos];
      nextPhotos[shotIdx] = frameData;
      setCapturedPhotos(nextPhotos);

      const nextIdx = shotIdx + 1;
      if (nextIdx < shotsCount) {
        // ── JEDA TOTAL DISINI: Tunggu sentuhan untuk pose berikutnya! ──
        setCurrentShotIndex(nextIdx);
        setSessionStep('paused_between_poses');
      } else {
        // Semua pose selesai -> gabungkan ke frame!
        setSessionStep('processing');
        composeFinalPhoto(nextPhotos);
      }
    }, 180);
  };

  const handleRetakePreviousPose = () => {
    const prevIdx = Math.max(0, currentShotIndex - 1);
    setCurrentShotIndex(prevIdx);
    const trimmed = capturedPhotos.slice(0, prevIdx);
    setCapturedPhotos(trimmed);
    setSessionStep(prevIdx === 0 ? 'idle' : 'paused_between_poses');
  };

  const handleResetKiosk = () => {
    setCapturedPhotos([]);
    setCurrentShotIndex(0);
    setFinalPhotoDataUrl(null);
    setFinalGifDataUrl(null);
    setResultTab('photo');
    setSessionStep('idle');
  };

  // Keyboard Shortcut: Press ESC to exit Kiosk/Review mode back to Setup screen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (phase === 'kiosk' || phase === 'review') {
          handleResetKiosk();
          setPhase('setup');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase]);

  // ═══════════════════════════════════════════════════════════════════════════
  // PRECISE COMPOSITING: ALIGNED TO CUTOUT HOLES & NATIVE RESOLUTION
  // ═══════════════════════════════════════════════════════════════════════════
  const composeFinalPhoto = async (photos: string[]) => {
    try {
      const frameImg = frameImageRef.current;
      const canvasWidth = frameDimensions.width || frameImg?.naturalWidth || 682;
      const canvasHeight = frameDimensions.height || frameImg?.naturalHeight || 1024;

      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 1. Fill clean white background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // 2. Load captured photos
      const loadedPhotos: HTMLImageElement[] = await Promise.all(
        photos.map(
          (src) =>
            new Promise<HTMLImageElement>((resolve, reject) => {
              const img = new Image();
              img.onload = () => resolve(img);
              img.onerror = reject;
              img.src = src;
            })
        )
      );

      // 3. Draw Photos inside detected cutout holes
      const slots =
        frameCutouts.length >= photos.length
          ? frameCutouts
          : [
              { x: 39, y: 44, width: 605, height: 364 },
              { x: 39, y: 431, width: 605, height: 365 },
            ];

      for (let i = 0; i < photos.length; i++) {
        const slot = slots[i] || slots[0];
        const photoImg = loadedPhotos[i];
        if (photoImg) {
          drawCoverImage(ctx, photoImg, slot.x - 2, slot.y - 2, slot.width + 4, slot.height + 4, 12);
        }
      }

      // 4. Draw PNG Frame Overlay on top (100% 1:1 scale, NO stretching)
      if (frameImg && frameImg.complete && frameImg.naturalWidth > 0) {
        ctx.drawImage(frameImg, 0, 0, canvasWidth, canvasHeight);
      }

      const compositeDataUrl = canvas.toDataURL('image/jpeg', 0.95);
      setFinalPhotoDataUrl(compositeDataUrl);

      // 5. Generate Animated Boomerang GIF if photos > 1
      let gifDataUrl: string | null = null;
      if (photos.length > 1) {
        try {
          setIsGeneratingGif(true);
          const overlayToUse = isGifOverlayEnabled ? gifOverlayPath : null;
          const gifResult = await GifComposer.composeGif(photos, {
            playbackMode: 'boomerang',
            frameDelayMs: gifSpeedMs || 750,
            frameOverlayBase64: overlayToUse,
            width: gifDimensions.width,
            height: gifDimensions.height,
            cutoutSlot: isGifOverlayEnabled ? gifCutout : null,
          });
          gifDataUrl = gifResult.dataUrl;
          setFinalGifDataUrl(gifResult.dataUrl);
        } catch (gifErr) {
          console.warn('[GIF Generation Failed]:', gifErr);
        } finally {
          setIsGeneratingGif(false);
        }
      } else {
        setFinalGifDataUrl(null);
      }
      setResultTab('photo');

      // 6. Generate Photo ID & QR Code
      const photoId = 'mb_' + Math.random().toString(36).substring(2, 9);
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://minglebooth.com';
      const galleryUrl = `${origin}/p/${photoId}`;
      setGuestGalleryUrl(galleryUrl);

      const qrDataUrl = await QRCode.toDataURL(galleryUrl, {
        margin: 1,
        width: 320,
        color: { dark: '#000000', light: '#FFFFFF' },
      });
      setQrCodeDataUrl(qrDataUrl);

      // 7. Save locally to Tablet IndexedDB & LocalStorage
      try {
        saveOfflineCapture({
          photoId,
          eventId: selectedEventId,
          eventName: selectedEventName || 'MingleBooth Event',
          photoDataUrl: compositeDataUrl,
          gifDataUrl: gifDataUrl || null,
          hasGif: !!gifDataUrl,
          rawShots: photos.map((dataUrl, idx) => ({ index: idx + 1, dataUrl })),
          createdAt: new Date().toISOString(),
        }).catch(() => {});

        const localKey = 'mb_offline_captures';
        const existing = JSON.parse(localStorage.getItem(localKey) || '[]');
        existing.push({
          photoId,
          eventId: selectedEventId,
          createdAt: new Date().toISOString(),
          dataUrlLength: compositeDataUrl.length,
          hasGif: !!gifDataUrl,
          rawCount: photos.length,
        });
        localStorage.setItem(localKey, JSON.stringify(existing.slice(-20)));
      } catch {
        // Safe ignore
      }

      // 7b. Auto-Save to Tablet Device / External SSD
      if (autoSaveToDevice && typeof document !== 'undefined') {
        try {
          let savedToCustomSsd = false;

          // If operator connected custom SSD / Directory Handle
          if (customDirHandle) {
            try {
              const writeDataUrlToSubdir = async (subfolder: string, filename: string, dataUrl: string) => {
                const subDir = await customDirHandle.getDirectoryHandle(subfolder, { create: true });
                const fileHandle = await subDir.getFileHandle(filename, { create: true });
                const writable = await fileHandle.createWritable();
                let blob: Blob;
                if (dataUrl.includes(';base64,')) {
                  const base64Data = dataUrl.split(';base64,')[1];
                  const mime = dataUrl.split(';base64,')[0].replace('data:', '');
                  const byteCharacters = atob(base64Data);
                  const byteNumbers = new Array(byteCharacters.length);
                  for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                  }
                  blob = new Blob([new Uint8Array(byteNumbers)], { type: mime });
                } else {
                  const res = await fetch(dataUrl);
                  blob = await res.blob();
                }
                await writable.write(blob);
                await writable.close();
              };

              // 1. Write framed photo into Foto_Berbingkai/
              await writeDataUrlToSubdir('Foto_Berbingkai', `${photoId}_framed.jpg`, compositeDataUrl);

              // 2. Write GIF into Animasi_GIF/
              if (gifDataUrl) {
                await writeDataUrlToSubdir('Animasi_GIF', `${photoId}_loop.gif`, gifDataUrl);
              }

              // 3. Write each raw camera take into Foto_Mentahan/
              if (photos && photos.length > 0) {
                for (let i = 0; i < photos.length; i++) {
                  if (photos[i]) {
                    await writeDataUrlToSubdir('Foto_Mentahan', `${photoId}_pose_${i + 1}.jpg`, photos[i]);
                  }
                }
              }

              savedToCustomSsd = true;
            } catch (err) {
              console.warn('Custom SSD write error, falling back to download:', err);
            }
          }

          // Fallback standard download if custom SSD not connected
          if (!savedToCustomSsd) {
            const triggerBlobDownload = (url: string, filename: string) => {
              try {
                let blob: Blob;
                if (url.includes(';base64,')) {
                  const parts = url.split(';base64,');
                  const mime = parts[0].replace('data:', '') || 'application/octet-stream';
                  const bstr = atob(parts[1]);
                  let n = bstr.length;
                  const u8arr = new Uint8Array(n);
                  while (n--) {
                    u8arr[n] = bstr.charCodeAt(n);
                  }
                  blob = new Blob([u8arr], { type: mime });
                } else {
                  blob = new Blob([url], { type: 'application/octet-stream' });
                }

                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);

                // Revoke after download is initiated by browser
                setTimeout(() => {
                  URL.revokeObjectURL(blobUrl);
                }, 45000);
              } catch (err) {
                console.warn('Trigger blob download error:', err);
              }
            };

            const cleanName = (selectedEventName || 'MingleBooth').replace(/[^a-zA-Z0-9_-]/g, '_');
            // 1. Download composite photo
            triggerBlobDownload(compositeDataUrl, `${cleanName}_Foto_${photoId}.jpg`);

            // 2. Download GIF with safe delay so Safari handles queue smoothly
            if (gifDataUrl) {
              setTimeout(() => {
                triggerBlobDownload(gifDataUrl, `${cleanName}_Animasi_${photoId}.gif`);
              }, 1200);
            }
          }
        } catch (e) {
          console.warn('Auto-save notice:', e);
        }
      }

      // 8. Background Cloud Sync (Upload Photo, Raw Shots & GIF)
      if (navigator.onLine) {
        // Upload Framed Photo and Raw Camera Takes
        fetch('/api/sync/upload-capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            photoId,
            eventId: selectedEventId,
            fileDataUrl: compositeDataUrl,
            type: 'photo',
            rawShots: photos,
          }),
        }).catch(() => {});

        // Upload Animated GIF if created
        if (gifDataUrl) {
          fetch('/api/sync/upload-capture', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              photoId,
              eventId: selectedEventId,
              fileDataUrl: gifDataUrl,
              type: 'gif',
            }),
          }).catch(() => {});
        }
      }

      setPhase('review');
      setSessionStep('idle');
      setReviewCountdown(25);
    } catch (err) {
      console.error('Compositing failed:', err);
      setSessionStep('idle');
    }
  };

  const drawCoverImage = (
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    x: number,
    y: number,
    w: number,
    h: number,
    radius: number
  ) => {
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

    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;
    const offsetX = x + (w - drawW) / 2;
    const offsetY = y + (h - drawH) / 2;
    ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
    ctx.restore();
  };

  // Auto Reset Timer in Review Mode
  useEffect(() => {
    if (phase !== 'review') return;

    const timer = setInterval(() => {
      setReviewCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleResetKiosk();
          setPhase('kiosk');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [phase]);

  // Triple-tap exit lock
  const handleExitTap = () => {
    setExitTapCount((prev) => {
      const next = prev + 1;
      if (next >= 3) {
        setPhase('setup');
        handleResetKiosk();
        return 0;
      }
      setTimeout(() => setExitTapCount(0), 1200);
      return next;
    });
  };

  const currentCam = cameras.find((c) => c.deviceId === selectedCameraId);

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. PHASE: OPERATOR SETUP & HARDWARE CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════
  if (phase === 'setup') {
    return (
      <div className="flex flex-col h-full w-full bg-[#0A0A0C] text-[#EDEDED] overflow-y-auto font-sans">
        {/* Top App Bar */}
        <header className="h-16 px-6 border-b border-white/[0.06] flex items-center justify-between flex-shrink-0 bg-[#0F1014]">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo-minglebooth.png"
                alt="MingleBooth"
                style={{ height: '24px', width: 'auto', display: 'block', maxWidth: '140px' }}
                className="h-6 w-auto object-contain"
              />
              <span className="text-[11px] font-semibold text-neutral-400 tracking-wider uppercase pl-2 border-l border-white/10">
                Studio
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <span className="text-[11px] font-medium">{isOnline ? 'Online' : 'Offline'}</span>
            </div>

            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-neutral-400 hover:text-white transition-colors border border-white/[0.06]"
              title="Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Setup Body Grid */}
        <main className="flex-1 max-w-6xl w-full mx-auto p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Left Column: Camera View (7 Cols) */}
          <div className="md:col-span-7 flex flex-col gap-6">
            <div className="rounded-2xl bg-[#121318] border border-white/[0.06] p-5 flex flex-col gap-4 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Video className="w-4 h-4 text-neutral-300" />
                  <h2 className="text-sm font-semibold text-white">Kamera</h2>
                </div>
                <button
                  onClick={refreshCameraList}
                  disabled={isCameraLoading}
                  className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition-colors"
                >
                  <RefreshCw className={`w-3 h-3 ${isCameraLoading ? 'animate-spin' : ''}`} />
                  <span>Pindai Ulang</span>
                </button>
              </div>

              {/* Video Viewport */}
              <div className="w-full aspect-[4/3] rounded-xl bg-black relative overflow-hidden border border-white/[0.06] flex items-center justify-center">
                <video
                  ref={attachMiniVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${
                    currentCam?.type === 'front' ? 'scale-x-[-1]' : ''
                  }`}
                />
                {isCameraLoading && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center gap-2 text-xs text-white">
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Menghubungkan Kamera...</span>
                  </div>
                )}
                {cameraError && (
                  <div className="absolute inset-0 bg-black/85 p-4 flex flex-col items-center justify-center text-center gap-2 text-xs text-rose-400">
                    <p>{cameraError}</p>
                    <button
                      onClick={refreshCameraList}
                      className="px-3 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300"
                    >
                      Coba Lagi
                    </button>
                  </div>
                )}

                <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-md bg-black/75 backdrop-blur-md border border-white/10 text-[11px] font-medium text-white flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>{currentCam?.label || 'Kamera Terhubung'}</span>
                </div>
              </div>

              {/* Camera Selection List */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-neutral-400">Pilih Sumber Kamera:</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {cameras.map((cam) => {
                    const isSelected = cam.deviceId === selectedCameraId;
                    return (
                      <button
                        key={cam.deviceId}
                        onClick={() => setSelectedCameraId(cam.deviceId)}
                        className={`p-3 rounded-xl border text-left flex items-start gap-3 transition-all ${
                          isSelected
                            ? 'bg-white/[0.08] border-white/40 shadow-sm'
                            : 'bg-[#171820] border-white/[0.04] hover:border-white/15'
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            isSelected ? 'bg-white text-black' : 'bg-white/[0.06] text-neutral-400'
                          }`}
                        >
                          {cam.type === 'external' ? (
                            <Camera className="w-4 h-4" />
                          ) : (
                            <Smartphone className="w-4 h-4" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-white truncate">{cam.label}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-white flex-shrink-0" />}
                          </div>
                          <span className="text-[10px] text-neutral-400 block mt-0.5">
                            {cam.type === 'external'
                              ? 'Sony / Mirrorless via USB-C'
                              : cam.type === 'back'
                              ? 'Kamera Belakang'
                              : cam.type === 'front'
                              ? 'Kamera Depan'
                              : 'Kamera Bawaan'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Minimalist Sony Camera Accordion */}
                <div className="mt-1 p-3 rounded-xl bg-[#171820] border border-white/[0.06] flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-neutral-300">
                      Gunakan Kamera Sony / Mirrorless
                    </span>
                    <button
                      onClick={() => setShowSonyHelp(!showSonyHelp)}
                      className="text-[11px] text-neutral-400 hover:text-white font-medium flex items-center gap-1 transition-colors"
                    >
                      <span>{showSonyHelp ? 'Tutup panduan' : 'Lihat cara pasang'}</span>
                      <ChevronRight
                        className={`w-3 h-3 transition-transform ${showSonyHelp ? 'rotate-90' : ''}`}
                      />
                    </button>
                  </div>

                  {showSonyHelp && (
                    <div className="pt-2 border-t border-white/[0.06] text-[11px] text-neutral-400 space-y-1.5 leading-relaxed animate-fadeIn">
                      <p>1. Hubungkan kabel Micro-HDMI dari Sony ke dongle <strong>USB-C Video Capture Card</strong>.</p>
                      <p>2. Colok dongle ke port USB-C iPad / Android Tablet.</p>
                      <p>3. Di menu kamera Sony: Atur <em>HDMI Output &gt; Clean HDMI (1080p)</em>.</p>
                      <p>4. Tekan <strong>Pindai Ulang</strong> di atas untuk langsung mengaktifkan kamera Sony.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Event & Template (5 Cols) */}
          <div className="md:col-span-5 flex flex-col gap-6">
            <div className="rounded-2xl bg-[#121318] border border-white/[0.06] p-5 flex flex-col gap-5 shadow-xl">
              {/* Event Selector */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Acara Photobooth</span>
                </label>
                <select
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-[#171820] border border-white/[0.08] text-xs text-white focus:outline-none focus:border-white/30"
                >
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Template Frame Foto Cetak */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Bingkai Foto Cetak (.PNG)</span>
                  </label>
                  <button
                    onClick={() => customFileInputRef.current?.click()}
                    className="text-[11px] text-neutral-400 hover:text-white font-medium flex items-center gap-1 transition-colors"
                  >
                    <Upload className="w-3 h-3" />
                    <span>Upload PNG</span>
                  </button>
                  <input
                    ref={customFileInputRef}
                    type="file"
                    accept="image/png"
                    onChange={handleUploadCustomFrame}
                    className="hidden"
                  />
                </div>

                <div className="p-3 rounded-xl bg-[#171820] border border-white/[0.08] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-14 rounded bg-black/60 border border-white/10 overflow-hidden flex items-center justify-center flex-shrink-0">
                      {activeTemplate?.path && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={activeTemplate.path}
                          alt={activeTemplate.name}
                          className="w-full h-full object-contain"
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-white block truncate">
                        {cleanTemplateName(activeTemplate?.name || 'Template')}
                      </span>
                      <span className="text-[10px] text-neutral-400 mt-0.5 block">
                        Rasio {activeTemplate?.ratio || '2:3'} • {frameCutouts.length || 2} Slot Lubang Foto
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => setIsTemplateModalOpen(true)}
                    className="h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs font-medium text-white transition-colors flex-shrink-0"
                  >
                    Ganti
                  </button>
                </div>
              </div>

              {/* Template Frame Khusus Animasi GIF */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                    <Film className="w-3.5 h-3.5 text-white/80" />
                    <span>Bingkai Animasi GIF (.PNG)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    {gifOverlayPath && (
                      <button
                        onClick={() => setIsGifOverlayEnabled(!isGifOverlayEnabled)}
                        className={`text-[10px] font-medium px-2 py-0.5 rounded transition-colors ${
                          isGifOverlayEnabled
                            ? 'bg-white/[0.12] text-white border border-white/20'
                            : 'bg-white/[0.04] text-neutral-400 border border-white/[0.06]'
                        }`}
                      >
                        {isGifOverlayEnabled ? 'Aktif' : 'Polos'}
                      </button>
                    )}
                    <button
                      onClick={() => customGifFileInputRef.current?.click()}
                      className="text-[11px] text-neutral-400 hover:text-white font-medium flex items-center gap-1 transition-colors"
                    >
                      <Upload className="w-3 h-3" />
                      <span>Upload Frame GIF</span>
                    </button>
                    <input
                      ref={customGifFileInputRef}
                      type="file"
                      accept="image/png"
                      onChange={handleUploadCustomGifFrame}
                      className="hidden"
                    />
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#171820] border border-white/[0.08] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-14 rounded bg-black/60 border border-white/10 overflow-hidden flex items-center justify-center flex-shrink-0">
                      {isGifOverlayEnabled && gifOverlayPath ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={gifOverlayPath}
                          alt="GIF Frame Overlay"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="text-[9px] text-neutral-500 font-mono">POLOS</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-white block truncate">
                        {isGifOverlayEnabled ? customGifFileName : 'Tanpa Bingkai (Full Screen)'}
                      </span>
                      <span className="text-[10px] text-neutral-400 mt-0.5 block">
                        {isGifOverlayEnabled
                          ? `Format PNG ${gifDimensions.width}×${gifDimensions.height} • ${
                              gifCutout ? 'Bentuk Lubang Foto Terdeteksi Presisi' : 'Transparan Penuh'
                            }`
                          : 'Animasi GIF akan ditampilkan full frame tanpa border'}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      if (gifOverlayPath !== '/frames/wedding_gif_frame.png') {
                        setGifOverlayPath('/frames/wedding_gif_frame.png');
                        setCustomGifFileName('Wedding Floral GIF (Default)');
                        setIsGifOverlayEnabled(true);
                      } else {
                        customGifFileInputRef.current?.click();
                      }
                    }}
                    className="h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-xs font-medium text-white transition-colors flex-shrink-0"
                  >
                    {gifOverlayPath !== '/frames/wedding_gif_frame.png' ? 'Reset' : 'Ganti'}
                  </button>
                </div>

                {/* GIF Loop Speed Selector */}
                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#171820] border border-white/[0.04]">
                  <span className="text-[11px] text-neutral-400 font-medium">Kecepatan Loop GIF:</span>
                  <div className="flex items-center gap-1">
                    {[
                      { label: 'Cepat', val: 500 },
                      { label: 'Santai', val: 750 },
                      { label: 'Lambat', val: 950 },
                    ].map((spd) => (
                      <button
                        key={spd.val}
                        onClick={() => setGifSpeedMs(spd.val)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all ${
                          gifSpeedMs === spd.val
                            ? 'bg-white text-black font-semibold shadow-sm'
                            : 'bg-white/[0.04] text-neutral-400 hover:text-white'
                        }`}
                      >
                        {spd.label} ({spd.val}ms)
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Parameters: Countdown & Pose */}
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/[0.06]">
                {/* Countdown Options with OFF */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-neutral-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>Countdown</span>
                  </label>
                  <div className="grid grid-cols-4 gap-1">
                    {[0, 3, 5, 10].map((sec) => (
                      <button
                        key={sec}
                        onClick={() => setCountdownSeconds(sec)}
                        className={`h-8 rounded-lg text-xs font-medium border transition-all ${
                          countdownSeconds === sec
                            ? 'bg-white text-black border-white'
                            : 'bg-[#171820] text-neutral-300 border-white/[0.06] hover:border-white/15'
                        }`}
                      >
                        {sec === 0 ? 'OFF' : `${sec}s`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Shots Count */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-neutral-400 flex items-center gap-1">
                    <Camera className="w-3 h-3" />
                    <span>Jumlah Pose</span>
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {[1, 2, 4].map((shots) => (
                      <button
                        key={shots}
                        onClick={() => setShotsCount(shots)}
                        className={`h-8 rounded-lg text-xs font-medium border transition-all ${
                          shotsCount === shots
                            ? 'bg-white text-black border-white'
                            : 'bg-[#171820] text-neutral-300 border-white/[0.06] hover:border-white/15'
                        }`}
                      >
                        {shots} Pose
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Clean Tablet Storage & Offline Settings Card */}
              {/* Clean Tablet Storage & External SSD Settings Card */}
              <div className="p-3 rounded-xl bg-[#14151B] border border-white/[0.08] flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
                      <HardDrive className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white">Penyimpanan Tablet &amp; SSD</span>
                        {customFolderName ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-400/15 text-emerald-400 border border-emerald-400/30 flex items-center gap-1">
                            <FolderCheck className="w-2.5 h-2.5" />
                            SSD Aktif
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-400/10 text-emerald-400 border border-emerald-400/20">
                            Offline Ready
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-neutral-400 block mt-0.5">
                        {customFolderName
                          ? 'Tersimpan otomatis ke folder khusus di SSD & database lokal'
                          : 'Tersimpan otomatis di folder Unduhan tablet & database lokal'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setAutoSaveToDevice(!autoSaveToDevice)}
                    className={`h-7 px-3 rounded-lg text-xs font-semibold transition-all flex-shrink-0 ${
                      autoSaveToDevice
                        ? 'bg-emerald-500 text-black shadow-sm'
                        : 'bg-white/[0.08] text-neutral-400 hover:text-white'
                    }`}
                  >
                    {autoSaveToDevice ? 'Auto Simpan: ON' : 'Auto Simpan: OFF'}
                  </button>
                </div>

                {/* Selected SSD / Folder Display */}
                {customFolderName && (
                  <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-black/40 border border-emerald-500/30 text-[11px] text-emerald-300">
                    <div className="flex items-center gap-2 truncate">
                      <Folder className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      <span className="truncate font-mono">{customFolderName}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomDirHandle(null);
                        setCustomFolderName('');
                        localStorage.removeItem('mb_custom_folder_name');
                      }}
                      className="text-neutral-400 hover:text-rose-400 ml-2 p-0.5 transition-colors"
                      title="Lepas folder SSD ini"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Storage Management, SSD Picker & Test Print Buttons */}
                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={handlePickStorageDirectory}
                    disabled={isPickingFolder}
                    className="flex-1 h-8 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                    title="Pilih drive SSD atau folder eksternal untuk menyimpan foto secara langsung"
                  >
                    <FolderPlus className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{customFolderName ? 'Ganti SSD' : 'Pilih Folder / SSD'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowStorageModal(true)}
                    className="h-8 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                    title="Lihat riwayat foto offline tersimpan"
                  >
                    <HardDrive className="w-3.5 h-3.5 text-neutral-300" />
                    <span className="hidden sm:inline">Riwayat</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const testSvg =
                        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900"><rect width="600" height="900" fill="%23FFFFFF"/><rect x="24" y="24" width="552" height="852" fill="none" stroke="%23000000" stroke-width="4"/><text x="300" y="420" font-family="sans-serif" font-size="28" font-weight="bold" text-anchor="middle" fill="%23000000">MINGLEBOOTH PRINTER TEST</text><text x="300" y="470" font-family="sans-serif" font-size="16" text-anchor="middle" fill="%23666666">Koneksi Cetak Berhasil Siap Pakai</text></svg>';
                      handlePrintPhoto(testSvg);
                    }}
                    className="h-8 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                    title="Uji coba printer sebelum acara"
                  >
                    <Printer className="w-3.5 h-3.5 text-neutral-300" />
                    <span>Tes Cetak</span>
                  </button>
                </div>
              </div>

              {/* Main Launch Button */}
              <button
                onClick={() => {
                  handleResetKiosk();
                  setPhase('kiosk');
                }}
                className="w-full h-12 mt-1 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-xs tracking-wider uppercase flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.99]"
              >
                <Play className="w-4 h-4 fill-black" />
                <span>Mulai Photobooth</span>
              </button>

              <p className="text-[11px] text-neutral-500 text-center leading-relaxed">
                Mode full layar 1 tablet: kamera bersih tanpa frame saat memotret, foto berbingkai otomatis tampil di samping setelah selesai.
              </p>
            </div>
          </div>
        </main>

        {/* Modal Pemilihan Template Frame */}
        {isTemplateModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-fadeIn select-none">
            <div className="max-w-2xl w-full bg-[#121318] border border-white/[0.08] rounded-2xl p-6 flex flex-col gap-4 shadow-2xl max-h-[85vh]">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">Pilih Template Frame</h3>
                  <p className="text-xs text-neutral-400">Pilih template frame PNG untuk sesi foto</p>
                </div>
                <button
                  onClick={() => setIsTemplateModalOpen(false)}
                  className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 overflow-y-auto pr-1">
                {templates.map((tmpl, idx) => {
                  const isSelected = tmpl.id === selectedTemplateId;
                  return (
                    <button
                      key={tmpl.id}
                      onClick={() => {
                        setSelectedTemplateId(tmpl.id);
                        setIsTemplateModalOpen(false);
                      }}
                      className={`p-3 rounded-xl border text-left flex flex-col gap-2 transition-all ${
                        isSelected
                          ? 'bg-white/[0.08] border-white/50 shadow-sm'
                          : 'bg-[#171820] border-white/[0.04] hover:border-white/20'
                      }`}
                    >
                      <div className="w-full aspect-[2/3] rounded-lg bg-black/60 border border-white/10 overflow-hidden flex items-center justify-center p-1">
                        {tmpl.path && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={tmpl.path}
                            alt={tmpl.name}
                            className="w-full h-full object-contain"
                          />
                        )}
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-white block truncate">
                          {cleanTemplateName(tmpl.name, idx)}
                        </span>
                        <span className="text-[10px] text-neutral-400 block mt-0.5">
                          {tmpl.ratio}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Modal Pengelola Penyimpanan Tablet (Offline Storage Manager) */}
        {showStorageModal && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-fadeIn select-none">
            <div className="max-w-3xl w-full bg-[#121318] border border-white/15 rounded-3xl p-5 sm:p-6 flex flex-col gap-4 shadow-2xl max-h-[88vh] overflow-hidden">
              {/* Header Modal */}
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <HardDrive className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Pengelola Penyimpanan Tablet</h3>
                    <p className="text-xs text-neutral-400">
                      Riwayat foto &amp; GIF yang tersimpan di memori tablet (Offline IndexedDB)
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowStorageModal(false)}
                  className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-neutral-300 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Summary, Scope Filter & Controls */}
              <div className="flex flex-col gap-3 p-3.5 rounded-2xl bg-black/50 border border-white/[0.06] text-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="text-center px-3 py-1 rounded-xl bg-white/[0.06] border border-white/10">
                      <span className="block text-base font-bold text-emerald-400 font-mono">
                        {offlineStorageItems.length}
                      </span>
                      <span className="text-[9px] text-neutral-400">Sesi Tersimpan</span>
                    </div>
                    <div className="text-[11px] text-neutral-300 leading-tight">
                      <span className="font-semibold block text-white">
                        {storageFilterScope === 'current' ? `Acara: ${selectedEventName}` : 'Seluruh Riwayat Tablet'}
                      </span>
                      <span className="text-neutral-400">
                        {storageFilterScope === 'current'
                          ? 'Menampilkan hanya foto dari acara yang sedang aktif dipilih.'
                          : 'Menampilkan riwayat dari seluruh acara yang pernah dibuat di tablet ini.'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => loadOfflineItems()}
                      className="h-8 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-neutral-300 hover:text-white text-xs flex items-center gap-1.5 transition-colors"
                      title="Segarkan daftar"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Muat Ulang</span>
                    </button>
                    {offlineStorageItems.length > 0 && (
                      <button
                        onClick={async () => {
                          const isCurrent = storageFilterScope === 'current';
                          const msg = isCurrent
                            ? `Hapus seluruh cache riwayat foto acara "${selectedEventName}" di tablet ini?`
                            : 'Kosongkan seluruh riwayat foto SEMUA acara di memori tablet ini?';
                          if (confirm(msg)) {
                            await clearOfflineCaptures(isCurrent ? selectedEventId : 'all');
                            await loadOfflineItems();
                          }
                        }}
                        className="h-8 px-2.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs flex items-center gap-1.5 transition-colors border border-rose-500/20"
                        title="Bersihkan cache memori tablet"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{storageFilterScope === 'current' ? 'Hapus Cache Acara Ini' : 'Kosongkan Semua'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Scope Filter Tabs */}
                <div className="flex items-center gap-1.5 pt-1 border-t border-white/[0.06]">
                  <button
                    type="button"
                    onClick={() => {
                      setStorageFilterScope('current');
                      loadOfflineItems('current');
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                      storageFilterScope === 'current'
                        ? 'bg-white text-black font-semibold shadow-sm'
                        : 'bg-white/[0.04] text-neutral-400 hover:text-white'
                    }`}
                  >
                    🎯 Acara Aktif: {selectedEventName}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStorageFilterScope('all');
                      loadOfflineItems('all');
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                      storageFilterScope === 'all'
                        ? 'bg-white text-black font-semibold shadow-sm'
                        : 'bg-white/[0.04] text-neutral-400 hover:text-white'
                    }`}
                  >
                    🌐 Semua Riwayat Tablet
                  </button>
                </div>
              </div>

              {/* Items List / Grid */}
              <div className="flex-1 overflow-y-auto pr-1 min-h-[220px]">
                {isStorageLoading ? (
                  <div className="py-16 text-center text-xs text-neutral-500 flex flex-col items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    <span>Membaca memori tablet...</span>
                  </div>
                ) : offlineStorageItems.length === 0 ? (
                  <div className="py-16 text-center text-xs text-neutral-500 flex flex-col items-center justify-center gap-2 border border-dashed border-white/10 rounded-2xl">
                    <HardDrive className="w-8 h-8 text-neutral-600" />
                    <span className="text-neutral-300 font-medium">
                      {storageFilterScope === 'current'
                        ? `Belum Ada Riwayat Foto untuk "${selectedEventName}"`
                        : 'Belum Ada Riwayat Foto di Tablet'}
                    </span>
                    <p className="max-w-xs text-[11px] text-neutral-500">
                      {storageFilterScope === 'current'
                        ? 'Acara baru ini masih bersih dan siap digunakan. Foto yang baru diambil nanti akan tercatat di sini.'
                        : 'Setelah sesi photobooth selesai, hasil foto dan GIF akan otomatis tercatat di sini.'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {offlineStorageItems.map((item) => (
                      <div
                        key={item.photoId}
                        className="p-3 rounded-2xl bg-[#171820] border border-white/[0.06] flex items-center gap-3"
                      >
                        {/* Thumbnail */}
                        <div className="w-16 h-20 bg-black rounded-lg border border-white/10 overflow-hidden flex-shrink-0 flex items-center justify-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.photoDataUrl}
                            alt={item.photoId}
                            className="w-full h-full object-contain"
                          />
                        </div>

                        {/* Info & Action Buttons */}
                        <div className="flex-1 min-w-0 flex flex-col justify-between h-full py-0.5">
                          <div>
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs font-semibold text-white truncate">{item.photoId}</span>
                              {item.hasGif && (
                                <span className="px-1.5 py-0.2 rounded text-[8px] font-bold bg-amber-400/20 text-amber-300">
                                  GIF
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-neutral-400 block truncate mt-0.5">
                              {item.eventName || 'Photobooth Session'}
                            </span>
                            <span className="text-[9px] text-neutral-500 block">
                              {new Date(item.createdAt).toLocaleTimeString('id-ID', {
                                hour: '2-digit',
                                minute: '2-digit',
                                day: 'numeric',
                                month: 'short',
                              })}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 pt-2">
                            <a
                              href={item.photoDataUrl}
                              download={`MingleBooth_Foto_${item.photoId}.jpg`}
                              className="h-7 px-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.15] text-[10px] font-semibold text-white flex items-center gap-1 transition-colors"
                              title="Unduh foto berbingkai"
                            >
                              <Download className="w-3 h-3" />
                              <span>Foto</span>
                            </a>

                            {item.hasGif && item.gifDataUrl && (
                              <a
                                href={item.gifDataUrl}
                                download={`MingleBooth_Animasi_${item.photoId}.gif`}
                                className="h-7 px-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.15] text-[10px] font-semibold text-amber-300 flex items-center gap-1 transition-colors"
                                title="Unduh animasi GIF"
                              >
                                <Film className="w-3 h-3" />
                                <span>GIF</span>
                              </a>
                            )}

                            <button
                              onClick={() => handlePrintPhoto(item.photoDataUrl)}
                              className="h-7 px-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.15] text-[10px] font-semibold text-neutral-300 hover:text-white flex items-center gap-1 transition-colors"
                              title="Cetak foto ini"
                            >
                              <Printer className="w-3 h-3" />
                              <span>Cetak</span>
                            </button>

                            <button
                              onClick={async () => {
                                await deleteOfflineCapture(item.photoId);
                                await loadOfflineItems();
                              }}
                              className="h-7 w-7 rounded-lg bg-white/[0.04] hover:bg-rose-500/20 text-neutral-400 hover:text-rose-400 flex items-center justify-center transition-colors ml-auto"
                              title="Hapus dari cache"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs">
                <span className="text-[11px] text-neutral-500">
                  Total {offlineStorageItems.length} foto tersimpan secara aman di tablet ini
                </span>
                <button
                  onClick={() => setShowStorageModal(false)}
                  className="h-8 px-4 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-xs transition-colors"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Panduan Penyimpanan SSD di iPad Safari */}
        {showIpadGuideModal && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
            <div className="max-w-md w-full bg-[#121318] border border-white/20 rounded-3xl p-6 flex flex-col gap-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <Folder className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Panduan Simpan ke SSD di iPad</h3>
                    <p className="text-xs text-neutral-400">Pengaturan Safari iPadOS (Hanya 10 Detik)</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowIpadGuideModal(false)}
                  className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-neutral-300 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="text-xs text-neutral-300 space-y-3">
                <p className="text-neutral-400 leading-relaxed">
                  Pada iPad (Safari), sistem keamanan Apple mewajibkan pemilihan lokasi unduhan langsung melalui Pengaturan iPad:
                </p>

                <div className="p-3 rounded-2xl bg-[#171820] border border-white/[0.06] space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-[11px] flex-shrink-0 mt-0.5">
                      1
                    </div>
                    <div>
                      <span className="font-semibold text-white">Colokkan SSD / Flashdisk USB-C</span>
                      <p className="text-[11px] text-neutral-400">Sambungkan drive eksternal Anda ke port USB-C iPad.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-[11px] flex-shrink-0 mt-0.5">
                      2
                    </div>
                    <div>
                      <span className="font-semibold text-white">Buka Pengaturan iPad</span>
                      <p className="text-[11px] text-neutral-400">Pilih menu <strong className="text-white">Safari</strong> &gt; <strong className="text-white">Unduhan (Downloads)</strong>.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-[11px] flex-shrink-0 mt-0.5">
                      3
                    </div>
                    <div>
                      <span className="font-semibold text-white">Pilih SSD &amp; Buat Folder Khusus</span>
                      <p className="text-[11px] text-neutral-400">Pilih opsi <strong className="text-white">Lainnya...</strong> lalu arahkan ke SSD Anda (Anda bisa buat folder baru khusus acara).</p>
                    </div>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[11px] flex items-center gap-2">
                  <Info className="w-4 h-4 flex-shrink-0 text-blue-400" />
                  <span>Setelah diatur, setiap foto baru dengan <strong>Auto Simpan: ON</strong> akan langsung masuk otomatis ke folder SSD tersebut!</span>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-white/[0.08]">
                <button
                  onClick={() => setShowIpadGuideModal(false)}
                  className="h-8 px-5 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-xs transition-colors"
                >
                  Saya Mengerti
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. PHASE: ACTIVE PHOTOBOOTH KIOSK (FULL SCREEN 1 TAB EDGE-TO-EDGE)
  // PERSIS SEPERTI FOTO IPAD OPERATOR: LAYAR PENUH, FRAME TIDAK AKTIF SAAT FOTO
  // ═══════════════════════════════════════════════════════════════════════════
  if (phase === 'kiosk') {
    return (
      <div className="relative h-screen w-screen bg-black overflow-hidden select-none touch-none font-sans">
        {/* Shutter White Flash Screen */}
        {isFlashing && (
          <div className="absolute inset-0 z-50 bg-white pointer-events-none animate-flash" />
        )}

        {/* ── 100% FULL SCREEN CAMERA FEED (EDGE-TO-EDGE 1 TAB) ── */}
        <video
          ref={attachVideoRef}
          autoPlay
          playsInline
          muted
          className={`absolute inset-0 w-full h-full object-cover ${
            currentCam?.type === 'front' ? 'scale-x-[-1]' : ''
          }`}
        />

        {/* ── CAMERA INACTIVE / PERMISSION OVERLAY ── */}
        {(!cameraStream || cameraError) && (
          <div className="absolute inset-0 z-40 bg-neutral-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center select-none">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-4">
              <CameraOff className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Kamera Belum Terhubung / Aktif</h2>
            <p className="text-xs sm:text-sm text-neutral-400 max-w-md mb-6 leading-relaxed">
              {cameraError ||
                'Browser Chrome belum mendapatkan izin akses kamera atau kamera eksternal belum tersambung. Klik tombol di bawah atau izinkan akses kamera di ikon gembok/setelan browser (kiri URL minglebooth.id).'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => refreshCameraList()}
                className="h-11 px-6 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-xs flex items-center gap-2 shadow-lg transition-all active:scale-95"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Hubungkan Ulang Kamera</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  handleResetKiosk();
                  setPhase('setup');
                }}
                className="h-11 px-5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white font-semibold text-xs transition-colors"
              >
                Kembali ke Pengaturan
              </button>
            </div>
          </div>
        )}

        {/* Subtle Event Watermark (Floating Elegantly in Top-Center like Reference Photo) */}
        <div className="absolute top-6 inset-x-0 z-20 flex flex-col items-center justify-center pointer-events-none text-center">
          <span className="text-sm font-semibold tracking-wider text-white/90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
            {currentEvent.hostNames || currentEvent.name}
          </span>
          <span className="text-[11px] font-medium text-white/70 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
            {currentEvent.date || 'Photobooth Edition'}
          </span>
        </div>

        {/* ── TOP-LEFT PICTURE-IN-PICTURE THUMBNAILS (SEPERTI DI FOTO REFERENSI ANDA) ── */}
        {capturedPhotos.length > 0 && sessionStep !== 'countdown' && (
          <div className="absolute top-6 left-6 z-30 flex flex-col gap-2 pointer-events-none animate-fadeIn">
            {capturedPhotos.map((photo, pIdx) => (
              <div
                key={pIdx}
                className="w-20 h-24 sm:w-24 sm:h-28 rounded-xl overflow-hidden border-2 border-white/80 shadow-[0_8px_24px_rgba(0,0,0,0.7)] bg-black"
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

        {/* Top-Right: Exit / Settings Button (Sangat Jelas & Mudah Diklik di Laptop / Tablet) */}
        <div className="absolute top-6 right-6 z-30 pointer-events-auto flex items-center gap-2">
          <button
            onClick={() => {
              handleResetKiosk();
              setPhase('setup');
            }}
            className="h-10 px-3.5 rounded-full bg-black/60 hover:bg-black/85 backdrop-blur-md border border-white/25 flex items-center gap-2 text-white/90 hover:text-white text-xs font-semibold shadow-2xl active:scale-95 transition-all hover:border-white/40"
            title="Kembali ke Layar Pengaturan (atau tekan tombol ESC di keyboard)"
          >
            <ChevronLeft className="w-4 h-4 text-white" />
            <span>Kembali ke Pengaturan</span>
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
            <span className="text-xs font-bold tracking-widest uppercase text-white drop-shadow-md bg-black/60 px-4 py-1.5 rounded-full mt-4">
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

        {/* ── BOTTOM CONTROLS: CIRCULAR & PILL BUTTONS (SEPERTI REFERENSI IPAD BOOTH) ── */}

        {/* STATE 1: IDLE (SIAP FOTO POSE 1) */}
        {sessionStep === 'idle' && (
          <div className="absolute bottom-10 inset-x-0 z-20 flex flex-col items-center justify-center pointer-events-auto">
            <button
              onClick={() => triggerPoseShot(0)}
              className="group px-9 py-4 rounded-full bg-white text-black font-bold text-sm tracking-wider uppercase flex items-center gap-3 shadow-[0_10px_35px_rgba(0,0,0,0.6)] active:scale-95 transition-all hover:bg-neutral-200"
            >
              <Camera className="w-5 h-5 fill-black" />
              <span>SENTUH UNTUK FOTO 1</span>
            </button>
            <span className="text-[11px] font-medium text-white/90 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] mt-2.5">
              Total {shotsCount} Pose bergantian santai
            </span>
          </div>
        )}

        {/* STATE 2: JEDA / PAUSE ANTAR POSE (WAITING FOR NEXT POSE TAP) */}
        {sessionStep === 'paused_between_poses' && (
          <div className="absolute bottom-10 inset-x-4 z-20 flex flex-col items-center justify-center pointer-events-auto gap-3">
            <button
              onClick={() => triggerPoseShot(currentShotIndex)}
              className="px-9 py-4 rounded-full bg-white text-black font-bold text-sm tracking-wider uppercase flex items-center gap-3 shadow-[0_10px_35px_rgba(0,0,0,0.6)] active:scale-95 transition-all hover:bg-neutral-200 animate-pulse"
            >
              <Camera className="w-5 h-5 fill-black" />
              <span>SENTUH UNTUK FOTO {currentShotIndex + 1}</span>
            </button>

            <button
              onClick={handleRetakePreviousPose}
              className="text-xs text-white/90 hover:text-white flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-black/50 backdrop-blur-md border border-white/20 transition-colors shadow-md"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Ulangi Pose {currentShotIndex}</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. PHASE: HASIL TAMPIL DI SAMPING (SIDE-BY-SIDE SPLIT VIEW)
  // SISI KIRI: FOTO SUDAH BERBINGKAI UTUH | SISI KANAN: QR CODE BESAR
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="relative h-screen w-screen bg-[#07080A] text-white flex flex-col justify-between p-6 sm:p-8 select-none font-sans overflow-hidden">
      {/* Top Header */}
      <header className="w-full max-w-6xl mx-auto flex items-center justify-between border-b border-white/[0.08] pb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center font-bold text-xs shadow-md">
            ✓
          </div>
          <div>
            <h2 className="text-base font-semibold text-white tracking-wide">Foto Berhasil Dibuat</h2>
            <p className="text-xs text-neutral-400">Silakan scan QR code di samping untuk mengunduh ke HP Anda</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              handleResetKiosk();
              setPhase('setup');
            }}
            className="h-9 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors"
            title="Kembali ke layar Pengaturan (atau tekan ESC di keyboard)"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-neutral-300" />
            <span>Pengaturan</span>
          </button>

          <button
            onClick={() => setShowEventGalleryModal(true)}
            className="h-9 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors"
          >
            <Images className="w-3.5 h-3.5 text-neutral-300" />
            <span>🖼️ Galeri Acara</span>
          </button>

          <div className="text-right hidden sm:block">
            <span className="text-xs font-medium text-neutral-300">Siap dalam {reviewCountdown}s</span>
          </div>
          <button
            onClick={() => {
              handleResetKiosk();
              setPhase('kiosk');
            }}
            className="px-5 py-2 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-xs transition-colors shadow-md"
          >
            Foto Tamu Berikutnya
          </button>
        </div>
      </header>

      {/* ── MAIN CONTENT: SIDE-BY-SIDE (FOTO & GIF DI SAMPING QR CODE) ── */}
      <main className="flex-1 w-full max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-center gap-8 lg:gap-12 py-4 min-h-0">
        {/* SISI KIRI: PREVIEW (FOTO BERBINGKAI & ANIMASI GIF BOOMERANG) */}
        <div className="flex-1 h-full max-h-[72vh] flex flex-col items-center justify-center min-w-0 gap-3">
          {/* Toggle Switch between Foto & GIF if GIF exists */}
          {finalGifDataUrl && (
            <div className="flex items-center p-1 rounded-xl bg-white/[0.06] border border-white/[0.1] backdrop-blur-md shadow-sm">
              <button
                onClick={() => setResultTab('photo')}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  resultTab === 'photo'
                    ? 'bg-white text-black shadow'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Foto Berbingkai</span>
              </button>
              <button
                onClick={() => setResultTab('gif')}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  resultTab === 'gif'
                    ? 'bg-white text-black shadow'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Film className="w-3.5 h-3.5" />
                <span>Animasi GIF</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 font-bold ml-0.5">
                  LOOP
                </span>
              </button>
            </div>
          )}

          <div
            style={{
              aspectRatio:
                resultTab === 'photo'
                  ? `${frameDimensions.width} / ${frameDimensions.height}`
                  : `${gifDimensions.width} / ${gifDimensions.height}`,
            }}
            className="h-full max-h-[64vh] rounded-2xl bg-black border border-white/[0.1] overflow-hidden shadow-[0_15px_40px_rgba(0,0,0,0.8)] flex items-center justify-center p-1 relative transition-all"
          >
            {resultTab === 'photo' ? (
              finalPhotoDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={finalPhotoDataUrl}
                  alt="Foto Berbingkai"
                  className="w-full h-full object-contain rounded-xl"
                />
              ) : (
                <div className="text-xs text-neutral-400">Memuat foto...</div>
              )
            ) : (
              finalGifDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={finalGifDataUrl}
                  alt="Animasi GIF Boomerang"
                  className="w-full h-full object-contain rounded-xl"
                />
              ) : (
                <div className="text-xs text-neutral-400">Memuat GIF...</div>
              )
            )}
          </div>
        </div>

        {/* SISI KANAN: QR CODE BESAR UNTUK SCAN TAMU & TOMBOL AKSI */}
        <div className="w-full md:w-[380px] flex flex-col items-center justify-center gap-4 p-5 sm:p-6 rounded-3xl bg-[#121318] border border-white/[0.08] shadow-2xl flex-shrink-0">
          <div className="p-3 bg-white rounded-2xl shadow-xl">
            {qrCodeDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrCodeDataUrl}
                alt="Scan QR Code"
                className="w-48 h-48 sm:w-56 sm:h-56 object-contain"
              />
            ) : (
              <div className="w-48 h-48 bg-neutral-200 flex items-center justify-center text-xs text-black">
                Memuat QR Code...
              </div>
            )}
          </div>

          <div className="text-center">
            <span className="text-sm font-semibold text-white block">Arahkan Kamera HP ke QR Code</span>
            <span className="text-[11px] text-neutral-400 mt-0.5 block leading-tight">
              {finalGifDataUrl
                ? 'Unduh Foto Cetak HD & Animasi GIF langsung di HP Anda'
                : 'Unduh resolusi tinggi langsung tanpa perlu aplikasi'}
            </span>
          </div>

          {/* Action Buttons: Direct Print & In-Booth Gallery */}
          <div className="flex flex-col gap-2 w-full pt-1">
            {/* Primary Direct Print Button */}
            <button
              onClick={() => handlePrintPhoto(finalPhotoDataUrl)}
              className="w-full h-11 rounded-xl bg-white hover:bg-neutral-200 text-black font-bold text-xs tracking-wider uppercase flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98]"
            >
              <Printer className="w-4 h-4 text-black" />
              <span>Cetak Foto Langsung</span>
            </button>

            {/* In-Booth Event Gallery Button */}
            <button
              onClick={() => setShowEventGalleryModal(true)}
              className="w-full h-10 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              <Images className="w-4 h-4 text-neutral-300" />
              <span>🖼️ Galeri Acara (Lihat Semua Foto)</span>
            </button>

            {/* Secondary Actions: Download Foto & GIF */}
            <div className="flex items-center gap-2 w-full pt-0.5">
              {finalPhotoDataUrl && (
                <a
                  href={finalPhotoDataUrl}
                  download={`MingleBooth_Foto_${Date.now()}.jpg`}
                  className="flex-1 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-medium text-white flex items-center justify-center gap-1.5 transition-colors border border-white/[0.08]"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh Foto</span>
                </a>
              )}

              {finalGifDataUrl && (
                <a
                  href={finalGifDataUrl}
                  download={`MingleBooth_Animasi_${Date.now()}.gif`}
                  className="flex-1 h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-medium text-white flex items-center justify-center gap-1.5 transition-colors border border-white/[0.08]"
                >
                  <Film className="w-3.5 h-3.5 text-amber-400" />
                  <span>Unduh GIF</span>
                </a>
              )}

              <button
                onClick={() => {
                  if (navigator.share && finalPhotoDataUrl) {
                    navigator.share({
                      title: 'MingleBooth Photobooth',
                      text: 'Foto & Animasi GIF dari MingleBooth!',
                      url: guestGalleryUrl,
                    }).catch(() => {});
                  }
                }}
                className="h-9 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-white text-xs font-medium flex items-center justify-center gap-1 border border-white/[0.08]"
                title="Bagikan"
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Footer */}
      <footer className="w-full max-w-6xl mx-auto border-t border-white/[0.08] pt-3 flex items-center justify-between text-xs text-neutral-500 flex-shrink-0">
        <span>Tersimpan di memori lokal tablet &amp; cloud gallery</span>
        <button
          onClick={() => {
            handleResetKiosk();
            setPhase('setup');
          }}
          className="text-neutral-400 hover:text-white transition-colors"
        >
          Kembali ke Pengaturan
        </button>
      </footer>

      {/* ── Modal In-Kiosk Event Gallery (Tamu Melihat Semua Foto Langsung) ── */}
      {showEventGalleryModal && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-fadeIn select-none">
          <div className="max-w-4xl w-full bg-[#121318] border border-white/15 rounded-3xl p-5 sm:p-6 flex flex-col gap-4 shadow-2xl max-h-[90vh] overflow-hidden">
            {/* Header Modal */}
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/20 text-white flex items-center justify-center">
                  <Images className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    Galeri Foto Acara: {selectedEventName || 'Wedding Bayu & Irma'}
                  </h3>
                  <p className="text-xs text-neutral-400">
                    Koleksi seluruh foto yang telah diambil oleh tamu di acara ini
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={`/gallery/${selectedEventId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="h-8 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-neutral-300 hover:text-white text-xs flex items-center gap-1.5 transition-colors"
                  title="Buka galeri publik di tab baru"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Buka di Web</span>
                </a>
                <button
                  onClick={() => {
                    setShowEventGalleryModal(false);
                    setPreviewGalleryPhoto(null);
                  }}
                  className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-neutral-300 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center bg-black/50 rounded-xl p-0.5 border border-white/[0.06] text-xs">
                <button
                  onClick={() => setGalleryFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    galleryFilter === 'all'
                      ? 'bg-white text-black font-semibold shadow-sm'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Semua ({eventGalleryPhotos.length})
                </button>
                <button
                  onClick={() => setGalleryFilter('photo')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    galleryFilter === 'photo'
                      ? 'bg-white text-black font-semibold shadow-sm'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Foto Cetak ({eventGalleryPhotos.filter((p) => p.thumbUrl || p.fullUrl).length})
                </button>
                <button
                  onClick={() => setGalleryFilter('gif')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-all ${
                    galleryFilter === 'gif'
                      ? 'bg-white text-black font-semibold shadow-sm'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>GIF ({eventGalleryPhotos.filter((p) => p.hasGif).length})</span>
                </button>
                <button
                  onClick={() => setGalleryFilter('raw')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-all ${
                    galleryFilter === 'raw'
                      ? 'bg-white text-black font-semibold shadow-sm'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <Camera className="w-3 h-3 text-blue-400" />
                  <span>
                    Foto Mentahan ({eventGalleryPhotos.reduce((acc, p) => acc + (p.rawShots?.length || 0), 0)})
                  </span>
                </button>
              </div>

              <button
                onClick={loadEventGallery}
                className="h-8 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-neutral-400 hover:text-white text-xs flex items-center gap-1 transition-colors flex-shrink-0"
                title="Muat ulang foto terbaru"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Segarkan</span>
              </button>
            </div>

            {/* Gallery Grid / Content */}
            <div className="flex-1 overflow-y-auto pr-1 min-h-[280px]">
              {isEventGalleryLoading ? (
                <div className="py-20 text-center text-xs text-neutral-500 flex flex-col items-center justify-center gap-3">
                  <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span>Memuat foto-foto acara...</span>
                </div>
              ) : eventGalleryPhotos.length === 0 ? (
                <div className="py-20 text-center text-xs text-neutral-500 flex flex-col items-center justify-center gap-2 border border-dashed border-white/10 rounded-2xl">
                  <Images className="w-8 h-8 text-neutral-600" />
                  <span className="text-neutral-300 font-medium">Belum Ada Foto di Acara Ini</span>
                  <p className="max-w-xs text-[11px] text-neutral-500">
                    Foto yang diambil di photobooth ini akan langsung muncul di sini.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {eventGalleryPhotos
                    .filter((p) => {
                      if (galleryFilter === 'photo') return !!(p.thumbUrl || p.fullUrl);
                      if (galleryFilter === 'gif') return !!p.hasGif;
                      if (galleryFilter === 'raw') return p.rawShots && p.rawShots.length > 0;
                      return true;
                    })
                    .map((photo) => {
                      const thumbSrc =
                        galleryFilter === 'raw' && photo.rawShots && photo.rawShots.length > 0
                          ? photo.rawShots[0].url
                          : photo.thumbUrl || photo.fullUrl;

                      return (
                        <div
                          key={photo.photoId}
                          onClick={() => {
                            setPreviewGalleryPhoto(photo);
                            if (galleryFilter === 'gif' && photo.hasGif) {
                              setPreviewGalleryTab('gif');
                            } else if (galleryFilter === 'raw' && photo.rawShots && photo.rawShots.length > 0) {
                              setPreviewGalleryTab(`raw_${photo.rawShots[0].index}`);
                            } else {
                              setPreviewGalleryTab('photo');
                            }
                          }}
                          className="group relative rounded-2xl bg-[#171820] border border-white/[0.08] hover:border-white/30 overflow-hidden cursor-pointer transition-all flex flex-col shadow-md"
                        >
                          <div className="w-full aspect-[3/4] bg-black relative overflow-hidden flex items-center justify-center">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={thumbSrc}
                              alt={photo.photoId}
                              loading="lazy"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                            <div className="absolute top-2 left-2 flex flex-col gap-1">
                              {photo.hasGif && (
                                <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-black/70 backdrop-blur-md text-amber-300 border border-amber-400/30 flex items-center gap-1">
                                  <Sparkles className="w-2 h-2 text-amber-400" />
                                  GIF
                                </span>
                              )}
                              {photo.rawShots && photo.rawShots.length > 0 && (
                                <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-black/70 backdrop-blur-md text-blue-300 border border-blue-400/30 flex items-center gap-1">
                                  <Camera className="w-2 h-2 text-blue-400" />
                                  {photo.rawShots.length} Mentah
                                </span>
                              )}
                            </div>
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <span className="text-xs font-semibold text-white px-3 py-1.5 rounded-lg bg-white/20 backdrop-blur-md">
                                Lihat
                              </span>
                            </div>
                          </div>
                          <div className="p-2 border-t border-white/[0.04] bg-[#0E0F12] flex items-center justify-between text-[10px] text-neutral-400">
                            <span className="truncate max-w-[90px]">{photo.photoId}</span>
                            <span>
                              {new Date(photo.createdAt).toLocaleTimeString('id-ID', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Modal Detail / Preview Satu Foto dari Galeri Acara */}
            {previewGalleryPhoto && (
              <div
                className="fixed inset-0 z-60 bg-black/95 flex items-center justify-center p-4 animate-fadeIn"
                onClick={() => setPreviewGalleryPhoto(null)}
              >
                <div
                  className="max-w-lg w-full bg-[#121316] border border-white/20 rounded-3xl p-5 flex flex-col gap-3 shadow-2xl relative"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between border-b border-white/[0.08] pb-2.5">
                    <span className="text-xs font-mono text-neutral-300">ID: {previewGalleryPhoto.photoId}</span>
                    <button
                      onClick={() => setPreviewGalleryPhoto(null)}
                      className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-neutral-300 flex items-center justify-center transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Asset Tabs: Foto Berbingkai, Animasi GIF, Pose Mentah */}
                  <div className="flex items-center gap-1 p-1 rounded-xl bg-black/50 border border-white/[0.06] text-xs font-medium overflow-x-auto">
                    <button
                      type="button"
                      onClick={() => setPreviewGalleryTab('photo')}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-center transition-all ${
                        previewGalleryTab === 'photo'
                          ? 'bg-white text-black font-semibold shadow-sm'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      Foto Berbingkai
                    </button>

                    {previewGalleryPhoto.hasGif && (
                      <button
                        type="button"
                        onClick={() => setPreviewGalleryTab('gif')}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-center transition-all ${
                          previewGalleryTab === 'gif'
                            ? 'bg-white text-black font-semibold shadow-sm'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        GIF Loop
                      </button>
                    )}

                    {previewGalleryPhoto.rawShots &&
                      previewGalleryPhoto.rawShots.map((raw: any) => (
                        <button
                          key={raw.index}
                          type="button"
                          onClick={() => setPreviewGalleryTab(`raw_${raw.index}`)}
                          className={`flex-1 py-1.5 px-2 rounded-lg text-center whitespace-nowrap transition-all ${
                            previewGalleryTab === `raw_${raw.index}`
                              ? 'bg-white text-black font-semibold shadow-sm'
                              : 'text-neutral-400 hover:text-white'
                          }`}
                        >
                          Pose {raw.index} (Mentah)
                        </button>
                      ))}
                  </div>

                  {/* Visual Preview */}
                  {(() => {
                    const activeUrl =
                      previewGalleryTab === 'gif' && previewGalleryPhoto.gifUrl
                        ? previewGalleryPhoto.gifUrl
                        : previewGalleryTab.startsWith('raw_')
                        ? previewGalleryPhoto.rawShots?.find(
                            (r: any) => r.index === parseInt(previewGalleryTab.replace('raw_', ''), 10)
                          )?.url || `/api/gallery/${previewGalleryPhoto.photoId}?type=raw&index=${previewGalleryTab.replace('raw_', '')}`
                        : previewGalleryPhoto.fullUrl;

                    return (
                      <>
                        <div className="w-full max-h-[55vh] bg-black rounded-2xl overflow-hidden flex items-center justify-center p-1 border border-white/10">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={activeUrl}
                            alt={previewGalleryPhoto.photoId}
                            className="max-h-[52vh] max-w-full object-contain rounded-xl"
                          />
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={() => handlePrintPhoto(activeUrl)}
                            className="flex-1 h-10 rounded-xl bg-white hover:bg-neutral-200 text-black font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-98"
                          >
                            <Printer className="w-4 h-4" />
                            <span>Cetak Foto Ini</span>
                          </button>

                          <a
                            href={activeUrl}
                            download={`MingleBooth_${previewGalleryPhoto.photoId}_${previewGalleryTab}.jpg`}
                            className="h-10 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                          >
                            <Download className="w-4 h-4" />
                            <span>Unduh</span>
                          </a>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Footer Modal */}
            <div className="flex items-center justify-between border-t border-white/[0.08] pt-3 text-xs">
              <span className="text-[11px] text-neutral-500">
                Tekan tombol Tutup untuk kembali ke layar review foto Anda
              </span>
              <button
                onClick={() => {
                  setShowEventGalleryModal(false);
                  setPreviewGalleryPhoto(null);
                }}
                className="h-8 px-5 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-xs transition-colors"
              >
                Kembali ke Review
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Native 100% Reliable Print Mount (Media Print) ── */}
      {printImageUrl && (
        <div id="minglebooth-print-mount">
          <style jsx global>{`
            @media print {
              @page {
                size: auto;
                margin: 0mm !important;
              }
              html, body {
                margin: 0 !important;
                padding: 0 !important;
                background: white !important;
                color: black !important;
                height: 100% !important;
                overflow: hidden !important;
              }
              body > * {
                display: none !important;
              }
              #minglebooth-print-mount {
                display: flex !important;
                position: fixed !important;
                inset: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                align-items: center !important;
                justify-content: center !important;
                background: white !important;
                z-index: 99999999 !important;
                margin: 0 !important;
                padding: 0 !important;
              }
              #minglebooth-print-mount img {
                max-width: 100% !important;
                max-height: 100% !important;
                width: auto !important;
                height: auto !important;
                object-fit: contain !important;
                display: block !important;
                margin: auto !important;
              }
            }
            @media screen {
              #minglebooth-print-mount {
                display: none !important;
              }
            }
          `}</style>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={printImageUrl} alt="Print Preview" />
        </div>
      )}
    </div>
  );
}
