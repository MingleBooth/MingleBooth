import React, { useEffect, useState } from 'react';
import { useMobileBoothStore } from './store/mobile-booth-store';
import { StudioSetupView } from './components/StudioSetupView';
import { BoothCameraView } from './components/BoothCameraView';
import { StandbyWallpaperModal } from './components/StandbyWallpaperModal';
import { MobileAuthGate } from './components/MobileAuthGate';
import { ReviewResultModal } from './components/ReviewResultModal';
import { EventSelectorModal } from './components/EventSelectorModal';
import { TemplateSelectorModal } from './components/TemplateSelectorModal';
import { CustomFormatModal } from './components/CustomFormatModal';
import { MobileGalleryModal } from './components/MobileGalleryModal';
import { EventGalleryQrModal } from './components/EventGalleryQrModal';
import logoHeader from './assets/logo-minglebooth-header.png';
import {
  FolderPlus,
  Images,
  LogOut,
  ShieldCheck,
  Clock,
  AlertTriangle,
  User,
  QrCode,
} from 'lucide-react';

export const App: React.FC = () => {
  const {
    user,
    isDemoMode,
    licenseStatus,
    gracePeriodNotice,
    initLicense,
    phase,
    currentEvent,
    backendUrl,
    isGalleryOpen,
    setIsGalleryOpen,
    isEventQrModalOpen,
    setIsEventQrModalOpen,
    isAuthOpen,
    setIsAuthOpen,
    logout,
  } = useMobileBoothStore();

  const [storageToast, setStorageToast] = useState<string | null>(null);

  // Initialize offline-first license verification on startup
  useEffect(() => {
    initLicense();
  }, [initLicense]);


  // ── 0. LOADING SPLASH SCREEN ──
  if (licenseStatus === 'loading') {
    return (
      <div className="w-screen h-screen bg-[#090A0C] flex flex-col items-center justify-center p-6 text-white select-none">
        <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin mb-4" />
        <span className="text-xs font-semibold text-neutral-400 tracking-wider uppercase">
          Memverifikasi Sesi MingleBooth...
        </span>
      </div>
    );
  }

  // ── 1. MANDATORY AUTHENTICATION GATE (P0.5) ──
  // If user is not authenticated with a valid session/token, strictly block access to Setup & Kiosk
  if (!user || !user.token || licenseStatus === 'unauthenticated') {
    return (
      <div className="w-screen h-screen bg-[#090A0C] flex flex-col font-sans select-none overflow-hidden">
        <MobileAuthGate isOpen={true} onClose={() => {}} isMandatory={true} />
      </div>
    );
  }

  // ── 2. PERSISTENT DEMO MODE BANNER (1:1 DESKTOP PARITY) ──
  const renderDemoBanner = () => {
    if (!isDemoMode && licenseStatus !== 'demo' && licenseStatus !== 'expired') return null;

    const vendorDisplay = user?.vendorName || 'Operator Booth';
    const statusLabel =
      licenseStatus === 'expired' ? 'Langganan Kedaluwarsa' : 'Langganan Belum Aktif';

    return (
      <div className="z-50 bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 text-black font-semibold text-xs px-3 sm:px-4 py-1.5 sm:py-2 flex items-center justify-between shadow-lg border-b border-amber-400/40 select-none shrink-0 safe-top">
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
          <span className="px-2 py-0.5 rounded bg-black/25 text-black font-mono font-bold text-[10px] uppercase tracking-wider shrink-0">
            DEMO MODE
          </span>
          <span className="font-medium text-black hidden sm:inline truncate">
            Akun: {vendorDisplay} • {statusLabel} • Fitur Berbayar Terkunci (Pengujian Kamera Lokal)
          </span>
          <span className="font-medium text-black sm:hidden text-[11px] truncate">
            Akun: {vendorDisplay} • {statusLabel}
          </span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-2">
          <button
            type="button"
            onClick={() => setIsAuthOpen(true)}
            className="px-2.5 sm:px-3 py-1 rounded-lg bg-black hover:bg-neutral-800 text-white font-bold text-[11px] sm:text-xs flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
            title="Buka portal langganan untuk mengaktifkan seluruh fitur berbayar"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="hidden xs:inline">Aktifkan Langganan</span>
            <span className="xs:hidden">Aktifkan</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm('Keluar dari sesi operator dan nonaktifkan perangkat ini?')) {
                logout();
              }
            }}
            className="px-2 sm:px-2.5 py-1 rounded-lg bg-black/20 hover:bg-black/30 text-black font-semibold text-[11px] sm:text-xs flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
            title="Keluar dari akun operator"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            <span>Keluar</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#090A0C] text-[#EDEDED] flex flex-col font-sans select-none antialiased">
      {/* Top Persistent Demo Mode Banner if in demo mode */}
      {renderDemoBanner()}

      {/* Emergency Notice for Grace Period or Hardware Mismatch */}
      {gracePeriodNotice && (
        <div className="py-2 px-3.5 bg-amber-500/20 border-b border-amber-500/40 text-amber-300 text-xs flex items-center justify-between gap-2 shadow-lg animate-fadeIn z-40 shrink-0">
          <div className="flex items-center gap-2 truncate">
            <Clock className="w-4 h-4 shrink-0 text-amber-400" />
            <span className="truncate">{gracePeriodNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setIsAuthOpen(true)}
            className="text-[11px] font-bold underline hover:text-white shrink-0 cursor-pointer"
          >
            Perbarui
          </button>
        </div>
      )}

      {licenseStatus === 'device_mismatch' && (
        <div className="py-2 px-3.5 bg-rose-500/20 border-b border-rose-500/40 text-rose-300 text-xs flex items-center justify-between gap-2 shadow-lg animate-fadeIn z-40 shrink-0">
          <div className="flex items-center gap-2 truncate">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span className="truncate">Lisensi terdaftar pada perangkat lain (DEVICE_MISMATCH).</span>
          </div>
          <button
            type="button"
            onClick={() => setIsAuthOpen(true)}
            className="text-[11px] font-bold underline hover:text-white shrink-0 cursor-pointer"
          >
            Detail
          </button>
        </div>
      )}

      {/* ── PHASE 1: STUDIO SETUP VIEW (DASHBOARD) ── */}
      {phase === 'setup' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Top Minimal Header (56px) matching desktop */}
          <header className="h-14 px-3 sm:px-5 border-b border-white/[0.08] bg-[#0F1014] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <img
                src={logoHeader}
                alt="MingleBooth"
                className="h-6 sm:h-7 w-auto object-contain shrink-0"
                onError={(e) => {
                  const target = e.target as HTMLElement;
                  target.style.display = 'none';
                  const fallback = target.nextElementSibling as HTMLElement;
                  if (fallback) fallback.style.display = 'block';
                }}
              />
              <span className="text-sm font-bold tracking-tight text-white hidden" style={{ display: 'none' }}>
                mingle<span className="text-purple-400">booth</span>
              </span>
              <div className="h-3.5 w-[1px] bg-white/10 hidden sm:block" />
              <span className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase hidden sm:inline truncate">
                Studio Setup
              </span>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setStorageToast('Penyimpanan aktif: MingleBooth/photos (Internal/SDCard). Foto tersimpan otomatis.');
                  setTimeout(() => setStorageToast(null), 3500);
                }}
                className="h-8 px-2.5 sm:px-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-neutral-300 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer"
                title="Atur atau periksa penyimpanan foto"
              >
                <FolderPlus className="w-3.5 h-3.5 text-neutral-400" />
                <span className="hidden xs:inline sm:inline">Folder</span>
              </button>

              <button
                type="button"
                onClick={() => setIsEventQrModalOpen(true)}
                className="h-8 px-2.5 sm:px-3 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-xs font-semibold text-cyan-400 flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
                title="Tampilkan QR Galeri untuk seluruh album acara"
              >
                <QrCode className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden xs:inline sm:inline">QR Galeri</span>
              </button>

              <button
                type="button"
                onClick={() => setIsGalleryOpen(true)}
                className="h-8 px-2.5 sm:px-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-neutral-300 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer"
                title="Buka galeri foto acara"
              >
                <Images className="w-3.5 h-3.5 text-neutral-400" />
                <span>Galeri</span>
              </button>

              <button
                type="button"
                onClick={() => setIsAuthOpen(true)}
                className="h-8 px-2.5 sm:px-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-neutral-400 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer"
                title="Kelola akun operator"
              >
                <User className="w-3.5 h-3.5 text-neutral-400" />
                <span className="hidden xs:inline sm:inline">Akun</span>
              </button>
            </div>
          </header>

          {/* Storage Notification Toast */}
          {storageToast && (
            <div className="z-40 px-4 py-2 bg-emerald-950/90 border-b border-emerald-500/30 text-emerald-200 text-xs flex items-center justify-between gap-2 shadow-lg animate-fadeIn shrink-0">
              <div className="flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{storageToast}</span>
              </div>
              <button
                type="button"
                onClick={() => setStorageToast(null)}
                className="text-emerald-400 hover:text-white text-xs font-bold px-2 py-0.5 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Main Two-Column Studio Setup View */}
          <StudioSetupView />
        </div>
      )}

      {/* ── PHASE 2: GUEST KIOSK FULLSCREEN PHOTOBOOTH ── */}
      {phase === 'kiosk' && (
        <main className="w-full h-full flex-1 relative overflow-hidden">
          <BoothCameraView />
        </main>
      )}

      {/* ── Modals & Dialogs ── */}
      <StandbyWallpaperModal />
      <MobileAuthGate isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} isMandatory={false} />
      <ReviewResultModal />
      <EventSelectorModal />
      <TemplateSelectorModal />
      <CustomFormatModal />
      <MobileGalleryModal isOpen={isGalleryOpen} onClose={() => setIsGalleryOpen(false)} />
      <EventGalleryQrModal
        isOpen={isEventQrModalOpen}
        onClose={() => setIsEventQrModalOpen(false)}
        eventId={currentEvent?.id || ''}
        eventName={currentEvent?.name || 'Acara Photobooth'}
        backendUrl={backendUrl}
        isDemoMode={isDemoMode}
        onOpenSubscription={() => setIsAuthOpen(true)}
      />
    </div>
  );
};

export default App;
