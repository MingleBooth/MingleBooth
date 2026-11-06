'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  CreditCard,
  Plus,
  Trash2,
  RefreshCw,
  Shield,
  Search,
  CheckCircle2,
  X,
  Lock,
  LogOut,
  Zap,
  RotateCcw,
  ArrowUpRight,
  MoreVertical,
  Laptop,
  ChevronDown,
  ChevronUp,
  UserPlus,
  Mail,
  UserCheck,
  Smartphone,
} from 'lucide-react';
import Link from 'next/link';

export default function SuperAdminPortalPage() {
  const [mounted, setMounted] = useState(false);
  const [currentAdmin, setCurrentAdmin] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'unpaid' | 'expired'>('all');

  // Accordion: Studio mana yang sedang dibuka detail akun & laptopnya
  const [expandedStudioId, setExpandedStudioId] = useState<string | null>(null);

  // Modal: Aktivasi Lisensi Manual
  const [isActivateModalOpen, setIsActivateModalOpen] = useState(false);
  const [targetVendor, setTargetVendor] = useState<any>(null);
  const [selectedPlan, setSelectedPlan] = useState<'starter' | 'pro' | 'business'>('pro');
  const [selectedDuration, setSelectedDuration] = useState<number>(12); // bulan
  const [activationNotes, setActivationNotes] = useState('Pembayaran Manual / Sandbox Maintenance');
  const [submittingActivation, setSubmittingActivation] = useState(false);

  // Modal: Tambah Pelanggan / Studio Baru
  const [isCreateVendorOpen, setIsCreateVendorOpen] = useState(false);
  const [newStudioName, setNewStudioName] = useState('');
  const [newStudioEmail, setNewStudioEmail] = useState('');
  const [newStudioPlan, setNewStudioPlan] = useState<'starter' | 'pro' | 'business'>('pro');
  const [newStudioDuration, setNewStudioDuration] = useState<number>(12);
  const [submittingNewStudio, setSubmittingNewStudio] = useState(false);

  // Modal: Tambah Akun Staf ke Studio Tertentu
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [staffTargetStudio, setStaffTargetStudio] = useState<any>(null);
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffName, setNewStaffName] = useState('');
  const [submittingStaff, setSubmittingStaff] = useState(false);

  // Action Menu Dropdown State
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // In-Page Admin Login (jika belum login)
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    checkSession();
  }, []);

  const checkSession = () => {
    if (typeof window === 'undefined') return;
    const sessionUser = localStorage.getItem('mb_web_user');
    if (!sessionUser) {
      setCurrentAdmin(null);
      setLoading(false);
      return;
    }
    try {
      const parsed = JSON.parse(sessionUser);
      if (
        parsed.role === 'SUPER_ADMIN' ||
        parsed.email === 'admin@minglebooth.com' ||
        parsed.email === 'superadmin@minglebooth.com'
      ) {
        setCurrentAdmin(parsed);
        fetchOverview();
      } else {
        setCurrentAdmin(null);
        setLoading(false);
      }
    } catch {
      setCurrentAdmin(null);
      setLoading(false);
    }
  };

  const getAuthHeaders = (): Record<string, string> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('mb_web_token') || '' : '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  };

  const fetchOverview = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/overview', { headers: getAuthHeaders() });
      if (res.ok) {
        const result = await res.json();
        setData(result);
      }
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const executeAdminLogin = async (targetEmail: string, targetPass: string) => {
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await fetch('/api/auth/web-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail.trim().toLowerCase(), password: targetPass }),
      });
      const resData = await res.json();
      if (res.ok && resData.success) {
        localStorage.setItem('mb_web_user', JSON.stringify(resData.user));
        if (resData.token) localStorage.setItem('mb_web_token', resData.token);
        setCurrentAdmin(resData.user);
        setStatusMsg({ type: 'success', text: 'Berhasil masuk ke Panel Admin!' });
        fetchOverview();
      } else {
        setLoginError(resData.error || 'Login gagal.');
      }
    } catch (err: any) {
      setLoginError(err.message || 'Gagal terhubung ke server.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('mb_web_user');
      localStorage.removeItem('mb_web_token');
    }
    setCurrentAdmin(null);
    setData(null);
  };

  // Aktivasi / Perpanjang Lisensi Manual
  const handleSaveActivation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetVendor) return;
    setSubmittingActivation(true);
    try {
      const res = await fetch('/api/admin/vendors', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          orgId: targetVendor.id,
          action: 'manual_activate',
          planTier: selectedPlan,
          durationMonths: selectedDuration,
          notes: activationNotes,
          paymentMethod: 'MANUAL_ACTIVATION',
        }),
      });
      const resData = await res.json();
      if (res.ok) {
        setIsActivateModalOpen(false);
        setTargetVendor(null);
        setStatusMsg({
          type: 'success',
          text: `Lisensi untuk "${targetVendor.name}" berhasil diaktifkan (${selectedPlan.toUpperCase()}, ${selectedDuration} Bulan)!`,
        });
        fetchOverview();
      } else {
        alert(resData.error || 'Gagal mengaktifkan lisensi.');
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setSubmittingActivation(false);
    }
  };

  // Tambah Pelanggan Baru Manual
  const handleCreateStudio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudioName || !newStudioEmail) return;
    setSubmittingNewStudio(true);
    try {
      const res = await fetch('/api/admin/vendors', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: 'create_vendor',
          orgName: newStudioName,
          email: newStudioEmail,
          planTier: newStudioPlan,
          durationMonths: newStudioDuration,
          notes: 'Dibuat Manual oleh Admin',
        }),
      });
      const resData = await res.json();
      if (res.ok) {
        setIsCreateVendorOpen(false);
        setNewStudioName('');
        setNewStudioEmail('');
        setStatusMsg({
          type: 'success',
          text: `Pelanggan baru "${newStudioName}" berhasil dibuat dengan lisensi aktif!`,
        });
        fetchOverview();
      } else {
        alert(resData.error || 'Gagal membuat pelanggan baru.');
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setSubmittingNewStudio(false);
    }
  };

  // Tambah Akun Staf ke Studio Tertentu
  const handleAddStaffAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffTargetStudio || !newStaffEmail) return;
    setSubmittingStaff(true);
    try {
      const res = await fetch('/api/admin/vendors', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          orgId: staffTargetStudio.id,
          action: 'add_staff',
          staffEmail: newStaffEmail,
          staffName: newStaffName,
        }),
      });
      const resData = await res.json();
      if (res.ok) {
        setIsAddStaffOpen(false);
        setNewStaffEmail('');
        setNewStaffName('');
        setStatusMsg({
          type: 'success',
          text: `Akun staf "${newStaffEmail}" berhasil ditambahkan ke "${staffTargetStudio.name}"!`,
        });
        fetchOverview();
      } else {
        alert(resData.error || 'Gagal menambahkan staf.');
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setSubmittingStaff(false);
    }
  };

  // Hapus Akun Staf Tertentu
  const handleDeleteStaffAccount = async (orgId: string, staffId: string, email: string) => {
    if (!confirm(`Hapus akun staf "${email}" dari studio ini?`)) return;
    try {
      const res = await fetch('/api/admin/vendors', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          orgId,
          action: 'delete_staff',
          staffId,
        }),
      });
      if (res.ok) {
        setStatusMsg({ type: 'success', text: `Akun staf "${email}" berhasil dihapus.` });
        fetchOverview();
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  // Reset Laptop (HWID)
  const handleResetLaptop = async (orgId: string, studioName: string) => {
    if (
      !confirm(
        `Reset laptop untuk "${studioName}"?\n\nIni akan melepaskan ikatan laptop lama agar pelanggan bisa login di laptop operator yang baru.`
      )
    )
      return;

    try {
      const res = await fetch('/api/admin/vendors', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ orgId, action: 'reset_devices' }),
      });
      const resData = await res.json();
      if (res.ok) {
        setStatusMsg({
          type: 'success',
          text: `Laptop untuk "${studioName}" berhasil di-reset. Pelanggan sekarang bisa login di laptop baru.`,
        });
        fetchOverview();
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  // Hapus Akun Pelanggan
  const handleDeleteStudio = async (orgId: string, studioName: string) => {
    if (!confirm(`Hapus akun "${studioName}"? Data acara dan foto pelanggan ini akan ikut terhapus.`))
      return;

    try {
      const res = await fetch('/api/admin/vendors', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ orgId, action: 'delete_vendor' }),
      });
      const resData = await res.json();
      if (res.ok) {
        setStatusMsg({ type: 'success', text: `Akun "${studioName}" berhasil dihapus.` });
        fetchOverview();
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const formatRupiah = (num: number) => {
    const val = Number(num || 0);
    return `Rp ${val.toLocaleString('id-ID')}`;
  };

  // Filtered Pelanggan
  const filteredVendors = useMemo(() => {
    if (!data?.vendors) return [];
    return (data.vendors as any[]).filter((v) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        (v.name && v.name.toLowerCase().includes(q)) ||
        (v.ownerEmail && v.ownerEmail.toLowerCase().includes(q)) ||
        (v.accounts && v.accounts.some((acc: any) => acc.email?.toLowerCase().includes(q)));

      if (!matchSearch) return false;
      if (statusFilter === 'all') return true;
      if (statusFilter === 'active') return v.subscriptionStatus === 'active';
      if (statusFilter === 'unpaid')
        return (
          v.subscriptionStatus === 'demo' ||
          v.subscriptionStatus === 'dev_mode' ||
          !v.subscriptionStatus
        );
      if (statusFilter === 'expired') return v.subscriptionStatus === 'expired';
      return true;
    });
  }, [data?.vendors, searchQuery, statusFilter]);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#0B0B0D] text-white flex items-center justify-center font-sans text-sm">
        Memuat Panel Admin...
      </div>
    );
  }

  // Jika Belum Login Admin
  if (!currentAdmin) {
    return (
      <div className="min-h-screen bg-[#0B0B0D] text-white flex flex-col justify-between font-sans antialiased selection:bg-[#FFD21F] selection:text-[#0B0B0D]">
        <header className="px-6 py-6 border-b border-white/10 flex items-center justify-between max-w-5xl mx-auto w-full">
          <Link href="/">
            <img src="/logo-minglebooth-header.png" alt="MingleBooth" className="h-8 w-auto object-contain" />
          </Link>
          <Link href="/login" className="text-xs text-neutral-400 hover:text-white transition-colors">
            &larr; Halaman Login Vendor
          </Link>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-[420px] bg-[#14161B] border border-white/15 rounded-3xl p-8 shadow-2xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="p-2 rounded-xl bg-[#FFD21F]/15 text-[#FFD21F]">
                <Shield className="w-5 h-5" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-[#FFD21F]">Panel Khusus Pemilik</span>
            </div>

            <h1 className="text-2xl font-extrabold text-white">Login Admin MingleBooth</h1>
            <p className="text-xs text-neutral-400 mt-1 mb-6">
              Masuk untuk melihat daftar pelanggan dan mengaktifkan lisensi software.
            </p>

            {loginError && (
              <div className="mb-5 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
                {loginError}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                executeAdminLogin(loginEmail, loginPassword);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">Email Admin</label>
                <input
                  type="email"
                  required
                  placeholder="admin@studio.com"
                  autoComplete="username"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-white/15 bg-[#0C0E12] text-white text-sm outline-none focus:border-[#FFD21F]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">Password</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-white/15 bg-[#0C0E12] text-white text-sm outline-none focus:border-[#FFD21F]"
                />
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full py-3.5 rounded-xl bg-[#FFD21F] text-[#0B0B0D] font-bold text-sm hover:brightness-105 transition-all flex items-center justify-center gap-2 mt-2"
              >
                <Lock className="w-4 h-4" />
                <span>{loginLoading ? 'Memverifikasi...' : 'Masuk ke Panel Admin'}</span>
              </button>
            </form>
          </div>
        </main>

        <footer className="py-6 border-t border-white/10 text-center text-xs text-neutral-500">
          MingleBooth Master Admin Portal
        </footer>
      </div>
    );
  }

  // Tampilan Utama Panel Admin (Super Simpel & Bersih)
  return (
    <div className="min-h-screen bg-[#0B0B0D] text-[#EDEDED] flex flex-col font-sans antialiased selection:bg-[#FFD21F] selection:text-[#0B0B0D]">
      {/* Navbar Atas */}
      <header className="h-16 px-6 sm:px-10 border-b border-white/10 bg-[#12141A] flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo-minglebooth-header.png" alt="MingleBooth" className="h-7 w-auto object-contain" />
          </Link>
          <span className="text-white/20">|</span>
          <span className="text-xs font-bold text-neutral-300">
            Panel Kelola Pelanggan &amp; Lisensi
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <button
            onClick={fetchOverview}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 transition-colors"
            title="Segarkan Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <Link
            href="/dashboard"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 border border-white/10"
          >
            <span>Buka Dashboard Vendor</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-neutral-400" />
          </Link>

          <button
            onClick={handleLogout}
            className="text-neutral-400 hover:text-rose-400 flex items-center gap-1.5 px-2 py-1.5"
            title="Keluar"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Keluar</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-5 sm:px-8 py-8 flex flex-col gap-6">
        {/* Toast Notifikasi Sukses */}
        {statusMsg && (
          <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{statusMsg.text}</span>
            </div>
            <button onClick={() => setStatusMsg(null)} className="text-neutral-400 hover:text-white">
              ✕
            </button>
          </div>
        )}

        {/* 3 Kartu Ringkasan Sederhana */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-[#14161B] border border-white/10 flex items-center justify-between">
            <div>
              <span className="text-xs text-neutral-400">Total Pelanggan Studio</span>
              <div className="text-2xl font-extrabold text-white mt-1">
                {data?.vendors?.length || 1} Studio
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white">
              <Users className="w-5 h-5 text-[#FFD21F]" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-[#14161B] border border-white/10 flex items-center justify-between">
            <div>
              <span className="text-xs text-neutral-400">Lisensi Aktif</span>
              <div className="text-2xl font-extrabold text-emerald-400 mt-1">
                {(data?.vendors || []).filter((v: any) => v.subscriptionStatus === 'active').length} Studio
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-[#14161B] border border-white/10 flex items-center justify-between">
            <div>
              <span className="text-xs text-neutral-400">Total Pembayaran Masuk</span>
              <div className="text-2xl font-extrabold text-white mt-1">
                {formatRupiah(data?.metrics?.totalRevenueIdr || 4498000)}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-[#FFD21F]">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Bagian Daftar Pelanggan */}
        <div className="bg-[#14161B] border border-white/10 rounded-3xl p-6 flex flex-col gap-5">
          {/* Baris Atas: Judul & Tambah Pelanggan */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white">Daftar Pelanggan Studio</h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Klik tombol <strong className="text-white">"Lihat Akun &amp; Laptop"</strong> pada studio untuk melihat semua akun staf dan perangkat yang terhubung.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsCreateVendorOpen(true)}
                className="px-4 py-2.5 rounded-xl bg-[#FFD21F] text-[#0B0B0D] font-bold text-xs hover:brightness-105 active:scale-95 transition-all flex items-center gap-1.5 shadow-sm whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Pelanggan Baru</span>
              </button>
            </div>
          </div>

          {/* Baris Filter & Search */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2 border-t border-white/10">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Cari nama studio, email owner, atau email staf..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#0C0E12] border border-white/10 text-xs text-white placeholder-neutral-500 outline-none focus:border-[#FFD21F]"
              />
            </div>

            <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0C0E12] border border-white/10 text-xs w-full sm:w-auto">
              {[
                { id: 'all', label: 'Semua' },
                { id: 'active', label: 'Sudah Aktif' },
                { id: 'unpaid', label: 'Belum Bayar' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setStatusFilter(f.id as any)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                    statusFilter === f.id
                      ? 'bg-white text-[#0B0B0D] font-bold shadow-sm'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* TABEL PELANGGAN */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-neutral-400 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="pb-3 pl-2">Nama Studio &amp; Email Utama</th>
                  <th className="pb-3">Paket &amp; Perangkat</th>
                  <th className="pb-3">Status Lisensi</th>
                  <th className="pb-3">Masa Berlaku</th>
                  <th className="pb-3 pr-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredVendors.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-neutral-500">
                      Tidak ada pelanggan yang cocok dengan pencarian.
                    </td>
                  </tr>
                ) : (
                  filteredVendors.map((v: any) => {
                    const isActive = v.subscriptionStatus === 'active';
                    const isExpired = v.subscriptionStatus === 'expired';
                    const isUnpaid = !isActive && !isExpired;
                    const isExpanded = expandedStudioId === v.id;

                    const totalAccounts = v.accounts?.length || 1;
                    const totalDevices = v.devices?.length || v.activeDevicesCount || 0;
                    const maxDevices = v.maxDevicesQuota || (v.planTier === 'business' ? 10 : v.planTier === 'starter' ? 1 : 3);

                    // Nama paket ramah pengguna
                    const planName =
                      v.planTier === 'business'
                        ? 'Business (10 Laptop)'
                        : v.planTier === 'starter'
                        ? 'Starter (1 Laptop)'
                        : 'Pro (3 Laptop)';

                    return (
                      <React.Fragment key={v.id}>
                        <tr className={`hover:bg-white/[0.02] transition-colors ${isExpanded ? 'bg-white/[0.03]' : ''}`}>
                          {/* 1. Nama Studio & Email */}
                          <td className="py-4 pl-2">
                            <div className="font-bold text-white text-sm">{v.name}</div>
                            <div className="text-neutral-400 text-xs mt-0.5">
                              {v.ownerEmail || 'email@studio.com'}
                            </div>

                            {/* Tombol Lihat Akun & Laptop (Accordion Trigger) */}
                            <button
                              type="button"
                              onClick={() => setExpandedStudioId(isExpanded ? null : v.id)}
                              className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border ${
                                isExpanded
                                  ? 'bg-[#FFD21F] text-[#0B0B0D] border-[#FFD21F]'
                                  : 'bg-white/5 text-neutral-300 hover:text-white hover:bg-white/10 border-white/10'
                              }`}
                            >
                              <Users className="w-3.5 h-3.5" />
                              <span>Lihat Detail Akun ({totalAccounts}) &amp; Laptop ({totalDevices}/{maxDevices})</span>
                              {isExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </td>

                          {/* 2. Paket Software */}
                          <td className="py-4">
                            <span className="font-medium text-neutral-200 block">
                              {planName}
                            </span>
                            <span className="text-[11px] text-neutral-400 font-mono mt-0.5 block">
                              {totalDevices}/{maxDevices} laptop tersambung
                            </span>
                          </td>

                          {/* 3. Status Lisensi */}
                          <td className="py-4">
                            {isActive && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                Aktif
                              </span>
                            )}
                            {isUnpaid && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#FFD21F]/15 text-[#FFD21F] border border-[#FFD21F]/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#FFD21F]" />
                                Belum Bayar
                              </span>
                            )}
                            {isExpired && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                                Masa Habis
                              </span>
                            )}
                          </td>

                          {/* 4. Masa Berlaku */}
                          <td className="py-4 text-neutral-300">
                            {v.subscriptionExpiresAt ? (
                              <span className="font-medium">
                                s/d{' '}
                                {new Date(v.subscriptionExpiresAt).toLocaleDateString('id-ID', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </span>
                            ) : (
                              <span className="text-neutral-500 italic">Belum diaktifkan</span>
                            )}
                          </td>

                          {/* 5. Tombol Aksi */}
                          <td className="py-4 pr-2 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setTargetVendor(v);
                                  setSelectedPlan(v.planTier || 'pro');
                                  setIsActivateModalOpen(true);
                                }}
                                className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm ${
                                  isActive
                                    ? 'bg-white/10 hover:bg-white/15 text-white border border-white/15'
                                    : 'bg-[#FFD21F] text-[#0B0B0D] hover:brightness-105 active:scale-95'
                                }`}
                              >
                                <Zap className="w-3.5 h-3.5" />
                                <span>{isActive ? 'Perpanjang / Ganti' : 'Aktifkan Lisensi'}</span>
                              </button>

                              {/* Menu Opsi */}
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={() => setActiveMenuId(activeMenuId === v.id ? null : v.id)}
                                  className="p-1.5 rounded-lg hover:bg-white/10 text-neutral-400 transition-colors"
                                  title="Opsi lainnya"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </button>

                                {activeMenuId === v.id && (
                                  <div className="absolute right-0 mt-1 w-52 bg-[#181A20] border border-white/15 rounded-2xl p-1.5 shadow-2xl z-30 flex flex-col text-left">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveMenuId(null);
                                        setStaffTargetStudio(v);
                                        setIsAddStaffOpen(true);
                                      }}
                                      className="px-3 py-2 rounded-xl hover:bg-white/5 text-xs text-neutral-300 flex items-center gap-2 transition-colors"
                                    >
                                      <UserPlus className="w-3.5 h-3.5 text-[#FFD21F]" />
                                      <span>+ Tambah Akun Staf</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveMenuId(null);
                                        handleResetLaptop(v.id, v.name);
                                      }}
                                      className="px-3 py-2 rounded-xl hover:bg-white/5 text-xs text-neutral-300 flex items-center gap-2 transition-colors"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5 text-neutral-400" />
                                      <span>Reset Semua Laptop</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveMenuId(null);
                                        handleDeleteStudio(v.id, v.name);
                                      }}
                                      className="px-3 py-2 rounded-xl hover:bg-rose-500/10 text-xs text-rose-400 flex items-center gap-2 transition-colors"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                      <span>Hapus Pelanggan Ini</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>

                        {/* ACCORDION DETAIL: Menampilkan Semua Akun & Laptop di Studio Ini */}
                        {isExpanded && (
                          <tr className="bg-[#0C0E12] border-b border-white/10">
                            <td colSpan={5} className="p-4 sm:p-6">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                {/* KOLOM 1: DAFTAR AKUN LOGIN & STAF */}
                                <div className="p-4 rounded-2xl bg-[#14161B] border border-white/10 flex flex-col gap-3">
                                  <div className="flex items-center justify-between pb-2 border-b border-white/10">
                                    <div className="flex items-center gap-2">
                                      <Users className="w-4 h-4 text-[#FFD21F]" />
                                      <span className="font-bold text-white text-xs">
                                        Daftar Akun Pengguna / Staf ({totalAccounts})
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setStaffTargetStudio(v);
                                        setIsAddStaffOpen(true);
                                      }}
                                      className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[#FFD21F] text-[11px] font-semibold border border-white/10 flex items-center gap-1 transition-colors"
                                    >
                                      <UserPlus className="w-3 h-3" />
                                      <span>+ Tambah Akun</span>
                                    </button>
                                  </div>

                                  <div className="divide-y divide-white/5">
                                    {(v.accounts || []).length === 0 ? (
                                      <div className="py-3 text-xs text-neutral-500 text-center">
                                        Akun utama: {v.ownerEmail || 'email@studio.com'}
                                      </div>
                                    ) : (
                                      (v.accounts || []).map((acc: any, aIdx: number) => (
                                        <div key={acc.id || aIdx} className="py-2.5 flex items-center justify-between text-xs">
                                          <div>
                                            <div className="flex items-center gap-2">
                                              <span className="font-bold text-white">{acc.name || 'Staf Operator'}</span>
                                              <span
                                                className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                                                  acc.role === 'VENDOR_OWNER'
                                                    ? 'bg-[#FFD21F]/15 text-[#FFD21F]'
                                                    : 'bg-white/5 text-neutral-400'
                                                }`}
                                              >
                                                {acc.role === 'VENDOR_OWNER' ? 'Owner / Utama' : 'Operator'}
                                              </span>
                                            </div>
                                            <span className="text-neutral-400 text-[11px] font-mono">{acc.email}</span>
                                          </div>

                                          {acc.role !== 'VENDOR_OWNER' && (
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteStaffAccount(v.id, acc.id, acc.email)}
                                              className="p-1 rounded hover:bg-rose-500/20 text-neutral-500 hover:text-rose-400 transition-colors"
                                              title="Hapus akun staf ini"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          )}
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>

                                {/* KOLOM 2: DAFTAR LAPTOP OPERATOR TERHUBUNG */}
                                <div className="p-4 rounded-2xl bg-[#14161B] border border-white/10 flex flex-col gap-3">
                                  <div className="flex items-center justify-between pb-2 border-b border-white/10">
                                    <div className="flex items-center gap-2">
                                      <Laptop className="w-4 h-4 text-emerald-400" />
                                      <span className="font-bold text-white text-xs">
                                        Laptop Operator Terhubung ({totalDevices}/{maxDevices})
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleResetLaptop(v.id, v.name)}
                                      className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-rose-500/20 text-neutral-400 hover:text-rose-400 text-[11px] font-semibold border border-white/10 transition-colors"
                                    >
                                      Reset Semua
                                    </button>
                                  </div>

                                  <div className="divide-y divide-white/5">
                                    {(v.devices || []).length === 0 ? (
                                      <div className="py-4 text-center text-neutral-500 text-xs">
                                        Belum ada laptop operator yang terhubung ke studio ini.
                                        <div className="text-[11px] text-neutral-600 mt-1">
                                          Laptop akan otomatis muncul di sini saat operator login di aplikasi MingleBooth Studio.
                                        </div>
                                      </div>
                                    ) : (
                                      (v.devices || []).map((dev: any, dIdx: number) => (
                                        <div key={dev.id || dIdx} className="py-2.5 flex items-center justify-between text-xs">
                                          <div className="flex items-center gap-2.5">
                                            <div className="w-2 h-2 rounded-full bg-emerald-400" />
                                            <div>
                                              <span className="font-bold text-white block">{dev.name || `Laptop Operator #${dIdx + 1}`}</span>
                                              <span className="text-[10px] text-neutral-500 font-mono">
                                                ID Mesin: {dev.fingerprint || 'Terkunci Hardware ID'}
                                              </span>
                                            </div>
                                          </div>
                                          <span className="text-[10px] text-emerald-400 font-bold uppercase bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                            Tersambung
                                          </span>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* MODAL 1: AKTIVASI LISENSI */}
      {isActivateModalOpen && targetVendor && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-5 animate-fadeIn">
          <div className="max-w-md w-full bg-[#14161B] border border-white/15 rounded-3xl p-6 sm:p-7 flex flex-col gap-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <h3 className="text-base font-bold text-white">
                  Aktifkan Lisensi Studio
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Untuk: <strong className="text-white">{targetVendor.name}</strong>
                </p>
              </div>
              <button
                onClick={() => setIsActivateModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-white/10 text-neutral-400 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveActivation} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-neutral-300 mb-2">1. Pilih Paket Software</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'starter', label: 'Starter', desc: '1 Laptop' },
                    { id: 'pro', label: 'Pro', desc: '3 Laptop' },
                    { id: 'business', label: 'Business', desc: '10 Laptop' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPlan(p.id as any)}
                      className={`p-3 rounded-2xl border text-center transition-all ${
                        selectedPlan === p.id
                          ? 'bg-[#FFD21F] text-[#0B0B0D] font-bold border-[#FFD21F]'
                          : 'bg-white/5 border-white/10 text-neutral-300 hover:border-white/20'
                      }`}
                    >
                      <div className="text-xs font-bold">{p.label}</div>
                      <div className="text-[10px] opacity-80 mt-0.5">{p.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-neutral-300 mb-1.5">2. Masa Aktif Lisensi</label>
                <select
                  value={selectedDuration}
                  onChange={(e) => setSelectedDuration(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0C0E12] border border-white/15 text-xs text-white outline-none focus:border-[#FFD21F] cursor-pointer"
                >
                  <option value={1}>1 Bulan (30 Hari)</option>
                  <option value={6}>6 Bulan</option>
                  <option value={12}>1 Tahun (365 Hari - Rekomendasi)</option>
                  <option value={36}>3 Tahun</option>
                  <option value={120}>10 Tahun (Seumur Hidup / Lifetime)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-neutral-300 mb-1.5">3. Catatan (Opsional)</label>
                <input
                  type="text"
                  value={activationNotes}
                  onChange={(e) => setActivationNotes(e.target.value)}
                  placeholder="Misal: Sudah transfer BCA / Sandbox Maintenance"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0C0E12] border border-white/15 text-xs text-white outline-none focus:border-[#FFD21F]"
                />
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsActivateModalOpen(false)}
                  className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-neutral-300"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingActivation}
                  className="flex-1 py-3 rounded-xl bg-[#FFD21F] text-[#0B0B0D] font-bold text-xs hover:brightness-105 active:scale-95 transition-all shadow-lg shadow-[#FFD21F]/10"
                >
                  {submittingActivation ? 'Menyalakan...' : 'Nyalakan Lisensi Sekarang'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: TAMBAH PELANGGAN / STUDIO BARU */}
      {isCreateVendorOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-5 animate-fadeIn">
          <div className="max-w-md w-full bg-[#14161B] border border-white/15 rounded-3xl p-6 sm:p-7 flex flex-col gap-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-base font-bold text-white">Tambah Pelanggan Baru</h3>
              <button
                onClick={() => setIsCreateVendorOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-white/10 text-neutral-400 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateStudio} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-neutral-300 mb-1.5">Nama Studio / Vendor</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Kenangan Photo Studio"
                  value={newStudioName}
                  onChange={(e) => setNewStudioName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0C0E12] border border-white/15 text-xs text-white outline-none focus:border-[#FFD21F]"
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-300 mb-1.5">Email Pelanggan</label>
                <input
                  type="email"
                  required
                  placeholder="nama@studio.com"
                  value={newStudioEmail}
                  onChange={(e) => setNewStudioEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0C0E12] border border-white/15 text-xs text-white outline-none focus:border-[#FFD21F]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-neutral-300 mb-1.5">Paket Awal</label>
                  <select
                    value={newStudioPlan}
                    onChange={(e) => setNewStudioPlan(e.target.value as any)}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#0C0E12] border border-white/15 text-xs text-white outline-none focus:border-[#FFD21F] cursor-pointer"
                  >
                    <option value="starter">Starter (1 Laptop)</option>
                    <option value="pro">Pro (3 Laptop)</option>
                    <option value="business">Business (10 Laptop)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-neutral-300 mb-1.5">Masa Aktif</label>
                  <select
                    value={newStudioDuration}
                    onChange={(e) => setNewStudioDuration(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#0C0E12] border border-white/15 text-xs text-white outline-none focus:border-[#FFD21F] cursor-pointer"
                  >
                    <option value={1}>1 Bulan</option>
                    <option value={12}>1 Tahun (365 Hari)</option>
                    <option value={36}>3 Tahun</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateVendorOpen(false)}
                  className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-neutral-300"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingNewStudio}
                  className="flex-1 py-3 rounded-xl bg-[#FFD21F] text-[#0B0B0D] font-bold text-xs hover:brightness-105 active:scale-95 transition-all shadow-lg shadow-[#FFD21F]/10"
                >
                  {submittingNewStudio ? 'Menyimpan...' : 'Simpan & Berikan Lisensi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: TAMBAH AKUN STAF KE STUDIO */}
      {isAddStaffOpen && staffTargetStudio && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-5 animate-fadeIn">
          <div className="max-w-md w-full bg-[#14161B] border border-white/15 rounded-3xl p-6 sm:p-7 flex flex-col gap-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div>
                <h3 className="text-base font-bold text-white">Tambah Akun Staf Baru</h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Untuk Studio: <strong className="text-white">{staffTargetStudio.name}</strong>
                </p>
              </div>
              <button
                onClick={() => setIsAddStaffOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-white/10 text-neutral-400 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddStaffAccount} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-neutral-300 mb-1.5">Nama Staf / Operator</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Budi (Operator Hall A)"
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0C0E12] border border-white/15 text-xs text-white outline-none focus:border-[#FFD21F]"
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-300 mb-1.5">Email Login Staf</label>
                <input
                  type="email"
                  required
                  placeholder="budi@studio.com"
                  value={newStaffEmail}
                  onChange={(e) => setNewStaffEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0C0E12] border border-white/15 text-xs text-white outline-none focus:border-[#FFD21F]"
                />
              </div>

              <p className="text-[11px] text-neutral-400 leading-relaxed bg-white/5 p-3 rounded-xl border border-white/5">
                Staf ini akan otomatis tergabung ke studio <strong>{staffTargetStudio.name}</strong> dan bisa login ke software operator booth.
              </p>

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddStaffOpen(false)}
                  className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-neutral-300"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingStaff}
                  className="flex-1 py-3 rounded-xl bg-[#FFD21F] text-[#0B0B0D] font-bold text-xs hover:brightness-105 active:scale-95 transition-all shadow-lg shadow-[#FFD21F]/10"
                >
                  {submittingStaff ? 'Menambahkan...' : 'Tambahkan Akun Staf'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
