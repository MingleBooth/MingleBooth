'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Download,
  Copy,
  Check,
  Laptop,
  Smartphone,
  ShieldAlert,
  Terminal,
  ExternalLink,
  FileText,
  CheckCircle2,
  ArrowLeft,
  AlertTriangle,
  Monitor,
  HardDrive,
  Hash,
  ShieldCheck,
  Zap,
} from 'lucide-react';

interface ReleaseAsset {
  id: string;
  platform: 'android' | 'macos' | 'windows';
  title: string;
  formatBadge: string;
  formatColor: string;
  badgeType: string;
  filename: string;
  size: string;
  sha256: string;
  downloadUrl: string;
  targetOS: string;
  recommended?: boolean;
  notes?: string;
}

const RELEASE_VERSION = 'v1.0.0-rc.2';
const RELEASE_DATE = '21 Oktober 2026';
const RELEASE_REPO_URL = 'https://github.com/MingleBooth/MingleBooth/releases/tag/v1.0.0-rc.2';

const RELEASE_ASSETS: ReleaseAsset[] = [
  {
    id: 'android-apk',
    platform: 'android',
    title: 'MingleBooth Studio Android (Tablet & Smartphone)',
    formatBadge: '.APK',
    formatColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    badgeType: 'Standalone Package',
    filename: 'MingleBooth-Studio-1.0.0-rc.2.apk',
    size: '10.03 MB',
    sha256: '3cfa36a2ef468dfe025c1738f668afc54ee4cb7d99a07c7a969eafc863e7c318',
    downloadUrl: 'https://github.com/MingleBooth/MingleBooth/releases/download/v1.0.0-rc.2/MingleBooth-Studio-1.0.0-rc.2.apk',
    targetOS: 'Android 8.0 Oreo ke atas (ARM64 & ARMv7, USB OTG Host Ready)',
    recommended: true,
    notes: 'Mendukung Sony PC Remote PTP via USB OTG, Thermal Printing ESC/POS, dan Mode Demo Offline.',
  },
  {
    id: 'macos-dmg',
    platform: 'macos',
    title: 'MingleBooth Studio macOS DMG (Apple Silicon & Intel)',
    formatBadge: '.DMG',
    formatColor: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    badgeType: 'Rekomendasi macOS',
    filename: 'MingleBooth-Studio-1.0.0-rc.2.dmg',
    size: '155.04 MB',
    sha256: 'e135d78caa3c7a5df46969178bf5338f503c28ff92c802380126766ba88a249d',
    downloadUrl: 'https://github.com/MingleBooth/MingleBooth/releases/download/v1.0.0-rc.2/MingleBooth-Studio-1.0.0-rc.2.dmg',
    targetOS: 'macOS 12.0+ (Monterey, Ventura, Sonoma, Sequoia)',
    recommended: true,
    notes: 'Installer universal disk image. Drag & drop ke folder Applications.',
  },
  {
    id: 'macos-zip',
    platform: 'macos',
    title: 'MingleBooth Studio macOS Portable (ZIP Archive)',
    formatBadge: '.ZIP',
    formatColor: 'bg-neutral-500/10 text-neutral-300 border-neutral-500/20',
    badgeType: 'Portable macOS',
    filename: 'MingleBooth-Studio-1.0.0-rc.2-mac.zip',
    size: '149.48 MB',
    sha256: '5f5b8cbe5a7f104ed4de5003c03ee994376d31332498171dc409e9ebce90bd23',
    downloadUrl: 'https://github.com/MingleBooth/MingleBooth/releases/download/v1.0.0-rc.2/MingleBooth-Studio-1.0.0-rc.2-mac.zip',
    targetOS: 'macOS 12.0+ (Apple Silicon M1/M2/M3/M4 & Intel x64)',
    notes: 'Ekstrak dan jalankan langsung tanpa mount disk image.',
  },
  {
    id: 'windows-setup',
    platform: 'windows',
    title: 'MingleBooth Studio Windows Setup (NSIS Installer)',
    formatBadge: 'SETUP .EXE',
    formatColor: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    badgeType: 'Rekomendasi Windows',
    filename: 'MingleBooth-Studio-Setup-1.0.0-rc.2.exe',
    size: '137.66 MB',
    sha256: 'c0a05d0cb584bb98e5068d637c7bde98d0067cf55f31a1cfab8ce12cd0369e9d',
    downloadUrl: 'https://github.com/MingleBooth/MingleBooth/releases/download/v1.0.0-rc.2/MingleBooth-Studio-Setup-1.0.0-rc.2.exe',
    targetOS: 'Windows 10 & Windows 11 (64-bit)',
    recommended: true,
    notes: 'Memasang shortcut desktop dan integrasi driver cetak DNP, HiTi, Citizen.',
  },
  {
    id: 'windows-portable',
    platform: 'windows',
    title: 'MingleBooth Studio Windows Portable (Stand-alone EXE)',
    formatBadge: 'PORTABLE .EXE',
    formatColor: 'bg-neutral-500/10 text-neutral-300 border-neutral-500/20',
    badgeType: 'Portable Windows',
    filename: 'MingleBooth-Studio-1.0.0-rc.2-portable.exe',
    size: '137.33 MB',
    sha256: '7ed7b237d383e1a50875be27fcb375541a1f986b7e5280818ae80a3a75d27f9b',
    downloadUrl: 'https://github.com/MingleBooth/MingleBooth/releases/download/v1.0.0-rc.2/MingleBooth-Studio-1.0.0-rc.2-portable.exe',
    targetOS: 'Windows 10 & Windows 11 (64-bit)',
    notes: 'Jalankan langsung dari Flashdisk atau folder tanpa instalasi sistem.',
  },
];

