'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Camera,
  Layers,
  QrCode,
  Zap,
  HardDrive,
  ShieldCheck,
  ArrowRight,
  ExternalLink,
  Laptop,
  CheckCircle2,
  Sparkles,
  CreditCard,
  WifiOff,
  Printer,
  ChevronRight,
  LogIn,
  UserPlus,
  Menu,
  X,
} from 'lucide-react';

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#090A0C] text-[#EDEDED] flex flex-col font-sans select-none antialiased">
      {/* Top Navbar */}
      <header className="h-16 px-4 sm:px-12 border-b border-white/[0.07] bg-[#090A0C]/90 backdrop-blur-md sticky top-0 z-50 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 sm:gap-3 flex-shrink-0">
          <img
            src="/logo-minglebooth-header.png"
            alt="MingleBooth"
            className="h-8 sm:h-10 w-auto object-contain"
          />
          <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-white/[0.06] text-neutral-300 border border-white/[0.08]">
            v1.0 Professional
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-3 lg:gap-4 text-xs">
          <Link
            href="/billing"
            className="px-3 py-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-white/[0.05] transition-colors whitespace-nowrap"
          >
            Paket & Lisensi
          </Link>
          <Link
            href="/login"
            className="px-3 py-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-white/[0.05] transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Masuk</span>
          </Link>
          <Link
            href="/register"
            className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-neutral-200 text-black font-semibold flex items-center gap-1.5 transition-colors shadow-sm whitespace-nowrap"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Daftar Vendor</span>
          </Link>
        </nav>

        {/* Mobile Header Actions */}
        <div className="flex md:hidden items-center gap-2">
          <Link
            href="/login"
            className="px-2.5 py-1.5 rounded-lg text-neutral-300 hover:text-white text-xs font-medium flex items-center gap-1"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Masuk</span>
          </Link>
          <Link
            href="/register"
            className="px-3 py-1.5 rounded-lg bg-white text-black font-semibold text-xs flex items-center gap-1 shadow-sm active:scale-95 transition-transform"
          >
            <span>Daftar</span>
          </Link>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-neutral-300 hover:text-white hover:bg-white/[0.06] border border-white/[0.08] transition-colors"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Mobile Drawer / Slide-Down Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-x-0 top-16 bg-[#0E1014]/95 backdrop-blur-xl border-b border-white/[0.08] z-40 p-4 flex flex-col gap-3 shadow-2xl animate-fadeIn">
          <Link
            href="/billing"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center justify-between px-3.5 py-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-neutral-200 text-sm font-medium transition-colors"
          >
            <span className="flex items-center gap-2.5">
              <CreditCard className="w-4 h-4 text-amber-400" />
              <span>Paket & Lisensi</span>
            </span>
            <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-white/[0.08] text-neutral-300">
              Mulai 549rb
            </span>
          </Link>

          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/[0.06]">
            <Link
              href="/login"
              onClick={() => setMobileMenuOpen(false)}
              className="h-10 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-neutral-200 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Masuk</span>
            </Link>
            <Link
              href="/register"
              onClick={() => setMobileMenuOpen(false)}
              className="h-10 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Daftar Vendor</span>
            </Link>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <section className="relative px-4 sm:px-6 py-14 sm:py-28 max-w-5xl mx-auto flex flex-col items-center text-center">
        {/* Subtle Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-[11px] sm:text-xs text-neutral-300 mb-6 sm:mb-8 text-center max-w-[95vw] leading-snug">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
          <span>Sistem Operasi Photobooth Modern untuk Vendor Indonesia</span>
        </div>

        {/* Hero Title */}
        <h1 className="text-2xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-white max-w-3xl leading-[1.2] sm:leading-[1.15]">
          Ekosistem Photobooth Profesional.{' '}
          <span className="text-neutral-400 font-normal block sm:inline mt-1 sm:mt-0">
            Cepat, Tangguh, & <span className="whitespace-nowrap">100% Offline-First.</span>
          </span>
        </h1>

        {/* Hero Subtitle */}
        <p className="mt-4 sm:mt-6 text-xs sm:text-base text-neutral-400 max-w-2xl leading-relaxed px-2 sm:px-0">
          Dirancang khusus untuk vendor wedding, corporate event, dan fotografer profesional.
          Jepret instan tanpa jeda, simpan otomatis ke harddisk lokal, galeri QR digital kilat, serta sinkronisasi cloud cerdas.
        </p>

        {/* CTA Buttons - 1 Pintu Masuk Akun: Masuk */}
        <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 sm:gap-3 w-full max-w-sm sm:max-w-none">
          <Link
            href="/register"
            className="h-11 px-6 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all active:scale-98 shadow-md"
          >
            <span>Daftar & Mulai Langganan</span>
            <ArrowRight className="w-4 h-4" />
          </Link>

          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2.5 sm:gap-3 w-full sm:w-auto">
            <Link
              href="/login"
              className="h-11 px-3 sm:px-6 rounded-xl bg-[#14161A] hover:bg-[#1C1F24] border border-white/[0.08] text-white font-medium text-xs sm:text-sm flex items-center justify-center gap-1.5 sm:gap-2 transition-all active:scale-98 text-center"
            >
              <LogIn className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-neutral-400 flex-shrink-0" />
              <span>Masuk Akun</span>
            </Link>

            <a
              href="http://localhost:5173"
              target="_blank"
              rel="noreferrer"
              className="h-11 px-3 sm:px-5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-neutral-300 hover:text-white font-medium text-xs sm:text-sm flex items-center justify-center gap-1.5 sm:gap-2 transition-all active:scale-98 text-center"
            >
              <Camera className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 flex-shrink-0" />
              <span>Studio App</span>
              <ExternalLink className="w-3 h-3 opacity-60 flex-shrink-0 hidden xs:inline-block" />
            </a>
          </div>
        </div>

        {/* Key Feature Stats Cards */}
        <div className="mt-12 sm:mt-16 pt-8 border-t border-white/[0.06] grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4 w-full max-w-4xl text-left">
          <div className="p-3.5 sm:p-4 rounded-xl bg-white/[0.02] sm:bg-transparent border border-white/[0.05] sm:border-0">
            <span className="text-lg sm:text-xl font-bold text-white block">0 Detik</span>
            <span className="text-[11px] sm:text-xs text-neutral-400 leading-tight block mt-0.5">
              Shutter Instan Tanpa Lag
            </span>
          </div>
          <div className="p-3.5 sm:p-4 rounded-xl bg-white/[0.02] sm:bg-transparent border border-white/[0.05] sm:border-0">
            <span className="text-lg sm:text-xl font-bold text-white block">Offline First</span>
            <span className="text-[11px] sm:text-xs text-neutral-400 leading-tight block mt-0.5">
              Penyimpanan Harddisk Aman
            </span>
          </div>
          <div className="p-3.5 sm:p-4 rounded-xl bg-white/[0.02] sm:bg-transparent border border-white/[0.05] sm:border-0">
            <span className="text-lg sm:text-xl font-bold text-white block">QR Instant</span>
            <span className="text-[11px] sm:text-xs text-neutral-400 leading-tight block mt-0.5">
              Download Kilat via HP
            </span>
          </div>
          <div className="p-3.5 sm:p-4 rounded-xl bg-white/[0.02] sm:bg-transparent border border-white/[0.05] sm:border-0">
            <span className="text-lg sm:text-xl font-bold text-white block">Lynk.id Ready</span>
            <span className="text-[11px] sm:text-xs text-neutral-400 leading-tight block mt-0.5">
              Pembayaran & Lisensi Auto
            </span>
          </div>
        </div>
      </section>

      {/* Core Ecosystem Section */}
      <section className="px-4 sm:px-6 py-12 sm:py-16 bg-[#0E1013] border-y border-white/[0.06]">
        <div className="max-w-5xl mx-auto flex flex-col gap-8 sm:gap-10">
          <div className="flex flex-col gap-1.5 sm:gap-2 text-left sm:text-left">
            <span className="text-[11px] sm:text-xs font-mono text-neutral-400 uppercase tracking-wider">
              Arsitektur Lengkap
            </span>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Tiga Pilar Utama MingleBooth
            </h2>
            <p className="text-xs sm:text-sm text-neutral-400 max-w-xl">
              Solusi all-in-one dari pendaftaran vendor di web hingga pengoperasian booth di venue.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Card 1: Studio App */}
            <div className="p-5 sm:p-6 rounded-2xl bg-[#14161A] border border-white/[0.07] flex flex-col justify-between gap-5 sm:gap-6 hover:border-white/20 transition-colors">
              <div className="flex flex-col gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-white">
                  <Camera className="w-4 h-4 text-emerald-400" />
                </div>
                <h3 className="text-sm sm:text-base font-semibold text-white">1. Unduh Software Studio</h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Setelah berlangganan di web, unduh aplikasi Studio untuk laptop Mac atau Windows Anda. Masuk sekali untuk menghubungkan perangkat laptop booth Anda.
                </p>
              </div>

              <a
                href="http://localhost:5173"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-neutral-300 hover:text-white flex items-center gap-1.5 pt-4 border-t border-white/[0.04] whitespace-nowrap"
              >
                <span>Buka MingleBooth Studio</span>
                <ChevronRight className="w-3.5 h-3.5 text-neutral-500" />
              </a>
            </div>

            {/* Card 2: Vendor Console */}
            <div className="p-5 sm:p-6 rounded-2xl bg-[#14161A] border border-white/[0.07] flex flex-col justify-between gap-5 sm:gap-6 hover:border-white/20 transition-colors">
              <div className="flex flex-col gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-white">
                  <Layers className="w-4 h-4 text-sky-400" />
                </div>
                <h3 className="text-sm sm:text-base font-semibold text-white">2. Vendor Cloud Console</h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Pusat kendali vendor. Buat event pernikahan & corporate, upload frame PNG transparan kustom, atur tata letak slot, dan kelola kuota perangkat booth Anda.
                </p>
              </div>

              <Link
                href="/login"
                className="text-xs font-medium text-neutral-300 hover:text-white flex items-center gap-1.5 pt-4 border-t border-white/[0.04]"
              >
                <span>Masuk ke Console</span>
                <ChevronRight className="w-3.5 h-3.5 text-neutral-500" />
              </Link>
            </div>

            {/* Card 3: Guest Mobile Gallery */}
            <div className="p-5 sm:p-6 rounded-2xl bg-[#14161A] border border-white/[0.07] flex flex-col justify-between gap-5 sm:gap-6 hover:border-white/20 transition-colors">
              <div className="flex flex-col gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-white">
                  <QrCode className="w-4 h-4 text-purple-400" />
                </div>
                <h3 className="text-sm sm:text-base font-semibold text-white">3. Galeri Digital Tamu</h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Tamu cukup scan QR Code di layar booth untuk membuka galeri mobile kilat dan mengunduh foto JPG resolusi tinggi atau animasi GIF langsung ke smartphone.
                </p>
              </div>

              <Link
                href="/p/sample_guest_gallery"
                className="text-xs font-medium text-neutral-300 hover:text-white flex items-center gap-1.5 pt-4 border-t border-white/[0.04]"
              >
                <span>Lihat Preview Galeri Tamu</span>
                <ChevronRight className="w-3.5 h-3.5 text-neutral-500" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose MingleBooth Section */}
      <section className="px-4 sm:px-6 py-12 sm:py-16 max-w-5xl mx-auto w-full flex flex-col gap-8">
        <div className="flex flex-col gap-1 text-center max-w-lg mx-auto">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Dibangun untuk Keandalan di Lapangan
          </h2>
          <p className="text-xs sm:text-sm text-neutral-400">
            Setiap fitur dirancang untuk menghilangkan resiko gagal foto di pesta pernikahan dan event besar.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
          <div className="p-5 rounded-2xl bg-[#121316] border border-white/[0.06] flex items-start gap-3.5 sm:gap-4">
            <HardDrive className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-white">Folder Fisik Lokal Terisolasi</h4>
              <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                Seluruh foto mentah (<code className="text-[11px] text-neutral-300 font-mono">raw/</code>) dan foto jadi berbingkai (<code className="text-[11px] text-neutral-300 font-mono">processed/</code>) tersimpan otomatis di harddisk laptop Anda. Aman tanpa takut internet mati.
              </p>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-[#121316] border border-white/[0.06] flex items-start gap-3.5 sm:gap-4">
            <WifiOff className="w-5 h-5 text-sky-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-white">Auto-Resume Background Sync</h4>
              <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                Jika koneksi WiFi venue terputus, antrean upload disimpan di database lokal SQLite dan otomatis melanjutkan sinkronisasi ke cloud saat internet terhubung kembali.
              </p>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-[#121316] border border-white/[0.06] flex items-start gap-3.5 sm:gap-4">
            <CreditCard className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-white">Langganan Otomatis via Lynk.id</h4>
              <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                Dukungan pembayaran QRIS, Virtual Account BCA, Mandiri, BRI, dan E-Wallet dengan perpanjangan lisensi otomatis (+365 hari) melalui sistem webhook terenkripsi SHA-256.
              </p>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-[#121316] border border-white/[0.06] flex items-start gap-3.5 sm:gap-4">
            <ShieldCheck className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-white">Keamanan & Privasi Data Vendor</h4>
              <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                Sistem cloud terenkripsi menjaga seluruh galeri foto tamu, desain template, dan lisensi armada booth Anda tetap aman, cepat, dan terlindungi.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-white/[0.06] px-4 sm:px-12 py-10 sm:py-12 bg-[#060709] text-xs text-neutral-500 flex flex-col items-center gap-6 sm:gap-8">
        {/* Footer Brand Lockup */}
        <div className="flex flex-col items-center gap-3 text-center">
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
              className="h-14 sm:h-20 w-auto object-contain transition-opacity group-hover:opacity-90"
            />
          </a>
        </div>

        {/* Navigation Links */}
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 sm:gap-8 text-neutral-400 font-medium text-center">
          <Link href="/login" className="hover:text-white transition-colors">
            Masuk Vendor
          </Link>
          <Link href="/register" className="hover:text-white transition-colors">
            Daftar Akun
          </Link>
          <Link href="/billing" className="hover:text-white transition-colors">
            Paket Lisensi
          </Link>
          <Link href="/admin" className="hover:text-white transition-colors text-neutral-500 hover:text-neutral-300">
            Admin Backend
          </Link>
        </div>

        {/* Copyright & Tagline */}
        <div className="pt-6 border-t border-white/[0.06] w-full max-w-4xl flex flex-col sm:flex-row items-center justify-between gap-3 text-neutral-500 text-[11px] text-center sm:text-left">
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
            . Setiap Momen Berarti. Hak Cipta Dilindungi.
          </span>
          <span className="text-neutral-600">Professional Photobooth Operating System</span>
        </div>
      </footer>
    </div>
  );
}
