'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Laptop,
  Monitor,
  Download,
  ArrowLeft,
  ArrowRight,
  Info,
  CheckCircle2,
  Camera,
  ShieldCheck,
  UserPlus,
  LogIn,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function TabletStudioPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Cek sesi lokal (login portal vendor)
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('mb_web_user');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed && (parsed.id || parsed.email)) {
            setUser(parsed);
            setLoading(false);
            return;
          }
        } catch {
          // fallback ke supabase session
        }
      }
    }

    // 2. Cek sesi supabase client
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // 3. Listener perubahan auth real-time
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
      } else {
        const stored = typeof window !== 'undefined' ? localStorage.getItem('mb_web_user') : null;
        if (stored) {
          try {
            setUser(JSON.parse(stored));
          } catch {
            setUser(null);
          }
        } else {
          setUser(null);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const winUrl =
    process.env.NEXT_PUBLIC_DOWNLOAD_WIN_URL &&
    !process.env.NEXT_PUBLIC_DOWNLOAD_WIN_URL.includes('drive.google.com')
      ? process.env.NEXT_PUBLIC_DOWNLOAD_WIN_URL
      : 'https://github.com/MingleBooth/MingleBooth/releases/download/v1.0.0-rc.3/MingleBooth-Studio-Setup-1.0.0-rc.3.exe';

  const macUrl =
    process.env.NEXT_PUBLIC_DOWNLOAD_MAC_URL &&
    !process.env.NEXT_PUBLIC_DOWNLOAD_MAC_URL.includes('drive.google.com')
      ? process.env.NEXT_PUBLIC_DOWNLOAD_MAC_URL
      : 'https://github.com/MingleBooth/MingleBooth/releases/download/v1.0.0-rc.3/MingleBooth-Studio-1.0.0-rc.3.dmg';

  return (
    <div className="min-h-screen w-full bg-mb-bg text-mb-ink flex flex-col font-sans selection:bg-mb-accent selection:text-mb-accent-ink transition-colors">
      {/* Top Header Navigation */}
      <header className="h-16 px-6 sm:px-10 border-b border-mb-line bg-mb-surface sticky top-0 z-30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5 group">
            <img
              src="/logo-minglebooth-header.png"
              alt="MingleBooth"
              className="h-7 w-auto object-contain"
            />
          </Link>
          <div className="h-4 w-[1px] bg-mb-line hidden sm:block" />
          <span className="text-xs font-semibold text-mb-muted uppercase tracking-wider hidden sm:inline">
            Studio Companion • Unduh Aplikasi Desktop
          </span>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <Link
              href="/dashboard"
              className="h-9 px-4 rounded-xl border border-mb-line bg-mb-surface hover:bg-neutral-100 dark:hover:bg-neutral-800 text-mb-ink text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali ke Dashboard</span>
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="h-9 px-3.5 rounded-xl text-mb-muted hover:text-mb-ink text-xs font-semibold transition-colors flex items-center"
              >
                Masuk
              </Link>
              <Link
                href="/register"
                className="h-9 px-4 rounded-xl bg-white hover:bg-neutral-200 text-[#0B0B0D] font-heading font-bold text-xs flex items-center gap-1 transition-opacity shadow-sm"
              >
                <span>Daftar Gratis</span>
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-12 max-w-4xl mx-auto w-full text-center">
        {/* Hero Section */}
        <div className="max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/[0.04] dark:bg-white/[0.08] border border-mb-line text-mb-muted text-xs font-semibold mb-4">
            <Laptop className="w-3.5 h-3.5" />
            <span>Aplikasi Native Desktop Diperlukan</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-heading font-extrabold tracking-tight text-mb-ink mb-3">
            Jalankan Photobooth di MingleBooth Studio
          </h1>

          <p className="text-sm sm:text-base text-mb-muted leading-relaxed">
            Sesi Kiosk Photobooth membutuhkan akses hardware langsung: Direct USB Camera Tethering untuk Sony Alpha Mirrorless, driver printer dye-sublimation cepat, dan penyimpanan SSD lokal 100% offline.
          </p>
        </div>

        {!loading && !user ? (
          /* State: Belum Login - Wajib Buat Akun / Login Dahulu */
          <div className="w-full max-w-xl p-8 rounded-2xl bg-mb-surface border-2 border-mb-line text-left flex flex-col gap-6 shadow-xl mb-8">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-mb-accent/20 border border-mb-accent/40 flex items-center justify-center text-[#0B0B0D] flex-shrink-0">
                <ShieldCheck className="w-6 h-6 text-[#0B0B0D]" />
              </div>
              <div>
                <h2 className="text-lg font-heading font-extrabold text-mb-ink">
                  Buat Akun Vendor Gratis Terlebih Dahulu
                </h2>
                <p className="text-xs text-mb-muted mt-0.5">
                  Aplikasi Studio memerlukan akun vendor untuk login dan menyimpan konfigurasi booth.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-mb-line text-xs text-mb-muted flex flex-col gap-2.5">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span className="text-mb-ink font-medium">100% Gratis untuk mencoba Mode Demo kamera fisik lokal</span>
              </div>
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span className="text-mb-ink font-medium">Tanpa kartu kredit dan tanpa komitmen pembayaran di awal</span>
              </div>
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span className="text-mb-ink font-medium">Langsung dapatkan akses unduhan installer Windows &amp; macOS di Dashboard</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <Link
                href="/register"
                className="w-full sm:w-auto flex-1 h-11 rounded-xl bg-white hover:bg-neutral-200 text-[#0B0B0D] font-heading font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-98"
              >
                <UserPlus className="w-4 h-4" />
                <span>Buat Akun Gratis Sekarang</span>
              </Link>
              <Link
                href="/login"
                className="w-full sm:w-auto h-11 px-5 rounded-xl border border-mb-line bg-mb-surface hover:bg-neutral-100 dark:hover:bg-neutral-800 text-mb-ink font-heading font-bold text-xs flex items-center justify-center gap-2 transition-all"
              >
                <LogIn className="w-4 h-4 text-mb-muted" />
                <span>Sudah Punya Akun? Masuk</span>
              </Link>
            </div>
          </div>
        ) : (
          /* State: Sudah Login - Tampilkan Tombol Download & Instruksi */
          <>
            {/* Download Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full max-w-2xl mb-8 text-left">
              {/* Card 1: Windows (.exe) */}
              <div className="p-6 rounded-2xl bg-mb-surface border border-mb-line hover:border-neutral-400 dark:hover:border-neutral-600 transition-all flex flex-col justify-between shadow-sm group">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-11 h-11 rounded-xl bg-black/5 dark:bg-white/10 border border-mb-line flex items-center justify-center text-mb-ink">
                      <Laptop className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] font-bold text-mb-muted uppercase tracking-wider bg-black/5 dark:bg-white/10 px-2.5 py-1 rounded-md border border-mb-line">
                      Windows 64-bit
                    </span>
                  </div>
                  <h2 className="text-base font-heading font-extrabold text-mb-ink mb-1.5">MingleBooth untuk Windows</h2>
                  <p className="text-xs text-mb-muted mb-6 leading-relaxed">
                    Installer <strong>.exe</strong> resmi untuk Windows 10 &amp; 11. Dilengkapi dukungan driver printer DNP, Citizen, HiTi, dan Sony Alpha Camera.
                  </p>
                </div>

                <a
                  href={winUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-11 rounded-xl bg-white hover:bg-neutral-200 text-[#0B0B0D] font-heading font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-sm active:scale-98"
                >
                  <Download className="w-4 h-4 text-[#0B0B0D]" />
                  <span>Unduh Installer .exe (Windows)</span>
                </a>
              </div>

              {/* Card 2: macOS (.dmg) */}
              <div className="p-6 rounded-2xl bg-mb-surface border border-mb-line hover:border-neutral-400 dark:hover:border-neutral-600 transition-all flex flex-col justify-between shadow-sm group">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-11 h-11 rounded-xl bg-black/5 dark:bg-white/10 border border-mb-line flex items-center justify-center text-mb-ink">
                      <Monitor className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] font-bold text-mb-muted uppercase tracking-wider bg-black/5 dark:bg-white/10 px-2.5 py-1 rounded-md border border-mb-line">
                      macOS 12+
                    </span>
                  </div>
                  <h2 className="text-base font-heading font-extrabold text-mb-ink mb-1.5">MingleBooth untuk Mac</h2>
                  <p className="text-xs text-mb-muted mb-6 leading-relaxed">
                    Installer <strong>.dmg</strong> untuk MacBook &amp; Mac Studio. Kompatibel penuh dengan Apple Silicon (M1, M2, M3, M4) dan prosesor Intel.
                  </p>
                </div>

                <a
                  href={macUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-11 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white border border-white/10 font-heading font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-sm active:scale-98"
                >
                  <Download className="w-4 h-4 text-neutral-300" />
                  <span>Unduh Installer .dmg (macOS)</span>
                </a>
              </div>
            </div>

            {/* 3 Step Simple Instruction Card */}
            <div className="w-full max-w-2xl p-6 rounded-2xl bg-mb-surface border border-mb-line text-left mb-6 shadow-sm">
              <h3 className="text-xs font-semibold text-mb-muted uppercase tracking-wider mb-4 flex items-center gap-2">
                <Info className="w-4 h-4 text-mb-muted" />
                <span>3 Langkah Memulai Photobooth di Laptop Anda:</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-mb-line">
                  <div className="flex items-center gap-2 text-mb-ink font-heading font-bold text-xs mb-1">
                    <span className="w-5 h-5 rounded-full bg-mb-accent text-[#0B0B0D] text-xs flex items-center justify-center font-bold">1</span>
                    <span>Pasang Software</span>
                  </div>
                  <p className="text-xs text-mb-muted leading-relaxed">
                    Unduh dan pasang aplikasi desktop MingleBooth Studio di laptop booth Anda.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-mb-line">
                  <div className="flex items-center gap-2 text-mb-ink font-heading font-bold text-xs mb-1">
                    <span className="w-5 h-5 rounded-full bg-mb-accent text-[#0B0B0D] text-xs flex items-center justify-center font-bold">2</span>
                    <span>Login Akun Vendor</span>
                  </div>
                  <p className="text-xs text-mb-muted leading-relaxed">
                    Buka Studio dan masuk dengan email akun Anda ({user?.email}).
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-mb-line">
                  <div className="flex items-center gap-2 text-mb-ink font-heading font-bold text-xs mb-1">
                    <span className="w-5 h-5 rounded-full bg-mb-accent text-[#0B0B0D] text-xs flex items-center justify-center font-bold">3</span>
                    <span>Uji Coba Kamera</span>
                  </div>
                  <p className="text-xs text-mb-muted leading-relaxed">
                    Sambungkan kamera Sony via USB PC Remote atau gunakan webcam laptop.
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-6 flex items-center justify-center gap-3 flex-wrap">
              <Link
                href="/download"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white hover:bg-neutral-200 text-[#0B0B0D] text-xs font-heading font-bold transition-opacity shadow-sm"
              >
                <Download className="w-4 h-4 text-[#0B0B0D]" />
                <span>Pusat Unduhan Installer</span>
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-mb-line bg-mb-surface hover:bg-neutral-100 dark:hover:bg-neutral-800 text-mb-ink text-xs font-heading font-bold transition-colors"
              >
                <span>Buka Dashboard Vendor</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-mb-line text-center text-xs text-mb-muted bg-mb-surface">
        © 2026 MingleBooth by sebuah.kenang • Platform Photobooth Profesional
      </footer>
    </div>
  );
}
