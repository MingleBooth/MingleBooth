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
} from 'lucide-react';

export default function BillingPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [org, setOrg] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');

  useEffect(() => {
    // Check if user is logged in
    const session = localStorage.getItem('mb_web_user');
    if (session) {
      const parsed = JSON.parse(session);
      setCurrentUser(parsed);
      fetchOrg();
    } else {
      setLoading(false);
    }
  }, []);

  const fetchOrg = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/vendor/events');
      if (res.ok) {
        const data = await res.json();
        if (data.org) setOrg(data.org);
      }
    } catch (err) {
      console.error('Fetch org error:', err);
    } finally {
      setLoading(false);
    }
  };

  const calculateDaysRemaining = (dateStr?: string) => {
    if (!dateStr) return 365;
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  // Pricing & tier specifications (Bulanan & Tahunan)
  const plans = [
    {
      id: 'starter',
      name: 'Starter',
      monthlyPrice: 'Rp 549.000',
      yearlyPrice: 'Rp 1.499.000',
      monthlyAmount: 549000,
      yearlyAmount: 1499000,
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
      lynkUrlMonthly: process.env.NEXT_PUBLIC_LYNK_URL_STARTER_MONTHLY || 'https://lynk.id/minglebooth',
    },
    {
      id: 'pro',
      name: 'Pro',
      monthlyPrice: 'Rp 1.099.000',
      yearlyPrice: 'Rp 2.999.000',
      monthlyAmount: 1099000,
      yearlyAmount: 2999000,
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
      lynkUrlYearly: process.env.NEXT_PUBLIC_LYNK_URL_PRO || 'https://lynk.id',
      lynkUrlMonthly: process.env.NEXT_PUBLIC_LYNK_URL_PRO_MONTHLY || 'https://lynk.id',
    },
    {
      id: 'business',
      name: 'Business',
      monthlyPrice: 'Rp 2.199.000',
      yearlyPrice: 'Rp 5.999.000',
      monthlyAmount: 2199000,
      yearlyAmount: 5999000,
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
      lynkUrlYearly: process.env.NEXT_PUBLIC_LYNK_URL_BUSINESS || 'https://lynk.id',
      lynkUrlMonthly: process.env.NEXT_PUBLIC_LYNK_URL_BUSINESS_MONTHLY || 'https://lynk.id',
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
                  Paket Aktif: <strong className="text-white capitalize">{org?.plan_tier || 'Pro'}</strong> • Kuota:{' '}
                  <strong className="text-white">{org?.max_devices_quota || 3} Perangkat</strong> • Masa Aktif:{' '}
                  <strong className="text-white">
                    {calculateDaysRemaining(org?.subscription_expires_at)} hari lagi
                  </strong>{' '}
                  ({new Date(org?.subscription_expires_at || Date.now()).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })})
                </p>
              </div>
            </div>

            <button
              onClick={fetchOrg}
              disabled={loading}
              className="h-8 px-3 rounded-lg bg-[#181A1E] hover:bg-[#202328] border border-white/[0.08] text-xs font-medium text-neutral-300 hover:text-white flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Sinkronkan Data</span>
            </button>
          </section>
        ) : !currentUser ? (
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
                    p.isPopular
                      ? 'bg-[#14161A] border-2 border-white/30 shadow-2xl relative'
                      : 'bg-[#121316] border border-white/[0.07]'
                  }`}
                >
                  {p.isPopular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-white text-black text-[10px] font-bold tracking-wider uppercase shadow-md">
                      Paling Populer
                    </span>
                  )}

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
                    <a
                      href={
                        currentUser?.email
                          ? `${targetLynkUrl}${targetLynkUrl.includes('?') ? '&' : '?'}email=${encodeURIComponent(currentUser.email)}`
                          : targetLynkUrl
                      }
                      target="_blank"
                      rel="noreferrer"
                      className={`w-full py-2.5 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all ${
                        p.isPopular
                          ? 'bg-white hover:bg-neutral-200 text-black shadow-md'
                          : 'bg-[#1A1D23] hover:bg-[#22262E] text-white border border-white/[0.08]'
                      }`}
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Bayar via Lynk.id</span>
                      <ExternalLink className="w-3 h-3 opacity-60" />
                    </a>
                    {currentUser?.email && (
                      <p className="text-[10px] text-neutral-500 text-center">
                        Gunakan email <span className="text-neutral-300 font-mono">{currentUser.email}</span> saat checkout
                      </p>
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
