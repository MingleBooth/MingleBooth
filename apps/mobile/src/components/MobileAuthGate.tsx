import React, { useState } from 'react';
import { useMobileBoothStore, MobileVendorUser } from '../store/mobile-booth-store';
import { getMobileDeviceInfo, ensureValidHwid } from '../lib/mobileDevice';
import { setCachedLicenseToken } from '../lib/mobileLicense';
import {
  ShieldCheck,
  AlertTriangle,
  LogIn,
  X,
  LogOut,
  CheckCircle2,
  Server,
  Lock,
  Mail,
  Eye,
  EyeOff,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  isMandatory?: boolean;
}

export const MobileAuthGate: React.FC<Props> = ({ isOpen, onClose, isMandatory = false }) => {
  const { user, isDemoMode, backendUrl, setUser, setBackendUrl, logout, initLicense } =
    useMobileBoothStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [customServer, setCustomServer] = useState(backendUrl || 'https://www.minglebooth.id');

  if (!isOpen && !isMandatory) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMessage('Email dan kata sandi wajib diisi.');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const deviceInfo = getMobileDeviceInfo();
      if (!deviceInfo.hwid || deviceInfo.hwid.trim() === '') {
        throw new Error('Sidik Jari Hardware (HWID) perangkat kosong. Gagal mengidentifikasi perangkat.');
      }

      const baseUrl = customServer.trim().replace(/\/$/, '');

      // Safe diagnostic logging (never log password or tokens!)
      console.log('[MobileAuthGate] Mengirim otorisasi perangkat ke server:', {
        server: baseUrl,
        email: email.trim(),
        hwidLength: deviceInfo.hwid.length,
        hwidPrefix: deviceInfo.hwid.substring(0, 8) + '...',
        platform: deviceInfo.platform,
        deviceName: deviceInfo.deviceName,
      });

      const res = await fetch(`${baseUrl}/api/auth/vendor-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          hardwareFingerprint: deviceInfo.hwid,
          hwid: deviceInfo.hwid,
          deviceName: `${deviceInfo.deviceName} (${deviceInfo.platform.toUpperCase()})`,
          osType: deviceInfo.platform,
          appVersion: '1.0.0-rc.3',
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 400) {
          throw new Error(data.error || 'Data otorisasi tidak lengkap. Pastikan email, kata sandi, dan HWID terisi.');
        } else if (res.status === 401) {
          throw new Error(data.error || 'Email atau kata sandi vendor salah. Silakan periksa kembali kredensial Anda.');
        } else if (res.status === 403) {
          if (data.code === 'DEVICE_QUOTA_EXCEEDED') {
            throw new Error(
              data.error ||
              `Batas kuota perangkat tercapai (${data.currentActiveCount || 0}/${data.maxQuota || 1}). Silakan non-aktifkan salah satu perangkat di Vendor Dashboard.`
            );
          }
          throw new Error(data.error || 'Akses bilik ditolak. Akun belum aktif atau langganan kedaluwarsa.');
        } else if (res.status === 404) {
          throw new Error(data.error || 'Akun vendor tidak terdaftar pada sistem MingleBooth.');
        }
        throw new Error(data.error || data.message || `Gagal login (HTTP ${res.status})`);
      }

      const token = data.licenseToken || data.token || '';
      const org = data.organization || data.org || {};
      const userObj = data.user || {};

      const vendorUser: MobileVendorUser = {
        id: userObj.id || org.id || 'vendor_mob',
        email: userObj.email || email.trim(),
        vendorName: org.name || userObj.vendorName || userObj.name || 'Vendor Partner',
        organizationId: org.id || userObj.organizationId || data.orgId || '',
        planTier: org.planTier || data.subscription?.planTier || data.planTier || 'starter',
        deviceLimit: org.maxDevicesQuota ?? data.subscription?.deviceLimit ?? 1,
        activeDevicesCount: org.activeDevicesCount ?? data.subscription?.activeDevicesCount ?? 1,
        isDemo: Boolean(data.isDemo || (org.subscriptionStatus && org.subscriptionStatus !== 'active')),
        token,
      };

      console.log('[MobileAuthGate] Otorisasi berhasil:', {
        vendorName: vendorUser.vendorName,
        planTier: vendorUser.planTier,
        deviceLimit: vendorUser.deviceLimit,
        isDemo: vendorUser.isDemo,
        hasToken: Boolean(token),
      });

      setUser(vendorUser);
      setBackendUrl(baseUrl);
      if (token) {
        setCachedLicenseToken(token);
      }
      await initLicense();
      onClose();
    } catch (err: any) {
      console.error('[MobileAuthGate] Login error:', err?.message || err);
      if (
        err?.message?.includes('Failed to fetch') ||
        err?.message?.includes('NetworkError') ||
        err?.message?.includes('Load failed')
      ) {
        setErrorMessage(`Gagal terhubung ke server ${customServer}. Periksa koneksi internet atau URL server.`);
      } else {
        setErrorMessage(err.message || 'Terjadi kesalahan saat menghubungkan ke server.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── 1. MODAL VIEW FOR AUTHENTICATED USERS (MANAGE ACCOUNT & LOGOUT) ──
  if (user && !isMandatory) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none animate-fadeIn">
        <div className="w-full max-w-md bg-[#13151A] border border-white/10 rounded-3xl p-6 shadow-2xl relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-full text-neutral-400 hover:text-white bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-white">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Akun Vendor Mobile</h2>
              <p className="text-xs text-neutral-400">Otorisasi & Kuota Perangkat MingleBooth</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-black/40 border border-white/[0.06]">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-semibold text-white">{user.vendorName}</span>
                <span
                  className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                    isDemoMode
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  }`}
                >
                  {isDemoMode ? 'Mode Demo' : `Plan: ${user.planTier}`}
                </span>
              </div>
              <p className="text-xs text-neutral-400">{user.email}</p>
              <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs text-neutral-300">
                <span>Kuota Perangkat:</span>
                <span className="font-semibold text-white font-mono">
                  {user.activeDevicesCount} / {user.deviceLimit} Booth Aktif
                </span>
              </div>
            </div>

            {isDemoMode && (
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                <p>
                  Akun belum memiliki langganan aktif. Aplikasi berjalan dalam <strong>Mode Demo</strong> (Upload cloud dan cetak terkunci).
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                if (confirm('Keluar dari sesi operator dan kunci akses bilik photobooth?')) {
                  logout();
                  onClose();
                }
              }}
              className="w-full py-3 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 font-semibold text-xs flex items-center justify-center gap-2 transition cursor-pointer active:scale-95"
            >
              <LogOut className="w-4 h-4" />
              <span>Keluar Akun (Logout)</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── 2. FULLSCREEN MANDATORY LOGIN GATE (FOR UNAUTHENTICATED USERS) ──
  // Per P0.5: No bypass link, no dismiss button, strictly blocks unauthenticated access
  return (
    <div className="fixed inset-0 z-50 bg-[#090A0C] flex flex-col items-center justify-center p-4 sm:p-6 select-none overflow-y-auto">
      <div className="w-full max-w-md bg-[#111318] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl relative animate-fadeIn my-auto">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <img
            src="/logo-minglebooth-header.png"
            alt="MingleBooth"
            className="h-8 w-auto object-contain mb-3"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <h1 className="text-xl font-bold text-white tracking-tight">Masuk Operator MingleBooth</h1>
          <p className="text-xs text-neutral-400 mt-1 max-w-xs leading-relaxed">
            Masukkan akun vendor terdaftar untuk mengaktifkan lisensi bilik photobooth pada perangkat ini.
          </p>
        </div>

        {errorMessage && (
          <div className="mb-4 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <span className="leading-relaxed">{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-300 mb-1.5 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-neutral-400" />
              <span>Email Vendor</span>
            </label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vendor@photobooth.id"
              className="w-full px-4 py-3 rounded-2xl bg-black/50 border border-white/10 text-white text-sm focus:outline-none focus:border-white/30 placeholder-neutral-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-300 mb-1.5 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-neutral-400" />
              <span>Kata Sandi</span>
            </label>
            <div className="relative flex items-center">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-4 pr-11 py-3 rounded-2xl bg-black/50 border border-white/10 text-white text-sm focus:outline-none focus:border-white/30 placeholder-neutral-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                title={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                className="absolute right-3 p-1.5 text-neutral-400 hover:text-white transition-colors cursor-pointer rounded-lg hover:bg-white/[0.06] focus:outline-none focus:ring-1 focus:ring-white/20 active:scale-95"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4 text-neutral-300" />
                ) : (
                  <Eye className="w-4 h-4 text-neutral-400" />
                )}
              </button>
            </div>
          </div>

          {/* Backend Server Configuration (Collapsible) */}
          <details className="text-xs text-neutral-400 group">
            <summary className="cursor-pointer hover:text-neutral-300 flex items-center gap-1.5 py-1">
              <Server className="w-3.5 h-3.5 text-neutral-500" />
              <span>Pengaturan Server Backend</span>
            </summary>
            <div className="mt-2 p-3 rounded-2xl bg-black/40 border border-white/[0.06] space-y-1.5">
              <label className="block text-[11px] text-neutral-400">URL Server Cloud</label>
              <input
                type="text"
                value={customServer}
                onChange={(e) => setCustomServer(e.target.value)}
                placeholder="https://www.minglebooth.id"
                className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/10 text-neutral-200 text-xs font-mono focus:outline-none focus:border-white/30"
              />
              <p className="text-[10px] text-neutral-500">
                Default: https://www.minglebooth.id. Gunakan URL custom jika menggunakan server staging / LAN lokal.
              </p>
            </div>
          </details>

          {/* Primary Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-2xl bg-white hover:bg-neutral-200 disabled:opacity-50 text-black font-bold text-sm shadow-xl flex items-center justify-center gap-2 transition cursor-pointer active:scale-[0.98]"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                <span>Memverifikasi Akun...</span>
              </span>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>Masuk Akun Vendor</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-white/[0.06] text-center">
          <p className="text-[11px] text-neutral-500 leading-relaxed">
            Belum memiliki lisensi operator? Hubungi tim admin MingleBooth untuk registrasi kuota perangkat.
          </p>
        </div>
      </div>
    </div>
  );
};
