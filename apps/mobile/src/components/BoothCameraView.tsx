import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useMobileBoothStore, DEFAULT_WALLPAPERS } from '../store/mobile-booth-store';
import { CountdownOverlay } from './CountdownOverlay';
import { PhotoCompositor } from '@minglebooth/photo-engine';
import { GifComposer } from '@minglebooth/gif-engine';
import {
  Camera,
  SwitchCamera,
  RefreshCw,
  AlertCircle,
  RotateCcw,
  Images,
  Eye,
  EyeOff,
  ChevronLeft,
  Clock,
  X,
  Layers,
  Usb,
} from 'lucide-react';
import {
  triggerTetherCapture,
  fetchTetherLiveFrame,
  probeTetherHost,
  subscribeTetherEvents,
  TetherPhotoEvent,
} from '../lib/tetherClient';
import { SonyDirectCamera } from '../lib/plugins/sonyCameraPlugin';

export const BoothCameraView: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const processedPhotosRef = useRef<Set<string>>(new Set());
  const tetherSseUnsubscribeRef = useRef<(() => void) | null>(null);

  const {
    currentEvent,
    currentTemplate,
    activeFormat,
    activeFrameOverlay,
    customGifOverlayUrl,
    isLiveFrameVisible,
    toggleLiveFrameVisibility,
    cameraFacing,
    toggleCameraFacing,
    cameraMode,
    tetherHostUrl,
    tetherStatus,
    setTetherStatus,
    tetherCameraConnected,
    setTetherCameraConnected,
    tetherCameraState,
    setTetherCameraState,
    tetherCameraModel,
    setTetherCameraModel,
    tetherLiveFrame,
    setTetherLiveFrame,
    usbCameraConnected,
    setUsbCameraConnected,
    usbCameraModel,
    setUsbCameraModel,
    usbCameraState,
    setUsbCameraState,
    usbLiveViewUrl,
    setUsbLiveViewUrl,
    usbLiveViewError,
    setUsbLiveViewError,
    usbBatteryLevel,
    setUsbBatteryLevel,
    usbError,
    setUsbError,
    shotsCount,
    countdownDuration,
    isCountingDown,
    countdownValue,
    setIsCountingDown,
    setCountdownValue,
    rawShots,
    addRawShot,
    removeLastRawShot,
    resetRawShots,
    retakeSlot,
    retakeSlotIndex,
    setRetakeSlotIndex,
    isProcessing,
    setIsProcessing,
    setComposedResult,
    setIsReviewOpen,
    isReviewOpen,
    isBurstEnabled,
    setPhase,
    setIsGalleryOpen,
    enableStandbyWallpaper,
    standbyTimeoutMinutes,
    wallpaperFitMode,
    selectedWallpaperId,
    customWallpaperUrl,
    isScreensaverActive,
    setIsScreensaverActive,
    setIsWallpaperModalOpen,
  } = useMobileBoothStore();

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isFlashActive, setIsFlashActive] = useState(false);
  const [isCapturingTether, setIsCapturingTether] = useState<boolean>(false);
  const [tetherShutterError, setTetherShutterError] = useState<string | null>(null);
  const [liveViewLoadFailed, setLiveViewLoadFailed] = useState<boolean>(false);
  const [isRetryingLiveView, setIsRetryingLiveView] = useState<boolean>(false);
  const tetherLiveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const tetherProbeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isTriggeringRef = useRef<boolean>(false);
  const lastCaptureTimeRef = useRef<number>(0);

  const handleRetryLiveView = useCallback(async () => {
    setIsRetryingLiveView(true);
    setUsbLiveViewError(null);
    try {
      const res = await SonyDirectCamera.startLiveView();
      setUsbLiveViewUrl(`${res.streamUrl}?t=${Date.now()}`);
      setLiveViewLoadFailed(false);
    } catch (e: any) {
      console.warn('[BoothCameraView] Retry live view error:', e);
      setUsbLiveViewError(e.message || 'Gagal memulai feed live view');
      setLiveViewLoadFailed(true);
    } finally {
      setIsRetryingLiveView(false);
    }
  }, [setUsbLiveViewError, setUsbLiveViewUrl]);

  const totalSlots = currentTemplate?.photoSlots?.length || shotsCount || 2;

  // Active wallpaper path calculation
  const getActiveWallpaper = (): string => {
    if (selectedWallpaperId === 'custom' && customWallpaperUrl) {
      return customWallpaperUrl;
    }
    const preset = DEFAULT_WALLPAPERS.find((w) => w.id === selectedWallpaperId);
    return preset?.path || DEFAULT_WALLPAPERS[0].path;
  };

  // Reset idle timer on any user interaction
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (isScreensaverActive) {
      setIsScreensaverActive(false);
    }
    if (enableStandbyWallpaper && !isCountingDown && !isReviewOpen) {
      const timeoutMs = Math.max(5000, standbyTimeoutMinutes * 60 * 1000);
      idleTimerRef.current = setTimeout(() => {
        setIsScreensaverActive(true);
      }, timeoutMs);
    }
  }, [
    enableStandbyWallpaper,
    isCountingDown,
    isReviewOpen,
    standbyTimeoutMinutes,
    isScreensaverActive,
    setIsScreensaverActive,
  ]);

  // Stop current camera tracks cleanly
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Initialize device camera stream (Tablet mode only)
  const startCamera = useCallback(async () => {
    stopCamera();

    try {
      setCameraError(null);

      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        setCameraError('Browser ini tidak memiliki akses ke antarmuka kamera (navigator.mediaDevices tidak tersedia).');
        return;
      }

      let stream: MediaStream;
      try {
        const primaryConstraints: MediaStreamConstraints = {
          video: {
            facingMode: cameraFacing,
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        };
        stream = await navigator.mediaDevices.getUserMedia(primaryConstraints);
      } catch (hdErr: any) {
        console.warn('[BoothCameraView] HD constraints fallback:', hdErr);
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: cameraFacing },
          audio: false,
        });
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      console.error('[BoothCameraView] Camera init failed:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Izin kamera ditolak. Silakan izinkan akses kamera pada Pengaturan perangkat / browser.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('Kamera tidak ditemukan pada perangkat ini.');
      } else {
        setCameraError(err.message || 'Gagal mengakses kamera perangkat.');
      }
    }
  }, [cameraFacing, stopCamera]);

  // Clear processed photos set when session restarts or raw shots reset
  useEffect(() => {
    if (rawShots.length === 0) {
      processedPhotosRef.current.clear();
    }
  }, [rawShots.length]);

  // Unified photo ingestion with deduplication and visual flash feedback
  const ingestCapturedPhoto = useCallback(
    (photoDataUrl: string, filename?: string, source: string = 'app') => {
      if (!photoDataUrl) return false;
      const now = Date.now();
      if (now - lastCaptureTimeRef.current < 1500) {
        console.log(`[BoothCameraView] Debounce: capture ignored (${source}, ${now - lastCaptureTimeRef.current}ms)`);
        return false;
      }
      const photoKey = filename || photoDataUrl.substring(photoDataUrl.length - 64);
      if (processedPhotosRef.current.has(photoKey)) {
        console.log(`[BoothCameraView] Duplicate photo ignored (${source}):`, photoKey);
        return false;
      }
      lastCaptureTimeRef.current = now;
      processedPhotosRef.current.add(photoKey);

      // Cancel pending countdown if active (e.g., physical camera shutter fired)
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      setIsCountingDown(false);
      isTriggeringRef.current = false;

      // Trigger visual flash
      setIsFlashActive(true);
      setTimeout(() => setIsFlashActive(false), 220);

      console.log(`[BoothCameraView] 📸 Photo ingested from ${source}:`, filename || 'photo');
      addRawShot(photoDataUrl);
      return true;
    },
    [addRawShot, setIsCountingDown]
  );

  // Lifecycle Handling: Source-aware stream management (Tablet vs Standalone USB vs PC Remote)
  useEffect(() => {
    let usbPhotoSub: any = null;
    let usbStatusSub: any = null;

    if (cameraMode === 'tablet') {
      if (tetherLiveIntervalRef.current) clearInterval(tetherLiveIntervalRef.current);
      if (tetherProbeIntervalRef.current) clearInterval(tetherProbeIntervalRef.current);
      if (tetherSseUnsubscribeRef.current) {
        tetherSseUnsubscribeRef.current();
        tetherSseUnsubscribeRef.current = null;
      }
      SonyDirectCamera.stopLiveView().catch(() => {});
      startCamera();
    } else if (cameraMode === 'usb_direct') {
      // Standalone USB Direct Mode: Stop tablet camera cleanly & detach tracks
      stopCamera();
      if (tetherLiveIntervalRef.current) clearInterval(tetherLiveIntervalRef.current);
      if (tetherProbeIntervalRef.current) clearInterval(tetherProbeIntervalRef.current);
      if (tetherSseUnsubscribeRef.current) {
        tetherSseUnsubscribeRef.current();
        tetherSseUnsubscribeRef.current = null;
      }

      // Check current USB connection & start live view
      SonyDirectCamera.getCameraStatus()
        .then((status) => {
          setUsbCameraConnected(status.isConnected);
          setUsbCameraState(status.state);
          if (status.model) setUsbCameraModel(status.model);
          if (status.liveViewError !== undefined) setUsbLiveViewError(status.liveViewError);
          if (status.batteryLevel !== undefined) setUsbBatteryLevel(status.batteryLevel);
          if (status.isConnected) {
            setLiveViewLoadFailed(false);
            SonyDirectCamera.startLiveView()
              .then((info) => {
                setUsbLiveViewUrl(`${info.streamUrl}?t=${Date.now()}`);
                setLiveViewLoadFailed(false);
              })
              .catch((lvErr: any) => {
                setUsbLiveViewError(lvErr.message || 'Gagal memulai feed live view');
              });
          }
        })
        .catch(() => {});

      // Subscribe to native USB capture events (handles physical shutter on camera body too!)
      SonyDirectCamera.addListener('onPhotoCaptured', (photo) => {
        console.log('[BoothCameraView] ⚡ Native Sony USB photo received:', photo.photoId);
        setIsCapturingTether(false);
        if (photo.dataUrl || photo.nativeFilePath) {
          ingestCapturedPhoto(photo.dataUrl || photo.nativeFilePath, photo.photoId, 'sony_usb_shutter');
        }
      }).then((sub) => {
        usbPhotoSub = sub;
      });

      // Subscribe to native USB status changes (cable connect/disconnect)
      SonyDirectCamera.addListener('onCameraStatusChanged', (status) => {
        setUsbCameraConnected(status.isConnected);
        setUsbCameraState(status.state);
        if (status.model) setUsbCameraModel(status.model);
        if (status.liveViewError !== undefined) setUsbLiveViewError(status.liveViewError);
        if (status.batteryLevel !== undefined) setUsbBatteryLevel(status.batteryLevel);
        if (status.isLiveViewStreaming) {
          setLiveViewLoadFailed(false);
          setUsbLiveViewUrl('http://127.0.0.1:4949/liveview');
        } else if (status.isConnected && (status.state === 'CAMERA_READY' || status.state === 'connected')) {
          setLiveViewLoadFailed(false);
          SonyDirectCamera.startLiveView()
            .then((info) => {
              setUsbLiveViewUrl(`${info.streamUrl}?t=${Date.now()}`);
              setLiveViewLoadFailed(false);
            })
            .catch((lvErr: any) => {
              setUsbLiveViewError(lvErr.message || 'Gagal memulai feed live view');
            });
        } else if (!status.isConnected) {
          setUsbLiveViewUrl(null);
        }
      }).then((sub) => {
        usbStatusSub = sub;
      });
    } else {
      // PC Remote mode: Stop tablet camera cleanly & detach tracks
      stopCamera();
      SonyDirectCamera.stopLiveView().catch(() => {});

      // Initial probe
      probeTetherHost(tetherHostUrl).then((s) => {
        setTetherStatus(s.cameraConnected ? 'connected' : (s.isHostReachable ? 'disconnected' : 'disconnected'));
        setTetherCameraConnected(s.cameraConnected);
        setTetherCameraState(s.cameraState);
        setTetherCameraModel(s.cameraModel);
      });

      // Probe status every 3s
      tetherProbeIntervalRef.current = setInterval(async () => {
        const s = await probeTetherHost(tetherHostUrl);
        setTetherStatus(s.cameraConnected ? 'connected' : (s.isHostReachable ? 'disconnected' : 'disconnected'));
        setTetherCameraConnected(s.cameraConnected);
        setTetherCameraState(s.cameraState);
        setTetherCameraModel(s.cameraModel);
      }, 3000);

      // Connect to SSE stream for real-time physical shutter capture & camera events
      if (tetherSseUnsubscribeRef.current) {
        tetherSseUnsubscribeRef.current();
      }
      tetherSseUnsubscribeRef.current = subscribeTetherEvents(tetherHostUrl, {
        onPhoto: (event) => {
          console.log('[BoothCameraView] ⚡ Real-time photo received via SSE:', event.filename);
          setIsCapturingTether(false);
          ingestCapturedPhoto(event.photoDataUrl, event.filename, event.source || 'physical_shutter');
        },
        onCameraState: (payload) => {
          if (payload.cameraState) {
            setTetherCameraState(payload.cameraState);
            setTetherCameraConnected(payload.cameraConnected);
            setTetherStatus(payload.cameraConnected ? 'connected' : 'disconnected');
          }
        },
        onError: (err) => {
          console.warn('[BoothCameraView] Tether SSE notice:', err);
        },
      });

      // Fetch live view frames every 150ms
      tetherLiveIntervalRef.current = setInterval(async () => {
        if (!isCapturingTether && !isScreensaverActive && !isReviewOpen) {
          const frameRes = await fetchTetherLiveFrame(tetherHostUrl, 1200);
          if (frameRes.success && frameRes.frameDataUrl) {
            setTetherLiveFrame(frameRes.frameDataUrl);
          }
        }
      }, 150);
    }

    return () => {
      if (cameraMode === 'tablet') {
        stopCamera();
      }
      if (tetherLiveIntervalRef.current) clearInterval(tetherLiveIntervalRef.current);
      if (tetherProbeIntervalRef.current) clearInterval(tetherProbeIntervalRef.current);
      if (tetherSseUnsubscribeRef.current) {
        tetherSseUnsubscribeRef.current();
        tetherSseUnsubscribeRef.current = null;
      }
      if (usbPhotoSub && typeof usbPhotoSub.remove === 'function') {
        usbPhotoSub.remove();
      }
      if (usbStatusSub && typeof usbStatusSub.remove === 'function') {
        usbStatusSub.remove();
      }
    };
  }, [
    cameraMode,
    tetherHostUrl,
    startCamera,
    stopCamera,
    ingestCapturedPhoto,
    setTetherLiveFrame,
    setTetherStatus,
    setTetherCameraConnected,
    setTetherCameraState,
    setTetherCameraModel,
    setUsbCameraConnected,
    setUsbCameraState,
    setUsbCameraModel,
    setUsbLiveViewUrl,
    setUsbLiveViewError,
    setUsbBatteryLevel,
  ]);

  // Separate Idle Timer & Visibility Handler
  useEffect(() => {
    resetIdleTimer();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (cameraMode === 'tablet') stopCamera();
      } else if (document.visibilityState === 'visible' && !isReviewOpen) {
        if (cameraMode === 'tablet') startCamera();
        resetIdleTimer();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [cameraMode, isReviewOpen, resetIdleTimer, startCamera, stopCamera]);

  // Capture current frame from tablet video element
  const captureFrame = useCallback((): string | null => {
    if (!videoRef.current) return null;
    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    if (cameraFacing === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.95);
  }, [cameraFacing]);

  // Execute shutter capture (source-aware: tablet vs standalone USB vs PC Remote)
  const executeCapture = useCallback(async () => {
    if (cameraMode === 'tablet') {
      const photoDataUrl = captureFrame();
      if (photoDataUrl) {
        ingestCapturedPhoto(photoDataUrl, undefined, 'tablet_camera');
      }
    } else if (cameraMode === 'usb_direct') {
      // Standalone Sony Direct USB capture via Capacitor Native Plugin (No PC/Hub)
      const corrId = 'CORR_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7).toUpperCase();
      console.log(`[BoothCameraView] [${corrId}] UI Shutter Tap: initiating SonyDirectCamera.capturePhoto()`);
      setIsCapturingTether(true);
      setTetherShutterError(null);
      try {
        const photoResult = await SonyDirectCamera.capturePhoto({ correlationId: corrId });
        console.log(`[BoothCameraView] [${corrId}] capturePhoto returned: photoId=${photoResult?.photoId}, nativeFilePath=${photoResult?.nativeFilePath}, correlationId=${photoResult?.correlationId}`);
        if (photoResult && (photoResult.dataUrl || photoResult.nativeFilePath)) {
          console.log(`[BoothCameraView] [${corrId}] Ingesting captured photo into review pipeline: ${photoResult.photoId}`);
          ingestCapturedPhoto(
            photoResult.dataUrl || photoResult.nativeFilePath,
            photoResult.photoId,
            'sony_usb_shutter'
          );
        } else {
          const errMsg = `[${corrId}] Kamera USB tidak mengembalikan data foto.`;
          console.error(`[BoothCameraView] ${errMsg}`);
          setTetherShutterError(errMsg);
        }
      } catch (err: any) {
        console.error(`[BoothCameraView] [${corrId}] USB capture error:`, err);
        setTetherShutterError(`[${corrId}] ${err.message || 'Gagal memicu shutter USB'}`);
      } finally {
        setIsCapturingTether(false);
      }
    } else {
      // High-res physical shutter capture via Desktop Hub
      setIsCapturingTether(true);
      setTetherShutterError(null);
      try {
        const res = await triggerTetherCapture(tetherHostUrl, 14000);
        if (res.success && res.photoDataUrl) {
          ingestCapturedPhoto(res.photoDataUrl, res.filename, 'app_trigger');
        } else {
          const errMsg = res.error || 'Desktop Hub tidak mengembalikan data foto';
          console.error('[BoothCameraView] Tether shutter error:', errMsg);
          setTetherShutterError(errMsg);
        }
      } catch (err: any) {
        console.error('[BoothCameraView] Tether shutter exception:', err);
        setTetherShutterError(err.message || 'Gagal memicu shutter kamera');
      } finally {
        setIsCapturingTether(false);
      }
    }
  }, [cameraMode, captureFrame, ingestCapturedPhoto, tetherHostUrl]);

  // Execute shutter photo sequence with user-initiated inter-pose control and duplicate guard
  const triggerShutterSequence = useCallback(() => {
    if (
      isTriggeringRef.current ||
      isCountingDown ||
      isCapturingTether ||
      isProcessing ||
      isReviewOpen ||
      isScreensaverActive
    ) {
      return;
    }
    if (rawShots.length >= totalSlots && retakeSlotIndex === null) {
      return;
    }

    isTriggeringRef.current = true;
    resetIdleTimer();

    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    let timeLeft = countdownDuration;
    if (timeLeft <= 0) {
      setIsCountingDown(false);
      executeCapture().finally(() => {
        isTriggeringRef.current = false;
      });
      return;
    }

    setIsCountingDown(true, timeLeft);

    countdownTimerRef.current = setInterval(() => {
      timeLeft -= 1;
      setCountdownValue(timeLeft);

      if (timeLeft <= 0) {
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
        setIsCountingDown(false);
        resetIdleTimer();
        executeCapture().finally(() => {
          isTriggeringRef.current = false;
        });
      }
    }, 1000);
  }, [
    isCountingDown,
    isCapturingTether,
    isProcessing,
    isReviewOpen,
    isScreensaverActive,
    rawShots.length,
    totalSlots,
    retakeSlotIndex,
    countdownDuration,
    setIsCountingDown,
    setCountdownValue,
    executeCapture,
    resetIdleTimer,
  ]);

  // Cleanup countdown interval and triggering ref on unmount
  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      isTriggeringRef.current = false;
    };
  }, []);

  // Keyboard controls: Space to capture, ESC to return to setup / cancel retake
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (
          !isCountingDown &&
          !isScreensaverActive &&
          !isReviewOpen &&
          !isProcessing &&
          !isCapturingTether
        ) {
          triggerShutterSequence();
        }
      } else if (e.code === 'Escape') {
        e.preventDefault();
        if (retakeSlotIndex !== null) {
          setRetakeSlotIndex(null);
        } else {
          setPhase('setup');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isCountingDown,
    isScreensaverActive,
    isReviewOpen,
    isProcessing,
    isCapturingTether,
    retakeSlotIndex,
    setRetakeSlotIndex,
    setPhase,
    triggerShutterSequence,
  ]);

  // Safety Watchdog: Guarantee isCapturingTether terminates cleanly and never hangs UI
  useEffect(() => {
    if (!isCapturingTether) return;
    const timer = setTimeout(() => {
      console.warn('[BoothCameraView] Watchdog triggered: resetting isCapturingTether after 25s timeout');
      setIsCapturingTether(false);
      setIsCountingDown(false);
    }, 25000);
    return () => clearTimeout(timer);
  }, [isCapturingTether, setIsCountingDown]);

  // Desktop 1:1 Parity: Multi-pose session pauses between poses and strictly waits for user button press.
  // Shutter is NEVER triggered automatically between poses.

  // Check if all slots are captured -> Trigger Composition
  useEffect(() => {
    if (rawShots.length > 0 && rawShots.length === totalSlots && retakeSlotIndex === null) {
      const composeAll = async () => {
        setIsProcessing(true);
        setTetherShutterError(null);
        try {
          // Ensure frame overlay is strictly applied to template if configured
          const effectiveTemplate = { ...currentTemplate };
          if (activeFrameOverlay && !effectiveTemplate.overlay) {
            const rawSrc = activeFrameOverlay.base64 || activeFrameOverlay.path || '';
            let src = rawSrc;
            if (rawSrc.startsWith('data:') || rawSrc.startsWith('http') || rawSrc.startsWith('/')) {
              src = rawSrc;
            } else if (rawSrc.length > 50) {
              src = `data:image/png;base64,${rawSrc}`;
            }
            effectiveTemplate.overlay = {
              path: src,
              base64: src,
              opacity: 1,
            };
          }

          const photoInputs = effectiveTemplate.photoSlots.map((slot, i) => {
            const shot = rawShots[i] || rawShots[rawShots.length - 1];
            return {
              slotId: slot.id,
              imageBufferOrBase64: shot?.dataUrl || '',
              mimeType: 'image/jpeg' as const,
            };
          });

          const compositePhotoUrl = await PhotoCompositor.composeRasterDataUrl(
            {
              template: effectiveTemplate,
              capturedPhotos: photoInputs,
            },
            'image/jpeg',
            0.95
          );

          let gifUrl: string | null = null;
          if (isBurstEnabled && rawShots.length > 0) {
            try {
              const frames = rawShots.map((s) => s.dataUrl);
              const gifOverlay =
                customGifOverlayUrl ||
                (activeFrameOverlay
                  ? (activeFrameOverlay.base64 || activeFrameOverlay.path)
                  : effectiveTemplate?.overlay?.path || null);

              const gifResult = await GifComposer.composeGif(frames, {
                playbackMode: 'boomerang',
                frameDelayMs: 500,
                frameOverlayBase64: gifOverlay,
                width: effectiveTemplate.canvas.width,
                height: effectiveTemplate.canvas.height,
                maxDimension: 960,
                dither: 0.70,
                quality: 'high',
                cutoutSlots: effectiveTemplate.photoSlots.map((s) => ({
                  x: s.x,
                  y: s.y,
                  width: s.width,
                  height: s.height,
                })),
              });
              gifUrl = gifResult.dataUrl;
            } catch (gifErr) {
              console.warn('[BoothCameraView] GIF generation fallback:', gifErr);
            }
          }

          setComposedResult(compositePhotoUrl, gifUrl);
          setIsReviewOpen(true);
        } catch (composeErr: any) {
          console.error('[BoothCameraView] Composition failed:', composeErr);
          setTetherShutterError('Gagal menyusun foto berbingkai: ' + (composeErr.message || 'Error'));
        } finally {
          setIsProcessing(false);
        }
      };

      composeAll();
    }
  }, [
    rawShots,
    totalSlots,
    retakeSlotIndex,
    currentTemplate,
    activeFrameOverlay,
    customGifOverlayUrl,
    isBurstEnabled,
    setIsProcessing,
    setComposedResult,
    setIsReviewOpen,
  ]);

  const activeSlotTarget = retakeSlotIndex !== null ? retakeSlotIndex : rawShots.length;

  return (
    <div
      onClick={() => {
        resetIdleTimer();
        if (
          !isCountingDown &&
          !isCapturingTether &&
          !isReviewOpen &&
          !isScreensaverActive &&
          !isProcessing &&
          (rawShots.length < totalSlots || retakeSlotIndex !== null)
        ) {
          triggerShutterSequence();
        }
      }}
      className={`relative w-full h-full flex flex-col items-center justify-center overflow-hidden bg-black select-none font-sans ${
        !isCountingDown && !isCapturingTether && !isProcessing && (rawShots.length < totalSlots || retakeSlotIndex !== null)
          ? 'cursor-pointer'
          : ''
      }`}
    >
      {/* ── 1. Fullscreen Camera Feed (Source-Aware) ── */}
      {cameraMode === 'tablet' ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover transition-transform duration-300 ${
            cameraFacing === 'user' ? 'scale-x-[-1]' : ''
          }`}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-black relative">
          {usbCameraConnected && !liveViewLoadFailed ? (
            <img
              src={usbLiveViewUrl || 'http://127.0.0.1:4949/liveview'}
              alt="Kamera USB Direct Live View"
              onLoad={() => setLiveViewLoadFailed(false)}
              onError={() => {
                console.warn('[BoothCameraView] Live view image load failed');
                setLiveViewLoadFailed(true);
              }}
              className="w-full h-full object-contain"
            />
          ) : usbCameraConnected ? (
            <div className="flex flex-col items-center justify-center p-6 text-center select-none z-10 max-w-sm">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-3 shadow-lg">
                <AlertCircle className="w-7 h-7" />
              </div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 mb-2">
                PTP Terhubung ({usbCameraState})
              </span>
              <p className="text-white font-semibold text-sm">
                {usbCameraModel} Terhubung, Namun Live View Belum Tampil
              </p>
              <p className="text-neutral-400 text-xs mt-1 leading-relaxed mb-4">
                {usbLiveViewError || 'Feed video belum diterima dari kamera. Coba mulai ulang streaming live view.'}
              </p>
              <button
                type="button"
                onClick={handleRetryLiveView}
                disabled={isRetryingLiveView}
                className="px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-semibold text-xs flex items-center gap-2 shadow-lg transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRetryingLiveView ? 'animate-spin' : ''}`} />
                <span>{isRetryingLiveView ? 'Menyiapkan...' : 'Coba Lagi Live View'}</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-6 text-center select-none z-10">
              <Usb className="w-12 h-12 text-neutral-600 mb-3 animate-pulse" />
              <p className="text-white font-semibold text-sm">Menunggu Kamera USB OTG...</p>
              <p className="text-neutral-400 text-xs mt-1 max-w-xs leading-relaxed">
                Sambungkan kamera via kabel USB OTG ke tablet Android dan pastikan pengaturan koneksi USB kamera sudah aktif.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Frame Overlay in Kiosk Mode */}
      {isLiveFrameVisible && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none p-4">
          <div
            style={{
              aspectRatio: `${activeFormat.width} / ${activeFormat.height}`,
            }}
            className="relative max-w-full max-h-full w-full h-full flex items-center justify-center"
          >
            {activeFrameOverlay ? (
              <img
                src={activeFrameOverlay.base64}
                alt="Frame Overlay"
                className="w-full h-full object-contain pointer-events-none opacity-90 drop-shadow-2xl"
              />
            ) : null}
          </div>
        </div>
      )}

      {/* Shutter White Flash Screen */}
      {isFlashActive && (
        <div className="absolute inset-0 z-50 bg-white animate-flash pointer-events-none" />
      )}

      {/* Countdown HUD Overlay */}
      {isCountingDown && (
        <CountdownOverlay
          value={countdownValue}
          totalSlots={totalSlots}
          currentSlot={activeSlotTarget}
        />
      )}

      {/* Camera Error State (Tablet Mode) */}
      {cameraMode === 'tablet' && cameraError && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-0 z-40 bg-neutral-950/95 flex flex-col items-center justify-center p-6 text-center select-none"
        >
          <div className="w-16 h-16 rounded-3xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Kamera Belum Terhubung</h2>
          <p className="text-xs sm:text-sm text-neutral-400 max-w-md mb-6 leading-relaxed">
            {cameraError}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => startCamera()}
              className="h-11 px-6 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-xs flex items-center gap-2 shadow-lg transition-all active:scale-95 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Hubungkan Ulang Kamera</span>
            </button>
            <button
              onClick={() => setPhase('setup')}
              className="h-11 px-5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white font-semibold text-xs transition-colors cursor-pointer"
            >
              Kembali ke Pengaturan
            </button>
          </div>
        </div>
      )}

      {/* Tether Shutter Error Toast */}
      {tetherShutterError && (
        <div className="absolute top-16 sm:top-20 inset-x-4 sm:inset-x-auto sm:left-6 z-50 max-w-md bg-rose-950/90 border border-rose-500/40 backdrop-blur-md p-3.5 rounded-2xl text-white shadow-2xl flex items-start gap-3 animate-fadeIn">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <p className="font-bold text-rose-200">Gagal Shutter PC Remote</p>
            <p className="text-rose-300/90 mt-0.5 leading-relaxed">{tetherShutterError}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setTetherShutterError(null);
              setIsCapturingTether(false);
            }}
            className="text-white/60 hover:text-white p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── 2. Subtle Event Watermark (Desktop/Tablet Top-Center) ── */}
      <div className="hidden md:flex absolute top-6 inset-x-0 z-20 flex-col items-center justify-center pointer-events-none text-center">
        <span className="text-base font-semibold tracking-wider text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]">
          {currentEvent.name}
        </span>
        <span className="text-xs font-medium text-white/75 drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]">
          {currentEvent.date}
        </span>
      </div>

      {/* ── 3. Top HUD: Responsive Non-Colliding Header Bar ── */}
      <header
        onClick={(e) => e.stopPropagation()}
        className="absolute top-0 inset-x-0 z-40 p-3 sm:p-6 flex items-center justify-between gap-2 pointer-events-none safe-top"
      >
        {/* Left: Truthful Source Badge & Intip Bingkai */}
        <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto min-w-0 shrink">
          {/* Camera Source Badge */}
          <div className="flex items-center gap-1.5 sm:gap-2 bg-black/70 backdrop-blur-md px-2.5 sm:px-3.5 py-1.5 rounded-full border border-white/20 text-xs text-white shadow-xl min-w-0">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                cameraMode === 'usb_direct'
                  ? isCapturingTether
                    ? 'bg-amber-400 animate-spin'
                    : usbCameraConnected
                    ? 'bg-emerald-400 animate-pulse'
                    : 'bg-rose-500'
                  : cameraMode === 'pcremote'
                  ? isCapturingTether
                    ? 'bg-amber-400 animate-spin'
                    : tetherCameraConnected
                    ? 'bg-emerald-400 animate-pulse'
                    : tetherStatus === 'connected'
                    ? 'bg-amber-400'
                    : 'bg-rose-500'
                  : 'bg-emerald-400 animate-pulse'
              }`}
            />
            <span className="font-medium text-[11px] sm:text-xs truncate">
              {cameraMode === 'usb_direct'
                ? isCapturingTether
                  ? 'Sedang Memotret...'
                  : usbCameraConnected
                  ? `${usbCameraModel || 'Kamera'} (USB)`
                  : 'Kamera USB Terputus'
                : cameraMode === 'pcremote'
                ? isCapturingTether
                  ? 'Sedang Memotret...'
                  : tetherCameraConnected
                  ? `${tetherCameraModel || 'Kamera Studio'}`
                  : tetherStatus === 'connected'
                  ? 'Kamera Belum Terdeteksi'
                  : 'Desktop Hub Offline'
                : cameraFacing === 'user'
                ? 'Kamera Depan'
                : 'Kamera Belakang'}
            </span>
            {cameraMode === 'usb_direct' && (
              <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 shrink-0">
                20261020-P0-SONY-SHUTTER-FIX-01
              </span>
            )}
          </div>

          {/* Intip Bingkai Toggle (Kiosk Live Viewframe) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleLiveFrameVisibility();
            }}
            className={`h-8 sm:h-10 px-2.5 sm:px-3.5 rounded-full flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold backdrop-blur-md border shadow-2xl transition-all cursor-pointer active:scale-95 ${
              isLiveFrameVisible
                ? 'bg-white text-black border-white'
                : 'bg-black/70 text-neutral-300 hover:text-white border-white/20'
            }`}
            title="Intip Bingkai (Tampilkan overlay bingkai pada live view)"
          >
            <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="hidden xs:inline sm:inline">
              {isLiveFrameVisible ? 'Tutup Bingkai' : 'Intip Bingkai'}
            </span>
          </button>
        </div>

        {/* Right: Quick Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 pointer-events-auto shrink-0">
          {/* Standby Wallpaper Setting Pill */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsWallpaperModalOpen(true);
            }}
            className="h-8 sm:h-10 px-2.5 sm:px-3.5 rounded-full bg-black/70 hover:bg-black/90 backdrop-blur-md border border-white/20 hover:border-white/40 flex items-center gap-1.5 text-white/90 hover:text-white text-[11px] sm:text-xs font-semibold shadow-2xl active:scale-95 transition-all cursor-pointer"
            title="Pengaturan Timer & Wallpaper Standby"
          >
            <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-neutral-300 shrink-0" />
            <span className="hidden sm:inline">Standby:</span>
            <span className="font-mono">
              {enableStandbyWallpaper
                ? standbyTimeoutMinutes < 1
                  ? `${Math.round(standbyTimeoutMinutes * 60)}s`
                  : `${standbyTimeoutMinutes}m`
                : 'Mati'}
            </span>
          </button>

          {/* Galeri Foto Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsGalleryOpen(true);
            }}
            className="h-8 sm:h-10 px-2.5 sm:px-4 rounded-full bg-black/70 hover:bg-black/90 backdrop-blur-md border border-white/20 hover:border-white/40 flex items-center gap-1.5 sm:gap-2 text-white/95 hover:text-white text-[11px] sm:text-xs font-semibold shadow-2xl active:scale-95 transition-all cursor-pointer group"
            title="Lihat Galeri Foto Acara"
          >
            <Images className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-neutral-300 group-hover:scale-110 transition-transform shrink-0" />
            <span className="hidden xs:inline sm:inline">Galeri Foto</span>
          </button>

          {/* Pengaturan / Batal Retake Button */}
          {retakeSlotIndex !== null ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setRetakeSlotIndex(null);
              }}
              className="h-8 sm:h-10 px-3 sm:px-4 rounded-full bg-black/70 hover:bg-black/90 backdrop-blur-md border border-white/20 flex items-center gap-1.5 sm:gap-2 text-white/90 hover:text-white text-[11px] sm:text-xs font-semibold shadow-2xl active:scale-95 transition-all hover:border-white/40 cursor-pointer"
              title="Batalkan ambil ulang dan kembali ke hasil foto (ESC)"
            >
              <X className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white shrink-0" />
              <span>Batal Retake</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPhase('setup');
              }}
              className="h-8 sm:h-10 px-2.5 sm:px-4 rounded-full bg-black/70 hover:bg-black/90 backdrop-blur-md border border-white/20 flex items-center gap-1.5 sm:gap-2 text-white/90 hover:text-white text-[11px] sm:text-xs font-semibold shadow-2xl active:scale-95 transition-all hover:border-white/40 cursor-pointer"
              title="Kembali ke Layar Pengaturan (ESC)"
            >
              <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white shrink-0" />
              <span className="hidden xs:inline sm:inline">Pengaturan</span>
              <span className="hidden md:inline px-1.5 py-0.5 rounded bg-white/15 text-[10px] text-neutral-300 font-mono">
                ESC
              </span>
            </button>
          )}
        </div>
      </header>

      {/* PIP Thumbnails or Targeted Retake Indicator positioned cleanly below the source badge */}
      {retakeSlotIndex !== null ? (
        <div className="absolute top-15 sm:top-20 left-3 sm:left-6 z-30 flex items-center gap-2 sm:gap-3 bg-black/75 backdrop-blur-md px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl border border-white/20 shadow-2xl pointer-events-none animate-fadeIn">
          {rawShots[retakeSlotIndex] && (
            <img
              src={rawShots[retakeSlotIndex].dataUrl}
              alt={`Foto Lama Pose ${retakeSlotIndex + 1}`}
              className="w-8 h-12 sm:w-10 sm:h-14 rounded-lg object-cover border border-white/30"
            />
          )}
          <div className="flex flex-col">
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-1">
              <RotateCcw className="w-3 h-3 text-neutral-300" /> Target Ambil Ulang
            </span>
            <span className="text-xs font-semibold text-white">Pose {retakeSlotIndex + 1}</span>
          </div>
        </div>
      ) : rawShots.length > 0 && !isCountingDown ? (
        <div className="absolute top-15 sm:top-20 left-3 sm:left-6 z-30 flex flex-col gap-2 pointer-events-none animate-fadeIn">
          {rawShots.map((photo, pIdx) => (
            <div
              key={pIdx}
              className="w-14 h-18 sm:w-20 sm:h-24 rounded-xl overflow-hidden border-2 border-white/80 shadow-[0_8px_24px_rgba(0,0,0,0.7)] bg-black relative"
            >
              <img
                src={photo.dataUrl}
                alt={`Pose ${pIdx + 1}`}
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-0 inset-x-0 py-0.5 bg-black/70 text-center text-[9px] font-bold text-white uppercase tracking-wider">
                Pose {pIdx + 1}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* ── 5. Bottom Center: Prominent White Shutter Button ── */}
      {!isCountingDown && !isProcessing && (rawShots.length < totalSlots || retakeSlotIndex !== null) && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-8 sm:bottom-10 inset-x-0 z-20 flex flex-col items-center justify-center pointer-events-auto animate-fadeIn gap-2 safe-bottom px-4"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              triggerShutterSequence();
            }}
            disabled={isCapturingTether}
            className="max-w-[92vw] px-6 sm:px-9 py-3 sm:py-4 rounded-full bg-white text-black font-bold text-xs sm:text-sm tracking-wider uppercase flex items-center justify-center gap-2 sm:gap-3 shadow-[0_10px_35px_rgba(0,0,0,0.6)] active:scale-95 transition-all hover:bg-neutral-200 cursor-pointer text-center disabled:opacity-75 disabled:cursor-not-allowed"
          >
            {isCapturingTether ? (
              <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 animate-spin shrink-0 text-black" />
            ) : (
              <Camera className="w-4 h-4 sm:w-5 sm:h-5 fill-black shrink-0" />
            )}
            <span className="truncate">
              {isCapturingTether
                ? 'MEMPROSES FOTO KAMERA...'
                : retakeSlotIndex !== null
                ? `AMBIL FOTO POSE ${retakeSlotIndex + 1}`
                : rawShots.length > 0
                ? `SENTUH UNTUK FOTO ${rawShots.length + 1}`
                : 'SENTUH LAYAR UNTUK MEMOTRET'}
            </span>
          </button>
          {rawShots.length > 0 && rawShots.length < totalSlots && retakeSlotIndex === null && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeLastRawShot();
              }}
              disabled={isCapturingTether}
              className="text-[11px] sm:text-xs text-white/90 hover:text-white flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-black/50 backdrop-blur-md border border-white/20 transition-colors shadow-md cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Ulangi Pose {rawShots.length}</span>
            </button>
          )}
        </div>
      )}

      {/* ── Processing HUD (Desktop Parity) ── */}
      {isProcessing && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md pointer-events-none animate-fadeIn">
          <RefreshCw className="w-10 h-10 text-white animate-spin mb-4" />
          <span className="text-sm sm:text-base font-semibold text-white tracking-wide">
            {totalSlots > 1 ? 'Menyiapkan Foto & Animasi GIF...' : 'Memasang Foto ke Bingkai...'}
          </span>
        </div>
      )}

      {/* ── 6. Fullscreen Wallpaper Standby Screensaver ── */}
      {isScreensaverActive && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            resetIdleTimer();
          }}
          className="absolute inset-0 z-50 bg-black flex items-center justify-center cursor-pointer animate-fadeIn select-none"
        >
          <img
            src={getActiveWallpaper()}
            alt="Screensaver Wallpaper"
            className={`w-full h-full pointer-events-none transition-all duration-700 ${
              wallpaperFitMode === 'cover' ? 'object-cover' : 'object-contain'
            }`}
          />
          <div className="absolute bottom-8 inset-x-0 flex flex-col items-center justify-center pointer-events-none text-center">
            <span className="text-xs sm:text-sm font-semibold tracking-wider text-white bg-black/60 backdrop-blur-md px-5 py-2.5 rounded-full border border-white/20 shadow-2xl animate-pulse">
              Sentuh layar untuk mulai berfoto ✨
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
