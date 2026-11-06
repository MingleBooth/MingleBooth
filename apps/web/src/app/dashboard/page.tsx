'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Layers,
  Upload,
  Download,
  ExternalLink,
  Laptop,
  Check,
  X,
  Camera,
  Trash2,
  FolderDown,
  RefreshCw,
  CreditCard,
  ShieldCheck,
  Shield,
  AlertCircle,
  HardDriveDownload,
  LogOut,
  Sparkles,
  Palette,
  Smartphone,
  Tablet,
  QrCode,
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  ArrowRight,
  Monitor,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function DashboardPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [devices, setDevices] = useState<any[]>([]);
  const [org, setOrg] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Download Modal
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);

  // Device Manager States
  const [deviceQuota, setDeviceQuota] = useState<{
    activeCount: number;
    maxQuota: number;
    planTier: string;
    isFull: boolean;
  } | null>(null);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [deactivatingDevice, setDeactivatingDevice] = useState<any | null>(null);
  const [deactivatingSubmitting, setDeactivatingSubmitting] = useState(false);
  const [deviceFeedback, setDeviceFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    // Auth Session Guard (Support local mb_web_user and Supabase Session)
    const initAuth = async () => {
      let userObj: any = null;
      if (typeof window !== 'undefined') {
        const sessionUser = localStorage.getItem('mb_web_user');
        if (sessionUser) {
          try {
            const parsed = JSON.parse(sessionUser);
            if (parsed && (parsed.id || parsed.email)) {
              userObj = parsed;
            }
          } catch {
            // ignore JSON parse error
          }
        }
      }

      if (!userObj) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          userObj = {
            id: session.user.id,
            email: session.user.email,
            name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0],
          };
          if (typeof window !== 'undefined') {
            localStorage.setItem('mb_web_user', JSON.stringify(userObj));
          }
        }
      }

      if (!userObj) {
        router.push('/login');
        return;
      }

      setCurrentUser(userObj);
      fetchDashboardData();

      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        if (params.get('welcome') === '1') {
          setShowWelcome(true);
        }
      }
    };

    initAuth();
  }, [router]);

  const handleLogout = async () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('mb_web_user');
      localStorage.removeItem('mb_web_token');
    }
    await supabase.auth.signOut();
    setCurrentUser(null);
    router.push('/login');
  };

  const getAuthHeaders = (): Record<string, string> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('mb_web_token') || '' : '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  };

  const fetchDevices = async () => {
    setDeviceLoading(true);
    setDeviceError(null);
    try {
      const res = await fetch('/api/vendor/devices', { headers: getAuthHeaders() });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Gagal memuat daftar perangkat.');
      }
      const data = await res.json();
      if (data.devices) setDevices(data.devices);
      if (data.quota) setDeviceQuota(data.quota);
    } catch (err: any) {
      setDeviceError(err.message || 'Terjadi kesalahan saat memuat perangkat.');
    } finally {
      setDeviceLoading(false);
    }
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    const headers = getAuthHeaders();
    try {
      const [eventsRes, devRes] = await Promise.all([
        fetch('/api/vendor/events', { headers }).then((r) => r.json()).catch(() => ({})),
        fetch('/api/vendor/devices', { headers }).then((r) => r.json()).catch(() => ({})),
      ]);

      if (eventsRes.org) setOrg(eventsRes.org);
      if (devRes.devices) setDevices(devRes.devices);
      if (devRes.quota) setDeviceQuota(devRes.quota);
    } catch (err) {
      console.error('Fetch dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDeactivateModal = (device: any) => {
    setDeactivatingDevice(device);
    setDeviceFeedback(null);
  };

  const handleConfirmDeactivate = async () => {
    if (!deactivatingDevice) return;
    setDeactivatingSubmitting(true);
    setDeviceFeedback(null);
    try {
      const res = await fetch('/api/auth/deactivate-device', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ deviceId: deactivatingDevice.id }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDeviceFeedback({
          type: 'success',
          message: data.message || `Perangkat "${deactivatingDevice.deviceName || deactivatingDevice.device_name}" berhasil dinonaktifkan.`,
        });
        setDeactivatingDevice(null);
        await fetchDevices();
      } else {
        setDeviceFeedback({
          type: 'error',
          message: data.error || 'Gagal menonaktifkan perangkat.',
        });
      }
    } catch (err: any) {
      setDeviceFeedback({
        type: 'error',
        message: 'Gagal terhubung ke server: ' + err.message,
      });
    } finally {
      setDeactivatingSubmitting(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-mb-bg text-mb-muted flex items-center justify-center font-mono text-xs">
        Memverifikasi Akun Vendor...
      </div>
    );
  }

  const isSubscriptionActive = Boolean(
    org?.subscription_status === 'active' &&
    org?.subscription_expires_at &&
    new Date(org.subscription_expires_at).getTime() > Date.now()
  );
  const isExpired = Boolean(
    !isSubscriptionActive && org?.subscription_status === 'expired'
  );

  const winUrl =
    process.env.NEXT_PUBLIC_DOWNLOAD_WIN_URL &&
    !process.env.NEXT_PUBLIC_DOWNLOAD_WIN_URL.includes('drive.google.com')
      ? process.env.NEXT_PUBLIC_DOWNLOAD_WIN_URL
      : 'https://github.com/MingleBooth/MingleBooth/releases/download/v1.0.0-rc.2/MingleBooth-Studio-Setup-1.0.0-rc.2.exe';

  const macUrl =
    process.env.NEXT_PUBLIC_DOWNLOAD_MAC_URL &&
    !process.env.NEXT_PUBLIC_DOWNLOAD_MAC_URL.includes('drive.google.com')
      ? process.env.NEXT_PUBLIC_DOWNLOAD_MAC_URL
      : 'https://github.com/MingleBooth/MingleBooth/releases/download/v1.0.0-rc.2/MingleBooth-Studio-1.0.0-rc.2.dmg';

  const apkUrl =
    process.env.NEXT_PUBLIC_DOWNLOAD_APK_URL &&
    !process.env.NEXT_PUBLIC_DOWNLOAD_APK_URL.includes('drive.google.com')
      ? process.env.NEXT_PUBLIC_DOWNLOAD_APK_URL
      : 'https://github.com/MingleBooth/MingleBooth/releases/download/v1.0.0-rc.2/MingleBooth-Studio-1.0.0-rc.2.apk';

  return (
    <div className="min-h-screen bg-mb-bg text-mb-ink flex flex-col font-sans select-none antialiased transition-colors">
      {/* Top Console Header */}
      <header className="h-16 px-4 sm:px-8 border-b border-mb-line bg-mb-surface sticky top-0 z-30 flex items-center justify-between">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <Link href="/" className="flex items-center gap-2.5 flex-shrink-0 group">
            <img
              src="/logo-minglebooth-header.png"
              alt="MingleBooth"
              className="h-7 sm:h-8 w-auto object-contain"
            />
          </Link>
          <span className="text-mb-line hidden sm:inline">/</span>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-mb-muted hidden sm:inline">
              Vendor Console
            </span>
            <span className="text-xs text-mb-ink font-heading font-bold truncate">
              {org?.name || 'Studio Vendor'}
            </span>
            <span className="hidden md:inline-block text-[11px] text-mb-muted font-mono truncate">
              ({currentUser.email})
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 text-xs flex-shrink-0">
          {(currentUser?.role === 'SUPER_ADMIN' || currentUser?.email === 'admin@minglebooth.com') && (
            <Link
              href="/admin"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-black font-semibold text-xs transition-all hover:opacity-90 shadow-sm border border-white/20"
              title="Buka Portal Superadmin"
            >
              <Shield className="w-3.5 h-3.5 text-[#FFD21F]" />
              <span className="hidden sm:inline">Admin Portal</span>
            </Link>
          )}

          <Link
            href="/billing"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-mb-accent text-mb-accent-ink font-semibold text-xs transition-all hover:brightness-95 active:scale-95 shadow-sm"
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span className="capitalize">{org?.plan_tier || 'Pro'}</span>
            <span className="hidden sm:inline">• Lisensi</span>
          </Link>

          <button
            onClick={() => setIsDownloadModalOpen(true)}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-mb-line bg-mb-surface hover:bg-neutral-100 dark:hover:bg-neutral-800 text-mb-ink text-xs font-medium transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Unduh Studio</span>
          </button>

          <button
            onClick={handleLogout}
            className="text-mb-muted hover:text-red-500 flex items-center gap-1.5 transition-colors px-2 py-1.5 text-xs font-medium"
            title="Keluar dari akun"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Keluar</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 flex flex-col gap-8">
        {/* 1. Welcome Alert for Newly Registered Vendors */}
        {showWelcome && (
          <div className="p-4 sm:p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs flex items-start sm:items-center justify-between gap-4 shadow-sm animate-fadeIn">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0">
                <Check className="w-5 h-5" />
              </div>
              <div>
                <span className="font-heading font-bold text-sm block">Selamat Datang di MingleBooth Studio!</span>
                <p className="text-neutral-700 dark:text-neutral-300 mt-0.5 text-xs leading-relaxed">
                  Akun vendor gratis Anda telah aktif. Silakan unduh aplikasi <strong>MingleBooth Studio</strong> di bawah untuk mulai menguji coba kamera fisik dan sesi photobooth di laptop Anda.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowWelcome(false)}
              className="p-1 rounded-lg text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors flex-shrink-0"
              title="Tutup pemberitahuan"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 2. Authoritative Subscription Status Card */}
        {!isSubscriptionActive ? (
          <section className="p-6 rounded-2xl bg-mb-surface border-2 border-mb-line flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 shadow-sm relative overflow-hidden">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-mb-accent/20 border border-mb-accent/40 flex items-center justify-center text-mb-ink flex-shrink-0 mt-0.5">
                <ShieldCheck className="w-6 h-6 text-mb-ink" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-mb-accent text-mb-accent-ink uppercase tracking-wider">
                    {isExpired ? 'Langganan Kedaluwarsa' : 'Mode Demo • Uji Coba Gratis'}
                  </span>
                  <h2 className="text-base sm:text-lg font-heading font-extrabold text-mb-ink">
                    {org?.name || 'Studio Vendor'}
                  </h2>
                </div>
                <p className="text-xs sm:text-sm text-mb-muted mt-2 max-w-2xl leading-relaxed">
                  {isExpired
                    ? 'Masa aktif langganan Anda telah berakhir. Perpanjang lisensi Anda untuk mengaktifkan kembali Galeri Cloud Tamu, Live QR smartphone, dan armada booth komersial.'
                    : 'Akun Anda berada dalam Mode Demo. Anda dapat mengunduh Studio dan menguji coba koneksi kamera fisik Sony mirrorless & webcam secara lokal gratis. Aktifkan paket langganan saat siap membuka Galeri Cloud Tamu, Live QR smartphone, dan armada booth komersial.'}
                </p>
              </div>
            </div>

            <Link
              href="/billing"
              className="h-11 px-5 rounded-xl bg-mb-accent hover:brightness-95 text-mb-accent-ink font-heading font-bold text-xs sm:text-sm flex items-center gap-2 transition-all shadow-md active:scale-95 whitespace-nowrap flex-shrink-0 self-start sm:self-auto"
            >
              <span>{isExpired ? 'Perpanjang Langganan' : 'Lihat Paket & Aktifkan Lisensi'}</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </section>
        ) : (
          <section className="p-6 rounded-2xl bg-mb-surface border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500 flex-shrink-0 mt-0.5">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 uppercase tracking-wider">
                    Lisensi Aktif • Paket {org?.plan_tier?.toUpperCase()}
                  </span>
                  <h2 className="text-base sm:text-lg font-heading font-extrabold text-mb-ink">
                    {org?.name || 'Studio Vendor'}
                  </h2>
                </div>
                <p className="text-xs sm:text-sm text-mb-muted mt-1.5 leading-relaxed">
                  Lisensi aktif hingga {org?.subscription_expires_at ? new Date(org.subscription_expires_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Aktif'}.
                  {' '}Kuota: <strong>{deviceQuota?.activeCount ?? 0} dari {deviceQuota?.maxQuota ?? (org?.max_devices_quota || 1)}</strong> perangkat booth aktif terdaftar.
                </p>
              </div>
            </div>

            <Link
              href="/billing"
              className="h-10 px-4 rounded-xl border border-mb-line bg-mb-surface hover:bg-neutral-100 dark:hover:bg-neutral-800 text-mb-ink text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap flex-shrink-0 self-start sm:self-auto"
            >
              <CreditCard className="w-4 h-4 text-mb-muted" />
              <span>Kelola Billing</span>
            </Link>
          </section>
        )}

        {/* 3. Pusat Unduhan Resmi: Software & Aplikasi MingleBooth */}
        <section className="p-6 sm:p-8 rounded-2xl bg-mb-surface border border-mb-line flex flex-col gap-6 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-mb-line pb-5">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 flex items-center justify-center flex-shrink-0 p-1.5 rounded-2xl bg-neutral-100 dark:bg-neutral-800 border border-mb-line">
                <img
                  src="/logo-studio-transparent.png"
                  alt="MingleBooth Studio"
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-heading font-extrabold text-mb-ink">
                    Software &amp; Aplikasi MingleBooth Studio
                  </h2>
                  <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-neutral-200 dark:bg-neutral-800 text-mb-muted border border-mb-line uppercase tracking-wider">
                    Versi v1.0.0-rc.2
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-mb-muted mt-1 leading-relaxed">
                  Pilih installer resmi sesuai sistem operasi perangkat booth operator Anda.
                </p>
              </div>
            </div>
          </div>

          {/* 3 Platform Installer Cards (Windows, macOS, Android) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Windows EXE */}
            <div className="p-5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-mb-line flex flex-col justify-between gap-4">
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-black/5 dark:bg-white/10 flex items-center justify-center text-mb-ink">
                    <Laptop className="w-5 h-5 text-mb-ink" />
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-black/5 dark:bg-white/10 text-mb-muted border border-mb-line font-mono">
                    137 MB · 64-bit
                  </span>
                </div>
                <div>
                  <h3 className="font-heading font-bold text-sm text-mb-ink">Windows (.exe)</h3>
                  <p className="text-xs text-mb-muted mt-1 leading-relaxed">
                    Windows 10 &amp; 11. Driver kamera Sony mirrorless USB SDK &amp; printer thermal/dye-sub DNP.
                  </p>
                </div>
              </div>
              <a
                href={winUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-10 px-4 rounded-xl bg-white hover:bg-neutral-200 text-[#0B0B0D] font-heading font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-sm active:scale-98"
              >
                <Download className="w-4 h-4 text-[#0B0B0D]" />
                <span>Unduh Windows (.exe)</span>
              </a>
            </div>

            {/* macOS DMG */}
            <div className="p-5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-mb-line flex flex-col justify-between gap-4">
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-black/5 dark:bg-white/10 flex items-center justify-center text-mb-ink">
                    <Monitor className="w-5 h-5 text-mb-ink" />
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-black/5 dark:bg-white/10 text-mb-muted border border-mb-line font-mono">
                    155 MB · Universal
                  </span>
                </div>
                <div>
                  <h3 className="font-heading font-bold text-sm text-mb-ink">macOS (.dmg)</h3>
                  <p className="text-xs text-mb-muted mt-1 leading-relaxed">
                    macOS 12+ (Monterey s/d Sequoia). Siap untuk Apple Silicon (M1/M2/M3/M4) &amp; Intel.
                  </p>
                </div>
              </div>
              <a
                href={macUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-10 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white border border-white/10 font-heading font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-sm active:scale-98"
              >
                <Download className="w-4 h-4 text-neutral-300" />
                <span>Unduh Mac (.dmg)</span>
              </a>
            </div>

            {/* Android APK */}
            <div className="p-5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-mb-line flex flex-col justify-between gap-4">
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-black/5 dark:bg-white/10 flex items-center justify-center text-mb-ink">
                    <Smartphone className="w-5 h-5 text-mb-ink" />
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-black/5 dark:bg-white/10 text-mb-muted border border-mb-line font-mono">
                    10 MB · Tablet
                  </span>
                </div>
                <div>
                  <h3 className="font-heading font-bold text-sm text-mb-ink">Android (.apk)</h3>
                  <p className="text-xs text-mb-muted mt-1 leading-relaxed">
                    Android 8.0+. Mode Kiosk Tablet layar sentuh, remote operator nirkabel, &amp; USB OTG Sony.
                  </p>
                </div>
              </div>
              <a
                href={apkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-10 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white border border-white/10 font-heading font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-sm active:scale-98"
              >
                <Download className="w-4 h-4 text-neutral-300" />
                <span>Unduh Android (.apk)</span>
              </a>
            </div>
          </div>

          {/* 3 Step Setup Guide */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-mb-line">
            <div className="p-4 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-mb-line flex flex-col gap-1.5">
              <div className="flex items-center gap-2.5 text-mb-ink font-heading font-bold text-xs sm:text-sm">
                <span className="w-5 h-5 rounded-full bg-mb-accent text-[#0B0B0D] text-xs flex items-center justify-center font-bold">1</span>
                <span>Instal Aplikasi</span>
              </div>
              <p className="text-xs text-mb-muted leading-relaxed">
                Unduh installer resmi (.exe untuk Windows, .dmg untuk macOS, .apk untuk tablet) lalu jalankan di perangkat operator booth Anda.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-mb-line flex flex-col gap-1.5">
              <div className="flex items-center gap-2.5 text-mb-ink font-heading font-bold text-xs sm:text-sm">
                <span className="w-5 h-5 rounded-full bg-mb-accent text-[#0B0B0D] text-xs flex items-center justify-center font-bold">2</span>
                <span>Login Akun Vendor</span>
              </div>
              <p className="text-xs text-mb-muted leading-relaxed">
                Buka MingleBooth Studio dan masuk menggunakan email ({currentUser?.email}) serta password terdaftar Anda.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-mb-line flex flex-col gap-1.5">
              <div className="flex items-center gap-2.5 text-mb-ink font-heading font-bold text-xs sm:text-sm">
                <span className="w-5 h-5 rounded-full bg-mb-accent text-[#0B0B0D] text-xs flex items-center justify-center font-bold">3</span>
                <span>Uji Kamera &amp; Cetak</span>
              </div>
              <p className="text-xs text-mb-muted leading-relaxed">
                Sambungkan kabel USB kamera Sony atau webcam. Live view countdown dan cetak foto langsung siap digunakan offline.
              </p>
            </div>
          </div>
        </section>

        {/* Section 3: Registered Devices & Device Quota Management */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl sm:text-2xl font-heading font-extrabold text-mb-ink">
                  Manajemen Perangkat Operator
                </h2>
                <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-neutral-200 dark:bg-neutral-800 text-mb-muted border border-mb-line uppercase tracking-wider">
                  {deviceQuota?.planTier ? `${deviceQuota.planTier} Plan` : org?.plan_tier ? `${org.plan_tier} Plan` : 'Starter'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-mb-muted mt-1">
                {deviceQuota
                  ? `${deviceQuota.activeCount} dari ${deviceQuota.maxQuota} perangkat booth aktif terdaftar.`
                  : `${devices.filter((d: any) => d.isActive ?? d.is_active).length} perangkat aktif terdaftar.`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={fetchDevices}
                disabled={deviceLoading}
                className="px-3.5 py-2 rounded-xl border border-mb-line bg-mb-surface hover:bg-neutral-100 dark:hover:bg-neutral-800 text-mb-ink text-xs font-semibold flex items-center gap-2 transition-colors disabled:opacity-50"
                title="Segarkan daftar perangkat"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${deviceLoading ? 'animate-spin' : ''}`} />
                <span>Segarkan</span>
              </button>
            </div>
          </div>

          {/* Device Feedback Notification */}
          {deviceFeedback && (
            <div
              className={`p-4 rounded-xl border text-xs flex items-start justify-between gap-3 animate-fadeIn ${
                deviceFeedback.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                  : 'bg-red-500/10 border-red-500/20 text-red-800 dark:text-red-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {deviceFeedback.type === 'success' ? (
                  <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                )}
                <span>{deviceFeedback.message}</span>
              </div>
              <button
                onClick={() => setDeviceFeedback(null)}
                className="text-mb-muted hover:text-mb-ink transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Quota Full Notice Banner */}
          {deviceQuota?.isFull && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">
                <span className="font-heading font-bold block text-sm">Kuota Perangkat Penuh ({deviceQuota.activeCount} / {deviceQuota.maxQuota})</span>
                Semua slot perangkat untuk paket Anda sedang digunakan. Untuk menghubungkan laptop booth baru, silakan nonaktifkan salah satu laptop yang tidak sedang digunakan di bawah ini.
              </div>
            </div>
          )}

          {/* Device Error State */}
          {deviceError && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-300 text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span>{deviceError}</span>
              </div>
              <button
                onClick={fetchDevices}
                className="px-3 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-800 dark:text-red-200 text-xs font-semibold transition-colors"
              >
                Coba Lagi
              </button>
            </div>
          )}

          {/* Device List Table / Container */}
          <div className="bg-mb-surface border border-mb-line rounded-2xl divide-y divide-mb-line overflow-hidden shadow-sm">
            {deviceLoading && devices.length === 0 ? (
              <div className="p-10 flex flex-col items-center justify-center gap-3 text-mb-muted">
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span className="text-xs">Memuat daftar perangkat...</span>
              </div>
            ) : devices.length === 0 ? (
              <div className="p-10 text-center flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-neutral-100 dark:bg-neutral-900 border border-mb-line flex items-center justify-center text-mb-muted">
                  <Laptop className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-heading font-bold text-mb-ink">Belum Ada Perangkat Terhubung</h3>
                  <p className="text-xs text-mb-muted max-w-sm mt-1 leading-relaxed">
                    Buka MingleBooth Studio di laptop booth Anda dan login menggunakan akun ini untuk menghubungkannya secara otomatis.
                  </p>
                </div>
              </div>
            ) : (
              devices.map((d: any) => {
                const isActive = d.isActive ?? d.is_active;
                const devName = d.deviceName || d.device_name || 'Laptop Booth';
                const osDisplay =
                  (d.osType || d.os_type)?.toLowerCase() === 'mac'
                    ? 'macOS'
                    : (d.osType || d.os_type)?.toLowerCase() === 'windows'
                    ? 'Windows'
                    : (d.osType || d.os_type)?.toUpperCase() || 'OS';
                const version = d.appVersion || d.app_version || '1.0.0';
                const actDate = d.activatedAt || d.activated_at;
                const seenDate = d.lastSeenAt || d.last_seen_at;
                const isStaff = currentUser?.role === 'VENDOR_STAFF';

                return (
                  <div
                    key={d.id}
                    className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-900/30 transition-colors"
                  >
                    <div className="flex items-start sm:items-center gap-3.5">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        isActive
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          : 'bg-neutral-100 dark:bg-neutral-900 text-mb-muted border border-mb-line'
                      }`}>
                        <Laptop className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-heading font-bold text-sm text-mb-ink">{devName}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-neutral-200 dark:bg-neutral-800 text-mb-muted border border-mb-line">
                            {osDisplay}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono text-mb-muted bg-neutral-100 dark:bg-neutral-900 border border-mb-line">
                            v{version}
                          </span>
                        </div>
                        <div className="text-[11px] text-mb-muted flex items-center gap-2 mt-1 flex-wrap font-mono">
                          {actDate && (
                            <span>Diaktivasi: {new Date(actDate).toLocaleDateString('id-ID')}</span>
                          )}
                          {seenDate && (
                            <>
                              <span>•</span>
                              <span>Terakhir aktif: {new Date(seenDate).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 self-end sm:self-center">
                      {isActive ? (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Aktif
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-neutral-200 dark:bg-neutral-800 text-mb-muted border border-mb-line flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
                          Nonaktif
                        </span>
                      )}

                      {isActive ? (
                        <button
                          onClick={() => handleOpenDeactivateModal(d)}
                          disabled={isStaff}
                          title={isStaff ? 'Hanya Vendor Owner yang dapat menonaktifkan perangkat' : 'Lepas perangkat ini dari kuota'}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                            isStaff
                              ? 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400 border-mb-line cursor-not-allowed'
                              : 'border-mb-line bg-mb-surface hover:bg-red-500/10 hover:border-red-500/30 text-mb-muted hover:text-red-500'
                          }`}
                        >
                          Nonaktifkan
                        </button>
                      ) : (
                        <span className="text-xs text-mb-muted font-medium px-2 py-1">
                          Riwayat
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-mb-line px-6 sm:px-12 py-10 bg-mb-surface text-xs text-mb-muted flex flex-col items-center gap-6">
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
            className="h-14 sm:h-16 w-auto object-contain transition-opacity group-hover:opacity-90"
          />
        </a>
        <div className="flex flex-wrap items-center justify-center gap-6 text-mb-ink font-medium text-xs">
          <Link href="/" className="hover:text-mb-muted transition-colors">
            Beranda
          </Link>
          <Link href="/billing" className="hover:text-mb-muted transition-colors">
            Billing &amp; Lisensi
          </Link>
          <button
            onClick={() => setIsDownloadModalOpen(true)}
            className="hover:text-mb-muted transition-colors font-medium"
          >
            Unduh Software Studio
          </button>
        </div>
        <div className="pt-4 border-t border-mb-line w-full max-w-4xl flex flex-col sm:flex-row items-center justify-between gap-2 text-mb-muted text-[11px]">
          <span>
            © 2026 MingleBooth by{' '}
            <a
              href="https://www.instagram.com/sebuah.kenang?igsi=MW11ZXo2N3puOWM3eA%3D%3D&utm_source=qr"
              target="_blank"
              rel="noopener noreferrer"
              className="text-mb-ink hover:underline font-semibold"
            >
              sebuah.kenang
            </a>
            . Setiap Momen Berarti.
          </span>
          <span>Enterprise Cloud Vendor Console</span>
        </div>
      </footer>

      {/* ── Modal: Unduh & Buka MingleBooth Studio ── */}
      {isDownloadModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-fadeIn select-none">
          <div className="max-w-xl w-full bg-mb-surface border-2 border-mb-line rounded-2xl p-6 sm:p-8 flex flex-col gap-6 shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-mb-line pb-4">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-mb-line flex items-center justify-center flex-shrink-0 p-1">
                  <img
                    src="/logo-studio-transparent.png"
                    alt="MingleBooth Studio"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-heading font-extrabold text-mb-ink">
                    Unduh MingleBooth Studio Desktop
                  </h2>
                  <p className="text-xs text-mb-muted">
                    Aplikasi native photobooth kiosk untuk laptop atau komputer booth Anda.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsDownloadModalOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-mb-muted flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* DIRECT INSTALLERS */}
            <div className="flex flex-col gap-3">
              {/* Windows */}
              <div className="p-4 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] border border-mb-line flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-black/5 dark:bg-white/10 flex items-center justify-center text-mb-ink">
                    <Laptop className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-heading font-bold text-mb-ink">Windows (.exe)</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-black/5 dark:bg-white/10 text-mb-muted border border-mb-line">
                        64-bit
                      </span>
                    </div>
                    <p className="text-xs text-mb-muted mt-0.5">Windows 10 &amp; 11 • Sony Alpha &amp; Thermal Printer</p>
                  </div>
                </div>
                <a
                  href={winUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-9 px-4 rounded-xl bg-white hover:bg-neutral-200 text-[#0B0B0D] font-heading font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm flex-shrink-0"
                >
                  <Download className="w-3.5 h-3.5 text-[#0B0B0D]" />
                  <span>Unduh EXE</span>
                </a>
              </div>

              {/* macOS */}
              <div className="p-4 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] border border-mb-line flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-black/5 dark:bg-white/10 flex items-center justify-center text-mb-ink">
                    <Monitor className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-heading font-bold text-mb-ink">macOS (.dmg)</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-black/5 dark:bg-white/10 text-mb-muted border border-mb-line">
                        Universal
                      </span>
                    </div>
                    <p className="text-xs text-mb-muted mt-0.5">Apple Silicon (M1/M2/M3/M4) &amp; Intel</p>
                  </div>
                </div>
                <a
                  href={macUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-9 px-4 rounded-xl bg-white hover:bg-neutral-200 text-[#0B0B0D] font-heading font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm flex-shrink-0"
                >
                  <Download className="w-3.5 h-3.5 text-[#0B0B0D]" />
                  <span>Unduh DMG</span>
                </a>
              </div>

              {/* Android */}
              <div className="p-4 rounded-xl bg-black/[0.03] dark:bg-white/[0.05] border border-mb-line flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-black/5 dark:bg-white/10 flex items-center justify-center text-mb-ink">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-heading font-bold text-mb-ink">Android (.apk)</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-black/5 dark:bg-white/10 text-mb-muted border border-mb-line">
                        Tablet
                      </span>
                    </div>
                    <p className="text-xs text-mb-muted mt-0.5">Android 8.0+ • Sony PTP USB OTG</p>
                  </div>
                </div>
                <a
                  href="https://github.com/MingleBooth/MingleBooth/releases/download/v1.0.0-rc.2/MingleBooth-Studio-1.0.0-rc.2.apk"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-9 px-4 rounded-xl border border-mb-line bg-mb-surface hover:bg-black/5 dark:hover:bg-white/10 text-mb-ink font-heading font-bold text-xs flex items-center gap-1.5 transition-all flex-shrink-0"
                >
                  <Download className="w-3.5 h-3.5 text-mb-muted" />
                  <span>Unduh APK</span>
                </a>
              </div>
            </div>

            {/* Link to full download page */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-neutral-100 dark:bg-neutral-900 border border-mb-line">
              <span className="text-xs text-mb-muted">
                Periksa Checksum SHA-256 resmi &amp; panduan instalasi?
              </span>
              <Link
                href="/download"
                className="text-xs font-semibold text-mb-ink hover:underline flex items-center gap-1"
              >
                <span>Halaman Download</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Konfirmasi Nonaktifkan Perangkat ── */}
      {deactivatingDevice && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-fadeIn select-none">
          <div className="max-w-md w-full bg-mb-surface border-2 border-mb-line rounded-2xl p-6 flex flex-col gap-5 shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-mb-line pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-heading font-extrabold text-mb-ink">Nonaktifkan Perangkat</h3>
                  <p className="text-xs text-mb-muted">Lepaskan lisensi aktif dari perangkat booth</p>
                </div>
              </div>
              <button
                onClick={() => setDeactivatingDevice(null)}
                disabled={deactivatingSubmitting}
                className="w-8 h-8 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-mb-muted flex items-center justify-center transition-colors disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content Details */}
            <div className="flex flex-col gap-3">
              <p className="text-xs text-mb-ink leading-relaxed">
                Apakah Anda yakin ingin menonaktifkan perangkat berikut dari organisasi Anda?
              </p>

              <div className="p-4 rounded-xl bg-neutral-100 dark:bg-neutral-900 border border-mb-line flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-mb-muted">Nama Perangkat:</span>
                  <span className="text-xs font-heading font-bold text-mb-ink">
                    {deactivatingDevice.deviceName || deactivatingDevice.device_name || 'Laptop Booth'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-mb-muted">Sistem Operasi:</span>
                  <span className="text-xs font-mono text-mb-ink">
                    {deactivatingDevice.osType || deactivatingDevice.os_type || 'Unknown OS'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-mb-muted">Versi Aplikasi:</span>
                  <span className="text-xs font-mono text-mb-ink">
                    v{deactivatingDevice.appVersion || deactivatingDevice.app_version || '1.0.0'}
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-800 dark:text-amber-200 text-xs leading-relaxed">
                Perangkat ini tidak akan dapat membuka sesi photobooth baru sampai diaktifkan kembali. Slot kuota akan langsung dibebaskan untuk perangkat lain. Riwayat perangkat tetap tersimpan aman.
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-3 border-t border-mb-line">
              <button
                type="button"
                onClick={() => setDeactivatingDevice(null)}
                disabled={deactivatingSubmitting}
                className="flex-1 py-2.5 rounded-xl border border-mb-line bg-mb-surface hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-semibold text-mb-muted hover:text-mb-ink transition-colors disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeactivate}
                disabled={deactivatingSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-heading font-bold text-xs transition-colors shadow-sm flex items-center justify-center gap-2"
              >
                {deactivatingSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Memproses...</span>
                  </>
                ) : (
                  <span>Ya, Nonaktifkan</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
