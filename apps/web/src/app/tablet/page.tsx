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

export default function TabletStudioPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('mb_web_user');
      if (stored) {
        try {
          setUser(JSON.parse(stored));
        } catch {
          setUser(null);
        }
      }
    }
    setLoading(false);
  }, []);

  const winUrl =
    process.env.NEXT_PUBLIC_DOWNLOAD_WIN_URL &&
    !process.env.NEXT_PUBLIC_DOWNLOAD_WIN_URL.includes('drive.google.com')
      ? process.env.NEXT_PUBLIC_DOWNLOAD_WIN_URL
      : 'https://github.com/MingleBooth/MingleBooth/releases/latest/download/MingleBooth.Studio.Setup.1.0.0.exe';

  const macUrl =
    process.env.NEXT_PUBLIC_DOWNLOAD_MAC_URL &&
    !process.env.NEXT_PUBLIC_DOWNLOAD_MAC_URL.includes('drive.google.com')
      ? process.env.NEXT_PUBLIC_DOWNLOAD_MAC_URL
      : 'https://github.com/MingleBooth/MingleBooth/releases/latest/download/MingleBooth.Studio-1.0.0.dmg';

  return (
    <div className="min-h-screen w-full bg-[#090A0C] text-[#EDEDED] flex flex-col font-sans selection:bg-white/20">
      {/* Top Header Navigation */}
      <header className="h-16 px-6 sm:px-10 border-b border-white/[0.06] flex items-center justify-between bg-[#0F1014] sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <img
              src="/logo-minglebooth-header.png"
              alt="MingleBooth"
              className="h-7 w-auto object-contain"
            />
          </Link>
          <div className="h-4 w-[1px] bg-white/10 hidden sm:block" />
          <span className="text-xs font-medium text-neutral-400 hidden sm:inline">
            MingleBooth Studio • Unduh Aplikasi Desktop
          </span>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <Link
              href="/dashboard"
              className="h-8 px-3.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-neutral-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali ke Dashboard</span>
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="h-8 px-3 rounded-lg text-neutral-300 hover:text-white text-xs font-medium transition-colors"
              >
                Masuk
              </Link>
              <Link
                href="/register"
                className="h-8 px-3.5 rounded-lg bg-white hover:bg-neutral-200 text-black font-semibold text-xs flex items-center gap-1 transition-colors"
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
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.06] border border-white/10 text-neutral-300 text-xs font-medium mb-4">
            <Laptop className="w-3.5 h-3.5 text-neutral-300" />
            <span>Aplikasi Native Desktop Diperlukan</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white mb-3">
            Jalankan Photobooth di MingleBooth Studio
          </h1>

          <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed">
            Sesi Kiosk Photobooth membutuhkan akses hardware langsung (Direct USB Camera Tethering untuk Sony &amp; DSLR, driver printer dye-sublimation cepat, dan penyimpanan SSD lokal).
          </p>
        </div>

        {!loading && !user ? (
          /* State: Belum Login - Wajib Buat Akun / Login Dahulu */
          <div className="w-full max-w-xl p-8 rounded-2xl bg-[#121316] border border-amber-500/30 text-left flex flex-col gap-5 shadow-2xl mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 flex-shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Buat Akun Vendor Gratis Terlebih Dahulu</h2>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Aplikasi Studio memerlukan akun vendor untuk login dan menyimpan konfigurasi booth.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-black/40 border border-white/[0.04] text-xs text-neutral-300 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>100% Gratis untuk mencoba Mode Demo kamera fisik lokal</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>Tanpa kartu kredit dan tanpa komitmen pembayaran di awal</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>Langsung dapatkan akses unduhan installer Windows &amp; macOS di Dashboard</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <Link
                href="/register"
                className="w-full sm:w-auto flex-1 h-11 rounded-xl bg-white hover:bg-neutral-200 text-black font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-98"
              >
                <UserPlus className="w-4 h-4" />
                <span>Buat Akun Gratis Sekarang</span>
              </Link>
              <Link
                href="/login"
                className="w-full sm:w-auto h-11 px-5 rounded-xl bg-[#1A1C22] hover:bg-[#22252C] text-neutral-200 hover:text-white border border-white/10 font-medium text-xs flex items-center justify-center gap-2 transition-all"
              >
                <LogIn className="w-4 h-4 text-neutral-400" />
                <span>Sudah Punya Akun? Masuk</span>
              </Link>
            </div>
          </div>
        ) : (
          /* State: Sudah Login - Tampilkan Tombol Download & Instruksi */
          <>
            {/* Download Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl mb-8 text-left">
              {/* Card 1: Windows (.exe) */}
              <div className="p-6 rounded-2xl bg-[#121316] border border-white/[0.08] hover:border-white/20 transition-all flex flex-col justify-between group">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-white">
                      <Laptop className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider bg-white/[0.06] px-2.5 py-1 rounded-md">
                      Windows 64-bit
                    </span>
                  </div>
                  <h2 className="text-base font-semibold text-white mb-1.5">MingleBooth untuk Windows</h2>
                  <p className="text-xs text-neutral-400 mb-6 leading-relaxed">
                    Installer <strong>.exe</strong> resmi untuk Windows 10 &amp; 11. Dilengkapi dukungan driver printer DNP, Citizen, HiTi, dan Sony Alpha Camera.
                  </p>
                </div>

                <a
                  href={winUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-11 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-sm active:scale-98"
                >
                  <Download className="w-4 h-4 text-black" />
                  <span>Unduh Installer .exe (Windows)</span>
                </a>
              </div>

              {/* Card 2: macOS (.dmg) */}
              <div className="p-6 rounded-2xl bg-[#121316] border border-white/[0.08] hover:border-white/20 transition-all flex flex-col justify-between group">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-white">
                      <Monitor className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider bg-white/[0.06] px-2.5 py-1 rounded-md">
                      macOS 12+
                    </span>
                  </div>
                  <h2 className="text-base font-semibold text-white mb-1.5">MingleBooth untuk Mac</h2>
                  <p className="text-xs text-neutral-400 mb-6 leading-relaxed">
                    Installer <strong>.dmg</strong> untuk MacBook &amp; Mac Studio. Kompatibel penuh dengan Apple Silicon (M1, M2, M3, M4) dan prosesor Intel.
                  </p>
                </div>

                <a
                  href={macUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-11 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-sm active:scale-98"
                >
                  <Download className="w-4 h-4 text-black" />
                  <span>Unduh Installer .dmg (macOS)</span>
                </a>
              </div>
            </div>

            {/* 3 Step Simple Instruction Card */}
            <div className="w-full max-w-2xl p-6 rounded-2xl bg-[#121316] border border-white/[0.06] text-left mb-6">
              <h3 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Info className="w-4 h-4 text-neutral-400" />
                <span>3 Langkah Memulai Photobooth di Laptop Anda:</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-black/40 border border-white/[0.04]">
                  <div className="flex items-center gap-2 text-white font-semibold text-xs mb-1">
                    <span className="w-4 h-4 rounded-full bg-white/10 text-[10px] flex items-center justify-center">1</span>
                    <span>Pasang Software</span>
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    Unduh dan pasang aplikasi desktop MingleBooth Studio di laptop booth Anda.
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-black/40 border border-white/[0.04]">
                  <div className="flex items-center gap-2 text-white font-semibold text-xs mb-1">
                    <span className="w-4 h-4 rounded-full bg-white/10 text-[10px] flex items-center justify-center">2</span>
                    <span>Login Akun Vendor</span>
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    Buka Studio dan masuk dengan email akun Anda ({user?.email}).
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-black/40 border border-white/[0.04]">
                  <div className="flex items-center gap-2 text-white font-semibold text-xs mb-1">
                    <span className="w-4 h-4 rounded-full bg-white/10 text-[10px] flex items-center justify-center">3</span>
                    <span>Uji Coba Kamera</span>
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    Sambungkan kamera Sony via USB PC Remote atau gunakan webcam laptop.
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1A1C22] hover:bg-[#22252C] border border-white/10 text-white text-xs font-medium transition-all"
              >
                <span>Buka Dashboard Vendor Selengkapnya</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-white/[0.06] text-center text-xs text-neutral-500">
        © 2026 MingleBooth by sebuah.kenang • Platform Photobooth Profesional
      </footer>
    </div>
  );
}
