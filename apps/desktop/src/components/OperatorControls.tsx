import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  X,
  Layers,
  Clock,
  Film,
  Image as ImageIcon,
  Trash2,
  Eye,
  EyeOff,
  ChevronDown,
  Plus,
  Ratio,
  Sparkles,
  Check,
} from 'lucide-react';
import {
  usePhotoboothStore,
  AspectRatioType,
  FormatConfig,
  PRESET_FORMATS,
} from '../store/photobooth-store';
import { CameraBrand } from '@minglebooth/shared';
import { CustomFormatModal } from './CustomFormatModal';
import { API_BASE_URL } from '../config';

export const OperatorControls: React.FC = () => {
  const {
    sessionStep,
    startSession,
    captureNextShot,
    cancelSession,
    countdownSeconds,
    setCountdownSeconds,
    aspectRatio,
    setAspectRatio,
    activeFormat,
    customFormats,
    setFormat,
    addCustomFormat,
    removeCustomFormat,
    shotsCount,
    setShotsCount,
    capturedPhotos,
    activeFrameOverlay,
    setActiveFrameOverlay,
    activeGifFrameOverlay,
    setActiveGifFrameOverlay,
    isLiveFrameVisible,
    toggleLiveFrameVisibility,
    currentBrand,
    switchCameraBrand,
    captureMode,
    setCaptureMode,
    selectedTemplate,
    isHotFolderActive,
    hotFolderDir,
    activeNativeCameraModel,
  } = usePhotoboothStore();

  const [isFormatDropdownOpen, setIsFormatDropdownOpen] = useState(false);
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const formatDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (formatDropdownRef.current && !formatDropdownRef.current.contains(e.target as Node)) {
        setIsFormatDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isWaitingNextShot = sessionStep === 'waiting_next_shot';
  const isCapturing = sessionStep !== 'idle';

  const timerOptions = [
    { label: 'OFF', value: 0 },
    { label: '3s', value: 3 },
    { label: '5s', value: 5 },
    { label: '10s', value: 10 },
  ];

  const ratioOptions: { label: string; value: AspectRatioType }[] = [
    { label: 'Portrait (4:5)', value: '4:5' },
    { label: 'Strip (2:6)', value: '2:6' },
    { label: 'Square (1:1)', value: '1:1' },
  ];

  const shotOptions = [
    { label: '1 Shot', value: 1 },
    { label: '2x Take', value: 2 },
    { label: '3x Take', value: 3 },
    { label: '4x Take', value: 4 },
  ];

  // Template Library State
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [cloudTemplates, setCloudTemplates] = useState<any[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const handleOpenTemplateLibrary = async () => {
    setIsTemplateModalOpen(true);
    setLoadingTemplates(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/vendor/templates`);
      const data = await res.json();
      if (data.templates) {
        setCloudTemplates(data.templates);
      }
    } catch (err) {
      console.warn('Failed to load cloud templates in desktop:', err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleSelectCloudTemplate = (tpl: any) => {
    if (tpl.aspect_ratio) {
      setAspectRatio(tpl.aspect_ratio as AspectRatioType);
    }
    if (tpl.slots) {
      setShotsCount(tpl.slots);
    }
    if (tpl.overlay_base64) {
      setActiveFrameOverlay({
        id: tpl.id,
        name: tpl.name,
        base64: tpl.overlay_base64,
        path: tpl.overlay_base64,
      });
    }
    setIsTemplateModalOpen(false);
  };

  const handleFrameUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64Url = event.target?.result as string;
        if (base64Url) {
          const cWidth = selectedTemplate.canvas.width;
          const cHeight = selectedTemplate.canvas.height;

          // Attempt intelligent cutout hole auto-detection
          let detectedCutouts: { x: number; y: number; width: number; height: number }[] | undefined = undefined;
          try {
            const { FrameHoleDetector } = await import('@minglebooth/template-engine');
            const holes = await FrameHoleDetector.detectCutouts(base64Url, cWidth, cHeight, 14);
            if (holes && holes.length > 0) {
              detectedCutouts = holes;
            }
          } catch (detErr) {
            console.warn('[FrameUpload] Auto hole detection note:', detErr);
          }

          const frameObj = {
            id: 'frame_' + Date.now(),
            name: file.name.replace(/\.[^/.]+$/, '').substring(0, 20),
            base64: base64Url,
            path: base64Url,
            customCutouts: detectedCutouts,
          };
          setActiveFrameOverlay(frameObj);

          // Also save to Supabase
          fetch(`${API_BASE_URL}/api/vendor/templates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: frameObj.name,
              aspectRatio,
              slots: shotsCount,
              overlayStoragePath: file.name,
              overlayBase64: base64Url,
            }),
          }).catch((err) => console.warn('Cloud sync template warning:', err));
        }
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    }
  };
  const handleGifFrameUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64Url = event.target?.result as string;
        if (base64Url) {
          const frameObj = {
            id: 'gif_frame_' + Date.now(),
            name: file.name.replace(/\.[^/.]+$/, '').substring(0, 20),
            base64: base64Url,
            path: base64Url,
          };
          setActiveGifFrameOverlay(frameObj);
        }
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    }
  };

  return (
    <footer className="px-3 sm:px-6 py-2.5 sm:py-3 bg-[#0C0E12] border-t border-white/[0.08] flex flex-col gap-2.5 sm:gap-3 relative z-40 overflow-visible select-none antialiased flex-shrink-0 w-full">
      {/* ── Top Row: Format, Takes, and Frame Settings ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-4 border-b border-white/[0.06] pb-2 text-xs relative overflow-visible">
        <div className="flex flex-wrap items-center gap-3 sm:gap-6 min-w-0 relative overflow-visible">
          {/* 1. Format Ukuran Cetak (Compact Dropdown Selector) */}
          <div className="relative flex-shrink-0 z-50" ref={formatDropdownRef}>
            <button
              type="button"
              disabled={isCapturing}
              onClick={(e) => {
                e.stopPropagation();
                setIsFormatDropdownOpen((prev) => !prev);
              }}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl border text-[11px] sm:text-xs font-medium transition-all shadow-sm active:scale-98 ${
                isFormatDropdownOpen
                  ? 'bg-[#1E222A] border-white/20 text-white shadow-lg'
                  : 'bg-[#14161A] hover:bg-[#1E222A] border-white/[0.08] text-neutral-200 hover:text-white'
              } disabled:opacity-50 cursor-pointer`}
              title="Pilih Format Canvas (4R, 2R, Strip, Digital, Kustom)"
            >
              <Layers className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
              <span className="text-neutral-400 text-[10px] sm:text-[11px] font-medium hidden xs:inline">Format:</span>
              <span className="font-semibold text-white bg-white/10 px-1.5 py-0.5 rounded text-[10px] sm:text-[11px] tracking-tight">
                {activeFormat.label}
              </span>
              <ChevronDown
                className={`w-3 h-3 text-neutral-400 transition-transform duration-200 ${
                  isFormatDropdownOpen ? 'rotate-180 text-white' : ''
                }`}
              />
            </button>

            {/* Popover Menu Dropdown */}
            {isFormatDropdownOpen && (
              <div
                className="absolute bottom-full left-0 mb-2.5 w-72 sm:w-84 bg-[#12141A] border border-white/20 rounded-2xl shadow-2xl z-50 p-3 flex flex-col gap-2.5 animate-fadeIn backdrop-blur-2xl pointer-events-auto"
                style={{ filter: 'drop-shadow(0 20px 25px rgba(0, 0, 0, 0.7))' }}
              >
                {/* Popover Header */}
                <div className="flex items-center justify-between px-2 pb-1.5 border-b border-white/[0.08]">
                  <div className="flex items-center gap-1.5">
                    <Ratio className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-xs font-bold text-white tracking-tight">Pilih Format Canvas</span>
                  </div>
                  <span className="text-[10px] text-neutral-400 font-mono bg-white/[0.06] px-1.5 py-0.5 rounded">
                    {activeFormat.width}×{activeFormat.height} px
                  </span>
                </div>

                {/* Scrollable Format List */}
                <div className="max-h-64 overflow-y-auto pr-1 flex flex-col gap-2.5">
                  {/* Section 1: Standar Cetak Photobooth */}
                  <div>
                    <span className="text-[9px] font-bold text-neutral-500 tracking-wider uppercase px-2 block mb-1">
                      🖨️ Standar Cetak Photobooth
                    </span>
                    <div className="flex flex-col gap-0.5">
                      {PRESET_FORMATS.filter((f) => f.category === 'print').map((fmt) => (
                        <button
                          type="button"
                          key={fmt.id}
                          onClick={() => {
                            setFormat(fmt);
                            setIsFormatDropdownOpen(false);
                          }}
                          className={`w-full px-2.5 py-1.5 rounded-xl text-left flex items-center justify-between transition-colors ${
                            activeFormat.id === fmt.id
                              ? 'bg-white/15 text-white font-semibold'
                              : 'text-neutral-300 hover:text-white hover:bg-white/[0.05]'
                          }`}
                        >
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs">{fmt.name}</span>
                            <span className="text-[10px] text-neutral-500 font-mono">{fmt.description}</span>
                          </div>
                          {activeFormat.id === fmt.id && (
                            <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0 ml-2" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Section 2: Format Digital */}
                  <div>
                    <span className="text-[9px] font-bold text-neutral-500 tracking-wider uppercase px-2 block mb-1">
                      📱 Format Digital
                    </span>
                    <div className="flex flex-col gap-0.5">
                      {PRESET_FORMATS.filter((f) => f.category === 'digital').map((fmt) => (
                        <button
                          type="button"
                          key={fmt.id}
                          onClick={() => {
                            setFormat(fmt);
                            setIsFormatDropdownOpen(false);
                          }}
                          className={`w-full px-2.5 py-1.5 rounded-xl text-left flex items-center justify-between transition-colors ${
                            activeFormat.id === fmt.id
                              ? 'bg-white/15 text-white font-semibold'
                              : 'text-neutral-300 hover:text-white hover:bg-white/[0.05]'
                          }`}
                        >
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs">{fmt.name}</span>
                            <span className="text-[10px] text-neutral-500 font-mono">{fmt.width}×{fmt.height} px</span>
                          </div>
                          {activeFormat.id === fmt.id && (
                            <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0 ml-2" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Section 3: Format Kustom Vendor */}
                  {customFormats.length > 0 && (
                    <div>
                      <span className="text-[9px] font-bold text-amber-400/90 tracking-wider uppercase px-2 block mb-1">
                        ⭐ Format Kustom Vendor ({customFormats.length})
                      </span>
                      <div className="flex flex-col gap-0.5">
                        {customFormats.map((fmt) => (
                          <div
                            key={fmt.id}
                            className={`w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between transition-colors ${
                              activeFormat.id === fmt.id
                                ? 'bg-white/15 text-white font-semibold'
                                : 'text-neutral-300 hover:text-white hover:bg-white/[0.05]'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setFormat(fmt);
                                setIsFormatDropdownOpen(false);
                              }}
                              className="flex-1 text-left flex flex-col min-w-0"
                            >
                              <span className="text-xs truncate font-medium">{fmt.name}</span>
                              <span className="text-[10px] text-neutral-500 font-mono">
                                {fmt.width}×{fmt.height} px ({fmt.ratio})
                              </span>
                            </button>
                            <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                              {activeFormat.id === fmt.id && (
                                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeCustomFormat(fmt.id);
                                }}
                                className="text-neutral-500 hover:text-rose-400 p-1 rounded hover:bg-white/10 transition-colors"
                                title="Hapus format kustom ini"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer: Create Custom Format button */}
                <div className="pt-1.5 border-t border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => {
                      setIsFormatDropdownOpen(false);
                      setIsCustomModalOpen(true);
                    }}
                    className="w-full h-8 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-98"
                  >
                    <Plus className="w-3.5 h-3.5 text-emerald-400" />
                    <span>+ Buat Format Kustom Baru...</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 2. Jumlah Jepretan (Takes) */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-neutral-400 font-medium flex items-center gap-1 text-[11px] hidden sm:flex">
              <Camera className="w-3.5 h-3.5 text-neutral-500" />
              Jepretan:
            </span>
            <div className="flex items-center bg-[#14161A] p-0.5 rounded-lg border border-white/[0.06]">
              {shotOptions.map((s) => (
                <button
                  key={s.value}
                  disabled={isCapturing}
                  onClick={() => setShotsCount(s.value)}
                  className={`px-2 sm:px-2.5 py-1 rounded-md text-[10px] sm:text-[11px] font-medium transition-all ${
                    shotsCount === s.value
                      ? 'bg-white text-black shadow-sm font-semibold'
                      : 'text-neutral-400 hover:text-white'
                  } disabled:opacity-50`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 3. Bingkai Cetak & Bingkai GIF */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Frame Cetak */}
          {activeFrameOverlay ? (
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.08] border border-white/15 text-neutral-200 text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                <span className="max-w-[80px] sm:max-w-[120px] truncate">{activeFrameOverlay.name}</span>
                <button
                  type="button"
                  onClick={() => setActiveFrameOverlay(null)}
                  className="text-neutral-400 hover:text-rose-400 ml-0.5 p-0.5 rounded transition-colors"
                  title="Hapus Bingkai Cetak"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>

              {/* Show/Hide On Live Viewfinder Toggle */}
              <button
                type="button"
                onClick={toggleLiveFrameVisibility}
                className={`px-2 py-1 rounded-lg border text-xs font-medium flex items-center gap-1 transition-all ${
                  isLiveFrameVisible
                    ? 'bg-white/15 text-white border-white/20'
                    : 'bg-[#181B20] text-neutral-400 border-white/[0.08] hover:text-white'
                }`}
                title="Sembunyikan/Tampilkan bingkai pada viewfinder kamera"
              >
                {isLiveFrameVisible ? (
                  <>
                    <Eye className="w-3 h-3 text-neutral-300" />
                    <span className="hidden xs:inline">Live On</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="w-3 h-3 text-neutral-400" />
                    <span className="hidden xs:inline">Live Off</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleOpenTemplateLibrary}
                className="px-2.5 py-1 rounded-lg bg-[#181B20] hover:bg-[#22262E] text-neutral-200 hover:text-white border border-white/[0.08] text-xs font-medium flex items-center gap-1.5 transition-colors"
                title="Pilih dari koleksi template siap pakai"
              >
                <Sparkles className="w-3.5 h-3.5 text-neutral-400" />
                <span>Template</span>
              </button>

              <label className="px-2.5 py-1 rounded-lg bg-[#181B20] hover:bg-[#22262E] text-neutral-300 hover:text-white border border-white/[0.08] text-xs font-medium cursor-pointer flex items-center gap-1.5 transition-colors">
                <ImageIcon className="w-3.5 h-3.5 text-neutral-400" />
                <span>+ Frame Sendiri</span>
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml,image/*"
                  className="hidden"
                  onChange={handleFrameUpload}
                />
              </label>
            </div>
          )}

          {/* Frame Khusus GIF */}
          {activeGifFrameOverlay ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.08] border border-white/15 text-neutral-200 text-xs font-medium">
              <Film className="w-3 h-3 text-neutral-400 flex-shrink-0" />
              <span className="max-w-[70px] sm:max-w-[110px] truncate">{activeGifFrameOverlay.name}</span>
              <button
                type="button"
                onClick={() => setActiveGifFrameOverlay(null)}
                className="text-neutral-400 hover:text-rose-400 ml-0.5 p-0.5 rounded transition-colors"
                title="Hapus Bingkai Khusus GIF"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <label className="px-2.5 py-1 rounded-lg bg-[#181B20] hover:bg-[#22262E] text-neutral-400 hover:text-neutral-200 border border-white/[0.06] text-xs font-medium cursor-pointer flex items-center gap-1.5 transition-colors">
              <Film className="w-3 h-3 text-neutral-400" />
              <span>+ Frame GIF</span>
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml,image/*"
                className="hidden"
                onChange={handleGifFrameUpload}
              />
            </label>
          )}
        </div>
      </div>

      {/* ── Bottom Main Action Bar (Responsive Flex Grid) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 items-center gap-2.5 sm:gap-4 w-full">
        {/* Left: Mode Selector [ Photo | GIF ] */}
        <div className="flex items-center justify-start sm:justify-start">
          <div className="flex items-center bg-[#14161A] p-0.5 rounded-xl border border-white/[0.06]">
            <button
              disabled={isCapturing}
              onClick={() => setCaptureMode('photo')}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition-all ${
                captureMode === 'photo'
                  ? 'bg-white text-black shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              } disabled:opacity-50`}
            >
              Photo Mode
            </button>
            <button
              disabled={isCapturing}
              onClick={() => setCaptureMode('gif')}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition-all ${
                captureMode === 'gif'
                  ? 'bg-white text-black shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              } disabled:opacity-50`}
            >
              GIF Boomerang
            </button>
          </div>
        </div>

        {/* Center: Main Shutter Trigger Button */}
        <div className="flex items-center justify-center gap-2 sm:gap-3">
          {/* Cancel button — shown during active session */}
          {isCapturing && (
            <button
              onClick={cancelSession}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold border border-rose-500/20 transition-all active:scale-95"
            >
              <X className="w-3.5 h-3.5" />
              <span>Batal</span>
            </button>
          )}

          {/* State: idle → Start session */}
          {!isCapturing && (
            <button
              id="shutter-trigger-btn"
              onClick={startSession}
              className="shutter-btn group flex items-center justify-center gap-2 sm:gap-3 px-5 sm:px-7 py-2.5 sm:py-3 rounded-full bg-white hover:bg-neutral-200 text-black font-bold text-xs sm:text-sm shadow-xl transition-all active:scale-95 whitespace-nowrap"
            >
              <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-black/10 flex items-center justify-center">
                {captureMode === 'gif' ? (
                  <Film className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-black" />
                ) : (
                  <Camera className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-black" />
                )}
              </div>
              <span className="tracking-wide">
                {captureMode === 'gif'
                  ? 'MULAI GIF'
                  : shotsCount === 1
                  ? 'JEPRET FOTO'
                  : `MULAI — FOTO 1 DARI ${shotsCount}`}
              </span>
            </button>
          )}

          {/* State: waiting_next_shot → Manual trigger next shot */}
          {isWaitingNextShot && (
            <button
              onClick={captureNextShot}
              className="flex items-center justify-center gap-2 sm:gap-3 px-5 sm:px-7 py-2.5 sm:py-3 rounded-full bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs sm:text-sm shadow-xl transition-all active:scale-95 animate-pulse whitespace-nowrap"
            >
              <Camera className="w-4 h-4" />
              <span className="tracking-wide">
                FOTO {capturedPhotos.length + 1} DARI {shotsCount}
              </span>
            </button>
          )}
        </div>

        {/* Right: Timer & Camera Controls */}
        <div className="flex items-center justify-end sm:justify-end gap-2 sm:gap-3 text-xs">
          {/* Timer Selection */}
          <div className="flex items-center gap-1">
            <span className="text-neutral-400 text-[10px] sm:text-[11px] font-medium hidden xs:inline flex items-center gap-0.5">
              <Clock className="w-3 h-3 text-neutral-500" />
              Timer:
            </span>
            <div className="flex items-center bg-[#14161A] p-0.5 rounded-lg border border-white/[0.06]">
              {timerOptions.map((opt) => (
                <button
                  key={opt.value}
                  disabled={isCapturing}
                  onClick={() => setCountdownSeconds(opt.value)}
                  className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-[11px] font-medium transition-all ${
                    countdownSeconds === opt.value
                      ? 'bg-white text-black shadow-sm font-semibold'
                      : 'text-neutral-400 hover:text-white'
                  } disabled:opacity-50`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Hot Folder Camera Shutter Status Badge */}
          {isHotFolderActive && (
            <div
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-[10px] sm:text-[11px] font-mono text-emerald-300"
              title={`Hot Folder aktif (${hotFolderDir}). Tekan tombol jepret di bodi kamera atau wireless remote untuk jepret otomatis.`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
              <span className="hidden xl:inline">Shutter Kamera Fisik:</span>
              <span className="font-semibold text-emerald-300">SIAP JEPRET</span>
            </div>
          )}

          {/* Camera Source Selector */}
          <select
            disabled={isCapturing}
            value={currentBrand}
            onChange={(e) => switchCameraBrand(e.target.value as CameraBrand)}
            title="Pilih mode koneksi kamera"
            className="bg-[#14161A] border border-white/[0.08] text-neutral-200 text-[10px] sm:text-xs rounded-lg px-2 py-1 sm:py-1.5 outline-none focus:border-white/20 transition-colors max-w-[150px] sm:max-w-[210px] truncate"
          >
            <option value="device">
              {activeNativeCameraModel ? `Direct USB: ${activeNativeCameraModel}` : 'Direct USB: Sony/DSLR (Tanpa Software)'}
            </option>
            <option value="webcam">Webcam / HDMI Capture</option>
            <option value="mock">Simulasi: Sony FX3 Demo</option>
          </select>
        </div>
      </div>

      {/* Custom Format Modal */}
      <CustomFormatModal
        isOpen={isCustomModalOpen}
        onClose={() => setIsCustomModalOpen(false)}
        onSave={addCustomFormat}
      />

      {/* Template Library Modal */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-fadeIn">
          <div className="max-w-2xl w-full bg-[#121316] border border-white/[0.08] rounded-2xl p-5 flex flex-col gap-4 shadow-2xl max-h-[85vh] overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">Koleksi Desain Template Siap Pakai</h3>
              </div>
              <button
                onClick={() => setIsTemplateModalOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-white/[0.08] text-neutral-400 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto pr-1">
              {loadingTemplates ? (
                <div className="p-8 text-center text-xs text-neutral-400">
                  Memuat koleksi template...
                </div>
              ) : cloudTemplates.length === 0 ? (
                <div className="p-8 text-center text-xs text-neutral-500">
                  Belum ada template. Buka Dashboard Vendor di web untuk menambahkan template.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {cloudTemplates.map((tpl) => {
                    const isCurrent = activeFrameOverlay?.name === tpl.name;
                    return (
                      <div
                        key={tpl.id}
                        onClick={() => handleSelectCloudTemplate(tpl)}
                        className={`group relative flex flex-col rounded-xl border p-2.5 cursor-pointer transition-all ${
                          isCurrent
                            ? 'bg-emerald-950/20 border-emerald-500/80 ring-1 ring-emerald-500/50'
                            : 'bg-[#181A1E] border-white/[0.06] hover:border-white/20 hover:bg-[#1C1F24]'
                        }`}
                      >
                        <div className="w-full h-28 rounded-lg bg-black/60 border border-white/[0.06] flex items-center justify-center p-2 mb-2 overflow-hidden relative">
                          {tpl.overlay_base64 ? (
                            <img
                              src={tpl.overlay_base64}
                              alt={tpl.name}
                              className="max-h-full max-w-full object-contain"
                            />
                          ) : (
                            <ImageIcon className="w-6 h-6 text-neutral-600" />
                          )}
                          {isCurrent && (
                            <span className="absolute top-1.5 right-1.5 bg-emerald-500 text-black text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1 shadow">
                              <Check className="w-2.5 h-2.5" /> Aktif
                            </span>
                          )}
                        </div>

                        <span className="text-[11px] font-semibold text-white truncate mb-0.5">
                          {tpl.name}
                        </span>
                        <div className="flex items-center gap-1.5 text-[10px] text-neutral-400">
                          <span className="px-1.5 py-0.2 rounded bg-white/[0.06] text-neutral-300">
                            {tpl.aspect_ratio === '4:5' ? '4R' : tpl.aspect_ratio === '2:6' ? 'Strip' : tpl.aspect_ratio}
                          </span>
                          <span>• {tpl.slots || 2} Pose</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => setIsTemplateModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#181A1E] hover:bg-[#22262E] text-xs font-medium text-neutral-300 transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </footer>
  );
};
