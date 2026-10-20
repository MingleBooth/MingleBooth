import React, { useState, useEffect } from 'react';
import { QRGenerator } from '@minglebooth/photo-engine';
import { QrCode, X, Copy, Check, Lock, ShieldCheck } from 'lucide-react';

export interface EventGalleryQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  eventName: string;
  backendUrl?: string;
  isDemoMode: boolean;
  onOpenSubscription?: () => void;
}

export const EventGalleryQrModal: React.FC<EventGalleryQrModalProps> = ({
  isOpen,
  onClose,
  eventId,
  eventName,
  backendUrl,
  isDemoMode,
  onOpenSubscription,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [galleryUrl, setGalleryUrl] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  const isDemo =
    isDemoMode ||
    !eventId ||
    eventId === 'evt_demo_tablet' ||
    eventId === 'evt_demo_mobile' ||
    eventId === 'default_event';

  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
      return;
    }

    if (isDemo) {
      setQrDataUrl('');
      setGalleryUrl('');
      return;
    }

    const cleanBase = (backendUrl || 'https://www.minglebooth.id').replace(/\/+$/, '');
    const url = QRGenerator.buildEventGalleryUrl(cleanBase, eventId);
    setGalleryUrl(url);

    setIsGenerating(true);
    QRGenerator.generateDataUrl(url, {
      width: 320,
      margin: 1,
      darkColor: '#000000',
      lightColor: '#FFFFFF',
    })
      .then((data) => {
        setQrDataUrl(data);
      })
      .catch((err) => {
        console.error('[EventGalleryQrModal Desktop] Failed to generate event QR:', err);
      })
      .finally(() => {
        setIsGenerating(false);
      });
  }, [isOpen, eventId, backendUrl, isDemo]);

  if (!isOpen) return null;

  const handleCopyLink = async () => {
    if (!galleryUrl) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(galleryUrl);
      } else {
        const input = document.createElement('input');
        input.value = galleryUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.warn('Failed to copy to clipboard:', err);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 select-none animate-fadeIn font-sans"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-w-md w-full bg-[#101216] border border-white/15 rounded-3xl p-6 sm:p-7 flex flex-col items-center gap-5 shadow-2xl relative text-center"
      >
        {/* Close Button Top Right */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/[0.08] hover:bg-white/[0.15] text-neutral-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          title="Tutup"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex flex-col items-center gap-1.5 pt-1">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-1 shadow-inner">
            {isDemo ? <Lock className="w-6 h-6 text-amber-400" /> : <QrCode className="w-6 h-6 text-cyan-400" />}
          </div>
          <h3 className="text-lg font-bold text-white tracking-tight">
            {isDemo ? 'QR Galeri Acara Belum Aktif' : 'QR Galeri Seluruh Acara'}
          </h3>
          <span className="px-2.5 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-[11px] font-medium text-neutral-300 max-w-xs truncate">
            {eventName || 'Acara Photobooth'}
          </span>
        </div>

        {isDemo ? (
          /* Demo Mode Notice */
          <div className="w-full flex flex-col items-center gap-4 py-2">
            <div className="p-4 rounded-2xl bg-amber-500/[0.06] border border-amber-500/25 text-neutral-300 text-xs leading-relaxed max-w-sm">
              <p className="font-semibold text-amber-300 mb-1">Fitur Berbayar: Galeri Cloud Acara</p>
              <p className="text-neutral-400">
                QR galeri publik untuk seluruh album acara ini hanya tersedia setelah Anda mengaktifkan langganan MingleBooth. Sesi foto demo hanya disimpan secara lokal di laptop untuk pengujian.
              </p>
            </div>

            {onOpenSubscription && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSubscription();
                }}
                className="w-full h-11 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-98 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-black" />
                <span>Aktifkan Langganan Sekarang</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-full h-10 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-white font-medium text-xs transition-colors cursor-pointer"
            >
              Tutup
            </button>
          </div>
        ) : (
          /* Paid Active Mode: Display Real Deterministic QR */
          <div className="w-full flex flex-col items-center gap-4">
            <p className="text-xs text-neutral-400 max-w-xs leading-relaxed">
              Tamu dapat memindai QR code ini kapan saja untuk membuka dan mengunduh seluruh album foto acara ini.
            </p>

            {/* High-Contrast QR Code Card */}
            <div className="p-4 bg-white rounded-2xl shadow-xl flex items-center justify-center">
              {isGenerating ? (
                <div className="w-52 h-52 flex flex-col items-center justify-center text-black text-xs font-mono">
                  Memuat QR...
                </div>
              ) : qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="QR Galeri Acara"
                  className="w-52 h-52 object-contain block"
                />
              ) : (
                <div className="w-52 h-52 flex flex-col items-center justify-center text-neutral-600 text-xs">
                  Gagal membuat QR
                </div>
              )}
            </div>

            {/* Gallery URL pill */}
            <div className="w-full max-w-sm px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-[11px] font-mono text-neutral-300 break-all select-all">
              {galleryUrl}
            </div>

            {/* Action Buttons */}
            <div className="w-full flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={handleCopyLink}
                className="w-full h-11 rounded-xl bg-white hover:bg-neutral-200 text-black font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-98 cursor-pointer"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-black" />}
                <span>{copied ? 'Link Galeri Berhasil Disalin!' : 'Salin Link Galeri'}</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full h-10 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-white font-semibold text-xs transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
