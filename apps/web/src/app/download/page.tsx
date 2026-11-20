'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import {
  Download,
  Smartphone,
  Laptop,
  Monitor,
  ShieldCheck,
  BookOpen,
  Info,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import {
  RELEASE_VERSION,
  RELEASE_DATE,
  DOWNLOAD_ASSETS,
  DOWNLOAD_ASSETS_LIST,
  INSTALLATION_STEPS,
  LICENSE_TIERS,
  DownloadAsset,
} from '@/lib/constants/downloads';

export default function DownloadPage() {
  const [activeTab, setActiveTab] = useState<'windows' | 'macos' | 'android'>('windows');

  return (
    <div className="min-h-screen bg-mb-bg text-mb-ink flex flex-col font-sans antialiased selection:bg-[#FFD21F] selection:text-[#0B0B0D]">
      <Navbar activePage="download" />

      {/* Top Header Section (Dark) */}
      <section className="bg-[#0B0B0D] text-white border-b border-white/10 pt-10 pb-12 sm:pb-16">
        <div className="max-w-[1080px] mx-auto px-5">
          <div className="eyebrow text-[#FFD21F]">DISTRIBUSI RESMI APLIKASI</div>
          <h1 className="text-[32px] sm:text-[46px] font-extrabold font-heading tracking-heading leading-tight text-white max-w-[24ch]">
            Unduh MingleBooth Studio
          </h1>
          <p className="mt-4 mb-6 text-[#C9C9CE] text-base sm:text-[18px] leading-relaxed max-w-[58ch]">
            Aplikasi resmi photobooth untuk laptop dan tablet. Mendukung live view kamera Sony, cetak instan ke printer thermal/dye-sub, serta sinkronisasi galeri QR otomatis.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 border border-white/15 text-xs sm:text-sm font-mono text-[#E2E2E6]">
              <ShieldCheck className="w-4 h-4 text-[#FFD21F]" />
              <span>Rilis Resmi: {RELEASE_VERSION} &middot; {RELEASE_DATE}</span>
            </div>
            <a
              href="#guide"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-xs sm:text-sm text-neutral-300 hover:text-white transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5 text-[#FFD21F]" />
              <span>Lihat Panduan Instalasi</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="flex-1 py-12">
        <div className="max-w-[1080px] mx-auto px-5 space-y-16">
          {/* SECTION 1: 3 Platform Download Cards */}
          <div>
            <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
              <div>
                <h2 className="text-2xl font-extrabold font-heading tracking-tight text-mb-ink">
                  Pilihan Installer Resmi
                </h2>
                <p className="text-sm text-mb-muted mt-1">
                  Pilih installer sesuai sistem operasi perangkat booth Anda.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
              {DOWNLOAD_ASSETS_LIST.map((asset: DownloadAsset) => {
                return (
                  <div
                    key={asset.id}
                    className="bg-mb-surface border-2 border-mb-ink rounded-2xl p-6 sm:p-7 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div>
                      {/* Header with Icon & Badge */}
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="w-12 h-12 rounded-2xl bg-mb-ink text-white flex items-center justify-center flex-shrink-0">
                          {asset.platform === 'android' && <Smartphone className="w-6 h-6 text-[#FFD21F]" />}
                          {asset.platform === 'macos' && <Laptop className="w-6 h-6 text-[#FFD21F]" />}
                          {asset.platform === 'windows' && <Monitor className="w-6 h-6 text-[#FFD21F]" />}
                        </div>
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#FFD21F] text-[#0B0B0D]">
                          {asset.badge}
                        </span>
                      </div>

                      <h3 className="text-xl font-extrabold font-heading tracking-tight mb-2 text-mb-ink">
                        {asset.title}
                      </h3>
                      <p className="text-mb-muted text-xs sm:text-sm leading-relaxed">
                        {asset.description}
                      </p>
                    </div>

                    {/* Download CTA Button */}
                    <div className="mt-8">
                      <a
                        href={asset.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-primary w-full text-sm py-3 flex items-center justify-center gap-2 shadow-sm"
                      >
                        <Download className="w-4 h-4" />
                        <span>{asset.buttonText}</span>
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SECTION 2: Interactive Step-by-Step Installation Tutorial */}
          <section id="guide" className="scroll-mt-20">
            <div className="mb-6">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFD21F]/20 border border-[#FFD21F]/40 text-xs font-bold text-[#0B0B0D] mb-2">
                <BookOpen className="w-3.5 h-3.5" />
                <span>PANDUAN LANGKAH DEMI LANGKAH</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold font-heading tracking-tight text-mb-ink">
                Tutorial Instalasi &amp; Konfigurasi
              </h2>
              <p className="text-sm sm:text-base text-mb-muted mt-1 max-w-[65ch]">
                Ikuti langkah resmi di bawah ini untuk menginstal, memverifikasi keamanan file, dan mengoperasikan MingleBooth Studio di perangkat Anda.
              </p>
            </div>

            {/* Platform Selector Tabs */}
            <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-mb-surface border border-mb-line mb-6 overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveTab('windows')}
                className={`flex-1 min-w-[140px] py-2.5 px-4 rounded-xl text-xs sm:text-sm font-heading font-bold flex items-center justify-center gap-2 transition-all ${
                  activeTab === 'windows'
                    ? 'bg-[#0B0B0D] text-white shadow-sm'
                    : 'text-mb-muted hover:text-mb-ink hover:bg-neutral-100'
                }`}
              >
                <Monitor className="w-4 h-4" />
                <span>Windows 10 / 11</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-mono ${
                  activeTab === 'windows' ? 'bg-white/20 text-white' : 'bg-black/5 text-mb-muted'
                }`}>
                  10 Langkah
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('macos')}
                className={`flex-1 min-w-[140px] py-2.5 px-4 rounded-xl text-xs sm:text-sm font-heading font-bold flex items-center justify-center gap-2 transition-all ${
                  activeTab === 'macos'
                    ? 'bg-[#0B0B0D] text-white shadow-sm'
                    : 'text-mb-muted hover:text-mb-ink hover:bg-neutral-100'
                }`}
              >
                <Laptop className="w-4 h-4" />
                <span>macOS (Apple &amp; Intel)</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-mono ${
                  activeTab === 'macos' ? 'bg-white/20 text-white' : 'bg-black/5 text-mb-muted'
                }`}>
                  8 Langkah
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('android')}
                className={`flex-1 min-w-[140px] py-2.5 px-4 rounded-xl text-xs sm:text-sm font-heading font-bold flex items-center justify-center gap-2 transition-all ${
                  activeTab === 'android'
                    ? 'bg-[#0B0B0D] text-white shadow-sm'
                    : 'text-mb-muted hover:text-mb-ink hover:bg-neutral-100'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                <span>Android Tablet</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-mono ${
                  activeTab === 'android' ? 'bg-white/20 text-white' : 'bg-black/5 text-mb-muted'
                }`}>
                  8 Langkah
                </span>
              </button>
            </div>

            {/* Step List Container */}
            <div className="bg-mb-surface border border-mb-line rounded-2xl p-6 sm:p-8 space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-mb-line">
                <div className="flex items-center gap-2">
                  <span className="font-heading font-bold text-base text-mb-ink">
                    {activeTab === 'windows' && 'Panduan Resmi Windows (10 & 11)'}
                    {activeTab === 'macos' && 'Panduan Resmi macOS (Apple Silicon & Intel)'}
                    {activeTab === 'android' && 'Panduan Resmi Android Tablet / Smartphone'}
                  </span>
                </div>
                <a
                  href={DOWNLOAD_ASSETS[activeTab].downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-heading font-bold text-mb-ink hover:underline flex items-center gap-1"
                >
                  <span>Unduh File {activeTab.toUpperCase()}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              <div className="space-y-4">
                {INSTALLATION_STEPS[activeTab].map((stepItem) => (
                  <div
                    key={stepItem.step}
                    className="p-4 sm:p-5 rounded-xl bg-mb-bg border border-mb-line flex flex-col gap-3 transition-colors hover:border-neutral-400"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#0B0B0D] text-[#FFD21F] font-heading font-extrabold text-xs sm:text-sm flex items-center justify-center flex-shrink-0 mt-0.5">
                        {stepItem.step}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h4 className="font-heading font-bold text-sm sm:text-base text-mb-ink">
                            {stepItem.title}
                          </h4>
                          <span className="text-[11px] text-mb-muted hidden sm:inline">
                            &middot; {stepItem.summary}
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm text-mb-muted leading-relaxed">
                          {stepItem.description}
                        </p>
                      </div>
                    </div>

                    {/* Step Callout (Security / Edge / Unblock / Gatekeeper) */}
                    {stepItem.callout && (
                      <div
                        className={`ml-10 sm:ml-11 p-3.5 rounded-xl border text-xs leading-relaxed ${
                          stepItem.callout.type === 'warning'
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-950 dark:text-amber-200'
                            : stepItem.callout.type === 'tip'
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200'
                            : 'bg-blue-500/10 border-blue-500/30 text-blue-950 dark:text-blue-200'
                        }`}
                      >
                        <div className="font-bold font-heading mb-1 flex items-center gap-1.5">
                          {stepItem.callout.type === 'warning' && <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
                          {stepItem.callout.type === 'tip' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                          {stepItem.callout.type === 'info' && <Info className="w-3.5 h-3.5 text-blue-600" />}
                          <span>{stepItem.callout.title}</span>
                        </div>
                        <p>{stepItem.callout.text}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* SECTION 3: Licensing Information & Mode Comparison */}
          <section className="bg-mb-surface border border-mb-line rounded-2xl p-6 sm:p-8">
            <div className="mb-6">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/5 border border-mb-line text-xs font-bold text-mb-ink mb-2">
                <ShieldCheck className="w-3.5 h-3.5 text-[#FFD21F]" />
                <span>INFORMASI LISENSI &amp; PENGOPERASIAN</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold font-heading tracking-tight text-mb-ink">
                Ketentuan Lisensi &amp; Kuota Perangkat
              </h2>
              <p className="text-sm sm:text-base text-mb-muted mt-1 max-w-[65ch]">
                Memahami hak akses, kuota aktivasi laptop booth, serta perbedaan antara Mode Demo dan Mode Berbayar.
              </p>
            </div>

            {/* 3 Key Principles */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="p-4 rounded-xl bg-mb-bg border border-mb-line">
                <div className="w-8 h-8 rounded-lg bg-black/5 flex items-center justify-center font-bold text-xs text-mb-ink mb-2">
                  1
                </div>
                <h4 className="font-heading font-bold text-sm text-mb-ink mb-1">
                  Unduhan Bebas &amp; Terbuka
                </h4>
                <p className="text-xs text-mb-muted leading-relaxed">
                  Mengunduh installer MingleBooth Studio tidak otomatis mengaktifkan lisensi berbayar. Installer dapat diunduh untuk persiapan perangkat teknis.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-mb-bg border border-mb-line">
                <div className="w-8 h-8 rounded-lg bg-black/5 flex items-center justify-center font-bold text-xs text-mb-ink mb-2">
                  2
                </div>
                <h4 className="font-heading font-bold text-sm text-mb-ink mb-1">
                  Wajib Login Akun Vendor
                </h4>
                <p className="text-xs text-mb-muted leading-relaxed">
                  Saat aplikasi dibuka, login menggunakan kredensial vendor MingleBooth Anda. Sistem memverifikasi paket langganan aktif dan kuota perangkat secara otomatis.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-mb-bg border border-mb-line">
                <div className="w-8 h-8 rounded-lg bg-black/5 flex items-center justify-center font-bold text-xs text-mb-ink mb-2">
                  3
                </div>
                <h4 className="font-heading font-bold text-sm text-mb-ink mb-1">
                  Batas Kuota Simultan
                </h4>
                <p className="text-xs text-mb-muted leading-relaxed">
                  Setiap laptop/tablet yang aktif menggunakan 1 slot kuota perangkat. Anda dapat mengganti atau melepas perangkat lama kapan saja melalui Vendor Dashboard.
                </p>
              </div>
            </div>

            {/* License Tiers List */}
            <div className="mb-8">
              <h4 className="font-heading font-bold text-xs uppercase tracking-wider text-mb-muted mb-3">
                Kapasitas Kuota Berdasarkan Paket Langganan:
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {LICENSE_TIERS.map((tierItem) => (
                  <div
                    key={tierItem.tier}
                    className="p-4 rounded-xl bg-mb-bg border border-mb-line flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-heading font-extrabold text-sm text-mb-ink">
                          Paket {tierItem.tier}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#FFD21F] text-[#0B0B0D]">
                          {tierItem.quota}
                        </span>
                      </div>
                      <p className="text-xs text-mb-muted leading-relaxed">
                        {tierItem.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Mode Comparison: Demo vs Paid */}
            <div className="border-t border-mb-line pt-6">
              <h4 className="font-heading font-bold text-xs uppercase tracking-wider text-mb-muted mb-4">
                Perbandingan Mode Pengoperasian Sistem:
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Demo Mode */}
                <div className="p-5 rounded-xl bg-mb-bg border border-mb-line flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-heading font-bold text-sm text-mb-ink">
                        Mode Demo (Simulasi Offline)
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-neutral-200 text-neutral-800">
                        Tanpa Lisensi
                      </span>
                    </div>
                    <p className="text-xs text-mb-muted mb-4 leading-relaxed">
                      Dirancang untuk pengujian teknis, pengetesan hardware kamera di kantor atau rumah, dan simulasi alur photobooth sebelum event dimulai.
                    </p>
                    <ul className="space-y-2 text-xs text-mb-muted">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                        <span>Pengujian kamera live view Sony, Canon, atau webcam.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                        <span>Simulasi pemotretan multi-pose dan cetak lokal ke printer.</span>
                      </li>
                      <li className="flex items-start gap-2 text-neutral-400">
                        <span className="w-4 h-4 rounded-full border border-neutral-400 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">&times;</span>
                        <span>Foto hanya disimpan secara lokal (folder demo lokal) dan <strong>tidak disinkronkan ke Cloud</strong>.</span>
                      </li>
                      <li className="flex items-start gap-2 text-neutral-400">
                        <span className="w-4 h-4 rounded-full border border-neutral-400 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">&times;</span>
                        <span>QR code unduh tamu dan Galeri Online dinonaktifkan (tanda demo lokal).</span>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Paid Mode */}
                <div className="p-5 rounded-xl bg-mb-bg border-2 border-mb-ink flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-heading font-bold text-sm text-mb-ink flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-[#FFD21F]" />
                        <span>Mode Berbayar (Lisensi Aktif)</span>
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#FFD21F] text-[#0B0B0D]">
                        Operasional Penuh
                      </span>
                    </div>
                    <p className="text-xs text-mb-muted mb-4 leading-relaxed">
                      Fitur operasional photobooth lengkap untuk melayani tamu acara secara profesional, cepat, dan terhubung online secara instan.
                    </p>
                    <ul className="space-y-2 text-xs text-mb-ink font-medium">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                        <span>Sinkronisasi cloud otomatis ke penyimpanan Cloudflare R2 berkecepatan tinggi.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                        <span>QR Code instan per sesi foto &amp; Galeri Online Acara real-time untuk tamu.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                        <span>Dukungan file foto resolusi penuh, thumbnail cepat, animasi GIF, dan file RAW.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                        <span>Pengelolaan kuota perangkat, template custom, dan analitik di Dashboard Vendor.</span>
                      </li>
                    </ul>
                  </div>
                  <div className="mt-5 pt-3 border-t border-mb-line">
                    <Link
                      href="/pricing"
                      className="text-xs font-heading font-bold text-mb-ink hover:underline inline-flex items-center gap-1"
                    >
                      <span>Lihat Rincian Paket Langganan</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
