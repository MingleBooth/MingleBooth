'use client';

import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  Users,
  Building2,
  Laptop,
  CreditCard,
  Plus,
  Trash2,
  RefreshCw,
  Shield,
  Search,
  ExternalLink,
  ChevronRight,
  Sliders,
  CheckCircle2,
  X,
  Lock,
  Mail,
  UserCheck,
  LogOut,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function SuperAdminPortalPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [currentAdmin, setCurrentAdmin] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'vendors' | 'admins' | 'transactions'>('overview');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // New Admin Modal
  const [isAddAdminOpen, setIsAddAdminOpen] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminRole, setNewAdminRole] = useState('SUPER_ADMIN');
  const [submittingAdmin, setSubmittingAdmin] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Superadmin Auth Guard
    const sessionUser = localStorage.getItem('mb_web_user');
    if (!sessionUser) {
      router.push('/login');
      return;
    }
    const parsed = JSON.parse(sessionUser);
    if (parsed.role !== 'SUPER_ADMIN' && parsed.email !== 'admin@minglebooth.com') {
      alert('Akses Ditolak: Anda memerlukan hak akses Superadmin untuk membuka halaman ini.');
      router.push('/dashboard');
      return;
    }
    setCurrentAdmin(parsed);
    fetchOverview();
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('mb_web_user');
    router.push('/login');
  };

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/overview');
      if (res.ok) {
        const result = await res.json();
        setData(result);
      }
    } catch (err) {
      console.error('Fetch overview error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVendorAction = async (orgId: string, action: string, planTier?: string) => {
    setStatusMsg(null);
    try {
      const res = await fetch('/api/admin/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, action, planTier }),
      });
      const resData = await res.json();
      if (res.ok) {
        setStatusMsg(resData.message || 'Berhasil diperbarui di Supabase Cloud.');
        fetchOverview();
      } else {
        alert(resData.error || 'Gagal memproses aksi');
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminEmail) return;
    setSubmittingAdmin(true);
    try {
      const res = await fetch('/api/admin/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newAdminEmail,
          fullName: newAdminName,
          role: newAdminRole,
        }),
      });
      const resData = await res.json();
      if (res.ok) {
        setNewAdminEmail('');
        setNewAdminName('');
        setIsAddAdminOpen(false);
        setStatusMsg(`Admin ${newAdminEmail} berhasil ditambahkan!`);
        fetchOverview();
      } else {
        alert(resData.error || 'Gagal menambahkan admin');
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setSubmittingAdmin(false);
    }
  };

  const handleDeleteAdmin = async (userId: string, email: string) => {
    if (!confirm(`Hapus akses superadmin untuk ${email}?`)) return;
    try {
      const res = await fetch(`/api/admin/admins?id=${userId}`, { method: 'DELETE' });
      if (res.ok) {
        setStatusMsg(`Akun ${email} berhasil dihapus.`);
        fetchOverview();
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleRunCleanup = async () => {
    try {
      const res = await fetch('/api/cron/cleanup');
      const resData = await res.json();
      alert(`Worker selesai: ${resData.totalCleaned} file cloud diproses.`);
    } catch (e: any) {
      alert('Error running cleanup: ' + e.message);
    }
  };

  const formatRupiah = (num: number) => {
    const val = Number(num || 0);
    return `Rp ${val.toLocaleString('id-ID')}`;
  };

  if (!mounted || !currentAdmin) {
    return (
      <div className="min-h-screen bg-[#090A0C] text-[#EDEDED] flex items-center justify-center font-mono text-xs text-neutral-500">
        Memverifikasi Akses Superadmin...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090A0C] text-[#EDEDED] flex flex-col font-sans select-none antialiased">
      {/* Top Professional Header */}
      <header className="h-16 px-6 sm:px-12 border-b border-white/[0.07] bg-[#0C0E12] flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <Link href="/">
              <img
                src="/logo-minglebooth-header.png"
                alt="MingleBooth"
                className="h-7 w-auto object-contain"
              />
            </Link>
            <div className="border-l border-white/[0.1] pl-3">
              <span className="text-xs font-semibold text-white block">
                Superadmin Console
              </span>
              <span className="text-[10px] text-neutral-500 font-mono">
                {currentAdmin.email}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="hidden md:flex items-center gap-1 p-1 rounded-xl bg-[#14161B] border border-white/[0.06] text-xs">
          {[
            { id: 'overview', label: 'Ringkasan & Finansial' },
            { id: 'vendors', label: 'Organisasi Vendor' },
            { id: 'admins', label: 'Kelola Akun & Admin' },
            { id: 'transactions', label: 'Log Transaksi' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3.5 py-1.5 rounded-lg font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-black shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3 text-xs">
          <button
            onClick={fetchOverview}
            className="p-2 rounded-lg bg-[#16181E] hover:bg-[#1E2028] border border-white/[0.06] text-neutral-300"
            title="Refresh Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Link
            href="/dashboard"
            className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-neutral-300 hover:text-white transition-colors border border-white/[0.08]"
          >
            Vendor Dashboard
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

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 flex flex-col gap-8">
        {/* Toast Message */}
        {statusMsg && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between animate-fadeIn">
            <span>{statusMsg}</span>
            <button
              onClick={() => setStatusMsg(null)}
              className="text-emerald-400 hover:text-emerald-200 text-xs font-semibold ml-4"
            >
              Tutup
            </button>
          </div>
        )}

        {/* Tab 1: Overview & Metrics */}
        {activeTab === 'overview' && (
          <div className="flex flex-col gap-8 animate-fadeIn">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Ringkasan Sistem & Finansial</h1>
              <p className="text-xs text-neutral-400 mt-1">
                Pantau pendapatan lisensi, studio aktif, dan kuota perangkat di seluruh Indonesia.
              </p>
            </div>

            {/* Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-[#121316] border border-white/[0.07] flex flex-col justify-between">
                <span className="text-xs font-medium text-neutral-400">Total Pendapatan (Lynk.id)</span>
                <div className="my-2">
                  <span className="text-2xl font-bold tracking-tight text-white">
                    {formatRupiah(data?.metrics?.totalRevenueIdr || 0)}
                  </span>
                </div>
                <span className="text-[11px] text-emerald-400 font-mono flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Pembayaran Terverifikasi
                </span>
              </div>

              <div className="p-5 rounded-2xl bg-[#121316] border border-white/[0.07] flex flex-col justify-between">
                <span className="text-xs font-medium text-neutral-400">Vendor Studio Aktif</span>
                <div className="my-2">
                  <span className="text-2xl font-bold tracking-tight text-white">
                    {data?.metrics?.totalActiveVendors || 1}
                  </span>
                  <span className="text-xs text-neutral-500 ml-2">Organisasi</span>
                </div>
                <span className="text-[11px] text-neutral-400 font-mono">
                  {data?.metrics?.totalUsersCount || 1} Akun Terdaftar
                </span>
              </div>

              <div className="p-5 rounded-2xl bg-[#121316] border border-white/[0.07] flex flex-col justify-between">
                <span className="text-xs font-medium text-neutral-400">Laptop / HWID Terdaftar</span>
                <div className="my-2">
                  <span className="text-2xl font-bold tracking-tight text-white">
                    {data?.metrics?.totalActiveDevices || 1}
                  </span>
                  <span className="text-xs text-neutral-500 ml-2">Perangkat</span>
                </div>
                <span className="text-[11px] text-neutral-400 font-mono">Terkunci Hardware ID</span>
              </div>

              <div className="p-5 rounded-2xl bg-[#121316] border border-white/[0.07] flex flex-col justify-between">
                <span className="text-xs font-medium text-neutral-400">Total Event Berjalan</span>
                <div className="my-2">
                  <span className="text-2xl font-bold tracking-tight text-white">
                    {data?.metrics?.totalEvents || 1}
                  </span>
                  <span className="text-xs text-neutral-500 ml-2">Sesi Acara</span>
                </div>
                <span className="text-[11px] text-neutral-400 font-mono">Tersinkronisasi Cloud</span>
              </div>
            </div>

            {/* Quick Actions Panel */}
            <div className="p-6 rounded-2xl bg-[#121316] border border-white/[0.07] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-white">Pembersihan Storage Cloud (30-Day Retention)</h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Jalankan worker pembersih foto tamu yang sudah melewati batas retensi 30 hari di Supabase.
                </p>
              </div>

              <button
                onClick={handleRunCleanup}
                className="px-4 py-2 rounded-xl bg-[#1A1D23] hover:bg-[#22262E] text-neutral-200 border border-white/[0.08] text-xs font-medium flex items-center gap-2 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5 text-neutral-400" />
                <span>Jalankan Manual Cleanup</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Vendors Management */}
        {activeTab === 'vendors' && (
          <div className="flex flex-col gap-6 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-white">Organisasi Vendor & Lisensi</h2>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Ubah paket langganan secara instan, perpanjang masa aktif (+365 hari), atau reset perangkat.
                </p>
              </div>
            </div>

            <div className="bg-[#121316] border border-white/[0.07] rounded-2xl overflow-hidden divide-y divide-white/[0.04]">
              {(data?.vendors || []).map((v: any) => (
                <div key={v.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h4 className="text-sm font-semibold text-white">{v.name}</h4>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 uppercase tracking-wider">
                        {v.subscriptionStatus}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-neutral-400 mt-1 font-mono">
                      <span>ID: {v.id.substring(0, 8)}...</span>
                      <span>•</span>
                      <span>{v.totalEventsCount} Events</span>
                      <span>•</span>
                      <span>Slot HWID: {v.activeDevicesCount}/{v.maxDevicesQuota}</span>
                      <span>•</span>
                      <span>Exp: {new Date(v.subscriptionExpiresAt).toLocaleDateString('id-ID')}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    {/* Plan Tier Selector */}
                    <select
                      value={v.planTier}
                      onChange={(e) => handleVendorAction(v.id, 'change_plan', e.target.value)}
                      className="bg-[#1A1D23] text-white border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs font-semibold capitalize outline-none cursor-pointer"
                    >
                      <option value="starter">Starter (1 Device)</option>
                      <option value="pro">Pro (3 Devices)</option>
                      <option value="business">Business (10 Devices)</option>
                    </select>

                    <button
                      onClick={() => handleVendorAction(v.id, 'extend_1_year')}
                      className="px-3 py-1.5 rounded-lg bg-[#1A1D23] hover:bg-[#22262E] text-emerald-400 text-xs font-semibold border border-white/[0.08] transition-colors"
                    >
                      +1 Tahun
                    </button>

                    <button
                      onClick={() => handleVendorAction(v.id, 'reset_devices')}
                      className="px-3 py-1.5 rounded-lg bg-[#1A1D23] hover:bg-rose-500/20 text-neutral-400 hover:text-rose-400 text-xs font-semibold border border-white/[0.08] transition-colors"
                    >
                      Reset HWID
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Admins & User Accounts */}
        {activeTab === 'admins' && (
          <div className="flex flex-col gap-6 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-white">Manajemen Akun & Superadmin</h2>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Daftar seluruh pengguna sistem dan pengelola dengan hak akses superadmin.
                </p>
              </div>

              <button
                onClick={() => setIsAddAdminOpen(true)}
                className="h-9 px-4 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Tambah Admin Baru</span>
              </button>
            </div>

            <div className="bg-[#121316] border border-white/[0.07] rounded-2xl overflow-hidden divide-y divide-white/[0.04]">
              {(data?.users || []).map((u: any) => (
                <div key={u.id} className="p-4 sm:px-5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-white font-bold">
                      {u.role === 'SUPER_ADMIN' ? <Shield className="w-4 h-4 text-emerald-400" /> : <Users className="w-4 h-4 text-neutral-400" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{u.full_name || 'User'}</span>
                        <span className={`px-2 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider ${
                          u.role === 'SUPER_ADMIN' ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20' : 'bg-neutral-800 text-neutral-300'
                        }`}>
                          {u.role}
                        </span>
                      </div>
                      <span className="text-[11px] text-neutral-400 font-mono">{u.email}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {u.role === 'SUPER_ADMIN' && u.email !== 'admin@minglebooth.com' && (
                      <button
                        onClick={() => handleDeleteAdmin(u.id, u.email)}
                        className="px-2.5 py-1 rounded bg-[#1A1D23] hover:bg-rose-500/20 text-neutral-400 hover:text-rose-400 border border-white/[0.06] text-[11px] font-medium transition-colors"
                      >
                        Hapus Akses
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 4: Transactions */}
        {activeTab === 'transactions' && (
          <div className="flex flex-col gap-6 animate-fadeIn">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">Riwayat Transaksi Masuk</h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Semua pembayaran langganan yang diproses secara otomatis melalui Lynk.id Webhook.
              </p>
            </div>

            <div className="bg-[#121316] border border-white/[0.07] rounded-2xl overflow-hidden divide-y divide-white/[0.04]">
              {(data?.recentTransactions || []).map((t: any) => (
                <div key={t.id || t.order_id} className="p-4 sm:px-5 flex items-center justify-between text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">{t.order_id}</span>
                      <span className="px-2 py-0.2 rounded text-[10px] font-bold bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 uppercase">
                        {t.payment_status}
                      </span>
                    </div>
                    <span className="text-[11px] text-neutral-400 font-mono block mt-0.5">
                      Paket: <strong className="text-white capitalize">{t.plan_tier}</strong> • {new Date(t.created_at).toLocaleString('id-ID')}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-sm font-bold text-white block">
                      {formatRupiah(Number(t.amount_idr))}
                    </span>
                    <span className="text-[10px] text-neutral-500 font-mono">
                      {t.provider_transaction_id || 'Lynk.id'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-white/[0.06] px-6 sm:px-12 py-8 bg-[#060709] text-xs text-neutral-500 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
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
              className="h-12 w-auto object-contain transition-opacity group-hover:opacity-90"
            />
          </a>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 text-neutral-500 text-[11px]">
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
          <span className="text-neutral-600 hidden sm:inline">•</span>
          <span className="text-neutral-500">Root Superadmin Master Console</span>
        </div>
      </footer>

      {/* Add Superadmin Modal */}
      {isAddAdminOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6 select-none animate-fadeIn">
          <div className="max-w-md w-full bg-[#121316] border border-white/[0.08] rounded-2xl p-6 flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
              <h3 className="text-sm font-semibold text-white">Tambah Pengelola Superadmin</h3>
              <button
                onClick={() => setIsAddAdminOpen(false)}
                className="w-6 h-6 rounded-md hover:bg-white/[0.08] text-neutral-400 flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <form onSubmit={handleAddAdmin} className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-neutral-400 font-medium">Nama Lengkap Admin</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Budi Santoso"
                  value={newAdminName}
                  onChange={(e) => setNewAdminName(e.target.value)}
                  className="bg-[#181A1F] border border-white/[0.08] text-xs rounded-xl px-3.5 py-2.5 text-white outline-none focus:border-white/30"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-neutral-400 font-medium">Email Akun Admin</label>
                <input
                  type="email"
                  required
                  placeholder="admin2@minglebooth.com"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  className="bg-[#181A1F] border border-white/[0.08] text-xs rounded-xl px-3.5 py-2.5 text-white outline-none focus:border-white/30"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-neutral-400 font-medium">Hak Akses Role</label>
                <select
                  value={newAdminRole}
                  onChange={(e) => setNewAdminRole(e.target.value)}
                  className="bg-[#181A1F] border border-white/[0.08] text-xs rounded-xl px-3.5 py-2.5 text-white outline-none focus:border-white/30 cursor-pointer"
                >
                  <option value="SUPER_ADMIN">SUPER_ADMIN (Akses Penuh Seluruh Sistem)</option>
                  <option value="SUPPORT_ADMIN">SUPPORT_ADMIN (Bantuan Teknis & Reset HWID)</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setIsAddAdminOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-[#181A1F] hover:bg-[#202328] text-xs text-neutral-300 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingAdmin}
                  className="flex-1 py-2.5 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-xs transition-colors"
                >
                  {submittingAdmin ? 'Menyimpan...' : 'Simpan Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
