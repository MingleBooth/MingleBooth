'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import {
  Download,
  Copy,
  Check,
  Smartphone,
  Laptop,
  Monitor,
  ShieldCheck,
  AlertTriangle,
  Terminal,
} from 'lucide-react';

interface ReleaseAsset {
  id: string;
  platform: 'android' | 'macos' | 'windows';
  title: string;
  formatBadge: string;
  filename: string;
  size: string;
  sha256: string;
  downloadUrl: string;
  targetOS: string;
  notes: string;
  buttonText: string;
}

const RELEASE_VERSION = 'v1.0.0-rc.3';
const RELEASE_DATE = '13 November 2026';

// Strictly showing ONLY the 3 primary installer categories: Android APK, macOS DMG, Windows EXE.
const RELEASE_ASSETS: ReleaseAsset[] = [
  {
    id: 'android-apk',
    platform: 'android',
    title: 'MingleBooth Studio Android',
    formatBadge: 'APK · Android 8.0+',
    filename: 'MingleBooth-Studio-1.0.0-rc.3.apk',
    size: '7.39 MB',
    sha256: '2410f45967ee385f7ac2259accd321620a40434ab0664fb2920a3b9bf662eee9',
    downloadUrl: 'https://github.com/MingleBooth/MingleBooth/releases/download/v1.0.0-rc.3/MingleBooth-Studio-1.0.0-rc.3.apk',
    targetOS: 'Android 8.0 Oreo ke atas (ARM64 & ARMv7, USB OTG Host Ready)',
    buttonText: 'Unduh untuk Android (APK)',
    notes: 'Mendukung Sony PC Remote PTP via USB OTG, Thermal Printing ESC/POS, dan Mode Demo Offline.',
  },
  {
    id: 'macos-dmg',
    platform: 'macos',
    title: 'MingleBooth Studio macOS',
    formatBadge: 'DMG · macOS 12.0+',
    filename: 'MingleBooth-Studio-1.0.0-rc.3.dmg',
    size: '143.23 MB',
    sha256: '7395738163be2d77cd6cfcd6b337a646aafcd6cbe61a77e686cca6f0b3133a91',
    downloadUrl: 'https://github.com/MingleBooth/MingleBooth/releases/download/v1.0.0-rc.3/MingleBooth-Studio-1.0.0-rc.3.dmg',
    targetOS: 'macOS 12.0+ (Monterey, Ventura, Sonoma, Sequoia - Apple Silicon & Intel)',
    buttonText: 'Unduh untuk macOS (DMG)',
    notes: 'Installer universal disk image resmi dengan Universal Dynamic Camera SOP (Sony & Canon). Buka DMG lalu drag & drop ke folder Applications.',
  },
  {
    id: 'windows-setup',
    platform: 'windows',
    title: 'MingleBooth Studio Windows',
    formatBadge: 'EXE · Windows 10 & 11',
    filename: 'MingleBooth-Studio-Setup-1.0.0-rc.3.exe',
    size: '137.67 MB',
    sha256: '3e2b1bffaed89d0b5c0a24dbdd0a88b32e0d6f6ecb0542609dcedcf517d0753f',
    downloadUrl: 'https://github.com/MingleBooth/MingleBooth/releases/download/v1.0.0-rc.3/MingleBooth-Studio-Setup-1.0.0-rc.3.exe',
    targetOS: 'Windows 10 & Windows 11 (64-bit)',
    buttonText: 'Unduh untuk Windows (EXE)',
    notes: 'Paket installer lengkap dengan driver USB Sony dan integrasi printer foto DNP/HiTi/Citizen.',
  },
];

