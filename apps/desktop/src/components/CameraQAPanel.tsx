import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Shield,
  Camera,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  X,
  RotateCcw,
  Cpu,
  Monitor,
  HardDrive,
  Check,
  ChevronRight,
  Power,
  Image as ImageIcon,
} from 'lucide-react';

interface CameraQAPanelProps {
  onClose?: () => void;
}

type StageStatus = 'idle' | 'running' | 'pass' | 'fail';

export const CameraQAPanel: React.FC<CameraQAPanelProps> = ({ onClose }) => {
  // Test stages
  const [currentStageIndex, setCurrentStageIndex] = useState<number>(0);
  const [stages, setStages] = useState<{ [key: number]: StageStatus }>({
    1: 'idle',
    2: 'idle',
    3: 'idle',
    4: 'idle',
    5: 'idle',
    6: 'idle',
  });

  // State details
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>('Tekan "Mulai Tes Kamera" untuk memulai pemeriksaan otomatis.');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);

  // Camera & Profile
  const [cameraInfo, setCameraInfo] = useState<any>(null);
  const [cameraProfile, setCameraProfile] = useState<any>(null);

  // Capture
  const [awaitingCapturePrompt, setAwaitingCapturePrompt] = useState<boolean>(false);
  const [capturedImagePreview, setCapturedImagePreview] = useState<string | null>(null);
  const [capturedImageMeta, setCapturedImageMeta] = useState<{ name: string; size: number } | null>(null);

  // Test Mode State & Modals
  const [isTestModeEnabled, setIsTestModeEnabled] = useState<boolean | null>(null);
  const [showTestModeModal, setShowTestModeModal] = useState<boolean>(false);
  const [showRestoreNormalModal, setShowRestoreNormalModal] = useState<boolean>(false);
  const [rebootRequired, setRebootRequired] = useState<boolean>(false);
  const [rebootMessage, setRebootMessage] = useState<string>('');

  // Dedicated UAC Isolation Test State & Modals (Requirement D & E)
  const [showUacModal, setShowUacModal] = useState<boolean>(false);
  const [uacResult, setUacResult] = useState<{ success: boolean; message: string; details?: any } | null>(null);

  // Overall result
  const [testResult, setTestResult] = useState<'IDLE' | 'SUCCESS' | 'FAILED'>('IDLE');

  const electronAPI = (window as any).electronAPI;

  const setStageState = (stage: number, status: StageStatus) => {
    setStages((prev) => ({ ...prev, [stage]: status }));
  };

  // Check initial environment on mount
  useEffect(() => {
    let isMounted = true;
    const checkInitial = async () => {
      if (electronAPI?.qa?.checkEnvironment) {
        try {
          const env = await electronAPI.qa.checkEnvironment();
          if (isMounted) {
            setIsTestModeEnabled(env.testSigningEnabled === true);
          }
        } catch (_) {}
      }
    };
    checkInitial();
    return () => {
      isMounted = false;
    };
  }, []);

  // Reset test state
  const resetTest = () => {
    setStages({ 1: 'idle', 2: 'idle', 3: 'idle', 4: 'idle', 5: 'idle', 6: 'idle' });
    setCurrentStageIndex(0);
    setErrorMessage(null);
    setErrorDetails(null);
    setTestResult('IDLE');
    setAwaitingCapturePrompt(false);
    setCapturedImagePreview(null);
    setCapturedImageMeta(null);
    setStatusText('Siap melakukan pengujian kamera.');
  };

  // Step 1 -> Step 4 automated execution
  const runAutomatedSequence = async () => {
    resetTest();
    setIsRunning(true);

    try {
      // ─────────────────────────────────────────────────────────────
      // STAGE 1: Lingkungan Windows
      // ─────────────────────────────────────────────────────────────
      setCurrentStageIndex(1);
      setStageState(1, 'running');
      setStatusText('Memeriksa lingkungan komputer tablet...');

      let env: any = { passed: true, testSigningEnabled: true, requiresTestModePrompt: false };
      if (electronAPI?.qa?.checkEnvironment) {
        env = await electronAPI.qa.checkEnvironment();
      }

      setIsTestModeEnabled(env.testSigningEnabled === true);

      if (!env.passed) {
        setStageState(1, 'fail');
        setErrorMessage('Pemeriksaan komputer belum memenuhi syarat (pastikan Windows 64-bit).');
        setTestResult('FAILED');
        setIsRunning(false);
        return;
      }

      // Check if Test Mode is required before proceeding with driver
      // NOTE: DO NOT automatically trigger Test Signing. User must explicitly click "Siapkan Mode Pengujian".
      if (env.requiresTestModePrompt || env.testSigningEnabled === false) {
        setStageState(1, 'fail');
        setErrorMessage('Mode Pengujian Windows belum aktif. Driver percobaan MingleBooth memerlukan Mode Pengujian. Silakan tekan tombol "Siapkan Mode Pengujian" terlebih dahulu.');
        setTestResult('FAILED');
        setIsRunning(false);
        return;
      }

      setStageState(1, 'pass');

      // ─────────────────────────────────────────────────────────────
      // STAGE 2: Deteksi Kamera
      // ─────────────────────────────────────────────────────────────
      setCurrentStageIndex(2);
      setStageState(2, 'running');
      setStatusText('Memeriksa koneksi kamera USB...');

      let det: any = { detected: false, isSupported: false, camera: null, profile: null, vendorMessage: '', requiresDriverSetup: false };
      if (electronAPI?.qa?.detectCamera) {
        det = await electronAPI.qa.detectCamera();
      }

      if (!det.detected) {
        setStageState(2, 'fail');
        setErrorMessage(det.vendorMessage || 'Kamera belum terhubung. Pastikan kabel USB tersambung dan kamera menyala.');
        setTestResult('FAILED');
        setIsRunning(false);
        return;
      }

      setCameraInfo(det.camera);
      setCameraProfile(det.profile);

      if (!det.isSupported) {
        setStageState(2, 'fail');
        setErrorMessage(det.vendorMessage || 'Model kamera ini belum didukung MingleBooth.');
        setTestResult('FAILED');
        setIsRunning(false);
        return;
      }

      setStageState(2, 'pass');

      // ─────────────────────────────────────────────────────────────
      // STAGE 3: Driver Kamera
      // ─────────────────────────────────────────────────────────────
      setCurrentStageIndex(3);
      setStageState(3, 'running');
      setStatusText('Menyiapkan koneksi driver kamera...');

      if (det.requiresDriverSetup && electronAPI?.qa?.setupDriver) {
        const drvRes: any = await electronAPI.qa.setupDriver();
        if (drvRes.testModeRequired) {
          setIsTestModeEnabled(false);
          setStageState(3, 'fail');
          setErrorMessage('Driver percobaan memerlukan Mode Pengujian Windows. Silakan tekan tombol "Siapkan Mode Pengujian" terlebih dahulu.');
          setTestResult('FAILED');
          setIsRunning(false);
          return;
        }

        if (!drvRes.success) {
          setStageState(3, 'fail');
          setErrorMessage(drvRes.error || 'Pengaturan driver kamera gagal. Driver sistem telah dipulihkan.');
          setTestResult('FAILED');
          setIsRunning(false);
          return;
        }
      }

      setStageState(3, 'pass');

      // ─────────────────────────────────────────────────────────────
      // STAGE 4: Komunikasi Kamera (Non-Destructive)
      // ─────────────────────────────────────────────────────────────
      setCurrentStageIndex(4);
      setStageState(4, 'running');
      setStatusText('Memeriksa komunikasi kamera (tanpa shutter)...');

      let connRes: any = { success: true, error: '' };
      if (electronAPI?.qa?.testConnection) {
        connRes = await electronAPI.qa.testConnection(det.profile);
      }

      if (!connRes.success) {
        setStageState(4, 'fail');
        setErrorMessage(connRes.error || 'Komunikasi kamera belum berhasil.');
        setTestResult('FAILED');
        setIsRunning(false);
        return;
      }

      setStageState(4, 'pass');

      // ─────────────────────────────────────────────────────────────
      // STAGE 5: Prompting for Real Capture
      // ─────────────────────────────────────────────────────────────
      setCurrentStageIndex(5);
      setStatusText('Komunikasi kamera berhasil. Siap mengambil satu foto percobaan.');
      setIsRunning(false);
      setAwaitingCapturePrompt(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Terjadi kesalahan pada sistem pengujian.');
      setTestResult('FAILED');
      setIsRunning(false);
    }
  };

  // User confirms capture
  const handleExecuteCapture = async () => {
    setAwaitingCapturePrompt(false);
    setIsRunning(true);
    setStageState(5, 'running');
    setStatusText('Mengambil foto percobaan...');

    try {
      let capRes: any = { success: false, filePath: '', fileSize: 0, previewBase64: '', error: '' };
      if (electronAPI?.qa?.triggerCapture) {
        capRes = await electronAPI.qa.triggerCapture(cameraProfile);
      }

      if (!capRes.success) {
        setStageState(5, 'fail');
        setErrorMessage(capRes.error || 'Gagal mengambil foto dari kamera.');
        setTestResult('FAILED');
        setIsRunning(false);
        return;
      }

      setStageState(5, 'pass');
      setCapturedImagePreview(capRes.previewBase64);
      setCapturedImageMeta({
        name: capRes.filePath ? capRes.filePath.split(/[\\/]/).pop() || 'photo.jpg' : 'photo.jpg',
        size: Math.round(capRes.fileSize / 1024),
      });

      // STAGE 6: Final Result
      setCurrentStageIndex(6);
      setStageState(6, 'pass');
      setTestResult('SUCCESS');
      setStatusText('Semua tahapan berhasil diuji! Kamera siap digunakan.');

      if (electronAPI?.qa?.exportReport) {
        electronAPI.qa.exportReport();
      }
    } catch (err: any) {
      setStageState(5, 'fail');
      setErrorMessage(err.message || 'Gagal mengeksekusi foto percobaan.');
      setTestResult('FAILED');
    } finally {
      setIsRunning(false);
    }
  };

  // Test Mode confirmation
  const handleConfirmEnableTestMode = async () => {
    setShowTestModeModal(false);
    setIsRunning(true);
    setStatusText('Mengaktifkan mode pengujian Windows...');
    setErrorMessage(null);
    setErrorDetails(null);

    try {
      if (electronAPI?.qa?.enableTestMode) {
        const res = await electronAPI.qa.enableTestMode();
        if (res.success && res.rebootRequired) {
          setIsTestModeEnabled(true);
          setRebootRequired(true);
          setRebootMessage('Mode Pengujian Windows sudah aktif.\nKomputer perlu direstart untuk melanjutkan.');
        } else if (res.success) {
          setIsTestModeEnabled(true);
          setStatusText('Mode Pengujian Windows sudah aktif. Silakan tekan Mulai Tes Kamera.');
        } else if (res.uacCancelled) {
          // Requirement 11: Friendly UI when UAC is cancelled by user (no exit code 1)
          setErrorMessage('Izin Administrator diperlukan untuk melanjutkan.');
          setErrorDetails(null);
        } else if (res.elevationFailed) {
          // Requirement 12: Elevation failure with real developer diagnostics
          setErrorMessage('Windows tidak memberikan izin Administrator. Silakan coba lagi.');
          setErrorDetails(res.realWindowsError || (res.diagnostics ? JSON.stringify(res.diagnostics, null, 2) : null));
        } else {
          setErrorMessage(res.error || 'Gagal mengaktifkan mode pengujian.');
          if (res.realWindowsError) {
            setErrorDetails(res.realWindowsError);
          } else if (res.diagnostics) {
            setErrorDetails(typeof res.diagnostics === 'string' ? res.diagnostics : JSON.stringify(res.diagnostics, null, 2));
          }
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsRunning(false);
    }
  };

  // Restore normal mode confirmation
  const handleConfirmRestoreNormalMode = async () => {
    setShowRestoreNormalModal(false);
    setIsRunning(true);
    setStatusText('Mengembalikan Windows ke mode normal...');

    try {
      if (electronAPI?.qa?.restoreNormalMode) {
        const res = await electronAPI.qa.restoreNormalMode();
        if (res.success && res.rebootRequired) {
          setIsTestModeEnabled(false);
          setRebootRequired(true);
          setRebootMessage('Mode pengujian telah dinonaktifkan. Silakan restart tablet sekarang untuk kembali ke mode normal.');
        } else if (res.success) {
          setIsTestModeEnabled(false);
          setStatusText('Windows telah berada dalam mode normal.');
        } else {
          setErrorMessage(res.error || 'Gagal mengembalikan Windows ke mode normal.');
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsRunning(false);
    }
  };

  // Dedicated UAC Isolation Test Handler (Requirement D & E)
  const handleConfirmTestUac = async () => {
    setShowUacModal(false);
    setIsRunning(true);
    setStatusText('Menjalankan pengujian izin Administrator (UAC)...');
    setErrorMessage(null);
    setErrorDetails(null);
    setUacResult(null);

    try {
      if (electronAPI?.qa?.testElevation) {
        const res = await electronAPI.qa.testElevation();
        if (res.success) {
          setUacResult({
            success: true,
            message: 'Izin Administrator berhasil.',
            details: res.details,
          });
          setStatusText('Izin Administrator berhasil.');
        } else if (res.uacCancelled) {
          setUacResult({
            success: false,
            message: 'Izin Administrator tidak diberikan.',
            details: res.details,
          });
          setStatusText('Izin Administrator tidak diberikan.');
        } else {
          const errMsg = res.error || 'Pengujian izin Administrator belum berhasil.';
          setUacResult({
            success: false,
            message: errMsg,
            details: res.details,
          });
          setErrorMessage(errMsg);
          if (res.details) {
            setErrorDetails(typeof res.details === 'string' ? res.details : JSON.stringify(res.details, null, 2));
          }
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal mengeksekusi pengujian UAC.');
      setUacResult({
        success: false,
        message: err.message || 'Gagal mengeksekusi pengujian UAC.',
      });
    } finally {
      setIsRunning(false);
    }
  };

  // Driver rollback
  const handleRollbackDriver = async () => {
    setIsRunning(true);
    setStatusText('Mengembalikan driver kamera ke pengaturan default Windows (WPD/MTP)...');

    try {
      if (electronAPI?.qa?.rollbackDriver) {
        const res = await electronAPI.qa.rollbackDriver();
        if (res.success) {
          setStatusText('Driver kamera bawaan Windows berhasil dipulihkan.');
          setTestResult('IDLE');
        } else {
          setErrorMessage(res.error || 'Gagal mengembalikan driver.');
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsRunning(false);
    }
  };

  const handleReboot = () => {
    if (electronAPI?.qa?.rebootSystem) {
      electronAPI.qa.rebootSystem();
    }
  };

  const stageTitles: { [key: number]: string } = {
    1: 'Lingkungan Windows',
    2: 'Deteksi Kamera',
    3: 'Driver Kamera',
    4: 'Koneksi Kamera',
    5: 'Foto Percobaan',
    6: 'Hasil Pengujian',
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0c0e] text-white select-none overflow-y-auto p-4 md:p-8">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4 max-w-5xl w-full mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Camera className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white">MINGLEBOOTH CAMERA QA</h1>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                Tablet Hardware Test
              </span>
              {isTestModeEnabled === true && (
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Test Mode Aktif
                </span>
              )}
              {isTestModeEnabled === false && (
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-neutral-700/40 text-neutral-400 border border-neutral-600/30">
                  Mode Normal
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-400">Pengujian otomatis kamera studio Sony ILCE-7CM2 (α7C II)</p>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-3 rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-neutral-400 hover:text-white transition-all active:scale-95"
            title="Kembali ke MingleBooth Studio"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Main Content Area */}
      <div className="max-w-5xl w-full mx-auto my-6 space-y-6 flex-1">
        {/* Visual 6-Stage Progress Track */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          {[1, 2, 3, 4, 5, 6].map((stageNum) => {
            const status = stages[stageNum];
            return (
              <div
                key={stageNum}
                className={`p-3 rounded-2xl border transition-all flex flex-col items-center text-center gap-1.5 ${
                  status === 'pass'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : status === 'running'
                    ? 'bg-blue-500/15 border-blue-500/50 text-blue-400 animate-pulse'
                    : status === 'fail'
                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                    : 'bg-white/[0.03] border-white/[0.06] text-neutral-500'
                }`}
              >
                <div className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border border-current">
                  {status === 'pass' ? (
                    <Check className="w-4 h-4" />
                  ) : status === 'running' ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    stageNum
                  )}
                </div>
                <span className="text-[11px] font-semibold">{stageTitles[stageNum]}</span>
              </div>
            );
          })}
        </div>

        {/* Live Status & Interaction Card */}
        <div className="p-6 md:p-8 rounded-3xl bg-[#131519] border border-white/10 shadow-2xl space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-xs uppercase font-mono tracking-wider text-neutral-400">Status Saat Ini</span>
              <p className="text-base md:text-lg font-bold text-white">{statusText}</p>
            </div>

            {/* Primary Action Buttons */}
            {!isRunning && !awaitingCapturePrompt && (
              <div className="flex flex-wrap items-center gap-3">
                {/* Dedicated UAC Isolation Test Button (Requirement E) */}
                <button
                  type="button"
                  onClick={() => setShowUacModal(true)}
                  className="w-full sm:w-auto px-5 py-4 rounded-2xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-200 text-sm font-bold shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 min-h-[52px]"
                >
                  <Shield className="w-5 h-5 text-indigo-400" />
                  <span>TES UAC</span>
                </button>
                {isTestModeEnabled === false && (
                  <button
                    type="button"
                    onClick={() => setShowTestModeModal(true)}
                    className="w-full sm:w-auto px-6 py-4 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-sm font-bold shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 min-h-[52px]"
                  >
                    <ShieldCheck className="w-5 h-5 text-amber-400" />
                    <span>Siapkan Mode Pengujian</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={runAutomatedSequence}
                  className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-white hover:bg-neutral-200 text-black text-sm font-bold shadow-xl shadow-white/10 active:scale-95 transition-all flex items-center justify-center gap-3 min-h-[52px]"
                >
                  <Camera className="w-5 h-5 text-blue-600" />
                  <span>MULAI TES KAMERA</span>
                </button>
              </div>
            )}
          </div>

          {/* UAC Test Result Banner (Requirement E) */}
          {uacResult && (
            <div className={`p-4 rounded-2xl border ${uacResult.success ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-amber-500/10 border-amber-500/30 text-amber-300'} space-y-2 text-xs`}>
              <div className="flex items-center gap-2 font-bold text-sm">
                {uacResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                )}
                <span>{uacResult.message}</span>
              </div>
              <p className="text-[11px] text-neutral-300">
                {uacResult.success
                  ? 'Izin Administrator terverifikasi berhasil (whoami /groups mendeteksi High Mandatory Level). Tidak ada perubahan konfigurasi Windows, driver, atau reboot.'
                  : 'Pengujian izin Administrator belum berhasil atau dibatalkan.'}
              </p>
              {uacResult.details && (
                <pre className="p-2.5 rounded-xl bg-black/50 border border-white/10 text-[10px] font-mono text-neutral-200 whitespace-pre-wrap overflow-x-auto max-h-40 select-text">
                  {typeof uacResult.details === 'string' ? uacResult.details : JSON.stringify(uacResult.details, null, 2)}
                </pre>
              )}
            </div>
          )}

          {/* Interactive Capture Prompt */}
          {awaitingCapturePrompt && (
            <div className="p-6 rounded-2xl bg-gradient-to-br from-blue-950/40 to-indigo-950/40 border border-blue-500/30 space-y-4 animate-in fade-in">
              <div className="space-y-1">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Camera className="w-5 h-5 text-blue-400" />
                  Kamera siap. Lakukan satu foto percobaan?
                </h3>
                <p className="text-xs text-neutral-300">
                  Foto akan diambil langsung dari kamera Sony ILCE-7CM2 dan ditampilkan di layar tablet ini.
                </p>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleExecuteCapture}
                  className="px-6 py-3.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-xs font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition-all flex items-center gap-2 min-h-[48px]"
                >
                  <Camera className="w-4 h-4" />
                  <span>Ambil Foto</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAwaitingCapturePrompt(false)}
                  className="px-5 py-3.5 rounded-xl bg-white/[0.06] hover:bg-white/10 border border-white/10 text-neutral-400 hover:text-white text-xs font-semibold transition-all min-h-[48px]"
                >
                  Batal
                </button>
              </div>
            </div>
          )}

          {/* Captured Image Preview */}
          {capturedImagePreview && (
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                  <ImageIcon className="w-4 h-4" />
                  <span>Hasil Foto Percobaan ({capturedImageMeta?.name} - {capturedImageMeta?.size} KB)</span>
                </div>
                <span className="text-[10px] text-neutral-400 font-mono">Tersimpan di Disk</span>
              </div>
              <div className="relative rounded-xl overflow-hidden bg-black/50 border border-white/5 max-h-72 flex items-center justify-center">
                <img
                  src={capturedImagePreview}
                  alt="Hasil Foto QA"
                  className="object-contain max-h-72 w-auto mx-auto rounded-lg"
                />
              </div>
            </div>
          )}

          {/* Error / Failure Banner */}
          {errorMessage && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-2.5 text-xs">
              <div className="flex items-center gap-2 font-bold text-rose-200">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Pengujian Belum Berhasil</span>
              </div>
              <p className="text-[11px] leading-relaxed text-rose-300/90 whitespace-pre-wrap">{errorMessage}</p>
              {errorDetails && (
                <div className="space-y-1 pt-1">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-rose-400/70">Diagnostik Sistem Windows:</span>
                  <pre className="p-2.5 rounded-xl bg-black/50 border border-rose-500/20 text-[10px] font-mono text-rose-200/90 whitespace-pre-wrap overflow-x-auto max-h-36 select-text">
                    {errorDetails}
                  </pre>
                </div>
              )}
              {isTestModeEnabled === false && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowTestModeModal(true)}
                    className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95"
                  >
                    <ShieldCheck className="w-4 h-4 text-amber-400" />
                    <span>Siapkan Mode Pengujian</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Success Banner */}
          {testResult === 'SUCCESS' && (
            <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 space-y-3">
              <div className="flex items-center gap-2 font-bold text-base text-emerald-200">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                <span>KAMERA BERHASIL DIUJI</span>
              </div>
              <p className="text-xs text-neutral-300 font-semibold">
                Sony α7C II (ILCE-7CM2) siap digunakan untuk sesi photobooth MingleBooth.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pt-2 text-[11px] text-emerald-300">
                <div className="flex items-center gap-1.5">✓ Kamera terdeteksi</div>
                <div className="flex items-center gap-1.5">✓ Koneksi berhasil</div>
                <div className="flex items-center gap-1.5">✓ Driver berhasil</div>
                <div className="flex items-center gap-1.5">✓ Komunikasi berhasil</div>
                <div className="flex items-center gap-1.5">✓ Foto berhasil diambil</div>
                <div className="flex items-center gap-1.5">✓ Foto berhasil disimpan</div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Utility Bar: Separate Rollback and Restore Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-2xl bg-white/[0.02] border border-white/10 text-xs">
          <div className="text-neutral-400 text-center sm:text-left">
            <span className="font-semibold text-neutral-300">Pengaturan Uji Mandiri:</span>
            <span className="block sm:inline sm:ml-1">Pulihkan driver atau nonaktifkan mode pengujian secara terpisah.</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-center">
            {/* Siapkan Mode Pengujian if in normal mode */}
            {isTestModeEnabled === false && (
              <button
                type="button"
                onClick={() => setShowTestModeModal(true)}
                disabled={isRunning}
                className="px-4 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-medium flex items-center gap-1.5 transition-all min-h-[44px] active:scale-95"
                title="Siapkan Mode Pengujian Windows"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                <span>Siapkan Mode Pengujian</span>
              </button>
            )}

            {/* Button 1: Kembalikan Driver Windows */}
            <button
              type="button"
              onClick={handleRollbackDriver}
              disabled={isRunning}
              className="px-4 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-neutral-300 hover:text-white font-medium flex items-center gap-1.5 transition-all min-h-[44px] active:scale-95"
              title="Kembalikan driver kamera ke Windows WPD/MTP"
            >
              <RotateCcw className="w-3.5 h-3.5 text-blue-400" />
              <span>Kembalikan Driver Windows</span>
            </button>

            {/* Button 2: Kembalikan Windows ke Mode Normal */}
            <button
              type="button"
              onClick={() => setShowRestoreNormalModal(true)}
              disabled={isRunning}
              className="px-4 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-neutral-300 hover:text-white font-medium flex items-center gap-1.5 transition-all min-h-[44px] active:scale-95"
              title="Nonaktifkan Windows Test Mode"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Kembalikan Windows ke Mode Normal</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          MODAL 1: Explicit Test Mode Warning & Setup Modal
      ───────────────────────────────────────────────────────────── */}
      {showTestModeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl bg-[#14161b] border border-white/10 p-6 md:p-8 space-y-5 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">Mode Pengujian Windows Diperlukan</h3>
            </div>

            <div className="space-y-3 text-xs text-neutral-300 leading-relaxed">
              <p className="font-semibold text-white">
                Mode Pengujian Windows diperlukan untuk memasang driver percobaan MingleBooth.
              </p>
              <p>
                Ini hanya untuk pengujian. Windows akan menampilkan tanda Test Mode dan komputer mungkin perlu direstart.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowTestModeModal(false)}
                className="px-5 py-3 rounded-xl border border-white/10 text-neutral-400 hover:text-white text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmEnableTestMode}
                className="px-6 py-3 rounded-xl bg-white hover:bg-neutral-200 text-black text-xs font-bold shadow-lg active:scale-95"
              >
                Lanjutkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 2: Restore Normal Mode Modal
      ───────────────────────────────────────────────────────────── */}
      {showRestoreNormalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl bg-[#14161b] border border-white/10 p-6 md:p-8 space-y-5 shadow-2xl">
            <div className="flex items-center gap-3 text-blue-400">
              <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <RotateCcw className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">Kembalikan Windows ke Mode Normal</h3>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              Tindakan ini akan menonaktifkan Windows Test Signing dan mengembalikan Windows ke mode normal seperti semula. Komputer perlu direstart setelahnya.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowRestoreNormalModal(false)}
                className="px-4 py-3 rounded-xl border border-white/10 text-neutral-400 hover:text-white text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmRestoreNormalMode}
                className="px-6 py-3 rounded-xl bg-white hover:bg-neutral-200 text-black text-xs font-bold shadow-lg active:scale-95"
              >
                Lanjutkan & Nonaktifkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 3: Reboot Required Prompt
      ───────────────────────────────────────────────────────────── */}
      {rebootRequired && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-lg p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl bg-[#14161b] border border-white/20 p-6 md:p-8 space-y-5 text-center shadow-2xl">
            <div className="w-14 h-14 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center mx-auto text-blue-400">
              <Power className="w-7 h-7" />
            </div>
            <div className="space-y-2">
              <h3 className="text-base font-bold text-white">Mode Pengujian Windows Sudah Aktif</h3>
              <p className="text-xs text-neutral-300 leading-relaxed whitespace-pre-wrap">{rebootMessage || 'Komputer perlu direstart untuk melanjutkan.'}</p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleReboot}
                className="px-8 py-3.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-xs font-bold shadow-lg shadow-blue-500/30 active:scale-95 transition-all"
              >
                Restart Sekarang
              </button>
              <button
                type="button"
                onClick={() => setRebootRequired(false)}
                className="px-5 py-3.5 rounded-xl bg-white/[0.06] hover:bg-white/10 border border-white/10 text-neutral-400 text-xs"
              >
                Nanti Saja
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 4: UAC Isolation Test Modal (Requirement E)
      ───────────────────────────────────────────────────────────── */}
      {showUacModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl bg-[#14161b] border border-white/10 p-6 md:p-8 space-y-5 shadow-2xl text-center">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center mx-auto text-indigo-400">
              <Shield className="w-7 h-7" />
            </div>

            <div className="space-y-2">
              <h3 className="text-base font-bold text-white">Tes Izin Administrator (UAC)</h3>
              <p className="text-xs text-neutral-300 leading-relaxed">
                Windows akan meminta izin Administrator untuk pengujian.
              </p>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                Pengujian ini hanya menjalankan pemeriksaan identitas non-destruktif (whoami). Tidak mengubah konfigurasi BCD, tidak memasang driver, dan tidak melakukan restart.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowUacModal(false)}
                className="px-5 py-3 rounded-xl border border-white/10 text-neutral-400 hover:text-white text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmTestUac}
                className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg active:scale-95"
              >
                Lanjutkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
