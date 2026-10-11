import React, { useEffect, useState } from 'react';
import { ShieldCheck, Laptop, AlertCircle } from 'lucide-react';
import { LicenseVerifier } from '@minglebooth/license';
import { API_BASE_URL } from '../config';
import logoHeader from '../assets/logo-minglebooth-header.png';

interface VendorAuthGateProps {
  children: React.ReactNode;
  onOpenQA?: () => void;
  onAuthSuccess?: (isDemo: boolean) => void;
}

export const VendorAuthGate: React.FC<VendorAuthGateProps> = ({
  children,
  onOpenQA,
  onAuthSuccess,
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [gracePeriodNotice, setGracePeriodNotice] = useState<string | null>(null);

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const isWindows = typeof navigator !== 'undefined' && /win/i.test(navigator.userAgent || (navigator as any).platform || '');
  const [deviceName, setDeviceName] = useState(() =>
    isWindows ? 'Windows Operator Booth 1' : 'MacBook Operator Booth 1'
  );
  const [hwid, setHwid] = useState('');

  useEffect(() => {
    const initAuth = async () => {
      // 1. Get Hardware Fingerprint
      let currentHwid = '';
      if (typeof window !== 'undefined' && (window as any).electronAPI?.getHWID) {
        try {
          currentHwid = await (window as any).electronAPI.getHWID();
        } catch {
          currentHwid = '';
        }
      }
      
      if (!currentHwid) {
        // Browser / fallback fingerprint
        const nav = window.navigator;
        const screen = window.screen;
        const raw = `${nav.userAgent}-${nav.language}-${screen.colorDepth}-${screen.width}x${screen.height}`;
        let hash = 0;
        for (let i = 0; i < raw.length; i++) {
          hash = (hash << 5) - hash + raw.charCodeAt(i);
          hash |= 0;
        }
        currentHwid = `BRW-${Math.abs(hash).toString(16).padStart(8, '0')}`;
      }
      setHwid(currentHwid);

      // 2. Cryptographic Local Verification of Cached Token
      const token = localStorage.getItem('mb_license_token');
      if (token) {
        const verifier = new LicenseVerifier(true);
        const result = verifier.verifyTokenString(token, currentHwid);

        if (result.isValid) {
          if (result.isGracePeriod) {
            setGracePeriodNotice(result.message);
          }
          const localIsDemo = Boolean(result.isDemo || (result as any).code === 'DEMO_MODE' || localStorage.getItem('mb_is_demo') === 'true');
          onAuthSuccess?.(localIsDemo);
          setIsAuthenticated(true);

          // Non-blocking background verification with cloud server
          fetch(`${API_BASE_URL}/api/auth/verify-license`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              token,
              hardwareFingerprint: currentHwid,
            }),
          })
            .then(async (res) => {
              if (res.ok) {
                const data = await res.json();
                const serverIsDemo = Boolean(data.isDemo || !data.isLicensed);
                localStorage.setItem('mb_is_demo', serverIsDemo ? 'true' : 'false');
                onAuthSuccess?.(serverIsDemo);
              } else if (res.status === 401 || res.status === 403) {
                const errData = await res.json().catch(() => ({}));
                if (['DEVICE_MISMATCH', 'ORG_ACCESS_DENIED'].includes(errData.code)) {
                  console.warn('[VendorAuthGate] Cloud revoked token:', errData);
                  localStorage.removeItem('mb_license_token');
                  setIsAuthenticated(false);
                  setErrorMsg(errData.error || 'Lisensi tidak lagi valid di server.');
                }
              }
            })
            .catch((netErr) => {
              // Network offline / unreachable: ALLOW local operation with valid cached token
              console.log('[VendorAuthGate] Cloud unreachable, continuing in verified offline mode:', netErr.message);
            });
        } else {
          // Token is corrupted, expired past grace period, or bound to another machine
          console.warn('[VendorAuthGate] Cached token failed validation:', result.code);
          setErrorMsg(result.message);
          setIsAuthenticated(false);
        }
      } else {
        setIsAuthenticated(false);
      }

      setLoading(false);
    };

    initAuth();
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
      const res = await fetch(`${API_BASE_URL}/api/auth/vendor-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          hardwareFingerprint: hwid,
          deviceName,
          osType: isWindows ? 'windows' : 'mac',
          appVersion: '1.0.0-rc.1',
        }),
      });

      const data = await res.json();

      if (res.ok && data.success && data.licenseToken) {
        // Verify token immediately before saving
        const verifier = new LicenseVerifier(true);
        const check = verifier.verifyTokenString(data.licenseToken, hwid);
        if (!check.isValid) {
          setErrorMsg(check.message || 'Token lisensi yang diterima tidak valid.');
          return;
        }

        const isDemo = Boolean(data.isDemo || check.isDemo);
        localStorage.setItem('mb_license_token', data.licenseToken);
        localStorage.setItem('mb_vendor_org', JSON.stringify(data.organization));
        localStorage.setItem('mb_device_info', JSON.stringify(data.device));
        localStorage.setItem('mb_is_demo', isDemo ? 'true' : 'false');

        if (check.isGracePeriod) {
          setGracePeriodNotice(check.message);
        } else {
          setGracePeriodNotice(null);
        }
        onAuthSuccess?.(isDemo);
        setIsAuthenticated(true);
      } else {
        let msg = data.error || 'Login gagal. Periksa kembali email dan password akun Anda.';
        if (data.code === 'DEVICE_QUOTA_EXCEEDED') {
          msg = 'Kuota perangkat untuk paket lisensi ini telah penuh. Silakan nonaktifkan perangkat lama di Dashboard Web.';
        } else if (data.code === 'ORG_ACCESS_DENIED') {
          msg = 'Akses vendor tidak aktif atau ditolak (ORG_ACCESS_DENIED).';
        } else if (data.code === 'INVALID_CREDENTIALS') {
          msg = 'Email atau password akun vendor salah.';
        }
        setErrorMsg(msg);
      }
    } catch (err: any) {
      setErrorMsg('Gagal terhubung ke server autentikasi (NETWORK_UNAVAILABLE): ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-screen bg-[#090A0C] flex items-center justify-center text-neutral-500 text-sm font-mono">
        Verifikasi Lisensi Hardware...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="h-screen w-screen bg-[#090A0C] text-[#EDEDED] flex items-center justify-center p-6 select-none font-sans antialiased">
        <div className="max-w-lg w-full bg-[#121316] border border-white/[0.08] rounded-2xl p-8 md:p-10 shadow-2xl flex flex-col gap-6 animate-fadeIn">
          {/* Header */}
          <div className="flex flex-col items-center text-center gap-3">
            <img
              src={logoHeader}
              alt="MingleBooth"
              className="h-12 md:h-14 w-auto object-contain"
            />
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
                Aktivasi MingleBooth Studio
              </h1>
              <p className="text-sm text-neutral-400 max-w-xs mt-1.5 leading-relaxed">
                Masuk dengan akun vendor terdaftar untuk mengaktivasi laptop booth ini.
              </p>
            </div>
          </div>

          {/* ID Perangkat Laptop */}
          <div className="p-4 rounded-xl bg-[#181A1F] border border-white/[0.05] flex items-center justify-between text-sm font-mono">
            <div className="flex items-center gap-2.5 text-neutral-400">
              <Laptop className="w-4 h-4 text-neutral-400 flex-shrink-0" />
              <span>ID Perangkat Laptop:</span>
            </div>
            <span className="text-neutral-200 truncate ml-2 text-xs">{hwid || 'Mendeteksi...'}</span>
          </div>

          {/* Error Alert */}
          {errorMsg && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-400" />
              <div className="flex-1 leading-relaxed">{errorMsg}</div>
            </div>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-neutral-300 font-medium">Email Vendor</label>
              <input
                type="email"
                required
                placeholder="vendor@photobooth.id"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-[#181A1F] border border-white/[0.08] text-sm rounded-xl px-4 py-3.5 text-white outline-none focus:border-white/30 transition-colors w-full"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-neutral-300 font-medium">Password</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-[#181A1F] border border-white/[0.08] text-sm rounded-xl px-4 py-3.5 text-white outline-none focus:border-white/30 transition-colors w-full"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-neutral-300 font-medium">Nama Laptop / Booth</label>
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="Contoh: Laptop Booth Utama"
                className="bg-[#181A1F] border border-white/[0.08] text-sm rounded-xl px-4 py-3.5 text-white outline-none focus:border-white/30 transition-colors w-full"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 w-full py-4 rounded-xl bg-white hover:bg-neutral-200 text-black font-bold text-sm flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] shadow-md"
            >
              <ShieldCheck className="w-5 h-5" />
              <span>{submitting ? 'Memverifikasi Perangkat...' : 'Aktivasi Perangkat Ini'}</span>
            </button>
          </form>

          {/* Informational Guidance for Unpaid Accounts */}
          <div className="pt-2 border-t border-white/[0.08] flex flex-col items-center gap-1.5 text-center">
            <span className="text-[11px] font-semibold text-neutral-300">
              Belum Memiliki Langganan Aktif?
            </span>
            <p className="text-[11px] text-neutral-400 leading-relaxed px-1">
              Akun vendor terdaftar yang belum memiliki langganan aktif akan otomatis masuk ke <strong className="text-amber-400">Mode Demo</strong> untuk pengujian kamera lokal sebelum aktivasi berbayar.
            </p>
          </div>

          <div className="flex flex-col items-center gap-2.5 pt-3 border-t border-white/[0.06]">
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
                className="h-9 w-auto object-contain opacity-75 group-hover:opacity-100 transition-opacity"
              />
            </a>
            <div className="text-center text-xs text-neutral-500">
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

  return (
    <>
      {gracePeriodNotice && (
        <div className="fixed top-0 left-0 right-0 z-[9999] bg-amber-500/95 backdrop-blur text-black text-xs font-semibold px-4 py-1.5 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{gracePeriodNotice}</span>
          </div>
          <span className="text-[10px] bg-black/20 text-black px-2 py-0.5 rounded font-mono uppercase">
            Mode Tenggang Offline
          </span>
        </div>
      )}
      {children}
    </>
  );
};
