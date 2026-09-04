import React, { useEffect, useState } from 'react';
import { ShieldCheck, Laptop, Lock, Mail, Key, AlertCircle, Sparkles, CheckCircle2 } from 'lucide-react';
import { usePhotoboothStore } from '../store/photobooth-store';

interface VendorAuthGateProps {
  children: React.ReactNode;
}

export const VendorAuthGate: React.FC<VendorAuthGateProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [deviceName, setDeviceName] = useState('MacBook Operator Booth 1');
  const [hwid, setHwid] = useState('');

  useEffect(() => {
    // 1. Get Hardware Fingerprint
    const fetchHWID = async () => {
      if (typeof window !== 'undefined' && (window as any).electronAPI?.getHWID) {
        const id = await (window as any).electronAPI.getHWID();
        setHwid(id);
      } else {
        // Browser fallback fingerprint
        const nav = window.navigator;
        const screen = window.screen;
        const raw = `${nav.userAgent}-${nav.language}-${screen.colorDepth}-${screen.width}x${screen.height}`;
        let hash = 0;
        for (let i = 0; i < raw.length; i++) {
          hash = (hash << 5) - hash + raw.charCodeAt(i);
          hash |= 0;
        }
        setHwid(`BRW-${Math.abs(hash).toString(16).padStart(8, '0')}`);
      }
    };

    fetchHWID();

    // 2. Check cached offline license token
    const token = localStorage.getItem('mb_license_token');
    const cachedOrg = localStorage.getItem('mb_vendor_org');

    if (token && cachedOrg) {
      setIsAuthenticated(true);
    }
    setLoading(false);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setErrorMsg('Masukkan email akun vendor Anda.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch('http://localhost:3000/api/auth/vendor-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          hardwareFingerprint: hwid,
          deviceName,
          osType: 'mac',
          appVersion: '1.0.0',
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        localStorage.setItem('mb_license_token', data.licenseToken);
        localStorage.setItem('mb_vendor_org', JSON.stringify(data.organization));
        localStorage.setItem('mb_device_info', JSON.stringify(data.device));
        setIsAuthenticated(true);
      } else {
        setErrorMsg(data.error || 'Login gagal. Periksa kembali email dan status lisensi Anda.');
      }
    } catch (err: any) {
      setErrorMsg('Gagal terhubung ke server autentikasi: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDevBypass = () => {
    localStorage.setItem('mb_license_token', 'DEV_MOCK_TOKEN');
    localStorage.setItem(
      'mb_vendor_org',
      JSON.stringify({ name: 'ABC Photobooth Studio', planTier: 'pro', maxDevicesQuota: 3 })
    );
    setIsAuthenticated(true);
  };

  if (loading) {
    return (
      <div className="h-screen w-screen bg-[#090A0C] flex items-center justify-center text-neutral-500 text-xs font-mono">
        Verifikasi Lisensi Hardware...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="h-screen w-screen bg-[#090A0C] text-[#EDEDED] flex items-center justify-center p-6 select-none font-sans antialiased">
        <div className="max-w-md w-full bg-[#121316] border border-white/[0.08] rounded-2xl p-8 shadow-2xl flex flex-col gap-6 animate-fadeIn">
          {/* Header */}
          <div className="flex flex-col items-center text-center gap-3">
            <img
              src="/logo-minglebooth-header.png"
              alt="MingleBooth"
              className="h-9 sm:h-10 w-auto object-contain"
            />
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">
                Aktivasi MingleBooth Studio
              </h1>
              <p className="text-xs text-neutral-400 max-w-xs mt-1">
                Masuk dengan akun vendor terdaftar untuk mengaktivasi laptop booth ini.
              </p>
            </div>
          </div>

          {/* ID Perangkat Laptop */}
          <div className="p-3 rounded-lg bg-[#181A1F] border border-white/[0.05] flex items-center justify-between text-[11px] font-mono">
            <div className="flex items-center gap-2 text-neutral-400">
              <Laptop className="w-3.5 h-3.5 text-neutral-400" />
              <span>ID Perangkat Laptop:</span>
            </div>
            <span className="text-neutral-200">{hwid || 'Mendeteksi...'}</span>
          </div>

          {/* Error Alert */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
              <div className="flex-1 leading-relaxed">{errorMsg}</div>
            </div>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-300 font-medium">Email Vendor</label>
              <input
                type="email"
                required
                placeholder="vendor@photobooth.id"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-[#181A1F] border border-white/[0.08] text-xs rounded-xl px-3.5 py-2.5 text-white outline-none focus:border-white/30 transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-300 font-medium">Password</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-[#181A1F] border border-white/[0.08] text-xs rounded-xl px-3.5 py-2.5 text-white outline-none focus:border-white/30 transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-300 font-medium">Nama Laptop / Booth</label>
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="Contoh: Laptop Booth Utama"
                className="bg-[#181A1F] border border-white/[0.08] text-xs rounded-xl px-3.5 py-2.5 text-white outline-none focus:border-white/30 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full py-3 rounded-xl bg-white hover:bg-neutral-200 text-black font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-98 shadow-md"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{submitting ? 'Memverifikasi Perangkat...' : 'Aktivasi Perangkat Ini'}</span>
            </button>
          </form>

          {/* Quick Demo Bypass for Testing */}
          <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs">
            <span className="text-[11px] text-neutral-500 font-mono">Testing Mode:</span>
            <button
              type="button"
              onClick={handleDevBypass}
              className="text-neutral-400 hover:text-white text-[11px] font-mono underline"
            >
              Masuk Instan (Demo Bypass)
            </button>
          </div>

          <div className="flex flex-col items-center gap-2 pt-2">
            <a
              href="https://www.instagram.com/sebuah.kenang?igsi=MW11ZXo2N3puOWM3eA%3D%3D&utm_source=qr"
              target="_blank"
              rel="noopener noreferrer"
              className="group block transition-transform hover:scale-105"
              title="Kunjungi Instagram @sebuah.kenang"
            >
              <img
                src="/logo-footer-sebuahkenang.png"
                alt="MingleBooth by sebuah.kenang"
                className="h-8 w-auto object-contain opacity-75 group-hover:opacity-100 transition-opacity"
              />
            </a>
            <div className="text-center text-[10px] text-neutral-500">
              © 2026 MingleBooth by{' '}
              <a
                href="https://www.instagram.com/sebuah.kenang?igsi=MW11ZXo2N3puOWM3eA%3D%3D&utm_source=qr"
                target="_blank"
                rel="noopener noreferrer"
                className="text-neutral-400 hover:text-white underline decoration-white/30 hover:decoration-white transition-colors font-medium"
              >
                sebuah.kenang
              </a>
              . Setiap Momen Berarti.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
