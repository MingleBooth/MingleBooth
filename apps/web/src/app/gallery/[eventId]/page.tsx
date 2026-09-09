'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Download,
  Share2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Camera,
  Layers,
  Search,
  Check,
  ExternalLink,
  X,
  ArrowLeft,
  ArrowRight,
  Filter,
  Eye,
  Copy,
  FolderDown,
  Film,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

interface RawShot {
  index: number;
  url: string;
}

interface PhotoItem {
  photoId: string;
  thumbUrl: string;
  fullUrl: string;
  gifUrl: string | null;
  hasGif: boolean;
  rawShots?: RawShot[];
  url: string;
  createdAt: string;
}

interface EventGalleryData {
  success: boolean;
  eventId: string;
  eventName: string;
  eventDate: string;
  totalPhotos: number;
  photos: PhotoItem[];
}

export default function EventGalleryPage({ params }: { params: { eventId: string } }) {
  const { eventId } = params;
  const router = useRouter();
  const searchParams = useSearchParams();
  const photoParam = searchParams.get('p');

  // Guest Personal Photo Spotlight (opened immediately on QR scan, dismissible to reveal full event gallery)
  const [spotlightPhotoId, setSpotlightPhotoId] = useState<string | null>(photoParam || null);

  useEffect(() => {
    if (photoParam) {
      setSpotlightPhotoId(photoParam);
    }
  }, [photoParam]);

  const [data, setData] = useState<EventGalleryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search: 'all' | 'photo' | 'gif' | 'raw'
  const [activeFilter, setActiveFilter] = useState<'all' | 'photo' | 'gif' | 'raw'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);

  // Lightbox Modal
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoItem | null>(null);
  const [lightboxTab, setLightboxTab] = useState<string>('photo'); // 'photo' | 'gif' | 'raw_1' | 'raw_2' ...

  // Dynamic verified metadata map (ensures GIF & raw shots are detected even if event list was slightly lagging)
  const [photoMetaMap, setPhotoMetaMap] = useState<
    Record<string, { hasGif: boolean; gifUrl?: string; rawShots?: RawShot[] }>
  >({});

  const activePhotoId = selectedPhoto?.photoId || spotlightPhotoId;

  // Realtime check & short polling for active photo's GIF
  useEffect(() => {
    if (!activePhotoId) return;

    let isMounted = true;
    let pollCount = 0;
    const maxPolls = 4;
    let timer: NodeJS.Timeout | null = null;

    const checkMeta = async () => {
      try {
        const res = await fetch(`/api/gallery/${activePhotoId}?type=meta`);
        const json = await res.json();
        if (!isMounted) return;

        if (json.success) {
          const rawShots: RawShot[] = [];
          for (let i = 1; i <= (json.rawCount || 0); i++) {
            rawShots.push({ index: i, url: `/api/gallery/${activePhotoId}?type=raw&index=${i}` });
          }

          setPhotoMetaMap((prev) => ({
            ...prev,
            [activePhotoId]: {
              hasGif: Boolean(json.hasGif),
              gifUrl: json.hasGif ? `/api/gallery/${activePhotoId}?type=gif` : undefined,
              rawShots: rawShots.length > 0 ? rawShots : undefined,
            },
          }));

          // If GIF not found yet and this is a fresh guest scan (?p=...), poll up to 4 times
          if (!json.hasGif && pollCount < maxPolls && photoParam === activePhotoId) {
            pollCount++;
            timer = setTimeout(checkMeta, 2500);
          }
        }
      } catch (err) {
        console.warn('Meta verification warning:', err);
      }
    };

    checkMeta();

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [activePhotoId, photoParam]);

  // Resolved active photo in modal (with real-time verified metadata)
  const activeModalPhoto = useMemo<PhotoItem | null>(() => {
    const targetId = selectedPhoto?.photoId || spotlightPhotoId;
    if (!targetId) return null;

    const found = data?.photos?.find((p) => p.photoId === targetId);
    const metaOverride = photoMetaMap[targetId];

    const hasGif = metaOverride?.hasGif ?? found?.hasGif ?? false;
    const gifUrl = metaOverride?.gifUrl || found?.gifUrl || (hasGif ? `/api/gallery/${targetId}?type=gif` : null);
    const rawShots = metaOverride?.rawShots || found?.rawShots || [
      { index: 1, url: `/api/gallery/${targetId}?type=raw&index=1` },
      { index: 2, url: `/api/gallery/${targetId}?type=raw&index=2` },
    ];

    if (found) {
      return {
        ...found,
        hasGif,
        gifUrl,
        rawShots,
      };
    }

    return {
      photoId: targetId,
      thumbUrl: `/api/gallery/${targetId}?type=photo`,
      fullUrl: `/api/gallery/${targetId}?type=photo`,
      gifUrl: hasGif ? `/api/gallery/${targetId}?type=gif` : null,
      hasGif,
      url: `/api/gallery/${targetId}?type=photo`,
      createdAt: new Date().toISOString(),
      rawShots,
    };
  }, [selectedPhoto, spotlightPhotoId, data?.photos, photoMetaMap]);

  const handleCloseLightbox = () => {
    setSelectedPhoto(null);
    setSpotlightPhotoId(null);
    if (typeof window !== 'undefined' && window.location.search.includes('p=')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('p');
      window.history.replaceState(null, '', url.pathname + (url.search || ''));
    }
  };

  useEffect(() => {
    fetchGalleryData();
  }, [eventId]);

  const fetchGalleryData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/gallery/event/${eventId}`);
      const json = await res.json();
      if (json.success) {
        setData(json);
      } else {
        setError(json.error || 'Gagal memuat galeri acara');
      }
    } catch (err: any) {
      setError(err?.message || 'Koneksi ke server gagal');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyShareLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleDownloadZip = () => {
    if (isDownloadingZip) return;
    setIsDownloadingZip(true);
    try {
      const link = document.createElement('a');
      link.href = `/api/gallery/event/${eventId}/download-zip`;
      link.download = `MingleBooth_${(data?.eventName || 'Acara').replace(/[^a-zA-Z0-9_-]/g, '_')}_Arsip.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => {
        setIsDownloadingZip(false);
      }, 4000);
    } catch (err) {
      console.error('Error triggering ZIP download:', err);
      setIsDownloadingZip(false);
    }
  };

  const totalGifsCount = useMemo(() => {
    return data?.photos.filter((p) => p.hasGif || photoMetaMap[p.photoId]?.hasGif).length || 0;
  }, [data?.photos, photoMetaMap]);

  const totalRawCount = useMemo(() => {
    return data?.photos.reduce((sum, p) => sum + (p.rawShots?.length || 0), 0) || 0;
  }, [data?.photos]);

  const filteredPhotos = useMemo(() => {
    if (!data?.photos) return [];
    return data.photos.filter((p) => {
      const hasGif = p.hasGif || photoMetaMap[p.photoId]?.hasGif;
      if (activeFilter === 'gif' && !hasGif) return false;
      if (activeFilter === 'raw' && (!p.rawShots || p.rawShots.length === 0)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        if (!p.photoId.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [data?.photos, activeFilter, searchQuery, photoMetaMap]);

  const handleDownload = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Helper to get active preview image in Lightbox
  const getLightboxPreviewUrl = (photo: PhotoItem, tab: string) => {
    if (tab === 'gif' && photo.gifUrl) return photo.gifUrl;
    if (tab.startsWith('raw_')) {
      const idx = parseInt(tab.replace('raw_', ''), 10) || 1;
      const matched = photo.rawShots?.find((r) => r.index === idx);
      return matched ? matched.url : `/api/gallery/${photo.photoId}?type=raw&index=${idx}`;
    }
    return photo.fullUrl;
  };

  return (
    <div className="min-h-screen bg-[#050505] text-[#FAFAFA] flex flex-col font-sans select-none antialiased">
      {/* ── Top Minimalist Header (Zara / Uniqlo DNA) ── */}
      <header className="h-16 px-4 sm:px-8 border-b border-neutral-900 flex items-center justify-between bg-[#050505]/95 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="h-8 px-2.5 rounded border border-neutral-800 hover:border-neutral-500 text-neutral-400 hover:text-white text-[11px] uppercase tracking-wider font-medium flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Kembali</span>
          </Link>
          <div className="h-4 w-px bg-neutral-800 hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-white">
              MingleBooth
            </span>
            <span className="text-[10px] text-neutral-500 uppercase tracking-[0.15em] hidden sm:inline">
              / Archive
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyShareLink}
            className="h-8 px-3 rounded border border-neutral-800 hover:border-neutral-500 text-[11px] uppercase tracking-wider font-medium text-neutral-300 hover:text-white flex items-center gap-1.5 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-white" />
                <span className="text-white font-semibold">Tersalin</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5 text-neutral-400" />
                <span>Bagikan</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* ── Main Container ── */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-8 sm:py-12 flex flex-col gap-8">
        {/* Editorial Event Banner */}
        <section className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-neutral-900">
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-neutral-500">
              Galeri Resmi Acara
            </span>
            <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight uppercase leading-tight">
              {loading ? (
                <span className="inline-block w-64 h-9 bg-neutral-900 rounded animate-pulse" />
              ) : (
                data?.eventName || 'Galeri Photobooth'
              )}
            </h1>
            <p className="text-xs text-neutral-400 tracking-wider uppercase mt-1">
              {data?.eventDate || ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
            {/* Minimalist Stats */}
            <div className="flex items-center gap-4 py-2 px-3 border border-neutral-800 rounded text-[11px] font-mono text-neutral-400 tracking-wider uppercase">
              <div>
                <span className="text-white font-bold">{data?.totalPhotos || 0}</span> FOTO
              </div>
              <span className="text-neutral-700">/</span>
              <div>
                <span className="text-white font-bold">{totalGifsCount}</span> GIF
              </div>
              <span className="text-neutral-700">/</span>
              <div>
                <span className="text-white font-bold">{totalRawCount}</span> POSE
              </div>
            </div>

            <button
              onClick={handleDownloadZip}
              disabled={isDownloadingZip}
              className="h-9 px-4 rounded bg-white hover:bg-neutral-200 text-black text-[11px] font-bold tracking-[0.15em] uppercase flex items-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
              title="Unduh seluruh arsip foto & animasi dalam format ZIP"
            >
              {isDownloadingZip ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  <span>Mengompres...</span>
                </>
              ) : (
                <>
                  <FolderDown className="w-3.5 h-3.5" />
                  <span>Unduh ZIP</span>
                </>
              )}
            </button>
          </div>
        </section>

        {/* Filters & Search Toolbar (Minimalist Monochrome) */}
        <section className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          {/* Search Box */}
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="CARI ID FOTO..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-8 pr-7 bg-transparent border border-neutral-800 focus:border-white rounded text-[11px] uppercase tracking-wider text-white placeholder:text-neutral-600 outline-none transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Minimalist Monochrome Filter Tabs */}
          <div className="flex items-center overflow-x-auto no-scrollbar gap-1 border border-neutral-800 p-1 rounded">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1 text-[10px] font-medium tracking-[0.2em] uppercase rounded transition-all whitespace-nowrap ${
                activeFilter === 'all'
                  ? 'bg-white text-black font-semibold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Semua ({data?.photos.length || 0})
            </button>
            <button
              onClick={() => setActiveFilter('photo')}
              className={`px-3 py-1 text-[10px] font-medium tracking-[0.2em] uppercase rounded transition-all whitespace-nowrap ${
                activeFilter === 'photo'
                  ? 'bg-white text-black font-semibold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Foto Berbingkai
            </button>
            <button
              onClick={() => setActiveFilter('gif')}
              className={`px-3 py-1 text-[10px] font-medium tracking-[0.2em] uppercase rounded transition-all whitespace-nowrap ${
                activeFilter === 'gif'
                  ? 'bg-white text-black font-semibold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Animasi GIF ({totalGifsCount})
            </button>
            <button
              onClick={() => setActiveFilter('raw')}
              className={`px-3 py-1 text-[10px] font-medium tracking-[0.2em] uppercase rounded transition-all whitespace-nowrap ${
                activeFilter === 'raw'
                  ? 'bg-white text-black font-semibold'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Pose Original ({totalRawCount})
            </button>
          </div>
        </section>

        {/* Gallery Grid (Zara Lookbook Minimalist Layout) */}
        {loading ? (
          <div className="py-24 text-center text-[11px] uppercase tracking-[0.2em] text-neutral-500 font-mono flex flex-col items-center justify-center gap-3">
            <div className="w-5 h-5 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
            <span>Memuat Arsip Foto...</span>
          </div>
        ) : error ? (
          <div className="py-12 border border-neutral-800 text-center text-neutral-400 text-xs tracking-wider uppercase">
            {error}
          </div>
        ) : filteredPhotos.length === 0 ? (
          <div className="py-24 border border-dashed border-neutral-800 text-center flex flex-col items-center justify-center gap-2">
            <span className="text-xs uppercase tracking-[0.2em] text-neutral-400">
              Belum ada foto tersimpan
            </span>
            <span className="text-[10px] uppercase tracking-wider text-neutral-600">
              Foto yang diambil dari booth akan tampil otomatis di sini
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4 items-start">
            {filteredPhotos.map((photo) => {
              const isThisGuestPhoto = photo.photoId === photoParam || photo.photoId === spotlightPhotoId;
              const hasGif = photo.hasGif || photoMetaMap[photo.photoId]?.hasGif;
              const thumbSrc =
                activeFilter === 'raw' && photo.rawShots && photo.rawShots.length > 0
                  ? photo.rawShots[0].url
                  : activeFilter === 'gif' && (photo.gifUrl || photoMetaMap[photo.photoId]?.gifUrl)
                  ? photo.gifUrl || photoMetaMap[photo.photoId]?.gifUrl || photo.thumbUrl
                  : photo.thumbUrl;

              return (
                <div
                  key={photo.photoId}
                  onClick={() => {
                    setSelectedPhoto(photo);
                    setSpotlightPhotoId(null);
                    if (activeFilter === 'gif' && hasGif) {
                      setLightboxTab('gif');
                    } else if (activeFilter === 'raw' && photo.rawShots && photo.rawShots.length > 0) {
                      setLightboxTab(`raw_${photo.rawShots[0].index}`);
                    } else {
                      setLightboxTab('photo');
                    }
                  }}
                  className={`group relative border overflow-hidden cursor-pointer transition-all flex flex-col self-start ${
                    isThisGuestPhoto
                      ? 'border-white ring-1 ring-white'
                      : 'border-neutral-900 hover:border-neutral-600'
                  }`}
                >
                  {/* Photo Visual Frame */}
                  <div className="w-full aspect-[2/3] bg-black relative flex items-center justify-center overflow-hidden">
                    {isThisGuestPhoto && (
                      <div className="absolute top-2 left-2 z-10 px-2 py-0.5 bg-white text-black text-[9px] font-bold uppercase tracking-[0.15em]">
                        Foto Anda
                      </div>
                    )}

                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumbSrc}
                      alt={photo.photoId}
                      loading="lazy"
                      className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-[1.02]"
                    />

                    {/* Micro Tags (Monochrome Minimalist) */}
                    <div className="absolute bottom-2 left-2 flex items-center gap-1">
                      {hasGif && (
                        <span className="px-1.5 py-0.5 bg-black/80 text-white text-[8px] font-mono tracking-widest uppercase border border-white/20">
                          GIF
                        </span>
                      )}
                      {photo.rawShots && photo.rawShots.length > 0 && (
                        <span className="px-1.5 py-0.5 bg-black/80 text-neutral-300 text-[8px] font-mono tracking-widest uppercase border border-white/20">
                          {photo.rawShots.length} Pose
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Clean Minimalist Footer */}
                  <div className="px-2 py-2 flex items-center justify-between border-t border-neutral-900 bg-[#0A0A0A]">
                    <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-wider truncate max-w-[120px]">
                      {photo.photoId}
                    </span>
                    <span className="text-[9px] font-mono text-neutral-400 group-hover:text-white transition-colors">
                      LIHAT →
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ── Modal Lightbox Preview (Zara / Uniqlo DNA) ── */}
      {activeModalPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex items-center justify-center p-3 sm:p-6 animate-fadeIn select-none"
          onClick={handleCloseLightbox}
        >
          <div
            className="max-w-xl w-full bg-[#0A0A0A] border border-neutral-800 rounded-none sm:rounded-2xl p-4 sm:p-6 flex flex-col gap-4 shadow-2xl relative my-auto max-h-[96vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header: Discreet Editorial Label & Tutup */}
            <div className="flex items-center justify-between border-b border-neutral-900 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-300">
                  {activeModalPhoto.photoId === photoParam || activeModalPhoto.photoId === spotlightPhotoId
                    ? 'Foto Sesi Anda'
                    : `Sesi: ${activeModalPhoto.photoId}`}
                </span>
              </div>

              {/* Minimalist Close Button */}
              <button
                onClick={handleCloseLightbox}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-neutral-800 hover:border-white text-neutral-300 hover:text-white text-[10px] uppercase tracking-[0.15em] font-medium transition-all active:scale-95"
                title="Tutup & lihat seluruh album acara"
              >
                <span>Tutup</span>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Asset Tab Selector (Monochrome Minimalist) */}
            <div className="flex items-center gap-1 p-1 bg-black border border-neutral-800 rounded-lg text-xs overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => setLightboxTab('photo')}
                className={`flex-1 py-1.5 px-3 rounded text-[10px] uppercase tracking-[0.15em] whitespace-nowrap transition-all ${
                  lightboxTab === 'photo'
                    ? 'bg-white text-black font-bold shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Foto Berbingkai
              </button>

              {activeModalPhoto.hasGif && (
                <button
                  type="button"
                  onClick={() => setLightboxTab('gif')}
                  className={`flex-1 py-1.5 px-3 rounded text-[10px] uppercase tracking-[0.15em] whitespace-nowrap flex items-center justify-center gap-1.5 transition-all ${
                    lightboxTab === 'gif'
                      ? 'bg-white text-black font-bold shadow-sm'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Animasi GIF</span>
                </button>
              )}

              {/* Dynamic Raw Takes */}
              {activeModalPhoto.rawShots && activeModalPhoto.rawShots.length > 0 ? (
                activeModalPhoto.rawShots.map((raw) => (
                  <button
                    key={raw.index}
                    type="button"
                    onClick={() => setLightboxTab(`raw_${raw.index}`)}
                    className={`flex-1 py-1.5 px-3 rounded text-[10px] uppercase tracking-[0.15em] whitespace-nowrap transition-all ${
                      lightboxTab === `raw_${raw.index}`
                        ? 'bg-white text-black font-bold shadow-sm'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Pose {raw.index}
                  </button>
                ))
              ) : null}
            </div>

            {/* Visual Preview Frame (Matte Black Studio Frame) */}
            <div className="w-full max-h-[50vh] bg-black rounded-lg border border-neutral-900 flex items-center justify-center overflow-hidden p-2 relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getLightboxPreviewUrl(activeModalPhoto, lightboxTab)}
                alt={activeModalPhoto.photoId}
                className="max-h-[46vh] max-w-full object-contain filter drop-shadow-2xl mx-auto select-none"
              />
            </div>

            {/* Actions: High-Contrast Pure White Download & Secondary Share */}
            <div className="flex flex-col gap-2.5 pt-1">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const url = getLightboxPreviewUrl(activeModalPhoto, lightboxTab);
                    const isGif = lightboxTab === 'gif';
                    const isRaw = lightboxTab.startsWith('raw_');
                    const ext = isGif ? 'gif' : 'jpg';
                    const prefix = isGif ? 'Animasi' : isRaw ? `Raw_${lightboxTab.replace('raw_', 'Pose')}` : 'Foto';
                    handleDownload(url, `MingleBooth_${prefix}_${activeModalPhoto.photoId}.${ext}`);
                  }}
                  className="flex-1 h-12 bg-white hover:bg-neutral-200 text-black font-bold text-xs uppercase tracking-[0.15em] rounded-lg flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.99]"
                >
                  <Download className="w-4 h-4" />
                  <span>
                    Unduh{' '}
                    {lightboxTab === 'gif'
                      ? 'Animasi GIF (.gif)'
                      : lightboxTab.startsWith('raw_')
                      ? `Pose ${lightboxTab.replace('raw_', '')} (.jpg)`
                      : 'Foto Berbingkai (.jpg)'}
                  </span>
                </button>

                <a
                  href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                    `Lihat foto saya di ${data?.eventName || 'MingleBooth'}: `
                  )}${typeof window !== 'undefined' ? encodeURIComponent(window.location.href) : ''}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-12 px-4 rounded-lg border border-neutral-800 hover:border-white text-white text-xs uppercase tracking-wider font-semibold flex items-center gap-2 transition-colors shrink-0"
                  title="Bagikan ke WhatsApp"
                >
                  <Share2 className="w-4 h-4 text-neutral-300" />
                  <span className="hidden sm:inline">WhatsApp</span>
                </a>
              </div>

              {/* Discreet Discovery Link to View Full Album */}
              <button
                onClick={handleCloseLightbox}
                className="w-full py-2 text-[11px] uppercase tracking-[0.15em] text-neutral-400 hover:text-white flex items-center justify-center gap-1.5 transition-colors border-t border-neutral-900 mt-1"
              >
                <span>Lihat Seluruh Album Acara ({data?.totalPhotos || 0} Foto)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
