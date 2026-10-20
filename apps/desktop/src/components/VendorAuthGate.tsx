import React, { useEffect, useState } from 'react';
import { ShieldCheck, Laptop, AlertCircle, Mail, Lock, Loader2, Copy, Check } from 'lucide-react';
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
  const [copiedHwid, setCopiedHwid] = useState(false);

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const isWindows = typeof navigator !== 'undefined' && /win/i.test(navigator.userAgent || (navigator as any).platform || '');
  const [deviceName, setDeviceName] = useState(() =>
    isWindows ? 'Windows Operator Booth 1' : 'MacBook Operator Booth 1'
  );
  const [hwid, setHwid] = useState('');

  const handleCopyHwid = () => {
    if (!hwid) return;
    navigator.clipboard.writeText(hwid);
    setCopiedHwid(true);
    setTimeout(() => setCopiedHwid(false), 2000);
  };

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
      <div className="h-screen w-screen bg-[#08090C] flex items-center justify-center text-neutral-500 text-sm font-mono">
        Verifikasi Lisensi Hardware...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="h-screen w-full bg-[#08090C] bg-[radial-gradient(ellipse_80%_80%_at_50%_25%,#161922_0%,#08090C_100%)] text-[#EDEDED] flex items-center justify-center p-4 sm:p-6 lg:p-8 select-none font-sans antialiased overflow-y-auto">
        <div className="w-full max-w-[620px] bg-[#12141A] border border-white/[0.08] rounded-[24px] sm:rounded-[26px] px-6 py-6 sm:px-9 sm:py-7 md:px-10 md:py-8 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] flex flex-col my-auto animate-fadeIn">
          {/* 1. Logo & Header */}
          <div className="flex flex-col items-center text-center">
            <img
              src={logoHeader}
              alt="MingleBooth"
              style={{ height: '32px', width: 'auto' }}
              className="h-8 sm:h-9 w-auto object-contain mx-auto"
            />
            <div className="mt-3.5 mb-1">
              <h1 className="text-xl sm:text-[25px] font-bold tracking-tight text-white leading-tight">
                Aktivasi MingleBooth Studio
              </h1>
              <p className="text-xs sm:text-[13px] text-neutral-400 font-normal leading-relaxed max-w-[320px] mx-auto mt-1">
                Masuk dengan akun vendor terdaftar untuk mengaktivasi laptop booth ini.
              </p>
            </div>
          </div>

          {/* 2. ID Perangkat Laptop Panel */}
          <div className="mt-4 mb-3.5 px-4 py-2.5 sm:px-4.5 sm:py-3 rounded-2xl bg-[#171A22] border border-white/[0.06] flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 shrink-0">
              <Laptop className="w-4 h-4 text-neutral-400 shrink-0" />
              <div className="flex flex-col text-left leading-tight">
                <span className="text-[11px] sm:text-[12px] text-neutral-300 font-medium">ID Perangkat</span>
                <span className="text-[11px] sm:text-[12px] text-neutral-400">Laptop:</span>
              </div>
            </div>
            <div className="flex items-center gap-2 overflow-hidden justify-end">
              <span
                className="text-neutral-300 font-mono text-xs sm:text-[13px] truncate text-right select-all"
                title={hwid || 'Mendeteksi...'}
              >
                {hwid || 'Mendeteksi...'}
              </span>
              {hwid && (
                <button
                  type="button"
                  onClick={handleCopyHwid}
                  title={copiedHwid ? 'Tersalin ke clipboard' : 'Salin ID Perangkat'}
                  className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors shrink-0"
                >
                  {copiedHwid ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Error Alert */}
          {errorMsg && (
            <div className="mb-3.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs sm:text-sm flex items-start gap-2.5 animate-fadeIn">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
              <div className="flex-1 leading-relaxed">{errorMsg}</div>
            </div>
          )}

          {/* 3. Form */}
          <form onSubmit={handleLogin} className="flex flex-col gap-3 sm:gap-3.5">
            <div className="flex flex-col gap-1">
              <label className="text-xs sm:text-[13px] text-neutral-300 font-medium">Email Vendor</label>
              <div className="h-[44px] sm:h-[46px] px-3.5 rounded-xl bg-[#171A22] border border-white/[0.08] focus-within:border-white/30 focus-within:ring-1 focus-within:ring-white/10 transition-all flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-neutral-400 shrink-0" />
                <input
                  type="email"
                  required
                  placeholder="vendor@photobooth.id"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-transparent border-none outline-none text-white text-xs sm:text-sm w-full placeholder:text-neutral-500 font-normal"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs sm:text-[13px] text-neutral-300 font-medium">Password</label>
              <div className="h-[44px] sm:h-[46px] px-3.5 rounded-xl bg-[#171A22] border border-white/[0.08] focus-within:border-white/30 focus-within:ring-1 focus-within:ring-white/10 transition-all flex items-center gap-2.5">
                <Lock className="w-4 h-4 text-neutral-400 shrink-0" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-transparent border-none outline-none text-white text-xs sm:text-sm w-full placeholder:text-neutral-500 font-normal"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs sm:text-[13px] text-neutral-300 font-medium">Nama Laptop / Booth</label>
              <div className="h-[44px] sm:h-[46px] px-3.5 rounded-xl bg-[#171A22] border border-white/[0.08] focus-within:border-white/30 focus-within:ring-1 focus-within:ring-white/10 transition-all flex items-center gap-2.5">
                <Laptop className="w-4 h-4 text-neutral-400 shrink-0" />
                <input
                  type="text"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  placeholder="MacBook Operator Booth 1"
                  className="bg-transparent border-none outline-none text-white text-xs sm:text-sm w-full placeholder:text-neutral-500 font-normal"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-1.5 w-full h-[46px] rounded-xl bg-white hover:bg-neutral-100 disabled:opacity-75 text-black font-semibold text-xs sm:text-sm flex items-center justify-center gap-2.5 transition-all active:scale-[0.99] shadow-sm cursor-pointer disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-black" />
                  <span>Memverifikasi Perangkat...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4.5 h-4.5 text-black" />
                  <span>Aktivasi Perangkat Ini</span>
                </>
              )}
            </button>
          </form>

          {/* 4. Pembatas Visual */}
          <div className="my-4 border-t border-white/[0.07]" />

          {/* 5. Informasi Mode Demo */}
          <div className="flex flex-col items-center gap-1 text-center px-1">
            <span className="text-[11px] sm:text-xs font-semibold text-neutral-300">
              Belum Memiliki Langganan Aktif?
            </span>
            <p className="text-[11px] sm:text-xs text-neutral-400 leading-relaxed max-w-md mx-auto">
              Akun vendor tidak aktif yang belum memiliki langganan aktif akan otomatis masuk ke{' '}
              <strong className="text-amber-400 font-medium">Mode Demo</strong>{' '}
              untuk pengujian kamera lokal sebelum aktivasi berbayar.
            </p>
          </div>

          {/* 6. Footer Branding */}
          <div className="mt-4 flex items-center justify-center gap-2 text-xs">
            <img
              src={logoHeader}
              alt="MingleBooth"
              style={{ height: '16px', width: 'auto' }}
              className="h-4 w-auto object-contain opacity-85 hover:opacity-100 transition-opacity"
            />
            <span className="text-neutral-400 font-normal text-[11px] sm:text-xs">
              by{' '}
              <a
                href="https://www.instagram.com/sebuah.kenang?igsi=MW11ZXo2N3puOWM3eA%3D%3D&utm_source=qr"
                target="_blank"
                rel="noopener noreferrer"
                className="text-neutral-300 hover:text-white transition-colors font-normal"
                title="Kunjungi Instagram @sebuah.kenang"
              >
                sebuah.kenang
              </a>
            </span>
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

