'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  ShieldCheck,
  ExternalLink,
  RefreshCw,
  CreditCard,
  ChevronLeft,
  LogIn,
  UserPlus,
  ArrowRight,
  Play,
  Download,
} from 'lucide-react';

export default function BillingPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [org, setOrg] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');
  const [justRegistered, setJustRegistered] = useState(false);
  const [registeredPlan, setRegisteredPlan] = useState<string | null>(null);

  const [payments, setPayments] = useState<any[]>([]);
  const [dynamicPrices, setDynamicPrices] = useState<Record<string, { monthly: number; yearly: number }>>({
    starter: { monthly: 549000, yearly: 1499000 },
    pro: { monthly: 1099000, yearly: 2999000 },
    business: { monthly: 2199000, yearly: 5999000 },
  });
  const [checkingOutPlan, setCheckingOutPlan] = useState<string | null>(null);

  const getAuthHeaders = (): Record<string, string> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('mb_web_token') || '' : '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  };

  const fetchOrgAndBilling = async () => {
    setLoading(true);
    try {
      const headers = getAuthHeaders();
      const res = await fetch('/api/vendor/billing', { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.organization) setOrg(data.organization);
        if (data.payments) setPayments(data.payments);
      } else {
        const eventsRes = await fetch('/api/vendor/events', { headers });
        if (eventsRes.ok) {
          const eventsData = await eventsRes.json();
          if (eventsData.org) setOrg(eventsData.org);
        }
      }
    } catch (err) {
      console.error('Fetch billing error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPricing = async () => {
    try {
      const res = await fetch('/api/pricing');
      if (res.ok) {
        const json = await res.json();
        if (json.prices && Array.isArray(json.prices)) {
          const map: Record<string, { monthly: number; yearly: number }> = {
            starter: { monthly: 549000, yearly: 1499000 },
            pro: { monthly: 1099000, yearly: 2999000 },
            business: { monthly: 2199000, yearly: 5999000 },
          };
          json.prices.forEach((p: any) => {
            if (map[p.planId] && (p.billingInterval === 'monthly' || p.billingInterval === 'yearly')) {
              map[p.planId][p.billingInterval as 'monthly' | 'yearly'] = Number(p.amountIdr);
            }
          });
          setDynamicPrices(map);
        }
      }
    } catch (err) {
      console.error('Failed to load dynamic pricing:', err);
    }
  };

  const handleCheckout = async (planId: string, baseLynkUrl: string) => {
    setCheckingOutPlan(planId);
    try {
      let orderId = '';
      const headers = getAuthHeaders();
      const res = await fetch('/api/vendor/checkout', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          planTier: planId,
          billingInterval: billingCycle,
          customerEmail: currentUser?.email,
          paymentLinkUrl: baseLynkUrl,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.order?.orderId) {
          orderId = data.order.orderId;
        }
      }

      // Build target Lynk URL with user email and order reference
      const url = new URL(baseLynkUrl);
      if (currentUser?.email) {
        url.searchParams.set('email', currentUser.email);
      }
      if (orderId) {
        url.searchParams.set('refId', orderId);
        url.searchParams.set('orderId', orderId);
      }
      window.open(url.toString(), '_blank');
      fetchOrgAndBilling();
    } catch (err) {
      console.error('Checkout creation error:', err);
      window.open(baseLynkUrl, '_blank');
    } finally {
      setCheckingOutPlan(null);
    }
  };

  useEffect(() => {
    // Check URL search params for cycle, email, or registered flag passed from registration
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const cycleParam = params.get('cycle');
      if (cycleParam === 'monthly' || cycleParam === 'yearly') {
        setBillingCycle(cycleParam);
      }
      const emailParam = params.get('email');
      if (emailParam) {
        setCurrentUser((prev: any) => prev || { email: decodeURIComponent(emailParam) });
      }
      const regParam = params.get('registered');
      if (regParam === '1' || regParam === 'true') {
        setJustRegistered(true);
      }
      const planParam = params.get('plan');
      if (planParam) {
        setRegisteredPlan(planParam);
      }
    }

    // Check if user is logged in
    const session = localStorage.getItem('mb_web_user');
    fetchPricing();
    if (session) {
      const parsed = JSON.parse(session);
      setCurrentUser(parsed);
      fetchOrgAndBilling();
    } else {
      setLoading(false);
    }
  }, []);

  const calculateDaysRemaining = (dateStr?: string, status?: string) => {
    if (status === 'pending_payment' || status === 'expired') return 0;
    if (!dateStr || new Date(dateStr).getTime() === 0) return 0;
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  // Pricing & tier specifications (Bulanan & Tahunan)
  const plans = [
    {
      id: 'starter',
      name: 'Starter',
      monthlyPrice: `Rp ${(dynamicPrices.starter?.monthly || 549000).toLocaleString('id-ID')}`,
      yearlyPrice: `Rp ${(dynamicPrices.starter?.yearly || 1499000).toLocaleString('id-ID')}`,
      monthlyAmount: dynamicPrices.starter?.monthly || 549000,
      yearlyAmount: dynamicPrices.starter?.yearly || 1499000,
      description: 'Solusi lengkap untuk solo vendor photobooth atau roaming booth.',
      quota: '1 Perangkat Booth',
      features: [
        '1 Device HWID License Quota',
        'Unlimited Events & Unlimited Captures',
        'Camera Integration (DSLR, Mirrorless, Webcam)',
        'Mingle / Roaming Booth Support',
        'PNG Transparent Frame Templates',
        'Photo & Basic GIF Mode',
        'Instant QR Delivery to Guest Smartphone',
        '100% Offline Mode with Physical Disk Storage',
        'Auto-Resume Cloud Sync',
        '30-Day Online Cloud Gallery Retention',
        'Basic Event Management & Software Updates',
        'Standard Support',
      ],
      isPopular: false,
      lynkUrlYearly: process.env.NEXT_PUBLIC_LYNK_URL_STARTER || 'https://lynk.id/minglebooth/r6k3kdyxj7vw',
      lynkUrlMonthly: process.env.NEXT_PUBLIC_LYNK_URL_STARTER_MONTHLY || 'https://lynk.id/minglebooth/llx2p98w1qlp',
    },
    {
      id: 'pro',
      name: 'Pro',
      monthlyPrice: `Rp ${(dynamicPrices.pro?.monthly || 1099000).toLocaleString('id-ID')}`,
      yearlyPrice: `Rp ${(dynamicPrices.pro?.yearly || 2999000).toLocaleString('id-ID')}`,
      monthlyAmount: dynamicPrices.pro?.monthly || 1099000,
      yearlyAmount: dynamicPrices.pro?.yearly || 2999000,
      description: 'Pilihan paling populer untuk vendor photobooth aktif & wedding studio.',
      quota: '3 Perangkat Booth',
      features: [
        '3 Devices HWID License Quota',
        'Semua fitur pada paket Starter',
        'Unlimited Custom Frame Templates',
        'Advanced Boomerang GIF (4-Burst Engine)',
        'Custom Event & Gallery Branding',
        'Download Entire Gallery ZIP Archive',
        'Automatic Offline Backup & Health Monitoring',
        'Team / Staff User Management',
        'Advanced Event Analytics',
        'Priority Technical Support & Early Access',
      ],
      isPopular: true,
      lynkUrlYearly: process.env.NEXT_PUBLIC_LYNK_URL_PRO || 'https://lynk.id/minglebooth/4gx630xzzq8r',
      lynkUrlMonthly: process.env.NEXT_PUBLIC_LYNK_URL_PRO_MONTHLY || 'https://lynk.id/minglebooth/eqj6xmrjd51r',
    },
    {
      id: 'business',
      name: 'Business',
      monthlyPrice: `Rp ${(dynamicPrices.business?.monthly || 2199000).toLocaleString('id-ID')}`,
      yearlyPrice: `Rp ${(dynamicPrices.business?.yearly || 5999000).toLocaleString('id-ID')}`,
      monthlyAmount: dynamicPrices.business?.monthly || 2199000,
      yearlyAmount: dynamicPrices.business?.yearly || 5999000,
      description: 'Untuk agensi besar dan enterprise dengan armada photobooth multi-event.',
      quota: '10 Perangkat Booth',
      features: [
        '10 Devices HWID License Quota',
        'Semua fitur pada paket Pro',
        'Multi-User & Role Permission Management',
        'Centralized Multi-Event Dashboard',
        'Multi-Brand Operation Support',
        'White-Label Option (Remove MingleBooth Branding)',
        'Custom Gallery Domain (gallery.yourbrand.com)',
        'Advanced Business Analytics & API Access',
        'Centralized License & Device HWID Management',
        'Dedicated 24/7 SLA Engineering Support',
      ],
      isPopular: false,
      lynkUrlYearly: process.env.NEXT_PUBLIC_LYNK_URL_BUSINESS || 'https://lynk.id/minglebooth/d4jm3v31kypm',
      lynkUrlMonthly: process.env.NEXT_PUBLIC_LYNK_URL_BUSINESS_MONTHLY || 'https://lynk.id/minglebooth/zr78ewnemej1',
    },
  ];

  return (
    <div className="min-h-screen bg-[#090A0C] text-[#EDEDED] flex flex-col font-sans select-none antialiased">
      {/* Navbar */}
      <header className="h-14 px-4 sm:px-12 border-b border-white/[0.07] flex items-center justify-between">
        <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
          <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
            <img
              src="/logo-minglebooth-header.png"
              alt="MingleBooth"
              className="h-7 sm:h-8 w-auto object-contain"
            />
          </Link>
          <span className="text-xs text-neutral-500 hidden sm:inline">/</span>
          <span className="text-xs text-neutral-400 font-medium truncate hidden sm:inline">Billing & Lisensi</span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 text-xs">
          {currentUser ? (
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-neutral-200 hover:text-white transition-colors border border-white/[0.08]"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Kembali ke Dashboard</span>
              <span className="sm:hidden">Dashboard</span>
            </Link>
          ) : (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Link
                href="/login"
                className="px-2.5 sm:px-3 py-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-white/[0.05] transition-colors flex items-center gap-1.5 whitespace-nowrap"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Masuk</span>
              </Link>
              <Link
                href="/register"
                className="px-3 sm:px-3.5 py-1.5 rounded-lg bg-white hover:bg-neutral-200 text-black font-semibold flex items-center gap-1.5 transition-colors shadow-sm whitespace-nowrap"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Daftar Vendor</span>
                <span className="sm:hidden">Daftar</span>
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-10 flex flex-col gap-8 sm:gap-10">
        {/* Registration Success Banner */}
        {justRegistered && (
          <div className="p-4 sm:p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl animate-fadeIn">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mt-0.5 flex-shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-white">Akun Studio Berhasil Didaftarkan!</h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Langkah 2: Selesaikan Pembayaran
                  </span>
                </div>
                <p className="text-xs text-neutral-300 mt-1">
                  Akun Anda telah tersimpan dengan email{' '}
                  <span className="text-white font-mono bg-white/[0.08] px-1.5 py-0.5 rounded">{currentUser?.email}</span>.
                  Silakan klik tombol <strong className="text-white">&quot;Bayar via Lynk.id&quot;</strong> pada paket pilihan Anda untuk mengaktifkan lisensi software.
                </p>
              </div>
            </div>
            <Link
              href="/dashboard"
              className="h-8 px-3.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-xs font-medium text-white flex items-center gap-1.5 transition-colors whitespace-nowrap self-start sm:self-auto flex-shrink-0"
            >
              <span>Lihat Dashboard</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        {/* Active License Status Banner (Only when logged in) */}
        {currentUser && org ? (
          <section className="p-6 rounded-2xl bg-[#121316] border border-white/[0.08] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 shadow-xl">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-white mt-1">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-white">
                    {org?.name || 'Studio Vendor'}
                  </h2>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 uppercase tracking-wider">
                    {org?.subscription_status || 'Active'}
                  </span>
                </div>
                <p className="text-xs text-neutral-400 mt-1">
                  Paket: <strong className="text-white capitalize">{org?.plan_tier || 'Pro'}</strong> • Kuota:{' '}
                  <strong className="text-white">{org?.max_devices_quota || 3} Perangkat</strong> • Masa Aktif:{' '}
                  <strong className="text-white">
                    {org?.subscription_status === 'pending_payment'
                      ? 'Menunggu Pembayaran'
                      : org?.subscription_status === 'expired'
                      ? 'Kedaluwarsa'
                      : `${calculateDaysRemaining(org?.subscription_expires_at, org?.subscription_status)} hari lagi`}
                  </strong>{' '}
                  {org?.subscription_status === 'active' && org?.subscription_expires_at && new Date(org.subscription_expires_at).getTime() > 0 && (
                    <span>({new Date(org.subscription_expires_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })})</span>
                  )}
                </p>
              </div>
            </div>

            <button
              onClick={fetchOrgAndBilling}
              disabled={loading}
              className="h-8 px-3 rounded-lg bg-[#181A1E] hover:bg-[#202328] border border-white/[0.08] text-xs font-medium text-neutral-300 hover:text-white flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Sinkronkan Data</span>
            </button>
          </section>
        ) : null}

        {/* Riwayat Pembayaran & Transaksi (Section) */}
        {currentUser && (
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold tracking-tight text-white">Riwayat Transaksi &amp; Pembayaran</h2>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Catatan pembayaran lisensi MingleBooth yang terverifikasi via Lynk.id.
                </p>
              </div>
              <button
                onClick={fetchOrgAndBilling}
                disabled={loading}
                className="h-8 px-3 rounded-lg bg-[#181A1E] hover:bg-[#202328] border border-white/[0.08] text-xs font-medium text-neutral-300 hover:text-white flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Segarkan</span>
              </button>
            </div>

            <div className="bg-[#121316] border border-white/[0.07] rounded-2xl overflow-hidden divide-y divide-white/[0.04]">
              {loading && payments.length === 0 ? (
                <div className="p-8 text-center text-xs text-neutral-500 flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Memuat riwayat transaksi...</span>
                </div>
              ) : payments.length === 0 ? (
                <div className="p-8 text-center flex flex-col items-center gap-2">
                  <CreditCard className="w-6 h-6 text-neutral-500" />
                  <span className="text-xs font-semibold text-neutral-300">Belum Ada Transaksi Pembayaran</span>
                  <p className="text-[11px] text-neutral-500 max-w-sm">
                    Pilih salah satu paket di bawah dan selesaikan pembayaran untuk mengaktifkan lisensi MingleBooth Studio.
                  </p>
                </div>
              ) : (
                payments.map((p) => {
                  const isPaid = p.paymentStatus === 'PAID';
                  return (
                    <div key={p.id || p.orderId} className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-white font-mono">{p.orderId}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            isPaid
                              ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20'
                              : 'bg-amber-400/10 text-amber-400 border border-amber-400/20'
                          }`}>
                            {p.paymentStatus}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-white/[0.06] text-neutral-300 border border-white/[0.08] capitalize">
                            Paket {p.planTier}
                          </span>
                        </div>
                        <div className="text-[11px] text-neutral-400 flex items-center gap-2 mt-1 flex-wrap">
                          <span>Dibuat: {new Date(p.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          {p.paidAt && (
                            <>
                              <span>•</span>
                              <span className="text-emerald-400/80">Lunas: {new Date(p.paidAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="text-left sm:text-right">
                        <span className="text-sm font-bold text-white block">
                          Rp {Number(p.amountIdr).toLocaleString('id-ID')}
                        </span>
                        <span className="text-[10px] text-neutral-500 font-mono">
                          Lynk.id Checkout
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        )}

        {!currentUser ? (
          <div className="p-3.5 sm:p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-neutral-300">
            <div className="flex items-center gap-2.5">
              <LogIn className="w-4 h-4 text-neutral-400 flex-shrink-0" />
              <span>Sudah memiliki akun vendor? Masuk untuk mengelola lisensi aktif Anda.</span>
            </div>
            <Link
              href="/login"
              className="px-3 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-white font-medium text-xs whitespace-nowrap flex-shrink-0 transition-colors flex items-center gap-1.5 self-start sm:self-auto"
            >
              <span>Masuk Sekarang</span>
              <ArrowRight className="w-3.5 h-3.5 flex-shrink-0" />
            </Link>
          </div>
        ) : null}

        {/* Try Demo First Banner */}
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 mt-0.5 flex-shrink-0">
              <Play className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-white">Ingin Menguji Coba Terlebih Dahulu?</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Mode Demo Gratis
                </span>
              </div>
              <p className="text-xs text-neutral-300 mt-1 max-w-2xl leading-relaxed">
                Anda dapat mendaftar akun dan masuk ke MingleBooth Studio untuk mencoba koneksi kamera Sony α7C II, Alpha tethering, atau webcam secara lokal dalam Mode Demo gratis. Selesaikan pembayaran paket di bawah ini ketika Anda siap mengaktifkan Galeri Cloud Tamu, Live QR, dan armada booth komersial.
              </p>
            </div>
          </div>
          <Link
            href="/tablet"
            className="h-9 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap self-start sm:self-auto flex-shrink-0 shadow-sm active:scale-95"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Unduh MingleBooth Studio</span>
          </Link>
        </div>

        {/* Pricing Cards */}
        <section className="flex flex-col gap-8">
          <div className="text-center max-w-xl mx-auto flex flex-col items-center">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Pilihan Paket Lisensi MingleBooth
            </h1>
            <p className="text-xs text-neutral-400 mt-1.5">
              Bayar mudah via <strong>Lynk.id</strong> (QRIS, Virtual Account BCA/Mandiri/BRI, GoPay, OVO). Lisensi aktif seketika setelah pembayaran.
            </p>

            {/* Billing Cycle Toggle */}
            <div className="mt-6 inline-flex items-center p-1 rounded-xl bg-[#14161A] border border-white/[0.08] shadow-inner">
              <button
                type="button"
                onClick={() => setBillingCycle('monthly')}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  billingCycle === 'monthly'
                    ? 'bg-white text-black shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Bayar Bulanan
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle('yearly')}
                className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  billingCycle === 'yearly'
                    ? 'bg-white text-black shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <span>Bayar Tahunan</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  billingCycle === 'yearly'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-400/20 text-emerald-300'
                }`}>
                  Hemat 77%
                </span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((p) => {
              const isCurrent = org?.plan_tier === p.id;
              const price = billingCycle === 'monthly' ? p.monthlyPrice : p.yearlyPrice;
              const period = billingCycle === 'monthly' ? '/ bulan' : '/ tahun';
              const targetLynkUrl = billingCycle === 'monthly' ? p.lynkUrlMonthly : p.lynkUrlYearly;

              return (
                <div
                  key={p.id}
                  className={`p-6 rounded-2xl flex flex-col justify-between transition-all ${
                    justRegistered && registeredPlan === p.id
                      ? 'bg-[#14161A] border-2 border-emerald-400/60 shadow-2xl relative ring-2 ring-emerald-400/20'
                      : p.isPopular
                      ? 'bg-[#14161A] border-2 border-white/30 shadow-2xl relative'
                      : 'bg-[#121316] border border-white/[0.07]'
                  }`}
                >
                  {justRegistered && registeredPlan === p.id ? (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-emerald-400 text-black text-[10px] font-bold tracking-wider uppercase shadow-md flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      <span>Paket Pilihan Anda</span>
                    </span>
                  ) : p.isPopular ? (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-white text-black text-[10px] font-bold tracking-wider uppercase shadow-md">
                      Paling Populer
                    </span>
                  ) : null}

                  <div className="flex flex-col gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-white">{p.name}</h3>
                      <p className="text-xs text-neutral-400 mt-1">{p.description}</p>
                    </div>

                    <div className="pt-2">
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold tracking-tight text-white">
                          {price}
                        </span>
                        <span className="text-xs text-neutral-400">{period}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] text-neutral-300 font-mono">
                          {p.quota}
                        </span>
                        <span className="text-neutral-600">•</span>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/[0.06] text-neutral-300 border border-white/[0.08]">
                          {billingCycle === 'monthly' ? 'Lisensi 30 Hari' : 'Lisensi 365 Hari'}
                        </span>
                      </div>
                    </div>

                    {/* Features List */}
                    <div className="pt-4 border-t border-white/[0.06] flex flex-col gap-2.5">
                      {p.features.map((feat, idx) => (
                        <div key={idx} className="flex items-start gap-2.5 text-xs text-neutral-300">
                          <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-6 flex flex-col gap-2">
                    {currentUser ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleCheckout(p.id, targetLynkUrl)}
                          disabled={checkingOutPlan === p.id}
                          className={`w-full py-2.5 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all ${
                            p.isPopular
                              ? 'bg-white hover:bg-neutral-200 text-black shadow-md'
                              : 'bg-[#1A1D23] hover:bg-[#22262E] text-white border border-white/[0.08]'
                          } ${checkingOutPlan === p.id ? 'opacity-70 cursor-wait' : ''}`}
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>{checkingOutPlan === p.id ? 'Memproses Order...' : 'Bayar via Lynk.id'}</span>
                          <ExternalLink className="w-3 h-3 opacity-60" />
                        </button>
                        {currentUser?.email && (
                          <p className="text-[10px] text-neutral-500 text-center">
                            Gunakan email <span className="text-neutral-300 font-mono">{currentUser.email}</span> saat checkout
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <Link
                          href={`/register?plan=${p.id}&cycle=${billingCycle}`}
                          className={`w-full py-2.5 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all ${
                            p.isPopular
                              ? 'bg-white hover:bg-neutral-200 text-black shadow-md'
                              : 'bg-[#1A1D23] hover:bg-[#22262E] text-white border border-white/[0.08]'
                          }`}
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Pilih Paket &amp; Daftar</span>
                          <ArrowRight className="w-3 h-3 opacity-60" />
                        </Link>
                        <p className="text-[10px] text-neutral-500 text-center">
                          Isi data studio &amp; password sebelum bayar
                        </p>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
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
          <Link href="/dashboard" className="hover:text-white transition-colors">
            Vendor Dashboard
          </Link>
          <Link href="/login" className="hover:text-white transition-colors">
            Masuk
          </Link>
          <Link href="/register" className="hover:text-white transition-colors">
            Daftar Vendor
          </Link>
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
          <span className="text-neutral-600">Secure Payment Powered by Lynk.id</span>
        </div>
      </footer>
    </div>
  );
}
