'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Footer } from '@/components/Footer';

export default function VendorRegisterPage() {
  const router = useRouter();
  const [studioName, setStudioName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('mb_web_user');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed && (parsed.id || parsed.email)) {
            router.replace('/dashboard');
            return;
          }
        } catch {}
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        router.replace('/dashboard');
      }
    });
  }, [router]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanStudio = studioName.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanStudio) {
      setErrorMsg('Isi nama vendor atau studio photobooth Anda.');
      return;
    }

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
      setErrorMsg('Isi alamat email yang valid.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password minimal harus 6 karakter.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Konfirmasi password belum sama.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/web-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studioName: cleanStudio,
          email: cleanEmail,
          password,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        // Save session locally
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
    <div className="min-h-screen bg-mb-bg text-mb-ink flex flex-col justify-between font-sans antialiased selection:bg-[#FFD21F] selection:text-[#0B0B0D]">
      {/* Top Navbar */}
      <div className="bg-[#0B0B0D] text-white border-b border-white/10">
        <div className="max-w-[1080px] mx-auto px-5 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD21F] rounded-lg">
            <img
              src="/logo-minglebooth-header.png"
              alt="MingleBooth"
              className="h-9 w-auto object-contain block"
            />
          </Link>
          <div>
            <Link
              href="/login"
              className="text-[#B8B8BE] hover:text-white font-medium text-[15px] sm:text-[17px] transition-colors"
            >
              Sudah punya akun? Masuk
            </Link>
          </div>
        </div>
      </div>

      {/* Main Registration Form Container */}
      <main className="flex-1 flex items-center justify-center py-12 px-5">
        <div className="w-full max-w-[520px] text-center">
          {/* Badge Icon */}
          <div className="w-16 h-16 rounded-[18px] bg-mb-ink text-white mx-auto mb-5 flex items-center justify-center shadow-md">
            <svg
              viewBox="0 0 24 24"
              className="w-8 h-8 stroke-white fill-none stroke-[1.6] stroke-linecap-round stroke-linejoin-round"
              aria-hidden="true"
            >
              <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
          </div>

          <h1 className="text-[28px] sm:text-[38px] font-extrabold font-heading tracking-heading leading-heading mb-3">
            Buat Akun Vendor Gratis
          </h1>
          <p className="text-mb-muted text-base sm:text-[17px] leading-relaxed max-w-[46ch] mx-auto mb-8">
            Daftar gratis untuk mengunduh MingleBooth Studio dan menguji coba photobooth di laptop Anda. Tidak diperlukan kartu kredit atau pembayaran di awal.
          </p>

          {/* Form Card */}
          <div className="bg-mb-surface border-2 border-mb-ink rounded-[20px] p-7 sm:p-9 text-left shadow-sm">
            {errorMsg && (
              <div
                role="alert"
                className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[#D92D20] dark:text-[#FF8A80] text-sm font-medium flex items-center gap-2"
              >
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleRegister} noValidate className="space-y-4">
              {/* Studio Name Field */}
              <div className="relative">
                <label
                  htmlFor="nm"
                  className="block font-semibold text-[15px] mb-1.5 text-mb-ink"
                >
                  Nama Vendor / Studio Photobooth
                </label>
                <div className="relative">
                  <svg
                    className="absolute left-3.5 top-3.5 w-5 h-5 stroke-mb-muted fill-none stroke-[1.6] stroke-linecap-round stroke-linejoin-round pointer-events-none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <rect x="5" y="3" width="14" height="18" rx="1" />
                    <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3" />
                  </svg>
                  <input
                    id="nm"
                    type="text"
                    required
                    autoComplete="organization"
                    placeholder="Contoh: Royal Photobooth Bali"
                    value={studioName}
                    onChange={(e) => setStudioName(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 rounded-xl border-[1.5px] border-mb-line bg-mb-bg text-mb-ink font-sans text-base outline-none focus:border-mb-ink transition-colors"
                  />
                </div>
              </div>

              {/* Email Field */}
              <div className="relative">
                <label
                  htmlFor="em"
                  className="block font-semibold text-[15px] mb-1.5 text-mb-ink"
                >
                  Email Pemilik / Penanggung Jawab
                </label>
                <div className="relative">
                  <svg
                    className="absolute left-3.5 top-3.5 w-5 h-5 stroke-mb-muted fill-none stroke-[1.6] stroke-linecap-round stroke-linejoin-round pointer-events-none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="M3 7l9 6 9-6" />
                  </svg>
                  <input
                    id="em"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="owner@royalphotobooth.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 rounded-xl border-[1.5px] border-mb-line bg-mb-bg text-mb-ink font-sans text-base outline-none focus:border-mb-ink transition-colors"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="relative">
                <label
                  htmlFor="pw"
                  className="block font-semibold text-[15px] mb-1.5 text-mb-ink"
                >
                  Password
                </label>
                <div className="relative">
                  <svg
                    className="absolute left-3.5 top-3.5 w-5 h-5 stroke-mb-muted fill-none stroke-[1.6] stroke-linecap-round stroke-linejoin-round pointer-events-none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle cx="8" cy="15" r="4" />
                    <path d="M11 12l8-8M16 7l2 2M14 9l2 2" />
                  </svg>
                  <input
                    id="pw"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    placeholder="Minimal 6 karakter"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-11 pr-24 py-3 rounded-xl border-[1.5px] border-mb-line bg-mb-bg text-mb-ink font-sans text-base outline-none focus:border-mb-ink transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-sm font-semibold text-mb-muted hover:text-mb-ink px-2 py-0.5 rounded transition-colors"
                  >
                    {showPassword ? 'Sembunyikan' : 'Tampilkan'}
                  </button>
                </div>
              </div>

              {/* Confirm Password Field */}
              <div className="relative">
                <label
                  htmlFor="pw2"
                  className="block font-semibold text-[15px] mb-1.5 text-mb-ink"
                >
                  Konfirmasi Password
                </label>
                <div className="relative">
                  <svg
                    className="absolute left-3.5 top-3.5 w-5 h-5 stroke-mb-muted fill-none stroke-[1.6] stroke-linecap-round stroke-linejoin-round pointer-events-none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle cx="8" cy="15" r="4" />
                    <path d="M11 12l8-8M16 7l2 2M14 9l2 2" />
                  </svg>
                  <input
                    id="pw2"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    placeholder="Ketik ulang password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-11 pr-24 py-3 rounded-xl border-[1.5px] border-mb-line bg-mb-bg text-mb-ink font-sans text-base outline-none focus:border-mb-ink transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-3 text-sm font-semibold text-mb-muted hover:text-mb-ink px-2 py-0.5 rounded transition-colors"
                  >
                    {showConfirmPassword ? 'Sembunyikan' : 'Tampilkan'}
                  </button>
                </div>
              </div>

              {/* Benefits Box */}
              <ul className="my-5 p-4 rounded-xl border border-mb-line bg-mb-bg space-y-2.5 list-none text-left">
                <li className="flex items-start gap-2.5 text-sm text-mb-ink">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" fill="#FFD21F" />
                    <path d="M8 12l3 3 5-6" fill="none" stroke="#0B0B0D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>Akses langsung ke Dashboard Vendor &amp; Unduhan Studio</span>
                </li>
                <li className="flex items-start gap-2.5 text-sm text-mb-ink">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" fill="#FFD21F" />
                    <path d="M8 12l3 3 5-6" fill="none" stroke="#0B0B0D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>Mode Demo pengujian kamera fisik tanpa batas waktu</span>
                </li>
                <li className="flex items-start gap-2.5 text-sm text-mb-ink">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" fill="#FFD21F" />
                    <path d="M8 12l3 3 5-6" fill="none" stroke="#0B0B0D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>Bayar langganan nanti saat siap mengaktifkan galeri cloud</span>
                </li>
              </ul>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-3.5 text-[17px] font-semibold mt-2"
              >
                {loading ? 'Mendaftarkan Akun...' : 'Buat Akun Gratis'}
              </button>
            </form>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
