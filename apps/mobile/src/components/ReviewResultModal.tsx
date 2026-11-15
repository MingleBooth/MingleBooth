import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useMobileBoothStore } from '../store/mobile-booth-store';
import { QRGenerator } from '@minglebooth/photo-engine';
import { getSafeGalleryBaseUrl } from '../lib/networkGuard';
import { saveMobileCapture } from '../lib/mobileStorage';
import { syncPendingCaptures } from '../lib/mobileSync';
import logoHeader from '../assets/logo-minglebooth-header.png';
import { PrintChoiceModal } from './PrintChoiceModal';
import { EventGalleryQrModal } from './EventGalleryQrModal';
import {
  ChevronLeft,
  ChevronRight,
  Images,
  Printer,
  RotateCcw,
  Camera,
  Film,
  Share2,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  Lock,
  QrCode,
  Image as ImageIcon,
} from 'lucide-react';

export type DeliveryState =
  | 'CAPTURED'
  | 'PROCESSING'
  | 'UPLOADING'
  | 'PUBLISHED'
  | 'QR_READY'
  | 'ERROR'
  | 'DEMO_SAVED';

export const ReviewResultModal: React.FC = () => {
  const {
    isReviewOpen,
    setIsReviewOpen,
    composedPhotoUrl,
    composedGifUrl,
    isDemoMode,
    currentEvent,
    user,
    backendUrl,
    rawShots,
    resetRawShots,
    retakeSlot,
    setPhase,
    setIsGalleryOpen,
    setIsAuthOpen,
  } = useMobileBoothStore();

  const [activeTab, setActiveTab] = useState<'photo' | 'gif' | 'original'>('photo');
  const [selectedRawIndex, setSelectedRawIndex] = useState<number>(0);
  const [photoId, setPhotoId] = useState<string>('');
  const [qrUrl, setQrUrl] = useState<string>('');
  const [guestLink, setGuestLink] = useState<string>('');
  const [qrStatus, setQrStatus] = useState<'idle' | 'generating' | 'ready' | 'error' | 'disabled'>('idle');
  const [cloudSyncStatus, setCloudSyncStatus] = useState<
    'idle' | 'uploading' | 'synced' | 'offline_queued' | 'error'
  >('idle');
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);
  const [deliveryState, setDeliveryState] = useState<DeliveryState>('PROCESSING');
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [isRetakeMenuOpen, setIsRetakeMenuOpen] = useState<boolean>(false);
  const [reviewCountdown, setReviewCountdown] = useState<number>(30);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
  const [isEventQrModalOpen, setIsEventQrModalOpen] = useState<boolean>(false);
  const isSyncRunningRef = useRef<boolean>(false);

  // 30-Second Auto-Reset Countdown matching desktop behavior
  useEffect(() => {
    if (!isReviewOpen) return;
    setReviewCountdown(30);

    const timer = setInterval(() => {
      setReviewCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          resetRawShots();
          setIsReviewOpen(false);
          setPhase('kiosk');
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isReviewOpen, resetRawShots, setIsReviewOpen, setPhase]);

  // Generate deterministic QR Code (Only for paid mode, NEVER in demo mode)
  const generateQrCode = useCallback(async (currentPhotoId: string) => {
    // Mode Demo: Strictly prevent QR generation!
    if (isDemoMode) {
      setQrUrl('');
      setGuestLink('');
      setQrStatus('idle');
      setDeliveryState('DEMO_SAVED');
      return;
    }

    try {
      setQrStatus('generating');
      // Mode Berbayar/Event: deterministic public gallery link
      const cleanBase = getSafeGalleryBaseUrl(backendUrl);
      const targetEventId =
        currentEvent.id && currentEvent.id !== 'evt_demo_mobile' ? currentEvent.id : '';
      const link = targetEventId
        ? `${cleanBase}/gallery/${targetEventId}?p=${currentPhotoId}`
        : QRGenerator.buildGalleryUrl(cleanBase, currentPhotoId);

      setGuestLink(link);
      const qrData = await QRGenerator.generateDataUrl(link, { width: 320, margin: 1 });
      setQrUrl(qrData);
      setQrStatus('ready');
      setDeliveryState('QR_READY');
    } catch (err: any) {
      console.error('[ReviewResultModal] QR generation failed:', err);
      setQrStatus('error');
      setDeliveryError('Gagal memproses QR Code');
    }
  }, [isDemoMode, backendUrl, currentEvent.id]);

  // Execution flow: local persistence & optional background cloud sync
  const executeDeliveryFlow = useCallback(
    async (currentPhotoId: string) => {
      try {
        setDeliveryError(null);

        // 1. Generate QR code (Only if NOT in demo mode)
        if (!isDemoMode) {
          await generateQrCode(currentPhotoId);
        } else {
          setQrUrl('');
          setGuestLink('');
          setQrStatus('idle');
          setDeliveryState('DEMO_SAVED');
        }

        // 2. Local persistence (Dual storage: IndexedDB for active, RAM-only for demo)
        await saveMobileCapture({
          photoId: currentPhotoId,
          eventId: currentEvent.id,
          eventName: currentEvent.name,
          photoDataUrl: composedPhotoUrl!,
          gifDataUrl: composedGifUrl,
          hasGif: Boolean(composedGifUrl),
          rawShots,
          createdAt: new Date().toISOString(),
          isDemo: isDemoMode,
        });

        // 3. Demo Mode: Strictly bypass cloud queue & database
        if (isDemoMode) {
          setCloudSyncStatus('idle');
          setDeliveryState('DEMO_SAVED');
          return;
        }

        // 4. Production Mode: Background cloud synchronization
        if (!user?.token) {
          setCloudSyncStatus('offline_queued');
          setDeliveryError('Akun belum terotentikasi. Sesi disimpan di perangkat.');
          return;
        }

        if (isSyncRunningRef.current) return;
        isSyncRunningRef.current = true;
        setCloudSyncStatus('uploading');

        try {
          const res = await syncPendingCaptures(backendUrl, user.token, false);
          if (res.syncedCount > 0) {
            setCloudSyncStatus('synced');
            setDeliveryState('PUBLISHED');
          } else if (res.failedCount > 0) {
            setCloudSyncStatus('error');
            const errDetail = res.errors[0] || 'Koneksi internet tidak stabil';
            setCloudSyncError(errDetail);
          } else {
            setCloudSyncStatus('synced');
            setDeliveryState('PUBLISHED');
          }
        } catch (syncErr: any) {
          console.warn('[ReviewResultModal] Background sync notice:', syncErr);
          setCloudSyncStatus('error');
          setCloudSyncError(syncErr.message || 'Offline • Disimpan di perangkat');
        } finally {
          isSyncRunningRef.current = false;
        }
      } catch (err: any) {
        console.error('[ReviewResultModal] Delivery flow error:', err);
        setDeliveryError(err.message || 'Gagal menyimpan foto');
      }
    },
    [
      generateQrCode,
      composedPhotoUrl,
      composedGifUrl,
      rawShots,
      currentEvent,
      isDemoMode,
      user,
      backendUrl,
    ]
  );

  useEffect(() => {
    if (!isReviewOpen || !composedPhotoUrl) return;

    const newId = `mob_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setPhotoId(newId);
    executeDeliveryFlow(newId);
  }, [isReviewOpen, composedPhotoUrl, executeDeliveryFlow]);

  if (!isReviewOpen || !composedPhotoUrl) return null;

  const handleFinishNew = () => {
    resetRawShots();
    setIsReviewOpen(false);
    setPhase('kiosk');
  };

  const handleBackToSetup = () => {
    resetRawShots();
    setIsReviewOpen(false);
    setPhase('setup');
  };

  const handleRetryQr = () => {
    if (photoId) {
      generateQrCode(photoId);
    }
  };

  const handleRetrySync = async () => {
    if (!user?.token || isDemoMode || isSyncRunningRef.current) return;
    try {
      isSyncRunningRef.current = true;
      setCloudSyncStatus('uploading');
      const res = await syncPendingCaptures(backendUrl, user.token, false);
      if (res.syncedCount > 0 || res.failedCount === 0) {
        setCloudSyncStatus('synced');
      } else {
        setCloudSyncStatus('error');
        setCloudSyncError(res.errors[0] || 'Gagal menghubungkan ke cloud');
      }
    } catch (err: any) {
      setCloudSyncStatus('error');
      setCloudSyncError(err.message || 'Koneksi gagal');
    } finally {
      isSyncRunningRef.current = false;
    }
  };

  const handlePrint = () => {
    if (isDemoMode) return;
    window.print();
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    let targetUrl = composedPhotoUrl;
    let ext = 'jpg';
    if (activeTab === 'gif' && composedGifUrl) {
      targetUrl = composedGifUrl;
      ext = 'gif';
    } else if (activeTab === 'original' && rawShots[selectedRawIndex]?.dataUrl) {
      targetUrl = rawShots[selectedRawIndex].dataUrl;
      ext = 'jpg';
    }

    link.download = `minglebooth_${photoId || 'capture'}_${activeTab}.${ext}`;
    link.href = targetUrl;
    link.click();
  };

  const handleNativeShare = async () => {
    let fileUrl = composedPhotoUrl;
    let mime = 'image/jpeg';
    let ext = 'jpg';

    if (activeTab === 'gif' && composedGifUrl) {
      fileUrl = composedGifUrl;
      mime = 'image/gif';
      ext = 'gif';
    } else if (activeTab === 'original' && rawShots[selectedRawIndex]?.dataUrl) {
      fileUrl = rawShots[selectedRawIndex].dataUrl;
      mime = 'image/jpeg';
      ext = 'jpg';
    }

    if (navigator.share) {
      try {
        const res = await fetch(fileUrl);
        const blob = await res.blob();
        const file = new File([blob], `minglebooth_${photoId}.${ext}`, { type: mime });
        await navigator.share({
          title: `MingleBooth - ${currentEvent.name}`,
          text: `Foto dari ${currentEvent.name}!`,
          files: [file],
        });
      } catch (err) {
        console.warn('Native share dismissed or failed:', err);
      }
    } else {
      handleDownload();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#090A0C] text-[#EDEDED] flex flex-col font-sans select-none overflow-y-auto antialiased animate-fade-in">
      {/* ── 1. Top Header Bar (1:1 Visual Reference) ── */}
      <header className="sticky top-0 z-40 px-2.5 sm:px-6 py-2.5 sm:py-3 bg-[#090A0C]/95 backdrop-blur-md border-b border-white/[0.08] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <img
            src={logoHeader}
            alt="MingleBooth"
            className="h-5 sm:h-7 w-auto object-contain shrink-0"
            onError={(e) => {
              const target = e.target as HTMLElement;
              target.style.display = 'none';
              const fallback = target.nextElementSibling as HTMLElement;
              if (fallback) fallback.style.display = 'flex';
            }}
          />
          {/* Robust Fallback Logo in case image fails */}
          <div
            className="items-center gap-1 text-white font-bold text-sm tracking-tight shrink-0"
            style={{ display: 'none' }}
          >
            <span>mingle</span>
            <span className="text-purple-400">booth</span>
          </div>
          {/* Screen reader label */}
          <span className="sr-only">Foto Berhasil Diambil</span>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsEventQrModalOpen(true)}
            className="h-8 sm:h-9 px-2 sm:px-3 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 text-[11px] sm:text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
            title="Tampilkan QR Galeri untuk seluruh album acara"
          >
            <QrCode className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">QR Galeri</span>
          </button>

          <button
            type="button"
            onClick={handleBackToSetup}
            className="h-8 sm:h-9 px-2 sm:px-3 rounded-xl bg-[#14151a] hover:bg-[#1c1d24] border border-white/10 text-white text-[11px] sm:text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
            title="Kembali ke Layar Pengaturan"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-white" />
            <span>Pengaturan</span>
          </button>

          <button
            type="button"
            onClick={() => setIsGalleryOpen(true)}
            className="h-8 sm:h-9 px-2 sm:px-3 rounded-xl bg-[#14151a] hover:bg-[#1c1d24] border border-white/10 text-white text-[11px] sm:text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
            title="Buka Galeri Acara"
          >
            <Images className="w-3.5 h-3.5 text-white" />
            <span className="hidden sm:inline">Galeri Acara</span>
            <span className="sm:hidden">Galeri</span>
          </button>

          <span className="text-xs text-neutral-400 font-mono hidden md:inline px-2">
            Reset dalam {reviewCountdown}s
          </span>

          <button
            type="button"
            onClick={handleFinishNew}
            className="h-8 sm:h-9 px-2.5 sm:px-4 rounded-xl bg-white hover:bg-neutral-200 text-black font-bold text-[11px] sm:text-xs transition-all shadow-md active:scale-98 cursor-pointer shrink-0"
          >
            Foto Tamu Berikutnya
          </button>
        </div>
      </header>

      {/* ── 2. Main Content Canvas: Scrollable, Unclipped Frame & Action Card ── */}
      <main className="flex-1 w-full max-w-5xl mx-auto flex flex-col md:flex-row landscape:flex-row items-center md:items-start justify-center gap-4 sm:gap-6 px-3 sm:px-6 py-4">
        {/* Left Column (or Top in portrait): Result Mode Selector & Full Unclipped Frame */}
        <div className="w-full max-w-[440px] flex flex-col items-center gap-3 shrink-0">
          {/* Result Mode Switcher: Foto Cetak | Animasi GIF | Foto Original */}
          <div className="inline-flex items-center p-1 rounded-2xl bg-[#14161d] border border-white/10 shadow-lg gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('photo')}
              className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'photo'
                  ? 'bg-white text-black shadow-sm font-bold'
                  : 'text-neutral-300 hover:text-white'
              }`}
            >
              <ImageIcon className="w-4 h-4" />
              <span>Foto Cetak</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('gif')}
              className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'gif'
                  ? 'bg-white text-black shadow-sm font-bold'
                  : 'text-neutral-300 hover:text-white'
              }`}
            >
              <Film className="w-4 h-4" />
              <span>Animasi GIF</span>
            </button>

            <div className="h-4 w-[1px] bg-white/15 mx-0.5" />

            <button
              type="button"
              onClick={() => setActiveTab('original')}
              className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'original'
                  ? 'bg-white text-black shadow-sm font-bold'
                  : 'text-neutral-300 hover:text-white'
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>Foto Original{rawShots.length > 1 ? ` (${rawShots.length})` : ''}</span>
            </button>
          </div>

          {/* Sub-selector for raw poses if original tab is selected */}
          {activeTab === 'original' && rawShots.length > 1 && (
            <div className="flex items-center gap-1.5 bg-white/[0.04] p-1 rounded-xl border border-white/[0.08] overflow-x-auto max-w-full shrink-0">
              {rawShots.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedRawIndex(idx)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                    selectedRawIndex === idx
                      ? 'bg-white text-black font-semibold shadow-sm'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Pose {idx + 1}
                </button>
              ))}
            </div>
          )}

          {/* Photo Frame Container (Full Containment, Uncut Wedding Details) */}
          <div className="w-full rounded-3xl bg-black border border-white/[0.12] overflow-hidden shadow-2xl flex items-center justify-center p-1 transition-all duration-300">
            {activeTab === 'photo' ? (
              <img
                src={composedPhotoUrl}
                alt="Hasil Foto Cetak"
                className="w-full h-auto max-h-[46vh] sm:max-h-[55vh] md:max-h-[68vh] object-contain rounded-[22px] block select-none"
              />
            ) : activeTab === 'gif' ? (
              composedGifUrl ? (
                <img
                  src={composedGifUrl}
                  alt="Hasil Boomerang GIF"
                  className="w-full h-auto max-h-[46vh] sm:max-h-[55vh] md:max-h-[68vh] object-contain rounded-[22px] block select-none"
                />
              ) : (
                <div className="w-full h-48 flex flex-col items-center justify-center text-neutral-400 text-xs">
                  <Film className="w-8 h-8 mb-2 opacity-50" />
                  <span>Animasi GIF tidak tersedia</span>
                </div>
              )
            ) : (
              <img
                src={rawShots[selectedRawIndex]?.dataUrl || composedPhotoUrl}
                alt={`Pose Original ${selectedRawIndex + 1}`}
                className="w-full h-auto max-h-[46vh] sm:max-h-[55vh] md:max-h-[68vh] object-contain rounded-[22px] block select-none"
              />
            )}
          </div>

          {/* Immediate Action Buttons for Cetak Foto & Tampilkan QR Galeri in Portrait */}
          <div className="w-full grid grid-cols-2 gap-2 mt-2 md:hidden">
            <button
              type="button"
              onClick={() => setIsPrintModalOpen(true)}
              className={`h-11 sm:h-12 rounded-xl font-bold text-xs sm:text-sm tracking-wide flex items-center justify-center gap-1.5 shadow-lg transition-all active:scale-98 cursor-pointer ${
                isDemoMode
                  ? 'bg-[#18140f] border border-amber-600/80 text-amber-400'
                  : 'bg-white hover:bg-neutral-200 text-black'
              }`}
              title={isDemoMode ? 'Fitur Cetak Foto (Demo)' : 'Cetak Foto (Berbingkai / Original)'}
            >
              {isDemoMode ? (
                <Lock className="w-4 h-4 text-amber-400 shrink-0" />
              ) : (
                <Printer className="w-4 h-4 text-black shrink-0" />
              )}
              <span className="truncate">{isDemoMode ? 'Cetak (Demo)' : 'Cetak Foto'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsEventQrModalOpen(true)}
              className="h-11 sm:h-12 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 font-bold text-xs sm:text-sm tracking-wide flex items-center justify-center gap-1.5 shadow-lg transition-all active:scale-98 cursor-pointer"
              title="Tampilkan QR Galeri untuk seluruh album acara"
            >
              <QrCode className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="truncate">Tampilkan QR Galeri</span>
            </button>
          </div>
        </div>

        {/* Right Column (or Bottom in portrait): QR Unduh Tamu / Demo Info Panel & Actions */}
        <div className="w-full max-w-[440px] flex flex-col items-center justify-center gap-4 sm:gap-5 p-5 sm:p-6 rounded-3xl bg-[#0e1015] border border-white/10 shadow-2xl shrink-0">
          {/* Card Title: Cyan QR Icon + QR UNDUH TAMU */}
          <div className="flex items-center gap-2 text-[#00e5ff] font-bold tracking-wider text-sm sm:text-base uppercase select-none">
            <QrCode className="w-5 h-5 text-[#00e5ff]" />
            <span>QR UNDUH TAMU</span>
          </div>

          {isDemoMode || deliveryState === 'DEMO_SAVED' ? (
            /* Panel Informasi Mode Demo (Unduh Tamu Tidak Aktif) */
            <div className="w-full flex flex-col items-center justify-center text-center p-5 rounded-2xl bg-amber-500/[0.04] border border-amber-500/20 shadow-inner gap-3.5">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shadow-md">
                <Lock className="w-6 h-6 sm:w-7 sm:h-7 text-amber-400" />
              </div>
              <div className="space-y-1.5 max-w-xs">
                <h3 className="text-base font-bold text-white tracking-tight">
                  Unduh Tamu Tidak Aktif
                </h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  QR unduh dan galeri publik tersedia setelah Anda mengaktifkan langganan MingleBooth. Foto demo hanya untuk pratinjau lokal dan tidak dipublikasikan.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAuthOpen(true)}
                className="w-full h-10 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
                title="Buka portal langganan untuk mengaktifkan seluruh fitur berbayar"
              >
                <ShieldCheck className="w-4 h-4 text-black" />
                <span>Aktifkan Langganan</span>
              </button>
            </div>
          ) : (
            <>
              {/* QR Code Container in Paid Mode */}
              <div className="p-3.5 bg-white rounded-2xl shadow-lg flex items-center justify-center">
                {deliveryState === 'QR_READY' && qrUrl ? (
                  <img
                    src={qrUrl}
                    alt="Scan QR Code"
                    className="w-48 h-48 sm:w-52 sm:h-52 object-contain"
                  />
                ) : qrStatus === 'generating' ? (
                  <div className="w-48 h-48 sm:w-52 sm:h-52 flex flex-col items-center justify-center bg-slate-100 rounded-xl gap-2 p-3 text-center">
                    <RefreshCw className="w-6 h-6 text-neutral-600 animate-spin" />
                    <span className="text-xs font-semibold text-slate-700">Menyiapkan QR...</span>
                  </div>
                ) : (
                  <div className="w-48 h-48 sm:w-52 sm:h-52 bg-neutral-100 rounded-xl flex flex-col items-center justify-center p-3 text-center gap-2">
                    <AlertTriangle className="w-6 h-6 text-amber-500" />
                    <span className="text-xs font-semibold text-neutral-800">Gagal Membuat QR</span>
                    <button
                      type="button"
                      onClick={handleRetryQr}
                      className="px-3 py-1 bg-black text-white text-[11px] rounded-lg font-medium cursor-pointer"
                    >
                      Coba Lagi
                    </button>
                  </div>
                )}
              </div>

              <div className="text-center space-y-1">
                <h3 className="text-sm sm:text-base font-bold text-white">Scan QR untuk Unduh Foto</h3>
                <p className="text-xs text-neutral-400 max-w-xs leading-relaxed">
                  Arahkan kamera smartphone untuk menyimpan foto & animasi langsung ke HP.
                </p>

                {/* Delivery / Storage Status Badge (Real state, no false claims) */}
                <div className="pt-1 flex flex-col items-center gap-1">
                  {cloudSyncStatus === 'synced' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-medium text-emerald-300">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      Terpublikasi ke Cloud
                    </span>
                  ) : cloudSyncStatus === 'uploading' ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-500/15 border border-sky-500/30 text-[10px] font-medium text-sky-300">
                      <RefreshCw className="w-3 h-3 text-sky-400 animate-spin" />
                      Mengunggah ke Cloud...
                    </span>
                  ) : cloudSyncStatus === 'error' ? (
                    <div className="flex items-center gap-1.5">
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[10px] font-medium text-amber-300"
                        title={cloudSyncError || undefined}
                      >
                        <AlertTriangle className="w-3 h-3 text-amber-400" />
                        Tersimpan di Perangkat (Offline)
                      </span>
                      <button
                        type="button"
                        onClick={handleRetrySync}
                        className="text-[10px] text-neutral-300 hover:text-white underline cursor-pointer"
                      >
                        Sinkronkan
                      </button>
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-[10px] font-mono text-neutral-300">
                      Tersimpan di Perangkat
                    </span>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Action Buttons */}
          <div className="w-full space-y-2.5 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(true)}
                className={`h-11 sm:h-12 rounded-xl font-bold text-xs sm:text-sm tracking-wider uppercase flex items-center justify-center gap-1.5 shadow-lg transition-all ${
                  isDemoMode
                    ? 'bg-[#18140f] border border-amber-600/80 text-amber-400 cursor-pointer'
                    : 'bg-white hover:bg-neutral-200 text-black active:scale-98 cursor-pointer'
                }`}
                title={isDemoMode ? 'Fitur Cetak Foto (Demo)' : 'Cetak Foto (Berbingkai / Original)'}
              >
                {isDemoMode ? (
                  <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                ) : (
                  <Printer className="w-4 h-4 text-black shrink-0" />
                )}
                <span className="truncate">{isDemoMode ? 'Cetak (Demo)' : 'Cetak Foto'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsEventQrModalOpen(true)}
                className="h-11 sm:h-12 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/10 text-white font-bold text-xs sm:text-sm tracking-wider uppercase flex items-center justify-center gap-1.5 shadow-lg transition-all active:scale-98 cursor-pointer"
                title="Tampilkan QR Galeri untuk seluruh album acara"
              >
                <QrCode className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="truncate">Tampilkan QR Galeri</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleFinishNew}
              className="w-full h-11 sm:h-12 rounded-xl bg-[#14161d] hover:bg-[#1c1e28] border border-white/10 text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors active:scale-98 cursor-pointer"
            >
              <span>Foto Tamu Berikutnya</span>
              <ChevronRight className="w-4 h-4 text-neutral-400" />
            </button>

            {/* Sub-actions */}
            <div className="flex items-center justify-between pt-1 text-[11px] text-neutral-400 px-1">
              {rawShots.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsRetakeMenuOpen(!isRetakeMenuOpen)}
                  className="hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3 text-amber-400" />
                  <span>Ulangi Pose</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleNativeShare}
                className="hover:text-white flex items-center gap-1 transition-colors ml-auto cursor-pointer"
              >
                <Share2 className="w-3 h-3 text-sky-400" />
                <span>Bagikan</span>
              </button>
            </div>

            {/* Targeted Retake Menu */}
            {isRetakeMenuOpen && (
              <div className="mt-2 p-3 rounded-2xl bg-black/80 border border-white/10 animate-scale-in">
                <p className="text-[11px] font-semibold text-neutral-300 mb-2">
                  Pilih pose yang ingin diulang:
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {rawShots.map((shot, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        retakeSlot(shot.index);
                      }}
                      className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-white/30 text-xs text-neutral-200 hover:text-white font-medium flex items-center justify-center gap-1 transition cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3 text-amber-400" />
                      <span>Pose {idx + 1}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Hidden Print Mount (strictly hidden in screen mode to prevent duplicate frame rendering) */}
      {composedPhotoUrl && (
        <div id="minglebooth-print-mount" style={{ display: 'none' }}>
          <style>{`
            #minglebooth-print-mount { display: none !important; }
            @media print {
              @page { size: auto; margin: 0mm !important; }
              html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
              body > * { display: none !important; }
              #minglebooth-print-mount { display: flex !important; position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important; align-items: center !important; justify-content: center !important; }
              #minglebooth-print-mount img { max-width: 100% !important; max-height: 100% !important; object-fit: contain !important; }
            }
          `}</style>
          <img src={composedPhotoUrl} alt="Print Preview" />
        </div>
      )}

      {/* Print Choice Modal (Berbingkai vs Original with Full Status Transitions) */}
      <PrintChoiceModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        compositePhotoUrl={composedPhotoUrl}
        rawShots={rawShots}
        isDemoMode={isDemoMode}
        onOpenSubscription={() => setIsAuthOpen(true)}
      />

      {/* Event Gallery QR Modal (Full Album QR Code for Guests & Operators) */}
      <EventGalleryQrModal
        isOpen={isEventQrModalOpen}
        onClose={() => setIsEventQrModalOpen(false)}
        eventId={currentEvent.id}
        eventName={currentEvent.name}
        backendUrl={backendUrl}
        isDemoMode={isDemoMode}
        onOpenSubscription={() => setIsAuthOpen(true)}
      />
    </div>
  );
};
