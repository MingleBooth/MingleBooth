'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Camera, Play, Pause, Sparkles } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';

const PHOTO_POSES = [
  {
    id: 1,
    url: '/demo/pose_1.jpg',
    label: 'Pose 1: Senyum Hangat',
    caption: 'Smile 📸',
  },
  {
    id: 2,
    url: '/demo/pose_2.jpg',
    label: 'Pose 2: Peace & Finger Heart',
    caption: 'Peace ✌️',
  },
  {
    id: 3,
    url: '/demo/pose_3.jpg',
    label: 'Pose 3: Kacamata Pesta',
    caption: 'Party 🕶️',
  },
  {
    id: 4,
    url: '/demo/pose_4.jpg',
    label: 'Pose 4: Jempol & Rayakan',
    caption: 'Cheers! 👍',
  },
];

// Strip photo uses 2 grids only for a compact, well-proportioned layout
const STRIP_POSES = PHOTO_POSES.slice(0, 2);

export default function LandingPage() {
  const [activeSlide, setActiveSlide] = useState<'photo' | 'gif'>('photo');
  const [isShooting, setIsShooting] = useState(false);
  const [activeShootingIndex, setActiveShootingIndex] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [gifPaused, setGifPaused] = useState(false);
  const [gifFrameIndex, setGifFrameIndex] = useState(0);

  // 2-Pose Boomerang Loop Animation (alternating between Pose 1 and Pose 2)
  useEffect(() => {
    if (gifPaused) return;
    const interval = setInterval(() => {
      setGifFrameIndex((prev) => (prev === 0 ? 1 : 0));
    }, 450);

    return () => clearInterval(interval);
  }, [gifPaused]);

  // Demo Shutter Simulation (2 Grids)
  const handleDemoShutter = () => {
    if (isShooting) return;
    setIsShooting(true);

    let currentSlot = 0;
    const shootSlot = () => {
      if (currentSlot >= 2) {
        setIsShooting(false);
        setActiveShootingIndex(null);
        setCountdown(null);
        return;
      }

      setActiveShootingIndex(currentSlot);
      let count = 3;
      setCountdown(count);

      const countInterval = setInterval(() => {
        count--;
        if (count > 0) {
          setCountdown(count);
        } else {
          clearInterval(countInterval);
          setCountdown(null);

          // Camera flash effect
          setFlash(true);
          setTimeout(() => setFlash(false), 180);

          currentSlot++;
          setTimeout(shootSlot, 500);
        }
      }, 450);
    };

    shootSlot();
  };

  return (
    <div className="min-h-screen bg-mb-bg text-mb-ink flex flex-col font-sans antialiased selection:bg-[#FFD21F] selection:text-[#0B0B0D]">
      <Navbar activePage="home" />

      {/* Hero Section (Deep Black Header) */}
      <section className="bg-[#0B0B0D] text-white border-b border-white/10 pt-10 sm:pt-14 pb-16 sm:pb-20">
        <div className="max-w-[1080px] mx-auto px-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            {/* Left Copy */}
            <div className="lg:col-span-7 flex flex-col items-start">
              <div className="eyebrow">EKOSISTEM PHOTOBOOTH PROFESIONAL</div>
              <h1 className="text-[34px] sm:text-[46px] lg:text-[54px] font-extrabold font-heading tracking-heading leading-heading text-white">
                Cepat, Tangguh, &amp; 100% Offline-First.
              </h1>
              <p className="mt-4 mb-8 text-[#C9C9CE] text-base sm:text-[18px] leading-relaxed max-w-[50ch]">
                Sistem operasi photobooth modern offline-first untuk vendor wedding, corporate event, dan fotografer di Indonesia. Jepret, simpan, dan bagikan foto tamu lewat QR, semua dari satu aplikasi. Tetap jalan walau internet mati.
              </p>

              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                <Link
                  href="/register"
                  className="px-6 py-3.5 rounded-full bg-white text-[#0B0B0D] font-heading font-bold text-base hover:bg-neutral-100 transition-all shadow-md active:scale-98"
                >
                  Buat Akun Gratis
                </Link>
                <a
                  href="#demo"
                  className="px-6 py-3.5 rounded-full bg-transparent text-white border-2 border-white/80 font-heading font-bold text-base hover:bg-white/10 transition-all active:scale-98"
                >
                  Coba Demo Gratis
                </a>
              </div>

              {/* Supported Platforms */}
              <div className="flex flex-wrap items-center gap-2 mt-8">
                {['Mac', 'Windows', 'Android', 'iOS Companion'].map((plat) => (
                  <span
                    key={plat}
                    className="px-3 py-1 rounded-full text-[12px] font-medium border border-white/20 text-[#E2E2E6]"
                  >
                    {plat}
                  </span>
                ))}
              </div>
            </div>

            {/* Right Product Visual Interactive Showcase */}
            <div className="lg:col-span-5 flex flex-col items-center justify-center">
              <div className="w-full flex flex-col items-center">
                {activeSlide === 'photo' ? (
                  /* Compact 2-Grid Photo Strip (Spacious, Well-Proportioned & Non-overflowing) */
                  <div className="flex flex-col items-center">
                    <div className="relative w-[215px] sm:w-[225px] bg-white text-[#0B0B0D] p-3 pb-3.5 rounded-xl shadow-2xl rotate-1 hover:rotate-0 transition-transform duration-300">
                      {/* White Camera Flash Overlay */}
                      {flash && (
                        <div className="absolute inset-0 bg-white z-40 rounded-xl animate-flash pointer-events-none" />
                      )}

                      {/* 2 Strip Photo Grids (Compact 2-Pose Photostrip) */}
                      <div className="space-y-2.5">
                        {STRIP_POSES.map((pose, idx) => {
                          const isCurrentActive = activeShootingIndex === idx;

                          return (
                            <div
                              key={pose.id}
                              className="h-[148px] sm:h-[156px] w-full rounded-lg bg-[#ECECE8] overflow-hidden relative border border-black/[0.06] flex items-center justify-center shadow-inner"
                            >
                              {/* Proportional studio portrait framing: balanced headroom, body visible, perfectly centered */}
                              <img
                                src={pose.url}
                                alt={pose.label}
                                className="w-full h-full object-cover animate-fadeIn"
                                style={{ objectPosition: 'center 26%' }}
                              />

                              {/* Countdown Overlay for Active Slot */}
                              {countdown !== null && isCurrentActive && (
                                <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-30 backdrop-blur-[1px]">
                                  <span className="text-3xl font-extrabold font-heading text-[#FFD21F] animate-ping">
                                    {countdown}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Strip Footer Brand Label */}
                      <div className="mt-2.5 pt-2 border-t border-neutral-200 text-center flex flex-col items-center">
                        <span className="font-heading font-extrabold text-[11px] tracking-wider text-[#0B0B0D] uppercase leading-none">
                          MingleBooth
                        </span>
                        <span className="text-[8px] font-mono text-neutral-500 tracking-widest mt-1">
                          2026 &middot; SETIAP MOMEN BERARTI
                        </span>
                      </div>
                    </div>

                    {/* Interactive Shutter Trigger Button */}
                    <button
                      onClick={handleDemoShutter}
                      disabled={isShooting}
                      className="mt-3.5 w-[215px] sm:w-[225px] py-2.5 px-4 rounded-xl bg-white hover:bg-neutral-200 text-[#0B0B0D] text-xs font-heading font-bold shadow-lg disabled:opacity-60 transition-all flex items-center justify-center gap-2 active:scale-95"
                    >
                      {isShooting ? (
                        <>
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                          <span>Menjepret Foto {((activeShootingIndex ?? 0) + 1)}/2...</span>
                        </>
                      ) : (
                        <>
                          <Camera className="w-3.5 h-3.5 text-[#0B0B0D]" />
                          <span>Klik Tes Shutter 📸</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  /* Dynamic Boomerang GIF Showcase (Landscape Orientation) */
                  <div className="flex flex-col items-center w-full max-w-[380px] sm:max-w-[420px]">
                    <div
                      onClick={() => setGifPaused(!gifPaused)}
                      className="relative w-full bg-white text-[#0B0B0D] p-3 rounded-2xl shadow-2xl cursor-pointer -rotate-1 hover:rotate-0 transition-transform duration-300 group select-none"
                    >
                      {/* Active GIF Frame Display in Widescreen Landscape (16:10 aspect ratio) - Completely Clean without Text Overlays */}
                      <div className="relative aspect-[16/10] w-full rounded-xl overflow-hidden bg-neutral-900 border border-black/10 shadow-inner">
                        <img
                          src={STRIP_POSES[gifFrameIndex].url}
                          alt={STRIP_POSES[gifFrameIndex].label}
                          className="w-full h-full object-cover transition-opacity duration-150"
                          style={{ objectPosition: 'center 26%' }}
                        />

                        {/* Center Pause Overlay Icon on Hover */}
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <div className="w-12 h-12 rounded-full bg-black/70 backdrop-blur-sm text-white flex items-center justify-center shadow-lg">
                            {gifPaused ? (
                              <Play className="w-5 h-5 ml-0.5 fill-white" />
                            ) : (
                              <Pause className="w-5 h-5 fill-white" />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Card Footer Brand Label (Clean & Minimal matching photostrip) */}
                      <div className="mt-2.5 pt-2 border-t border-neutral-200 text-center flex flex-col items-center">
                        <span className="font-heading font-extrabold text-[11px] tracking-wider text-[#0B0B0D] uppercase leading-none">
                          MingleBooth
                        </span>
                        <span className="text-[8px] font-mono text-neutral-500 tracking-widest mt-1">
                          2026 &middot; LIVE BOOMERANG
                        </span>
                      </div>
                    </div>

                    <p className="text-[11px] text-neutral-400 mt-2 text-center">
                      GIF photobooth format landscape menggabungkan multi-pose jepretan menjadi animasi stop-motion looping otomatis.
                    </p>
                  </div>
                )}

                {/* Showcase Switcher Pills */}
                <div className="flex items-center gap-2 mt-5">
                  <button
                    type="button"
                    onClick={() => setActiveSlide('photo')}
                    className={`px-4 py-1.5 rounded-full text-xs font-heading font-bold transition-all ${
                      activeSlide === 'photo'
                        ? 'bg-white text-[#0B0B0D] shadow-md'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    Strip Foto (2 Grid)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSlide('gif')}
                    className={`px-4 py-1.5 rounded-full text-xs font-heading font-bold transition-all ${
                      activeSlide === 'gif'
                        ? 'bg-white text-[#0B0B0D] shadow-md'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    Boomerang GIF
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4 Stats Value Proposition Bar */}
        <div className="max-w-[1080px] mx-auto px-5 mt-14 pt-8 border-t border-white/15">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-left">
            <div className="pr-4 md:border-r border-white/15">
              <span className="block font-heading font-extrabold text-[26px] text-[#FFD21F] tracking-tight">
                0 Detik
              </span>
              <span className="text-sm text-[#B8B8BE]">Shutter instan tanpa lag</span>
            </div>
            <div className="pr-4 md:border-r border-white/15">
              <span className="block font-heading font-extrabold text-[26px] text-[#FFD21F] tracking-tight">
                Offline First
              </span>
              <span className="text-sm text-[#B8B8BE]">Berjalan 100% tanpa internet</span>
            </div>
            <div className="pr-4 md:border-r border-white/15">
              <span className="block font-heading font-extrabold text-[26px] text-[#FFD21F] tracking-tight">
                1 Detik QR
              </span>
              <span className="text-sm text-[#B8B8BE]">Tamu scan &amp; unduh seketika</span>
            </div>
            <div>
              <span className="block font-heading font-extrabold text-[26px] text-[#FFD21F] tracking-tight">
                Sony Native
              </span>
              <span className="text-sm text-[#B8B8BE]">Direct USB PTP tethering</span>
            </div>
          </div>
        </div>
      </section>

      {/* Demo Workflow Section */}
      <section id="demo" className="py-20 max-w-[1080px] mx-auto px-5 w-full">
        <div className="text-center max-w-[640px] mx-auto mb-16">
          <div className="eyebrow">ALUR KERJA OPERATOR</div>
          <h2 className="text-[32px] sm:text-[42px] font-extrabold font-heading tracking-heading leading-heading text-mb-ink">
            Tiga Langkah Sederhana dari Jepretan ke Galeri Tamu.
          </h2>
          <p className="mt-4 text-mb-muted text-lg">
            Didesain khusus untuk operator photobooth di lapangan: cepat, tanpa friksi, dan siap menangani antrean tamu panjang.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              num: 1,
              title: 'Pilih Template & Mulai',
              desc: 'Pilih format cetak 4R, 2×6 photo strip, atau square. Atur judul acara, bingkai transparan, dan branding vendor.',
            },
            {
              num: 2,
              title: 'Jepret dengan Sony Mirrorless',
              desc: 'Live view tajam 30fps pada layar laptop booth. Hitung mundur otomatis dan shutter instan lewat kabel USB tethering.',
            },
            {
              num: 3,
              title: 'Cetak Cepat & Scan QR',
              desc: 'Foto langsung diproses oleh compositor lokal. Cetak ke printer dye-sublimation dan tampilkan QR instan untuk tamu.',
            },
          ].map((step) => (
            <div
              key={step.num}
              className="p-8 rounded-2xl bg-mb-surface border border-mb-line flex flex-col items-start gap-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="step-number-circle">{step.num}</div>
              <h3 className="text-xl font-extrabold font-heading text-mb-ink mt-2">
                {step.title}
              </h3>
              <p className="text-mb-muted text-base leading-relaxed">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 3 Ecosystem Pillars (Dark Editorial Style) */}
      <section className="bg-[#0B0B0D] text-white py-20 border-y border-white/10">
        <div className="max-w-[1080px] mx-auto px-5">
          <div className="text-center max-w-[640px] mx-auto mb-16">
            <div className="eyebrow">ARSITEKTUR MINGLEBOOTH</div>
            <h2 className="text-[32px] sm:text-[42px] font-extrabold font-heading tracking-heading leading-heading text-white">
              Tiga Pilar yang Memastikan Acara Anda Berjalan Sempurna.
            </h2>
            <p className="mt-4 text-[#C9C9CE] text-lg">
              Solusi end-to-end yang menggabungkan aplikasi kiosk laptop, galeri awan tamu, dan konsol manajemen vendor.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="pillar-card">
              <span className="text-[12px] font-mono uppercase tracking-widest text-[#FFD21F] mb-3 block">
                01 / KIOSK DESKTOP
              </span>
              <h3 className="text-2xl font-extrabold font-heading text-white mb-3">
                MingleBooth Studio
              </h3>
              <p className="text-[#C9C9CE] text-base leading-relaxed">
                Aplikasi native untuk Windows dan macOS. Mengendalikan kamera Sony secara langsung via USB SDK, live preview mulus tanpa jeda, komposit foto offline, dan antrean cetak otomatis.
              </p>
            </div>

            <div className="pillar-card">
              <span className="text-[12px] font-mono uppercase tracking-widest text-[#FFD21F] mb-3 block">
                02 / GUEST CLOUD
              </span>
              <h3 className="text-2xl font-extrabold font-heading text-white mb-3">
                Live QR &amp; Guest Gallery
              </h3>
              <p className="text-[#C9C9CE] text-base leading-relaxed">
                Tamu cukup memindai QR code di layar booth untuk membuka galeri pribadi di smartphone mereka. Unduh foto asli resolusi penuh, boomerang GIF animasi, atau unduh paket ZIP lengkap.
              </p>
            </div>

            <div className="pillar-card">
              <span className="text-[12px] font-mono uppercase tracking-widest text-[#FFD21F] mb-3 block">
                03 / VENDOR PORTAL
              </span>
              <h3 className="text-2xl font-extrabold font-heading text-white mb-3">
                Vendor Console
              </h3>
              <p className="text-[#C9C9CE] text-base leading-relaxed">
                Pusat kendali berbasis web untuk pemilik vendor photobooth. Buat jadwal event baru, unggah desain bingkai PNG kustom, kelola armada laptop operator, dan pantau langganan lisensi.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Field Reliability / Features Section */}
      <section className="py-20 max-w-[1080px] mx-auto px-5 w-full">
        <div className="text-center max-w-[640px] mx-auto mb-16">
          <div className="eyebrow">KETANGGUHAN LAPANGAN</div>
          <h2 className="text-[32px] sm:text-[42px] font-extrabold font-heading tracking-heading leading-heading text-mb-ink">
            Dibangun untuk Situasi Nyata di Lapangan Event.
          </h2>
          <p className="mt-4 text-mb-muted text-lg">
            Karena di tengah acara pernikahan atau gala dinner 1.000 tamu, Anda tidak boleh bergantung pada sinyal internet yang tidak stabil.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {
              title: 'Kamera Sony & Webcam',
              desc: 'Mendukung Sony Alpha A6000–A7 IV lewat koneksi USB PTP langsung, serta webcam USB untuk booth kompak.',
            },
            {
              title: 'Penyimpanan Offline Lokal',
              desc: 'Foto dan GIF tersimpan aman di SSD lokal operator terlebih dahulu, siap disinkronkan ke cloud saat koneksi tersedia.',
            },
            {
              title: 'Dukungan Printer Dye-Sub',
              desc: 'Kompatibel dengan printer foto komersial seperti DNP RX1HS, DS620, Citizen, dan HiTi untuk cetak dalam 10 detik.',
            },
            {
              title: 'Multi-Device Fleet',
              desc: 'Gunakan satu akun vendor untuk mengoperasikan beberapa booth sekaligus di berbagai lokasi acara berbeda.',
            },
          ].map((f, idx) => (
            <div
              key={idx}
              className="p-6 rounded-2xl bg-mb-surface border border-mb-line flex flex-col gap-2 shadow-sm"
            >
              <h3 className="text-lg font-extrabold font-heading text-mb-ink">
                {f.title}
              </h3>
              <p className="text-sm text-mb-muted leading-relaxed">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Final Conversion CTA Section */}
      <section className="bg-[#0B0B0D] text-white py-20 border-t border-white/10">
        <div className="max-w-[760px] mx-auto px-5 text-center flex flex-col items-center">
          <h2 className="text-[34px] sm:text-[44px] font-extrabold font-heading tracking-heading leading-heading text-white">
            Siap Mengupgrade Standar Photobooth Anda?
          </h2>
          <p className="mt-4 mb-8 text-[#C9C9CE] text-lg max-w-[48ch]">
            Daftar akun vendor gratis sekarang. Uji coba Studio langsung di laptop Anda, sambungkan kamera fisik Anda, dan rasakan keandalannya.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/register"
              className="px-8 py-4 rounded-full bg-white text-[#0B0B0D] font-heading font-bold text-lg hover:bg-neutral-100 transition-all shadow-lg active:scale-98"
            >
              Buat Akun Vendor Gratis
            </Link>
            <Link
              href="/billing"
              className="px-8 py-4 rounded-full bg-transparent text-white border-2 border-white/80 font-heading font-bold text-lg hover:bg-white/10 transition-all active:scale-98"
            >
              Lihat Paket Lisensi
            </Link>
          </div>
          <span className="text-xs text-[#B8B8BE] mt-4 font-mono">
            Tanpa komitmen kartu kredit &middot; Mode demo offline selalu gratis
          </span>
        </div>
      </section>

      <Footer />
    </div>
  );
}
