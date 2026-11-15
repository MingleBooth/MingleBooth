'use client';

import React, { useState } from 'react';
import Link from 'next/link';
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
  Terminal,
} from 'lucide-react';

interface SecondaryOption {
  formatBadge: string;
  filename: string;
  size: string;
  sha256: string;
  downloadUrl: string;
  label: string;
}

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
  secondaryOption?: SecondaryOption;
}

const RELEASE_VERSION = 'v1.0.0-rc.4';
const RELEASE_DATE = '15 November 2026';

const RELEASE_ASSETS: ReleaseAsset[] = [
  {
    id: 'android-apk',
    platform: 'android',
    title: 'MingleBooth Studio Android',
    formatBadge: 'APK · Android 8.0+',
    filename: 'MingleBooth-Studio-1.0.0-rc.4.apk',
    size: '6.61 MB',
    sha256: '81579cda6970e54a4d26e6745c13e0480ec29a70eb389b260d66948d5a7d76e1',
    downloadUrl:
      'https://github.com/MingleBooth/MingleBooth/releases/download/v1.0.0-rc.4/MingleBooth-Studio-1.0.0-rc.4.apk',
    targetOS: 'Android 8.0 Oreo ke atas (ARM64 & ARMv7, USB OTG Host Ready)',
    buttonText: 'Unduh untuk Android (APK)',
    notes:
      'Mendukung Sony PC Remote PTP via USB OTG, Thermal Printing ESC/POS, dan Mode Demo Offline.',
  },
  {
    id: 'macos-dmg',
    platform: 'macos',
    title: 'MingleBooth Studio macOS',
    formatBadge: 'DMG · macOS 12.0+',
    filename: 'MingleBooth-Studio-1.0.0-rc.4.dmg',
    size: '143.23 MB',
    sha256: '7d33e1e52bc92bfd33643225f3d48620dd46f0e3116a84e2bd71e1659736e921',
    downloadUrl:
      'https://github.com/MingleBooth/MingleBooth/releases/download/v1.0.0-rc.4/MingleBooth-Studio-1.0.0-rc.4.dmg',
    targetOS: 'macOS 12.0+ (Monterey, Ventura, Sonoma, Sequoia - Apple Silicon & Intel)',
    buttonText: 'Unduh untuk macOS (DMG)',
    notes:
      'Installer universal disk image resmi dengan Universal Dynamic Camera SOP (Sony & Canon). Buka DMG lalu drag & drop ke folder Applications.',
    secondaryOption: {
      formatBadge: 'ZIP Universal',
      filename: 'MingleBooth-Studio-1.0.0-rc.4.zip',
      size: '138.17 MB',
      sha256: '352db291add49a93ffc3e496e891144ecf2e48d9daad3eaa04a16e4b7fd0dcef',
      downloadUrl:
        'https://github.com/MingleBooth/MingleBooth/releases/download/v1.0.0-rc.4/MingleBooth-Studio-1.0.0-rc.4.zip',
      label: 'Unduh Alternatif ZIP (138.17 MB)',
    },
  },
  {
    id: 'windows-setup',
    platform: 'windows',
    title: 'MingleBooth Studio Windows',
    formatBadge: 'EXE · Windows 10 & 11',
    filename: 'MingleBooth-Studio-Setup-1.0.0-rc.4.exe',
    size: '131.72 MB',
    sha256: '17c32d95e1dd26e322ae26828e33f0f04fffb2d66dc0507a0e338b389af557c6',
    downloadUrl:
      'https://github.com/MingleBooth/MingleBooth/releases/download/v1.0.0-rc.4/MingleBooth-Studio-Setup-1.0.0-rc.4.exe',
    targetOS: 'Windows 10 & Windows 11 (64-bit)',
    buttonText: 'Unduh untuk Windows (Installer EXE)',
    notes:
      'Paket installer lengkap dengan driver USB Sony dan integrasi printer foto DNP/HiTi/Citizen.',
    secondaryOption: {
      formatBadge: 'Portable EXE',
      filename: 'MingleBooth-Studio-1.0.0-rc.4-portable.exe',
      size: '131.39 MB',
      sha256: '98ea4498fecbafc4c5c47a66c16bdc6ce0a9fbbf8145da5b979e8c53572269c9',
      downloadUrl:
        'https://github.com/MingleBooth/MingleBooth/releases/download/v1.0.0-rc.4/MingleBooth-Studio-1.0.0-rc.4-portable.exe',
      label: 'Unduh Portable EXE Tanpa Install (131.39 MB)',
    },
  },
];

export default function DownloadPage() {
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

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

                  {/* Download Buttons Section */}
                  <div className="mt-6 space-y-3">
                    <a
                      href={asset.downloadUrl}
                      className="btn-primary w-full text-sm py-3"
                    >
                      <Download className="w-4 h-4" />
                      <span>{asset.buttonText}</span>
                    </a>

                    {/* Secondary Option (Portable EXE or ZIP) */}
                    {asset.secondaryOption && (
                      <div className="pt-2.5 border-t border-mb-line/60">
                        <a
                          href={asset.secondaryOption.downloadUrl}
                          className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-mb-line bg-mb-bg hover:bg-neutral-100 text-xs font-semibold text-mb-ink transition-colors"
                        >
                          <Download className="w-3.5 h-3.5 text-mb-muted" />
                          <span>{asset.secondaryOption.label}</span>
                        </a>
                        <div className="mt-1.5 flex items-center justify-between text-[10px] text-mb-muted font-mono px-1">
                          <span className="truncate max-w-[160px]" title={asset.secondaryOption.filename}>
                            {asset.secondaryOption.filename}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopyHash(asset.secondaryOption!.sha256, `${asset.id}-sec`)
                            }
                            className="hover:text-mb-ink flex items-center gap-1"
                            title="Salin SHA-256 Alternatif"
                          >
                            <span>SHA-256</span>
                            {copiedHash === `${asset.id}-sec` ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    )}
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
                  Buka file <code className="bg-mb-bg px-1 py-0.5 rounded font-mono text-xs">.dmg</code>, seret ikon MingleBooth Studio ke folder Applications (atau ekstrak file <code className="bg-mb-bg px-1 py-0.5 rounded font-mono text-xs">.zip</code>). Jika muncul peringatan keamanan pengembang pihak ketiga, klik kanan ikon aplikasi lalu pilih <strong>Buka (Open)</strong>.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-mb-ink mb-1.5">Windows 10 &amp; 11 (64-bit)</h4>
                <p className="leading-relaxed">
                  Jalankan installer <code className="bg-mb-bg px-1 py-0.5 rounded font-mono text-xs">.exe</code> atau gunakan varian <strong>Portable EXE</strong> langsung tanpa instalasi. Jika Windows SmartScreen muncul, klik <em>More info</em> lalu pilih <em>Run anyway</em> untuk menyelesaikan pemasangan driver kamera.
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
