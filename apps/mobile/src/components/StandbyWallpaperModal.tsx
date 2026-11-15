import React, { useRef, useState } from 'react';
import { useMobileBoothStore, DEFAULT_WALLPAPERS } from '../store/mobile-booth-store';
import {
  Monitor,
  Clock,
  Palette,
  Upload,
  Check,
  X,
  Maximize2,
  Minimize2,
} from 'lucide-react';

export const StandbyWallpaperModal: React.FC = () => {
  const {
    isWallpaperModalOpen,
    setIsWallpaperModalOpen,
    enableStandbyWallpaper,
    setEnableStandbyWallpaper,
    standbyTimeoutMinutes,
    setStandbyTimeoutMinutes,
    wallpaperFitMode,
    setWallpaperFitMode,
    selectedWallpaperId,
    setSelectedWallpaperId,
    customWallpaperUrl,
    setCustomWallpaperUrl,
  } = useMobileBoothStore();

  const [customFileName, setCustomFileName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isWallpaperModalOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCustomFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        setCustomWallpaperUrl(base64);
        setSelectedWallpaperId('custom');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const currentTimeoutSeconds = Math.round(standbyTimeoutMinutes * 60);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 select-none animate-fadeIn">
      <div className="bg-[#12141A] border border-white/[0.08] rounded-2xl max-w-xl w-full p-5 sm:p-6 text-white space-y-4 sm:space-y-5 shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* Header Modal */}
        <div className="flex items-center justify-between pb-3.5 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-white">
              <Monitor className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Pengaturan Wallpaper Standby
              </h2>
              <p className="text-xs text-neutral-400">
                Screensaver otomatis saat bilik photobooth sedang santai tanpa tamu
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsWallpaperModalOpen(false)}
            className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/10 text-neutral-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1. Status Wallpaper Standby */}
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#171920] border border-white/[0.06]">
          <div>
            <span className="text-xs font-semibold text-white block">
              Status Wallpaper Standby
            </span>
            <span className="text-[11px] text-neutral-400">
              Tampilkan wallpaper estetik saat tidak ada tamu yang berfoto
            </span>
          </div>
          <button
            type="button"
            onClick={() => setEnableStandbyWallpaper(!enableStandbyWallpaper)}
            className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
              enableStandbyWallpaper
                ? 'bg-white text-black shadow-sm'
                : 'bg-white/10 text-neutral-400 hover:text-white'
            }`}
          >
            {enableStandbyWallpaper ? 'AKTIF' : 'MATI'}
          </button>
        </div>

        {/* 2. Durasi Timer Diam (Idle Timeout) */}
        <div className="space-y-2.5 p-3.5 rounded-xl bg-[#171920] border border-white/[0.06]">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-neutral-400" />
              <span>Waktu Tunggu Standby (Idle Timeout):</span>
            </label>
            <span className="text-xs font-mono font-semibold text-white bg-white/10 px-2 py-0.5 rounded-md border border-white/10">
              {standbyTimeoutMinutes < 1
                ? `${currentTimeoutSeconds} Detik`
                : `${standbyTimeoutMinutes} Menit`}
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
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
                className={`flex-1 h-9 rounded-xl text-xs font-semibold transition-all cursor-pointer min-w-[50px] ${
                  standbyTimeoutMinutes === item.val
                    ? 'bg-white text-black shadow-sm font-bold'
                    : 'bg-[#12141A] border border-white/[0.06] text-neutral-300 hover:border-white/20'
                }`}
              >
                {item.label}
              </button>
            ))}

            {/* Stepper +/- */}
            <div className="flex items-center bg-[#12141A] border border-white/[0.08] rounded-xl p-0.5 h-9 shrink-0">
              <button
                type="button"
                onClick={() => setStandbyTimeoutMinutes(Math.max(0.2, Number((standbyTimeoutMinutes - 0.2).toFixed(1))))}
                className="w-7 h-full flex items-center justify-center text-neutral-300 hover:text-white hover:bg-white/10 rounded-lg text-sm font-bold transition-colors cursor-pointer"
              >
                -
              </button>
              <div className="flex items-center px-1">
                <span className="text-xs font-bold text-white px-1 font-mono">
                  {standbyTimeoutMinutes.toFixed(1).replace('.', ',')}
                </span>
                <span className="text-[10px] text-neutral-400 font-medium">m</span>
              </div>
              <button
                type="button"
                onClick={() => setStandbyTimeoutMinutes(Number((standbyTimeoutMinutes + 0.2).toFixed(1)))}
                className="w-7 h-full flex items-center justify-center text-neutral-300 hover:text-white hover:bg-white/10 rounded-lg text-sm font-bold transition-colors cursor-pointer"
              >
                +
              </button>
            </div>
          </div>
          <p className="text-[10px] text-neutral-400">
            Jika bilik foto tidak disentuh selama durasi di atas, wallpaper akan otomatis tampil.
          </p>
        </div>

        {/* 3. Pilihan Wallpaper Preset & Kustom */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-neutral-400" />
              <span>Pilih Tampilan Wallpaper:</span>
            </label>
            <span className="text-[11px] text-neutral-400">
              {DEFAULT_WALLPAPERS.length} Preset Bawaan + Kustom
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
            {DEFAULT_WALLPAPERS.map((preset) => {
              const isSelected = selectedWallpaperId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setSelectedWallpaperId(preset.id)}
                  className={`relative rounded-xl sm:rounded-2xl overflow-hidden border text-left transition-all group cursor-pointer ${
                    isSelected
                      ? 'border-white ring-2 ring-white/50 shadow-xl'
                      : 'border-white/10 hover:border-white/30 opacity-70 hover:opacity-100'
                  }`}
                >
                  <div className="aspect-[16/10] w-full bg-black/40 overflow-hidden">
                    <img
                      src={preset.path}
                      alt={preset.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                  <div className="p-1.5 sm:p-2 bg-[#171920]">
                    <span className="text-[10px] sm:text-[11px] font-semibold text-white block truncate">
                      {preset.name}
                    </span>
                    <span className="text-[8px] sm:text-[9px] text-neutral-400 block truncate">
                      {preset.subtitle}
                    </span>
                  </div>
                  {isSelected && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-white text-black flex items-center justify-center shadow-md">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Custom Upload Card */}
          <div
            className={`p-3 sm:p-3.5 rounded-xl sm:rounded-2xl border transition-all ${
              selectedWallpaperId === 'custom'
                ? 'bg-[#1A1C24] border-white shadow-md'
                : 'bg-[#14161C] border-white/[0.08]'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                <div className="w-8 h-8 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center shrink-0">
                  <Upload className="w-4 h-4 text-neutral-300" />
                </div>
                <div className="truncate">
                  <span className="text-xs font-semibold text-white block truncate">
                    {customFileName ? `Kustom: ${customFileName}` : 'Upload Wallpaper / Animasi Sendiri'}
                  </span>
                  <span className="text-[10px] text-neutral-400 block truncate">
                    Foto prewedding, logo acara, atau animasi GIF (.jpg, .png, .gif)
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-8 px-3 rounded-lg bg-white/[0.08] hover:bg-white/[0.15] border border-white/15 text-[11px] font-semibold text-white flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span>{customWallpaperUrl ? 'Ganti File' : 'Pilih File'}</span>
                </button>
                {customWallpaperUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomWallpaperUrl(null);
                      setCustomFileName('');
                      setSelectedWallpaperId('flower');
                    }}
                    className="h-8 px-2.5 rounded-lg text-[11px] text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 4. Gaya Tampilan / Pemotongan Wallpaper */}
        <div className="space-y-2.5 p-3.5 rounded-xl sm:rounded-2xl bg-[#171920] border border-white/[0.06]">
          <div>
            <span className="text-xs font-semibold text-white block">
              Gaya Tampilan / Pemotongan Wallpaper
            </span>
            <span className="text-[11px] text-neutral-400">
              Pilih apakah gambar dipotong memenuhi layar penuh atau ditampilkan utuh di layar
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setWallpaperFitMode('cover')}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                wallpaperFitMode === 'cover'
                  ? 'bg-white text-black border-white shadow-md'
                  : 'bg-[#12141A] text-neutral-300 border-white/10 hover:border-white/30'
              }`}
            >
              <div className="flex items-center gap-2">
                <Maximize2 className="w-4 h-4" />
                <span className="text-xs font-bold">Penuh (Crop)</span>
              </div>
              <p
                className={`text-[10px] mt-1.5 leading-relaxed ${
                  wallpaperFitMode === 'cover' ? 'text-neutral-700 font-medium' : 'text-neutral-400'
                }`}
              >
                Gambar mengisi seluruh layar tanpa tepi hitam.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setWallpaperFitMode('contain')}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                wallpaperFitMode === 'contain'
                  ? 'bg-white text-black border-white shadow-md'
                  : 'bg-[#12141A] text-neutral-300 border-white/10 hover:border-white/30'
              }`}
            >
              <div className="flex items-center gap-2">
                <Minimize2 className="w-4 h-4" />
                <span className="text-xs font-bold">Utuh (Fit)</span>
              </div>
              <p
                className={`text-[10px] mt-1.5 leading-relaxed ${
                  wallpaperFitMode === 'contain' ? 'text-neutral-700 font-medium' : 'text-neutral-400'
                }`}
              >
                Gambar terlihat utuh tanpa terpotong (tepi menyesuaikan rasio).
              </p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