export default function DownloadPage() {
  const router = useRouter();
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  useEffect(() => {
    // Official software downloads are strictly gated for registered vendors inside the dashboard
    const sessionUser = typeof window !== 'undefined' ? localStorage.getItem('mb_web_user') : null;
    if (sessionUser) {
      router.replace('/dashboard');
    } else {
      router.replace('/login');
    }
  }, [router]);

  const handleCopyHash = (hash: string, id: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(id);
    setTimeout(() => setCopiedHash(null), 2500);
  };

  return (
    <div className="min-h-screen bg-mb-bg text-mb-ink flex flex-col font-sans antialiased selection:bg-[#FFD21F] selection:text-[#0B0B0D]">
      <Navbar activePage="download" />

      {/* Top Header Section (Dark) */}
      <section className="bg-[#0B0B0D] text-white border-b border-white/10 pt-10 pb-12 sm:pb-16">
        <div className="max-w-[1080px] mx-auto px-5">
          <div className="eyebrow">DISTRIBUSI RESMI APLIKASI</div>
          <h1 className="text-[34px] sm:text-[48px] font-extrabold font-heading tracking-heading leading-heading text-white max-w-[22ch]">
            Unduh MingleBooth Studio
          </h1>
          <p className="mt-4 mb-6 text-[#C9C9CE] text-lg sm:text-[19px] leading-relaxed max-w-[56ch]">
            Instal aplikasi di laptop atau tablet untuk mengoperasikan photobooth offline-first, live view kamera, cetak instan, dan QR galeri tamu.
          </p>

          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 border border-white/15 text-sm font-mono text-[#E2E2E6]">
            <ShieldCheck className="w-4 h-4 text-[#FFD21F]" />
            <span>Versi Resmi: {RELEASE_VERSION} &middot; {RELEASE_DATE}</span>
          </div>
        </div>
      </section>

      {/* Main Download Grid */}
      <main className="flex-1 py-12">
        <div className="max-w-[1080px] mx-auto px-5">
          {/* Platform Cards (3-column layout) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch mb-16">
            {RELEASE_ASSETS.map((asset) => {
              const isCopied = copiedHash === asset.id;
              return (
                <div
                  key={asset.id}
                  className="bg-mb-surface border-2 border-mb-ink rounded-2xl p-7 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow"
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
                        {asset.formatBadge}
                      </span>
                    </div>

                    <h2 className="text-[22px] font-extrabold font-heading tracking-tight mb-2">
                      {asset.title}
                    </h2>
                    <p className="text-mb-muted text-sm leading-relaxed mb-4">
                      {asset.notes}
                    </p>

                    {/* Metadata Table */}
                    <div className="space-y-2 py-3 border-y border-mb-line text-xs font-mono text-mb-muted">
                      <div className="flex justify-between">
                        <span>File:</span>
                        <span className="font-semibold text-mb-ink truncate max-w-[180px]" title={asset.filename}>
                          {asset.filename}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Ukuran:</span>
                        <span className="font-semibold text-mb-ink">{asset.size}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>OS:</span>
                        <span className="font-semibold text-mb-ink truncate max-w-[180px]" title={asset.targetOS}>
                          {asset.targetOS}
                        </span>
                      </div>
                    </div>

                    {/* Checksum SHA-256 Box */}
                    <div className="mt-4 p-3 rounded-xl bg-mb-bg border border-mb-line flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="block text-[10px] text-mb-muted uppercase font-bold tracking-wider">
                          SHA-256 Checksum
                        </span>
                        <span className="font-mono text-[11px] text-mb-ink block truncate max-w-[190px]">
                          {asset.sha256}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyHash(asset.sha256, asset.id)}
                        className="p-1.5 rounded-lg border border-mb-line bg-mb-surface hover:bg-neutral-100 text-mb-ink transition-colors flex-shrink-0"
                        title="Salin SHA-256"
                      >
                        {isCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Download Button */}
                  <div className="mt-6">
                    <a
                      href={asset.downloadUrl}
                      className="btn-primary w-full text-sm py-3"
                    >
                      <Download className="w-4 h-4" />
                      <span>{asset.buttonText}</span>
                    </a>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Installation & Security Verification Guidance */}
          <div className="p-8 rounded-2xl bg-mb-surface border border-mb-line">
            <h3 className="text-xl font-bold font-heading mb-4 flex items-center gap-2">
              <Terminal className="w-5 h-5 text-mb-ink" />
              <span>Panduan Instalasi &amp; Verifikasi Integritas File</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-mb-muted">
              <div>
                <h4 className="font-bold text-mb-ink mb-1.5">macOS (Apple Silicon &amp; Intel)</h4>
                <p className="leading-relaxed">
                  Buka file <code className="bg-mb-bg px-1 py-0.5 rounded font-mono text-xs">.dmg</code>, seret ikon MingleBooth Studio ke folder Applications. Jika muncul peringatan keamanan pengembang pihak ketiga, klik kanan ikon aplikasi lalu pilih <strong>Buka (Open)</strong>.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-mb-ink mb-1.5">Windows 10 &amp; 11 (64-bit)</h4>
                <p className="leading-relaxed">
                  Jalankan installer <code className="bg-mb-bg px-1 py-0.5 rounded font-mono text-xs">.exe</code>. Jika Windows SmartScreen muncul, klik <em>More info</em> lalu pilih <em>Run anyway</em> untuk menyelesaikan pemasangan shortcut dan driver kamera.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-mb-ink mb-1.5">Android Tablet &amp; Smartphone</h4>
                <p className="leading-relaxed">
                  Unduh dan pasang file <code className="bg-mb-bg px-1 py-0.5 rounded font-mono text-xs">.apk</code>. Pastikan pengaturan <em>Install unknown apps</em> diaktifkan untuk browser Anda. Hubungkan kamera Sony melalui kabel USB OTG Host.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
