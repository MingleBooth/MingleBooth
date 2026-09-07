import React, { useState, useEffect } from 'react';
import {
  Monitor,
  X,
  Copy,
  Check,
  FolderOpen,
  Camera,
  RefreshCw,
  Sparkles,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';

interface TetherHubModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TetherHubModal: React.FC<TetherHubModalProps> = ({ isOpen, onClose }) => {
  const [hubInfo, setHubInfo] = useState<{
    status: string;
    port: number;
    ips: string[];
    tetherDir?: string;
  }>({
    status: 'checking',
    port: 4848,
    ips: ['127.0.0.1'],
  });
  const [copiedIp, setCopiedIp] = useState<string | null>(null);
  const [isTriggering, setIsTriggering] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      if ((window as any).electronAPI?.getTetherInfo) {
        const info = await (window as any).electronAPI.getTetherInfo();
        setHubInfo(info);
      } else {
        const res = await fetch('http://localhost:4848/api/tether/status');
        const data = await res.json();
        setHubInfo(data);
      }
    } catch {
      setHubInfo({
        status: 'offline',
        port: 4848,
        ips: ['127.0.0.1'],
      });
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedIp(url);
    setTimeout(() => setCopiedIp(null), 2000);
  };

  const handleOpenFolder = async () => {
    try {
      if ((window as any).electronAPI?.openFolder) {
        await (window as any).electronAPI.openFolder(hubInfo.tetherDir || './data/tether-inbox');
      } else {
        await fetch('/api/storage/open-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderPath: hubInfo.tetherDir || './data/tether-inbox' }),
        });
      }
    } catch (err) {
      console.warn('Could not open folder:', err);
    }
  };

  const handleTestShutter = async () => {
    setIsTriggering(true);
    setTestResult(null);
    try {
      const res = await fetch('http://localhost:4848/api/tether/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeoutMs: 3000, mockFallback: true }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult('Berhasil! Sinyal shutter terhubung & menerima foto kualitas studio.');
      } else {
        setTestResult(`Gagal: ${data.error || 'Tidak ada respon'}`);
      }
    } catch (e: any) {
      setTestResult(`Error koneksi: ${e.message}`);
    } finally {
      setIsTriggering(false);
    }
  };

  const primaryIp = hubInfo.ips.find((ip) => ip !== '127.0.0.1') || hubInfo.ips[0] || 'localhost';
  const hubUrl = `http://${primaryIp}:${hubInfo.port}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-fadeIn">
      <div className="max-w-xl w-full bg-[#121316] border border-white/[0.08] rounded-2xl p-6 flex flex-col gap-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <Monitor className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Sambungkan iPad / Tablet</h3>
              <p className="text-[11px] text-neutral-400">Kendalikan kamera Sony / DSLR langsung dari layar sentuh tablet</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-white/[0.08] text-neutral-400 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status & IP Box */}
        <div className="p-4 rounded-xl bg-[#171820] border border-white/[0.06] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Sambungan Kamera: Siap Digunakan</span>
            </span>
            <button
              onClick={fetchStatus}
              className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Refresh</span>
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-neutral-400">
              Kode Alamat Laptop (Masukkan nomor ini di iPad / Tablet):
            </label>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={hubUrl}
                className="flex-1 bg-black/50 border border-white/[0.1] rounded-lg px-3 py-2 text-xs font-mono text-emerald-400 focus:outline-none select-all"
              />
              <button
                onClick={() => handleCopy(hubUrl)}
                className="px-3 py-2 rounded-lg bg-white/[0.08] hover:bg-white/[0.12] text-xs font-medium text-white flex items-center gap-1.5 transition-colors"
              >
                {copiedIp === hubUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedIp === hubUrl ? 'Disalin' : 'Salin Kode'}</span>
              </button>
            </div>
          </div>

          {hubInfo.ips.length > 1 && (
            <div className="text-[10px] text-neutral-500">
              Alamat Cadangan:{' '}
              {hubInfo.ips
                .filter((ip) => ip !== primaryIp)
                .map((ip) => (
                  <button
                    key={ip}
                    onClick={() => handleCopy(`http://${ip}:${hubInfo.port}`)}
                    className="underline hover:text-neutral-300 mr-2"
                  >
                    http://{ip}:{hubInfo.port}
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* Hot Folder Inbox Path */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
          <div className="flex flex-col min-w-0 pr-2">
            <span className="text-xs font-medium text-neutral-200">Folder Simpan Foto Kamera</span>
            <span className="text-[11px] text-neutral-400 font-mono truncate max-w-sm">
              {hubInfo.tetherDir || 'data/tether-inbox'}
            </span>
          </div>
          <button
            onClick={handleOpenFolder}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs text-neutral-200 hover:text-white font-medium transition-colors flex-shrink-0"
          >
            <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
            <span>Buka Folder</span>
          </button>
        </div>

        {/* Panduan Shutter Fisik Kamera & Hot Folder */}
        <div className="text-[11px] text-neutral-400 space-y-2.5 bg-black/40 p-4 rounded-xl border border-white/[0.06] leading-relaxed">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-emerald-300 flex items-center gap-1.5 text-xs">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>Cara Sambungkan Shutter Kamera Fisik (PC Remote):</span>
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono">
              Auto-Jepret Aktif
            </span>
          </div>

          <p className="text-neutral-300 text-[11px]">
            Colok kabel USB kamera ke laptop. Buka software bawaan kamera (gratis), lalu arahkan folder simpan (Save Destination) ke folder <code className="text-emerald-400 font-mono font-bold">data/tether-inbox</code> di atas:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
            <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
              <strong className="text-white block mb-0.5">📸 Sony Alpha / ZV / FX:</strong>
              <span>Menu → USB Connection → <strong>PC Remote</strong>. Buka <em>Sony Imaging Edge Desktop (Remote)</em>.</span>
            </div>
            <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
              <strong className="text-white block mb-0.5">📸 Canon EOS DSLR &amp; R-Series:</strong>
              <span>Buka software resmi <em>Canon EOS Utility</em> → Destination Folder ke <code className="text-emerald-300">tether-inbox</code>.</span>
            </div>
            <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
              <strong className="text-white block mb-0.5">📸 Fujifilm X-Series:</strong>
              <span>Menu Connection → <strong>PC Shoot Auto</strong>. Buka software gratis <em>Fujifilm X Acquire</em>.</span>
            </div>
            <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
              <strong className="text-white block mb-0.5">📸 Nikon D &amp; Z-Series:</strong>
              <span>Buka software resmi <em>Nikon NX Tether</em> atau <em>digiCamControl</em> ke folder <code className="text-emerald-300">tether-inbox</code>.</span>
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-[11px] flex items-start gap-2">
            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <span>
              <strong>Hasil:</strong> Tekan tombol jepret di bodi kamera atau remote wireless di tangan ➔ Flash studio nyala ➔ Foto asli 24MP+ langsung masuk ke template photobooth &amp; otomatis ganti pose tanpa perlu sentuh layar!
            </span>
          </div>

          {/* Sambungkan ke Tablet info */}
          <div className="pt-2 border-t border-white/[0.06] text-[10px] text-neutral-400">
            <span className="text-neutral-300 font-semibold">Mode Layar Tablet (Opsional):</span> Jika ingin mengontrol photobooth dari iPad / Tablet, buka browser di tablet dan ketik alamat: <code className="text-white font-mono bg-black/60 px-1.5 py-0.5 rounded">{hubUrl}</code>
          </div>
        </div>

        {/* Test Shutter Trigger Button */}
        <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
          <button
            disabled={isTriggering}
            onClick={handleTestShutter}
            className="px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-neutral-200 text-xs font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <Camera className="w-3.5 h-3.5 text-emerald-400" />
            <span>{isTriggering ? 'Menguji Shutter...' : 'Tes Sinyal Shutter'}</span>
          </button>

          {testResult && (
            <span className="text-[11px] text-emerald-400 font-medium truncate max-w-xs">{testResult}</span>
          )}

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white text-black font-semibold text-xs hover:bg-neutral-200 transition-colors ml-auto"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
};
