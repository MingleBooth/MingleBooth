'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Footer } from '@/components/Footer';

export default function VendorLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

  const executeLogin = async (targetEmail: string, targetPass: string) => {
    const cleanEmail = targetEmail.trim().toLowerCase();
    if (!cleanEmail || !targetPass) {
      setErrorMsg('Masukkan email dan password akun Anda.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/web-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password: targetPass }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        localStorage.setItem('mb_web_user', JSON.stringify(data.user));
        if (data.token) {
          localStorage.setItem('mb_web_token', data.token);
        }
        router.push(data.redirectUrl || '/dashboard');
      } else {
        setErrorMsg(data.error || 'Email atau password salah.');
        setLoading(false);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal terhubung ke server');
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    executeLogin(email, password);
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
              href="/register"
              className="text-[#B8B8BE] hover:text-white font-medium text-[15px] sm:text-[17px] transition-colors"
            >
              Belum punya akun? Daftar Vendor
            </Link>
          </div>
        </div>
      </div>

      {/* Center Auth Card */}
      <main className="flex-1 flex items-center justify-center py-12 px-5">
        <div className="w-full max-w-[440px] bg-mb-surface border-2 border-mb-ink rounded-[20px] p-8 sm:p-9 shadow-sm">
          <h1 className="text-[32px] font-extrabold font-heading tracking-heading leading-heading text-mb-ink">
            Masuk ke Portal
          </h1>
          <p className="text-mb-muted text-[15px] mt-2 mb-6">
            Satu pintu masuk akun vendor dan manajemen MingleBooth.
          </p>

          {errorMsg && (
            <div
              role="alert"
              className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[#D92D20] dark:text-[#FF8A80] text-sm font-medium"
            >
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleLogin} noValidate className="space-y-4">
            <div>
              <label
                htmlFor="em"
                className="block font-semibold text-[15px] mb-1.5 text-mb-ink"
              >
                Email Akun
              </label>
              <input
                id="em"
                type="email"
                required
                autoComplete="email"
                placeholder="nama@studio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-3 rounded-xl border-[1.5px] border-mb-line bg-mb-bg text-mb-ink font-sans text-base outline-none focus:border-mb-ink transition-colors"
              />
            </div>

            <div className="relative">
              <label
                htmlFor="pw"
                className="block font-semibold text-[15px] mb-1.5 text-mb-ink"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="pw"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 pr-24 py-3 rounded-xl border-[1.5px] border-mb-line bg-mb-bg text-mb-ink font-sans text-base outline-none focus:border-mb-ink transition-colors"
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

            <div className="flex justify-end pt-0.5 pb-2">
              <a
                href="mailto:support@minglebooth.id?subject=Reset%20Password%20Akun%20Vendor"
                className="text-sm text-mb-muted hover:text-mb-ink transition-colors"
              >
                Lupa password?
              </a>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3.5 text-[17px] font-semibold"
            >
              {loading ? 'Memverifikasi...' : 'Masuk ke Portal'}
            </button>

            <div className="pt-3 text-center">
              <Link
                href="/admin"
                className="text-xs text-mb-muted hover:text-mb-ink transition-colors underline decoration-mb-line/60"
              >
                Masuk ke Superadmin Master Console &rarr;
              </Link>
            </div>
          </form>
        </div>
      </main>

      <Footer />
    </div>
  );
}
