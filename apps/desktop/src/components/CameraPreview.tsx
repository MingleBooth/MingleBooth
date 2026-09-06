import React, { useEffect, useRef, useState } from 'react';
import { usePhotoboothStore } from '../store/photobooth-store';
import { CountdownHUD } from './CountdownHUD';
import { Eye, EyeOff, Camera } from 'lucide-react';

export const CameraPreview: React.FC = () => {
  const {
    cameraManager,
    selectedTemplate,
    aspectRatio,
    shotsCount,
    sessionStep,
    currentShotIndex,
    capturedPhotos,
    isFlashing,
    countdownRemaining,
    currentBrand,
    isLiveFrameVisible,
    toggleLiveFrameVisibility,
  } = usePhotoboothStore();

  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);

  // Track which slots just got their photo for animation
  const [recentlyFilled, setRecentlyFilled] = useState<number[]>([]);

  // Expose real webcam canvas frame grabber on window for photobooth-store
  useEffect(() => {
    (window as any).__grabWebcamFrame = () => {
      if (videoRef.current && videoRef.current.videoWidth > 0) {
        const canvas = document.createElement('canvas');
        canvas.width = 1080;
        canvas.height = 1350;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Mirror horizontal like selfie booth
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);

          const vid = videoRef.current;
          const vWidth = vid.videoWidth;
          const vHeight = vid.videoHeight;

          // Cover fit calculation
          const targetRatio = canvas.width / canvas.height;
          const srcRatio = vWidth / vHeight;
          let sWidth = vWidth;
          let sHeight = vHeight;
          let sx = 0;
          let sy = 0;

          if (srcRatio > targetRatio) {
            sWidth = vHeight * targetRatio;
            sx = (vWidth - sWidth) / 2;
          } else {
            sHeight = vWidth / targetRatio;
            sy = (vHeight - sHeight) / 2;
          }

          ctx.drawImage(vid, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL('image/jpeg', 0.92);
        }
      }
      return null;
    };
  }, []);

  // Handle webcam stream directly if user selects webcam
  useEffect(() => {
    if (currentBrand === 'webcam') {
      navigator.mediaDevices
        ?.getUserMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            facingMode: 'user',
          },
        })
        .then((stream) => {
          setWebcamStream(stream);
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch((err) => {
          console.warn('Webcam permission not granted or unavailable:', err);
        });
    } else {
      if (webcamStream) {
        webcamStream.getTracks().forEach((t) => t.stop());
        setWebcamStream(null);
      }
    }

    return () => {
      if (webcamStream) {
        webcamStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [currentBrand]);

  // Subscribe to frames from camera manager (for mock / external adapters)
  useEffect(() => {
    const handleFrame = (data: any) => {
      if (typeof data === 'string') {
        setPreviewSrc(data);
      } else if (data && typeof data.toString === 'function') {
        setPreviewSrc(`data:image/svg+xml;base64,${data.toString('base64')}`);
      }
    };

    cameraManager.on('frame', handleFrame);
    cameraManager.startPreview();

    return () => {
      cameraManager.off('frame', handleFrame);
      cameraManager.stopPreview();
    };
  }, [cameraManager]);

  // Broadcast live preview frames to local TetherServer (for Tablet Mode clients)
  useEffect(() => {
    const interval = setInterval(() => {
      let frame: string | null = null;
      if (currentBrand === 'webcam' && typeof (window as any).__grabWebcamFrame === 'function') {
        frame = (window as any).__grabWebcamFrame();
      } else if (previewSrc) {
        frame = previewSrc;
      }
      if (frame) {
        fetch('http://localhost:4848/api/tether/update-frame', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ frameDataUrl: frame }),
        }).catch(() => {});
      }
    }, 350);

    return () => clearInterval(interval);
  }, [currentBrand, previewSrc]);

  // Trigger animation when a new photo is captured
  useEffect(() => {
    const newIdx = capturedPhotos.length - 1;
    if (newIdx >= 0) {
      setRecentlyFilled((prev) => [...prev, newIdx]);
      const timer = setTimeout(() => {
        setRecentlyFilled((prev) => prev.filter((i) => i !== newIdx));
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [capturedPhotos.length]);

  const totalSlots = shotsCount || selectedTemplate.photoSlots.length;
  const isStrip = aspectRatio === '2:6';
  const isSquare = aspectRatio === '1:1';
  const hasMultiShots = totalSlots >= 2;
  const isSessionActive = sessionStep !== 'idle';

  // Camera viewport aspect ratio style dynamically matching any format (4R, 2R, Strip, Custom)
  const cameraAspectStyle = {
    aspectRatio: `${selectedTemplate.canvas.width} / ${selectedTemplate.canvas.height}`,
  };

  return (
    <div className="relative flex-1 flex items-center justify-center p-2 sm:p-4 overflow-hidden w-full h-full min-h-0 bg-[#0C0D0F] gap-3 sm:gap-4">

      {/* === LEFT: Main Camera Viewport === */}
      <div
        className="relative bg-[#121418] rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl border border-white/[0.08] flex items-center justify-center transition-all duration-200 max-h-full max-w-full flex-shrink"
        style={cameraAspectStyle}
      >
        {/* Render Feed: Real Webcam Video or Clean Mock Frame */}
        {currentBrand === 'webcam' ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover select-none -scale-x-100"
          />
        ) : previewSrc ? (
          <img
            src={previewSrc}
            alt="Camera Preview"
            className="w-full h-full object-cover select-none pointer-events-none"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-neutral-500 gap-2">
            <span className="text-xs font-mono">CONNECTING CAMERA...</span>
          </div>
        )}

        {/* Live Frame Overlay (Rendered only if toggled ON) */}
        {selectedTemplate.overlay?.path && isLiveFrameVisible && (
          <img
            src={selectedTemplate.overlay.path}
            alt="Live Frame Overlay"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10 select-none animate-fadeIn"
          />
        )}

        {/* Minimalist Viewfinder Overlay */}
        <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-5 z-20">
          {/* Top Status & Live Frame Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-black/60 backdrop-blur-sm border border-white/10 text-[11px] font-mono text-neutral-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>LIVE</span>
              </div>

              {/* Show/Hide Live Frame Overlay Toggle */}
              {selectedTemplate.overlay?.path && (
                <button
                  onClick={toggleLiveFrameVisibility}
                  className={`pointer-events-auto flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border backdrop-blur-sm transition-all shadow-sm ${
                    isLiveFrameVisible
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-black/60 text-neutral-300 border-white/10 hover:text-white'
                  }`}
                  title={
                    isLiveFrameVisible
                      ? 'Klik untuk melihat kamera bersih full tanpa bingkai'
                      : 'Klik untuk menampilkan bingkai di layar kamera'
                  }
                >
                  {isLiveFrameVisible ? (
                    <>
                      <Eye className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Bingkai: Tampil di Layar</span>
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-3.5 h-3.5 text-neutral-400" />
                      <span>Layar Bersih Full (Bingkai Sembunyi)</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {totalSlots > 1 && sessionStep !== 'idle' && sessionStep !== 'waiting_next_shot' && (
              <div className="px-3 py-1 rounded bg-black/70 backdrop-blur-sm border border-white/10 text-xs font-mono font-medium text-white">
                JEPRETAN {currentShotIndex + 1} DARI {totalSlots}
              </div>
            )}
            {sessionStep === 'waiting_next_shot' && (
              <div className="px-3 py-1 rounded bg-amber-400/20 backdrop-blur-sm border border-amber-400/40 text-xs font-mono font-semibold text-amber-300">
                ✅ FOTO {(capturedPhotos?.length ?? 0)} TERSIMPAN
              </div>
            )}
          </div>

          {/* Minimal Viewfinder Corner Brackets */}
          <div className="self-center flex items-center justify-center pointer-events-none opacity-40">
            <div className="w-24 h-24 relative">
              <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-white" />
              <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-white" />
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-white" />
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-white" />
              <div className="absolute inset-0 m-auto w-1 h-1 bg-white rounded-full" />
            </div>
          </div>

          {/* Bottom Info */}
          <div className="self-center">
            <span className="text-[10px] font-mono text-neutral-400 bg-black/60 px-2.5 py-1 rounded border border-white/10">
              {selectedTemplate.aspectRatio} • {selectedTemplate.canvas.width}×{selectedTemplate.canvas.height}
            </span>
          </div>
        </div>

        {/* Minimal Countdown Overlay with Pose Guidance */}
        {sessionStep === 'countdown' && countdownRemaining > 0 && (
          <CountdownHUD
            remaining={countdownRemaining}
            shotIndex={currentShotIndex}
            totalShots={totalSlots}
          />
        )}

        {/* GANTI POSE Banner — clean redesign, no emoji */}
        {sessionStep === 'waiting_next_shot' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-30 pointer-events-none">
            <div className="flex flex-col items-center gap-4 px-10 py-7 rounded-2xl bg-black/80 backdrop-blur-md border border-white/10 shadow-2xl">
              {/* Clean animated icon — no emoji */}
              <div className="relative">
                <div className="w-14 h-14 rounded-full bg-amber-400/15 border-2 border-amber-400/50 flex items-center justify-center animate-pulse">
                  <Camera className="w-6 h-6 text-amber-400" />
                </div>
                <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-[#0C0D0F] flex items-center justify-center">
                  <span className="text-[9px] font-black text-white">{capturedPhotos?.length ?? 0}</span>
                </div>
              </div>

              <div className="text-center">
                <div className="text-white font-black text-2xl tracking-widest mb-1">
                  GANTI POSE!
                </div>
                <div className="text-neutral-400 text-[13px] font-medium">
                  Foto <span className="text-white font-bold">{capturedPhotos?.length ?? 0}</span> dari{' '}
                  <span className="text-white font-bold">{totalSlots}</span> sudah diambil
                </div>
              </div>

              <div className="flex items-center gap-2 text-amber-400/80 text-[11px] font-mono">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                Klik tombol kuning di bawah untuk foto berikutnya
              </div>
            </div>
          </div>
        )}

        {/* Processing Spinner Overlay */}
        {sessionStep === 'processing' && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center text-white z-20 gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-neutral-600 border-t-white animate-spin" />
            <span className="text-xs font-medium text-neutral-300">Rendering template &amp; QR...</span>
          </div>
        )}

        {/* Shutter Flash Effect */}
        {isFlashing && (
          <div className="absolute inset-0 bg-white z-40 animate-flash pointer-events-none" />
        )}
      </div>

      {/* === RIGHT: Photo Strip Sidebar (shown on md+ screens when multi-shot active) === */}
      {hasMultiShots && (isSessionActive || capturedPhotos.length > 0) && (
        <div
          className="hidden md:flex flex-shrink-0 flex-col gap-2.5 justify-center max-h-full"
          style={{
            width: isStrip ? '110px' : '140px',
          }}
        >
          {/* Strip panel header */}
          <div className="flex items-center gap-1.5 mb-1">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider whitespace-nowrap">
              {capturedPhotos.length}/{totalSlots} Foto
            </span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Photo slots */}
          {Array.from({ length: totalSlots }).map((_, idx) => {
            const photo = capturedPhotos[idx];
            const isJustFilled = recentlyFilled.includes(idx);
            const isEmpty = !photo;
            const isNext = isEmpty && idx === capturedPhotos.length;

            return (
              <div
                key={idx}
                className={`relative rounded-xl overflow-hidden border transition-all duration-500 flex-1 ${
                  photo
                    ? 'border-white/20 shadow-lg'
                    : isNext
                    ? 'border-amber-400/40 bg-[#1A1C20]'
                    : 'border-white/[0.05] bg-[#13151A]'
                }`}
                style={{
                  transform: isJustFilled ? 'scale(1)' : 'scale(1)',
                  transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
              >
                {photo ? (
                  /* Captured photo */
                  <div
                    className="w-full h-full"
                    style={{
                      animation: isJustFilled ? 'photoSlideIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards' : 'none',
                    }}
                  >
                    <img
                      src={photo}
                      alt={`Foto ${idx + 1}`}
                      className="w-full h-full object-cover"
                      style={{
                        animation: isJustFilled ? 'photoReveal 0.4s ease-out forwards' : 'none',
                      }}
                    />
                    {/* Slot number badge */}
                    <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-emerald-500 border border-emerald-400 flex items-center justify-center shadow-md">
                      <span className="text-[9px] font-black text-white">{idx + 1}</span>
                    </div>
                    {/* "Just taken" flash overlay */}
                    {isJustFilled && (
                      <div
                        className="absolute inset-0 bg-white pointer-events-none rounded-xl"
                        style={{ animation: 'flashFade 0.5s ease-out forwards' }}
                      />
                    )}
                  </div>
                ) : (
                  /* Empty placeholder slot */
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-2">
                    {isNext ? (
                      <>
                        <div className="w-8 h-8 rounded-full border-2 border-amber-400/50 flex items-center justify-center">
                          <Camera className="w-4 h-4 text-amber-400/70" />
                        </div>
                        <span className="text-[9px] font-mono text-amber-400/70 text-center">
                          FOTO {idx + 1}
                        </span>
                        <span className="text-[8px] font-mono text-amber-400/40 text-center">
                          BERIKUTNYA
                        </span>
                      </>
                    ) : (
                      <>
                        <div className="w-7 h-7 rounded-full border border-white/10 flex items-center justify-center">
                          <span className="text-[10px] font-mono text-white/20">{idx + 1}</span>
                        </div>
                        <div className="w-6 h-0.5 bg-white/10 rounded" />
                        <div className="w-4 h-0.5 bg-white/10 rounded" />
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Footer hint */}
          <div className="text-center mt-1">
            <span className="text-[9px] font-mono text-neutral-600 uppercase tracking-wider">
              {capturedPhotos.length === 0
                ? 'Belum ada foto'
                : capturedPhotos.length < totalSlots
                ? 'Jepret lagi...'
                : 'Semua selesai!'}
            </span>
          </div>
        </div>
      )}

      {/* CSS Keyframe Animations (injected as style tag) */}
      <style>{`
        @keyframes photoReveal {
          0% { opacity: 0; transform: scale(1.08); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes flashFade {
          0% { opacity: 0.7; }
          100% { opacity: 0; }
        }
        @keyframes photoSlideIn {
          0% { transform: translateY(-8px) scale(0.96); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
};
