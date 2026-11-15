'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Shield,
  CreditCard,
  RefreshCw,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  History,
  AlertTriangle,
  Info,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Lock,
  X,
  Laptop,
  Layers,
  ChevronRight,
  Eye,
  EyeOff,
} from 'lucide-react';

interface SubscriptionPlan {
  id: 'starter' | 'pro' | 'business';
  name: string;
  planTier: 'starter' | 'pro' | 'business';
  description: string;
  maxDevicesQuota: number;
  durationDays: number;
  isActive: boolean;
}

interface PlanPrice {
  id: string;
  planId: 'starter' | 'pro' | 'business';
  billingInterval: 'monthly' | 'yearly';
  amountIdr: number;
  currency: 'IDR';
  durationDays: number;
  version: number;
  status: 'active' | 'scheduled' | 'superseded' | 'cancelled';
  isActive: boolean;
  effectiveFrom: string;
  effectiveUntil?: string | null;
  createdBy?: string;
  changeReason?: string;
  createdAt?: string;
}

interface AuditLog {
  id: string;
  actorId: string;
  actorEmail?: string;
  action: 'CREATE_PRICE_VERSION' | 'SCHEDULE_PRICE_VERSION' | 'ACTIVATE_PRICE_VERSION' | 'CANCEL_PRICE_VERSION';
  planId: 'starter' | 'pro' | 'business';
  billingInterval: 'monthly' | 'yearly';
  previousAmountIdr?: number | null;
  newAmountIdr: number;
  previousVersion?: number | null;
  newVersion: number;
  effectiveFrom: string;
  reason: string;
  createdAt: string;
}

