import React, { useState } from 'react';
import {
  Printer,
  X,
  Image as ImageIcon,
  Camera,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Clock,
  Send,
  Lock,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';

export type PrintStep = 'idle' | 'preparing' | 'waiting' | 'sending' | 'accepted' | 'failed';

export interface RawShotItem {
  index: number;
  dataUrl: string;
}

export interface PrintChoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  compositePhotoUrl: string;
  rawShots?: (RawShotItem | string)[];
  isDemoMode: boolean;
  onOpenSubscription?: () => void;
  onPrintPhoto?: (targetUrl: string, printType: 'framed' | 'original', poseIndex?: number) => Promise<{ success: boolean; error?: string }>;
}

export const PrintChoiceModal: React.FC<PrintChoiceModalProps> = ({
  isOpen,
  onClose,
  compositePhotoUrl,
  rawShots = [],
  isDemoMode,
  onOpenSubscription,
  onPrintPhoto,
}) => {
  const [selectedPoseIndex, setSelectedPoseIndex] = useState<number>(0);
  const [printStep, setPrintStep] = useState<PrintStep>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  // Normalize raw shots to uniform dataUrl structure
  const normalizedRawShots: { index: number; dataUrl: string }[] = rawShots.map((shot, idx) => {
    if (typeof shot === 'string') {
      return { index: idx + 1, dataUrl: shot };
    }
    return { index: shot.index || idx + 1, dataUrl: shot.dataUrl };
  });

  const handleStartPrint = async (printType: 'framed' | 'original') => {
    if (isDemoMode) {
      setPrintStep('failed');
      setErrorMessage('Fitur Cetak Foto tersedia setelah langganan aktif.');
      return;
    }

    let targetUrl = compositePhotoUrl;
    if (printType === 'original') {
      if (normalizedRawShots.length > 0 && normalizedRawShots[selectedPoseIndex]?.dataUrl) {
        targetUrl = normalizedRawShots[selectedPoseIndex].dataUrl;
      } else {
        targetUrl = compositePhotoUrl;
      }
    }

    if (!targetUrl) {
      setPrintStep('failed');
      setErrorMessage('Berkas foto tidak ditemukan untuk dicetak.');
      return;
    }

    try {
      // 1. Step 1: Menyiapkan Gambar
      setPrintStep('preparing');
      setStatusMessage('Menyiapkan gambar resolusi penuh...');
      await new Promise((r) => setTimeout(r, 400));

      // 2. Step 2: Menunggu Printer
      setPrintStep('waiting');
      setStatusMessage('Menghubungkan ke layanan pencetak sistem...');
      await new Promise((r) => setTimeout(r, 400));

      // 3. Step 3: Mengirim Pekerjaan Cetak
      setPrintStep('sending');
      setStatusMessage('Mengirim pekerjaan cetak ke printer...');

      if (onPrintPhoto) {
        const res = await onPrintPhoto(targetUrl, printType, selectedPoseIndex);
        if (res && res.success === false) {
          throw new Error(res.error || 'Gagal mengirim pekerjaan cetak.');
        }
      } else if (typeof window !== 'undefined' && (window as any).electronAPI?.printPhoto) {
        const token = localStorage.getItem('mb_license_token');
        const res = await (window as any).electronAPI.printPhoto({
          filePath: targetUrl,
          copies: 1,
          silent: false,
          licenseToken: token,
        });
        if (res && res.success === false) {
          throw new Error(res.error || 'Gagal mengirim pekerjaan cetak ke printer.');
        }
      } else {
        // Fallback to browser print
        const printWin = window.open('', '_blank');
        if (printWin) {
          printWin.document.write(`
            <html>
              <head>
                <title>Cetak Foto MingleBooth</title>
                <style>
                  @page { margin: 0; size: auto; }
                  body { margin: 0; display: flex; align-items: center; justify-content: center; height: 100vh; background: #000; }
                  img { max-height: 100%; max-width: 100%; object-fit: contain; }
                </style>
              </head>
              <body>
                <img src="${targetUrl}" onload="window.print(); setTimeout(() => window.close(), 1000);" />
              </body>
            </html>
          `);
          printWin.document.close();
        }
      }

      // 4. Step 4: Pekerjaan Cetak Diterima
      setPrintStep('accepted');
      setStatusMessage('Pekerjaan cetak telah berhasil diterima oleh sistem pencetak.');
    } catch (err: any) {
      console.error('[PrintChoiceModal Desktop] Print error:', err);
      setPrintStep('failed');
      setErrorMessage(err?.message || 'Gagal mengirim pekerjaan cetak ke printer.');
    }
  };

  const handleReset = () => {
    setPrintStep('idle');
    setErrorMessage(null);
    setStatusMessage('');
  };

  const isBusy = printStep === 'preparing' || printStep === 'waiting' || printStep === 'sending';

  return (
    <div
      onClick={() => {
        if (!isBusy) onClose();
      }}
      className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 select-none animate-fadeIn font-sans"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-w-lg w-full bg-[#101216] border border-white/15 rounded-3xl p-5 sm:p-6 flex flex-col gap-4 sm:gap-5 shadow-2xl relative"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Printer className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Cetak Foto
              </h3>
              <p className="text-xs text-neutral-400">
                Pilih format hasil foto yang ingin Anda cetak
              </p>
            </div>
          </div>

          {!isBusy && (
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/[0.08] hover:bg-white/[0.15] text-neutral-300 hover:text-white flex items-center justify-center transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* ── MODE SELECTION (IDLE STATE) ── */}
        {printStep === 'idle' && (
          <div className="flex flex-col gap-3">
            {/* Demo Notice Banner */}
            {isDemoMode && (
              <div className="p-3.5 rounded-2xl bg-amber-500/[0.08] border border-amber-500/25 flex items-start gap-3 text-xs text-amber-200">
                <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-amber-300">Mode Demo: Cetak Terkunci</p>
                  <p className="text-[11px] text-neutral-300 leading-relaxed">
                    Fitur Cetak Foto ke printer fisik tersedia setelah Anda mengaktifkan paket langganan MingleBooth.
                  </p>
                  {onOpenSubscription && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenSubscription();
                      }}
                      className="mt-1 px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-[11px] flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Aktifkan Langganan</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Option 1: Cetak Foto Berbingkai */}
            <button
              type="button"
              disabled={isDemoMode}
              onClick={() => handleStartPrint('framed')}
              className={`w-full p-3.5 sm:p-4 rounded-2xl border text-left flex items-center gap-3.5 transition-all group ${
                isDemoMode
                  ? 'bg-white/[0.02] border-white/[0.06] opacity-60 cursor-not-allowed'
                  : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 hover:border-cyan-500/50 hover:shadow-lg cursor-pointer active:scale-98'
              }`}
            >
              {/* Thumbnail Frame Preview */}
              <div className="w-16 h-20 sm:w-20 sm:h-24 rounded-xl bg-black border border-white/10 overflow-hidden flex items-center justify-center shrink-0 p-0.5">
                <img
                  src={compositePhotoUrl}
                  alt="Foto Berbingkai"
                  className="w-full h-full object-contain rounded-lg"
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs sm:text-sm font-bold text-white group-hover:text-cyan-300 transition-colors">
                    Cetak Foto Berbingkai
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-[10px] font-semibold text-cyan-300">
                    Lengkap
                  </span>
                </div>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Cetak hasil komposit final lengkap dengan bingkai grafis, dekorasi, nama acara, dan tata letak siap cetak.
                </p>
              </div>

              <ChevronRight className="w-5 h-5 text-neutral-500 group-hover:text-cyan-400 transition-colors shrink-0" />
            </button>

            {/* Option 2: Cetak Foto Original */}
            <div
              className={`w-full p-3.5 sm:p-4 rounded-2xl border text-left flex flex-col gap-3 transition-all ${
                isDemoMode
                  ? 'bg-white/[0.02] border-white/[0.06] opacity-60'
                  : 'bg-white/[0.04] border-white/10'
              }`}
            >
              <div className="flex items-center gap-3.5">
                {/* Thumbnail Original Preview */}
                <div className="w-16 h-20 sm:w-20 sm:h-24 rounded-xl bg-black border border-white/10 overflow-hidden flex items-center justify-center shrink-0 p-0.5">
                  <img
                    src={normalizedRawShots[selectedPoseIndex]?.dataUrl || compositePhotoUrl}
                    alt="Foto Original"
                    className="w-full h-full object-contain rounded-lg"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs sm:text-sm font-bold text-white">
                      Cetak Foto Original
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-white/[0.08] border border-white/15 text-[10px] font-medium text-neutral-300">
                      Sensor Asli
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    Cetak berkas foto asli dari kamera tanpa bingkai atau tulisan pada rasio aspek dan resolusi penuh.
                  </p>
                </div>
              </div>

              {/* Sub-selector if multi-pose */}
              {normalizedRawShots.length > 1 && (
                <div className="flex items-center gap-1.5 pt-1 overflow-x-auto">
                  <span className="text-[11px] text-neutral-400 font-medium shrink-0">Pilih pose:</span>
                  {normalizedRawShots.map((shot, idx) => (
                    <button
                      key={idx}
                      type="button"
                      disabled={isDemoMode}
                      onClick={() => setSelectedPoseIndex(idx)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                        selectedPoseIndex === idx
                          ? 'bg-white text-black shadow-sm'
                          : 'bg-white/[0.06] text-neutral-400 hover:text-white border border-white/[0.08]'
                      }`}
                    >
                      Pose {shot.index || idx + 1}
                    </button>
                  ))}
                </div>
              )}

              {/* Action Button for Original */}
              <button
                type="button"
                disabled={isDemoMode}
                onClick={() => handleStartPrint('original')}
                className={`w-full h-10 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-98 ${
                  isDemoMode
                    ? 'bg-white/[0.06] text-neutral-500 cursor-not-allowed'
                    : 'bg-white hover:bg-neutral-200 text-black cursor-pointer'
                }`}
              >
                <Camera className="w-4 h-4" />
                <span>
                  Cetak Foto Original {normalizedRawShots.length > 1 ? `(Pose ${selectedPoseIndex + 1})` : ''}
                </span>
              </button>
            </div>

            {/* Cancel Button */}
            <button
              type="button"
              onClick={onClose}
              className="w-full h-11 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-white font-medium text-xs transition-colors cursor-pointer mt-1"
            >
              Batal
            </button>
          </div>
        )}

        {/* ── PROGRESS & STATUS VIEW (DURING / AFTER PRINT) ── */}
        {printStep !== 'idle' && (
          <div className="flex flex-col items-center text-center gap-4 py-4">
            {/* Status Icon */}
            <div className="w-16 h-16 rounded-3xl flex items-center justify-center shadow-lg transition-all">
              {printStep === 'preparing' && (
                <div className="w-16 h-16 rounded-3xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center">
                  <RefreshCw className="w-8 h-8 text-sky-400 animate-spin" />
                </div>
              )}
              {printStep === 'waiting' && (
                <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                  <Clock className="w-8 h-8 text-amber-400 animate-pulse" />
                </div>
              )}
              {printStep === 'sending' && (
                <div className="w-16 h-16 rounded-3xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center">
                  <Send className="w-8 h-8 text-purple-400 animate-bounce" />
                </div>
              )}
              {printStep === 'accepted' && (
                <div className="w-16 h-16 rounded-3xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                </div>
              )}
              {printStep === 'failed' && (
                <div className="w-16 h-16 rounded-3xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center">
                  <AlertCircle className="w-8 h-8 text-rose-400" />
                </div>
              )}
            </div>

            {/* Stepper Status Labels */}
            <div className="space-y-1 max-w-sm">
              <h4 className="text-base font-bold text-white">
                {printStep === 'preparing' && 'Menyiapkan Gambar...'}
                {printStep === 'waiting' && 'Menunggu Printer...'}
                {printStep === 'sending' && 'Mengirim Pekerjaan Cetak...'}
                {printStep === 'accepted' && 'Pekerjaan Cetak Diterima'}
                {printStep === 'failed' && 'Pekerjaan Cetak Gagal'}
              </h4>
              <p className="text-xs text-neutral-400 leading-relaxed">
                {statusMessage}
              </p>
              {printStep === 'accepted' && (
                <p className="text-[11px] text-neutral-500 leading-relaxed pt-1">
                  Catatan: Status ini menandakan perintah cetak telah diterima subsistem printer. Silakan periksa antrean printer fisik untuk pengambilan cetakan kertas.
                </p>
              )}
              {printStep === 'failed' && errorMessage && (
                <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/40 text-xs text-rose-200 mt-2 text-left">
                  {errorMessage}
                </div>
              )}
            </div>

            {/* Actions for Accepted or Failed */}
            {printStep === 'accepted' && (
              <button
                type="button"
                onClick={onClose}
                className="w-full h-11 px-4 rounded-xl bg-white hover:bg-neutral-200 text-black font-bold text-xs transition-all shadow-md active:scale-98 cursor-pointer mt-2"
              >
                Selesai
              </button>
            )}

            {printStep === 'failed' && (
              <div className="w-full flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex-1 h-11 rounded-xl bg-white hover:bg-neutral-200 text-black font-bold text-xs transition-all shadow-md active:scale-98 cursor-pointer"
                >
                  Coba Lagi
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 h-11 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 text-white font-semibold text-xs transition-colors cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
