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
    path: '/frames/wedding_bayu_irma.png',
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
  const [shotsCount, setShotsCount] = useState<number>(2); // 1, 2, 3, 4
  const [enableGif, setEnableGif] = useState<boolean>(true);
  const [gifOverlayPath, setGifOverlayPath] = useState<string | null>('/frames/wedding_gif_frame.png');

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

  // Video Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);

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
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
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

      setCameraStream(stream);

      // Attach to any active video DOM element
      const attachStream = (el: HTMLVideoElement | null) => {
        if (!el) return;
        el.muted = true;
        el.defaultMuted = true;
        el.playsInline = true;
        el.srcObject = stream;
        el.play().catch((err) => console.warn('Video play prevented:', err));
      };

      attachStream(previewVideoRef.current);
      attachStream(videoRef.current);

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
  }, [selectedWebcamId, cameraStream, enumerateCameras]);

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

  // ── 3. FETCH VENDOR EVENTS & TEMPLATES ──
  useEffect(() => {
    const token = localStorage.getItem('mb_license_token');
    if (!token) return;

    // Fetch Events
    fetch(`${API_BASE_URL}/api/vendor/events`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success && Array.isArray(data.events) && data.events.length > 0) {
          setEvents(data.events);
          setSelectedEventId(data.events[0].id);
        }
      })
      .catch(() => {});

    // Fetch Templates
    fetch(`${API_BASE_URL}/api/vendor/templates`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success && Array.isArray(data.templates) && data.templates.length > 0) {
          setTemplates(data.templates);
          setSelectedTemplateId(data.templates[0].id);
        }
      })
      .catch(() => {});
  }, []);

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

      // Draw user photos into cutout holes
      const cutouts = frameCutouts.length > 0
        ? frameCutouts
        : [
            { x: 40, y: 40, width: canvas.width - 80, height: Math.floor((canvas.height - 120) / 2) },
            { x: 40, y: Math.floor(canvas.height / 2) + 20, width: canvas.width - 80, height: Math.floor((canvas.height - 120) / 2) },
          ];

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

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1: SETUP VIEW (MINIMAL PRO STUDIO)
  // ═══════════════════════════════════════════════════════════════════════════
  if (phase === 'setup') {
    return (
      <div className="flex flex-col h-screen w-screen bg-[#090A0C] text-[#EDEDED] font-sans select-none overflow-hidden antialiased">
        {/* Top Minimal Header */}
        <header className="h-16 px-6 border-b border-white/[0.08] bg-[#0F1014] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-minglebooth.png" alt="MingleBooth" className="h-6 w-auto object-contain" />
            <div className="h-4 w-[1px] bg-white/10" />
            <span className="text-xs font-semibold tracking-wide text-neutral-300">
              Studio Photobooth Kiosk
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowEventGalleryModal(true)}
              className="h-9 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-neutral-200 flex items-center gap-2 transition-colors"
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
              className="h-9 px-3.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-xs font-medium text-neutral-400 hover:text-white flex items-center gap-1.5 transition-colors"
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
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Preview Studio Aktif</span>
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
              className="h-full max-h-[68vh] rounded-2xl bg-black border border-white/[0.1] overflow-hidden relative shadow-2xl flex items-center justify-center group"
            >
              {cameraMode === 'webcam' ? (
                <video
                  ref={previewVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover transform -scale-x-100"
                />
              ) : (
                tetherLiveFrame ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={tetherLiveFrame} alt="Sony Live View" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center justify-center p-6 text-center text-xs text-neutral-400 gap-2">
                    <Camera className="w-8 h-8 text-neutral-600 animate-pulse" />
                    <span>Menghubungkan ke Sony PC Remote (Port 4848)...</span>
                  </div>
                )
              )}

              {/* Template Frame Overlay */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentTemplate.path}
                alt="Template Frame"
                className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10"
              />

              {/* Camera Error Banner */}
              {cameraError && (
                <div className="absolute inset-x-4 top-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs text-center backdrop-blur-md z-20">
                  {cameraError}
                </div>
              )}
            </div>
          </section>

          {/* SISI KANAN: STUDIO CONFIGURATION PANEL (CLEAN MONOCHROME) */}
          <aside className="w-full lg:w-[460px] bg-[#0F1014] p-6 flex flex-col justify-between overflow-y-auto min-h-0">
            <div className="space-y-5">
              {/* Event Card */}
              <div className="p-4 rounded-2xl bg-[#14161C] border border-white/[0.06] space-y-2">
                <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block">
                  1. Acara Vendor
                </label>
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
              </div>

              {/* Template Card */}
              <div className="p-4 rounded-2xl bg-[#14161C] border border-white/[0.06] space-y-2.5">
                <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block">
                  2. Desain Bingkai / Frame
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
                  {templates.map((tmpl) => {
                    const isSelected = tmpl.id === selectedTemplateId;
                    return (
                      <button
                        key={tmpl.id}
                        onClick={() => setSelectedTemplateId(tmpl.id)}
                        className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-all ${
                          isSelected
                            ? 'bg-white text-black border-white shadow-md'
                            : 'bg-[#1A1C24] border-white/[0.06] text-neutral-300 hover:border-white/20'
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={tmpl.path} alt={tmpl.name} className="w-8 h-10 object-contain rounded bg-black/40 flex-shrink-0" />
                        <span className="text-[11px] font-semibold truncate leading-tight">{tmpl.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Camera Source Selector */}
              <div className="p-4 rounded-2xl bg-[#14161C] border border-white/[0.06] space-y-2.5">
                <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider block">
                  3. Sumber Kamera
                </label>
                <div className="grid grid-cols-2 p-1 rounded-xl bg-[#1A1C24] border border-white/[0.06]">
                  <button
                    onClick={() => {
                      setCameraMode('webcam');
                      startWebcamStream();
                    }}
                    className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      cameraMode === 'webcam' ? 'bg-white text-black shadow-sm' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    <Laptop className="w-3.5 h-3.5" />
                    <span>Webcam Laptop</span>
                  </button>
                  <button
                    onClick={() => setCameraMode('sony')}
                    className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      cameraMode === 'sony' ? 'bg-white text-black shadow-sm' : 'text-neutral-400 hover:text-white'
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
                      <span className={`w-2 h-2 rounded-full ${tetherStatus === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                      <span>{tetherStatus === 'connected' ? 'Sony USB Siap' : 'Menunggu Sambungan USB'}</span>
                    </span>
                    <button
                      onClick={() => {
                        fetch(`${tetherUrl}/api/tether/status`)
                          .then((r) => r.json())
                          .then((d) => setTetherStatus(d.success ? 'connected' : 'disconnected'))
                          .catch(() => setTetherStatus('disconnected'));
                      }}
                      className="text-[11px] text-neutral-300 hover:text-white underline"
                    >
                      Uji Sambungan
                    </button>
                  </div>
                )}
              </div>

              {/* Capture Parameters (Pose & Countdown) */}
              <div className="p-4 rounded-2xl bg-[#14161C] border border-white/[0.06] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Jumlah Pose:</span>
                  <div className="flex items-center gap-1 bg-[#1A1C24] p-1 rounded-xl border border-white/[0.06]">
                    {[1, 2, 3, 4].map((num) => (
                      <button
                        key={num}
                        onClick={() => setShotsCount(num)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                          shotsCount === num ? 'bg-white text-black shadow-sm' : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        {num} Foto
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Countdown:</span>
                  <div className="flex items-center gap-1 bg-[#1A1C24] p-1 rounded-xl border border-white/[0.06]">
                    {[0, 3, 5, 10].map((sec) => (
                      <button
                        key={sec}
                        onClick={() => setCountdownSeconds(sec)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                          countdownSeconds === sec ? 'bg-white text-black shadow-sm' : 'text-neutral-400 hover:text-white'
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
                className="w-full h-14 rounded-2xl bg-white hover:bg-neutral-200 text-black font-bold text-sm flex items-center justify-center gap-2 shadow-2xl transition-all active:scale-[0.99]"
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
  // PHASE 2: GUEST KIOSK VIEW (FULLSCREEN MINIMAL PRO STUDIO)
  // ═══════════════════════════════════════════════════════════════════════════
  if (phase === 'kiosk') {
    return (
      <div
        onClick={() => {
          if (sessionStep === 'idle' || sessionStep === 'paused_between_poses') {
            triggerPoseShot(currentShotIndex);
          }
        }}
        className="h-screen w-screen bg-[#07090E] text-white flex flex-col items-center justify-center relative overflow-hidden select-none font-sans cursor-pointer"
      >
        {/* Subtle Flash Overlay */}
        <div
          className={`absolute inset-0 bg-white pointer-events-none z-50 transition-opacity duration-150 ${
            isFlashing ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Top Discreet Bar */}
        <div className="absolute top-5 inset-x-8 flex items-center justify-between z-30 pointer-events-none">
          {/* Pose indicator pill */}
          <div className="px-4 py-1.5 rounded-full bg-black/60 border border-white/10 backdrop-blur-md text-xs font-medium text-neutral-300">
            Foto {currentShotIndex + 1} dari {shotsCount}
          </div>

          {/* Discreet exit button for operator (re-enable pointer events on button) */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setPhase('setup');
              setSessionStep('idle');
            }}
            className="pointer-events-auto h-8 px-3 rounded-lg bg-black/60 hover:bg-black/80 border border-white/10 text-neutral-400 hover:text-white text-xs transition-colors flex items-center gap-1.5"
            title="Keluar ke Pengaturan (ESC)"
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Pengaturan</span>
          </button>
        </div>

        {/* Framing Container (Centered Fullscreen Canvas) */}
        <div
          style={{
            aspectRatio: `${frameDimensions.width} / ${frameDimensions.height}`,
          }}
          className="h-[88vh] max-w-[94vw] rounded-2xl bg-black border border-white/[0.08] overflow-hidden relative shadow-[0_20px_50px_rgba(0,0,0,0.9)] flex items-center justify-center"
        >
          {cameraMode === 'webcam' ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover transform -scale-x-100"
            />
          ) : (
            tetherLiveFrame && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tetherLiveFrame} alt="Live View" className="w-full h-full object-cover" />
            )
          )}

          {/* Template Frame Layer */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentTemplate.path}
            alt="Template Frame"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10"
          />

          {/* Large Floating Countdown HUD */}
          {sessionStep === 'countdown' && (
            <div className="absolute inset-0 flex items-center justify-center z-40 bg-black/30 backdrop-blur-[2px]">
              <div className="w-36 h-36 rounded-full bg-black/70 border border-white/20 flex items-center justify-center shadow-2xl animate-scaleIn">
                <span className="text-7xl font-extrabold text-white tracking-tight">
                  {countdownRemaining}
                </span>
              </div>
            </div>
          )}

          {/* Processing Spinner */}
          {sessionStep === 'processing' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-40 bg-black/80 backdrop-blur-md gap-3">
              <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-white animate-spin" />
              <span className="text-sm font-medium tracking-wide text-neutral-300">
                Menyusun Foto Cetak &amp; Animasi...
              </span>
            </div>
          )}
        </div>

        {/* Bottom Floating Trigger Prompt */}
        {(sessionStep === 'idle' || sessionStep === 'paused_between_poses') && (
          <div className="absolute bottom-6 z-30 pointer-events-none animate-fadeIn">
            <div className="px-6 py-3 rounded-full bg-white text-black font-bold text-xs shadow-2xl tracking-wide uppercase flex items-center gap-2">
              <Camera className="w-4 h-4 text-black" />
              <span>Sentuh Layar atau Tekan Space untuk Memotret</span>
            </div>
          </div>
        )}
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-minglebooth.png" alt="MingleBooth" className="h-6 w-auto object-contain" />
          <div className="h-4 w-[1px] bg-white/10 hidden sm:block" />
          <span className="text-xs font-medium text-neutral-400 hidden sm:inline">
            Foto Berhasil Diambil
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-400 font-mono hidden sm:inline">
            Reset otomatis dalam {reviewCountdown}s
          </span>

          <button
            onClick={() => {
              setPhase('kiosk');
              setCapturedPhotos([]);
              setCurrentShotIndex(0);
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
      {showEventGalleryModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 select-none animate-fadeIn">
          <div className="max-w-2xl w-full bg-[#121316] border border-white/[0.08] rounded-3xl p-6 flex flex-col gap-4 shadow-2xl max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <div className="flex items-center gap-2">
                <Images className="w-4 h-4 text-white" />
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
