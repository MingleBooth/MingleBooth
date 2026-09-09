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

    let isMounted = true;
    let pollCount = 0;
    const maxPolls = 4;
    let timer: NodeJS.Timeout | null = null;

    const fetchMeta = () => {
      fetch(`/api/gallery/${photoId}?type=meta`)
        .then((res) => res.json())
        .then((data) => {
          if (!isMounted) return;
          if (data.slides && data.slides.length > 0) {
            setMeta(data);
            // If GIF not ready yet, poll up to 4 times
            if (!data.hasGif && pollCount < maxPolls) {
              pollCount++;
              timer = setTimeout(fetchMeta, 2500);
            }
          } else {
            setMeta(buildFallbackMeta(photoId));
          }
        })
        .catch(() => {
          if (isMounted) setMeta(buildFallbackMeta(photoId));
        })
        .finally(() => {
          if (isMounted) setLoading(false);
        });
    };

    fetchMeta();

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

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
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
    <main className="min-h-screen bg-[#050505] text-[#FAFAFA] flex flex-col items-center justify-between p-4 sm:p-8 select-none font-sans antialiased overflow-x-hidden">
      {/* ── Top Event Branding Header (Zara / Uniqlo DNA) ── */}
      <header className="w-full max-w-md flex flex-col items-center pt-2 pb-3 text-center border-b border-neutral-900">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-white" />
          <span className="text-[10px] font-mono tracking-[0.25em] text-neutral-400 uppercase">
            MingleBooth / Archive
          </span>
        </div>

        {loading ? (
          <div className="flex flex-col items-center py-2 gap-2">
            <div className="h-6 w-48 bg-neutral-900 rounded animate-pulse" />
            <div className="h-3 w-28 bg-neutral-900 rounded animate-pulse" />
          </div>
        ) : (
          <>
            <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-tight uppercase px-2 leading-tight">
              {meta?.eventName || 'Acara Photobooth'}
            </h1>
            {meta?.dateFormatted && (
              <p className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider mt-1">
                {meta.dateFormatted}
              </p>
            )}
          </>
        )}

        {/* My Sessions Quick Switcher Bar */}
        {mySessions.length > 1 && (
          <div className="mt-3 w-full flex items-center justify-center gap-1.5 overflow-x-auto no-scrollbar py-1">
            <span className="text-[10px] text-neutral-500 font-mono tracking-wider uppercase mr-1 shrink-0">
              Sesi Anda:
            </span>
            {mySessions.map((id, idx) => (
              <a
                key={id}
                href={`/p/${id}`}
                className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors shrink-0 ${
                  id === photoId
                    ? 'bg-white text-black font-bold'
                    : 'border border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-600'
                }`}
              >
                #{mySessions.length - idx}
              </a>
            ))}
          </div>
        )}
      </header>

      {/* ── Center: Media Exhibition Viewer ── */}
      <section className="w-full max-w-md flex flex-col items-center my-auto py-3">
        {/* Minimalist Segmented Tab Switcher */}
        {slides.length > 1 && (
          <div className="w-full flex items-center justify-center gap-1 mb-3 overflow-x-auto no-scrollbar p-1 border border-neutral-900 bg-black rounded-lg">
            {slides.map((s, idx) => {
              const isActive = idx === currentSlideIndex;
              return (
                <button
                  key={s.id}
                  onClick={() => setCurrentSlideIndex(idx)}
                  className={`flex-1 py-1.5 px-3 rounded text-[10px] font-medium uppercase tracking-[0.15em] transition-all whitespace-nowrap text-center ${
                    isActive
                      ? 'bg-white text-black font-bold shadow-sm'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {s.type === 'gif' ? 'Animasi GIF' : s.type === 'photo' ? 'Foto Berbingkai' : `Pose ${s.id.replace('slide_raw_', '')}`}
                </button>
              );
            })}
          </div>
        )}

        {/* Media Frame Container */}
        <div
          className="relative w-full h-[50vh] sm:h-[54vh] max-h-[520px] min-h-[300px] rounded-lg overflow-hidden border border-neutral-900 bg-black flex items-center justify-center touch-pan-y p-2"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 text-neutral-500">
              <div className="w-5 h-5 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
              <span className="text-[10px] uppercase tracking-widest font-mono">Memuat...</span>
            </div>
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={currentSlide.url}
                src={currentSlide.url}
                alt={currentSlide.title}
                className="max-h-full max-w-full w-auto h-auto object-contain select-none mx-auto filter drop-shadow-2xl"
              />

              {/* Left Arrow */}
              {slides.length > 1 && (
                <button
                  onClick={handlePrev}
                  aria-label="Previous Slide"
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/80 hover:bg-black text-white border border-neutral-800 flex items-center justify-center shadow-lg transition-transform active:scale-95"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}

              {/* Right Arrow */}
              {slides.length > 1 && (
                <button
                  onClick={handleNext}
                  aria-label="Next Slide"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/80 hover:bg-black text-white border border-neutral-800 flex items-center justify-center shadow-lg transition-transform active:scale-95"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>

        {/* Carousel Indicator Dots & Subtitle */}
        {slides.length > 1 && (
          <div className="flex flex-col items-center gap-1.5 mt-3 w-full">
            <div className="flex items-center gap-1.5">
              {slides.map((s, idx) => (
                <button
                  key={s.id}
                  onClick={() => setCurrentSlideIndex(idx)}
                  className={`h-1 transition-all duration-300 ${
                    idx === currentSlideIndex
                      ? 'w-6 bg-white'
                      : 'w-2 bg-neutral-700 hover:bg-neutral-500'
                  }`}
                  aria-label={`Lihat item ${idx + 1}`}
                />
              ))}
            </div>
            <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-neutral-500 text-center">
              Geser untuk melihat pose lain
            </p>
          </div>
        )}
      </section>

      {/* ── Bottom Actions (Zara / Uniqlo High-Contrast) ── */}
      <footer className="w-full max-w-md flex flex-col gap-2.5 pt-2 pb-4">
        {/* Primary High-Contrast Download Button */}
        <button
          onClick={handleDownloadActiveSlide}
          className="w-full h-12 bg-white hover:bg-neutral-200 text-black font-bold text-xs uppercase tracking-[0.15em] rounded-lg shadow-xl flex items-center justify-center gap-2 active:scale-[0.99] transition-all"
        >
          {downloadSuccess ? (
            <>
              <Check className="w-4 h-4 text-black" />
              <span>Berhasil Diunduh</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4 text-black" />
              <span>
                Unduh{' '}
                {currentSlide.type === 'gif'
                  ? 'Animasi GIF (.gif)'
                  : currentSlide.type === 'raw'
                  ? `Pose ${currentSlide.id.replace('slide_raw_', '')} (.jpg)`
                  : 'Foto Berbingkai (.jpg)'}
              </span>
            </>
          )}
        </button>

        {/* Secondary Action Row */}
        <div className="flex gap-2">
          {slides.length > 1 && (
            <button
              onClick={handleDownloadAllMyFiles}
              className="flex-1 h-10 border border-neutral-800 hover:border-white text-[11px] uppercase tracking-wider font-semibold text-neutral-300 hover:text-white rounded-lg flex items-center justify-center gap-1.5 transition-colors"
            >
              <Layers className="w-3.5 h-3.5 text-neutral-400" />
              <span>Semua File ({slides.length})</span>
            </button>
          )}

          <a
            href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
              `Lihat foto saya di ${meta?.eventName || 'MingleBooth'}: `
            )}${typeof window !== 'undefined' ? encodeURIComponent(window.location.href) : ''}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 h-10 border border-neutral-800 hover:border-white text-[11px] uppercase tracking-wider font-semibold text-neutral-300 hover:text-white rounded-lg flex items-center justify-center gap-1.5 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5 text-neutral-300" />
            <span>WhatsApp</span>
          </a>

          <button
            onClick={handleCopyLink}
            className="px-4 h-10 border border-neutral-800 hover:border-white text-[11px] uppercase tracking-wider font-semibold text-neutral-300 hover:text-white rounded-lg flex items-center justify-center gap-1.5 transition-colors"
            title="Salin tautan foto"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5 text-neutral-400" />}
            <span>{copied ? 'Disalin' : 'Salin'}</span>
          </button>
        </div>

        {/* Browse Entire Event Album Link */}
        <div className="pt-2 border-t border-neutral-900 flex items-center justify-center">
          {meta?.eventId ? (
            <Link
              href={`/gallery/${meta.eventId}`}
              className="text-neutral-400 hover:text-white flex items-center gap-1.5 py-1 transition-colors text-[11px] uppercase tracking-[0.15em]"
            >
              <span>Lihat Seluruh Galeri Acara</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          ) : (
            <button
              onClick={handleOpenFullGallery}
              className="text-neutral-400 hover:text-white flex items-center gap-1.5 py-1 transition-colors text-[11px] uppercase tracking-[0.15em]"
            >
              <span>Lihat Seluruh Galeri Acara</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </footer>

      {/* ── Minimalist Full Event Gallery Modal ── */}
      {showFullGalleryModal && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col items-center justify-start p-4 animate-fadeIn">
          <div className="w-full max-w-lg bg-[#0A0A0A] border border-neutral-800 rounded-xl p-4 sm:p-6 flex flex-col h-[85vh] max-h-[85vh] shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-900">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-white">Galeri Lengkap Acara</h3>
                <p className="text-[10px] uppercase tracking-wider text-neutral-500">
                  Arsip foto seluruh tamu
                </p>
              </div>
              <button
                onClick={() => setShowFullGalleryModal(false)}
                className="w-7 h-7 rounded-full border border-neutral-800 flex items-center justify-center text-neutral-400 hover:text-white hover:border-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Photos Grid */}
            <div className="flex-1 overflow-y-auto py-4">
              {loadingEventPhotos ? (
                <div className="flex items-center justify-center h-48 text-neutral-500 text-[11px] font-mono uppercase tracking-wider">
                  Memuat foto acara...
                </div>
              ) : eventPhotos.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center gap-2 text-neutral-500 text-xs">
                  <Grid className="w-6 h-6 text-neutral-700" />
                  <span className="text-[10px] uppercase tracking-widest">Belum ada foto lain di galeri ini.</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {eventPhotos.map((item) => (
                    <a
                      key={item.photoId}
                      href={item.url}
                      className={`relative aspect-[2/3] overflow-hidden border transition-all ${
                        item.photoId === photoId
                          ? 'border-white ring-1 ring-white'
                          : 'border-neutral-900 hover:border-neutral-600'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.thumbUrl}
                        alt="Event Photo"
                        className="w-full h-full object-cover"
                      />
                      {item.photoId === photoId && (
                        <div className="absolute top-1 right-1 bg-white text-black text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5">
                          Sesi Ini
                        </div>
                      )}
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-neutral-900 text-center">
              <button
                onClick={() => setShowFullGalleryModal(false)}
                className="w-full py-2 border border-neutral-800 text-[10px] uppercase tracking-[0.15em] font-semibold text-neutral-300 hover:text-white transition-colors"
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
        title: 'Foto Berbingkai',
        subtitle: 'Hasil Cetak Siap HD',
        badge: 'FOTO BERBINGKAI',
        url: `/api/gallery/${photoId}?type=photo`,
        downloadName: `MingleBooth_Foto_${photoId}.jpg`,
      },
    ],
  };
}
