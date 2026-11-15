import React, { useState, useEffect } from 'react';
import { useMobileBoothStore, MobileVendorUser } from '../store/mobile-booth-store';
import { getMobileDeviceInfo } from '../lib/mobileDevice';
import { setCachedLicenseToken } from '../lib/mobileLicense';
import {
  IS_TEST_ISOLATION,
  safeApiFetch,
  pairWithBridge,
  hasValidSession,
  assertValidTestAccount,
  assertValidBackendUrl,
  onSessionExpired,
} from '../lib/networkGuard';
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
  KeyRound,
  RefreshCw,
  Radio,
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
  const [customServer, setCustomServer] = useState(
    backendUrl || (IS_TEST_ISOLATION ? '' : 'https://www.minglebooth.id')
  );

  // Pairing state (Test Isolation Mode)
  const [pairingPin, setPairingPin] = useState('');
  const [isPaired, setIsPaired] = useState(hasValidSession());
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingSuccessMsg, setPairingSuccessMsg] = useState(
    hasValidSession() ? 'Bridge Terhubung (Sesi Aktif)' : ''
  );

  // Listen for session expiry from network guard
  useEffect(() => {
    return onSessionExpired(() => {
      setIsPaired(false);
      setPairingSuccessMsg('');
      setErrorMessage('Sesi pengujian bridge telah kedaluwarsa. Silakan lakukan pairing ulang.');
    });
  }, []);

  if (!isOpen && !isMandatory) return null;

  const handlePairBridge = async (e: React.FormEvent) => {
    e.preventDefault();
    setPairingLoading(true);
    setErrorMessage('');
    setPairingSuccessMsg('');

    try {
      const deviceInfo = getMobileDeviceInfo();
      const result = await pairWithBridge(customServer, pairingPin, deviceInfo.hwid);
      if (result.success) {
        setIsPaired(true);
        setPairingSuccessMsg('Bridge Berhasil Terhubung! Sesi pengujian aktif.');
        setBackendUrl(customServer.trim().replace(/\/+$/, ''));
      }
    } catch (err: any) {
      setIsPaired(false);
      setErrorMessage(err.message || 'Gagal menghubungkan ke isolated bridge.');
    } finally {
      setPairingLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMessage('Email dan kata sandi wajib diisi.');
      return;
    }

    // In Test Isolation Mode: strict pre-checks
    if (IS_TEST_ISOLATION) {
      try {
        assertValidTestAccount(email);
        assertValidBackendUrl(customServer);
      } catch (guardErr: any) {
        setErrorMessage(guardErr.message);
        return;
      }
      if (!isPaired && !hasValidSession()) {
        setErrorMessage('Wajib menghubungkan (pairing) dengan bridge pengujian terlebih dahulu.');
        return;
      }
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
        platform: deviceInfo.platform,
        deviceName: deviceInfo.deviceName,
      });

      const res = await safeApiFetch(`${baseUrl}/api/auth/vendor-login`, {
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
          if (data.code === 'FORBIDDEN_NON_SYNTHETIC_ACCOUNT') {
            throw new Error(data.error || 'Hanya akun pengujian sintetis yang diizinkan pada bridge.');
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
        setErrorMessage(`Gagal terhubung ke server ${customServer}. Periksa koneksi bridge atau pairing sesi.`);
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
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">{user.vendorName}</h2>
              <p className="text-xs text-neutral-400">{user.email}</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-3 mb-6">
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-400">Paket Langganan</span>
              <span className="font-bold text-white uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10">
                {user.planTier} Plan
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-400">Status Bilik</span>
              <span
                className={`font-semibold flex items-center gap-1 ${
                  isDemoMode ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                {isDemoMode ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Mode Demo (Bilik Terbatas)</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Lisensi Bilik Aktif</span>
                  </>
                )}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-400">Server Backend</span>
              <span className="font-mono text-[11px] text-neutral-300 max-w-[200px] truncate" title={backendUrl}>
                {backendUrl || 'Tidak diset'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              logout();
              onClose();
            }}
            className="w-full py-3.5 rounded-2xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 font-bold text-sm flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Keluar Akun Vendor</span>
          </button>
        </div>
      </div>
    );
  }

  // ── 2. MODAL VIEW FOR LOGIN & ACTIVATION ──
  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none animate-fadeIn overflow-y-auto">
      <div className="w-full max-w-md bg-[#13151A] border border-white/10 rounded-3xl p-6 sm:p-7 shadow-2xl relative my-auto">
        {!isMandatory && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-full text-neutral-400 hover:text-white bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center text-white">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-wide">
              {IS_TEST_ISOLATION ? 'Aktivasi Bilik Uji Terisolasi' : 'Aktivasi Bilik Operator'}
            </h2>
            <p className="text-xs text-neutral-400">
              {IS_TEST_ISOLATION
                ? 'MingleBooth Isolated Test Environment'
                : 'Masuk dengan akun vendor untuk membuka seluruh fitur bilik foto.'}
            </p>
          </div>
        </div>

        {/* Alert Error Box */}
        {errorMessage && (
          <div className="mb-4 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-start gap-2.5 animate-fadeIn">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
            <p className="leading-relaxed">{errorMessage}</p>
          </div>
        )}

        {/* Alert Success Box */}
        {pairingSuccessMsg && (
          <div className="mb-4 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <p>{pairingSuccessMsg}</p>
          </div>
        )}

        {/* ── TEST ISOLATION MODE: PAIRING SECTION ── */}
        {IS_TEST_ISOLATION && (
          <div className="mb-5 p-4 rounded-2xl bg-white/[0.04] border border-amber-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className={`w-4 h-4 ${isPaired ? 'text-emerald-400 animate-pulse' : 'text-amber-400'}`} />
                <span className="text-xs font-bold text-white">Koneksi Isolated Test Bridge</span>
              </div>
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                  isPaired
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}
              >
                {isPaired ? 'TERHUBUNG' : 'BUTUH PAIRING'}
              </span>
            </div>

            <div className="space-y-2">
              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">URL Bridge Lokal</label>
                <input
                  type="text"
                  value={customServer}
                  onChange={(e) => {
                    setCustomServer(e.target.value);
                    setIsPaired(false);
                  }}
                  placeholder="http://10.0.2.2:3099 atau http://127.0.0.1:3099"
                  className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/10 text-neutral-200 text-xs font-mono focus:outline-none focus:border-white/30"
                />
              </div>

              <div>
                <label className="block text-[11px] text-neutral-400 mb-1">
                  PIN Pairing 6-Digit (Lihat Konsol Terminal Bridge)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={6}
                    value={pairingPin}
                    onChange={(e) => setPairingPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="Contoh: 856879"
                    className="flex-1 px-3 py-2 rounded-xl bg-black/60 border border-white/10 text-neutral-200 text-xs font-mono tracking-widest text-center focus:outline-none focus:border-white/30"
                  />
                  <button
                    type="button"
                    onClick={handlePairBridge}
                    disabled={pairingLoading || pairingPin.length !== 6 || !customServer}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-bold text-xs flex items-center gap-1.5 transition cursor-pointer active:scale-95"
                  >
                    {pairingLoading ? (
                      <span className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    ) : (
                      <KeyRound className="w-3.5 h-3.5" />
                    )}
                    <span>{isPaired ? 'Re-Pair' : 'Hubungkan'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── FORM LOGIN VENDOR ── */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">Email Vendor</label>
            <div className="relative flex items-center">
              <Mail className="w-4 h-4 text-neutral-400 absolute left-3.5 pointer-events-none" />
              <input
                type="email"
                required
                value={email}
                disabled={IS_TEST_ISOLATION && !isPaired}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={IS_TEST_ISOLATION ? 'test@synthetic.studio' : 'operator@vendorstudio.id'}
                className="w-full pl-10 pr-3.5 py-3 rounded-2xl bg-white/[0.04] border border-white/10 text-white text-sm focus:outline-none focus:border-white/30 disabled:opacity-40 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">Kata Sandi</label>
            <div className="relative flex items-center">
              <Lock className="w-4 h-4 text-neutral-400 absolute left-3.5 pointer-events-none" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                disabled={IS_TEST_ISOLATION && !isPaired}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-3 rounded-2xl bg-white/[0.04] border border-white/10 text-white text-sm focus:outline-none focus:border-white/30 disabled:opacity-40 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 p-1.5 text-neutral-400 hover:text-white transition-colors cursor-pointer rounded-lg hover:bg-white/[0.06]"
              >
                {showPassword ? <EyeOff className="w-4 h-4 text-neutral-300" /> : <Eye className="w-4 h-4 text-neutral-400" />}
              </button>
            </div>
          </div>

          {/* Backend Server Configuration (Collapsible for Production Build) */}
          {!IS_TEST_ISOLATION && (
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
              </div>
            </details>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || (IS_TEST_ISOLATION && !isPaired)}
            className="w-full py-3.5 rounded-2xl bg-white hover:bg-neutral-200 disabled:opacity-40 text-black font-bold text-sm shadow-xl flex items-center justify-center gap-2 transition cursor-pointer active:scale-[0.98]"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                <span>Memverifikasi Akun...</span>
              </span>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>
                  {IS_TEST_ISOLATION
                    ? isPaired
                      ? 'Masuk Akun Vendor Sintetis'
                      : 'Wajib Pairing Terlebih Dahulu'
                    : 'Masuk Akun Vendor'}
                </span>
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-white/[0.06] text-center">
          <p className="text-[11px] text-neutral-500 leading-relaxed">
            {IS_TEST_ISOLATION
              ? 'Mode Pengujian Terisolasi: Komunikasi jaringan dibatasi strictly pada Local Test Bridge.'
              : 'Belum memiliki lisensi operator? Hubungi tim admin MingleBooth untuk registrasi kuota perangkat.'}
          </p>
        </div>
      </div>
    </div>
  );
};