export default function DynamicPricingAdminPage() {
  const [mounted, setMounted] = useState(false);
  const [currentAdmin, setCurrentAdmin] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Pricing Catalog State
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [activePrices, setActivePrices] = useState<PlanPrice[]>([]);
  const [scheduledPrices, setScheduledPrices] = useState<PlanPrice[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Edit Price Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<'starter' | 'pro' | 'business'>('starter');
  const [selectedInterval, setSelectedInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [newPriceInput, setNewPriceInput] = useState<string>('');
  const [changeReasonInput, setChangeReasonInput] = useState<string>('');
  const [isScheduled, setIsScheduled] = useState<boolean>(false);
  const [effectiveDateTimeInput, setEffectiveDateTimeInput] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  // Confirmation Preview Modal State
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [submittingPrice, setSubmittingPrice] = useState(false);

  // In-Page Admin Login State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
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
        fetchPricingData();
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

  const fetchPricingData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/pricing', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setPlans(data.plans || []);
        setActivePrices(data.activePrices || []);
        setScheduledPrices(data.scheduledPrices || []);
        setAuditLogs(data.auditLogs || []);
      } else if (res.status === 401 || res.status === 403) {
        setCurrentAdmin(null);
      }
    } catch (err) {
      console.error('Failed to load pricing data:', err);
    } finally {
      setLoading(false);
    }
  };

  const executeAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await fetch('/api/auth/web-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail.trim().toLowerCase(), password: loginPassword }),
      });
      const resData = await res.json();
      if (res.ok && resData.success) {
        localStorage.setItem('mb_web_user', JSON.stringify(resData.user));
        if (resData.token) localStorage.setItem('mb_web_token', resData.token);
        setCurrentAdmin(resData.user);
        setStatusMsg({ type: 'success', text: 'Berhasil masuk sebagai Super Admin!' });
        fetchPricingData();
      } else {
        setLoginError(resData.error || 'Login gagal.');
      }
    } catch (err: any) {
      setLoginError(err.message || 'Gagal terhubung ke server.');
    } finally {
      setLoginLoading(false);
    }
  };

  const formatRupiah = (val: number | string | undefined | null) => {
    const num = Number(val || 0);
    return `Rp ${num.toLocaleString('id-ID')}`;
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  // Helper to find price
  const findPrice = (planId: 'starter' | 'pro' | 'business', interval: 'monthly' | 'yearly') => {
    return activePrices.find((p) => p.planId === planId && p.billingInterval === interval);
  };

  // Open Edit Price Dialog for specific plan & interval
  const openEditModal = (planId: 'starter' | 'pro' | 'business', interval: 'monthly' | 'yearly') => {
    const current = findPrice(planId, interval);
    setSelectedPlanId(planId);
    setSelectedInterval(interval);
    setNewPriceInput(current ? String(current.amountIdr) : '');
    setChangeReasonInput('');
    setIsScheduled(false);
    setEffectiveDateTimeInput('');
    setFormError(null);
    setIsEditModalOpen(true);
  };

  // Pre-validate and show Confirmation Preview
  const handleProceedToConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const amount = Number(newPriceInput);
    if (isNaN(amount) || !Number.isInteger(amount) || amount <= 0) {
      setFormError('Harga harus berupa bilangan bulat positif (contoh: 1099000).');
      return;
    }
    if (amount < 10000) {
      setFormError('Harga minimum resmi adalah Rp 10.000.');
      return;
    }
    if (amount > 100000000) {
      setFormError('Harga tidak boleh melebihi batas sistem Rp 100.000.000.');
      return;
    }
    if (!changeReasonInput || changeReasonInput.trim().length < 3) {
      setFormError('Alasan perubahan harga wajib diisi (minimal 3 karakter).');
      return;
    }

    if (isScheduled && !effectiveDateTimeInput) {
      setFormError('Tanggal dan jam efektif wajib dipilih jika dijadwalkan di masa depan.');
      return;
    }

    setIsConfirmModalOpen(true);
  };

  // Execute Price Version Mutation
  const handleExecutePriceChange = async () => {
    setSubmittingPrice(true);
    try {
      const payload: Record<string, any> = {
        action: 'update_price',
        planId: selectedPlanId,
        billingInterval: selectedInterval,
        newAmountIdr: Number(newPriceInput),
        changeReason: changeReasonInput.trim(),
      };

      if (isScheduled && effectiveDateTimeInput) {
        payload.effectiveFrom = new Date(effectiveDateTimeInput).toISOString();
      }

      const res = await fetch('/api/admin/pricing', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        setIsConfirmModalOpen(false);
        setIsEditModalOpen(false);
        setStatusMsg({
          type: 'success',
          text: resData.message || 'Harga resmi berhasil diperbarui!',
        });
        fetchPricingData();
      } else {
        alert(resData.error || 'Gagal mengubah harga.');
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setSubmittingPrice(false);
    }
  };

  // Cancel a scheduled price change
  const handleCancelScheduled = async (planId: 'starter' | 'pro' | 'business', interval: 'monthly' | 'yearly') => {
    if (!confirm(`Batalkan perubahan harga terjadwal untuk ${planId.toUpperCase()} (${interval})?`)) {
      return;
    }

    try {
      const res = await fetch('/api/admin/pricing', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          action: 'cancel_scheduled',
          planId,
          billingInterval: interval,
          reason: 'Dibatalkan secara manual oleh Super Admin dari dashboard',
        }),
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        setStatusMsg({ type: 'success', text: resData.message });
        fetchPricingData();
      } else {
        alert(resData.error || 'Gagal membatalkan jadwal harga.');
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  // Computed Difference for Confirmation Modal
  const confirmationStats = useMemo(() => {
    const currentPrice = findPrice(selectedPlanId, selectedInterval)?.amountIdr || 0;
    const newPrice = Number(newPriceInput) || 0;
    const diff = newPrice - currentPrice;
    const percent = currentPrice > 0 ? ((diff / currentPrice) * 100).toFixed(1) : '0';
    return { currentPrice, newPrice, diff, percent };
  }, [selectedPlanId, selectedInterval, newPriceInput, activePrices]);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#0B0B0D] text-white flex items-center justify-center font-sans text-sm">
        Memuat Panel Harga...
      </div>
    );
  }

  // Jika Belum Login Super Admin
  if (!currentAdmin) {
    return (
      <div className="min-h-screen bg-[#0B0B0D] text-white flex flex-col justify-between font-sans antialiased selection:bg-[#FFD21F] selection:text-[#0B0B0D]">
        <header className="px-6 py-6 border-b border-white/10 flex items-center justify-between max-w-5xl mx-auto w-full">
          <Link href="/">
            <img src="/logo-minglebooth-header.png" alt="MingleBooth" className="h-8 w-auto object-contain" />
          </Link>
          <Link href="/admin" className="text-xs text-neutral-400 hover:text-white transition-colors">
            &larr; Kembali ke Panel Admin
          </Link>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-[420px] bg-[#14161B] border border-white/15 rounded-3xl p-8 shadow-2xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="p-2 rounded-xl bg-[#FFD21F]/15 text-[#FFD21F]">
                <Shield className="w-5 h-5" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-[#FFD21F]">Otoritas Super Admin</span>
            </div>

            <h1 className="text-2xl font-extrabold text-white">Kelola Harga Langganan</h1>
            <p className="text-xs text-neutral-400 mt-1 mb-6">
              Halaman ini mengatur harga resmi paket langganan MingleBooth di seluruh platform.
            </p>

            {loginError && (
              <div className="mb-5 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
                {loginError}
              </div>
            )}

            <form onSubmit={executeAdminLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">Email Super Admin</label>
                <input
                  type="email"
                  required
                  placeholder="admin@minglebooth.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-white/15 bg-[#0C0E12] text-white text-sm outline-none focus:border-[#FFD21F]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">Password</label>
                <div className="relative flex items-center">
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full px-4 py-3 pr-11 rounded-xl border border-white/15 bg-[#0C0E12] text-white text-sm outline-none focus:border-[#FFD21F]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="absolute right-3.5 text-neutral-400 hover:text-white transition-colors p-1"
                  >
                    {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full py-3.5 rounded-xl bg-[#FFD21F] text-[#0B0B0D] font-bold text-sm hover:brightness-105 transition-all flex items-center justify-center gap-2 mt-2"
              >
                <Lock className="w-4 h-4" />
                <span>{loginLoading ? 'Memverifikasi...' : 'Masuk ke Pengaturan Harga'}</span>
              </button>
            </form>
          </div>
        </main>

        <footer className="py-6 border-t border-white/10 text-center text-xs text-neutral-500">
          MingleBooth Official Pricing Authority
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0B0D] text-[#EDEDED] flex flex-col font-sans antialiased selection:bg-[#FFD21F] selection:text-[#0B0B0D]">
      {/* Top Navbar */}
      <header className="h-16 px-6 sm:px-10 border-b border-white/10 bg-[#12141A] flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors text-xs font-semibold">
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali ke Pelanggan</span>
          </Link>
          <span className="text-white/20">|</span>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#FFD21F]"></span>
            <span className="text-xs font-bold text-white">Kelola Harga Langganan Resmi</span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <button
            onClick={fetchPricingData}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 transition-colors flex items-center gap-1.5"
            title="Segarkan Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Segarkan</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-5 sm:px-8 py-8 flex flex-col gap-8">
        {/* Toast Notifikasi */}
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

        {/* Section D: Header & Pricing Summary Banner */}
        <div className="bg-[#14161B] border border-white/10 rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xl relative overflow-hidden">
          <div className="flex-1 z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFD21F]/15 text-[#FFD21F] border border-[#FFD21F]/20 text-[11px] font-bold uppercase tracking-wider mb-3">
              <Shield className="w-3.5 h-3.5" />
              <span>Sistem Manajemen Harga Super Admin</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Katalog Harga Resmi MingleBooth
            </h1>
            <p className="text-xs text-neutral-400 mt-2 max-w-2xl leading-relaxed">
              Mengontrol harga resmi langsung untuk seluruh pelanggan baru. Perubahan harga bersifat <strong>langsung berlaku untuk pesanan baru</strong> setelah tanggal efektif, sedangkan pesanan lama dan langganan aktif yang sudah dibayar tetap aman tanpa repricing.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col gap-3 min-w-[240px] z-10">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#FFD21F]/10 flex items-center justify-center text-[#FFD21F]">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] text-neutral-400 block">Total Paket Resmi</span>
                <span className="text-base font-bold text-white">3 Paket (6 Opsi)</span>
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] text-neutral-400 block">Status Gateway</span>
                <span className="text-base font-bold text-emerald-400">Sinkron Otomatis</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section A: 3 Subscription Plans (Starter, Pro, Business) */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-white">Paket Langganan &amp; Harga Aktif</h2>
              <p className="text-xs text-neutral-400">Klik "Ubah Harga" pada paket untuk membuat versi harga baru secara independen.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {(['starter', 'pro', 'business'] as const).map((tier) => {
              const plan = plans.find((p) => p.planTier === tier) || {
                id: tier,
                name: tier.toUpperCase(),
                planTier: tier,
                description: '',
                maxDevicesQuota: tier === 'business' ? 10 : tier === 'starter' ? 1 : 3,
                durationDays: 30,
                isActive: true,
              };

              const monthlyPrice = findPrice(tier, 'monthly');
              const yearlyPrice = findPrice(tier, 'yearly');

              return (
                <div
                  key={tier}
                  className="bg-[#14161B] border border-white/10 rounded-3xl p-6 flex flex-col justify-between hover:border-white/20 transition-all shadow-lg"
                >
                  <div>
                    {/* Header Card */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#FFD21F] block">
                          Paket {tier.toUpperCase()}
                        </span>
                        <h3 className="text-xl font-extrabold text-white mt-0.5">{plan.name}</h3>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        Aktif
                      </span>
                    </div>

                    <p className="text-xs text-neutral-400 line-clamp-2 mb-4 leading-relaxed">
                      {plan.description || 'Paket photobooth resmi MingleBooth.'}
                    </p>

                    {/* Kuota & Durasi Badge */}
                    <div className="flex items-center gap-3 text-xs mb-6 p-3 rounded-2xl bg-white/5 border border-white/5 text-neutral-300">
                      <div className="flex items-center gap-1.5">
                        <Laptop className="w-3.5 h-3.5 text-[#FFD21F]" />
                        <span>Kuota: <strong>{plan.maxDevicesQuota} Laptop</strong></span>
                      </div>
                    </div>

                    {/* Monthly Price Box */}
                    <div className="mb-4 p-4 rounded-2xl bg-[#0C0E12] border border-white/10 flex flex-col gap-2">
                      <div className="flex items-center justify-between text-xs text-neutral-400">
                        <span>Opsi Bulanan (30 Hari)</span>
                        <span className="font-mono text-[10px] text-neutral-500">v{monthlyPrice?.version || 1}</span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-xl font-extrabold text-white">
                          {formatRupiah(monthlyPrice?.amountIdr)}
                        </span>
                        <button
                          onClick={() => openEditModal(tier, 'monthly')}
                          className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-[#FFD21F] hover:text-[#0B0B0D] text-white text-xs font-bold transition-all"
                        >
                          Ubah Harga
                        </button>
                      </div>
                      <div className="text-[10px] text-neutral-500 flex items-center gap-1 mt-1">
                        <Clock className="w-3 h-3" />
                        <span>Efektif sejak: {formatDate(monthlyPrice?.effectiveFrom)}</span>
                      </div>
                    </div>

                    {/* Yearly Price Box */}
                    <div className="p-4 rounded-2xl bg-[#0C0E12] border border-white/10 flex flex-col gap-2">
                      <div className="flex items-center justify-between text-xs text-neutral-400">
                        <span>Opsi Tahunan (365 Hari)</span>
                        <span className="font-mono text-[10px] text-neutral-500">v{yearlyPrice?.version || 1}</span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-xl font-extrabold text-white">
                          {formatRupiah(yearlyPrice?.amountIdr)}
                        </span>
                        <button
                          onClick={() => openEditModal(tier, 'yearly')}
                          className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-[#FFD21F] hover:text-[#0B0B0D] text-white text-xs font-bold transition-all"
                        >
                          Ubah Harga
                        </button>
                      </div>
                      <div className="text-[10px] text-neutral-500 flex items-center gap-1 mt-1">
                        <Clock className="w-3 h-3" />
                        <span>Efektif sejak: {formatDate(yearlyPrice?.effectiveFrom)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section: Scheduled Future Prices (if any) */}
        {scheduledPrices.length > 0 && (
          <div className="bg-[#14161B] border border-amber-500/30 rounded-3xl p-6 flex flex-col gap-4">
            <div className="flex items-center gap-2 text-amber-400">
              <Calendar className="w-5 h-5" />
              <h3 className="text-base font-bold text-white">Perubahan Harga Terjadwal di Masa Depan</h3>
            </div>
            <p className="text-xs text-neutral-400">
              Harga di bawah ini akan aktif secara otomatis pada tanggal efektif. Sebelum tanggal tersebut tiba, checkout tetap memakai harga aktif saat ini.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {scheduledPrices.map((sp) => (
                <div key={sp.id} className="p-4 rounded-2xl bg-[#0C0E12] border border-white/10 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-[#FFD21F] uppercase">{sp.planId} ({sp.billingInterval})</span>
                    <div className="text-lg font-extrabold text-white mt-0.5">{formatRupiah(sp.amountIdr)}</div>
                    <span className="text-[11px] text-neutral-400 block mt-1">
                      Efektif: <strong>{formatDate(sp.effectiveFrom)}</strong>
                    </span>
                    <span className="text-[10px] text-neutral-500 italic block">Alasan: "{sp.changeReason}"</span>
                  </div>

                  <button
                    onClick={() => handleCancelScheduled(sp.planId, sp.billingInterval)}
                    className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-bold transition-colors"
                  >
                    Batalkan Jadwal
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Section C: Pricing History (Append-Only Audit Log) */}
        <div className="bg-[#14161B] border border-white/10 rounded-3xl p-6 sm:p-8 flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-[#FFD21F]" />
                <h2 className="text-lg font-bold text-white">Riwayat Perubahan &amp; Audit Trail Harga</h2>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Semua pembaruan harga resmi dicatat secara permanen dan tidak dapat diedit atau dihapus.
              </p>
            </div>
            <span className="text-[11px] px-3 py-1 rounded-full bg-white/5 border border-white/10 text-neutral-400">
              Total Log: {auditLogs.length} Entri
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-neutral-400 font-semibold">
                  <th className="pb-3 pr-4">Paket</th>
                  <th className="pb-3 pr-4">Interval</th>
                  <th className="pb-3 pr-4">Harga Lama</th>
                  <th className="pb-3 pr-4">Harga Baru</th>
                  <th className="pb-3 pr-4">Versi</th>
                  <th className="pb-3 pr-4">Diubah Oleh</th>
                  <th className="pb-3 pr-4">Alasan Perubahan</th>
                  <th className="pb-3 pr-4">Waktu Efektif</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-neutral-500">
                      Belum ada riwayat perubahan harga resmi. Katalog saat ini menggunakan baseline resmi v1.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3.5 pr-4 font-bold text-white uppercase">{log.planId}</td>
                      <td className="py-3.5 pr-4 text-neutral-300 capitalize">{log.billingInterval}</td>
                      <td className="py-3.5 pr-4 text-neutral-400">
                        {log.previousAmountIdr ? formatRupiah(log.previousAmountIdr) : '-'}
                      </td>
                      <td className="py-3.5 pr-4 font-bold text-emerald-400">{formatRupiah(log.newAmountIdr)}</td>
                      <td className="py-3.5 pr-4 font-mono text-neutral-400">v{log.newVersion}</td>
                      <td className="py-3.5 pr-4 text-neutral-300">{log.actorEmail || log.actorId}</td>
                      <td className="py-3.5 pr-4 text-neutral-300 max-w-xs truncate" title={log.reason}>
                        {log.reason}
                      </td>
                      <td className="py-3.5 pr-4 text-neutral-400 whitespace-nowrap">{formatDate(log.effectiveFrom)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Modal: Edit Price Configuration */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#14161B] border border-white/15 rounded-3xl p-6 sm:p-8 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-6">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-[#FFD21F]/15 text-[#FFD21F]">
                  <DollarSign className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-lg font-bold text-white">Ubah Harga Resmi</h3>
                  <span className="text-xs text-neutral-400">
                    Paket {selectedPlanId.toUpperCase()} &bull; Interval {selectedInterval === 'monthly' ? 'Bulanan' : 'Tahunan'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-neutral-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mb-5 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleProceedToConfirm} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-neutral-400 mb-1">Harga Aktif Saat Ini</label>
                <div className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-bold text-sm">
                  {formatRupiah(findPrice(selectedPlanId, selectedInterval)?.amountIdr)}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Harga Baru Resmi (Rupiah / IDR) <span className="text-[#FFD21F]">*</span>
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-4 text-neutral-400 text-sm font-semibold">Rp</span>
                  <input
                    type="number"
                    step="1"
                    min="10000"
                    max="100000000"
                    required
                    placeholder="1099000"
                    value={newPriceInput}
                    onChange={(e) => setNewPriceInput(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 rounded-xl border border-white/15 bg-[#0C0E12] text-white text-base font-bold outline-none focus:border-[#FFD21F]"
                  />
                </div>
                <span className="text-[11px] text-neutral-500 mt-1 block">
                  Hanya angka bulat positif. Contoh: 1099000 untuk Rp 1.099.000.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Alasan Perubahan Harga (Audit Trail) <span className="text-[#FFD21F]">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="Contoh: Penyesuaian tarif promosi Q4 atau evaluasi biaya operasional."
                  value={changeReasonInput}
                  onChange={(e) => setChangeReasonInput(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-white/15 bg-[#0C0E12] text-white text-xs outline-none focus:border-[#FFD21F]"
                />
              </div>

              {/* Jadwalkan di masa depan toggle */}
              <div className="pt-2 border-t border-white/10">
                <label className="flex items-center gap-2 cursor-pointer mb-3">
                  <input
                    type="checkbox"
                    checked={isScheduled}
                    onChange={(e) => setIsScheduled(e.target.checked)}
                    className="rounded border-white/20 bg-[#0C0E12] text-[#FFD21F] focus:ring-0"
                  />
                  <span className="text-xs text-neutral-300 font-semibold">
                    Jadwalkan aktif di masa depan (tidak langsung berlaku sekarang)
                  </span>
                </label>

                {isScheduled && (
                  <div className="pl-6">
                    <label className="block text-xs font-semibold text-neutral-400 mb-1">
                      Tanggal &amp; Waktu Efektif
                    </label>
                    <input
                      type="datetime-local"
                      required={isScheduled}
                      value={effectiveDateTimeInput}
                      onChange={(e) => setEffectiveDateTimeInput(e.target.value)}
                      className="px-4 py-2.5 rounded-xl border border-white/15 bg-[#0C0E12] text-white text-xs outline-none focus:border-[#FFD21F]"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-white/15 text-neutral-400 hover:text-white text-xs font-bold transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-[#FFD21F] text-[#0B0B0D] text-xs font-bold hover:brightness-105 transition-all flex items-center gap-1.5 shadow-md"
                >
                  <span>Lanjut ke Pratinjau</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirmation Preview */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#14161B] border border-amber-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl animate-scaleUp">
            <div className="flex items-center gap-2 mb-3 text-amber-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-extrabold text-white">Konfirmasi Perubahan Harga Resmi</h3>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed mb-5">
              Harap verifikasi perubahan harga resmi ini sebelum disimpan ke sistem produksi MingleBooth.
            </p>

            {/* Comparison Box */}
            <div className="p-4 rounded-2xl bg-[#0C0E12] border border-white/10 space-y-3 mb-5 text-xs">
              <div className="flex justify-between items-center text-neutral-400">
                <span>Paket &amp; Interval:</span>
                <span className="font-bold text-white uppercase">{selectedPlanId} ({selectedInterval})</span>
              </div>
              <div className="flex justify-between items-center text-neutral-400">
                <span>Harga Lama:</span>
                <span className="line-through text-neutral-500">{formatRupiah(confirmationStats.currentPrice)}</span>
              </div>
              <div className="flex justify-between items-center text-neutral-400">
                <span>Harga Baru Resmi:</span>
                <span className="text-base font-extrabold text-emerald-400">{formatRupiah(confirmationStats.newPrice)}</span>
              </div>
              <div className="flex justify-between items-center text-neutral-400">
                <span>Selisih:</span>
                <span className={`font-bold flex items-center gap-1 ${confirmationStats.diff >= 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {confirmationStats.diff >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  {confirmationStats.diff >= 0 ? `+${confirmationStats.percent}%` : `${confirmationStats.percent}%`} ({formatRupiah(confirmationStats.diff)})
                </span>
              </div>
              <div className="flex justify-between items-center text-neutral-400 border-t border-white/5 pt-2">
                <span>Waktu Berlaku:</span>
                <span className="font-semibold text-white">
                  {isScheduled && effectiveDateTimeInput ? formatDate(effectiveDateTimeInput) : 'Langsung Aktif Sekarang'}
                </span>
              </div>
            </div>

            {/* Impact Assurances */}
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 text-[11px] text-neutral-300 space-y-1.5 mb-6">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <span><strong>Hanya Berlaku untuk Pesanan Baru:</strong> Checkout baru setelah waktu aktif akan memakai harga ini.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <span><strong>Pesanan Lama Aman:</strong> Pesanan checkout yang masih pending mempertahankan harga asli saat dibuat.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <span><strong>Langganan Aktif Aman:</strong> Masa aktif &amp; kuota vendor tidak berubah.</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={submittingPrice}
                onClick={() => setIsConfirmModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-white/15 text-neutral-400 hover:text-white text-xs font-bold"
              >
                Kembali
              </button>
              <button
                type="button"
                disabled={submittingPrice}
                onClick={handleExecutePriceChange}
                className="px-5 py-2.5 rounded-xl bg-[#FFD21F] text-[#0B0B0D] text-xs font-bold hover:brightness-105 transition-all shadow-lg flex items-center gap-2"
              >
                {submittingPrice ? 'Menyimpan...' : 'Saya Konfirmasi Ubah Harga'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

