import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Camera,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  X,
  RotateCcw,
  Cpu,
} from 'lucide-react';

interface CameraDriverSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  cameraInfo?: {
    model?: string;
    instanceId?: string;
  } | null;
}

type DriverState =
  | 'IDLE'
  | 'DRIVER_SETUP_REQUIRED'
  | 'UAC_PENDING'
  | 'PREFLIGHT'
  | 'INSTALLING'
  | 'RESTARTING'
  | 'VERIFYING_PNP'
  | 'VERIFYING_LIBUSB'
  | 'VERIFYING_PTP'
  | 'READY'
  | 'FAILED'
  | 'ROLLBACK';

export const CameraDriverSetupModal: React.FC<CameraDriverSetupModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  cameraInfo,
}) => {
  const [driverState, setDriverState] = useState<DriverState>('DRIVER_SETUP_REQUIRED');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    // Listen to driver state events from main process
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.onDriverStateChange) {
      const unsubscribe = electronAPI.onDriverStateChange((data: { state: DriverState; payload?: any }) => {
        setDriverState(data.state);
        if (data.payload?.error) {
          setErrorMessage(data.payload.error);
        }
        if (data.state === 'READY') {
          setIsProcessing(false);
          if (onSuccess) onSuccess();
        }
      });
      return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
      };
    }
  }, [isOpen, onSuccess]);

  if (!isOpen) return null;

  const handleStartSetup = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    setDriverState('UAC_PENDING');

    try {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.startDriverSetup) {
        const result = await electronAPI.startDriverSetup();
        if (result.success) {
          setDriverState('READY');
          if (onSuccess) onSuccess();
        } else {
          setDriverState('FAILED');
          setErrorMessage(result.error || 'Konfigurasi driver gagal.');
        }
      } else {
        setErrorMessage('electronAPI.startDriverSetup tidak tersedia.');
        setDriverState('FAILED');
      }
    } catch (err: any) {
      setDriverState('FAILED');
      setErrorMessage(err.message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRollback = async () => {
    setIsProcessing(true);
    setDriverState('ROLLBACK');
    setErrorMessage(null);

    try {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.rollbackCameraDriver) {
        const result = await electronAPI.rollbackCameraDriver();
        if (result.success) {
          setDriverState('DRIVER_SETUP_REQUIRED');
          setStatusMessage('Driver default Windows (WPD/MTP) berhasil dikembalikan.');
        } else {
          setDriverState('FAILED');
          setErrorMessage(result.error || 'Rollback driver gagal.');
        }
      }
    } catch (err: any) {
      setDriverState('FAILED');
      setErrorMessage(err.message || 'Gagal melakukan rollback.');
    } finally {
      setIsProcessing(false);
    }
  };

  const cameraName = cameraInfo?.model || 'Sony ILCE-7CM2 (α7C II)';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-[#121316] border border-white/10 shadow-2xl">
        {/* Header decoration */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-500 via-emerald-400 to-indigo-500" />

        {/* Close button */}
        {!isProcessing && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="p-6 md:p-8 space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-blue-400 shadow-inner">
              <Camera className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                Setup Kamera Studio
              </span>
              <h2 className="text-lg font-bold text-white mt-1">Konfigurasi Port Kamera</h2>
              <p className="text-xs text-neutral-400">{cameraName}</p>
            </div>
          </div>

          {/* State Rendering */}
          {driverState === 'DRIVER_SETUP_REQUIRED' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/[0.08] space-y-2 text-xs text-neutral-300 leading-relaxed">
                <p>
                  Kamera <strong className="text-white">{cameraName}</strong> terdeteksi dalam mode{' '}
                  <strong className="text-white">PC Remote</strong>, namun Windows menguncinya dengan driver WPD/MTP bawaan.
                </p>
                <p>
                  MingleBooth perlu melakukan <strong className="text-emerald-400">satu kali pengaturan Windows</strong> agar kamera dapat memotret berkecepatan tinggi secara langsung tanpa aplikasi pihak ketiga.
                </p>
                <div className="pt-2 flex items-center gap-2 text-[11px] text-neutral-400 border-t border-white/[0.06]">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Aman, resmi dari Windows (WinUSB), dan dapat dikembalikan kapan saja.</span>
                </div>
              </div>

              {statusMessage && (
                <p className="text-xs text-emerald-400 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
                  ✓ {statusMessage}
                </p>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-white/10 text-neutral-300 hover:text-white hover:bg-white/[0.06] text-xs font-semibold transition-all"
                >
                  Nanti Saja
                </button>
                <button
                  type="button"
                  onClick={handleStartSetup}
                  className="px-5 py-2.5 rounded-xl bg-white hover:bg-neutral-200 text-black text-xs font-bold shadow-lg shadow-white/10 active:scale-95 transition-all flex items-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <span>Izinkan & Siapkan Kamera</span>
                </button>
              </div>
            </div>
          )}

          {/* Processing States (UAC, Preflight, Installing, Restarting, Verifying) */}
          {(driverState === 'UAC_PENDING' ||
            driverState === 'PREFLIGHT' ||
            driverState === 'INSTALLING' ||
            driverState === 'RESTARTING' ||
            driverState === 'VERIFYING_PNP' ||
            driverState === 'VERIFYING_LIBUSB' ||
            driverState === 'VERIFYING_PTP') && (
            <div className="py-6 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative w-16 h-16 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-2 border-white/10 border-t-blue-500 animate-spin" />
                <Cpu className="w-6 h-6 text-neutral-300" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-white">
                  {driverState === 'UAC_PENDING' && 'Menunggu Konfirmasi Windows (UAC)...'}
                  {driverState === 'PREFLIGHT' && 'Memeriksa Profil & Kompatibilitas Port...'}
                  {driverState === 'INSTALLING' && 'Mengonfigurasi Driver WinUSB Kamera...'}
                  {driverState === 'RESTARTING' && 'Memulai Ulang Port USB Kamera...'}
                  {driverState === 'VERIFYING_PNP' && 'Memverifikasi Status PnP Windows...'}
                  {driverState === 'VERIFYING_LIBUSB' && 'Menguji Akses Port libusb...'}
                  {driverState === 'VERIFYING_PTP' && 'Memverifikasi Respons PTP (Non-destructive)...'}
                </p>
                <p className="text-xs text-neutral-400 max-w-xs">
                  {driverState === 'UAC_PENDING'
                    ? 'Silakan klik tombol "Yes" atau "Ya" pada dialog Windows yang muncul.'
                    : 'Proses ini berlangsung secara otomatis tanpa mengoperasikan shutter kamera.'}
                </p>
              </div>
            </div>
          )}

          {/* Success State */}
          {driverState === 'READY' && (
            <div className="py-6 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-white">Kamera Siap Digunakan!</p>
                <p className="text-xs text-neutral-400 max-w-xs">
                  Port USB Sony ILCE-7CM2 telah terkonfigurasi. Anda dapat mulai memotret.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold shadow-lg transition-all"
              >
                Mulai Memotret
              </button>
            </div>
          )}

          {/* Failed State */}
          {driverState === 'FAILED' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 space-y-2 text-xs text-rose-300">
                <div className="flex items-center gap-2 font-semibold text-rose-200">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span>Pengaturan Driver Belum Berhasil</span>
                </div>
                <p className="text-[11px] leading-relaxed text-rose-300/90">
                  {errorMessage || 'Windows mengembalikan kode kesalahan saat mengonfigurasi driver.'}
                </p>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleRollback}
                  disabled={isProcessing}
                  className="px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-neutral-400 hover:text-white text-xs flex items-center gap-1.5 transition-all"
                  title="Kembalikan driver ke pengaturan default Windows (WPD)"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Rollback Driver</span>
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl text-neutral-400 hover:text-white text-xs transition-colors"
                  >
                    Tutup
                  </button>
                  <button
                    type="button"
                    onClick={handleStartSetup}
                    disabled={isProcessing}
                    className="px-4 py-2 rounded-xl bg-white hover:bg-neutral-200 text-black text-xs font-bold transition-all flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Coba Lagi</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Rollback Processing State */}
          {driverState === 'ROLLBACK' && (
            <div className="py-6 flex flex-col items-center justify-center text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-neutral-300 animate-spin" />
              <p className="text-xs text-neutral-300">Mengembalikan driver default Windows (WPD/MTP)...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
