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
} from 'lucide-react';

export default function BillingPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [org, setOrg] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [simSuccessMsg, setSimSuccessMsg] = useState<string | null>(null);

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

  const handleSimulateLynkWebhook = async (plan: 'starter' | 'pro' | 'business', amount: number) => {
    setSimulating(true);
    setSimSuccessMsg(null);
    try {
      const refId = 'LYNK_TEST_' + Math.random().toString(36).substring(2, 8).toUpperCase();
      const payload = {
        event: 'payment.received',
        data: {
          message_action: 'SUCCESS',
          message_code: '0',
          message_data: {
            createdAt: new Date().toISOString(),
            customer: {
              email: currentUser?.email || 'vendor@minglebooth.app',
              name: org?.name || 'ABC Photobooth Studio',
              phone: '08123456789',
            },
            items: [
              {
                title: `MingleBooth ${plan.toUpperCase()} Annual Subscription`,
                price: amount,
                qty: 1,
                uuid: 'plan_' + plan,
              },
            ],
            refId: refId,
            totals: {
              grandTotal: amount,
              totalPrice: amount,
            },
          },
          message_id: 'API_CALL_' + Date.now(),
          message_title: 'Payment Received',
        },
      };

      const res = await fetch('/api/billing/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setSimSuccessMsg(`Pembayaran Berhasil (${refId}): Lisensi diperpanjang +365 Hari ke tier ${plan.toUpperCase()}!`);
        fetchOrg();
      } else {
        const err = await res.json();
        alert('Simulation error: ' + (err.error || 'Failed'));
      }
    } catch (e: any) {
      alert('Error calling webhook: ' + e.message);
    } finally {
      setSimulating(false);
    }
  };

  const calculateDaysRemaining = (dateStr?: string) => {
    if (!dateStr) return 365;
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  // Exact pricing & tier specifications from catatan.md Section 15
  const plans = [
    {
      id: 'starter',
      name: 'Starter',
      price: 'Rp 1.499.000',
      period: '/ tahun',
      amount: 1499000,
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
      lynkUrl: process.env.NEXT_PUBLIC_LYNK_URL_STARTER || 'https://lynk.id/minglebooth/r6k3kdyxj7vw',
    },
    {
      id: 'pro',
      name: 'Pro',
      price: 'Rp 2.999.000',
      period: '/ tahun',
      amount: 2999000,
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
      lynkUrl: process.env.NEXT_PUBLIC_LYNK_URL_PRO || 'https://lynk.id',
    },
    {
      id: 'business',
      name: 'Business',
      price: 'Rp 5.999.000',
      period: '/ tahun',
      amount: 5999000,
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
      lynkUrl: process.env.NEXT_PUBLIC_LYNK_URL_BUSINESS || 'https://lynk.id',
    },
  ];

  return (
    <div className="min-h-screen bg-[#090A0C] text-[#EDEDED] flex flex-col font-sans select-none antialiased">
      {/* Navbar */}
      <header className="h-14 px-6 sm:px-12 border-b border-white/[0.07] flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2.5">
            <img
              src="/logo-minglebooth-header.png"
              alt="MingleBooth"
              className="h-7 sm:h-8 w-auto object-contain"
            />
          </Link>
          <span className="text-xs text-neutral-500">/</span>
          <span className="text-xs text-neutral-400 font-medium">Billing & Lisensi</span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          {currentUser ? (
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-neutral-200 hover:text-white transition-colors border border-white/[0.08]"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Kembali ke Dashboard</span>
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="px-3 py-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-white/[0.05] transition-colors flex items-center gap-1.5"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Masuk</span>
              </Link>
              <Link
                href="/register"
                className="px-3 py-1.5 rounded-lg bg-white hover:bg-neutral-200 text-black font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Daftar Vendor</span>
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-10 flex flex-col gap-10">
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
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-between text-xs text-neutral-300">
            <span>Sudah memiliki akun vendor? Masuk untuk mengelola lisensi aktif Anda.</span>
            <Link href="/login" className="font-semibold text-white underline ml-2">
              Masuk Sekarang →
            </Link>
          </div>
        ) : null}

        {/* Success Notice from Webhook */}
        {simSuccessMsg && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between animate-fadeIn">
            <span>{simSuccessMsg}</span>
            <button
              onClick={() => setSimSuccessMsg(null)}
              className="text-emerald-400 hover:text-emerald-200 text-xs font-semibold ml-4"
            >
              Tutup
            </button>
          </div>
        )}

        {/* Pricing Cards */}
        <section className="flex flex-col gap-6">
          <div className="text-center max-w-xl mx-auto">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Pilihan Paket Lisensi Tahunan
            </h1>
            <p className="text-xs text-neutral-400 mt-1.5">
              Bayar mudah via <strong>Lynk.id</strong> (QRIS, Virtual Account BCA/Mandiri/BRI, GoPay, OVO). Lisensi aktif seketika setelah pembayaran.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((p) => {
              const isCurrent = org?.plan_tier === p.id;
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
                          {p.price}
                        </span>
                        <span className="text-xs text-neutral-400">{p.period}</span>
                      </div>
                      <span className="text-[11px] text-neutral-500 font-mono block mt-0.5">
                        {p.quota}
                      </span>
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
                          ? `${p.lynkUrl}${p.lynkUrl.includes('?') ? '&' : '?'}email=${encodeURIComponent(currentUser.email)}`
                          : p.lynkUrl
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
