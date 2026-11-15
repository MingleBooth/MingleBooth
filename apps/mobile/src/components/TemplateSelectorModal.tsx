import React, { useState } from 'react';
import { useMobileBoothStore } from '../store/mobile-booth-store';
import {
  PRESET_FORMATS,
  processCustomFramePng,
  FormatConfig,
} from '../lib/mobileTemplateEngine';
import {
  LayoutGrid,
  Image as ImageIcon,
  Check,
  X,
  Upload,
  Trash2,
  AlertCircle,
  Plus,
  Eye,
  Camera,
} from 'lucide-react';

export const TemplateSelectorModal: React.FC = () => {
  const {
    isTemplateSelectOpen,
    setIsTemplateSelectOpen,
    activeFormat,
    customFormats,
    setFormat,
    shotsCount,
    setShotsCount,
    activeFrameOverlay,
    setActiveFrameOverlay,
    setIsCustomFormatOpen,
    removeCustomFormat,
  } = useMobileBoothStore();

  const [activeTab, setActiveTab] = useState<'formats' | 'frame'>('formats');
  const [frameProcessing, setFrameProcessing] = useState(false);
  const [frameError, setFrameError] = useState<string | null>(null);

  if (!isTemplateSelectOpen) return null;

  const allFormats: FormatConfig[] = [...PRESET_FORMATS, ...customFormats];

  const handleFrameUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFrameProcessing(true);
    setFrameError(null);

    try {
      const result = await processCustomFramePng(file, activeFormat);
      if (result.error) {
        setFrameError(result.error);
      } else if (result.frame) {
        setActiveFrameOverlay(result.frame);
      }
    } catch (err: any) {
      setFrameError(err.message || 'Gagal memproses frame PNG.');
    } finally {
      setFrameProcessing(false);
      e.target.value = '';
    }
  };

  const handleRemoveFrame = () => {
    setActiveFrameOverlay(null);
    setFrameError(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fade-in select-none">
      <div className="w-full max-w-2xl bg-dark-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center">
              <LayoutGrid className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Tata Letak & Frame Studio</h2>
              <p className="text-xs text-slate-400">Universal Format 1:1, Poses, & Custom PNG Overlay</p>
            </div>
          </div>
          <button
            onClick={() => setIsTemplateSelectOpen(false)}
            className="w-8 h-8 rounded-full bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 mt-4 p-1 rounded-2xl bg-dark-950 border border-slate-800 shrink-0">
          <button
            onClick={() => setActiveTab('formats')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition ${
              activeTab === 'formats'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Format & Pose ({allFormats.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('frame')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition relative ${
              activeTab === 'frame'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Custom Frame PNG</span>
            {activeFrameOverlay && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 absolute top-2 right-3 animate-pulse" />
            )}
          </button>
        </div>

        {/* Tab 1: Formats & Shots Count */}
        {activeTab === 'formats' && (
          <div className="flex-1 overflow-y-auto py-4 space-y-5">
            {/* Shots Count Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-purple-400" />
                <span>Jumlah Pose per Sesi:</span>
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map((count) => {
                  const isSelected = shotsCount === count;
                  return (
                    <button
                      key={count}
                      onClick={() => setShotsCount(count)}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition flex flex-col items-center gap-1 ${
                        isSelected
                          ? 'bg-purple-500/20 border-purple-500 text-purple-300 shadow-sm'
                          : 'bg-dark-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <span className="text-sm">{count}</span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        {count === 1 ? 'Single Shot' : `${count} Pose`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Formats Grid */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-300">Pilih Format Canvas / Cetak:</label>
                <button
                  onClick={() => setIsCustomFormatOpen(true)}
                  className="px-2.5 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 text-[11px] font-bold flex items-center gap-1 transition"
                >
                  <Plus className="w-3 h-3" />
                  <span>Format Kustom</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {allFormats.map((fmt) => {
                  const isSelected = fmt.id === activeFormat.id;
                  return (
                    <div
                      key={fmt.id}
                      onClick={() => setFormat(fmt)}
                      className={`p-3.5 rounded-2xl border cursor-pointer transition flex flex-col justify-between ${
                        isSelected
                          ? 'bg-purple-500/15 border-purple-500 text-white shadow-lg shadow-purple-500/10'
                          : 'bg-dark-950/60 border-slate-800/80 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] uppercase font-mono font-bold tracking-wider px-2 py-0.5 rounded-md bg-slate-800 text-slate-300">
                            {fmt.ratio} • {fmt.category}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {fmt.isCustom && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeCustomFormat(fmt.id);
                                }}
                                className="p-1 rounded-md text-slate-500 hover:text-rose-400 transition"
                                title="Hapus format kustom"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {isSelected && <Check className="w-4 h-4 text-purple-400" />}
                          </div>
                        </div>

                        <h3 className="text-sm font-bold text-white mb-0.5">{fmt.name}</h3>
                        <p className="text-[11px] text-slate-400 font-mono">
                          {fmt.width}×{fmt.height}px
                        </p>
                        {fmt.description && (
                          <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">{fmt.description}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Custom PNG Frame & Automatic Hole Detection */}
        {activeTab === 'frame' && (
          <div className="flex-1 overflow-y-auto py-4 space-y-4">
            {/* Upload Area */}
            <div className="p-4 rounded-2xl bg-dark-950/70 border border-dashed border-slate-700/80 flex flex-col items-center text-center">
              <input
                type="file"
                id="mobile-png-frame-input"
                accept="image/png"
                onChange={handleFrameUpload}
                className="hidden"
                disabled={frameProcessing}
              />
              <label
                htmlFor="mobile-png-frame-input"
                className={`w-full flex flex-col items-center justify-center p-4 cursor-pointer transition ${
                  frameProcessing ? 'opacity-50 pointer-events-none' : 'hover:text-purple-300'
                }`}
              >
                <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mb-3">
                  <Upload className="w-6 h-6" />
                </div>
                <span className="text-sm font-bold text-white mb-1">
                  {frameProcessing ? 'Menganalisis Lubang Transparan...' : 'Unggah Frame PNG Transparan'}
                </span>
                <span className="text-xs text-slate-400 max-w-xs">
                  Sistem otomatis mendeteksi kotak foto (cutouts) dari area transparan PNG.
                </span>
              </label>

              {frameError && (
                <div className="mt-3 w-full p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2 text-left">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{frameError}</span>
                </div>
              )}
            </div>

            {/* Active Frame Details & Preview */}
            {activeFrameOverlay ? (
              <div className="p-4 rounded-2xl bg-dark-950/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    <h4 className="text-sm font-bold text-white">{activeFrameOverlay.name}</h4>
                  </div>
                  <button
                    onClick={handleRemoveFrame}
                    className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-1 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Frame</span>
                  </button>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 flex items-center justify-between">
                  <span>Deteksi Lubang Foto (Auto-Hole):</span>
                  <span className="font-mono font-bold text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                    {activeFrameOverlay.customCutouts && activeFrameOverlay.customCutouts.length > 0
                      ? `${activeFrameOverlay.customCutouts.length} Lubang Terdeteksi`
                      : 'Tata Letak Dinamis (Standar)'}
                  </span>
                </div>

                {/* Frame Preview Miniature */}
                <div className="relative w-full h-48 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center p-2">
                  <img
                    src={activeFrameOverlay.base64}
                    alt="Frame Preview"
                    className="max-w-full max-h-full object-contain pointer-events-none"
                  />
                  {activeFrameOverlay.customCutouts?.map((cutout, idx) => {
                    const canvasW = activeFormat.width || 1200;
                    const canvasH = activeFormat.height || 1800;
                    const leftPct = (cutout.x / canvasW) * 100;
                    const topPct = (cutout.y / canvasH) * 100;
                    const widthPct = (cutout.width / canvasW) * 100;
                    const heightPct = (cutout.height / canvasH) * 100;

                    return (
                      <div
                        key={idx}
                        style={{
                          left: `${leftPct}%`,
                          top: `${topPct}%`,
                          width: `${widthPct}%`,
                          height: `${heightPct}%`,
                        }}
                        className="absolute border-2 border-emerald-400/80 bg-emerald-500/10 rounded flex items-center justify-center text-[10px] font-mono font-bold text-emerald-300 shadow-sm pointer-events-none"
                      >
                        P{idx + 1}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="p-6 rounded-2xl bg-dark-950/40 border border-slate-800/60 text-center">
                <p className="text-xs text-slate-400">
                  Belum ada frame PNG kustom aktif. Tanpa frame, MingleBooth akan menggunakan tata letak dinamis
                  berdasarkan format canvas yang Anda pilih.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Modal Footer */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-end shrink-0">
          <button
            onClick={() => setIsTemplateSelectOpen(false)}
            className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg shadow-purple-600/30 transition flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>Terapkan & Mulai Foto</span>
          </button>
        </div>
      </div>
    </div>
  );
};