export default function DownloadPage() {
  const [selectedPlatform, setSelectedPlatform] = useState<'all' | 'android' | 'macos' | 'windows'>('all');
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const handleCopy = (text: string, type: 'hash' | 'cmd') => {
    navigator.clipboard.writeText(text);
    if (type === 'hash') {
      setCopiedHash(text);
      setTimeout(() => setCopiedHash(null), 2000);
    } else {
      setCopiedCmd(text);
      setTimeout(() => setCopiedCmd(null), 2000);
    }
  };

  const filteredAssets =
    selectedPlatform === 'all'
      ? RELEASE_ASSETS
      : RELEASE_ASSETS.filter((a) => a.platform === selectedPlatform);

  return (
    <div className="min-h-screen bg-[#090A0C] text-[#EDEDED] flex flex-col font-sans select-none antialiased">
      {/* Top Bar */}
      <header className="h-16 px-4 sm:px-12 border-b border-white/[0.07] bg-[#090A0C]/90 backdrop-blur-md sticky top-0 z-50 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs text-neutral-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Kembali ke Beranda</span>
          </Link>
          <div className="h-4 w-[1px] bg-white/[0.08]" />
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-minglebooth-header.png"
              alt="MingleBooth"
              className="h-8 w-auto object-contain"
            />
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <a
            href={RELEASE_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-neutral-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>GitHub Release</span>
            <ExternalLink className="w-3 h-3 text-neutral-500" />
          </a>
          <Link
            href="/dashboard"
            className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-neutral-200 text-black text-xs font-semibold transition-colors"
          >
            Vendor Dashboard
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-10 sm:py-14 flex flex-col gap-8">
        <div className="flex flex-col gap-3 text-center items-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-xs font-medium text-neutral-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Rilis Resmi Multi-Platform</span>
            <span className="text-neutral-500">•</span>
            <span className="text-white font-mono">{RELEASE_VERSION}</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white mt-1">
            Unduh MingleBooth Studio
          </h1>
          <p className="text-sm sm:text-base text-neutral-400 max-w-2xl leading-relaxed">
            Aplikasi native photobooth kiosk untuk iPad/Android Tablet, macOS, dan Windows. Siap beroperasi 100% offline dengan dukungan kamera Sony PTP, webcam, thermal printer, dan sinkronisasi galeri cloud.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 mt-2 text-xs text-neutral-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Verifikasi SHA-256 Otentik
            </span>
            <span className="text-neutral-600">•</span>
            <span>Dirilis: {RELEASE_DATE}</span>
            <span className="text-neutral-600">•</span>
            <span className="text-neutral-300">Total 5 Artefak Siap Unduh</span>
          </div>
        </div>

        {/* Platform Selector Filter */}
        <div className="flex items-center justify-center gap-2 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] max-w-md mx-auto w-full">
          <button
            onClick={() => setSelectedPlatform('all')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
              selectedPlatform === 'all'
                ? 'bg-white text-black shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Semua
          </button>
          <button
            onClick={() => setSelectedPlatform('android')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              selectedPlatform === 'android'
                ? 'bg-white text-black shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Android</span>
          </button>
          <button
            onClick={() => setSelectedPlatform('macos')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              selectedPlatform === 'macos'
                ? 'bg-white text-black shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>macOS</span>
          </button>
          <button
            onClick={() => setSelectedPlatform('windows')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              selectedPlatform === 'windows'
                ? 'bg-white text-black shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Windows</span>
          </button>
        </div>

        {/* Download Asset Cards List */}
        <div className="flex flex-col gap-4">
          {filteredAssets.map((asset) => (
            <div
              key={asset.id}
              className={`p-5 sm:p-6 rounded-2xl bg-[#121316] border transition-all ${
                asset.recommended
                  ? 'border-white/[0.15] shadow-lg shadow-black/40 ring-1 ring-white/[0.05]'
                  : 'border-white/[0.07] hover:border-white/[0.12]'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center flex-shrink-0 text-white">
                    {asset.platform === 'android' && <Smartphone className="w-6 h-6 text-emerald-400" />}
                    {asset.platform === 'macos' && <Laptop className="w-6 h-6 text-sky-400" />}
                    {asset.platform === 'windows' && <Monitor className="w-6 h-6 text-indigo-400" />}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm sm:text-base font-bold text-white">{asset.title}</h3>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${asset.formatColor}`}>
                        {asset.formatBadge}
                      </span>
                      {asset.recommended && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-white/[0.08] text-white border border-white/[0.15]">
                          {asset.badgeType}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-neutral-400">{asset.notes}</p>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-neutral-400 pt-1">
                      <span className="font-mono text-neutral-300">{asset.filename}</span>
                      <span>•</span>
                      <span className="font-semibold text-white">{asset.size}</span>
                      <span>•</span>
                      <span>{asset.targetOS}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-shrink-0">
                  <a
                    href={asset.downloadUrl}
                    className={`h-10 px-5 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-md ${
                      asset.recommended
                        ? 'bg-white hover:bg-neutral-200 text-black'
                        : 'bg-white/[0.08] hover:bg-white/[0.14] text-white border border-white/[0.1]'
                    }`}
                  >
                    <Download className="w-4 h-4" />
                    <span>Unduh Sekarang</span>
                  </a>
                </div>
              </div>

              {/* Checksum SHA-256 Box */}
              <div className="mt-4 pt-4 border-t border-white/[0.05] flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-black/30 p-3 rounded-xl">
                <div className="flex items-center gap-2 min-w-0">
                  <Hash className="w-3.5 h-3.5 text-neutral-500 flex-shrink-0" />
                  <span className="text-[11px] text-neutral-400 flex-shrink-0 font-medium">SHA-256:</span>
                  <code className="text-[11px] font-mono text-neutral-300 truncate select-all">
                    {asset.sha256}
                  </code>
                </div>
                <button
                  onClick={() => handleCopy(asset.sha256, 'hash')}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-white/[0.05] hover:bg-white/[0.1] text-[10px] text-neutral-300 transition-colors flex-shrink-0 self-start sm:self-auto"
                >
                  {copiedHash === asset.sha256 ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">Tersalin</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Salin Checksum</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Security & Installation Guide */}
        <section className="mt-6 flex flex-col gap-6">
          <div className="border-b border-white/[0.08] pb-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-400" />
              <span>Panduan Instalasi &amp; Peringatan Keamanan OS</span>
            </h2>
            <p className="text-xs text-neutral-400 mt-1">
              File rilis ini merupakan pre-release developer build yang belum dibubuhi sertifikat komersial berbayar (Apple Developer ID / Microsoft Authenticode). Ikuti panduan di bawah untuk membuka aplikasi dengan aman.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* macOS Guide */}
            <div className="p-5 rounded-2xl bg-[#121316] border border-white/[0.07] flex flex-col gap-3">
              <div className="flex items-center gap-2 text-sky-400 font-semibold text-xs">
                <Laptop className="w-4 h-4" />
                <span>macOS Gatekeeper</span>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Jika macOS menampilkan dialog <em>&ldquo;Apple cannot check it for malicious software&rdquo;</em> atau <em>&ldquo;App is damaged&rdquo;</em>, jalankan perintah ini di Terminal:
              </p>
              <div className="bg-black/60 rounded-xl p-3 border border-white/[0.05] flex flex-col gap-2">
                <code className="text-[11px] font-mono text-neutral-200 break-all select-all">
                  xattr -cr &quot;/Applications/MingleBooth Studio.app&quot;
                </code>
                <button
                  onClick={() =>
                    handleCopy('xattr -cr "/Applications/MingleBooth Studio.app"', 'cmd')
                  }
                  className="inline-flex items-center justify-center gap-1.5 py-1 px-2 rounded bg-white/[0.06] hover:bg-white/[0.12] text-[10px] text-neutral-300 transition-colors"
                >
                  {copiedCmd === 'xattr -cr "/Applications/MingleBooth Studio.app"' ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>Perintah Tersalin</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Salin Perintah</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-[11px] text-neutral-500">
                Atau buka <strong>System Settings &gt; Privacy &amp; Security</strong>, scroll ke bawah lalu klik <strong>Open Anyway</strong>.
              </p>
            </div>

            {/* Windows Guide */}
            <div className="p-5 rounded-2xl bg-[#121316] border border-white/[0.07] flex flex-col gap-3">
              <div className="flex items-center gap-2 text-indigo-400 font-semibold text-xs">
                <Monitor className="w-4 h-4" />
                <span>Windows Defender SmartScreen</span>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Jika Windows menampilkan layar biru SmartScreen <em>&ldquo;Windows protected your PC: Unknown publisher&rdquo;</em>:
              </p>
              <ol className="text-xs text-neutral-400 space-y-1.5 list-decimal list-inside leading-relaxed">
                <li>Klik tautan <strong className="text-white">&ldquo;More info&rdquo;</strong> (Informasi selengkapnya).</li>
                <li>Klik tombol <strong className="text-white">&ldquo;Run anyway&rdquo;</strong> (Tetap jalankan).</li>
                <li>Aplikasi akan langsung terpasang dan berjalan secara normal.</li>
              </ol>
              <p className="text-[11px] text-neutral-500 mt-auto">
                Installer Setup maupun Portable telah diverifikasi bebas dari malware dan aman untuk digunakan.
              </p>
            </div>

            {/* Android Guide */}
            <div className="p-5 rounded-2xl bg-[#121316] border border-white/[0.07] flex flex-col gap-3">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                <Smartphone className="w-4 h-4" />
                <span>Android Unknown Sources</span>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Untuk memasang APK langsung di tablet atau smartphone Android:
              </p>
              <ol className="text-xs text-neutral-400 space-y-1.5 list-decimal list-inside leading-relaxed">
                <li>Unduh file <strong className="text-white">.apk</strong> langsung dari browser.</li>
                <li>Jika muncul peringatan keamanan, pilih <strong className="text-white">Tetap Unduh / Izinkan dari sumber ini</strong>.</li>
                <li>Buka file APK dari notifikasi unduhan untuk menyelesaikan instalasi.</li>
              </ol>
              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10px] leading-relaxed mt-auto">
                Ditandatangani secara konsisten dengan kunci Android resmi MingleBooth (SHA-256 Digest: d901c813...).
              </div>
            </div>
          </div>
        </section>

        {/* Changelog Card */}
        <section className="p-6 rounded-2xl bg-[#121316] border border-white/[0.08] flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div className="flex items-center gap-2.5">
              <Zap className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white">Catatan Rilis v1.0.0-rc.2</h3>
            </div>
            <span className="text-xs text-neutral-400">{RELEASE_DATE}</span>
          </div>

          <div className="space-y-3 text-xs text-neutral-300 leading-relaxed">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
              <div>
                <strong className="text-white">Redesign UI Aktivasi Desktop Obsidian Dark:</strong> Halaman aktivasi desktop tampil jauh lebih modern dengan obsidian card, hardware fingerprint display, copy-to-clipboard, dan notice mode demo amber.
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
              <div>
                <strong className="text-white">Android Studio Tablet Parity:</strong> PTP camera runner via USB OTG, Live View rotation hotfix, dukungan thermal printing ESC/POS, dan validasi device quota.
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
              <div>
                <strong className="text-white">Integritas Sony Camera Engine:</strong> Sony PTP, PC Remote, Live View 30 FPS, Shutter capture, dan transfer foto RAW/JPG dipertahankan tanpa modifikasi engine native.
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
              <div>
                <strong className="text-white">Proteksi Lisensi Multi-Device:</strong> Kuota perangkat Starter (1 perangkat), Pro (3 perangkat), dan Business (10 perangkat) dengan guard pencegah race-condition.
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-8 border-t border-white/[0.07] bg-[#090A0C] text-center text-xs text-neutral-500">
        <p>© 2026 MingleBooth. All rights reserved. Platform Operasi Photobooth Profesional.</p>
      </footer>
    </div>
  );
}
