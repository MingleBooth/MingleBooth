import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  useMobileBoothStore,
  DEFAULT_WALLPAPERS,
  MobileEvent,
} from '../store/mobile-booth-store';
import {
  Calendar,
  Layers,
  Camera,
  Clock,
  Monitor,
  Check,
  Plus,
  RefreshCw,
  Upload,
  Film,
  Laptop,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCcw,
  SwitchCamera,
  Wifi,
  WifiOff,
  Usb,
  FolderOpen,
  QrCode,
} from 'lucide-react';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { processCustomFramePng } from '../lib/mobileTemplateEngine';
import {
  probeTetherHost,
  fetchTetherLiveFrame,
  connectTetherCamera,
  saveTetherHostUrl,
  normalizeHostUrl,
} from '../lib/tetherClient';
import { SonyDirectCamera } from '../lib/plugins/sonyCameraPlugin';

export const StudioSetupView: React.FC = () => {
  const {
    currentEvent,
    setCurrentEvent,
    eventsList,
    setupTab,
    setSetupTab,
    activeFormat,
    shotsCount,
    setShotsCount,
    countdownDuration,
    setCountdownDuration,
    activeFrameOverlay,
    setActiveFrameOverlay,
    showFrameOverlayInPreview,
    setShowFrameOverlayInPreview,
    cameraFacing,
    toggleCameraFacing,
    cameraMode,
    setCameraMode,
    enableStandbyWallpaper,
    setEnableStandbyWallpaper,
    standbyTimeoutMinutes,
    setStandbyTimeoutMinutes,
    wallpaperFitMode,
    setWallpaperFitMode,
    selectedWallpaperId,
    setSelectedWallpaperId,
    setIsWallpaperModalOpen,
    isBurstEnabled,
    setIsBurstEnabled,
    customGifOverlayUrl,
    setCustomGifOverlayUrl,
    setPhase,
    setIsEventSelectOpen,
    setIsEventQrModalOpen,
    tetherHostUrl,
    setTetherHostUrl,
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
    tetherError,
    setTetherError,
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
  } = useMobileBoothStore();

  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraLoading, setCameraLoading] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraAspectRatio, setCameraAspectRatio] = useState<string>('4 / 3');

  // Standalone Sony USB Direct local states
  const [isConnectingUsb, setIsConnectingUsb] = useState<boolean>(false);
  const [usbDiscoveryMessage, setUsbDiscoveryMessage] = useState<string | null>(null);
  const [usbDiagnosticReport, setUsbDiagnosticReport] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);
  const [liveViewLoadFailed, setLiveViewLoadFailed] = useState<boolean>(false);
  const [liveViewRetryKey, setLiveViewRetryKey] = useState<number>(0);
  const [isRetryingLiveView, setIsRetryingLiveView] = useState<boolean>(false);

  // PC Remote Tether local states
  const [hostInput, setHostInput] = useState<string>(tetherHostUrl);
  const [isTestingTether, setIsTestingTether] = useState<boolean>(false);
  const [isConnectingSony, setIsConnectingSony] = useState<boolean>(false);
  const [tetherFeedback, setTetherFeedback] = useState<string | null>(null);
  const tetherPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const liveFramePollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const customFrameInputRef = useRef<HTMLInputElement>(null);
  const customGifFrameInputRef = useRef<HTMLInputElement>(null);

  // Template options list (clean by default; user uploads custom frames)
  const defaultTemplates: any[] = [];

  // Attach preview video ref callback ensuring immediate stream playback
  const attachPreviewVideoRef = useCallback((node: HTMLVideoElement | null) => {
    previewVideoRef.current = node;
    if (node && streamRef.current) {
      if (node.srcObject !== streamRef.current) {
        node.srcObject = streamRef.current;
      }
      node.play().catch(() => {});
    }
  }, []);

  // Stop tablet camera stream cleanly and detach element
  const stopPreviewCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  }, []);

  // Start preview tablet camera stream
  const startPreviewCamera = useCallback(async () => {
    stopPreviewCamera();
    setCameraLoading(true);
    setCameraError(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Antarmuka kamera tidak tersedia di perangkat ini.');
        setCameraLoading(false);
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: cameraFacing,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      setIsCameraActive(true);

      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
        previewVideoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      console.warn('[StudioSetupView] Camera error:', err);
      setCameraError('Gagal mengakses kamera. Periksa izin akses kamera perangkat.');
      setIsCameraActive(false);
    } finally {
      setCameraLoading(false);
    }
  }, [cameraFacing, stopPreviewCamera]);

  // Handle video element loaded metadata to detect real aspect ratio
  const handleVideoMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    if (v.videoWidth && v.videoHeight) {
      setCameraAspectRatio(`${v.videoWidth} / ${v.videoHeight}`);
    }
    v.play().catch(() => {});
  };

  const hotFolderDisplayPath = `/storage/emulated/0/Documents/MingleBooth/${currentEvent?.id && currentEvent.id !== 'evt_demo_mobile' ? currentEvent.name.replace(/[^a-zA-Z0-9_-]/g, '_') : 'Captures'}`;

  const handleOpenFolder = async () => {
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.openFolder) {
        (window as any).electronAPI.openFolder(hotFolderDisplayPath);
      } else {
        await Filesystem.getUri({
          directory: Directory.Documents,
          path: 'MingleBooth',
        });
      }
    } catch (e) {
      console.warn('[StudioSetupView] Open folder notice:', e);
    }
  };

  // Tether probe runner
  const runTetherProbe = useCallback(async (url: string) => {
    const status = await probeTetherHost(url, 2800);
    setTetherStatus(status.cameraConnected ? 'connected' : (status.isHostReachable ? 'disconnected' : 'disconnected'));
    setTetherCameraConnected(status.cameraConnected);
    setTetherCameraState(status.cameraState);
    setTetherCameraModel(status.cameraModel);
    if (!status.isHostReachable) {
      setTetherError(status.errorMessage || 'Desktop Hub tidak terjangkau');
    } else if (!status.cameraConnected) {
      setTetherError('Desktop Hub terhubung, namun kamera belum terdeteksi via USB.');
    } else {
      setTetherError(null);
    }
    return status;
  }, [setTetherStatus, setTetherCameraConnected, setTetherCameraState, setTetherCameraModel, setTetherError]);


  // Source-aware camera lifecycle
  useEffect(() => {
    let usbStatusSub: any = null;

    if (cameraMode === 'tablet') {
      // Clear tether polling & live frames
      if (tetherPollIntervalRef.current) clearInterval(tetherPollIntervalRef.current);
      if (liveFramePollIntervalRef.current) clearInterval(liveFramePollIntervalRef.current);
      setTetherLiveFrame(null);
      SonyDirectCamera.stopLiveView().catch(() => {});
      startPreviewCamera();
    } else if (cameraMode === 'usb_direct') {
      stopPreviewCamera();
      if (tetherPollIntervalRef.current) clearInterval(tetherPollIntervalRef.current);
      if (liveFramePollIntervalRef.current) clearInterval(liveFramePollIntervalRef.current);
      setTetherLiveFrame(null);

      // Check current USB camera status
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
              .then((s) => {
                setUsbLiveViewUrl(`${s.streamUrl}?t=${Date.now()}`);
                setLiveViewLoadFailed(false);
              })
              .catch((lvErr: any) => {
                setUsbLiveViewError(lvErr.message || 'Gagal memulai feed live view');
              });
          }
        })
        .catch(() => {});

      // Subscribe to native camera status events
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
            .then((s) => {
              setUsbLiveViewUrl(`${s.streamUrl}?t=${Date.now()}`);
              setLiveViewLoadFailed(false);
            })
            .catch((lvErr: any) => {
              setUsbLiveViewError(lvErr.message || 'Gagal memulai feed live view');
            });
        }
      }).then((sub) => {
        usbStatusSub = sub;
      });
    } else {
      // PC Remote Mode: Stop tablet camera cleanly & detach tracks
      stopPreviewCamera();
      SonyDirectCamera.stopLiveView().catch(() => {});

      // Initial probe of Desktop Hub
      runTetherProbe(tetherHostUrl);

      // Status polling interval every 3s
      tetherPollIntervalRef.current = setInterval(() => {
        runTetherProbe(tetherHostUrl);
      }, 3000);

      // Live frame polling interval every 180ms
      liveFramePollIntervalRef.current = setInterval(async () => {
        const frameRes = await fetchTetherLiveFrame(tetherHostUrl, 1200);
        if (frameRes.success && frameRes.frameDataUrl) {
          setTetherLiveFrame(frameRes.frameDataUrl);
        }
      }, 180);
    }

    return () => {
      stopPreviewCamera();
      if (tetherPollIntervalRef.current) clearInterval(tetherPollIntervalRef.current);
      if (liveFramePollIntervalRef.current) clearInterval(liveFramePollIntervalRef.current);
      if (usbStatusSub && typeof usbStatusSub.remove === 'function') {
        usbStatusSub.remove();
      }
    };
  }, [
    cameraMode,
    tetherHostUrl,
    startPreviewCamera,
    stopPreviewCamera,
    runTetherProbe,
    setTetherLiveFrame,
    setTetherStatus,
    setUsbCameraConnected,
    setUsbCameraState,
    setUsbCameraModel,
    setUsbLiveViewUrl,
    setUsbLiveViewError,
    setUsbBatteryLevel,
  ]);

  // Standalone Sony USB Direct: Discover & Connect via native USB OTG
  const handleConnectUsbSony = async () => {
    setIsConnectingUsb(true);
    setUsbDiscoveryMessage(null);
    setUsbDiagnosticReport(null);
    setUsbLiveViewError(null);
    setLiveViewLoadFailed(false);
    try {
      const { cameras } = await SonyDirectCamera.discoverCameras();
      if (!cameras || cameras.length === 0) {
        setUsbDiscoveryMessage(
          'Kamera tidak terdeteksi via USB OTG. Pastikan kabel USB OTG terpasang kencang dan mode USB kamera diatur dengan benar.'
        );
        setUsbCameraConnected(false);
        setUsbCameraState('DISCONNECTED');
        return;
      }
      const cam = cameras[0];
      setUsbCameraModel(cam.model || cam.name || 'Kamera USB');
      const res = await SonyDirectCamera.connectCamera({ cameraId: cam.id });
      if (res.success) {
        setUsbCameraConnected(true);
        setUsbCameraState(res.status?.state || 'CAMERA_READY');
        setUsbCameraModel(res.status?.model || cam.model || 'Kamera USB');
        if (res.status?.batteryLevel !== undefined) setUsbBatteryLevel(res.status.batteryLevel);
        if (res.status?.diagnosticReport) setUsbDiagnosticReport(res.status.diagnosticReport);
        try {
          const streamInfo = await SonyDirectCamera.startLiveView();
          setUsbLiveViewUrl(`${streamInfo.streamUrl}?t=${Date.now()}`);
          setLiveViewLoadFailed(false);
          setLiveViewRetryKey((k) => k + 1);
        } catch (liveErr: any) {
          console.warn('[StudioSetupView] Start liveview notice:', liveErr);
          setUsbLiveViewError(liveErr.message || 'Kamera terhubung namun live view belum dapat dimulai.');
        }
      } else {
        setUsbDiscoveryMessage('Gagal menginisialisasi kamera.');
      }
    } catch (err: any) {
      setUsbDiscoveryMessage(err.message || 'Error saat menghubungkan kamera USB.');
      setUsbCameraConnected(false);
      try {
        const diag = await SonyDirectCamera.getUsbDiagnostics();
        if (diag && diag.diagnosticReport) {
          setUsbDiagnosticReport(diag.diagnosticReport);
        }
      } catch (dErr) {}
    } finally {
      setIsConnectingUsb(false);
    }
  };

  // Standalone Sony USB Direct: Safe Reconnect ensuring resource teardown before re-acquiring handles
  const handleReconnectUsbSony = async () => {
    setIsConnectingUsb(true);
    setUsbDiscoveryMessage('Membersihkan resource USB dan menghubungkan ulang...');
    setUsbDiagnosticReport(null);
    setUsbLiveViewError(null);
    setLiveViewLoadFailed(false);
    try {
      await SonyDirectCamera.disconnectCamera();
    } catch (ignored) {}
    await new Promise((r) => setTimeout(r, 250));
    await handleConnectUsbSony();
  };

  // Standalone Sony USB Direct: Retry Live View safely without recreating USB handle
  const handleRetryLiveView = async () => {
    setIsRetryingLiveView(true);
    setUsbDiscoveryMessage(null);
    setUsbLiveViewError(null);
    try {
      const res = await SonyDirectCamera.startLiveView();
      setUsbLiveViewUrl(`${res.streamUrl}?t=${Date.now()}`);
      setLiveViewLoadFailed(false);
      setLiveViewRetryKey((k) => k + 1);
    } catch (e: any) {
      console.warn('[StudioSetupView] Retry live view error:', e);
      setUsbLiveViewError(e.message || 'Gagal memulai ulang live view');
      setLiveViewLoadFailed(true);
    } finally {
      setIsRetryingLiveView(false);
    }
  };

  // Test Tether Connection from UI
  const handleTestTetherConnection = async () => {
    setIsTestingTether(true);
    setTetherFeedback(null);
    const normalized = saveTetherHostUrl(hostInput);
    setTetherHostUrl(normalized);
    setHostInput(normalized);

    const status = await runTetherProbe(normalized);
    setIsTestingTether(false);

    if (!status.isHostReachable) {
      setTetherFeedback(`Gagal: ${status.errorMessage || 'Desktop Hub tidak merespons di ' + normalized}`);
    } else if (!status.cameraConnected) {
      setTetherFeedback(`Hub terhubung (${status.port || '4848'}), namun kamera belum terdeteksi via USB. Klik "Hubungkan Kamera" untuk mendeteksi kamera.`);
    } else {
      setTetherFeedback(`Sukses! ${status.cameraModel || 'Kamera'} siap digunakan.`);
      const frame = await fetchTetherLiveFrame(normalized, 1500);
      if (frame.success && frame.frameDataUrl) {
        setTetherLiveFrame(frame.frameDataUrl);
      }
    }
  };

  // Re-trigger Camera connection via Desktop Hub
  const handleConnectSonyCamera = async () => {
    setIsConnectingSony(true);
    setTetherFeedback('Mendeteksi dan menghubungkan kamera via Desktop Hub...');
    const res = await connectTetherCamera(tetherHostUrl, 10000);
    setIsConnectingSony(false);
    if (res.success) {
      setTetherFeedback(`Sukses! ${res.camera?.model || 'Kamera'} berhasil terhubung.`);
      await runTetherProbe(tetherHostUrl);
      const frame = await fetchTetherLiveFrame(tetherHostUrl, 1500);
      if (frame.success && frame.frameDataUrl) {
        setTetherLiveFrame(frame.frameDataUrl);
      }
    } else {
      setTetherFeedback(`Gagal: ${res.error || 'Desktop Hub tidak dapat menghubungkan kamera.'}`);
      await runTetherProbe(tetherHostUrl);
    }
  };

  // Handle PNG frame upload
  const handleUploadCustomFrame = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const res = await processCustomFramePng(file, activeFormat);
      if (res.frame) {
        setActiveFrameOverlay(res.frame);
        setShowFrameOverlayInPreview(true);
      }
    } catch (err) {
      console.error('Failed to process frame PNG:', err);
    } finally {
      e.target.value = '';
    }
  };

  // Handle GIF frame upload
  const handleUploadCustomGifFrame = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const b64 = event.target?.result as string;
      if (b64) {
        setCustomGifOverlayUrl(b64);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <main className="flex-1 flex flex-col landscape:flex-row md:flex-row min-h-0 overflow-hidden select-none bg-[#090A0C]">
      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {/* SISI KIRI: LARGE CAMERA & TEMPLATE PREVIEW VIEWPORT */}
      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      <section className="w-full landscape:flex-1 md:flex-1 h-[34vh] max-h-[320px] min-h-[200px] sm:h-[38vh] landscape:max-h-none landscape:h-full md:h-full bg-[#0A0A0B] flex items-center justify-center p-2 sm:p-3 md:p-6 min-h-0 min-w-0 relative overflow-hidden shrink-0 landscape:shrink">
        {/* Top Floating Controls Bar across the entire preview column (never constrained by 1:3 strip aspect ratio) */}
        <div className="absolute top-2.5 sm:top-4 inset-x-2.5 sm:inset-x-4 z-20 flex items-center justify-between pointer-events-none gap-2">
          {/* Left: Truthful Source & Status Badge */}
          <div className="flex items-center gap-1.5 sm:gap-2 bg-black/70 backdrop-blur-md px-2.5 sm:px-3 py-1.5 rounded-full border border-white/10 text-xs text-neutral-200 shadow-xl pointer-events-auto min-w-0 max-w-[55%]">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                cameraMode === 'usb_direct'
                  ? usbCameraConnected
                    ? 'bg-emerald-400 animate-pulse'
                    : isConnectingUsb
                    ? 'bg-amber-400 animate-spin'
                    : 'bg-neutral-500'
                  : isCameraActive
                  ? 'bg-emerald-400 animate-pulse'
                  : cameraLoading
                  ? 'bg-amber-400 animate-spin'
                  : 'bg-neutral-500'
              }`}
            />
            <span className="font-medium text-[11px] sm:text-xs truncate">
              {cameraMode === 'usb_direct'
                ? usbCameraConnected
                  ? `${usbCameraModel || 'Kamera USB'} (Control)${usbBatteryLevel !== null && usbBatteryLevel >= 0 ? ` (${usbBatteryLevel}%)` : ''}`
                  : isConnectingUsb
                  ? 'Menghubungkan Kamera USB...'
                  : 'Kamera Belum Terhubung'
                : isCameraActive
                ? cameraFacing === 'user'
                  ? 'Kamera Depan'
                  : 'Kamera Belakang'
                : cameraLoading
                ? 'Menghubungkan...'
                : 'Kamera Offline'}
            </span>
          </div>

          {/* Right: Intip Bingkai + Ratio */}
          <div className="flex items-center gap-1 sm:gap-2 pointer-events-auto shrink-0">
            <button
              type="button"
              onClick={() => setShowFrameOverlayInPreview(!showFrameOverlayInPreview)}
              className={`h-7 sm:h-8 px-2 sm:px-3 rounded-full text-[10px] sm:text-[11px] font-medium transition-all flex items-center gap-1 sm:gap-1.5 backdrop-blur-md border shadow-xl cursor-pointer ${
                showFrameOverlayInPreview
                  ? 'bg-white text-black border-white font-semibold'
                  : 'bg-black/70 text-neutral-300 hover:text-white border-white/10'
              }`}
              title="Lihat bagaimana foto akan pas di dalam bingkai"
            >
              <Layers className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
              <span>{showFrameOverlayInPreview ? 'Tutup Bingkai' : 'Intip Bingkai'}</span>
            </button>
            <span className="h-7 sm:h-8 px-2 sm:px-2.5 rounded-full text-[10px] sm:text-xs font-mono bg-black/70 backdrop-blur-md border border-white/10 text-neutral-300 flex items-center shadow-xl">
              Rasio: {activeFormat.ratio}
            </span>
          </div>
        </div>

        {/* Large Framing Box with true aspect ratio preservation */}
        <div
          style={{
            aspectRatio: showFrameOverlayInPreview
              ? `${activeFormat.width} / ${activeFormat.height}`
              : cameraMode === 'pcremote' || cameraMode === 'usb_direct'
              ? '3 / 2'
              : cameraAspectRatio || '4 / 3',
            maxWidth: '100%',
            maxHeight: '100%',
          }}
          className="rounded-2xl bg-[#0F1014] border border-white/[0.08] overflow-hidden relative shadow-2xl flex items-center justify-center transition-all duration-300 w-auto h-auto max-w-full max-h-full"
        >
          {/* Active Camera Feed Viewport */}
          {cameraMode === 'tablet' ? (
            // TABLET MODE FEED
            isCameraActive ? (
              <div className="relative w-full h-full flex items-center justify-center">
                <video
                  ref={attachPreviewVideoRef}
                  autoPlay
                  playsInline
                  muted
                  onLoadedMetadata={handleVideoMetadata}
                  className={`w-full h-full ${
                    showFrameOverlayInPreview ? 'object-cover' : 'object-contain'
                  } ${cameraFacing === 'user' ? 'transform -scale-x-100' : ''}`}
                />

                {/* Frame Overlay on Top of Live Video */}
                {showFrameOverlayInPreview && (
                  <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
                    {activeFrameOverlay ? (
                      <img
                        src={activeFrameOverlay.base64}
                        alt="Bingkai Preview"
                        className="w-full h-full object-contain pointer-events-none animate-fadeIn"
                      />
                    ) : (
                      <img
                        src="/frames/wedding_bayu_irma.png"
                        alt="Bingkai Default"
                        className="w-full h-full object-contain pointer-events-none animate-fadeIn"
                      />
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-6 sm:p-8 text-center max-w-md w-full mx-auto select-none z-0">
                <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-neutral-300 mb-4 shadow-xl">
                  {cameraLoading ? (
                    <RefreshCw className="w-7 h-7 animate-spin text-white" />
                  ) : (
                    <Camera className="w-8 h-8 text-white stroke-[1.5]" />
                  )}
                </div>

                <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-mono uppercase tracking-wider text-neutral-400 bg-white/[0.04] border border-white/[0.08] mb-3">
                  Mode Kamera Tablet
                </span>

                <h3 className="text-base sm:text-lg font-semibold text-white tracking-tight mb-2">
                  {cameraLoading ? 'Menghubungkan Kamera Tablet...' : 'Kamera Tablet Belum Terhubung'}
                </h3>

                {cameraError ? (
                  <p className="text-xs text-rose-300 max-w-sm mb-6 leading-relaxed bg-rose-500/10 px-3.5 py-2.5 rounded-xl border border-rose-500/20">
                    {cameraError}
                  </p>
                ) : (
                  <p className="text-xs text-neutral-400 max-w-sm mb-6 leading-relaxed">
                    Aktifkan kamera perangkat untuk memulai live view dan uji framing bingkai.
                  </p>
                )}

                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={startPreviewCamera}
                    className="px-6 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] hover:border-white/20 text-white font-medium text-xs flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-[0.98]"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Sambungkan Kamera</span>
                  </button>
                </div>
              </div>
            )
          ) : (
            // STANDALONE SONY USB DIRECT (OTG) FEED
            usbCameraConnected && usbLiveViewUrl && !liveViewLoadFailed ? (
              <div className="relative w-full h-full flex items-center justify-center">
                <img
                  key={liveViewRetryKey}
                  src={usbLiveViewUrl}
                  alt="Camera Live View"
                  onLoad={() => {
                    setLiveViewLoadFailed(false);
                  }}
                  onError={() => {
                    console.warn('[StudioSetupView] Live view image load failed');
                    setLiveViewLoadFailed(true);
                  }}
                  className={`w-full h-full ${
                    showFrameOverlayInPreview ? 'object-cover' : 'object-contain'
                  }`}
                />


                {/* Frame Overlay on Top of Live View */}
                {showFrameOverlayInPreview && (
                  <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
                    {activeFrameOverlay ? (
                      <img
                        src={activeFrameOverlay.base64}
                        alt="Bingkai Preview"
                        className="w-full h-full object-contain pointer-events-none animate-fadeIn"
                      />
                    ) : (
                      <img
                        src="/frames/wedding_bayu_irma.png"
                        alt="Bingkai Default"
                        className="w-full h-full object-contain pointer-events-none animate-fadeIn"
                      />
                    )}
                  </div>
                )}
              </div>
            ) : usbCameraConnected ? (
              // Connected but Live View Not Streaming or Load Failed
              <div className="flex flex-col items-center justify-center p-6 sm:p-8 text-center max-w-md w-full mx-auto select-none z-0">
                <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-4 shadow-xl">
                  {isRetryingLiveView ? (
                    <RefreshCw className="w-8 h-8 animate-spin" />
                  ) : (
                    <AlertCircle className="w-8 h-8" />
                  )}
                </div>

                <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-mono uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 mb-3">
                  PTP Terhubung ({usbCameraState})
                </span>

                <h3 className="text-base sm:text-lg font-semibold text-white tracking-tight mb-2">
                  {usbCameraModel} Terhubung, Namun Live View Belum Tampil
                </h3>

                <p className="text-xs text-neutral-400 max-w-sm mb-6 leading-relaxed">
                  {usbLiveViewError ||
                    'Sesi USB PTP berhasil dibuka, namun stream feed video live view belum diterima. Tekan tombol di bawah untuk mencoba memuat ulang feed live view.'}
                </p>

                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={handleRetryLiveView}
                    disabled={isRetryingLiveView}
                    className="px-6 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-[0.98] shadow-lg disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRetryingLiveView ? 'animate-spin' : ''}`} />
                    <span>{isRetryingLiveView ? 'Menyiapkan Live View...' : 'Coba Lagi Live View'}</span>
                  </button>
                </div>
              </div>
            ) : (
              // Explicit Disconnected State for Standalone USB Direct
              <div className="flex flex-col items-center justify-center p-6 sm:p-8 text-center max-w-md w-full mx-auto select-none z-0">
                <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-neutral-300 mb-4 shadow-xl">
                  {isConnectingUsb ? (
                    <RefreshCw className="w-8 h-8 animate-spin text-amber-400" />
                  ) : (
                    <Usb className="w-8 h-8 text-neutral-400 stroke-[1.5]" />
                  )}
                </div>

                <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-mono uppercase tracking-wider text-neutral-400 bg-white/[0.04] border border-white/[0.08] mb-3">
                  Kamera USB Direct (OTG)
                </span>

                <h3 className="text-base sm:text-lg font-semibold text-white tracking-tight mb-2">
                  {isConnectingUsb
                    ? 'Menghubungkan Kamera...'
                    : 'Kamera Belum Terhubung'}
                </h3>

                <p className="text-xs text-neutral-400 max-w-sm mb-6 leading-relaxed">
                  {usbDiscoveryMessage ||
                    'Hubungkan kamera studio atau mirrorless langsung ke port USB-C tablet via kabel OTG. Pastikan mode koneksi USB kamera telah diset dengan benar.'}
                </p>

                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={handleConnectUsbSony}
                    disabled={isConnectingUsb}
                    className="px-6 py-2.5 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-[0.98] shadow-lg disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isConnectingUsb ? 'animate-spin' : ''}`} />
                    <span>{isConnectingUsb ? 'Menghubungkan...' : 'Hubungkan Kamera USB'}</span>
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      {/* SISI KANAN: STUDIO CONTROL RAIL & COMPACT PANEL (~400px) */}
      {/* ═══════════════════════════════════════════════════════════════════════════ */}
      <aside className="w-full landscape:w-[360px] md:w-[380px] lg:w-[400px] xl:w-[410px] flex-1 landscape:flex-none md:flex-none bg-[#0F1014] border-t landscape:border-t-0 landscape:border-l md:border-t-0 md:border-l border-white/[0.08] flex flex-col justify-between min-h-0">
        {/* Top Navigation Rail (5 Categories) */}
        <div className="p-1.5 sm:p-2.5 border-b border-white/[0.08] flex gap-1 sm:gap-1.5 flex-none bg-[#0F1014]">
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
                className={`flex-1 h-9 sm:h-11 rounded-xl flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 text-xs font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-white text-black font-semibold shadow-sm'
                    : 'text-neutral-400 hover:text-white hover:bg-white/[0.06]'
                }`}
                title={tab.label}
              >
                <IconComp className="w-3.5 h-3.5 shrink-0" />
                <span className="text-[10px] sm:text-[11px] font-semibold">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Scrollable Active Tab Content Panel */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4 min-h-0 pb-24 overscroll-contain">
          {/* 1. ACARA (EVENT) TAB */}
          {setupTab === 'event' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                  Pilih Acara
                </span>
                <span className="text-[11px] text-neutral-500 font-mono">
                  {eventsList.length || 1} Acara Terdaftar
                </span>
              </div>

              {/* Events List */}
              <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-0.5">
                {[currentEvent, ...eventsList.filter((e) => e.id !== currentEvent.id)].map((ev) => {
                  const isSelected = ev.id === currentEvent.id;
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => setCurrentEvent(ev)}
                      className={`w-full p-3.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#14161C] border-white text-white shadow-sm ring-1 ring-white'
                          : 'bg-[#14161C] border-white/[0.06] text-neutral-300 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        <Calendar
                          className={`w-4 h-4 shrink-0 ${isSelected ? 'text-white' : 'text-neutral-500'}`}
                        />
                        <div className="truncate">
                          <div className="text-xs font-semibold truncate text-white">{ev.name}</div>
                          {ev.date && (
                            <div className="text-[10px] text-neutral-400 mt-0.5 font-mono">{ev.date}</div>
                          )}
                        </div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-white shrink-0" />}
                    </button>
                  );
                })}
              </div>

              {/* Event Management Action Bar */}
              <div className="flex flex-col gap-2 pt-2 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setIsEventQrModalOpen(true)}
                  className="w-full h-11 px-3.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-xs font-bold text-cyan-400 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm active:scale-98"
                  title="Tampilkan QR Galeri untuk seluruh album acara"
                >
                  <QrCode className="w-4 h-4 text-cyan-400" />
                  <span>Tampilkan QR Galeri Acara</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEventSelectOpen(true)}
                    className="flex-1 h-10 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Buat Acara</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEventSelectOpen(true)}
                    className="h-10 px-3.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-xs font-medium text-neutral-300 hover:text-white transition-all cursor-pointer"
                    title="Kelola data acara (Edit / Hapus / Tambah)"
                  >
                    Kelola Acara
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 2. BINGKAI (FRAME) TAB */}
          {setupTab === 'frame' && (
            <div className="space-y-4 animate-fadeIn">
              <input
                ref={customFrameInputRef}
                type="file"
                accept="image/png"
                onChange={handleUploadCustomFrame}
                className="hidden"
              />
              <input
                ref={customGifFrameInputRef}
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
                  {activeFrameOverlay ? '1 Frame Aktif' : 'Tanpa Bingkai'}
                </span>
              </div>

              {/* Thumbnail Selector Grid */}
              <div className="grid grid-cols-2 gap-2.5 max-h-[46vh] overflow-y-auto pr-0.5">
                {/* Tanpa Bingkai (Foto Murni / Polos) */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveFrameOverlay(null);
                    setShowFrameOverlayInPreview(false);
                  }}
                  className={`p-2.5 rounded-xl border text-left flex flex-col items-center justify-center gap-2 transition-all cursor-pointer min-h-[140px] ${
                    !activeFrameOverlay
                      ? 'bg-[#14161C] border-white shadow-sm ring-1 ring-white'
                      : 'bg-[#14161C] border-white/[0.06] hover:border-white/20'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-white/[0.06] flex items-center justify-center text-neutral-300">
                    <Layers className="w-4 h-4 text-neutral-400" />
                  </div>
                  <span className="text-[11px] font-semibold text-white truncate w-full text-center">
                    Tanpa Bingkai (Polos)
                  </span>
                </button>

                {/* Custom Uploaded Frame if any */}
                {activeFrameOverlay && (
                  <button
                    type="button"
                    onClick={() => setShowFrameOverlayInPreview(true)}
                    className="p-2.5 rounded-xl border border-white shadow-sm ring-1 ring-white bg-[#14161C] text-left flex flex-col items-center gap-2 transition-all cursor-pointer"
                  >
                    <div className="w-full aspect-[2/3] rounded-lg bg-black/50 overflow-hidden flex items-center justify-center p-1">
                      <img
                        src={activeFrameOverlay.base64}
                        alt="Custom Frame"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <span className="text-[11px] font-semibold text-white truncate w-full text-center">
                      Frame Kustom PNG
                    </span>
                  </button>
                )}

                {/* Upload Frame Card */}
                <button
                  type="button"
                  onClick={() => customFrameInputRef.current?.click()}
                  className="p-2.5 rounded-xl border border-dashed border-white/10 hover:border-white/30 bg-[#14161C]/50 hover:bg-[#14161C] text-left flex flex-col items-center justify-center gap-2 transition-all cursor-pointer min-h-[140px]"
                >
                  <div className="w-10 h-10 rounded-full bg-white/[0.06] flex items-center justify-center text-neutral-300">
                    <Upload className="w-4 h-4" />
                  </div>
                  <span className="text-[11px] font-semibold text-neutral-300 text-center">
                    {activeFrameOverlay ? 'Ganti Frame' : '+ Upload PNG'}
                  </span>
                </button>
              </div>

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
                    onClick={() => setIsBurstEnabled(!isBurstEnabled)}
                    className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      isBurstEnabled
                        ? 'bg-white text-black shadow-sm'
                        : 'bg-white/10 text-neutral-400 hover:text-white'
                    }`}
                  >
                    {isBurstEnabled ? 'AKTIF' : 'MATI'}
                  </button>
                </div>

                {isBurstEnabled && (
                  <div className="p-3 rounded-xl bg-[#14161C] border border-white/[0.06] space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-300 font-medium truncate">
                        {customGifOverlayUrl
                          ? 'Frame GIF Kustom Aktif'
                          : 'Format: Mengikuti Bingkai Foto Aktif (atau Video Murni)'}
                      </span>
                      {customGifOverlayUrl && (
                        <button
                          type="button"
                          onClick={() => setCustomGifOverlayUrl(null)}
                          className="text-[10px] text-rose-400 hover:text-rose-300 underline cursor-pointer ml-2 shrink-0 font-medium"
                        >
                          Hapus Frame GIF
                        </button>
                      )}
                    </div>

                    {/* Visual Thumbnail Preview for Custom GIF Frame */}
                    {customGifOverlayUrl && (
                      <div className="relative w-full h-32 rounded-lg bg-black/60 border border-white/10 flex items-center justify-center overflow-hidden p-2">
                        <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:12px_12px]" />
                        <img
                          src={customGifOverlayUrl}
                          alt="Pratinjau Frame GIF"
                          className="max-h-full max-w-full object-contain relative z-10 drop-shadow-md"
                        />
                        <div className="absolute bottom-1.5 right-2 px-1.5 py-0.5 rounded bg-black/80 text-[9px] text-neutral-300 font-mono border border-white/10">
                          Overlay GIF Aktif
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => customGifFrameInputRef.current?.click()}
                      className="w-full h-9 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-medium text-white flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-neutral-300" />
                      <span>
                        {customGifOverlayUrl
                          ? 'Ganti Frame GIF (.PNG)'
                          : 'Upload Frame GIF Khusus (.PNG)'}
                      </span>
                    </button>
                    <p className="text-[10px] text-neutral-500 leading-relaxed">
                      Format PNG dengan latar belakang transparan. Animasi Boomerang akan direkam dan disatukan secara otomatis.
                    </p>
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
                  SUMBER KAMERA
                </span>
              </div>

              {/* Source Switcher: Live View vs PC Remote */}
              <div className="grid grid-cols-2 p-1 rounded-xl bg-[#1A1C24] border border-white/[0.06] gap-1">
                <button
                  type="button"
                  onClick={() => setCameraMode('tablet')}
                  className={`py-2 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    cameraMode === 'tablet'
                      ? 'bg-white text-black shadow-sm font-bold'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <Laptop className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Live View</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCameraMode('usb_direct')}
                  className={`py-2 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    cameraMode !== 'tablet'
                      ? 'bg-white text-black shadow-sm font-bold'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">PC Remote</span>
                </button>
              </div>

              {/* Kontrol Kamera Studio */}
              {cameraMode !== 'tablet' && (
                <div className="space-y-3 p-3.5 rounded-xl bg-[#14161C] border border-white/[0.06]">
                  {/* Status Indicator & Camera Model Name */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white font-medium flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          usbCameraConnected || usbCameraState === 'LIVE_VIEW_STREAMING' || usbCameraState === 'CAMERA_READY' || usbCameraState === 'PTP_SESSION_OPEN'
                            ? 'bg-emerald-400 animate-pulse'
                            : isConnectingUsb
                            ? 'bg-amber-400 animate-spin'
                            : 'bg-neutral-500'
                        }`}
                      />
                      <span className="truncate max-w-[280px]">
                        {usbCameraConnected || usbCameraState === 'LIVE_VIEW_STREAMING' || usbCameraState === 'CAMERA_READY' || usbCameraState === 'PTP_SESSION_OPEN'
                          ? `${usbCameraModel || 'Kamera USB'} (Control)`
                          : isConnectingUsb
                          ? 'Menyiapkan Kamera...'
                          : 'Kamera Belum Terhubung'}
                      </span>
                    </span>
                  </div>

                  {/* Sambungkan Kamera Button */}
                  <button
                    type="button"
                    onClick={handleConnectUsbSony}
                    disabled={isConnectingUsb}
                    className="w-full h-10 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] text-xs font-semibold text-white flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isConnectingUsb ? 'animate-spin' : ''}`} />
                    <span>{isConnectingUsb ? 'Menghubungkan...' : 'Sambungkan Kamera'}</span>
                  </button>

                  {/* Hot Folder Shutter Info & Buka Folder Button */}
                  <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
                    <div className="truncate min-w-0 flex-1">
                      <span className="text-[10px] text-neutral-400 block">Hot Folder Shutter:</span>
                      <span
                        className="text-[10px] text-neutral-300 font-mono truncate block"
                        title={hotFolderDisplayPath}
                      >
                        {hotFolderDisplayPath}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenFolder}
                      className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-neutral-300 hover:text-white text-[10px] font-medium flex items-center gap-1 transition-colors flex-shrink-0 cursor-pointer"
                    >
                      <FolderOpen className="w-3 h-3" />
                      <span>Buka Folder</span>
                    </button>
                  </div>

                  {/* Panduan Koneksi Kamera (WAJIB) */}
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] text-neutral-300 space-y-1">
                    <div className="font-semibold text-amber-300 flex items-center gap-1 text-[11px]">
                      <AlertCircle className="w-3 h-3 text-amber-400 flex-shrink-0" />
                      <span>Panduan Koneksi Kamera (WAJIB)</span>
                    </div>
                    <p>1. Format Foto: <strong className="text-white">JPEG Fine / Large</strong> (Bukan RAW saja).</p>
                    <p>2. Shutter: <strong className="text-white">Silent Mode = OFF</strong>.</p>
                    <p>3. USB Mode: <strong className="text-white">PC Remote / PTP (Matikan Wi-Fi jika Canon)</strong>.</p>
                  </div>

                  {usbDiscoveryMessage && (
                    <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[11px] flex items-start gap-2">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-400" />
                      <span className="leading-snug break-words flex-1">{usbDiscoveryMessage}</span>
                    </div>
                  )}

                  {usbDiagnosticReport && (
                    <details className="p-2.5 rounded-lg bg-neutral-900 border border-white/10 text-[10px] text-neutral-300">
                      <summary className="font-semibold cursor-pointer text-neutral-200 hover:text-white select-none">
                        Diagnostik USB
                      </summary>
                      <pre className="mt-2 whitespace-pre-wrap font-mono text-[9px] text-neutral-400 max-h-48 overflow-y-auto">
                        {usbDiagnosticReport}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              {/* Live View (Tablet Camera) Controls */}
              {cameraMode === 'tablet' && (
                <div className="space-y-3 p-3.5 rounded-xl bg-[#14161C] border border-white/[0.06]">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white font-medium flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isCameraActive ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-500'
                        }`}
                      />
                      <span>
                        {isCameraActive
                          ? cameraFacing === 'user'
                            ? 'Live View Depan'
                            : 'Live View Belakang'
                          : cameraLoading
                          ? 'Menghubungkan...'
                          : 'Live View Belum Terhubung'}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={toggleCameraFacing}
                      className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <SwitchCamera className="w-3 h-3" />
                      <span>Ganti Arah</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={startPreviewCamera}
                    className="w-full h-10 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] text-xs font-semibold text-white flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Sambungkan Kamera</span>
                  </button>

                  <p className="text-[10px] text-neutral-400 leading-relaxed pt-1 border-t border-white/[0.04]">
                    Mendukung webcam tablet Android dan USB webcam eksternal via OTG.
                  </p>
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

                {/* Stepper +/- */}
                <div className="flex items-center justify-between p-2 rounded-xl bg-[#14161C] border border-white/[0.06]">
                  <span className="text-xs text-neutral-300">Kustom Pose:</span>
                  <div className="flex items-center bg-[#1A1C24] border border-white/[0.08] rounded-xl p-0.5 h-9">
                    <button
                      type="button"
                      onClick={() => setShotsCount(Math.max(1, shotsCount - 1))}
                      className="w-7 h-full flex items-center justify-center text-neutral-300 hover:text-white hover:bg-white/10 rounded-lg text-sm font-bold transition-colors cursor-pointer"
                      title="Kurangi Pose"
                    >
                      -
                    </button>
                    <span className="w-10 text-center text-white font-bold text-xs">
                      {shotsCount}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShotsCount(Math.min(24, shotsCount + 1))}
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
                    {countdownDuration === 0 ? 'Mati' : `${countdownDuration} Detik`}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {[0, 3, 5, 10].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setCountdownDuration(sec)}
                      className={`flex-1 h-11 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        countdownDuration === sec
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
                  onClick={() => setEnableStandbyWallpaper(!enableStandbyWallpaper)}
                  className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    enableStandbyWallpaper
                      ? 'bg-white text-black shadow-sm'
                      : 'bg-white/10 text-neutral-400 hover:text-white'
                  }`}
                >
                  {enableStandbyWallpaper ? 'AKTIF' : 'MATI'}
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
                          onClick={() => setStandbyTimeoutMinutes(item.val)}
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
                        onClick={() => setWallpaperFitMode('cover')}
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
                        onClick={() => setWallpaperFitMode('contain')}
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
                        onClick={() => setIsWallpaperModalOpen(true)}
                        className="text-[10px] text-neutral-400 hover:text-white underline cursor-pointer"
                      >
                        Atur Lengkap &rarr;
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {DEFAULT_WALLPAPERS.map((preset) => {
                        const isSelected = selectedWallpaperId === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => setSelectedWallpaperId(preset.id)}
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
        <div className="p-3 sm:p-4 border-t border-white/[0.08] bg-[#0F1014] shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            onClick={() => {
              stopPreviewCamera();
              setPhase('kiosk');
            }}
            className="w-full h-12 sm:h-14 rounded-xl sm:rounded-2xl bg-white hover:bg-neutral-200 text-black font-bold text-sm sm:text-base flex items-center justify-center gap-2 sm:gap-2.5 transition-all shadow-lg active:scale-[0.99] cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Mulai Sesi Photobooth</span>
          </button>
        </div>
      </aside>
    </main>
  );
};
