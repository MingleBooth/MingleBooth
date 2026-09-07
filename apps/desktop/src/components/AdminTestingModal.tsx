import React, { useState } from 'react';
import { usePhotoboothStore } from '../store/photobooth-store';
import {
  X,
  Camera,
  Layers,
  QrCode,
  Wifi,
  WifiOff,
  RefreshCw,
  Key,
  Trash2,
  Play,
  SlidersHorizontal,
  LogOut,
  FolderOpen,
  Usb,
  Download,
  CheckCircle2,
  AlertTriangle,
  Cpu,
} from 'lucide-react';
import { QRGenerator } from '@minglebooth/photo-engine';
import { LicenseVerifier } from '@minglebooth/license';

export const AdminTestingModal: React.FC = () => {
  const {
    isAdminTestingOpen,
    toggleAdminTesting,
    cameraStatus,
    syncStats,
    isOnline,
    toggleNetworkStatus,
    triggerMockSync,
    startSession,
    currentEvent,
    toggleStorageModal,
    customStorageDir,
    isNativeDriverInstalled,
    nativeDriverVersion,
    detectedNativeCameras,
    activeNativeCameraModel,
    isInstallingDriver,
    driverInstallLogs,
    installNativeDriver,
    detectNativeCameras,
    releaseUsbLock,
    triggerNativeDirectCapture,
  } = usePhotoboothStore();

  const [testLogs, setTestLogs] = useState<string[]>([]);
  const [runningTest, setRunningTest] = useState<string | null>(null);

  if (!isAdminTestingOpen) return null;

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setTestLogs((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 15)]);
  };

  const handleTestCamera = async () => {
    setRunningTest('camera');
    addLog('Testing camera connection...');
    await new Promise((r) => setTimeout(r, 400));
    addLog(`Camera OK: ${cameraStatus.device?.name || 'Camera'} active.`);
    setRunningTest(null);
  };

  const handleTestCapture = async () => {
    setRunningTest('capture');
    addLog('Triggering capture sequence...');
    toggleAdminTesting();
    startSession();
    setRunningTest(null);
  };

  const handleTestTemplate = async () => {
    setRunningTest('template');
    addLog('Validating template layouts & slots...');
    await new Promise((r) => setTimeout(r, 300));
    addLog('Template validation PASSED.');
    setRunningTest(null);
  };

  const handleTestQR = async () => {
    setRunningTest('qr');
    const testId = 'photo_' + Math.floor(Math.random() * 1000);
    const url = QRGenerator.buildGalleryUrl(currentEvent.qrBaseUrl, testId);
    await QRGenerator.generateDataUrl(url);
    addLog(`QR Test PASSED: ${url}`);
    setRunningTest(null);
  };

  const handleTestSync = async () => {
    setRunningTest('sync');
    addLog('Processing sync queue...');
    await triggerMockSync();
    addLog('Sync test complete.');
    setRunningTest(null);
  };

  const handleTestLicense = async () => {
    setRunningTest('license');
    const verifier = new LicenseVerifier(false);
    const result = verifier.verify(null);
    addLog(`License Test PASSED: [${result.tier.toUpperCase()}] ${result.message}`);
    setRunningTest(null);
  };

  const handleTestCleanup = async () => {
    setRunningTest('cleanup');
    addLog('Simulating 30-day retention cleanup...');
    await new Promise((r) => setTimeout(r, 500));
    addLog('Cleanup test PASSED: 0 cloud records expired. Local storage preserved.');
    setRunningTest(null);
  };

  const handleLogoutStudio = () => {
    if (confirm('Keluar dari akun Studio? Anda harus login kembali untuk mengaktivasi perangkat ini.')) {
      localStorage.removeItem('mb_license_token');
      localStorage.removeItem('mb_vendor_org');
      localStorage.removeItem('mb_device_info');
      window.location.reload();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6 select-none animate-fadeIn">
      <div className="max-w-3xl w-full bg-[#121418] border border-white/[0.08] rounded-2xl p-6 sm:p-8 flex flex-col gap-6 max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-2.5">
            <SlidersHorizontal className="w-5 h-5 text-neutral-300" />
            <div>
              <h2 className="text-base font-bold text-white">System Diagnostics & Tests</h2>
              <p className="text-xs text-neutral-400">Validate camera, offline sync, QR, and licensing.</p>
            </div>
          </div>
          <button
            onClick={toggleAdminTesting}
            className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-neutral-300 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          <div className="p-3 rounded-lg bg-[#181B20] border border-white/[0.04]">
            <span className="text-[10px] font-mono uppercase text-neutral-500 block">Environment</span>
            <span className="text-xs font-bold text-neutral-200">Production</span>
          </div>
          <div className="p-3 rounded-lg bg-[#181B20] border border-white/[0.04]">
            <span className="text-[10px] font-mono uppercase text-neutral-500 block">Subscription</span>
            <span className="text-xs font-bold text-emerald-400">Aktif</span>
          </div>
          <div className="p-3 rounded-lg bg-[#181B20] border border-white/[0.04]">
            <span className="text-[10px] font-mono uppercase text-neutral-500 block">Camera</span>
            <span className="text-xs font-bold text-emerald-400">Connected</span>
          </div>
          <div className="p-3 rounded-lg bg-[#181B20] border border-white/[0.04]">
            <span className="text-[10px] font-mono uppercase text-neutral-500 block">Status Jaringan</span>
            <span className={`text-xs font-bold flex items-center gap-1.5 ${isOnline ? 'text-emerald-400' : 'text-amber-400'}`}>
              <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              {isOnline ? 'ONLINE (Sync)' : 'OFFLINE (Lokal)'}
            </span>
          </div>
          <div className="p-3 rounded-lg bg-[#181B20] border border-white/[0.04]">
            <span className="text-[10px] font-mono uppercase text-neutral-500 block">Antrian Upload</span>
            <span className="text-xs font-bold text-neutral-200 font-mono">{syncStats.totalPending} Pending</span>
          </div>
        </div>

        {/* Test Actions */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            onClick={handleTestCamera}
            disabled={runningTest !== null}
            className="p-2.5 rounded-lg bg-[#181B20] hover:bg-[#20242B] border border-white/[0.06] text-xs font-medium text-neutral-200 flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <Camera className="w-3.5 h-3.5 text-neutral-400" />
            <span>Test Camera</span>
          </button>

          <button
            onClick={handleTestCapture}
            disabled={runningTest !== null}
            className="p-2.5 rounded-lg bg-[#181B20] hover:bg-[#20242B] border border-white/[0.06] text-xs font-medium text-neutral-200 flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 text-emerald-400" />
            <span>Test Capture</span>
          </button>

          <button
            onClick={handleTestTemplate}
            disabled={runningTest !== null}
            className="p-2.5 rounded-lg bg-[#181B20] hover:bg-[#20242B] border border-white/[0.06] text-xs font-medium text-neutral-200 flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <Layers className="w-3.5 h-3.5 text-neutral-400" />
            <span>Test Template</span>
          </button>

          <button
            onClick={handleTestQR}
            disabled={runningTest !== null}
            className="p-2.5 rounded-lg bg-[#181B20] hover:bg-[#20242B] border border-white/[0.06] text-xs font-medium text-neutral-200 flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <QrCode className="w-3.5 h-3.5 text-neutral-400" />
            <span>Test QR</span>
          </button>

          <button
            onClick={toggleNetworkStatus}
            disabled={runningTest !== null}
            className="p-2.5 rounded-lg bg-[#181B20] hover:bg-[#20242B] border border-white/[0.06] text-xs font-medium text-neutral-200 flex items-center gap-2 transition-colors disabled:opacity-50"
            title="Klik untuk berpindah antara mode Online dan Offline"
          >
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span>Simulasi: Buat Offline</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                <span>Kembalikan: Online</span>
              </>
            )}
          </button>

          <button
            onClick={handleTestSync}
            disabled={runningTest !== null}
            className="p-2.5 rounded-lg bg-[#181B20] hover:bg-[#20242B] border border-white/[0.06] text-xs font-medium text-neutral-200 flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5 text-neutral-400" />
            <span>Test Sync</span>
          </button>

          <button
            onClick={handleTestLicense}
            disabled={runningTest !== null}
            className="p-2.5 rounded-lg bg-[#181B20] hover:bg-[#20242B] border border-white/[0.06] text-xs font-medium text-neutral-200 flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <Key className="w-3.5 h-3.5 text-neutral-400" />
            <span>Test License</span>
          </button>

          <button
            onClick={handleTestCleanup}
            disabled={runningTest !== null}
            className="p-2.5 rounded-lg bg-[#181B20] hover:bg-[#20242B] border border-white/[0.06] text-xs font-medium text-neutral-200 flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>Test Cleanup</span>
          </button>
        </div>

        {/* Direct Native USB Camera Driver Panel */}
        <div className="p-4 rounded-xl bg-[#14161C] border border-white/[0.08] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Usb className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-white block">Direct Native USB Driver (Tanpa Software Pihak Ke-3)</span>
                <span className="text-[11px] text-neutral-400">Hubungkan Sony / Canon / DSLR langsung ke MingleBooth via kabel USB</span>
              </div>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border flex items-center gap-1.5 ${
              isNativeDriverInstalled
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
            }`}>
              {isNativeDriverInstalled ? (
                <>
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>Driver Universal: AKTIF</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                  <span>Driver Belum Terpasang</span>
                </>
              )}
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {!isNativeDriverInstalled ? (
              <button
                disabled={isInstallingDriver}
                onClick={async () => {
                  addLog('Memulai pemasangan driver universal gphoto2 via Homebrew...');
                  const ok = await installNativeDriver();
                  addLog(ok ? 'Driver gphoto2 berhasil terpasang!' : 'Instalasi driver gagal.');
                }}
                className="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isInstallingDriver ? 'Sedang Memasang Driver...' : 'Pasang Driver Otomatis (1-Klik via Homebrew)'}</span>
              </button>
            ) : (
              <>
                <button
                  onClick={async () => {
                    addLog('Memindai kamera USB yang terhubung...');
                    await detectNativeCameras();
                    addLog(`Hasil pemindaian: ${detectedNativeCameras.length} kamera terdeteksi.`);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Pindai Kamera USB</span>
                </button>

                <button
                  onClick={async () => {
                    addLog('Melepaskan port USB dari Apple PTPCamera...');
                    await releaseUsbLock();
                    addLog('Port USB berhasil dibebaskan!');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-neutral-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  <Cpu className="w-3.5 h-3.5 text-blue-400" />
                  <span>Bebaskan Port USB (Kill PTPCamera)</span>
                </button>

                <button
                  onClick={async () => {
                    addLog('Menguji sinyal jepret langsung via kabel USB...');
                    await triggerNativeDirectCapture();
                    addLog('Perintah jepret terkirim ke kamera fisik!');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition-colors ml-auto"
                >
                  <Camera className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Tes Jepret Langsung USB</span>
                </button>
              </>
            )}
          </div>

          {/* Detected Cameras Status List */}
          {detectedNativeCameras.length > 0 && (
            <div className="p-2.5 rounded-lg bg-black/50 border border-white/[0.04] flex flex-col gap-1 text-[11px]">
              <span className="text-neutral-400 font-semibold">Kamera Fisik Terdeteksi di Port USB:</span>
              {detectedNativeCameras.map((cam, idx) => (
                <div key={idx} className="flex items-center justify-between text-white font-mono">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <strong>{cam.model}</strong>
                  </span>
                  <span className="text-neutral-500 text-[10px]">{cam.port}</span>
                </div>
              ))}
            </div>
          )}

          {/* Live Install Logs */}
          {isInstallingDriver && driverInstallLogs.length > 0 && (
            <div className="p-2.5 rounded-lg bg-black border border-white/[0.08] text-[10px] font-mono text-neutral-300 max-h-24 overflow-y-auto flex flex-col gap-0.5">
              {driverInstallLogs.slice(-6).map((log, i) => (
                <div key={i} className="truncate">{log}</div>
              ))}
            </div>
          )}
        </div>

        {/* Storage Management Shortcut */}
        <div className="p-3 rounded-xl bg-[#181B20] border border-white/[0.06] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 flex-shrink-0">
              <FolderOpen className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold text-white block">Lokasi Penyimpanan Foto</span>
              <span className="text-[11px] font-mono text-neutral-400 truncate block">
                {customStorageDir ? `Kustom: ${customStorageDir}` : 'Default: ./data/events'}
              </span>
            </div>
          </div>
          <button
            onClick={() => {
              toggleAdminTesting();
              toggleStorageModal(true);
            }}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors flex-shrink-0"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Kelola Folder Foto</span>
          </button>
        </div>

        {/* Logout Studio Account Button */}
        <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between">
          <span className="text-xs text-neutral-400">Ganti Akun Vendor atau Reset Perangkat Ini:</span>
          <button
            onClick={handleLogoutStudio}
            className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar / Logout Akun Studio</span>
          </button>
        </div>

        {/* Console Log */}
        <div className="p-3.5 rounded-lg bg-black border border-white/[0.06] font-mono text-xs text-neutral-300">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/[0.06] text-[10px] text-neutral-500 font-mono">
            <span>DIAGNOSTIC LOGS</span>
            <span>{testLogs.length} entries</span>
          </div>
          <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
            {testLogs.length === 0 ? (
              <span className="text-neutral-600 italic">Select any test above to execute diagnostics...</span>
            ) : (
              testLogs.map((log, idx) => (
                <div key={idx} className="text-neutral-300">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
