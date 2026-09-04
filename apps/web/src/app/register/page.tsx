'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Mail, Key, Building, ArrowRight, Camera, Check } from 'lucide-react';

export default function VendorRegisterPage() {
  const router = useRouter();
  const [studioName, setStudioName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');
  const [selectedPlan, setSelectedPlan] = useState<'starter' | 'pro' | 'business'>('pro');
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Save registration context and session to localStorage
    const cleanEmail = email.trim().toLowerCase();
    const vendorData = {
      studioName: studioName.trim(),
      email: cleanEmail,
      selectedPlan,
      billingCycle,
    };
    localStorage.setItem('mb_registered_vendor', JSON.stringify(vendorData));
    localStorage.setItem('mb_web_user', JSON.stringify({ email: cleanEmail, name: studioName.trim() }));

    // Redirect to Billing page with selected cycle & plan
    setTimeout(() => {
      router.push(`/billing?cycle=${billingCycle}&plan=${selectedPlan}&email=${encodeURIComponent(cleanEmail)}`);
    }, 400);
  };

  return (
    <div className="min-h-screen bg-[#090A0C] text-[#EDEDED] flex flex-col justify-between p-6 select-none font-sans antialiased">
      {/* Top Navbar */}
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <img
            src="/logo-minglebooth-header.png"
            alt="MingleBooth"
            className="h-7 w-auto object-contain"
          />
        </Link>

        <Link
          href="/login"
          className="text-xs text-neutral-400 hover:text-white transition-colors"
        >
          Sudah punya akun? <span className="text-white font-medium underline ml-1">Masuk</span>
        </Link>
      </header>

      {/* Center Register Box */}
      <main className="max-w-md w-full mx-auto flex flex-col gap-6 animate-fadeIn my-8">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-12 h-12 rounded-2xl bg-[#14161A] border border-white/[0.08] flex items-center justify-center text-white shadow-md">
            <Camera className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mt-1">
            Daftar Akun Vendor
          </h1>
          <p className="text-xs text-neutral-400 max-w-sm">
            Mulai kelola armada photobooth studio, event wedding, dan galeri cloud Anda dengan MingleBooth.
          </p>
        </div>

        <form onSubmit={handleRegister} className="flex flex-col gap-3.5 bg-[#121316] border border-white/[0.08] p-6 rounded-2xl shadow-xl">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-neutral-400 font-medium">Nama Vendor / Studio Photobooth</label>
            <div className="relative">
              <Building className="w-4 h-4 text-neutral-500 absolute left-3.5 top-3" />
              <input
                type="text"
                required
                placeholder="Contoh: Royal Photobooth Bali"
                value={studioName}
                onChange={(e) => setStudioName(e.target.value)}
                className="w-full bg-[#181A1F] border border-white/[0.08] text-xs rounded-xl pl-10 pr-3.5 py-2.5 text-white outline-none focus:border-white/30 transition-colors"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-neutral-400 font-medium">Email Pemilik / Penanggung Jawab</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-neutral-500 absolute left-3.5 top-3" />
              <input
                type="email"
                required
                placeholder="owner@royalphotobooth.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#181A1F] border border-white/[0.08] text-xs rounded-xl pl-10 pr-3.5 py-2.5 text-white outline-none focus:border-white/30 transition-colors"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-neutral-400 font-medium">Password Baru</label>
            <div className="relative">
              <Key className="w-4 h-4 text-neutral-500 absolute left-3.5 top-3" />
              <input
                type="password"
                required
                placeholder="Minimal 8 karakter"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#181A1F] border border-white/[0.08] text-xs rounded-xl pl-10 pr-3.5 py-2.5 text-white outline-none focus:border-white/30 transition-colors"
              />
            </div>
          </div>

          {/* Plan Choice Selector */}
          <div className="flex flex-col gap-2 pt-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-neutral-400 font-medium">Pilihan Paket Lisensi</label>
              
              {/* Billing Cycle Switch */}
              <div className="inline-flex items-center p-0.5 rounded-lg bg-[#181A1F] border border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setBillingCycle('monthly')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                    billingCycle === 'monthly'
                      ? 'bg-white text-black font-bold shadow-sm'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Bulanan
                </button>
                <button
                  type="button"
                  onClick={() => setBillingCycle('yearly')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition-all ${
                    billingCycle === 'yearly'
                      ? 'bg-white text-black font-bold shadow-sm'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <span>Tahunan</span>
                  <span className={`px-1 py-0.2 rounded text-[9px] font-bold ${
                    billingCycle === 'yearly' ? 'bg-emerald-600 text-white' : 'text-emerald-400'
                  }`}>
                    -77%
                  </span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  id: 'starter',
                  label: 'Starter',
                  price: billingCycle === 'monthly' ? 'Rp 549rb' : 'Rp 1.499jt',
                  period: billingCycle === 'monthly' ? '/bln' : '/thn',
                  quota: '1 Device',
                  badge: billingCycle === 'monthly' ? '30 Hari' : '365 Hari',
                },
                {
                  id: 'pro',
                  label: 'Pro',
                  price: billingCycle === 'monthly' ? 'Rp 1.099jt' : 'Rp 2.999jt',
                  period: billingCycle === 'monthly' ? '/bln' : '/thn',
                  quota: '3 Devices',
                  badge: billingCycle === 'monthly' ? '30 Hari' : '365 Hari',
                  isPopular: true,
                },
                {
                  id: 'business',
                  label: 'Business',
                  price: billingCycle === 'monthly' ? 'Rp 2.199jt' : 'Rp 5.999jt',
                  period: billingCycle === 'monthly' ? '/bln' : '/thn',
                  quota: '10 Devices',
                  badge: billingCycle === 'monthly' ? '30 Hari' : '365 Hari',
                },
              ].map((p) => {
                const isSelected = selectedPlan === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPlan(p.id as any)}
                    className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all relative ${
                      isSelected
                        ? 'bg-white text-black border-white shadow-md'
                        : 'bg-[#181A1F] border-white/[0.06] text-neutral-300 hover:border-white/20'
                    }`}
                  >
                    {p.isPopular && (
                      <span className={`absolute -top-2 right-2 px-1.5 py-0.2 rounded text-[8px] font-extrabold uppercase tracking-wide ${
                        isSelected ? 'bg-neutral-900 text-white' : 'bg-white text-black'
                      }`}>
                        Populer
                      </span>
                    )}
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold">{p.label}</span>
                      </div>
                      <div className="flex items-baseline gap-0.5 mt-0.5">
                        <span className="text-xs font-bold font-mono">{p.price}</span>
                        <span className={`text-[10px] ${isSelected ? 'text-neutral-600' : 'text-neutral-400'}`}>
                          {p.period}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-current/10">
                      <span className={`text-[9px] font-medium ${isSelected ? 'text-neutral-700' : 'text-neutral-400'}`}>
                        {p.quota}
                      </span>
                      <span className={`text-[8px] font-semibold px-1 py-0.2 rounded ${
                        isSelected ? 'bg-black/10 text-neutral-800' : 'bg-white/10 text-neutral-300'
                      }`}>
                        {p.badge}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-neutral-500 text-center mt-0.5">
              {billingCycle === 'yearly' ? 'Hemat s.d. 77% dengan paket tahunan (Lisensi 365 Hari)' : 'Akses fleksibel per 30 hari, perpanjang kapan saja.'}
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-3 w-full py-3 rounded-xl bg-white hover:bg-neutral-200 text-black font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-98 shadow-md"
          >
            <span>{loading ? 'Mendaftarkan...' : 'Lanjut ke Pembayaran Lynk.id'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-neutral-500 flex flex-col items-center gap-2.5 pt-6">
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
            className="h-10 w-auto object-contain opacity-80 hover:opacity-100 transition-opacity"
          />
        </a>
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
      </footer>
    </div>
  );
}
