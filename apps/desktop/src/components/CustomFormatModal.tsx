import React, { useState } from 'react';
import { X, Sparkles, Check, Ratio, LayoutGrid } from 'lucide-react';
import { FormatConfig } from '../store/photobooth-store';

interface CustomFormatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (format: FormatConfig) => void;
}

const QUICK_PRESETS = [
  { name: '4R Portrait', w: 1200, h: 1800, ratio: '4:6', label: '4R (4×6")' },
  { name: '4R Landscape', w: 1800, h: 1200, ratio: '6:4', label: '4R Wide' },
  { name: '2R Mini / Wallet', w: 600, h: 900, ratio: '2:3', label: '2R (2×3")' },
  { name: '3R Standar', w: 1050, h: 1500, ratio: '3.5:5', label: '3R (3.5×5")' },
  { name: 'Polaroid Style', w: 1080, h: 1350, ratio: '4:5', label: 'Polaroid' },
  { name: 'Square 1:1', w: 1200, h: 1200, ratio: '1:1', label: 'Square 1:1' },
  { name: 'Wide Backdrop', w: 1920, h: 1080, ratio: '16:9', label: 'Wide 16:9' },
  { name: 'Story / Reels', w: 1080, h: 1920, ratio: '9:16', label: 'Story 9:16' },
];

export const CustomFormatModal: React.FC<CustomFormatModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [width, setWidth] = useState(1200);
  const [height, setHeight] = useState(1800);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  // Calculate GCD for simple ratio string
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const calcRatio = (w: number, h: number): string => {
    if (!w || !h) return 'Custom';
    const divisor = gcd(w, h);
    const rW = Math.round(w / divisor);
    const rH = Math.round(h / divisor);
    if (rW <= 16 && rH <= 16) {
      return `${rW}:${rH}`;
    }
    const val = (w / h).toFixed(2);
    return `${val}:1`;
  };

  const handleApplyPreset = (p: typeof QUICK_PRESETS[0]) => {
    setName(p.name);
    setWidth(p.w);
    setHeight(p.h);
    setError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Nama format harus diisi.');
      return;
    }
    if (width < 300 || height < 300) {
      setError('Lebar dan tinggi minimal 300 piksel.');
      return;
    }
    if (width > 6000 || height > 6000) {
      setError('Lebar dan tinggi maksimal 6000 piksel.');
      return;
    }

    const calculatedRatio = calcRatio(width, height);
    const newFormat: FormatConfig = {
      id: 'custom_' + Date.now(),
      name: name.trim(),
      label: name.trim().length > 12 ? name.trim().substring(0, 11) + '…' : name.trim(),
      category: 'custom',
      width: Math.round(width),
      height: Math.round(height),
      ratio: calculatedRatio,
      description: `Format kustom vendor (${width}×${height} px)`,
      isCustom: true,
    };

    onSave(newFormat);
    onClose();
  };

  const previewRatio = Math.max(0.2, Math.min(3, width / height));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div className="bg-[#12141A] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Ratio className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">
                Tambah Format Canvas Kustom
              </h3>
              <p className="text-[11px] text-neutral-400">
                Atur ukuran rasio &amp; dimensi cetak khusus vendor
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
          {/* Quick Preset Chips */}
          <div>
            <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-2">
              Pilihan Cepat Standar Industri:
            </label>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PRESETS.map((p) => (
                <button
                  type="button"
                  key={p.name}
                  onClick={() => handleApplyPreset(p)}
                  className="px-2.5 py-1 rounded-lg text-xs bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.08] text-neutral-300 hover:text-white transition-all text-left flex items-center gap-1.5"
                >
                  <span className="font-medium">{p.label}</span>
                  <span className="text-[10px] text-neutral-500">
                    ({p.w}×{p.h})
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Format Name Input */}
          <div>
            <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
              Nama Format
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              placeholder="Contoh: Cetak 3R Khusus, Polaroid Retro..."
              className="w-full h-10 px-3.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder:text-neutral-600 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          {/* Width & Height Dimensions */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
                Lebar Canvas (px)
              </label>
              <input
                type="number"
                min={300}
                max={6000}
                step={10}
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
                className="w-full h-10 px-3.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
                Tinggi Canvas (px)
              </label>
              <input
                type="number"
                min={300}
                max={6000}
                step={10}
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
                className="w-full h-10 px-3.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors font-mono"
              />
            </div>
          </div>

          {/* Live Preview Box */}
          <div className="p-3.5 rounded-xl bg-black/30 border border-white/[0.06] flex items-center justify-between gap-4">
            <div>
              <span className="text-[11px] font-semibold text-neutral-400 block">
                Proporsi Rasio Otomatis:
              </span>
              <span className="text-base font-bold text-emerald-400 font-mono">
                {calcRatio(width, height)}
              </span>
              <span className="text-[11px] text-neutral-500 block mt-0.5">
                Resolusi: {width} × {height} px
              </span>
            </div>

            <div className="w-24 h-24 rounded-lg bg-neutral-900 border border-white/10 flex items-center justify-center p-2">
              <div
                className="border-2 border-dashed border-emerald-400/80 rounded bg-emerald-500/10 flex items-center justify-center transition-all duration-300 shadow-sm"
                style={{
                  width: previewRatio >= 1 ? '100%' : `${previewRatio * 100}%`,
                  height: previewRatio >= 1 ? `${(1 / previewRatio) * 100}%` : '100%',
                  maxHeight: '100%',
                  maxWidth: '100%',
                }}
              >
                <LayoutGrid className="w-3 h-3 text-emerald-400/60" />
              </div>
            </div>
          </div>

          {error && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/[0.08]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-white hover:bg-neutral-200 text-black text-xs font-bold transition-all shadow-md active:scale-98 flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Simpan &amp; Terapkan Format</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
