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
  // Phase: 'setup' | 'kiosk' | 'review'
  const [phase, setPhase] = useState<'setup' | 'kiosk' | 'review'>('setup');

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
  const [gifOverlayPath, setGifOverlayPath] = useState<string | null>('frames/wedding_gif_frame.png');
  const [customPhotoFileName, setCustomPhotoFileName] = useState<string>('');
  const [customGifFileName, setCustomGifFileName] = useState<string>('');
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
  const [resultTab, setResultTab] = useState<'photo' | 'gif'>('photo');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [guestGalleryUrl, setGuestGalleryUrl] = useState<string>('');
  const [reviewCountdown, setReviewCountdown] = useState<number>(30);
  const [printImageUrl, setPrintImageUrl] = useState<string | null>(null);

  // Gallery Modal
  const [showEventGalleryModal, setShowEventGalleryModal] = useState<boolean>(false);
  const [eventGalleryPhotos, setEventGalleryPhotos] = useState<any[]>([]);
  const [isEventGalleryLoading, setIsEventGalleryLoading] = useState<boolean>(false);

  // Video & File Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const customFileInputRef = useRef<HTMLInputElement | null>(null);
  const customGifFileInputRef = useRef<HTMLInputElement | null>(null);

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

    const targetId = deviceId || selectedWebcamId;

    try {
      // Direct universal constraint without facingMode to prevent OverconstrainedError on Mac/PC
      const constraints: MediaStreamConstraints = {
        video: targetId
          ? {
              deviceId: { ideal: targetId },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            }
          : {
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
        audio: false,
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (e) {
        console.warn('High-res stream failed, fallback to default video:', e);
        // Absolute fallback that works on any webcam hardware
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      streamRef.current = stream;
      setCameraStream(stream);

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
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Izin kamera ditolak. Buka System Settings > Privacy & Security > Camera dan izinkan MingleBooth Studio.'
          : 'Kamera webcam tidak merespons. Pastikan kamera tidak sedang dipakai oleh aplikasi lain (FaceTime/Zoom).'
      );
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
    reader.onload = () => {
      const base64 = reader.result as string;
      setGifOverlayPath(base64);
      setCustomGifFileName(file.name);
      setEnableGif(true);
    };
    reader.readAsDataURL(file);
  };

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

      // Draw user photos into cutout holes (Supports 1 to 6 photos dynamically)
      let cutouts = frameCutouts;
      if (!cutouts || cutouts.length < photos.length) {
        cutouts = [];
        const n = photos.length;
        if (n <= 3) {
          const slotH = Math.floor((canvas.height - 140) / n);
          for (let i = 0; i < n; i++) {
            cutouts.push({
              x: 40,
              y: 40 + i * (slotH + 20),
              width: canvas.width - 80,
              height: slotH,
            });
          }
        } else if (n === 4) {
          const slotW = Math.floor((canvas.width - 100) / 2);
          const slotH = Math.floor((canvas.height - 140) / 2);
          for (let r = 0; r < 2; r++) {
            for (let c = 0; c < 2; c++) {
              cutouts.push({
                x: 35 + c * (slotW + 30),
                y: 40 + r * (slotH + 30),
                width: slotW,
                height: slotH,
              });
            }
          }
        } else {
          // 5 or 6 photos: 2 cols x 3 rows
          const slotW = Math.floor((canvas.width - 90) / 2);
          const slotH = Math.floor((canvas.height - 140) / 3);
          for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 2; c++) {
              if (cutouts.length < n) {
                cutouts.push({
                  x: 30 + c * (slotW + 30),
                  y: 35 + r * (slotH + 25),
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
          });
          gifDataUrl = gifResult.dataUrl;
          setFinalGifDataUrl(gifDataUrl);
        } catch (e) {
          console.warn('GIF creation notice:', e);
        }
      }

      // Save to Offline Storage
      saveOfflineCapture({
        photoId,
        eventId: selectedEventId,
        eventName: currentEvent.name,
        photoDataUrl: compositeDataUrl,
        gifDataUrl,
        hasGif: Boolean(gifDataUrl),
        createdAt: new Date().toISOString(),
      }).catch(() => {});

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

  // In-Kiosk Event Gallery Modal Component
  const renderGalleryModalJSX = () => {
    if (!showEventGalleryModal) return null;
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 select-none animate-fadeIn"
      >
        <div className="max-w-2xl w-full bg-[#121316] border border-white/[0.08] rounded-3xl p-6 flex flex-col gap-4 shadow-2xl max-h-[85vh]">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-2">
              <Images className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-white">Galeri Foto Acara</h3>
            </div>
            <button
              onClick={() => setShowEventGalleryModal(false)}
              className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-neutral-400 hover:text-white flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 text-xs text-neutral-400 text-center py-10">
            Semua foto sesi acara ini otomatis tersimpan aman di SSD laptop dan tersinkronisasi ke cloud gallery.
          </div>

          <button
            onClick={() => setShowEventGalleryModal(false)}
            className="w-full py-2.5 rounded-xl bg-white text-black font-semibold text-xs hover:bg-neutral-200 transition-colors"
          >
            Tutup Galeri
          </button>
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1: SETUP VIEW (MINIMAL PRO STUDIO)
  // ═══════════════════════════════════════════════════════════════════════════
  if (phase === 'setup') {
    return (
      <div className="flex flex-col h-screen w-screen bg-[#090A0C] text-[#EDEDED] font-sans select-none overflow-hidden antialiased">
        {/* Top Minimal Header */}
        <header className="h-16 px-6 border-b border-white/[0.08] bg-[#0F1014] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center font-black text-black text-sm shadow-md">
              M
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-white leading-tight">
                Mingle<span className="text-amber-400">Booth</span>
              </span>
              <span className="text-[10px] font-medium text-neutral-400 leading-tight">
                Studio Photobooth Kiosk
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowEventGalleryModal(true)}
              className="h-9 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-neutral-200 flex items-center gap-2 transition-colors cursor-pointer"
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
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-neutral-200 font-medium">Webcam Laptop Aktif</span>
                    </>
                  ) : isCameraLoading ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-spin" />
                      <span className="text-amber-300 font-medium">Menghubungkan Webcam...</span>
                    </>
                  ) : (
                    <>
                      <span className="w-2 h-2 rounded-full bg-rose-400" />
                      <span className="text-rose-400 font-medium">Webcam Belum Terhubung</span>
                    </>
                  )
                ) : tetherStatus === 'connected' ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-neutral-200 font-medium">Sony DSLR USB Siap</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="text-amber-300 font-medium">Menunggu Sambungan Sony USB</span>
                  </>
                )}
              </span>
              <span className="font-mono text-[11px] bg-white/[0.06] px-2 py-0.5 rounded text-neutral-300">
                Rasio: {currentTemplate.ratio} ({frameDimensions.width}x{frameDimensions.height})
              </span>
            </div>

            {/* Framing Box */}
            <div
              style={{
                aspectRatio: `${frameDimensions.width} / ${frameDimensions.height}`,
              }}
              className="h-full max-h-[68vh] rounded-2xl bg-[#090A0C] border border-white/[0.1] overflow-hidden relative shadow-2xl flex items-center justify-center group"
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
                        <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
                      ) : (
                        <Laptop className="w-6 h-6" />
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-white">
                        {isCameraLoading ? 'Menghubungkan Webcam Laptop...' : 'Webcam Belum Terhubung'}
                      </p>
                      {cameraError && (
                        <p className="text-[11px] text-rose-400 max-w-xs mt-1 leading-tight">
                          {cameraError}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => startWebcamStream()}
                      className="px-4 py-2 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-xs flex items-center gap-1.5 shadow-lg active:scale-95 transition-all cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Sambungkan Webcam</span>
                    </button>
                  </div>
                )
              ) : tetherLiveFrame ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tetherLiveFrame} alt="Sony Live View" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center justify-center p-6 text-center text-xs text-neutral-400 gap-3 z-0">
                  <div className="w-12 h-12 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-neutral-300">
                    <Camera className="w-6 h-6 text-amber-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-white">Mode Sony / DSLR USB Siap</p>
                    <p className="text-[11px] text-neutral-400 max-w-xs mt-1 leading-tight">
                      {tetherStatus === 'connected'
                        ? 'Kamera terdeteksi via USB (Port 4848). Foto tajam otomatis tersinkron saat memotret.'
                        : 'Hubungkan Sony via kabel USB PC Remote. Tombol potret akan langsung mengambil foto dengan flash.'}
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
                    <span>Uji Sambungan Port 4848</span>
                  </button>
                </div>
              )}

              {/* Template Frame Overlay */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentTemplate.path}
                alt=""
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10"
              />
            </div>
          </section>

          {/* SISI KANAN: STUDIO CONFIGURATION PANEL (CLEAN MONOCHROME) */}
          <aside className="w-full lg:w-[460px] bg-[#0F1014] p-6 flex flex-col justify-between overflow-y-auto min-h-0">
            <div className="space-y-5">
              {/* Event Card */}
              <div className="p-4 rounded-2xl bg-[#14161C] border border-white/[0.06] space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block">
                    1. Acara Vendor
                  </label>
                  <button
                    type="button"
                    onClick={fetchVendorData}
                    disabled={isLoadingVendorData}
                    className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                    title="Sinkronkan data acara dari Supabase Database"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingVendorData ? 'animate-spin' : ''}`} />
                    <span>{isLoadingVendorData ? 'Menyinkronkan...' : 'Sinkron Database'}</span>
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
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Database Supabase Aktif &bull; {events.length} Acara Terdaftar</span>
                </div>
              </div>

              {/* Template & GIF Card */}
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
                            ? 'bg-white text-black border-white shadow-md'
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
                    <Upload className="w-3.5 h-3.5 text-amber-400" />
                    <span className="truncate">{customPhotoFileName ? 'Ganti Bingkai Foto' : 'Upload Bingkai (.PNG)'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => customGifFileInputRef.current?.click()}
                    className="h-10 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] hover:border-white/20 text-xs font-semibold text-white flex items-center justify-center gap-2 transition-all cursor-pointer"
                    title="Upload bingkai overlay khusus untuk animasi GIF Boomerang"
                  >
                    <Film className="w-3.5 h-3.5 text-amber-400" />
                    <span className="truncate">{customGifFileName ? 'Ganti Bingkai GIF' : 'Upload Bingkai GIF'}</span>
                  </button>
                </div>

                {/* Uploaded Files & GIF Toggle Indicator */}
                <div className="space-y-1.5 pt-1 text-[11px]">
                  {customPhotoFileName && (
                    <div className="flex items-center gap-1.5 text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">Bingkai Foto: <strong>{customPhotoFileName}</strong></span>
                    </div>
                  )}

                  <div className="flex items-center justify-between p-2 rounded-xl bg-[#1A1C24] border border-white/[0.06]">
                    <div className="flex items-center gap-2">
                      <Film className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-neutral-300">
                        {customGifFileName ? `GIF: ${customGifFileName}` : 'GIF Boomerang Otomatis'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEnableGif(!enableGif)}
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase transition-colors cursor-pointer ${
                        enableGif ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-neutral-800 text-neutral-400 border border-white/10'
                      }`}
                    >
                      {enableGif ? 'Aktif' : 'Nonaktif'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Camera Source Selector */}
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
                          tetherStatus === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
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

              {/* Capture Parameters (Pose & Countdown) */}
              <div className="p-4 rounded-2xl bg-[#14161C] border border-white/[0.06] space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                      Jumlah Pose:
                    </span>
                    <span className="text-xs font-semibold text-amber-400">
                      {shotsCount} Foto
                    </span>
                  </div>
                  <div className="grid grid-cols-6 gap-1 bg-[#1A1C24] p-1 rounded-xl border border-white/[0.06]">
                    {[1, 2, 3, 4, 5, 6].map((num) => (
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
          if (showEventGalleryModal) return;
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
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-4">
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

        {/* Top-Right: Quick Controls (Galeri Foto & Pengaturan) */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute top-6 right-6 z-40 pointer-events-auto flex items-center gap-2.5"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowEventGalleryModal(true);
            }}
            className="h-10 px-4 rounded-full bg-black/60 hover:bg-black/85 backdrop-blur-md border border-amber-400/40 hover:border-amber-400/80 flex items-center gap-2 text-white/95 hover:text-white text-xs font-semibold shadow-2xl active:scale-95 transition-all cursor-pointer group"
            title="Lihat Galeri Foto Acara"
          >
            <Images className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
            <span>Galeri Foto</span>
            {eventGalleryPhotos.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-amber-400/20 border border-amber-400/40 text-[10px] text-amber-300 font-mono font-bold leading-none">
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

        {/* Modal In-Kiosk Event Gallery */}
        {renderGalleryModalJSX()}
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
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center font-black text-black text-sm shadow-md">
            M
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight text-white leading-tight">
              Mingle<span className="text-amber-400">Booth</span>
            </span>
            <span className="text-[10px] font-medium text-neutral-400 leading-tight">
              Foto Berhasil Diambil
            </span>
          </div>
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
            onClick={() => setShowEventGalleryModal(true)}
            className="h-9 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-neutral-200 flex items-center gap-2 transition-colors"
          >
            <Images className="w-3.5 h-3.5 text-amber-400" />
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
            className="h-9 px-5 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-xs transition-all shadow-md active:scale-98"
          >
            Foto Tamu Berikutnya
          </button>
        </div>
      </header>

      {/* Main Review Body: Split Canvas */}
      <main className="flex-1 w-full max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-center gap-8 px-6 py-6 min-h-0 overflow-hidden">
        {/* Left Side: Photo Frame & GIF Boomerang Toggle */}
        <div className="flex-1 h-full max-h-[75vh] flex flex-col items-center justify-center min-w-0 gap-3">
          {finalGifDataUrl && (
            <div className="flex items-center p-1 rounded-xl bg-white/[0.06] border border-white/[0.08]">
              <button
                onClick={() => setResultTab('photo')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  resultTab === 'photo' ? 'bg-white text-black shadow-sm' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Foto Cetak
              </button>
              <button
                onClick={() => setResultTab('gif')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  resultTab === 'gif' ? 'bg-white text-black shadow-sm' : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Film className="w-3.5 h-3.5" />
                <span>Animasi GIF</span>
              </button>
            </div>
          )}

          <div
            style={{
              aspectRatio: `${frameDimensions.width} / ${frameDimensions.height}`,
            }}
            className="h-full max-h-[66vh] rounded-2xl bg-black border border-white/[0.1] overflow-hidden shadow-2xl flex items-center justify-center p-1"
          >
            {resultTab === 'photo' ? (
              finalPhotoDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={finalPhotoDataUrl} alt="Hasil Foto" className="w-full h-full object-contain rounded-xl" />
              )
            ) : (
              finalGifDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={finalGifDataUrl} alt="Hasil GIF" className="w-full h-full object-contain rounded-xl" />
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

      {/* In-Kiosk Event Gallery Modal */}
      {renderGalleryModalJSX()}
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
