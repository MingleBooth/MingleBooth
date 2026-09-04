import React, { useState, useEffect } from 'react';
import { usePhotoboothStore } from '../store/photobooth-store';
import {
  Folder,
  FolderOpen,
  FolderCheck,
  HardDrive,
  Copy,
  Check,
  RotateCcw,
  X,
  ExternalLink,
  Layers,
  Image,
  Film,
  Sparkles,
  RefreshCw,
  Printer,
} from 'lucide-react';

export const StorageManagerModal: React.FC = () => {
  const {
    isStorageModalOpen,
    toggleStorageModal,
    customStorageDir,
    setCustomStorageDir,
    selectStorageFolder,
    openStorageFolder,
    resetStorageDir,
    currentEvent,
  } = usePhotoboothStore();

  const [inputDir, setInputDir] = useState(customStorageDir || '');
  const [copied, setCopied] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isOpeningFolder, setIsOpeningFolder] = useState(false);
  const [openNotification, setOpenNotification] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    processedCount: number;
    rawCount: number;
    thumbnailsCount: number;
    gifsCount: number;
    totalBytes: number;
    recentFiles?: string[];
  }>({
    processedCount: 0,
    rawCount: 0,
    thumbnailsCount: 0,
    gifsCount: 0,
    totalBytes: 0,
  });
  const [loadingStats, setLoadingStats] = useState(false);

  useEffect(() => {
    setInputDir(customStorageDir || '');
  }, [customStorageDir]);

  const eventId = currentEvent?.id || 'evt_default';
  const eventName = currentEvent?.name || 'Photobooth Event';

  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.listFiles) {
        const res = await (window as any).electronAPI.listFiles({
          basePath: customStorageDir || undefined,
          eventId,
        });
        if (res?.success) {
          setStats({
            processedCount: res.processedCount || 0,
            rawCount: res.rawCount || 0,
            thumbnailsCount: 0,
            gifsCount: 0,
            totalBytes: res.totalBytes || 0,
          });
        }
      } else {
        // Fetch via Web API
        const qParams = new URLSearchParams({
          eventId,
          ...(customStorageDir ? { customStoragePath: customStorageDir } : {}),
        });
        const resp = await fetch(`http://localhost:3000/api/storage/list-event-files?${qParams.toString()}`);
        if (resp.ok) {
          const data = await resp.json();
          setStats({
            processedCount: data.processedCount || 0,
            rawCount: data.rawCount || 0,
            thumbnailsCount: data.thumbnailsCount || 0,
            gifsCount: data.gifsCount || 0,
            totalBytes: data.totalBytes || 0,
            recentFiles: data.processedFiles || [],
          });
        }
      }
    } catch (e) {
      console.warn('Could not fetch storage stats:', e);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    if (isStorageModalOpen) {
      fetchStats();
    }
  }, [isStorageModalOpen, customStorageDir, eventId]);

  if (!isStorageModalOpen) return null;

  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron;
  const isCustom = Boolean(customStorageDir && customStorageDir.trim());
  const activeEventDir = isCustom ? customStorageDir.trim() : `./data/events/${eventId}`;

  const handleCopyPath = () => {
    navigator.clipboard.writeText(activeEventDir);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenFolderWithFeedback = async (subPath?: string) => {
    setIsOpeningFolder(true);
    try {
      await openStorageFolder(subPath);
      const label = subPath ? `Subfolder [${subPath}]` : 'Folder event';
      setOpenNotification(`${label} berhasil dibuka di sistem operasi`);
      setTimeout(() => setOpenNotification(null), 3500);
    } catch (e) {
      setOpenNotification('Gagal membuka folder di sistem operasi');
      setTimeout(() => setOpenNotification(null), 3500);
    } finally {
      setIsOpeningFolder(false);
    }
  };

  const handleBrowseFolder = async () => {
    setIsSelecting(true);
    try {
      const selected = await selectStorageFolder();
      if (selected) {
        setInputDir(selected);
      }
    } finally {
      setIsSelecting(false);
    }
  };

  const handleApplyCustomPath = (e: React.FormEvent) => {
    e.preventDefault();
    setCustomStorageDir(inputDir);
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 KB';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6 select-none animate-fadeIn">
      <div className="max-w-2xl w-full bg-[#121418] border border-white/[0.08] rounded-2xl p-5 sm:p-7 flex flex-col gap-5 max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Penyimpanan Foto & Folder Event
                {isCustom ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                    Custom Drive
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/10 text-neutral-300 border border-white/10">
                    Default
                  </span>
                )}
              </h2>
              <p className="text-xs text-neutral-400">
                Atur lokasi penyimpanan file foto hasil jepretan, foto mentah (raw), dan file cetak.
              </p>
            </div>
          </div>
          <button
            onClick={() => toggleStorageModal(false)}
            className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-neutral-300 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current Active Path & Directory Selector */}
        <div className="bg-[#181B20] border border-white/[0.06] rounded-xl p-4 sm:p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <HardDrive className="w-4 h-4 text-blue-400" />
              Tentukan Lokasi Folder Penyimpanan Foto
            </span>
            {isCustom && (
              <button
                onClick={() => {
                  resetStorageDir();
                  setInputDir('');
                  setOpenNotification('Folder penyimpanan di-reset ke folder bawaan (./data)');
                  setTimeout(() => setOpenNotification(null), 3000);
                }}
                className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1 transition-colors px-2 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08]"
                title="Kembalikan ke folder bawaan aplikasi"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset ke Default</span>
              </button>
            )}
          </div>

          {/* Primary Action: Browse Folder Dialog */}
          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch">
            <button
              type="button"
              onClick={handleBrowseFolder}
              disabled={isSelecting}
              className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
            >
              <Folder className="w-4 h-4" />
              <span>{isSelecting ? 'Membuka Dialog Folder OS...' : 'Pilih Folder Baru via Finder / Explorer'}</span>
            </button>
          </div>

          {/* Quick presets & Manual Input */}
          <div className="flex flex-col gap-2 pt-1 border-t border-white/[0.04]">
            <span className="text-[11px] text-neutral-400 font-medium">Atau ketik path / pilih pintasan lokasi:</span>
            <form onSubmit={handleApplyCustomPath} className="flex gap-2">
              <input
                type="text"
                value={inputDir}
                onChange={(e) => setInputDir(e.target.value)}
                placeholder="/Volumes/NamaSSD/Folder_Photobooth atau ./data"
                className="flex-1 bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder:text-neutral-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
              <button
                type="submit"
                disabled={inputDir === customStorageDir}
                className="px-3.5 py-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.15] text-white text-xs font-semibold border border-white/10 disabled:opacity-40 transition-colors flex-shrink-0"
              >
                Terapkan Path
              </button>
            </form>
          </div>

          {/* Active Event Directory Path Display */}
          <div className="p-3 rounded-lg bg-black/60 border border-white/[0.06] flex items-center justify-between gap-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] uppercase font-mono tracking-wider text-neutral-500 font-semibold block">
                  Lokasi Aktif Foto Event Ini ({eventName})
                </span>
                {isCustom ? (
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Kustom
                  </span>
                ) : (
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-white/10 text-neutral-300">
                    Bawaan (Default)
                  </span>
                )}
              </div>
              <span className="text-xs font-mono text-neutral-200 truncate block select-all font-semibold">
                {activeEventDir}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopyPath}
              className="px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-neutral-300 hover:text-white text-[11px] font-medium flex items-center gap-1.5 flex-shrink-0 border border-white/[0.08] transition-colors"
              title="Salin path direktori"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-semibold">Tersalin</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Salin Path</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Storage Metrics & Subfolder Layout */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-300">Struktur Subfolder Event & Statistik File</span>
            <button
              onClick={fetchStats}
              disabled={loadingStats}
              className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1 transition-colors"
              title="Refresh status file"
            >
              <RefreshCw className={`w-3 h-3 ${loadingStats ? 'animate-spin text-blue-400' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* Processed folder */}
            <div
              onClick={() => handleOpenFolderWithFeedback('processed')}
              className="p-3 rounded-xl bg-[#181B20] border border-emerald-500/30 hover:border-emerald-400 cursor-pointer transition-all group flex flex-col justify-between shadow-sm hover:shadow-emerald-500/10"
              title="Klik untuk membuka folder foto siap cetak di Finder/Explorer"
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <Image className="w-4 h-4 text-emerald-400" />
                  <Printer className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <span className="text-[10px] font-mono text-emerald-400 font-semibold">
                  processed/
                </span>
              </div>
              <div>
                <span className="text-lg font-bold text-white block">{stats.processedCount}</span>
                <span className="text-[11px] text-emerald-300 font-medium">Foto Siap Cetak</span>
                <span className="text-[9px] text-neutral-400 block mt-0.5">Buka &amp; Print Ulang</span>
              </div>
            </div>

            {/* Raw folder */}
            <div
              onClick={() => handleOpenFolderWithFeedback('raw')}
              className="p-3 rounded-xl bg-[#181B20] border border-white/[0.06] hover:border-blue-500/30 cursor-pointer transition-all group flex flex-col justify-between"
              title="Klik untuk membuka folder raw di Finder/Explorer"
            >
              <div className="flex items-center justify-between mb-1.5">
                <Layers className="w-4 h-4 text-blue-400" />
                <span className="text-[10px] font-mono text-neutral-500 group-hover:text-blue-400 transition-colors">
                  raw/
                </span>
              </div>
              <div>
                <span className="text-lg font-bold text-white block">{stats.rawCount}</span>
                <span className="text-[11px] text-neutral-400">Jepretan Mentah</span>
              </div>
            </div>

            {/* GIFs / Boomerang */}
            <div
              onClick={() => handleOpenFolderWithFeedback('gifs')}
              className="p-3 rounded-xl bg-[#181B20] border border-white/[0.06] hover:border-purple-500/30 cursor-pointer transition-all group flex flex-col justify-between"
              title="Klik untuk membuka folder gifs di Finder/Explorer"
            >
              <div className="flex items-center justify-between mb-1.5">
                <Film className="w-4 h-4 text-purple-400" />
                <span className="text-[10px] font-mono text-neutral-500 group-hover:text-purple-400 transition-colors">
                  gifs/
                </span>
              </div>
              <div>
                <span className="text-lg font-bold text-white block">{stats.gifsCount}</span>
                <span className="text-[11px] text-neutral-400">Animasi GIF</span>
              </div>
            </div>

            {/* Total Size */}
            <div
              onClick={() => handleOpenFolderWithFeedback()}
              className="p-3 rounded-xl bg-[#181B20] border border-white/[0.06] hover:border-amber-500/30 cursor-pointer transition-all group flex flex-col justify-between"
              title="Klik untuk membuka folder root event di Finder/Explorer"
            >
              <div className="flex items-center justify-between mb-1.5">
                <HardDrive className="w-4 h-4 text-amber-400" />
                <span className="text-[10px] font-mono text-neutral-500 group-hover:text-amber-400 transition-colors">
                  Size
                </span>
              </div>
              <div>
                <span className="text-lg font-bold text-white block truncate">
                  {formatBytes(stats.totalBytes)}
                </span>
                <span className="text-[11px] text-neutral-400">Kapasitas Disk</span>
              </div>
            </div>
          </div>
        </div>

        {/* Open Notification Banner */}
        {openNotification && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2 text-xs text-emerald-300 animate-fadeIn">
            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{openNotification}</span>
          </div>
        )}

        {/* Tip for vendor */}
        <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/15 flex items-start gap-2.5">
          <Sparkles className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-neutral-300">
            <span className="font-semibold text-white">Tips Vendor: </span>
            Anda dapat memilih folder di **SSD Eksternal / Flashdisk** atau folder sinkronisasi **Google Drive / Dropbox Desktop** agar seluruh file otomatis ter-backup ke drive eksternal Anda.
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-2 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => toggleStorageModal(false)}
            className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-neutral-300 text-xs font-medium transition-colors"
          >
            Tutup
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleOpenFolderWithFeedback('processed')}
              disabled={isOpeningFolder}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
              title="Buka folder foto berbingkai yang siap dicetak ke printer"
            >
              <Printer className="w-4 h-4" />
              <span>Buka Foto Siap Cetak (processed/)</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenFolderWithFeedback()}
              disabled={isOpeningFolder}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-blue-600/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
              title="Buka folder root event di macOS Finder atau Windows File Explorer"
            >
              <FolderCheck className="w-4 h-4" />
              <span>Semua Folder Event</span>
              <ExternalLink className="w-3 h-3 opacity-70" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
