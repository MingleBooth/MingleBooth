'use client';

import React, { useEffect, useState, useRef } from 'react';
import {
  Download,
  Share2,
  Copy,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Film,
  Camera,
  Layers,
  History,
  Grid,
  Check,
  ExternalLink,
  X,
} from 'lucide-react';

interface SlideItem {
  id: string;
  type: 'photo' | 'gif' | 'raw';
  title: string;
  subtitle: string;
  badge: string;
  url: string;
  downloadName: string;
}

interface GalleryMeta {
  photoId: string;
  eventName: string;
  dateFormatted: string;
  hasGif: boolean;
  rawCount: number;
  totalSlides: number;
  slides: SlideItem[];
}

interface EventPhotoItem {
  photoId: string;
  thumbUrl: string;
  url: string;
}

export default function GuestGalleryPage({ params }: { params: { photoId: string } }) {
  const { photoId } = params;

  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [meta, setMeta] = useState<GalleryMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  // My Sessions History (Saved in localStorage on this device)
  const [mySessions, setMySessions] = useState<string[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Full Event Gallery Modal
  const [showFullGalleryModal, setShowFullGalleryModal] = useState(false);
  const [eventPhotos, setEventPhotos] = useState<EventPhotoItem[]>([]);
  const [loadingEventPhotos, setLoadingEventPhotos] = useState(false);

  // Touch Swipe Handling
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  useEffect(() => {
    // 1. Fetch Slides Metadata
    fetch(`/api/gallery/${photoId}?type=meta`)
      .then((res) => res.json())
      .then((data) => {
        if (data.slides && data.slides.length > 0) {
          setMeta(data);
        } else {
          // Fallback slides
          setMeta(buildFallbackMeta(photoId));
        }
      })
      .catch(() => {
        setMeta(buildFallbackMeta(photoId));
      })
      .finally(() => setLoading(false));

    // 2. Save this session into guest's local history
    try {
      const saved = localStorage.getItem('minglebooth_guest_history');
      let list: string[] = saved ? JSON.parse(saved) : [];
      if (!list.includes(photoId)) {
        list = [photoId, ...list];
        localStorage.setItem('minglebooth_guest_history', JSON.stringify(list));
      }
      setMySessions(list);
    } catch {}
  }, [photoId]);

  // Load Full Event Gallery Photos
  const handleOpenFullGallery = () => {
    setShowFullGalleryModal(true);
    if (eventPhotos.length === 0) {
      setLoadingEventPhotos(true);
      fetch('/api/gallery/event/evt_bayu_irma_2026')
        .then((res) => res.json())
        .then((data) => {
          if (data.photos) setEventPhotos(data.photos);
        })
        .catch((e) => console.warn('Event gallery fetch error:', e))
        .finally(() => setLoadingEventPhotos(false));
    }
  };

  const slides: SlideItem[] = meta?.slides || buildFallbackMeta(photoId).slides;
  const currentSlide = slides[currentSlideIndex] || slides[0];

  const handlePrev = () => {
    setCurrentSlideIndex((prev) => (prev > 0 ? prev - 1 : slides.length - 1));
  };

  const handleNext = () => {
    setCurrentSlideIndex((prev) => (prev < slides.length - 1 ? prev + 1 : 0));
  };

  // Touch handlers for mobile swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const diff = touchStartX.current - touchEndX.current;
    if (diff > 45) {
      // Swiped Left -> Next
      handleNext();
    } else if (diff < -45) {
      // Swiped Right -> Prev
      handlePrev();
    }
    touchStartX.current = null;
    touchEndX.current = null;
  };

  const handleCopyLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadActiveSlide = () => {
    const link = document.createElement('a');
    link.href = currentSlide.url;
    link.download = currentSlide.downloadName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 2500);
  };

  const handleDownloadAllMyFiles = async () => {
    // Download all slides in this session sequentially
    for (let i = 0; i < slides.length; i++) {
      const s = slides[i];
      const link = document.createElement('a');
      link.href = s.url;
      link.download = s.downloadName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      await new Promise((r) => setTimeout(r, 350));
    }
    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 2500);
  };

  return (
    <main className="min-h-screen bg-[#08090B] text-[#EDEDED] flex flex-col items-center justify-between p-3 sm:p-6 select-none font-sans antialiased overflow-x-hidden">
      {/* ── Top Event Branding Header ── */}
      <header className="w-full max-w-md flex flex-col items-center pt-2 pb-1 text-center">
        <div className="flex items-center gap-2 mb-1">
          <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono tracking-wider font-semibold">
            MINGLEBOOTH LIVE GALLERY
          </span>
        </div>
        <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">
          {meta?.eventName || 'Wedding Bayu & Irma'}
        </h1>
        <p className="text-[11px] text-neutral-400 mt-0.5">
          {meta?.dateFormatted || '29 August 2026'}
        </p>

        {/* My Sessions Quick Switcher Bar (if guest took photos multiple times) */}
        {mySessions.length > 1 && (
          <div className="mt-2.5 w-full flex items-center justify-center gap-1.5 overflow-x-auto no-scrollbar py-1">
            <span className="text-[10px] text-neutral-500 font-mono flex items-center gap-1 mr-1">
              <History className="w-3 h-3 text-neutral-400" /> Sesi Kamu:
            </span>
            {mySessions.map((id, idx) => (
              <a
                key={id}
                href={`/p/${id}`}
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono transition-colors ${
                  id === photoId
                    ? 'bg-white text-black font-bold shadow'
                    : 'bg-white/[0.06] text-neutral-300 hover:bg-white/[0.12]'
                }`}
              >
                Sesi #{mySessions.length - idx}
              </a>
            ))}
          </div>
        )}
      </header>

      {/* ── Center: Google Drive / Carousel Media Slider ── */}
      <section className="w-full max-w-md flex flex-col items-center my-auto py-2">
        {/* Slide Indicator Badge */}
        <div className="flex items-center justify-between w-full px-2 mb-2">
          <div className="flex items-center gap-1.5">
            {currentSlide.type === 'photo' && <Sparkles className="w-3.5 h-3.5 text-amber-400" />}
            {currentSlide.type === 'gif' && <Film className="w-3.5 h-3.5 text-emerald-400" />}
            {currentSlide.type === 'raw' && <Camera className="w-3.5 h-3.5 text-sky-400" />}
            <span className="text-xs font-semibold text-white tracking-tight">
              {currentSlide.title}
            </span>
          </div>

          <span className="text-[11px] font-mono text-neutral-400 bg-white/[0.06] px-2 py-0.5 rounded-md border border-white/[0.08]">
            {currentSlideIndex + 1} / {slides.length}
          </span>
        </div>

        {/* Media Frame Viewer with Swipe Gesture (Auto adapts to Landscape / Portrait / Square) */}
        <div
          className="relative w-full min-h-[300px] max-h-[60vh] rounded-2xl overflow-hidden shadow-2xl border border-white/[0.1] bg-[#111317] flex items-center justify-center touch-pan-y p-1"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <img
            key={currentSlide.url}
            src={currentSlide.url}
            alt={currentSlide.title}
            className="w-full max-h-[58vh] object-contain select-none animate-fadeIn rounded-xl"
          />

          {/* Left Arrow Button */}
          <button
            onClick={handlePrev}
            aria-label="Previous Slide"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 hover:bg-black/90 backdrop-blur-md text-white border border-white/15 flex items-center justify-center shadow-lg transition-transform active:scale-95"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Right Arrow Button */}
          <button
            onClick={handleNext}
            aria-label="Next Slide"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 hover:bg-black/90 backdrop-blur-md text-white border border-white/15 flex items-center justify-center shadow-lg transition-transform active:scale-95"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Carousel Dots & Subtitle */}
        <div className="flex flex-col items-center gap-2 mt-3 w-full">
          <div className="flex items-center gap-1.5">
            {slides.map((s, idx) => (
              <button
                key={s.id}
                onClick={() => setCurrentSlideIndex(idx)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === currentSlideIndex
                    ? 'w-6 bg-white'
                    : 'w-1.5 bg-white/30 hover:bg-white/50'
                }`}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>

          <p className="text-[11px] text-neutral-400 font-medium text-center">
            {currentSlide.subtitle} • <span className="text-neutral-500 font-normal">Geser layar untuk melihat lainnya</span>
          </p>
        </div>
      </section>

      {/* ── Bottom Actions & Event Discovery ── */}
      <footer className="w-full max-w-md flex flex-col gap-2 pb-3">
        {/* Primary Download Button for Active Slide */}
        <button
          onClick={handleDownloadActiveSlide}
          className="w-full h-11 rounded-xl bg-white hover:bg-neutral-200 text-black font-bold text-xs sm:text-sm shadow-lg flex items-center justify-center gap-2 active:scale-98 transition-all"
        >
          {downloadSuccess ? (
            <>
              <Check className="w-4 h-4 text-emerald-600" />
              <span>Berhasil Diunduh!</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              <span>Download {currentSlide.title}</span>
            </>
          )}
        </button>

        {/* Secondary: Download All My Package & Share */}
        <div className="flex gap-2">
          <button
            onClick={handleDownloadAllMyFiles}
            className="flex-1 h-10 rounded-lg bg-[#16181D] hover:bg-[#1E2127] border border-white/[0.08] text-xs font-semibold text-neutral-200 flex items-center justify-center gap-1.5 transition-colors"
          >
            <Layers className="w-3.5 h-3.5 text-neutral-400" />
            <span>Download Semua ({slides.length} File)</span>
          </button>

          <a
            href={`https://api.whatsapp.com/send?text=Lihat%20foto%20dan%20GIF%20saya%20di%20${encodeURIComponent(meta?.eventName || 'Wedding')}%3A%20${typeof window !== 'undefined' ? encodeURIComponent(window.location.href) : ''}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 h-10 rounded-lg bg-[#16181D] hover:bg-[#1E2127] border border-white/[0.08] text-xs font-semibold text-neutral-200 flex items-center justify-center gap-1.5 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>WhatsApp</span>
          </a>
        </div>

        {/* Bottom Helper: Browse Full Event Gallery */}
        <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-xs">
          <button
            onClick={handleOpenFullGallery}
            className="text-neutral-400 hover:text-white flex items-center gap-1.5 py-1 transition-colors text-[11px]"
          >
            <Grid className="w-3.5 h-3.5 text-neutral-400" />
            <span>Lihat Galeri Lengkap Acara Ini</span>
          </button>

          <button
            onClick={handleCopyLink}
            className="text-neutral-400 hover:text-white flex items-center gap-1 py-1 transition-colors text-[11px]"
          >
            <Copy className="w-3 h-3" />
            <span>{copied ? 'Tersalin!' : 'Salin Link'}</span>
          </button>
        </div>
      </footer>

      {/* ── Modal: Full Event Gallery Discovery ── */}
      {showFullGalleryModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col items-center justify-start p-4 animate-fadeIn">
          <div className="w-full max-w-lg bg-[#0F1115] border border-white/10 rounded-2xl p-4 sm:p-6 flex flex-col h-[85vh] max-h-[85vh] shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div>
                <h3 className="text-sm font-bold text-white">Galeri Lengkap Acara</h3>
                <p className="text-[11px] text-neutral-400">
                  Cari foto sesi Anda yang lain di acara ini
                </p>
              </div>
              <button
                onClick={() => setShowFullGalleryModal(false)}
                className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Photos Grid */}
            <div className="flex-1 overflow-y-auto py-4">
              {loadingEventPhotos ? (
                <div className="flex items-center justify-center h-48 text-neutral-400 text-xs font-mono">
                  Memuat foto acara...
                </div>
              ) : eventPhotos.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center gap-2 text-neutral-400 text-xs">
                  <Grid className="w-8 h-8 text-neutral-600" />
                  <span>Belum ada foto lain di galeri acara ini.</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {eventPhotos.map((item) => (
                    <a
                      key={item.photoId}
                      href={item.url}
                      className={`relative aspect-[4/5] rounded-lg overflow-hidden border transition-all ${
                        item.photoId === photoId
                          ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                          : 'border-white/[0.08] hover:border-white/30'
                      }`}
                    >
                      <img
                        src={item.thumbUrl}
                        alt="Event Photo"
                        className="w-full h-full object-cover"
                      />
                      {item.photoId === photoId && (
                        <div className="absolute top-1 right-1 bg-emerald-500 text-black text-[9px] font-bold px-1.5 py-0.5 rounded">
                          Sesi Ini
                        </div>
                      )}
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-white/[0.08] text-center">
              <button
                onClick={() => setShowFullGalleryModal(false)}
                className="w-full py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-semibold text-neutral-300 transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function buildFallbackMeta(photoId: string): GalleryMeta {
  return {
    photoId,
    eventName: 'Wedding Bayu & Irma',
    dateFormatted: '29 August 2026',
    hasGif: true,
    rawCount: 2,
    totalSlides: 4,
    slides: [
      {
        id: 'slide_photo',
        type: 'photo',
        title: 'Foto Berbingkai',
        subtitle: 'Hasil Cetak Siap Cetak HD',
        badge: 'HASIL CETAK',
        url: `/api/gallery/${photoId}?type=photo`,
        downloadName: `MingleBooth_Foto_${photoId}.jpg`,
      },
      {
        id: 'slide_gif',
        type: 'gif',
        title: 'Animasi GIF',
        subtitle: 'Boomerang dengan Bingkai Khusus',
        badge: 'ANIMASI GIF',
        url: `/api/gallery/${photoId}?type=gif`,
        downloadName: `MingleBooth_Animasi_${photoId}.gif`,
      },
      {
        id: 'slide_raw_1',
        type: 'raw',
        title: 'Foto Original #1',
        subtitle: 'Jepretan Mentah Pose 1',
        badge: 'POSE #1',
        url: `/api/gallery/${photoId}?type=raw&index=1`,
        downloadName: `MingleBooth_Original_Pose1_${photoId}.jpg`,
      },
      {
        id: 'slide_raw_2',
        type: 'raw',
        title: 'Foto Original #2',
        subtitle: 'Jepretan Mentah Pose 2',
        badge: 'POSE #2',
        url: `/api/gallery/${photoId}?type=raw&index=2`,
        downloadName: `MingleBooth_Original_Pose2_${photoId}.jpg`,
      },
    ],
  };
}
