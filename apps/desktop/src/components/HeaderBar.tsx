import React, { useState } from 'react';
import {
  Wifi,
  WifiOff,
  SlidersHorizontal,
  Camera,
  ChevronDown,
  Maximize2,
  FolderOpen,
  LogOut,
  Monitor,
  Tablet,
} from 'lucide-react';
import { usePhotoboothStore } from '../store/photobooth-store';
import { TetherHubModal } from './TetherHubModal';

export const HeaderBar: React.FC = () => {
  const {
    currentEvent,
    availableEvents,
    setEvent,
    cameraStatus,
    syncStats,
    isOnline,
    toggleAdminTesting,
    toggleNetworkStatus,
    toggleStorageModal,
    customStorageDir,
  } = usePhotoboothStore();

  const [isKioskActive, setIsKioskActive] = useState(false);
  const [isTetherModalOpen, setIsTetherModalOpen] = useState(false);

  const handleToggleKiosk = async () => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.toggleKiosk) {
      const active = await (window as any).electronAPI.toggleKiosk();
      setIsKioskActive(active);
    } else {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
        setIsKioskActive(true);
      } else {
        document.exitFullscreen().catch(() => {});
        setIsKioskActive(false);
      }
    }
  };

  const handleOpenStorageManager = () => {
    toggleStorageModal(true);
  };

  const handleLogoutStudio = () => {
    if (confirm('Keluar / Nonaktifkan akun Studio dari perangkat ini? Anda perlu login kembali untuk menggunakannya.')) {
      localStorage.removeItem('mb_license_token');
      localStorage.removeItem('mb_vendor_org');
      localStorage.removeItem('mb_device_info');
      window.location.reload();
    }
  };

  const isCameraConnected = cameraStatus.status === 'connected';
  const cameraLabel = cameraStatus.device?.name || (isCameraConnected ? 'Camera Ready' : 'No Camera');

  return (
    <header className="h-12 sm:h-13 px-3 sm:px-5 bg-[#0C0D0F] border-b border-white/[0.08] flex items-center justify-between gap-2 z-30 select-none flex-shrink-0 w-full">
      {/* ── Left: Brand & Event Selector ── */}
      <div className="flex items-center gap-2 sm:gap-3.5 min-w-0">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          <img
            src="/logo-minglebooth-header.png"
            alt="MingleBooth"
            className="h-6 sm:h-6.5 w-auto object-contain"
          />
        </div>

        <span className="text-white/20 text-xs hidden xs:inline">/</span>

        {/* Event selector */}
        <div className="relative min-w-0 max-w-[130px] xs:max-w-[180px] sm:max-w-[240px]">
          <select
            value={currentEvent.id}
            onChange={(e) => {
              const selected = availableEvents.find((evt) => evt.id === e.target.value);
              if (selected) setEvent(selected);
            }}
            className="w-full appearance-none bg-transparent hover:bg-white/[0.04] text-neutral-200 text-[11px] sm:text-xs font-medium pl-1.5 sm:pl-2 pr-6 py-1 rounded border border-transparent hover:border-white/10 outline-none cursor-pointer truncate transition-colors"
          >
            {availableEvents.map((evt) => (
              <option key={evt.id} value={evt.id} className="bg-[#16181D] text-white">
                {evt.name}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3 h-3 text-neutral-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* ── Center: Camera & Sync Status ── */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {/* Camera Status Dot & Label */}
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/[0.03] border border-white/[0.06] text-[11px] font-mono min-w-0" title={cameraLabel}>
          <span
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              isCameraConnected ? 'bg-emerald-400' : 'bg-rose-400'
            }`}
          />
          <span className="truncate max-w-[80px] sm:max-w-[140px] md:max-w-[180px] text-neutral-300">
            {cameraLabel}
          </span>
        </div>

        {/* Network & Cloud Sync Status */}
        <button
          type="button"
          onClick={toggleNetworkStatus}
          className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded border text-[11px] font-mono transition-all ${
            isOnline
              ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
              : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/40'
          }`}
          title="Status koneksi jaringan dan cloud sync"
        >
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
          {isOnline ? (
            <Wifi className="w-3 h-3 text-emerald-400 flex-shrink-0" />
          ) : (
            <WifiOff className="w-3 h-3 text-amber-400 flex-shrink-0" />
          )}
          <span className="font-semibold">
            {isOnline ? 'Online (Cloud Sync)' : 'Offline (Simpan Lokal)'}
          </span>
          {syncStats.totalPending > 0 && (
            <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 text-[10px] rounded-full font-bold border border-amber-500/30">
              {syncStats.totalPending} antrian
            </span>
          )}
        </button>
      </div>

      {/* ── Right: Action Buttons ── */}
      <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
        {/* Buka Mode Tab Button — opens tablet kiosk in new window */}
        <button
          onClick={() => {
            if (typeof window !== 'undefined' && (window as any).electronAPI?.openKioskTab) {
              (window as any).electronAPI.openKioskTab();
            } else {
              window.open('http://localhost:3000/tablet', '_blank', 'width=1280,height=800,menubar=no,toolbar=no,location=no');
            }
          }}
          title="Buka Mode Tab (Layar Kiosk Tamu)"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold border bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 border-violet-500/30 transition-colors"
        >
          <Tablet className="w-3.5 h-3.5 text-violet-400" />
          <span className="hidden sm:inline">Buka Mode Tab</span>
        </button>

        {/* Sambungkan Tablet Button for Mode Tab */}
        <button
          onClick={() => setIsTetherModalOpen(true)}
          title="Sambungkan ke iPad / Tablet (Mode Tab)"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium border bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30 transition-colors"
        >
          <Monitor className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden sm:inline">Sambungkan Tablet</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        </button>

        <button
          onClick={handleOpenStorageManager}
          title={customStorageDir ? `Penyimpanan Kustom: ${customStorageDir}` : "Buka Pengelola Folder Foto"}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium border transition-colors ${
            customStorageDir
              ? 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border-blue-500/30'
              : 'bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white border-white/[0.06]'
          }`}
        >
          <FolderOpen className={`w-3.5 h-3.5 ${customStorageDir ? 'text-blue-400' : 'text-neutral-400'}`} />
          <span className="hidden md:inline">Folder Foto</span>
          {customStorageDir && (
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
          )}
        </button>

        <button
          onClick={handleToggleKiosk}
          title="Toggle Kiosk Fullscreen Mode"
          className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
            isKioskActive
              ? 'bg-white text-black border-white font-semibold'
              : 'bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white border-white/[0.06]'
          }`}
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">{isKioskActive ? 'Exit Kiosk' : 'Kiosk Mode'}</span>
        </button>

        <button
          onClick={toggleAdminTesting}
          title="Buka Panel Diagnostik Sistem"
          className="flex items-center gap-1 px-2 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white text-[11px] font-medium border border-white/[0.06] transition-colors"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-neutral-400" />
          <span className="hidden lg:inline">Diagnostics</span>
        </button>

        <button
          onClick={handleLogoutStudio}
          title="Keluar / Logout Akun Studio"
          className="flex items-center gap-1 px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 text-[11px] font-medium border border-rose-500/20 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Keluar</span>
        </button>
      </div>

      <TetherHubModal
        isOpen={isTetherModalOpen}
        onClose={() => setIsTetherModalOpen(false)}
      />
    </header>
  );
};
