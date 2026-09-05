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
  const [downloadModalTab, setDownloadModalTab] = useState<'tablet' | 'desktop'>('tablet');
  const [tabletQrDataUrl, setTabletQrDataUrl] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const tabletUrl = `${window.location.origin}/tablet`;
      QRCode.toDataURL(tabletUrl, { margin: 1, width: 260 })
        .then(setTabletQrDataUrl)
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    // Auth Session Guard
    const sessionUser = localStorage.getItem('mb_web_user');
    if (!sessionUser) {
      router.push('/login');
      return;
    }
    setCurrentUser(JSON.parse(sessionUser));
    fetchDashboardData();
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('mb_web_user');
    router.push('/login');
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [eventsRes, tplRes, devRes] = await Promise.all([
        fetch('/api/vendor/events').then((r) => r.json()),
        fetch('/api/vendor/templates').then((r) => r.json()),
        fetch('/api/vendor/devices').then((r) => r.json()),
      ]);

      if (eventsRes.events) setEvents(eventsRes.events);
      if (eventsRes.org) setOrg(eventsRes.org);
      if (tplRes.templates) setTemplates(tplRes.templates);
      if (devRes.devices) setDevices(devRes.devices);
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
        headers: { 'Content-Type': 'application/json' },
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
      const res = await fetch(`/api/vendor/events?id=${id}`, { method: 'DELETE' });
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
        headers: { 'Content-Type': 'application/json' },
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
      await fetch(`/api/vendor/templates?id=${id}`, { method: 'DELETE' });
      fetchDashboardData();
    } catch (err) {
      console.error('Delete template error:', err);
    }
  };

  const handleDeactivateDevice = async (deviceId: string, deviceName: string) => {
    if (!confirm(`Nonaktifkan ${deviceName}? Slot kuota perangkat akan dibebaskan sehingga Anda bisa login di laptop baru.`)) {
      return;
    }
    try {
      const res = await fetch('/api/auth/deactivate-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      });
      if (res.ok) {
        fetchDashboardData();
      }
    } catch (err) {
      console.error('Deactivate device error:', err);
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#090A0C] text-[#EDEDED] flex items-center justify-center font-mono text-xs text-neutral-500">
        Memverifikasi Akun Vendor...
      </div>
    );
  }

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
        {/* Banner: Studio Photobooth (Tablet & Desktop) */}
        <section className="p-6 rounded-2xl bg-[#121318] border border-white/[0.08] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 shadow-xl">
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
                  MingleBooth Studio (iPad, Tablet &amp; Laptop)
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-white/[0.08] text-neutral-300 border border-white/10 uppercase tracking-wider">
                  iPad &amp; Android Ready
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-1 leading-relaxed max-w-xl">
                Gunakan di <strong>iPad / Android Tablet</strong> untuk roaming &amp; kiosk photobooth (mendukung kamera Sony via USB-C), atau pasang di <strong>Laptop Mac &amp; Windows</strong>.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 w-full sm:w-auto flex-shrink-0">
            <Link
              href="/tablet"
              className="h-10 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-98 whitespace-nowrap"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Buka Mode Tablet</span>
            </Link>
            <button
              onClick={() => setIsDownloadModalOpen(true)}
              className="h-10 px-5 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-98 whitespace-nowrap flex-shrink-0"
            >
              <Download className="w-4 h-4 text-black" />
              <span>Panduan &amp; Unduh</span>
            </button>
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

        {/* Section 3: Registered Devices & Anti-Piracy Licensing */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-white">
                Perangkat Laptop Terdaftar
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Laptop dan tablet operator yang terhubung dengan akun Anda ({devices.length} dari {org?.max_devices_quota || 3} slot terpakai).
              </p>
            </div>
            <Link
              href="/billing"
              className="text-xs text-emerald-400 hover:text-emerald-300 font-medium"
            >
              + Tambah Kuota Laptop
            </Link>
          </div>

          <div className="bg-[#121316] border border-white/[0.06] rounded-xl divide-y divide-white/[0.04] overflow-hidden">
            {devices.length === 0 ? (
              <div className="p-6 text-xs text-neutral-500 text-center">
                Belum ada laptop operator yang terhubung. Buka MingleBooth Studio di laptop booth Anda untuk menghubungkannya.
              </div>
            ) : (
              devices.map((d) => (
                <div
                  key={d.id}
                  className="p-4 sm:px-5 flex items-center justify-between text-xs hover:bg-white/[0.01] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Laptop className="w-4 h-4 text-neutral-400" />
                    <div>
                      <span className="font-medium text-white block">{d.device_name}</span>
                      <span className="text-[11px] text-neutral-500 font-mono">
                        {d.os_type?.toUpperCase()} • ID Laptop: {d.hardware_fingerprint?.substring(0, 16)}... • Terakhir aktif: {new Date(d.last_seen_at).toLocaleDateString('id-ID')}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="text-[11px] font-medium text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Aktif
                    </span>

                    <button
                      onClick={() => handleDeactivateDevice(d.id, d.device_name)}
                      className="px-2.5 py-1 rounded bg-[#1C1E24] hover:bg-rose-500/20 text-neutral-400 hover:text-rose-400 border border-white/[0.06] text-[11px] font-medium transition-colors"
                    >
                      Lepas Perangkat
                    </button>
                  </div>
                </div>
              ))
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
                  <h2 className="text-base font-bold text-white">MingleBooth Studio Multi-Device</h2>
                  <p className="text-xs text-neutral-400">Pilih perangkat yang ingin Anda gunakan untuk menjalankan photobooth.</p>
                </div>
              </div>
              <button
                onClick={() => setIsDownloadModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-neutral-300 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tab Selector */}
            <div className="grid grid-cols-2 p-1 rounded-xl bg-black/40 border border-white/[0.06]">
              <button
                onClick={() => setDownloadModalTab('tablet')}
                className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  downloadModalTab === 'tablet'
                    ? 'bg-white text-black shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>📱 iPad &amp; Android Tab</span>
              </button>
              <button
                onClick={() => setDownloadModalTab('desktop')}
                className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  downloadModalTab === 'desktop'
                    ? 'bg-white text-black shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Laptop className="w-3.5 h-3.5" />
                <span>💻 Laptop (Mac / Win)</span>
              </button>
            </div>

            {/* TAB 1: TABLET (IPAD & ANDROID TAB) */}
            {downloadModalTab === 'tablet' && (
              <div className="flex flex-col gap-4">
                <div className="p-4 rounded-xl bg-[#181A22] border border-white/[0.08] flex flex-col sm:flex-row items-center gap-4">
                  {/* QR Code Container */}
                  <div className="p-2 bg-white rounded-xl shadow-md flex-shrink-0">
                    {tabletQrDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={tabletQrDataUrl} alt="Scan QR iPad" className="w-28 h-28 object-contain" />
                    ) : (
                      <div className="w-28 h-28 bg-neutral-200 flex items-center justify-center text-[10px] text-black">
                        Memuat QR...
                      </div>
                    )}
                  </div>

                  <div className="flex-1 text-center sm:text-left">
                    <span className="text-xs font-bold text-white block">Arahkan Kamera iPad / Tablet ke QR Ini</span>
                    <p className="text-[11px] text-neutral-400 mt-1 leading-relaxed">
                      Buka langsung di Safari iPad atau Chrome Android Tab. Aplikasi akan otomatis menyesuaikan layar sentuh dan mendeteksi kamera eksternal Sony.
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <Link
                        href="/tablet"
                        className="h-8 px-4 rounded-lg bg-white hover:bg-neutral-200 text-black font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Buka Studio di Tab Ini</span>
                      </Link>
                    </div>
                  </div>
                </div>

                {/* 3 Step Instruction */}
                <div className="p-4 rounded-xl bg-black/40 border border-white/[0.04] flex flex-col gap-2">
                  <span className="text-xs font-semibold text-neutral-200">Cara Pasang Aplikasi di iPad / Tablet:</span>
                  <ol className="text-xs text-neutral-400 space-y-2 list-decimal list-inside leading-relaxed">
                    <li>
                      <strong className="text-white">Buka di Browser:</strong> Scan QR di atas atau buka link di Safari (iPad) / Chrome (Android).
                    </li>
                    <li>
                      <strong className="text-white">Tambahkan ke Layar Utama:</strong>
                      <span className="block text-[11px] text-neutral-400 ml-4 mt-0.5">
                        • Di Safari iPad: Tekan ikon Share ⎋ lalu pilih <em>&ldquo;Add to Home Screen&rdquo;</em>.<br />
                        • Di Chrome Android: Tekan menu titik tiga ⋮ lalu pilih <em>&ldquo;Install App&rdquo;</em>.
                      </span>
                    </li>
                    <li>
                      <strong className="text-white">Koneksikan Sony &amp; Mulai:</strong> Colok kamera Sony ke port USB-C tablet (via USB Video Capture Card ~Rp 60rb) atau gunakan kamera bawaan tablet. MingleBooth siap beroperasi 100% offline!
                    </li>
                  </ol>
                </div>
              </div>
            )}

            {/* TAB 2: LAPTOP / DESKTOP (MAC & WINDOWS) */}
            {downloadModalTab === 'desktop' && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3">
                  {/* Option 1: macOS */}
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
                        !process.env.NEXT_PUBLIC_DOWNLOAD_MAC_URL.includes('1Zveihx99200')
                          ? process.env.NEXT_PUBLIC_DOWNLOAD_MAC_URL
                          : 'https://drive.google.com/file/d/1hRJ4X9UGSYql2dsWYYyH5TO2fmZ0PHBk/view?usp=share_link'
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-8 px-3.5 rounded-lg bg-white hover:bg-neutral-200 text-black font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-sm flex-shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Unduh .dmg</span>
                    </a>
                  </div>

                  {/* Option 2: Windows */}
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
                          Windows 10 / 11 (Driver DNP, HiTi, Citizen Ready)
                        </p>
                      </div>
                    </div>

                    <a
                      href={
                        process.env.NEXT_PUBLIC_DOWNLOAD_WIN_URL &&
                        !process.env.NEXT_PUBLIC_DOWNLOAD_WIN_URL.includes('11yqBITrjKw')
                          ? process.env.NEXT_PUBLIC_DOWNLOAD_WIN_URL
                          : 'https://drive.google.com/file/d/1ybYDGImhyVp1CFBfvXyDoLKI3XW0CLS3/view?usp=share_link'
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-8 px-3.5 rounded-lg bg-[#22262E] hover:bg-[#2C313C] border border-white/[0.1] text-white font-medium text-xs flex items-center gap-1.5 transition-colors flex-shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Unduh .exe</span>
                    </a>
                  </div>
                </div>

                {/* Step-by-Step Instructions */}
                <div className="p-4 rounded-xl bg-black/40 border border-white/[0.04] flex flex-col gap-2">
                  <span className="text-xs font-semibold text-neutral-200">Cara Aktivasi di Laptop Booth:</span>
                  <ol className="text-xs text-neutral-400 space-y-1 list-decimal list-inside leading-relaxed">
                    <li>Buka aplikasi MingleBooth Studio yang telah diinstal.</li>
                    <li>Masuk menggunakan email akun vendor Anda: <strong className="text-white">{currentUser?.email || 'email-anda'}</strong>.</li>
                    <li>Lisensi laptop otomatis aktif dan langsung siap beroperasi 100% offline di lokasi acara.</li>
                  </ol>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
