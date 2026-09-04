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
  const [selectedPlan, setSelectedPlan] = useState<'starter' | 'pro' | 'business'>('pro');
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Save info and redirect to Billing with Lynk.id checkout
    setTimeout(() => {
      router.push('/billing');
    }, 500);
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
          <div className="flex flex-col gap-1.5 pt-2">
            <label className="text-xs text-neutral-400 font-medium">Pilihan Paket Lisensi</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'starter', label: 'Starter', price: 'Mulai 549rb', quota: '1 Device' },
                { id: 'pro', label: 'Pro', price: 'Mulai 1.099jt', quota: '3 Devices' },
                { id: 'business', label: 'Business', price: 'Mulai 2.199jt', quota: '10 Devices' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPlan(p.id as any)}
                  className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-colors ${
                    selectedPlan === p.id
                      ? 'bg-white text-black border-white shadow-sm'
                      : 'bg-[#181A1F] border-white/[0.06] text-neutral-300 hover:text-white'
                  }`}
                >
                  <span className="text-xs font-bold">{p.label}</span>
                  <span className="text-[10px] font-mono mt-0.5">{p.price}</span>
                  <span className={`text-[9px] mt-1 ${selectedPlan === p.id ? 'text-neutral-700' : 'text-neutral-500'}`}>{p.quota}</span>
                </button>
              ))}
            </div>
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
