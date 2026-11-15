import React, { useState } from 'react';
import { useMobileBoothStore } from '../store/mobile-booth-store';
import { FormatConfig } from '../lib/mobileTemplateEngine';
import { Sliders, X, Check, AlertCircle } from 'lucide-react';

export const CustomFormatModal: React.FC = () => {
  const { isCustomFormatOpen, setIsCustomFormatOpen, addCustomFormat } = useMobileBoothStore();

  const [name, setName] = useState('');
  const [width, setWidth] = useState<number>(1200);
  const [height, setHeight] = useState<number>(1800);
  const [error, setError] = useState<string | null>(null);

  if (!isCustomFormatOpen) return null;

  // Calculate simplified ratio string
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height) || 1;
  const ratioStr = `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Masukkan nama format canvas kustom.');
      return;
    }

    if (width < 400 || width > 4000) {
      setError('Lebar canvas harus antara 400px dan 4000px.');
      return;
    }

    if (height < 400 || height > 4000) {
      setError('Tinggi canvas harus antara 400px dan 4000px.');
      return;
    }

    const newFormat: FormatConfig = {
      id: `format_custom_${Date.now()}`,
      name: trimmedName,
      label: trimmedName,
      category: 'custom',
      width: Math.round(width),
      height: Math.round(height),
      ratio: ratioStr,
      description: `Format Kustom (${width}×${height}px, rasio ${ratioStr})`,
      isCustom: true,
    };

    addCustomFormat(newFormat);
    setIsCustomFormatOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in select-none">
      <div className="w-full max-w-md bg-dark-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-400 flex items-center justify-center">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Buat Format Canvas Kustom</h2>
              <p className="text-xs text-slate-400">Tentukan dimensi cetak atau digital kustom</p>
            </div>
          </div>
          <button
            onClick={() => setIsCustomFormatOpen(false)}
            className="w-8 h-8 rounded-full bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Nama Format</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Backdrop Banner 10x15"
              className="w-full px-3.5 py-2.5 rounded-xl bg-dark-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-brand-500"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Lebar (px)</label>
              <input
                type="number"
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
                min={400}
                max={4000}
                step={10}
                className="w-full px-3.5 py-2.5 rounded-xl bg-dark-950 border border-slate-800 text-white text-sm font-mono focus:outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Tinggi (px)</label>
              <input
                type="number"
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
                min={400}
                max={4000}
                step={10}
                className="w-full px-3.5 py-2.5 rounded-xl bg-dark-950 border border-slate-800 text-white text-sm font-mono focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          {/* Ratio preview badge */}
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-xs">
            <span className="text-slate-400">Rasio Aspek Terhitung:</span>
            <span className="font-mono font-bold text-brand-400 px-2.5 py-0.5 rounded-md bg-brand-500/10 border border-brand-500/20">
              {ratioStr} ({width > height ? 'Landscape' : width < height ? 'Portrait' : 'Persegi'})
            </span>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setIsCustomFormatOpen(false)}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-brand-500/30 transition"
            >
              <Check className="w-4 h-4" />
              <span>Simpan & Terapkan</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
