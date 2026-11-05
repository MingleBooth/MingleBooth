'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { supabase } from '@/lib/supabase';
import { Check, ShieldCheck, RefreshCw, CreditCard, ChevronRight } from 'lucide-react';

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

  const handleCheckout = async (planId: string) => {
    setCheckingOutPlan(planId);
    try {
      const headers = getAuthHeaders();
      const res = await fetch('/api/vendor/checkout', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          planTier: planId,
          billingInterval: billingCycle,
          customerEmail: currentUser?.email,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.paymentUrl) {
          // Direct vendor to payment checkout gateway
          window.location.href = data.paymentUrl;
          return;
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || 'Gagal memulai sesi pembayaran.');
      }
    } catch (err) {
      console.error('Payment checkout creation error:', err);
      alert('Terjadi kendala jaringan saat memproses pembayaran.');
    } finally {
      setCheckingOutPlan(null);
    }
  };

  useEffect(() => {
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

    fetchPricing();

    let foundUser = false;
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('mb_web_user');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed && (parsed.id || parsed.email)) {
            setCurrentUser(parsed);
            fetchOrgAndBilling();
            foundUser = true;
          }
        } catch {
          // ignore parsing error
        }
      }
    }

    if (!foundUser) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          const u = {
            id: session.user.id,
            email: session.user.email,
            name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0],
          };
          setCurrentUser(u);
          fetchOrgAndBilling();
        } else {
          setLoading(false);
        }
      });
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setCurrentUser({
          id: session.user.id,
          email: session.user.email,
          name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0],
        });
        fetchOrgAndBilling();
      } else {
        const stored = typeof window !== 'undefined' ? localStorage.getItem('mb_web_user') : null;
        if (stored) {
          try {
            setCurrentUser(JSON.parse(stored));
            fetchOrgAndBilling();
          } catch {
            setCurrentUser(null);
          }
        } else {
          setCurrentUser(null);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const plans = [
    {
      id: 'starter',
      name: 'Starter',
      price: billingCycle === 'yearly'
        ? `Rp ${(dynamicPrices.starter?.yearly || 1499000).toLocaleString('id-ID')}`
        : `Rp ${(dynamicPrices.starter?.monthly || 549000).toLocaleString('id-ID')}`,
      unit: billingCycle === 'yearly' ? '/ tahun' : '/ bulan',
      description: 'Solusi lengkap untuk solo vendor photobooth atau roaming booth.',
      quotaText: billingCycle === 'yearly' ? '1 Perangkat Booth · Lisensi 365 Hari' : '1 Perangkat Booth · Lisensi 30 Hari',
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
      lynkUrl: billingCycle === 'yearly'
        ? (process.env.NEXT_PUBLIC_LYNK_URL_STARTER || 'https://lynk.id/minglebooth/r6k3kdyxj7vw')
        : (process.env.NEXT_PUBLIC_LYNK_URL_STARTER_MONTHLY || 'https://lynk.id/minglebooth/llx2p98w1qlp'),
    },
    {
      id: 'pro',
      name: 'Pro',
      price: billingCycle === 'yearly'
        ? `Rp ${(dynamicPrices.pro?.yearly || 2999000).toLocaleString('id-ID')}`
        : `Rp ${(dynamicPrices.pro?.monthly || 1099000).toLocaleString('id-ID')}`,
      unit: billingCycle === 'yearly' ? '/ tahun' : '/ bulan',
      description: 'Pilihan paling populer untuk vendor photobooth aktif & wedding studio.',
      quotaText: billingCycle === 'yearly' ? '3 Perangkat Booth · Lisensi 365 Hari' : '3 Perangkat Booth · Lisensi 30 Hari',
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
      lynkUrl: billingCycle === 'yearly'
        ? (process.env.NEXT_PUBLIC_LYNK_URL_PRO || 'https://lynk.id/minglebooth/4gx630xzzq8r')
        : (process.env.NEXT_PUBLIC_LYNK_URL_PRO_MONTHLY || 'https://lynk.id/minglebooth/eqj6xmrjd51r'),
    },
    {
      id: 'business',
      name: 'Business',
      price: billingCycle === 'yearly'
        ? `Rp ${(dynamicPrices.business?.yearly || 5999000).toLocaleString('id-ID')}`
        : `Rp ${(dynamicPrices.business?.monthly || 2199000).toLocaleString('id-ID')}`,
      unit: billingCycle === 'yearly' ? '/ tahun' : '/ bulan',
      description: 'Untuk agensi besar dan enterprise dengan armada photobooth multi-event.',
      quotaText: billingCycle === 'yearly' ? '10 Perangkat Booth · Lisensi 365 Hari' : '10 Perangkat Booth · Lisensi 30 Hari',
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
      lynkUrl: billingCycle === 'yearly'
        ? (process.env.NEXT_PUBLIC_LYNK_URL_BUSINESS || 'https://lynk.id/minglebooth/d4jm3v31kypm')
        : (process.env.NEXT_PUBLIC_LYNK_URL_BUSINESS_MONTHLY || 'https://lynk.id/minglebooth/zr78ewnemej1'),
    },
  ];

  return (
    <div className="min-h-screen bg-mb-bg text-mb-ink flex flex-col font-sans antialiased selection:bg-[#FFD21F] selection:text-[#0B0B0D]">
      <Navbar activePage="pricing" />

      {/* Top Header Section (Dark) */}
      <section className="bg-[#0B0B0D] text-white border-b border-white/10 pt-10 pb-12 sm:pb-16">
        <div className="max-w-[1080px] mx-auto px-5">
          <h1 className="text-[34px] sm:text-[48px] font-extrabold font-heading tracking-heading leading-heading text-white max-w-[22ch]">
            Pilihan Paket Lisensi MingleBooth
          </h1>
          <p className="mt-4 mb-6 text-[#C9C9CE] text-lg sm:text-[19px] leading-relaxed max-w-[56ch]">
            Pembayaran instan &amp; otomatis (QRIS, Virtual Account BCA/Mandiri/BRI/BNI/Permata, GoPay, OVO, ShopeePay, DANA, Kartu Kredit). Lisensi aktif seketika setelah pembayaran diverifikasi.
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-block px-3.5 py-1.5 rounded-full bg-[#FFD21F] text-[#0B0B0D] font-bold text-sm">
              Bayar tahunan hemat 77%
            </span>

            {/* Cycle Selector */}
            <div className="flex items-center p-1 rounded-full bg-white/10 border border-white/15">
              <button
                type="button"
                onClick={() => setBillingCycle('yearly')}
                className={`px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all ${
                  billingCycle === 'yearly'
                    ? 'bg-white text-[#0B0B0D] shadow-sm'
                    : 'text-[#C9C9CE] hover:text-white'
                }`}
              >
                Tahunan (Hemat 77%)
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle('monthly')}
                className={`px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all ${
                  billingCycle === 'monthly'
                    ? 'bg-white text-[#0B0B0D] shadow-sm'
                    : 'text-[#C9C9CE] hover:text-white'
                }`}
              >
                Bulanan
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="flex-1 py-10">
        <div className="max-w-[1080px] mx-auto px-5">
          {/* Notification If Just Registered */}
          {justRegistered && (
            <div className="mb-8 p-5 rounded-2xl bg-[#FFD21F]/15 border-2 border-[#FFD21F] flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-[#FFD21F] text-[#0B0B0D] font-bold flex items-center justify-center flex-shrink-0">
                ✓
              </span>
              <div className="text-sm">
                <p className="font-bold text-mb-ink">Akun Vendor Berhasil Dibuat!</p>
                <p className="text-mb-muted">
                  Selesaikan aktivasi lisensi di bawah untuk mengaktifkan galeri cloud dan kuota perangkat armada Anda.
                </p>
              </div>
            </div>
          )}

          {/* 2 Important Notices */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
            <div className="p-6 rounded-2xl bg-mb-surface border border-mb-line flex flex-col items-start justify-between gap-3">
              <div>
                <h3 className="text-[20px] font-bold font-heading mb-1.5">
                  Sudah memiliki akun vendor?
                </h3>
                <p className="text-mb-muted text-[15px] leading-relaxed">
                  Masuk untuk mengelola lisensi aktif dan perangkat booth Anda.
                </p>
              </div>
              <Link
                href="/login"
                className="btn-primary text-sm py-2 px-5 mt-2"
              >
                Masuk Sekarang
              </Link>
            </div>

            <div className="p-6 rounded-2xl bg-mb-surface border border-mb-line border-l-[6px] border-l-[#FFD21F] flex flex-col items-start justify-between gap-3">
              <div>
                <h3 className="text-[20px] font-bold font-heading mb-1.5">
                  Ingin menguji coba terlebih dahulu?
                </h3>
                <p className="text-mb-muted text-[15px] leading-relaxed">
                  Daftar akun dan masuk ke MingleBooth Studio untuk mencoba kamera Sony &alpha;7C II, Alpha tethering, atau webcam secara lokal dalam Mode Demo gratis. Selesaikan pembayaran ketika siap mengaktifkan Galeri Cloud Tamu, Live QR, dan armada booth komersial.
                </p>
              </div>
              <Link
                href="/download"
                className="btn-secondary text-sm py-2 px-5 mt-2"
              >
                Unduh MingleBooth Studio
              </Link>
            </div>
          </div>

          {/* 3 Pricing Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch mb-16">
            {plans.map((p) => {
              const isPro = p.isPopular;
              return (
                <div
                  key={p.id}
                  className={`rounded-2xl p-7 flex flex-col relative transition-all ${
                    isPro
                      ? 'bg-[#0B0B0D] text-white border-2 border-[#0B0B0D] shadow-xl md:-translate-y-2'
                      : 'bg-mb-surface text-mb-ink border-2 border-mb-ink shadow-sm'
                  }`}
                >
                  {isPro && (
                    <span className="absolute -top-3.5 left-6 bg-[#FFD21F] text-[#0B0B0D] font-bold text-xs px-3.5 py-1 rounded-full tracking-wide uppercase">
                      Paling Populer
                    </span>
                  )}

                  <h2 className="text-[28px] font-extrabold font-heading tracking-tight">
                    {p.name}
                  </h2>
                  <p
                    className={`text-[15px] mt-2 mb-4 min-h-[3em] ${
                      isPro ? 'text-[#C9C9CE]' : 'text-mb-muted'
                    }`}
                  >
                    {p.description}
                  </p>

                  <div className="font-heading font-extrabold text-[32px] sm:text-[34px] tracking-tight">
                    {p.price}{' '}
                    <span className={`font-sans font-medium text-sm ${isPro ? 'text-neutral-400' : 'text-mb-muted'}`}>
                      {p.unit}
                    </span>
                  </div>

                  <div
                    className={`text-sm font-semibold mt-1 mb-5 pb-4 border-b ${
                      isPro
                        ? 'text-[#E2E2E6] border-white/20'
                        : 'text-mb-muted border-mb-line'
                    }`}
                  >
                    {p.quotaText}
                  </div>

                  {/* Features List */}
                  <ul className="space-y-2.5 mb-8 flex-1 text-[15px]">
                    {p.features.map((feat, fIdx) => (
                      <li key={fIdx} className="flex items-start gap-2.5 leading-snug">
                        <Check
                          className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                            isPro ? 'text-[#FFD21F]' : 'text-mb-ink'
                          }`}
                        />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Action CTA */}
                  {currentUser ? (
                    <button
                      type="button"
                      disabled={checkingOutPlan === p.id}
                      onClick={() => handleCheckout(p.id)}
                      className={`w-full py-3.5 rounded-full font-semibold text-[16px] text-center transition-all ${
                        isPro
                          ? 'bg-white text-[#0B0B0D] hover:bg-neutral-100'
                          : 'bg-mb-btn text-mb-btn-ink hover:opacity-90'
                      }`}
                    >
                      {checkingOutPlan === p.id ? 'Memproses Pembayaran...' : 'Bayar Sekarang'}
                    </button>
                  ) : (
                    <Link
                      href={`/register?plan=${p.id}&cycle=${billingCycle}`}
                      className={`w-full py-3.5 rounded-full font-semibold text-[16px] text-center transition-all block ${
                        isPro
                          ? 'bg-white text-[#0B0B0D] hover:bg-neutral-100'
                          : 'bg-mb-btn text-mb-btn-ink hover:opacity-90'
                      }`}
                    >
                      Pilih Paket &amp; Daftar
                    </Link>
                  )}

                  <small
                    className={`block text-center text-xs mt-3 ${
                      isPro ? 'text-neutral-400' : 'text-mb-muted'
                    }`}
                  >
                    {currentUser
                      ? 'Pembayaran instan QRIS & Virtual Account'
                      : 'Isi data studio & password sebelum bayar'}
                  </small>
                </div>
              );
            })}
          </div>

          {/* Payment History if Logged In */}
          {currentUser && payments.length > 0 && (
            <div className="mt-12 p-6 rounded-2xl bg-mb-surface border border-mb-line">
              <h3 className="text-xl font-bold font-heading mb-4">
                Riwayat Pembayaran Lisensi
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-mb-line text-mb-muted">
                      <th className="py-2.5 font-medium">Order ID</th>
                      <th className="py-2.5 font-medium">Paket</th>
                      <th className="py-2.5 font-medium">Nominal</th>
                      <th className="py-2.5 font-medium">Status</th>
                      <th className="py-2.5 font-medium">Tanggal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p, idx) => (
                      <tr key={idx} className="border-b border-mb-line/50">
                        <td className="py-3 font-mono text-xs">{p.order_id || p.id}</td>
                        <td className="py-3 font-semibold uppercase">{p.plan_tier}</td>
                        <td className="py-3">Rp {(p.amount_idr || 0).toLocaleString('id-ID')}</td>
                        <td className="py-3">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600">
                            {p.status}
                          </span>
                        </td>
                        <td className="py-3 text-mb-muted">
                          {p.created_at ? new Date(p.created_at).toLocaleDateString('id-ID') : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer showDokuNotice={true} />
    </div>
  );
}
