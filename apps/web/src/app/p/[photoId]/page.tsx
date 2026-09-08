'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  ArrowRight,
  X,
  Loader2,
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
  eventId?: string | null;
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

  const router = useRouter();

  useEffect(() => {
    // If photoId is an event ID, redirect to full event album gallery
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(photoId);
    if (isUuid || photoId.startsWith('evt_') || photoId === 'bayu-irma-wedding') {
      router.replace(`/gallery/${photoId}`);
      return;
    }

    // 1. Fetch Slides Metadata
    fetch(`/api/gallery/${photoId}?type=meta`)
      .then((res) => res.json())
      .then((data) => {
        if (data.slides && data.slides.length > 0) {
          setMeta(data);
        } else {
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
  }, [photoId, router]);

  // Load Full Event Gallery Photos
  const handleOpenFullGallery = () => {
    if (meta?.eventId) {
      router.push(`/gallery/${meta.eventId}`);
      return;
    }
    setShowFullGalleryModal(true);
    if (eventPhotos.length === 0) {
      setLoadingEventPhotos(true);
      fetch(`/api/gallery/event/live`)
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
      handleNext();
    } else if (diff < -45) {
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
    <main className="min-h-screen bg-[#07080A] text-[#EDEDED] flex flex-col items-center justify-between p-3.5 sm:p-6 select-none font-sans antialiased overflow-x-hidden">
      {/* ── Top Event Branding Header ── */}
      <header className="w-full max-w-md flex flex-col items-center pt-2 pb-2 text-center">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] font-mono tracking-widest text-neutral-400 font-medium uppercase">
            MingleBooth Gallery
          </span>
        </div>

        {loading ? (
          <div className="flex flex-col items-center py-1 gap-1.5">
            <div className="h-5 w-44 bg-white/10 rounded-md animate-pulse" />
            <div className="h-3 w-28 bg-white/5 rounded-md animate-pulse" />
          </div>
        ) : (
          <>
            <h1 className="text-base sm:text-lg font-semibold text-white tracking-tight px-2">
              {meta?.eventName || 'Acara Photobooth'}
            </h1>
            {meta?.dateFormatted && (
              <p className="text-[11px] text-neutral-400 mt-0.5">
                {meta.dateFormatted}
              </p>
            )}
          </>
        )}

        {/* My Sessions Quick Switcher Bar (if guest took photos multiple times on this device) */}
        {mySessions.length > 1 && (
          <div className="mt-2.5 w-full flex items-center justify-center gap-1.5 overflow-x-auto no-scrollbar py-1">
            <span className="text-[10px] text-neutral-500 font-mono flex items-center gap-1 mr-0.5 shrink-0">
              <History className="w-3 h-3 text-neutral-400" /> Sesi:
            </span>
            {mySessions.map((id, idx) => (
              <a
                key={id}
                href={`/p/${id}`}
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono transition-colors shrink-0 ${
                  id === photoId
                    ? 'bg-white text-black font-semibold shadow'
                    : 'bg-white/[0.06] text-neutral-400 hover:bg-white/[0.12] hover:text-white'
                }`}
              >
                #{mySessions.length - idx}
              </a>
            ))}
          </div>
        )}
      </header>

      {/* ── Center: Photo / Media Viewer ── */}
      <section className="w-full max-w-md flex flex-col items-center my-auto py-1">
        {/* Segmented Tab Switcher (Foto Cetak / GIF / Pose Asli) */}
        {slides.length > 1 && (
          <div className="w-full flex items-center justify-center gap-1 mb-2.5 overflow-x-auto no-scrollbar px-1">
            {slides.map((s, idx) => {
              const isActive = idx === currentSlideIndex;
              return (
                <button
                  key={s.id}
                  onClick={() => setCurrentSlideIndex(idx)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 ${
                    isActive
                      ? 'bg-white text-black shadow-md font-semibold'
                      : 'bg-white/[0.06] text-neutral-400 hover:text-white hover:bg-white/[0.1]'
                  }`}
                >
                  {s.type === 'photo' && <Sparkles className={`w-3 h-3 ${isActive ? 'text-amber-600' : 'text-amber-400'}`} />}
                  {s.type === 'gif' && <Film className={`w-3 h-3 ${isActive ? 'text-emerald-600' : 'text-emerald-400'}`} />}
                  {s.type === 'raw' && <Camera className={`w-3 h-3 ${isActive ? 'text-sky-600' : 'text-sky-400'}`} />}
                  <span>{s.title}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Media Frame Container (Auto-centered, clean aspect ratio, no awkward stretch) */}
        <div
          className="relative w-full h-[50vh] sm:h-[54vh] max-h-[520px] min-h-[300px] rounded-2xl overflow-hidden shadow-2xl border border-white/[0.08] bg-[#111317]/90 backdrop-blur-sm flex items-center justify-center touch-pan-y p-2"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 text-neutral-500">
              <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
              <span className="text-xs font-mono">Memuat foto...</span>
            </div>
          ) : (
            <>
              <img
                key={currentSlide.url}
                src={currentSlide.url}
                alt={currentSlide.title}
                className="max-h-full max-w-full w-auto h-auto object-contain select-none rounded-xl mx-auto shadow-sm"
              />

              {/* Left Arrow (Only if multiple slides) */}
              {slides.length > 1 && (
                <button
                  onClick={handlePrev}
                  aria-label="Previous Slide"
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 hover:bg-black/90 backdrop-blur-md text-white border border-white/15 flex items-center justify-center shadow-lg transition-transform active:scale-95"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}

              {/* Right Arrow (Only if multiple slides) */}
              {slides.length > 1 && (
                <button
                  onClick={handleNext}
                  aria-label="Next Slide"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 hover:bg-black/90 backdrop-blur-md text-white border border-white/15 flex items-center justify-center shadow-lg transition-transform active:scale-95"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>

        {/* Carousel Indicator Dots & Subtitle */}
        {slides.length > 1 && (
          <div className="flex flex-col items-center gap-1.5 mt-2.5 w-full">
            <div className="flex items-center gap-1.5">
              {slides.map((s, idx) => (
                <button
                  key={s.id}
                  onClick={() => setCurrentSlideIndex(idx)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    idx === currentSlideIndex
                      ? 'w-5 bg-white'
                      : 'w-1.5 bg-white/30 hover:bg-white/50'
                  }`}
                  aria-label={`Lihat item ${idx + 1}`}
                />
              ))}
            </div>
            <p className="text-[11px] text-neutral-400 font-medium text-center">
              {currentSlide.subtitle} • <span className="text-neutral-500">Geser untuk ganti</span>
            </p>
          </div>
        )}
      </section>

      {/* ── Bottom Actions & Event Discovery ── */}
      <footer className="w-full max-w-md flex flex-col gap-2 pt-2 pb-3">
        {/* Primary Download Button for Active Item */}
        <button
          onClick={handleDownloadActiveSlide}
          className="w-full h-11 rounded-xl bg-white hover:bg-neutral-100 text-black font-semibold text-xs sm:text-sm shadow-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
        >
          {downloadSuccess ? (
            <>
              <Check className="w-4 h-4 text-emerald-600" />
              <span>Berhasil Diunduh!</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4 text-black" />
              <span>Unduh {currentSlide.title} (HD)</span>
            </>
          )}
        </button>

        {/* Secondary Actions */}
        <div className="flex gap-2">
          {slides.length > 1 && (
            <button
              onClick={handleDownloadAllMyFiles}
              className="flex-1 h-10 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-neutral-200 flex items-center justify-center gap-1.5 transition-colors"
            >
              <Layers className="w-3.5 h-3.5 text-neutral-400" />
              <span>Semua File ({slides.length})</span>
            </button>
          )}

          <a
            href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`Lihat foto saya di ${meta?.eventName || 'MingleBooth'}: `)}${typeof window !== 'undefined' ? encodeURIComponent(window.location.href) : ''}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 h-10 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-neutral-200 flex items-center justify-center gap-1.5 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>WhatsApp</span>
          </a>

          <button
            onClick={handleCopyLink}
            className="px-3.5 h-10 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-neutral-200 flex items-center justify-center gap-1.5 transition-colors"
            title="Salin tautan foto"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-neutral-400" />}
            <span>{copied ? 'Disalin' : 'Salin'}</span>
          </button>
        </div>

        {/* Browse Entire Event Album Link */}
        <div className="pt-2 border-t border-white/[0.06] flex items-center justify-center text-xs">
          {meta?.eventId ? (
            <Link
              href={`/gallery/${meta.eventId}`}
              className="text-neutral-400 hover:text-white flex items-center gap-1.5 py-1 transition-colors text-[11px]"
            >
              <Grid className="w-3.5 h-3.5 text-neutral-400" />
              <span>Lihat Galeri Lengkap Seluruh Acara</span>
              <ArrowRight className="w-3 h-3 text-neutral-400" />
            </Link>
          ) : (
            <button
              onClick={handleOpenFullGallery}
              className="text-neutral-400 hover:text-white flex items-center gap-1.5 py-1 transition-colors text-[11px]"
            >
              <Grid className="w-3.5 h-3.5 text-neutral-400" />
              <span>Lihat Galeri Lengkap Seluruh Acara</span>
              <ArrowRight className="w-3 h-3 text-neutral-400" />
            </button>
          )}
        </div>
      </footer>

      {/* ── Fallback Modal: Full Event Gallery Discovery ── */}
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
    eventName: 'Acara Photobooth',
    dateFormatted: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
    hasGif: false,
    rawCount: 0,
    totalSlides: 1,
    slides: [
      {
        id: 'slide_photo',
        type: 'photo',
        title: 'Foto Cetak',
        subtitle: 'Hasil Cetak Siap HD',
        badge: 'FOTO CETAK',
        url: `/api/gallery/${photoId}?type=photo`,
        downloadName: `MingleBooth_Foto_${photoId}.jpg`,
      },
    ],
  };
}
