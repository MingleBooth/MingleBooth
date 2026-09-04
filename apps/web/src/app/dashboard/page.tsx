'use client';

import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  PRESET_TEMPLATE_LIBRARY,
  encodeSvgToBase64,
  PresetTemplateItem,
} from '@/lib/preset-templates';

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

  // New Template Modal
  const [isNewTemplateModalOpen, setIsNewTemplateModalOpen] = useState(false);
  const [templateModalTab, setTemplateModalTab] = useState<'presets' | 'custom'>('presets');
  const [selectedPresetId, setSelectedPresetId] = useState<string>(PRESET_TEMPLATE_LIBRARY[0].id);
  const [newTemplateName, setNewTemplateName] = useState(PRESET_TEMPLATE_LIBRARY[0].name);
  const [newTemplateRatio, setNewTemplateRatio] = useState<'4:5' | '2:6' | '1:1'>(PRESET_TEMPLATE_LIBRARY[0].ratio);
  const [newTemplateSlots, setNewTemplateSlots] = useState(PRESET_TEMPLATE_LIBRARY[0].slots);
  const [uploadedFrameName, setUploadedFrameName] = useState<string | null>(PRESET_TEMPLATE_LIBRARY[0].name);
  const [uploadedFrameBase64, setUploadedFrameBase64] = useState<string | null>(encodeSvgToBase64(PRESET_TEMPLATE_LIBRARY[0].svgOverlay));

  // Download Modal
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);

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

  const handleOpenTemplateModal = () => {
    setTemplateModalTab('presets');
    const first = PRESET_TEMPLATE_LIBRARY[0];
    setSelectedPresetId(first.id);
    setNewTemplateName(first.name);
    setNewTemplateRatio(first.ratio);
    setNewTemplateSlots(first.slots);
    setUploadedFrameName(`${first.name} (Siap Pakai)`);
    setUploadedFrameBase64(encodeSvgToBase64(first.svgOverlay));
    setIsNewTemplateModalOpen(true);
  };

  const handleSelectPreset = (p: PresetTemplateItem) => {
    setSelectedPresetId(p.id);
    setNewTemplateName(p.name);
    setNewTemplateRatio(p.ratio);
    setNewTemplateSlots(p.slots);
    setUploadedFrameName(`${p.name} (Siap Pakai)`);
    setUploadedFrameBase64(encodeSvgToBase64(p.svgOverlay));
  };

  const handleCreateTemplate = async () => {
    if (!newTemplateName) return;
    try {
      const res = await fetch('/api/vendor/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTemplateName,
          aspectRatio: newTemplateRatio,
          slots: newTemplateSlots,
          overlayStoragePath: uploadedFrameName || 'preset-frame.svg',
          overlayBase64: uploadedFrameBase64,
          email: currentUser?.email,
        }),
      });
      if (res.ok) {
        setIsNewTemplateModalOpen(false);
        fetchDashboardData();
      }
    } catch (err) {
      console.error('Create template error:', err);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
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
      <header className="h-14 px-6 sm:px-12 border-b border-white/[0.07] flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2.5 group">
            <img
              src="/logo-minglebooth-header.png"
              alt="MingleBooth"
              className="h-7 sm:h-8 w-auto object-contain"
            />
          </Link>
          <span className="text-xs text-neutral-500">/</span>
          <span className="text-xs text-neutral-400 font-medium">Vendor Console</span>
          <span className="hidden sm:inline-block text-[11px] text-neutral-500 font-mono">
            ({currentUser.email})
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <Link
            href="/billing"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-neutral-200 hover:text-white transition-colors"
          >
            <CreditCard className="w-3.5 h-3.5 text-neutral-400" />
            <span className="capitalize">{org?.plan_tier || 'Pro'} Tier</span>
            <span className="text-neutral-500">•</span>
            <span className="text-emerald-400">Billing & Lisensi</span>
          </Link>

          <button
            onClick={handleLogout}
            className="text-neutral-400 hover:text-rose-400 flex items-center gap-1 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-10 flex flex-col gap-10">
        {/* Banner: Download Software Studio */}
        <section className="p-6 rounded-2xl bg-gradient-to-r from-[#14161A] to-[#121316] border border-white/[0.08] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 shadow-xl">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white text-black flex items-center justify-center font-bold text-lg shadow-md flex-shrink-0 mt-0.5">
              <Camera className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">
                  Download MingleBooth Studio v1.0
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 uppercase tracking-wider">
                  Siap Unduh
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-1 leading-relaxed max-w-xl">
                Pasang di laptop booth Anda (Mac atau Windows). Buka aplikasi lalu masuk dengan akun Anda ({currentUser.email}) untuk menghubungkan perangkat photobooth.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 w-full sm:w-auto flex-shrink-0">
            <a
              href="http://localhost:5173"
              target="_blank"
              rel="noreferrer"
              className="h-10 px-4 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-98 whitespace-nowrap flex-shrink-0"
            >
              <Camera className="w-4 h-4 text-black" />
              <span>Buka Studio Booth</span>
            </a>

            <button
              onClick={() => setIsDownloadModalOpen(true)}
              className="h-10 px-3.5 rounded-xl bg-[#1A1D23] hover:bg-[#22262E] border border-white/[0.08] text-neutral-200 hover:text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-all whitespace-nowrap flex-shrink-0"
            >
              <Download className="w-3.5 h-3.5 text-neutral-400" />
              <span>Unduh Installer</span>
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
              <span>+ Acara Baru</span>
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
                      href="/p/photo_demo_1"
                      className="h-8 px-3 rounded-lg bg-[#1A1C20] hover:bg-[#22252B] border border-white/[0.06] text-neutral-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
                    >
                      <span>Lihat Galeri</span>
                      <ExternalLink className="w-3 h-3 text-neutral-400" />
                    </Link>

                    <a
                      href="http://localhost:5173"
                      target="_blank"
                      rel="noreferrer"
                      className="h-8 px-3 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>Buka Studio</span>
                    </a>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Section 2: Desain Template & Bingkai Foto */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-white">Desain Template &amp; Bingkai Foto</h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Pilih dari koleksi desain siap pakai atau unggah bingkai foto kustom Anda.
              </p>
            </div>
            <button
              onClick={handleOpenTemplateModal}
              className="h-8 px-3.5 rounded-lg bg-white hover:bg-neutral-200 text-black font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Tambah Template</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {templates.length === 0 ? (
              <div className="col-span-3 p-8 rounded-xl bg-[#121316] border border-white/[0.06] text-center text-xs text-neutral-500">
                Belum ada template aktif. Klik "+ Tambah Template" untuk memilih koleksi desain siap pakai kami.
              </div>
            ) : (
              templates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="p-4 rounded-2xl bg-[#121316] border border-white/[0.08] hover:border-white/20 transition-all flex flex-col justify-between gap-4 shadow-lg group"
                >
                  {/* Visual Frame Thumbnail */}
                  <div className="w-full h-36 rounded-xl bg-black/50 border border-white/[0.06] flex items-center justify-center overflow-hidden p-2 relative">
                    {tpl.overlay_base64 ? (
                      <img
                        src={tpl.overlay_base64}
                        alt={tpl.name}
                        className="max-h-full max-w-full object-contain filter drop-shadow"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-neutral-500">
                        <Layers className="w-6 h-6" />
                        <span className="text-[10px] font-mono">Format {tpl.aspect_ratio}</span>
                      </div>
                    )}
                    {tpl.is_preset && (
                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-400/10 text-emerald-400 border border-emerald-400/20">
                        ✨ Siap Pakai
                      </span>
                    )}
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-white group-hover:text-emerald-300 transition-colors">
                      {tpl.name}
                    </h4>
                    <p className="text-xs text-neutral-400 mt-1">
                      {tpl.config_json?.formatLabel || `${tpl.aspect_ratio || '4:5'} Cetak`} • {tpl.config_json?.slotsCount || 2} Pose
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-[11px] pt-3 border-t border-white/[0.06]">
                    <span className="text-neutral-500 font-mono">
                      {tpl.config_json?.width || 1200}×{tpl.config_json?.height || 1800} px
                    </span>
                    {!tpl.is_preset && (
                      <button
                        onClick={() => handleDeleteTemplate(tpl.id)}
                        className="text-neutral-500 hover:text-rose-400 transition-colors"
                        title="Hapus template kustom ini"
                      >
                        Hapus
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
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
          <a
            href="http://localhost:5173"
            target="_blank"
            rel="noreferrer"
            className="hover:text-white transition-colors"
          >
            Buka Studio Booth
          </a>
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

      {/* Modal Tambah Desain Template Booth */}
      {isNewTemplateModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 sm:p-6 select-none animate-fadeIn overflow-y-auto">
          <div className="max-w-2xl w-full bg-[#121316] border border-white/[0.08] rounded-2xl p-6 flex flex-col gap-5 shadow-2xl my-auto max-h-[92vh] overflow-y-auto">
            {/* Header Modal */}
            <div className="flex items-start justify-between pb-3 border-b border-white/[0.06]">
              <div>
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Palette className="w-4 h-4 text-emerald-400" />
                  Pilih & Tambah Desain Template
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Pilih dari koleksi template siap pakai kami, atau unggah file bingkai PNG karya Anda sendiri.
                </p>
              </div>
              <button
                onClick={() => setIsNewTemplateModalOpen(false)}
                className="w-7 h-7 rounded-lg hover:bg-white/[0.08] text-neutral-400 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tab Navigasi */}
            <div className="grid grid-cols-2 p-1 bg-[#181A1E] rounded-xl border border-white/[0.06] text-xs font-medium">
              <button
                type="button"
                onClick={() => setTemplateModalTab('presets')}
                className={`py-2 rounded-lg flex items-center justify-center gap-2 transition-all ${
                  templateModalTab === 'presets'
                    ? 'bg-white text-black font-semibold shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Template Siap Pakai ({PRESET_TEMPLATE_LIBRARY.length})
              </button>
              <button
                type="button"
                onClick={() => setTemplateModalTab('custom')}
                className={`py-2 rounded-lg flex items-center justify-center gap-2 transition-all ${
                  templateModalTab === 'custom'
                    ? 'bg-white text-black font-semibold shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                Upload File Sendiri (.PNG)
              </button>
            </div>

            {/* Konten Tab 1: Koleksi Template Siap Pakai */}
            {templateModalTab === 'presets' && (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {PRESET_TEMPLATE_LIBRARY.map((preset) => {
                    const isSelected = selectedPresetId === preset.id;
                    const formatLabel =
                      preset.ratio === '4:5'
                        ? 'Portrait 4R'
                        : preset.ratio === '2:6'
                        ? 'Photo Strip'
                        : '2R Mini';

                    return (
                      <div
                        key={preset.id}
                        onClick={() => handleSelectPreset(preset)}
                        className={`group relative flex flex-col rounded-xl border p-3 cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-emerald-950/20 border-emerald-500/80 ring-1 ring-emerald-500/50 shadow-lg shadow-emerald-950/30'
                            : 'bg-[#181A1E]/80 border-white/[0.06] hover:border-white/20 hover:bg-[#1C1F24]'
                        }`}
                      >
                        {/* Visual Thumbnail */}
                        <div className="w-full h-36 rounded-lg bg-black/60 border border-white/[0.06] flex items-center justify-center p-2 mb-2.5 overflow-hidden relative group-hover:scale-[1.02] transition-transform">
                          <img
                            src={encodeSvgToBase64(preset.svgOverlay)}
                            alt={preset.name}
                            className="max-h-full max-w-full object-contain drop-shadow"
                          />
                          {isSelected && (
                            <span className="absolute top-2 right-2 bg-emerald-500 text-black text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-md">
                              <Check className="w-3 h-3" /> Terpilih
                            </span>
                          )}
                        </div>

                        {/* Nama & Info */}
                        <span className="text-xs font-semibold text-white truncate mb-1">
                          {preset.name}
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                          <span className="px-1.5 py-0.5 rounded bg-white/[0.08] text-neutral-300 font-medium">
                            {formatLabel}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-white/[0.08] text-neutral-300">
                            {preset.slots} Pose
                          </span>
                          <span className="text-neutral-500 ml-auto">
                            {preset.width}×{preset.height}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Form Nama Custom untuk Template Terpilih */}
                <div className="p-3.5 rounded-xl bg-[#181A1E] border border-white/[0.06] flex flex-col gap-2">
                  <label className="text-xs text-neutral-300 font-medium flex items-center justify-between">
                    <span>Nama Template di Booth Anda</span>
                    <span className="text-[11px] text-neutral-500">Bisa diubah sesuai nama acara</span>
                  </label>
                  <input
                    type="text"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    placeholder="Contoh: Wedding Bayu & Irma"
                    className="bg-[#121316] border border-white/[0.08] text-xs rounded-lg px-3 py-2 text-white outline-none focus:border-white/20"
                  />
                  <div className="flex items-center gap-2 text-[11px] text-neutral-400 mt-1">
                    <span className="text-emerald-400 font-medium">✓ Siap Cetak:</span>
                    <span>
                      Ukuran format {newTemplateRatio} • {newTemplateSlots} pose kamera otomatis
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Konten Tab 2: Upload File Custom */}
            {templateModalTab === 'custom' && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-neutral-400 font-medium">Nama Desain Template</label>
                  <input
                    type="text"
                    placeholder="Contoh: Frame Ulang Tahun Aurel & Rayhan"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    className="bg-[#181A1E] border border-white/[0.08] text-xs rounded-lg px-3 py-2 text-white outline-none focus:border-white/20"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs text-neutral-400 font-medium">
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
                        className={`py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          newTemplateRatio === r.value
                            ? 'bg-white text-black border-white'
                            : 'bg-[#181A1E] border-white/[0.06] text-neutral-400 hover:text-white'
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs text-neutral-400 font-medium">
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
                        className={`py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          newTemplateSlots === item.value
                            ? 'bg-white text-black border-white'
                            : 'bg-[#181A1E] border-white/[0.06] text-neutral-400 hover:text-white'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs text-neutral-400 font-medium">
                    3. File Bingkai PNG Transparan (Overlay Frame)
                  </label>
                  <label className="border border-dashed border-white/[0.1] hover:border-white/30 rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer transition-colors bg-[#181A1E]">
                    <Upload className="w-5 h-5 text-neutral-400 mb-1.5" />
                    <span className="text-xs text-neutral-200 font-medium text-center">
                      {uploadedFrameName || 'Pilih File PNG Bingkai dari Laptop Anda'}
                    </span>
                    <span className="text-[10px] text-neutral-500 text-center mt-0.5">
                      Pilih gambar PNG berlubang transparan (misal 1200×1800 px atau 600×1800 px)
                    </span>
                    <input
                      type="file"
                      accept="image/*"
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
            )}

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
                className="flex-1 py-2.5 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-xs transition-colors shadow-md flex items-center justify-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                Simpan & Terapkan Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Unduh MingleBooth Studio ── */}
      {isDownloadModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-fadeIn select-none">
          <div className="max-w-xl w-full bg-[#121316] border border-white/[0.08] rounded-2xl p-6 sm:p-8 flex flex-col gap-6 shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-white/[0.08] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white text-black flex items-center justify-center font-bold shadow-md">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Unduh MingleBooth Studio v1.0</h2>
                  <p className="text-xs text-neutral-400">Software photobooth operator offline-first untuk laptop booth Anda.</p>
                </div>
              </div>
              <button
                onClick={() => setIsDownloadModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-neutral-300 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Platform Options */}
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
                  href={process.env.NEXT_PUBLIC_DOWNLOAD_MAC_URL || '#'}
                  onClick={(e) => {
                    if (!process.env.NEXT_PUBLIC_DOWNLOAD_MAC_URL) {
                      e.preventDefault();
                      alert('Installer macOS (.dmg) siap di-generate via `npm run electron:build:mac` di terminal server.');
                    }
                  }}
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
                    <Laptop className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">Windows 64-bit</span>
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        .exe
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-400 mt-0.5">
                      Windows 10 / 11 (Driver DNP, HiTi, Citizen Ready)
                    </p>
                  </div>
                </div>

                <a
                  href={process.env.NEXT_PUBLIC_DOWNLOAD_WIN_URL || '#'}
                  onClick={(e) => {
                    if (!process.env.NEXT_PUBLIC_DOWNLOAD_WIN_URL) {
                      e.preventDefault();
                      alert('Installer Windows (.exe) siap di-generate via `npm run electron:build:win` di terminal server.');
                    }
                  }}
                  className="h-8 px-3.5 rounded-lg bg-[#22262E] hover:bg-[#2C313C] border border-white/[0.1] text-white font-medium text-xs flex items-center gap-1.5 transition-colors flex-shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh .exe</span>
                </a>
              </div>

              {/* Option 3: Web App Instant Access */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-purple-500/10 to-transparent border border-purple-500/20 flex items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-semibold text-purple-300 block">Uji Coba Langsung di Browser (Web Studio)</span>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Bisa langsung digunakan di browser laptop saat ini tanpa perlu install.
                  </p>
                </div>
                <a
                  href="http://localhost:5173"
                  target="_blank"
                  rel="noreferrer"
                  className="h-8 px-3.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors flex-shrink-0"
                >
                  <span>Buka Studio</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            {/* Step-by-Step Instructions */}
            <div className="p-4 rounded-xl bg-black/40 border border-white/[0.04] flex flex-col gap-2">
              <span className="text-xs font-semibold text-neutral-200">Cara Aktivasi di Laptop Booth:</span>
              <ol className="text-xs text-neutral-400 space-y-1 list-decimal list-inside leading-relaxed">
                <li>Buka aplikasi MingleBooth Studio yang telah diinstal.</li>
                <li>Masuk menggunakan email akun vendor Anda: <strong className="text-white">{currentUser?.email || 'email-anda'}</strong>.</li>
                <li>Lisensi laptop otomatis aktif (mengurangi 1 kuota perangkat) dan langsung siap beroperasi 100% offline di lokasi acara.</li>
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
