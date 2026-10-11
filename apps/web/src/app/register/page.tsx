'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, Key, Building, ArrowRight, Camera, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function VendorRegisterPage() {
  const router = useRouter();
  const [studioName, setStudioName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (password !== confirmPassword) {
      setErrorMsg('Konfirmasi password tidak cocok dengan password yang dimasukkan.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password minimal harus 6 karakter.');
      return;
    }

    setLoading(true);

    const cleanEmail = email.trim().toLowerCase();

    try {
      const res = await fetch('/api/auth/web-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studioName: studioName.trim(),
          email: cleanEmail,
          password,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        // Save session
        localStorage.setItem('mb_web_user', JSON.stringify(data.user));
        if (data.token) {
          localStorage.setItem('mb_web_token', data.token);
        }

        // Direct to vendor dashboard
        router.push(data.redirectUrl || '/dashboard?welcome=1');
      } else {
        setErrorMsg(data.error || 'Pendaftaran gagal. Silakan coba lagi.');
        setLoading(false);
      }
    } catch (err: any) {
      console.error('Registration failed:', err);
      setErrorMsg(err.message || 'Gagal terhubung ke server');
      setLoading(false);
    }
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
            Buat Akun Vendor Gratis
          </h1>
          <p className="text-xs text-neutral-400 max-w-sm leading-relaxed">
            Daftar gratis untuk mengunduh MingleBooth Studio dan menguji coba photobooth di laptop Anda. Tidak diperlukan kartu kredit atau pembayaran di awal.
          </p>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleRegister} className="flex flex-col gap-4 bg-[#121316] border border-white/[0.08] p-6 sm:p-7 rounded-2xl shadow-xl">
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
            <label className="text-xs text-neutral-400 font-medium">Password</label>
            <div className="relative">
              <Key className="w-4 h-4 text-neutral-500 absolute left-3.5 top-3" />
              <input
                type="password"
                required
                placeholder="Minimal 6 karakter"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#181A1F] border border-white/[0.08] text-xs rounded-xl pl-10 pr-3.5 py-2.5 text-white outline-none focus:border-white/30 transition-colors"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-neutral-400 font-medium">Konfirmasi Password</label>
            <div className="relative">
              <Key className="w-4 h-4 text-neutral-500 absolute left-3.5 top-3" />
              <input
                type="password"
                required
                placeholder="Ketik ulang password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-[#181A1F] border border-white/[0.08] text-xs rounded-xl pl-10 pr-3.5 py-2.5 text-white outline-none focus:border-white/30 transition-colors"
              />
            </div>
          </div>

          {/* Benefits summary list */}
          <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] flex flex-col gap-2 mt-1">
            <div className="flex items-center gap-2 text-xs text-neutral-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              <span>Akses langsung ke Dashboard Vendor &amp; Unduhan Studio</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-neutral-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              <span>Mode Demo pengujian kamera fisik tanpa batas waktu</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-neutral-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              <span>Bayar langganan nanti saat siap mengaktifkan galeri cloud</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full py-3 rounded-xl bg-white hover:bg-neutral-200 text-black font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-98 shadow-md"
          >
            <span>{loading ? 'Membuat Akun...' : 'Buat Akun Gratis'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <p className="text-[11px] text-neutral-500 text-center">
          Ingin melihat perbandingan paket terlebih dahulu?{' '}
          <Link href="/billing" className="text-neutral-300 hover:text-white underline ml-1">
            Lihat Paket &amp; Lisensi
          </Link>
        </p>
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
