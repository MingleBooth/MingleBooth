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
} from 'lucide-react';
import QRCode from 'qrcode';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [org, setOrg] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // New Event Modal
  const [isNewEventModalOpen, setIsNewEventModalOpen] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const [newEventDate, setNewEventDate] = useState(new Date().toISOString().split('T')[0]);
  const [newOutputType, setNewOutputType] = useState<'photo' | 'gif' | 'both'>('photo');

  // New Custom Template Modal (Vendor Custom Upload Only)
  const [isNewTemplateModalOpen, setIsNewTemplateModalOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateRatio, setNewTemplateRatio] = useState<'4:5' | '2:6' | '1:1'>('4:5');
  const [newTemplateSlots, setNewTemplateSlots] = useState(2);
  const [uploadedFrameName, setUploadedFrameName] = useState<string | null>(null);
  const [uploadedFrameBase64, setUploadedFrameBase64] = useState<string | null>(null);

  // Template Search, Filter & Pagination
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateFilterRatio, setTemplateFilterRatio] = useState<string>('all');
  const [templateFilterSlots, setTemplateFilterSlots] = useState<string>('all');
  const [templatePage, setTemplatePage] = useState(1);
  const TEMPLATES_PER_PAGE = 6;

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
    // Auth Session Guard
    const sessionUser = localStorage.getItem('mb_web_user');
    if (!sessionUser) {
      router.push('/login');
      return;
    }
    setCurrentUser(JSON.parse(sessionUser));
    fetchDashboardData();

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('welcome') === '1') {
        setShowWelcome(true);
      }
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('mb_web_user');
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
      const [eventsRes, tplRes, devRes] = await Promise.all([
        fetch('/api/vendor/events', { headers }).then((r) => r.json()),
        fetch('/api/vendor/templates', { headers }).then((r) => r.json()),
        fetch('/api/vendor/devices', { headers }).then((r) => r.json()),
      ]);

      if (eventsRes.events) setEvents(eventsRes.events);
      if (eventsRes.org) setOrg(eventsRes.org);
      if (tplRes.templates) setTemplates(tplRes.templates);
      if (devRes.devices) setDevices(devRes.devices);
      if (devRes.quota) setDeviceQuota(devRes.quota);
    } catch (err) {
      console.error('Fetch dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEvent = async () => {
    if (!newEventName) return;
    try {
      const res = await fetch('/api/vendor/events', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: newEventName,
          date: newEventDate,
          outputType: newOutputType,
        }),
      });
      if (res.ok) {
        setNewEventName('');
        setIsNewEventModalOpen(false);
        fetchDashboardData();
      }
    } catch (err) {
      console.error('Create event error:', err);
    }
  };

  const handleDeleteEvent = async (id: string, name: string) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus acara "${name}"? Semua data dan foto pada acara ini akan ikut terhapus.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/vendor/events?id=${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        fetchDashboardData();
      } else {
        const data = await res.json();
        alert(data.error || 'Gagal menghapus acara');
      }
    } catch (err) {
      console.error('Delete event error:', err);
    }
  };

  const handleOpenTemplateModal = () => {
    setNewTemplateName('');
    setNewTemplateRatio('4:5');
    setNewTemplateSlots(2);
    setUploadedFrameName(null);
    setUploadedFrameBase64(null);
    setIsNewTemplateModalOpen(true);
  };

  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim()) {
      alert('Mohon masukkan nama desain template.');
      return;
    }
    if (!uploadedFrameBase64) {
      alert('Mohon pilih file PNG bingkai transparan terlebih dahulu.');
      return;
    }
    try {
      const res = await fetch('/api/vendor/templates', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: newTemplateName.trim(),
          aspectRatio: newTemplateRatio,
          slots: newTemplateSlots,
          overlayStoragePath: uploadedFrameName || 'custom-frame.png',
          overlayBase64: uploadedFrameBase64,
          email: currentUser?.email,
        }),
      });
      if (res.ok) {
        setIsNewTemplateModalOpen(false);
        fetchDashboardData();
      } else {
        const data = await res.json();
        alert(data.error || 'Gagal menyimpan template');
      }
    } catch (err) {
      console.error('Create template error:', err);
    }
  };

  // Filtered & Paginated Templates
  const filteredTemplates = useMemo(() => {
    return templates.filter((tpl) => {
      if (templateSearch.trim()) {
        const q = templateSearch.toLowerCase().trim();
        const matchName = (tpl.name || '').toLowerCase().includes(q);
        const matchRatio = (tpl.aspect_ratio || '').toLowerCase().includes(q);
        if (!matchName && !matchRatio) return false;
      }
      if (templateFilterRatio !== 'all' && tpl.aspect_ratio !== templateFilterRatio) {
        return false;
      }
      if (templateFilterSlots !== 'all' && String(tpl.slots) !== String(templateFilterSlots)) {
        return false;
      }
      return true;
    });
  }, [templates, templateSearch, templateFilterRatio, templateFilterSlots]);

  const totalTemplatePages = Math.max(1, Math.ceil(filteredTemplates.length / TEMPLATES_PER_PAGE));
  const currentPage = Math.min(templatePage, totalTemplatePages);
  const paginatedTemplates = filteredTemplates.slice(
    (currentPage - 1) * TEMPLATES_PER_PAGE,
    currentPage * TEMPLATES_PER_PAGE
  );

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus template ini?')) return;
    try {
      await fetch(`/api/vendor/templates?id=${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      fetchDashboardData();
    } catch (err) {
      console.error('Delete template error:', err);
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
      <div className="min-h-screen bg-[#090A0C] text-[#EDEDED] flex items-center justify-center font-mono text-xs text-neutral-500">
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

  return (
    <div className="min-h-screen bg-[#090A0C] text-[#EDEDED] flex flex-col font-sans select-none antialiased">
      {/* Top Minimal Navbar */}
      <header className="h-14 px-4 sm:px-12 border-b border-white/[0.07] flex items-center justify-between">
        <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
          <Link href="/" className="flex items-center gap-2.5 group flex-shrink-0">
            <img
              src="/logo-minglebooth-header.png"
              alt="MingleBooth"
              className="h-7 sm:h-8 w-auto object-contain"
            />
          </Link>
          <span className="text-xs text-neutral-500 hidden sm:inline">/</span>
          <span className="text-xs text-neutral-400 font-medium truncate hidden sm:inline">Vendor Console</span>
          <span className="hidden md:inline-block text-[11px] text-neutral-500 font-mono truncate">
            ({currentUser.email})
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 text-xs flex-shrink-0">
          <Link
            href="/billing"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-neutral-200 hover:text-white transition-colors"
          >
            <CreditCard className="w-3.5 h-3.5 text-neutral-400" />
            <span className="capitalize">{org?.plan_tier || 'Pro'} Tier</span>
            <span className="text-neutral-500 hidden sm:inline">•</span>
            <span className="text-emerald-400 hidden sm:inline">Billing & Lisensi</span>
          </Link>

          <button
            onClick={handleLogout}
            className="text-neutral-400 hover:text-rose-400 flex items-center gap-1 transition-colors px-1 py-1"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Keluar</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-10 flex flex-col gap-8 sm:gap-10">
        {/* 1. Welcome Alert for Newly Registered Vendors */}
        {showWelcome && (
          <div className="p-4 sm:p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start sm:items-center justify-between gap-4 shadow-xl animate-fadeIn">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mt-0.5 flex-shrink-0">
                <Check className="w-5 h-5" />
              </div>
              <div>
                <span className="font-bold text-white text-sm block">Selamat Datang di MingleBooth Studio!</span>
                <p className="text-neutral-300 mt-0.5 text-xs leading-relaxed">
                  Akun vendor gratis Anda telah aktif. Silakan unduh aplikasi <strong>MingleBooth Studio</strong> di bawah untuk mulai menguji coba kamera fisik dan sesi photobooth di laptop Anda.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowWelcome(false)}
              className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.08] transition-colors flex-shrink-0"
              title="Tutup pemberitahuan"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 2. Authoritative Subscription Status Card */}
        {!isSubscriptionActive ? (
          <section className="p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-[#171922] to-[#121318] border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 shadow-xl relative overflow-hidden">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-400 flex-shrink-0 mt-0.5">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wide">
                    {isExpired ? 'Langganan Kedaluwarsa' : 'Mode Demo • Belum Berlangganan'}
                  </span>
                  <h2 className="text-sm sm:text-base font-bold text-white">
                    {org?.name || 'Studio Vendor'}
                  </h2>
                </div>
                <p className="text-xs text-neutral-300 mt-1.5 max-w-xl leading-relaxed">
                  {isExpired
                    ? 'Masa aktif langganan Anda telah berakhir. Perpanjang lisensi Anda untuk mengaktifkan kembali Galeri Cloud Tamu, Live QR smartphone, dan armada booth komersial.'
                    : 'Akun Anda berada dalam Mode Demo. Anda dapat mengunduh Studio dan menguji coba koneksi kamera fisik Sony & webcam secara lokal gratis. Aktifkan paket langganan saat siap membuka Galeri Cloud Tamu, Live QR smartphone, dan armada booth.'
                  }
                </p>
              </div>
            </div>

            <Link
              href="/billing"
              className="h-9 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95 whitespace-nowrap flex-shrink-0 self-start sm:self-auto"
            >
              <span>{isExpired ? 'Perpanjang Langganan' : 'Lihat Paket & Aktifkan Langganan'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </section>
        ) : (
          <section className="p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-[#11161B] to-[#121318] border border-emerald-500/25 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 shadow-xl">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-400 flex-shrink-0 mt-0.5">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase tracking-wide">
                    Langganan Aktif • {org?.plan_tier?.toUpperCase()}
                  </span>
                  <h2 className="text-sm sm:text-base font-bold text-white">
                    {org?.name || 'Studio Vendor'}
                  </h2>
                </div>
                <p className="text-xs text-neutral-400 mt-1.5 leading-relaxed">
                  Lisensi aktif hingga {org?.subscription_expires_at ? new Date(org.subscription_expires_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Aktif'}.
                  {' '}Kuota: {deviceQuota?.activeCount ?? 0} dari {deviceQuota?.maxQuota ?? (org?.max_devices_quota || 1)} perangkat booth terpakai.
                </p>
              </div>
            </div>

            <Link
              href="/billing"
              className="h-8 px-3.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-neutral-200 hover:text-white border border-white/[0.08] text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0 self-start sm:self-auto"
            >
              <CreditCard className="w-3.5 h-3.5 text-neutral-400" />
              <span>Kelola Langganan</span>
            </Link>
          </section>
        )}

        {/* 3. Kartu Utama: Unduh MingleBooth Studio */}
        <section className="p-6 rounded-2xl bg-[#121318] border border-white/[0.08] flex flex-col gap-6 shadow-xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 flex items-center justify-center flex-shrink-0 mt-0.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo-studio-transparent.png"
                  alt="MingleBooth Studio"
                  className="w-full h-full object-contain"
                />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-bold text-white">
                    Unduh MingleBooth Studio Desktop
                  </h2>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-white/[0.08] text-neutral-300 border border-white/10 uppercase tracking-wider">
                    Windows &amp; macOS
                  </span>
                </div>
                <p className="text-xs text-neutral-400 mt-1 leading-relaxed max-w-xl">
                  Aplikasi native photobooth kiosk untuk laptop operator Anda. Menghubungkan kamera Sony mirrorless via USB SDK, live view 30fps tanpa lag, cetak instan, dan antrean foto offline.
                </p>
              </div>
            </div>

            {/* Direct Download Buttons */}
            <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto flex-shrink-0">
              <a
                href={
                  process.env.NEXT_PUBLIC_DOWNLOAD_WIN_URL &&
                  !process.env.NEXT_PUBLIC_DOWNLOAD_WIN_URL.includes('drive.google.com')
                    ? process.env.NEXT_PUBLIC_DOWNLOAD_WIN_URL
                    : 'https://github.com/MingleBooth/MingleBooth/releases/latest/download/MingleBooth.Studio.Setup.1.0.0.exe'
                }
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 px-4 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-xs flex items-center gap-2 transition-all shadow-md active:scale-98 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5 text-black" />
                <span>Unduh Windows (.exe)</span>
              </a>
              <a
                href={
                  process.env.NEXT_PUBLIC_DOWNLOAD_MAC_URL &&
                  !process.env.NEXT_PUBLIC_DOWNLOAD_MAC_URL.includes('drive.google.com')
                    ? process.env.NEXT_PUBLIC_DOWNLOAD_MAC_URL
                    : 'https://github.com/MingleBooth/MingleBooth/releases/latest/download/MingleBooth.Studio-1.0.0.dmg'
                }
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 px-4 rounded-xl bg-[#1A1C22] hover:bg-[#22252C] text-white border border-white/10 font-semibold text-xs flex items-center gap-2 transition-all shadow-md active:scale-98 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5 text-neutral-300" />
                <span>Unduh Mac (.dmg)</span>
              </a>
            </div>
          </div>

          {/* 3 Step Setup Guide */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-white/[0.06]">
            <div className="p-3.5 rounded-xl bg-black/40 border border-white/[0.04] flex flex-col gap-1">
              <div className="flex items-center gap-2 text-white font-semibold text-xs">
                <span className="w-4 h-4 rounded-full bg-white/10 text-[10px] flex items-center justify-center font-bold">1</span>
                <span>Instal Aplikasi</span>
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                Unduh installer sesuai OS laptop Anda (.exe untuk Windows, .dmg untuk macOS) dan pasang di laptop.
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-black/40 border border-white/[0.04] flex flex-col gap-1">
              <div className="flex items-center gap-2 text-white font-semibold text-xs">
                <span className="w-4 h-4 rounded-full bg-white/10 text-[10px] flex items-center justify-center font-bold">2</span>
                <span>Login dengan Akun Vendor</span>
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                Buka MingleBooth Studio dan masuk menggunakan email ({currentUser?.email}) dan password Anda.
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-black/40 border border-white/[0.04] flex flex-col gap-1">
              <div className="flex items-center gap-2 text-white font-semibold text-xs">
                <span className="w-4 h-4 rounded-full bg-white/10 text-[10px] flex items-center justify-center font-bold">3</span>
                <span>Mulai Pengujian Kamera</span>
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                Sambungkan kabel USB kamera Sony atau webcam. Live view dan countdown shutter langsung aktif.
              </p>
            </div>
          </div>
        </section>

        {/* Section 1: Events */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-white">Daftar Acara &amp; Jadwal Booth</h1>
              <p className="text-xs text-neutral-400 mt-0.5">
                Kelola sesi photobooth pernikahan &amp; event corporate Anda secara real-time.
              </p>
            </div>
            <button
              onClick={() => setIsNewEventModalOpen(true)}
              className="h-8 px-3.5 rounded-lg bg-white hover:bg-neutral-200 text-black font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Acara Baru</span>
            </button>
          </div>

          {/* Events List / Table */}
          <div className="bg-[#121316] border border-white/[0.06] rounded-xl divide-y divide-white/[0.04] overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-xs text-neutral-500 font-mono">
                Memuat data acara...
              </div>
            ) : events.length === 0 ? (
              <div className="p-8 text-center text-xs text-neutral-500">
                Belum ada acara aktif. Klik "+ Acara Baru" di atas untuk membuat jadwal booth pertama Anda.
              </div>
            ) : (
              events.map((evt) => (
                <div
                  key={evt.id}
                  className="p-4 sm:px-5 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 sm:mt-0" />
                    <div>
                      <h3 className="text-sm font-medium text-white">{evt.name}</h3>
                      <div className="flex items-center gap-3 text-xs text-neutral-400 mt-0.5 font-mono">
                        <span>{evt.date}</span>
                        <span>•</span>
                        <span>{evt.photosCount} foto tersimpan</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => alert(`Mengunduh paket arsip foto untuk ${evt.name}...`)}
                      className="h-8 px-3 rounded-lg bg-[#1A1C20] hover:bg-[#22252B] border border-white/[0.06] text-neutral-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
                    >
                      <FolderDown className="w-3.5 h-3.5 text-neutral-400" />
                      <span>Unduh Paket ZIP</span>
                    </button>

                    <Link
                      href={`/gallery/${evt.id}`}
                      target="_blank"
                      className="h-8 px-3 rounded-lg bg-[#1A1C20] hover:bg-[#22252B] border border-white/[0.06] text-neutral-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
                    >
                      <span>Lihat Galeri</span>
                      <ExternalLink className="w-3 h-3 text-neutral-400" />
                    </Link>

                    <button
                      onClick={() => handleDeleteEvent(evt.id, evt.name)}
                      className="h-8 px-2.5 rounded-lg bg-[#1A1C20] hover:bg-rose-950/40 hover:border-rose-500/30 border border-white/[0.06] text-neutral-400 hover:text-rose-400 text-xs font-medium flex items-center gap-1.5 transition-colors"
                      title={`Hapus acara ${evt.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Hapus</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Section 2: Desain Template & Bingkai Foto */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-semibold tracking-tight text-white">Desain Template &amp; Bingkai Foto</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/[0.08] text-neutral-300 border border-white/10 font-mono">
                  {templates.length} Template
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Kelola koleksi bingkai foto kustom yang Anda unggah untuk sesi photobooth klien Anda.
              </p>
            </div>
            <button
              onClick={handleOpenTemplateModal}
              className="h-8 px-3.5 rounded-lg bg-white hover:bg-neutral-200 text-black font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-sm self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Template</span>
            </button>
          </div>

          {/* Toolbar: Search, Filters (hanya muncul jika vendor punya minimal 1 template) */}
          {templates.length > 0 && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl bg-[#121316] border border-white/[0.06]">
              {/* Search Bar */}
              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Cari nama template..."
                  value={templateSearch}
                  onChange={(e) => {
                    setTemplateSearch(e.target.value);
                    setTemplatePage(1);
                  }}
                  className="w-full h-8 pl-8 pr-7 bg-[#1A1C20] border border-white/[0.06] rounded-lg text-xs text-white placeholder:text-neutral-500 outline-none focus:border-white/20 transition-colors"
                />
                {templateSearch && (
                  <button
                    onClick={() => {
                      setTemplateSearch('');
                      setTemplatePage(1);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                {/* Format Filter */}
                <div className="flex items-center bg-[#1A1C20] rounded-lg p-0.5 border border-white/[0.06] text-xs">
                  <button
                    onClick={() => {
                      setTemplateFilterRatio('all');
                      setTemplatePage(1);
                    }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                      templateFilterRatio === 'all'
                        ? 'bg-white text-black font-semibold shadow-sm'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Semua
                  </button>
                  <button
                    onClick={() => {
                      setTemplateFilterRatio('4:5');
                      setTemplatePage(1);
                    }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                      templateFilterRatio === '4:5'
                        ? 'bg-white text-black font-semibold shadow-sm'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Portrait 4R
                  </button>
                  <button
                    onClick={() => {
                      setTemplateFilterRatio('2:6');
                      setTemplatePage(1);
                    }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                      templateFilterRatio === '2:6'
                        ? 'bg-white text-black font-semibold shadow-sm'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Strip 2x6
                  </button>
                  <button
                    onClick={() => {
                      setTemplateFilterRatio('1:1');
                      setTemplatePage(1);
                    }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                      templateFilterRatio === '1:1'
                        ? 'bg-white text-black font-semibold shadow-sm'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Square
                  </button>
                </div>

                {/* Pose Filter */}
                <select
                  value={templateFilterSlots}
                  onChange={(e) => {
                    setTemplateFilterSlots(e.target.value);
                    setTemplatePage(1);
                  }}
                  className="h-8 px-2.5 bg-[#1A1C20] border border-white/[0.06] rounded-lg text-[11px] text-neutral-300 outline-none focus:border-white/20 transition-colors"
                >
                  <option value="all">Semua Pose</option>
                  <option value="1">1 Pose</option>
                  <option value="2">2 Pose</option>
                  <option value="3">3 Pose</option>
                  <option value="4">4 Pose</option>
                </select>
              </div>
            </div>
          )}

          {/* Grid Template & Empty States */}
          {templates.length === 0 ? (
            <div className="p-10 rounded-2xl bg-[#121316] border border-dashed border-white/[0.1] text-center flex flex-col items-center justify-center gap-3 shadow-lg">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-neutral-400">
                <Palette className="w-6 h-6 text-neutral-300" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Belum Ada Template Kustom</h3>
                <p className="text-xs text-neutral-400 mt-1 max-w-sm leading-relaxed">
                  Unggah file bingkai PNG karya Anda sendiri untuk mulai digunakan di sesi photobooth klien.
                </p>
              </div>
              <button
                onClick={handleOpenTemplateModal}
                className="mt-1 h-8 px-4 rounded-lg bg-white hover:bg-neutral-200 text-black font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Unggah Template Pertama</span>
              </button>
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="p-8 rounded-xl bg-[#121316] border border-white/[0.06] text-center flex flex-col items-center justify-center gap-2">
              <p className="text-xs text-neutral-400">
                Tidak ada template yang cocok dengan pencarian atau filter yang dipilih.
              </p>
              <button
                onClick={() => {
                  setTemplateSearch('');
                  setTemplateFilterRatio('all');
                  setTemplateFilterSlots('all');
                  setTemplatePage(1);
                }}
                className="text-xs text-white underline hover:text-neutral-300 mt-1"
              >
                Reset Filter Pencarian
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {paginatedTemplates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="p-4 rounded-2xl bg-[#121316] border border-white/[0.08] hover:border-white/20 transition-all flex flex-col justify-between gap-4 shadow-lg group"
                >
                  {/* Visual Frame Thumbnail */}
                  <div className="w-full h-44 rounded-xl bg-[#090A0C] border border-white/[0.06] flex items-center justify-center overflow-hidden p-2 relative">
                    {tpl.overlay_base64 ? (
                      <img
                        src={tpl.overlay_base64}
                        alt={tpl.name}
                        className="max-h-full max-w-full object-contain filter drop-shadow group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-neutral-500">
                        <Layers className="w-6 h-6" />
                        <span className="text-[10px] font-mono">Format {tpl.aspect_ratio}</span>
                      </div>
                    )}
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded text-[9px] font-semibold bg-white/10 text-neutral-200 border border-white/10 backdrop-blur-sm">
                      {tpl.aspect_ratio === '2:6' ? 'Photo Strip' : tpl.aspect_ratio === '4:5' ? 'Portrait 4R' : tpl.aspect_ratio || 'Kustom'}
                    </span>
                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded text-[9px] font-semibold bg-white/10 text-neutral-200 border border-white/10 backdrop-blur-sm">
                      {tpl.slots || tpl.config_json?.slotsCount || 1} Pose
                    </span>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-white group-hover:text-neutral-200 transition-colors truncate" title={tpl.name}>
                      {tpl.name}
                    </h4>
                    <p className="text-xs text-neutral-400 mt-1">
                      {tpl.config_json?.formatLabel || `${tpl.aspect_ratio || '4:5'} Cetak`} • {tpl.slots || tpl.config_json?.slotsCount || 1} Pose
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-[11px] pt-3 border-t border-white/[0.06]">
                    <span className="text-neutral-500 font-mono">
                      {tpl.config_json?.width || (tpl.aspect_ratio === '2:6' ? 600 : 1200)}×{tpl.config_json?.height || 1800} px
                    </span>
                    <button
                      onClick={() => handleDeleteTemplate(tpl.id)}
                      className="text-neutral-500 hover:text-rose-400 transition-colors flex items-center gap-1"
                      title="Hapus template ini"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Hapus</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination Controls */}
          {filteredTemplates.length > TEMPLATES_PER_PAGE && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs">
              <span className="text-neutral-500 text-[11px]">
                Menampilkan {(currentPage - 1) * TEMPLATES_PER_PAGE + 1}–{Math.min(currentPage * TEMPLATES_PER_PAGE, filteredTemplates.length)} dari {filteredTemplates.length} template
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setTemplatePage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="h-7 px-2.5 rounded-lg bg-[#181A1E] border border-white/[0.06] text-neutral-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none flex items-center gap-1 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Sebelumnya</span>
                </button>
                <div className="flex items-center gap-1 px-1">
                  {Array.from({ length: totalTemplatePages }).map((_, idx) => {
                    const pNum = idx + 1;
                    return (
                      <button
                        key={pNum}
                        onClick={() => setTemplatePage(pNum)}
                        className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${
                          currentPage === pNum
                            ? 'bg-white text-black font-semibold'
                            : 'text-neutral-400 hover:text-white bg-[#181A1E] border border-white/[0.06]'
                        }`}
                      >
                        {pNum}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => setTemplatePage((p) => Math.min(totalTemplatePages, p + 1))}
                  disabled={currentPage === totalTemplatePages}
                  className="h-7 px-2.5 rounded-lg bg-[#181A1E] border border-white/[0.06] text-neutral-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none flex items-center gap-1 transition-colors"
                >
                  <span className="hidden sm:inline">Berikutnya</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Section 3: Registered Devices & Device Quota Management */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-semibold tracking-tight text-white">
                  Manajemen Perangkat Operator
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-white/[0.08] text-neutral-300 border border-white/[0.08] uppercase tracking-wider">
                  {deviceQuota?.planTier ? `${deviceQuota.planTier} Plan` : org?.plan_tier ? `${org.plan_tier} Plan` : 'Starter'}
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-1">
                {deviceQuota
                  ? `${deviceQuota.activeCount} dari ${deviceQuota.maxQuota} perangkat aktif terdaftar.`
                  : `${devices.filter((d: any) => d.isActive ?? d.is_active).length} perangkat aktif terdaftar.`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={fetchDevices}
                disabled={deviceLoading}
                className="px-3 py-1.5 rounded-lg bg-[#181A1F] hover:bg-white/[0.08] text-neutral-300 text-xs font-medium border border-white/[0.06] flex items-center gap-1.5 transition-colors disabled:opacity-50"
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
              className={`p-3.5 rounded-xl border text-xs flex items-start justify-between gap-3 animate-fadeIn ${
                deviceFeedback.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {deviceFeedback.type === 'success' ? (
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                )}
                <span>{deviceFeedback.message}</span>
              </div>
              <button
                onClick={() => setDeviceFeedback(null)}
                className="text-neutral-400 hover:text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Quota Full Notice Banner */}
          {deviceQuota?.isFull && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">
                <span className="font-semibold block text-amber-300">Kuota Perangkat Penuh ({deviceQuota.activeCount} / {deviceQuota.maxQuota})</span>
                Semua slot perangkat untuk paket Anda sedang digunakan. Untuk menghubungkan laptop booth baru, silakan nonaktifkan salah satu laptop yang tidak sedang digunakan di bawah ini.
              </div>
            </div>
          )}

          {/* Device Error State */}
          {deviceError && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <span>{deviceError}</span>
              </div>
              <button
                onClick={fetchDevices}
                className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-[11px] font-medium transition-colors"
              >
                Coba Lagi
              </button>
            </div>
          )}

          {/* Device List Table / Container */}
          <div className="bg-[#121316] border border-white/[0.06] rounded-xl divide-y divide-white/[0.04] overflow-hidden">
            {deviceLoading && devices.length === 0 ? (
              // Loading State Skeleton
              <div className="p-8 flex flex-col items-center justify-center gap-3 text-neutral-500">
                <RefreshCw className="w-5 h-5 animate-spin text-neutral-400" />
                <span className="text-xs">Memuat daftar perangkat...</span>
              </div>
            ) : devices.length === 0 ? (
              // Empty State
              <div className="p-8 text-center flex flex-col items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-neutral-400">
                  <Laptop className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-neutral-200">Belum Ada Perangkat Terhubung</h3>
                  <p className="text-[11px] text-neutral-500 max-w-sm mt-1 leading-relaxed">
                    Buka MingleBooth Studio di laptop booth Anda dan login menggunakan akun ini untuk menghubungkannya secara otomatis.
                  </p>
                </div>
              </div>
            ) : (
              // Populated Device List
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
                    className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-white/[0.01] transition-colors"
                  >
                    <div className="flex items-start sm:items-center gap-3.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-white/[0.04] text-neutral-500 border border-white/[0.06]'
                      }`}>
                        <Laptop className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-white">{devName}</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#1C1E24] text-neutral-300 border border-white/[0.06]">
                            {osDisplay}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-neutral-400 bg-white/[0.02] border border-white/[0.04]">
                            v{version}
                          </span>
                        </div>
                        <div className="text-[11px] text-neutral-400 flex items-center gap-2 mt-1 flex-wrap">
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
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Aktif
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-neutral-800 text-neutral-400 border border-neutral-700 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-neutral-500" />
                          Nonaktif
                        </span>
                      )}

                      {isActive ? (
                        <button
                          onClick={() => handleOpenDeactivateModal(d)}
                          disabled={isStaff}
                          title={isStaff ? 'Hanya Vendor Owner yang dapat menonaktifkan perangkat' : 'Lepas perangkat ini dari kuota'}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
                            isStaff
                              ? 'bg-neutral-800/50 text-neutral-600 border-white/[0.02] cursor-not-allowed'
                              : 'bg-[#181A1F] hover:bg-rose-500/15 text-neutral-300 hover:text-rose-400 border-white/[0.06] hover:border-rose-500/30'
                          }`}
                        >
                          Nonaktifkan
                        </button>
                      ) : (
                        <span className="text-[11px] text-neutral-600 font-medium px-2 py-1">
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
      <footer className="mt-auto border-t border-white/[0.06] px-6 sm:px-12 py-10 bg-[#060709] text-xs text-neutral-500 flex flex-col items-center gap-6">
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
        <div className="flex flex-wrap items-center justify-center gap-6 text-neutral-400 font-medium text-xs">
          <Link href="/" className="hover:text-white transition-colors">
            Beranda
          </Link>
          <Link href="/billing" className="hover:text-white transition-colors">
            Billing & Lisensi
          </Link>
          <button
            onClick={() => setIsDownloadModalOpen(true)}
            className="hover:text-white transition-colors"
          >
            Unduh Software Studio
          </button>
        </div>
        <div className="pt-4 border-t border-white/[0.06] w-full max-w-4xl flex flex-col sm:flex-row items-center justify-between gap-2 text-neutral-500 text-[11px]">
          <span>
            © 2026 MingleBooth by{' '}
            <a
              href="https://www.instagram.com/sebuah.kenang?igsi=MW11ZXo2N3puOWM3eA%3D%3D&utm_source=qr"
              target="_blank"
              rel="noopener noreferrer"
              className="text-neutral-300 hover:text-white underline decoration-white/30 hover:decoration-white transition-colors font-medium"
            >
              sebuah.kenang
            </a>
            . Setiap Momen Berarti.
          </span>
          <span className="text-neutral-600">Enterprise Cloud Vendor Console</span>
        </div>
      </footer>

      {/* Modal Buat Acara Baru */}
      {isNewEventModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6 select-none animate-fadeIn">
          <div className="max-w-md w-full bg-[#121316] border border-white/[0.08] rounded-xl p-6 flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
              <h3 className="text-sm font-semibold text-white">Buat Acara Baru</h3>
              <button
                onClick={() => setIsNewEventModalOpen(false)}
                className="w-6 h-6 rounded-md hover:bg-white/[0.08] text-neutral-400 flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-400 font-medium">Nama Acara</label>
              <input
                type="text"
                placeholder="Contoh: Pernikahan Kevin & Astrid"
                value={newEventName}
                onChange={(e) => setNewEventName(e.target.value)}
                className="bg-[#181A1E] border border-white/[0.08] text-xs rounded-lg px-3 py-2 text-white outline-none focus:border-white/20"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-400 font-medium">Tanggal Acara</label>
              <input
                type="date"
                value={newEventDate}
                onChange={(e) => setNewEventDate(e.target.value)}
                className="bg-[#181A1E] border border-white/[0.08] text-xs rounded-lg px-3 py-2 text-white outline-none focus:border-white/20"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-neutral-400 font-medium">Format Pengambilan</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Hanya Foto', value: 'photo' },
                  { label: 'Hanya GIF', value: 'gif' },
                  { label: 'Foto & GIF', value: 'both' },
                ].map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => setNewOutputType(mode.value as any)}
                    className={`py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      newOutputType === mode.value
                        ? 'bg-white text-black border-white'
                        : 'bg-[#181A1E] border-white/[0.06] text-neutral-400 hover:text-white'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => setIsNewEventModalOpen(false)}
                className="flex-1 py-2 rounded-lg bg-[#181A1E] hover:bg-[#202328] text-xs text-neutral-300 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleCreateEvent}
                className="flex-1 py-2 rounded-lg bg-white hover:bg-neutral-200 text-black font-semibold text-xs transition-colors"
              >
                Simpan Acara
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tambah Desain Template Kustom Vendor */}
      {isNewTemplateModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 sm:p-6 select-none animate-fadeIn overflow-y-auto">
          <div className="max-w-lg w-full bg-[#121316] border border-white/[0.08] rounded-2xl p-6 flex flex-col gap-5 shadow-2xl my-auto max-h-[92vh] overflow-y-auto">
            {/* Header Modal */}
            <div className="flex items-start justify-between pb-3 border-b border-white/[0.06]">
              <div>
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Palette className="w-4 h-4 text-white" />
                  Unggah Template Bingkai Kustom
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Unggah file bingkai PNG transparan karya Anda untuk sesi photobooth klien.
                </p>
              </div>
              <button
                onClick={() => setIsNewTemplateModalOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-white/[0.08] text-neutral-400 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Fields */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-neutral-300 font-medium">Nama Desain Template</label>
                <input
                  type="text"
                  placeholder="Contoh: Wedding Bayu &amp; Irma"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  className="bg-[#181A1E] border border-white/[0.08] text-xs rounded-lg px-3 py-2.5 text-white outline-none focus:border-white/25 placeholder:text-neutral-500"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-neutral-300 font-medium">
                  1. Ukuran Format Kertas (Rasio Cetak)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Portrait 4R (4:5)', value: '4:5' },
                    { label: 'Photo Strip (2:6)', value: '2:6' },
                    { label: 'Square (1:1)', value: '1:1' },
                  ].map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setNewTemplateRatio(r.value as any)}
                      className={`py-2 rounded-lg text-xs font-medium border transition-colors ${
                        newTemplateRatio === r.value
                          ? 'bg-white text-black font-semibold border-white shadow-sm'
                          : 'bg-[#181A1E] border-white/[0.06] text-neutral-400 hover:text-white'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-neutral-300 font-medium">
                  2. Jumlah Jepretan Kamera (Jumlah Pose)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: '1 Pose', value: 1 },
                    { label: '2 Pose', value: 2 },
                    { label: '3 Pose', value: 3 },
                    { label: '4 Pose', value: 4 },
                  ].map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setNewTemplateSlots(item.value)}
                      className={`py-2 rounded-lg text-xs font-medium border transition-colors ${
                        newTemplateSlots === item.value
                          ? 'bg-white text-black font-semibold border-white shadow-sm'
                          : 'bg-[#181A1E] border-white/[0.06] text-neutral-400 hover:text-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-neutral-300 font-medium">
                  3. File Bingkai PNG Transparan (Overlay Frame)
                </label>
                <label className="border border-dashed border-white/[0.12] hover:border-white/30 rounded-xl p-5 flex flex-col items-center justify-center cursor-pointer transition-colors bg-[#181A1E] group">
                  {uploadedFrameBase64 ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-24 h-28 rounded-lg bg-[#090A0C] border border-white/10 p-1 flex items-center justify-center overflow-hidden">
                        <img
                          src={uploadedFrameBase64}
                          alt="Preview Frame"
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                      <div className="text-center">
                        <span className="text-xs text-white font-medium block truncate max-w-[240px]">
                          {uploadedFrameName}
                        </span>
                        <span className="text-[10px] text-emerald-400 font-medium block mt-0.5">
                          ✓ File PNG Siap Disimpan
                        </span>
                        <span className="text-[10px] text-neutral-500 hover:text-white underline block mt-1">
                          Klik untuk ganti file
                        </span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-6 h-6 text-neutral-400 mb-2 group-hover:text-white transition-colors" />
                      <span className="text-xs text-neutral-200 font-medium text-center">
                        Pilih File PNG Bingkai dari Perangkat Anda
                      </span>
                      <span className="text-[10px] text-neutral-500 text-center mt-0.5 max-w-xs">
                        Pastikan file berformat PNG dengan area lubang foto transparan (misal 1200×1800 px atau 600×1800 px).
                      </span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/png"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setUploadedFrameName(file.name);
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          const result = event.target?.result as string;
                          setUploadedFrameBase64(result);
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </label>
              </div>
            </div>

            {/* Tombol Aksi Modal */}
            <div className="flex gap-3 pt-3 border-t border-white/[0.06] mt-1">
              <button
                type="button"
                onClick={() => setIsNewTemplateModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-[#181A1E] hover:bg-[#202328] text-xs font-medium text-neutral-300 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleCreateTemplate}
                disabled={!newTemplateName.trim() || !uploadedFrameBase64}
                className="flex-1 py-2.5 rounded-xl bg-white hover:bg-neutral-200 disabled:opacity-40 disabled:pointer-events-none text-black font-semibold text-xs transition-colors shadow-md flex items-center justify-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Simpan Template</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Unduh & Buka MingleBooth Studio ── */}
      {isDownloadModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-fadeIn select-none">
          <div className="max-w-xl w-full bg-[#121316] border border-white/[0.08] rounded-2xl p-6 sm:p-8 flex flex-col gap-5 shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-white/[0.08] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/logo-studio-transparent.png"
                    alt="MingleBooth Studio"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Unduh MingleBooth Studio Desktop</h2>
                  <p className="text-xs text-neutral-400">Aplikasi native photobooth kiosk untuk laptop atau komputer booth Anda.</p>
                </div>
              </div>
              <button
                onClick={() => setIsDownloadModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-neutral-300 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* DIRECT DESKTOP DOWNLOADS: MAC (.DMG) & WINDOWS (.EXE) */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3">
                {/* Option 1: macOS (.dmg) */}
                <div className="p-4 rounded-xl bg-[#181A1E] border border-white/[0.06] hover:border-white/20 transition-all flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-9 h-9 rounded-lg bg-white/[0.06] flex items-center justify-center text-white">
                      <Laptop className="w-5 h-5 text-neutral-200" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">macOS (Apple Silicon &amp; Intel)</span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          .dmg
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-400 mt-0.5">
                        macOS 12+ (Monterey, Ventura, Sonoma, Sequoia)
                      </p>
                    </div>
                  </div>

                  <a
                    href={
                      process.env.NEXT_PUBLIC_DOWNLOAD_MAC_URL &&
                      !process.env.NEXT_PUBLIC_DOWNLOAD_MAC_URL.includes('drive.google.com')
                        ? process.env.NEXT_PUBLIC_DOWNLOAD_MAC_URL
                        : 'https://github.com/MingleBooth/MingleBooth/releases/latest/download/MingleBooth.Studio-1.0.0.dmg'
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-8 px-3.5 rounded-lg bg-white hover:bg-neutral-200 text-black font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-sm flex-shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Unduh .dmg (Mac)</span>
                  </a>
                </div>

                {/* Option 2: Windows (.exe) */}
                <div className="p-4 rounded-xl bg-[#181A1E] border border-white/[0.06] hover:border-white/20 transition-all flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-9 h-9 rounded-lg bg-white/[0.06] flex items-center justify-center text-white">
                      <Laptop className="w-5 h-5 text-white/80" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">Windows 64-bit</span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-white/[0.08] text-neutral-300 border border-white/10">
                          .exe
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-400 mt-0.5">
                        Windows 10 &amp; 11 (Driver DNP, HiTi, Citizen Ready)
                      </p>
                    </div>
                  </div>

                  <a
                    href={
                      process.env.NEXT_PUBLIC_DOWNLOAD_WIN_URL &&
                      !process.env.NEXT_PUBLIC_DOWNLOAD_WIN_URL.includes('drive.google.com')
                        ? process.env.NEXT_PUBLIC_DOWNLOAD_WIN_URL
                        : 'https://github.com/MingleBooth/MingleBooth/releases/latest/download/MingleBooth.Studio.Setup.1.0.0.exe'
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-8 px-3.5 rounded-lg bg-[#22262E] hover:bg-[#2C313C] border border-white/[0.1] text-white font-medium text-xs flex items-center gap-1.5 transition-colors flex-shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Unduh .exe (Windows)</span>
                  </a>
                </div>
              </div>

              {/* Step-by-Step Instructions */}
              <div className="p-4 rounded-xl bg-black/40 border border-white/[0.04] flex flex-col gap-2">
                <span className="text-xs font-semibold text-neutral-200">Cara Memulai Photobooth di Laptop:</span>
                <ol className="text-xs text-neutral-400 space-y-1 list-decimal list-inside leading-relaxed">
                  <li>Unduh file installer sesuai OS laptop booth Anda (.dmg untuk Mac atau .exe untuk Windows).</li>
                  <li>Buka aplikasi MingleBooth Studio dan login menggunakan email vendor: <strong className="text-white">{currentUser?.email || 'email-anda'}</strong>.</li>
                  <li>Sambungkan kabel USB kamera &amp; printer. Mode Kiosk Photobooth langsung siap beroperasi 100% offline!</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Konfirmasi Nonaktifkan Perangkat ── */}
      {deactivatingDevice && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-fadeIn select-none">
          <div className="max-w-md w-full bg-[#121316] border border-white/[0.08] rounded-2xl p-6 flex flex-col gap-4 shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-white/[0.08] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Konfirmasi Nonaktifkan Perangkat</h3>
                  <p className="text-xs text-neutral-400">Lepaskan lisensi aktif dari perangkat booth</p>
                </div>
              </div>
              <button
                onClick={() => setDeactivatingDevice(null)}
                disabled={deactivatingSubmitting}
                className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-neutral-300 flex items-center justify-center transition-colors disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content Details */}
            <div className="flex flex-col gap-3">
              <p className="text-xs text-neutral-300 leading-relaxed">
                Apakah Anda yakin ingin menonaktifkan perangkat berikut dari organisasi Anda?
              </p>

              <div className="p-3.5 rounded-xl bg-[#181A1E] border border-white/[0.06] flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-400">Nama Perangkat:</span>
                  <span className="text-xs font-semibold text-white">
                    {deactivatingDevice.deviceName || deactivatingDevice.device_name || 'Laptop Booth'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-400">Sistem Operasi:</span>
                  <span className="text-xs font-mono text-neutral-300">
                    {deactivatingDevice.osType || deactivatingDevice.os_type || 'Unknown OS'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-400">Versi Aplikasi:</span>
                  <span className="text-xs font-mono text-neutral-300">
                    v{deactivatingDevice.appVersion || deactivatingDevice.app_version || '1.0.0'}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] leading-relaxed">
                Perangkat ini tidak akan dapat membuka sesi photobooth baru sampai diaktifkan kembali. Slot kuota akan langsung dibebaskan untuk perangkat lain. Riwayat perangkat tetap tersimpan aman.
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-3 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => setDeactivatingDevice(null)}
                disabled={deactivatingSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-[#181A1E] hover:bg-[#202328] text-xs font-medium text-neutral-300 transition-colors disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeactivate}
                disabled={deactivatingSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold text-xs transition-colors shadow-md flex items-center justify-center gap-2"
              >
                {deactivatingSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
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
