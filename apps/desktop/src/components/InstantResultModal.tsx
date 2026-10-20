import React, { useState } from 'react';
import { usePhotoboothStore } from '../store/photobooth-store';
import { RotateCcw, Printer, Wifi, WifiOff, Film, ArrowRight, Check, Image as ImageIcon, Lock, ShieldCheck, QrCode } from 'lucide-react';
import { PrintChoiceModal } from './PrintChoiceModal';
import { EventGalleryQrModal } from './EventGalleryQrModal';

export const InstantResultModal: React.FC = () => {
  const {
    sessionStep,
    lastCompositePhoto,
    currentEvent,
    confirmSession,
    retakeSession,
    isOnline,
  } = usePhotoboothStore();

  const [previewTab, setPreviewTab] = useState<'photo' | 'gif'>('photo');
  const [printBlockedNotice, setPrintBlockedNotice] = useState<string | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
  const [isEventQrModalOpen, setIsEventQrModalOpen] = useState<boolean>(false);

  // Authoritative demo determination from storage and signed token payload
  const token = typeof window !== 'undefined' ? localStorage.getItem('mb_license_token') : null;
  let isDemoFromToken = false;
  if (token) {
    try {
      const parsed = JSON.parse(atob(token));
      if (parsed?.payload?.isDemo) isDemoFromToken = true;
    } catch {
      isDemoFromToken = false;
    }
  }
  const isDemoMode = (typeof window !== 'undefined' && localStorage.getItem('mb_is_demo') === 'true') || isDemoFromToken;

  if (sessionStep !== 'review' || !lastCompositePhoto) return null;

  const hasGif = Boolean(lastCompositePhoto.gifDataUrl || lastCompositePhoto.isGifAvailable);
  const currentDisplayImage =
    previewTab === 'gif' && lastCompositePhoto.gifDataUrl
      ? lastCompositePhoto.gifDataUrl
      : lastCompositePhoto.dataUrl;

  const fileSizeKb = Math.round((lastCompositePhoto.fileSizeBytes || 350000) / 1024);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col md:flex-row select-none bg-[#0C0D0F] overflow-y-auto md:overflow-hidden animate-fadeIn"
    >
      {/* ── Left: Photo / GIF Display ── */}
      <div className="flex-1 min-h-[340px] md:min-h-0 flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 border-b md:border-b-0 md:border-r border-white/[0.06] bg-[#0E0F12]">
        {/* Preview Tab Selector (Photo vs GIF) */}
        {hasGif && (
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 mb-3 z-10 shadow-lg">
            <button
              onClick={() => setPreviewTab('photo')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                previewTab === 'photo'
                  ? 'bg-white text-black shadow'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Foto Cetak</span>
            </button>

            <button
              onClick={() => setPreviewTab('gif')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                previewTab === 'gif'
                  ? 'bg-emerald-500 text-black shadow font-bold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>Animasi GIF</span>
            </button>
          </div>
        )}

        <div className="relative max-h-full max-w-full flex items-center justify-center">
          <img
            key={currentDisplayImage}
            src={currentDisplayImage}
            alt="Photobooth Result"
            className="max-h-[45vh] sm:max-h-[55vh] md:max-h-[calc(100vh-140px)] max-w-full w-auto object-contain rounded-lg shadow-2xl animate-fadeIn"
          />
        </div>
      </div>

      {/* ── Right: Info & Actions Panel ── */}
      <div className="w-full md:w-[380px] lg:w-[420px] flex-shrink-0 flex flex-col p-5 sm:p-8 md:p-10 gap-5 sm:gap-7 overflow-y-auto bg-[#0C0D0F]">
        {/* QR Code / Demo Information Panel */}
        {isDemoMode ? (
          <div className="w-full flex flex-col items-center justify-center text-center p-6 rounded-2xl bg-amber-500/[0.05] border border-amber-500/25 shadow-inner gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shadow-lg">
              <Lock className="w-7 h-7 text-amber-400" />
            </div>
            <div className="space-y-1.5 max-w-xs">
              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Unduh Tamu Tidak Aktif
              </h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                QR unduh dan galeri publik tersedia setelah Anda mengaktifkan langganan MingleBooth. Foto demo hanya untuk pratinjau lokal dan tidak dipublikasikan.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const billingUrl = 'https://www.minglebooth.id/billing';
                if (typeof window !== 'undefined' && (window as any).electronAPI?.openExternal) {
                  (window as any).electronAPI.openExternal(billingUrl);
                } else {
                  window.open(billingUrl, '_blank');
                }
              }}
              className="w-full h-10 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-black" />
              <span>Aktifkan Langganan</span>
            </button>
          </div>
        ) : (
          <>
            <div>
              <p className="text-[10px] sm:text-[11px] font-mono tracking-widest text-neutral-400 uppercase mb-1">
                {hasGif ? 'Foto & Animasi GIF Siap' : 'Photo Capture Complete'}
              </p>
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight leading-tight">
                Scan untuk Download
              </h2>
              <p className="text-xs sm:text-sm text-neutral-400 mt-1 sm:mt-1.5 leading-relaxed">
                Arahkan kamera HP ke QR code untuk melihat &amp; mengunduh foto komposit, animasi GIF, dan foto original.
              </p>
            </div>

            {/* QR Code Card */}
            <div className="bg-white rounded-xl p-4 sm:p-5 flex flex-col items-center gap-2.5 shadow-lg">
              <img
                src={lastCompositePhoto.qrDataUrl}
                alt="QR Code"
                className="w-40 h-40 sm:w-48 sm:h-48 object-contain"
              />
              <p className="text-[10px] font-mono text-neutral-500 text-center break-all leading-normal max-w-[220px]">
                {lastCompositePhoto.qrUrl}
              </p>
            </div>
          </>
        )}

        {/* Meta Stats Row */}
        <div className="grid grid-cols-2 gap-2.5">
          <MetaCell label="Ukuran" value={`${fileSizeKb} KB`} />
          <MetaCell
            label="Status Cloud"
            value={isDemoMode ? 'Terkunci (Demo)' : (isOnline ? 'Terupload (Online)' : 'Antrean (Offline)')}
            icon={isDemoMode
              ? <Lock className="w-3.5 h-3.5 text-amber-400" />
              : (isOnline
                ? <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                : <WifiOff className="w-3.5 h-3.5 text-amber-400" />
              )
            }
            accent={isDemoMode ? '#fbbf24' : (isOnline ? '#34d399' : '#fbbf24')}
          />
        </div>

        <div className="h-px bg-white/[0.06]" />

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5">
          {/* Print Blocked Alert Notice */}
          {printBlockedNotice && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2 animate-fadeIn">
              <Lock className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span className="leading-snug">{printBlockedNotice}</span>
            </div>
          )}

          {/* Primary Done Button */}
          <button
            id="btn-done-next-guest"
            onClick={confirmSession}
            className="w-full py-3.5 sm:py-4 px-5 rounded-xl bg-white hover:bg-neutral-200 text-black font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all active:scale-98 shadow-md"
          >
            <Check className="w-4 h-4" />
            <span>Selesai — Tamu Berikutnya</span>
            <ArrowRight className="w-3.5 h-3.5 ml-auto" />
          </button>

          {/* Secondary Buttons */}
          <div className="grid grid-cols-3 gap-2">
            <button
              id="btn-retake"
              onClick={retakeSession}
              className="py-2.5 sm:py-3 px-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white font-medium text-xs border border-white/[0.08] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retake</span>
            </button>

            <button
              id="btn-print"
              onClick={() => setIsPrintModalOpen(true)}
              className={`py-2.5 sm:py-3 px-2 rounded-lg font-medium text-xs border flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                isDemoMode
                  ? 'bg-amber-500/10 hover:bg-amber-500/15 border-amber-500/30 text-amber-300'
                  : 'bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white border-white/[0.08]'
              }`}
              title={isDemoMode ? 'Fitur Cetak Foto (Demo)' : 'Cetak Foto'}
            >
              {isDemoMode ? (
                <Lock className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Printer className="w-3.5 h-3.5 text-neutral-400" />
              )}
              <span className="truncate">{isDemoMode ? 'Cetak (Demo)' : 'Cetak Foto'}</span>
            </button>

            <button
              id="btn-event-qr"
              onClick={() => setIsEventQrModalOpen(true)}
              className="py-2.5 sm:py-3 px-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-neutral-300 hover:text-white font-medium text-xs border border-white/[0.08] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              title="Tampilkan QR Galeri untuk seluruh album acara"
            >
              <QrCode className="w-3.5 h-3.5 text-cyan-400" />
              <span className="truncate">QR Galeri</span>
            </button>
          </div>
        </div>
      </div>

      {/* Print Choice Modal */}
      {lastCompositePhoto && (
        <PrintChoiceModal
          isOpen={isPrintModalOpen}
          onClose={() => setIsPrintModalOpen(false)}
          compositePhotoUrl={lastCompositePhoto.dataUrl}
          rawShots={lastCompositePhoto.rawPhotos || []}
          isDemoMode={isDemoMode}
        />
      )}

      {/* Event Gallery QR Modal */}
      {currentEvent && (
        <EventGalleryQrModal
          isOpen={isEventQrModalOpen}
          onClose={() => setIsEventQrModalOpen(false)}
          eventId={currentEvent.id}
          eventName={currentEvent.name}
          isDemoMode={isDemoMode}
        />
      )}
    </div>
  );
};

const MetaCell: React.FC<{
  label: string;
  value: string;
  icon?: React.ReactNode;
  accent?: string;
}> = ({ label, value, icon, accent }) => (
  <div className="p-2.5 sm:p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] flex flex-col gap-0.5">
    <span className="text-[9px] sm:text-[10px] font-mono tracking-wider text-neutral-500 uppercase">
      {label}
    </span>
    <div className="flex items-center gap-1.5">
      {icon}
      <span className="text-xs sm:text-sm font-semibold truncate" style={{ color: accent || '#e2e8f0' }}>
        {value}
      </span>
    </div>
  </div>
);
