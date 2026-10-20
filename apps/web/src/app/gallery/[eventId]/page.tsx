'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  X,
  ArrowLeft,
  FolderDown,
  Film,
  Play,
  Pause,
  ExternalLink,
  Info,
  Maximize2,
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

// Unified Media Item for Fullscreen Swipe Viewer & Category Isolation
export interface ViewerMediaItem {
  uid: string;
  photoId: string;
  category: 'all' | 'framed' | 'gif' | 'raw';
  typeLabel: string;
  title: string;
  subtitle: string;
  mediaUrl: string;
  thumbUrl: string;
  downloadFilename: string;
  rawIndex?: number;
  hasGif?: boolean;
  gifUrl?: string | null;
  rawShots?: RawShot[];
  fullUrl?: string;
}

export default function EventGalleryPage({ params }: { params: { eventId: string } }) {
  const { eventId } = params;
  const router = useRouter();
  const searchParams = useSearchParams();
  const photoParam = searchParams.get('p');
  const categoryParam = searchParams.get('category') as 'all' | 'framed' | 'gif' | 'raw';
  const initialCategory = (['all', 'framed', 'gif', 'raw'].includes(categoryParam) ? categoryParam : 'all');
  const zipParam = searchParams.get('modal') === 'zip' || searchParams.get('zip') === '1';

  // Event Gallery Data State
  const [data, setData] = useState<EventGalleryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active Category: 'all' | 'framed' | 'gif' | 'raw'
  const [activeCategory, setActiveCategory] = useState<'all' | 'framed' | 'gif' | 'raw'>(initialCategory);
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

  // Real-time metadata verification cache
  const [photoMetaMap, setPhotoMetaMap] = useState<
    Record<string, { hasGif: boolean; gifUrl?: string; rawShots?: RawShot[] }>
  >({});

  // Fullscreen Swipe Viewer State
  const [viewerOpen, setViewerOpen] = useState(false);
  const [activeViewerIndex, setActiveViewerIndex] = useState(0);
  const [isGifPaused, setIsGifPaused] = useState(false);
  const [viewerSubTab, setViewerSubTab] = useState<'framed' | 'gif' | string>('framed');
  const [mediaLoadError, setMediaLoadError] = useState<Record<string, boolean>>({});

  // Touch Swipe Gesture State
  const touchStartXRef = useRef<number>(0);
  const touchStartYRef = useRef<number>(0);
  const touchStartTimeRef = useRef<number>(0);
  const [dragOffset, setDragOffset] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Scroll Position Lock Ref
  const savedScrollPos = useRef<number>(0);

  // Thumbnail Filmstrip Ref
  const thumbStripRef = useRef<HTMLDivElement>(null);

  // ZIP Download Modal State
  const [zipModalOpen, setZipModalOpen] = useState(zipParam);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [zipDownloadError, setZipDownloadError] = useState<string | null>(null);
  const [zipDownloadSuccess, setZipDownloadSuccess] = useState(false);

  // 1. Fetch Event Gallery Data
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    fetch(`/api/gallery/event/${eventId}`)
      .then((res) => res.json())
      .then((json) => {
        if (!isMounted) return;
        if (json.success) {
          setData(json);
        } else {
          setError(json.error || 'Gagal memuat galeri acara');
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err?.message || 'Koneksi ke server gagal');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [eventId]);

  // 2. Real-time meta verification for individual photos (ensures GIFs & raw shots are detected even if async sync lagged)
  const verifyPhotoMeta = useCallback((photoId: string) => {
    if (!photoId || photoMetaMap[photoId]) return;
    fetch(`/api/gallery/${photoId}?type=meta`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          const rawShots: RawShot[] = [];
          for (let i = 1; i <= (json.rawCount || 0); i++) {
            rawShots.push({ index: i, url: `/api/gallery/${photoId}?type=raw&index=${i}` });
          }
          setPhotoMetaMap((prev) => ({
            ...prev,
            [photoId]: {
              hasGif: Boolean(json.hasGif),
              gifUrl: json.hasGif ? `/api/gallery/${photoId}?type=gif` : undefined,
              rawShots: rawShots.length > 0 ? rawShots : undefined,
            },
          }));
        }
      })
      .catch(() => {});
  }, [photoMetaMap]);

  // Verify meta for all loaded photos
  useEffect(() => {
    if (data?.photos) {
      data.photos.forEach((p) => {
        if (!photoMetaMap[p.photoId]) {
          verifyPhotoMeta(p.photoId);
        }
      });
    }
  }, [data?.photos, photoMetaMap, verifyPhotoMeta]);

  // 3. Computed Totals for 4 Categories
  const totalAllCount = useMemo(() => {
    return data?.photos?.length ?? data?.totalPhotos ?? 0;
  }, [data?.photos, data?.totalPhotos]);

  const totalFramedCount = useMemo(() => {
    return data?.photos?.length ?? 0;
  }, [data?.photos]);

  const totalGifCount = useMemo(() => {
    return (
      data?.photos?.filter((p) => p.hasGif || photoMetaMap[p.photoId]?.hasGif).length || 0
    );
  }, [data?.photos, photoMetaMap]);

  const totalRawCount = useMemo(() => {
    return (
      data?.photos?.reduce((sum, p) => {
        const shots = photoMetaMap[p.photoId]?.rawShots || p.rawShots;
        return sum + (shots?.length || 0);
      }, 0) || 0
    );
  }, [data?.photos, photoMetaMap]);

  // 4. Build Strict Categorized Item Lists
  // All Sessions
  const allCategoryItems = useMemo<ViewerMediaItem[]>(() => {
    if (!data?.photos) return [];
    return data.photos
      .filter((p) => {
        if (!searchQuery.trim()) return true;
        return p.photoId.toLowerCase().includes(searchQuery.toLowerCase().trim());
      })
      .map((p, idx) => {
        const meta = photoMetaMap[p.photoId];
        const hasGif = meta?.hasGif ?? p.hasGif;
        const gifUrl = meta?.gifUrl || p.gifUrl || (hasGif ? `/api/gallery/${p.photoId}?type=gif` : null);
        const rawShots = meta?.rawShots ?? p.rawShots ?? [];
        return {
          uid: `all_${p.photoId}`,
          photoId: p.photoId,
          category: 'all',
          typeLabel: 'SEMUA MEDIA',
          title: `Sesi ${p.photoId}`,
          subtitle: new Date(p.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          mediaUrl: p.fullUrl,
          thumbUrl: p.thumbUrl,
          downloadFilename: `MingleBooth_Foto_${p.photoId}.jpg`,
          hasGif,
          gifUrl,
          rawShots,
          fullUrl: p.fullUrl,
        };
      });
  }, [data?.photos, searchQuery, photoMetaMap]);

  // Framed Only
  const framedCategoryItems = useMemo<ViewerMediaItem[]>(() => {
    if (!data?.photos) return [];
    return data.photos
      .filter((p) => {
        if (!searchQuery.trim()) return true;
        return p.photoId.toLowerCase().includes(searchQuery.toLowerCase().trim());
      })
      .map((p) => ({
        uid: `framed_${p.photoId}`,
        photoId: p.photoId,
        category: 'framed',
        typeLabel: 'FOTO BERBINGKAI',
        title: `Foto Berbingkai • ${p.photoId}`,
        subtitle: new Date(p.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        mediaUrl: p.fullUrl,
        thumbUrl: p.thumbUrl,
        downloadFilename: `MingleBooth_Foto_Berbingkai_${p.photoId}.jpg`,
        fullUrl: p.fullUrl,
      }));
  }, [data?.photos, searchQuery]);

  // GIF Only
  const gifCategoryItems = useMemo<ViewerMediaItem[]>(() => {
    if (!data?.photos) return [];
    return data.photos
      .filter((p) => {
        const hasGif = p.hasGif || photoMetaMap[p.photoId]?.hasGif;
        if (!hasGif) return false;
        if (!searchQuery.trim()) return true;
        return p.photoId.toLowerCase().includes(searchQuery.toLowerCase().trim());
      })
      .map((p) => {
        const meta = photoMetaMap[p.photoId];
        const gifUrl = meta?.gifUrl || p.gifUrl || `/api/gallery/${p.photoId}?type=gif`;
        return {
          uid: `gif_${p.photoId}`,
          photoId: p.photoId,
          category: 'gif',
          typeLabel: 'ANIMASI GIF',
          title: `Animasi GIF • ${p.photoId}`,
          subtitle: 'Loop Boomerang Animasi',
          mediaUrl: gifUrl,
          thumbUrl: gifUrl,
          downloadFilename: `MingleBooth_Animasi_${p.photoId}.gif`,
          hasGif: true,
          gifUrl,
        };
      });
  }, [data?.photos, searchQuery, photoMetaMap]);

  // Raw Poses Only (Flattened individual poses)
  const rawCategoryItems = useMemo<ViewerMediaItem[]>(() => {
    if (!data?.photos) return [];
    const list: ViewerMediaItem[] = [];
    data.photos.forEach((p) => {
      if (searchQuery.trim() && !p.photoId.toLowerCase().includes(searchQuery.toLowerCase().trim())) {
        return;
      }
      const rawShots = photoMetaMap[p.photoId]?.rawShots || p.rawShots || [];
      rawShots.forEach((raw) => {
        list.push({
          uid: `raw_${p.photoId}_${raw.index}`,
          photoId: p.photoId,
          category: 'raw',
          typeLabel: `FOTO ORIGINAL • POSE ${raw.index}`,
          title: `Pose ${raw.index} • ${p.photoId}`,
          subtitle: `Jepretan Sensor Mentah #${raw.index}`,
          mediaUrl: raw.url,
          thumbUrl: raw.url,
          downloadFilename: `MingleBooth_Foto_Original_${p.photoId}_Pose_${raw.index}.jpg`,
          rawIndex: raw.index,
        });
      });
    });
    return list;
  }, [data?.photos, searchQuery, photoMetaMap]);

  // Active Category Media Array for Viewer & Grid
  const currentCategoryItems = useMemo<ViewerMediaItem[]>(() => {
    switch (activeCategory) {
      case 'framed':
        return framedCategoryItems;
      case 'gif':
        return gifCategoryItems;
      case 'raw':
        return rawCategoryItems;
      case 'all':
      default:
        return allCategoryItems;
    }
  }, [activeCategory, allCategoryItems, framedCategoryItems, gifCategoryItems, rawCategoryItems]);

  // 5. Open Fullscreen Viewer with Scroll Position Preservation
  const handleOpenViewer = (index: number) => {
    if (typeof window !== 'undefined') {
      savedScrollPos.current = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${savedScrollPos.current}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
    }
    setActiveViewerIndex(index);
    setIsGifPaused(false);
    setViewerSubTab('framed');
    setViewerOpen(true);
  };

  // Close Fullscreen Viewer & Restore Scroll Position Exactly
  const handleCloseViewer = () => {
    setViewerOpen(false);
    setIsDragging(false);
    setDragOffset(0);

    if (typeof window !== 'undefined') {
      const scrollY = savedScrollPos.current;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      window.scrollTo(0, scrollY);
    }

    // Clean up spotlight query param if present
    if (typeof window !== 'undefined' && window.location.search.includes('p=')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('p');
      window.history.replaceState(null, '', url.pathname + (url.search || ''));
    }
  };

  // Open viewer automatically if ?p=photoParam is present on load
  useEffect(() => {
    if (photoParam && data?.photos && data.photos.length > 0) {
      const targetIdx = currentCategoryItems.findIndex((it) => it.photoId === photoParam);
      if (targetIdx !== -1) {
        handleOpenViewer(targetIdx);
      } else {
        // If not in current category, search in allCategoryItems
        const allIdx = allCategoryItems.findIndex((it) => it.photoId === photoParam);
        if (allIdx !== -1) {
          setActiveCategory('all');
          handleOpenViewer(allIdx);
        }
      }
    }
  }, [photoParam, data?.photos]);

  // Current active viewer item
  const currentViewerItem = currentCategoryItems[activeViewerIndex] || currentCategoryItems[0];

  // Navigation handlers (Strictly bounded to current category)
  const handlePrev = useCallback(() => {
    if (currentCategoryItems.length <= 1) return;
    setActiveViewerIndex((prev) => (prev > 0 ? prev - 1 : currentCategoryItems.length - 1));
    setIsGifPaused(false);
    setViewerSubTab('framed');
  }, [currentCategoryItems.length]);

  const handleNext = useCallback(() => {
    if (currentCategoryItems.length <= 1) return;
    setActiveViewerIndex((prev) => (prev < currentCategoryItems.length - 1 ? prev + 1 : 0));
    setIsGifPaused(false);
    setViewerSubTab('framed');
  }, [currentCategoryItems.length]);

  // Keyboard Navigation: ArrowLeft, ArrowRight, Escape
  useEffect(() => {
    if (!viewerOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCloseViewer();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewerOpen, handlePrev, handleNext]);

  // Auto-scroll active thumbnail into view in filmstrip
  useEffect(() => {
    if (viewerOpen && thumbStripRef.current) {
      const activeEl = thumbStripRef.current.querySelector(`[data-thumb-index="${activeViewerIndex}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, [viewerOpen, activeViewerIndex]);

  // 6. Touch Swipe Physics
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    touchStartTimeRef.current = Date.now();
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - touchStartXRef.current;
    const diffY = currentY - touchStartYRef.current;

    // Only swipe horizontally if horizontal displacement dominates vertical
    if (Math.abs(diffX) > Math.abs(diffY)) {
      e.preventDefault();
      // Apply gentle resistance/dampening
      setDragOffset(diffX * 0.75);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    const threshold = 55; // Pixels required to trigger navigation
    if (dragOffset < -threshold) {
      handleNext();
    } else if (dragOffset > threshold) {
      handlePrev();
    }
    setDragOffset(0);
  };

  // 7. Single Media Download Trigger
  const handleDownloadSingle = (url: string, filename: string) => {
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  // 8. Native Web Share API with Fallback
  const handleShareMedia = async (item: ViewerMediaItem) => {
    const shareTitle = `${data?.eventName || 'MingleBooth'} — Foto Sesi ${item.photoId}`;
    const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/p/${item.photoId}` : '';

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: `Lihat foto saya dari ${data?.eventName || 'MingleBooth'}!`,
          url: shareUrl,
        });
        return;
      } catch (err) {
        // User cancelled or share failed, fallback to copy
      }
    }

    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(shareUrl || window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  // 9. ZIP Download Execution
  const handleExecuteZipDownload = (type: 'all' | 'framed' | 'gif' | 'raw') => {
    if (isDownloadingZip) return;
    setIsDownloadingZip(true);
    setZipDownloadError(null);
    setZipDownloadSuccess(false);

    try {
      const cleanName = (data?.eventName || 'Acara').replace(/[^a-zA-Z0-9_-]/g, '_');
      const typeSuffix =
        type === 'framed'
          ? 'Foto_Berbingkai'
          : type === 'gif'
          ? 'Animasi_GIF'
          : type === 'raw'
          ? 'Foto_Original'
          : 'Semua_Media';
      const filename = `MingleBooth_${cleanName}_${typeSuffix}.zip`;

      const link = document.createElement('a');
      link.href = `/api/gallery/event/${eventId}/download-zip?type=${type}`;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => {
        setIsDownloadingZip(false);
        setZipDownloadSuccess(true);
        setTimeout(() => {
          setZipModalOpen(false);
          setZipDownloadSuccess(false);
        }, 1800);
      }, 3500);
    } catch (err: any) {
      console.error('ZIP download error:', err);
      setIsDownloadingZip(false);
      setZipDownloadError(err?.message || 'Gagal memulai unduhan ZIP');
    }
  };

  // Helper to resolve currently displayed URL inside viewer
  const getActiveViewerDisplayUrl = (item: ViewerMediaItem) => {
    if (!item) return '';
    if (item.category === 'gif') {
      return item.mediaUrl;
    }
    if (item.category === 'raw') {
      return item.mediaUrl;
    }
    if (item.category === 'all') {
      if (viewerSubTab === 'gif' && item.gifUrl) {
        return item.gifUrl;
      }
      if (viewerSubTab.startsWith('raw_')) {
        const rawIdx = parseInt(viewerSubTab.replace('raw_', ''), 10);
        const match = item.rawShots?.find((r) => r.index === rawIdx);
        return match ? match.url : `/api/gallery/${item.photoId}?type=raw&index=${rawIdx}`;
      }
      return item.fullUrl || item.mediaUrl;
    }
    return item.mediaUrl;
  };

  return (
    <div className="min-h-screen bg-[#050507] text-[#FAFAFA] flex flex-col font-sans select-none antialiased">
      {/* ── Top Minimalist Header ── */}
      <header className="h-16 px-4 sm:px-8 border-b border-white/[0.08] flex items-center justify-between bg-[#050507]/90 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="h-8 px-2.5 rounded-lg border border-neutral-800 hover:border-neutral-500 text-neutral-400 hover:text-white text-[11px] uppercase tracking-wider font-medium flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Kembali</span>
          </Link>
          <div className="h-4 w-px bg-neutral-800 hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-white">
              MingleBooth
            </span>
            <span className="text-[10px] text-neutral-500 uppercase tracking-[0.15em] hidden sm:inline">
              / Guest Gallery
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Share Link Button */}
          <button
            onClick={() => {
              if (typeof window !== 'undefined') {
                navigator.clipboard.writeText(window.location.href);
                setCopied(true);
                setTimeout(() => setCopied(false), 2500);
              }
            }}
            className="h-8 px-3 rounded-lg border border-neutral-800 hover:border-neutral-500 text-[11px] uppercase tracking-wider font-medium text-neutral-300 hover:text-white flex items-center gap-1.5 transition-colors"
            title="Salin tautan galeri ini"
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
      <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-8 py-6 sm:py-10 flex flex-col gap-6 sm:gap-8">
        {/* Editorial Event Banner */}
        <section className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-white/[0.08]">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-neutral-400">
                Galeri Tamu Resmi
              </span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight uppercase leading-tight">
              {loading ? (
                <span className="inline-block w-64 h-9 bg-neutral-900 rounded animate-pulse" />
              ) : (
                data?.eventName || 'Galeri Photobooth'
              )}
            </h1>
            <p className="text-xs text-neutral-400 tracking-wider uppercase font-mono">
              {data?.eventDate || ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
            {/* Minimalist Stats Counters */}
            <div className="flex items-center gap-3 sm:gap-4 py-2 px-3 border border-neutral-800 rounded-lg bg-[#0C0D11] text-[11px] font-mono text-neutral-400 tracking-wider uppercase">
              <div>
                <span className="text-white font-bold">{totalFramedCount}</span> FOTO
              </div>
              <span className="text-neutral-700">/</span>
              <div>
                <span className="text-white font-bold">{totalGifCount}</span> GIF
              </div>
              {totalRawCount > 0 && (
                <>
                  <span className="text-neutral-700">/</span>
                  <div>
                    <span className="text-white font-bold">{totalRawCount}</span> RAW
                  </div>
                </>
              )}
            </div>

            {/* ZIP Download Modal Trigger Button */}
            <button
              onClick={() => setZipModalOpen(true)}
              className="h-9 px-4 rounded-lg bg-white hover:bg-neutral-200 text-black text-[11px] font-bold tracking-[0.15em] uppercase flex items-center gap-2 transition-all active:scale-[0.98] shadow-sm"
              title="Unduh seluruh arsip foto acara dalam berkas ZIP"
            >
              <FolderDown className="w-3.5 h-3.5" />
              <span>Unduh ZIP</span>
            </button>
          </div>
        </section>

        {/* ── Toolbar: Search & 4 Discrete Categories ── */}
        <section className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 sm:gap-4">
          {/* Search Box */}
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="CARI KODE SESI..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-8 pr-7 bg-[#0C0D11] border border-neutral-800 focus:border-white rounded-lg text-[11px] uppercase tracking-wider text-white placeholder:text-neutral-600 outline-none transition-colors font-mono"
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

          {/* 4 Distinct Category Filter Tabs */}
          <div className="flex items-center overflow-x-auto no-scrollbar gap-1 border border-neutral-800 p-1 rounded-lg bg-[#0C0D11]">
            {/* 1. Semua */}
            <button
              onClick={() => setActiveCategory('all')}
              className={`px-3 py-1.5 text-[10px] font-medium tracking-[0.18em] uppercase rounded-md transition-all whitespace-nowrap ${
                activeCategory === 'all'
                  ? 'bg-white text-black font-bold shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Semua ({totalAllCount})
            </button>

            {/* 2. Foto Berbingkai */}
            <button
              onClick={() => setActiveCategory('framed')}
              className={`px-3 py-1.5 text-[10px] font-medium tracking-[0.18em] uppercase rounded-md transition-all whitespace-nowrap ${
                activeCategory === 'framed'
                  ? 'bg-white text-black font-bold shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Foto Berbingkai ({totalFramedCount})
            </button>

            {/* 3. Animasi GIF */}
            <button
              onClick={() => setActiveCategory('gif')}
              className={`px-3 py-1.5 text-[10px] font-medium tracking-[0.18em] uppercase rounded-md transition-all whitespace-nowrap flex items-center gap-1.5 ${
                activeCategory === 'gif'
                  ? 'bg-white text-black font-bold shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              <span>Animasi GIF ({totalGifCount})</span>
            </button>

            {/* 4. Foto Original */}
            <button
              onClick={() => setActiveCategory('raw')}
              className={`px-3 py-1.5 text-[10px] font-medium tracking-[0.18em] uppercase rounded-md transition-all whitespace-nowrap ${
                activeCategory === 'raw'
                  ? 'bg-white text-black font-bold shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Foto Original ({totalRawCount})
            </button>
          </div>
        </section>

        {/* ── Media Gallery Grid ── */}
        {loading ? (
          <div className="py-24 text-center text-[11px] uppercase tracking-[0.2em] text-neutral-500 font-mono flex flex-col items-center justify-center gap-3">
            <div className="w-5 h-5 border-2 border-neutral-700 border-t-white rounded-full animate-spin" />
            <span>Memuat Galeri Tamu...</span>
          </div>
        ) : error ? (
          <div className="py-12 border border-neutral-800 rounded-xl text-center text-neutral-400 text-xs tracking-wider uppercase bg-[#0C0D11] p-6">
            <p className="font-semibold text-white mb-1">Gagal Memuat Galeri</p>
            <p className="text-[11px] text-neutral-500">{error}</p>
          </div>
        ) : currentCategoryItems.length === 0 ? (
          <div className="py-24 border border-dashed border-neutral-800 rounded-xl text-center flex flex-col items-center justify-center gap-2 bg-[#0C0D11]/50 p-6">
            <Camera className="w-8 h-8 text-neutral-600 mb-1" />
            <span className="text-xs uppercase tracking-[0.2em] text-neutral-300 font-semibold">
              Belum Ada Media di Kategori Ini
            </span>
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 max-w-sm">
              {activeCategory === 'gif'
                ? 'Animasi GIF belum dibuat atau belum ada sesi dengan fitur boomerang GIF.'
                : activeCategory === 'raw'
                ? 'Jepretan foto original sensor kamera belum diunggah untuk acara ini.'
                : 'Foto yang diambil dari booth akan tampil otomatis di sini.'}
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-3.5 md:gap-4 items-start">
            {currentCategoryItems.map((item, index) => {
              const isSpotlight = item.photoId === photoParam;
              return (
                <div
                  key={item.uid}
                  onClick={() => handleOpenViewer(index)}
                  className={`group relative rounded-xl overflow-hidden cursor-pointer transition-all duration-200 flex flex-col bg-[#0C0D11] border shadow-sm ${
                    isSpotlight
                      ? 'border-white ring-1 ring-white/80 shadow-white/10'
                      : 'border-white/[0.08] hover:border-white/25 hover:shadow-md'
                  }`}
                >
                  {/* Media Visual Container: Consistent 2:3 Aspect Ratio */}
                  <div className="w-full aspect-[2/3] bg-[#07080A] relative flex items-center justify-center overflow-hidden">
                    {/* Spotlight Badge for Guest's personal scan */}
                    {isSpotlight && (
                      <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full bg-white text-black text-[9px] font-bold uppercase tracking-[0.15em] shadow-md">
                        Foto Anda
                      </div>
                    )}

                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.thumbUrl}
                      alt={item.title}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />

                    {/* Category-specific Micro Indicators */}
                    <div className="absolute bottom-2 left-2 flex items-center gap-1 z-10">
                      {item.category === 'gif' ? (
                        <span className="px-1.5 py-0.5 rounded bg-black/85 text-white text-[8px] font-mono tracking-widest uppercase border border-white/20 backdrop-blur-sm flex items-center gap-1 font-bold">
                          <Play className="w-2.5 h-2.5 fill-current" />
                          GIF
                        </span>
                      ) : item.category === 'raw' ? (
                        <span className="px-1.5 py-0.5 rounded bg-black/85 text-neutral-200 text-[8px] font-mono tracking-widest uppercase border border-white/20 backdrop-blur-sm font-semibold">
                          Pose {item.rawIndex}
                        </span>
                      ) : item.category === 'framed' ? (
                        <span className="px-1.5 py-0.5 rounded bg-black/85 text-neutral-300 text-[8px] font-mono tracking-widest uppercase border border-white/20 backdrop-blur-sm">
                          Bingkai
                        </span>
                      ) : (
                        // 'all' category badges
                        <>
                          {item.hasGif && (
                            <span className="px-1.5 py-0.5 rounded bg-black/85 text-white text-[8px] font-mono tracking-widest uppercase border border-white/20 backdrop-blur-sm font-bold">
                              GIF
                            </span>
                          )}
                          {item.rawShots && item.rawShots.length > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-black/85 text-neutral-300 text-[8px] font-mono tracking-widest uppercase border border-white/20 backdrop-blur-sm">
                              {item.rawShots.length} Pose
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    {/* Hover Magnify Overlay Icon */}
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                      <div className="w-9 h-9 rounded-full bg-black/70 border border-white/20 backdrop-blur-md flex items-center justify-center text-white scale-90 group-hover:scale-100 transition-transform">
                        <Maximize2 className="w-4 h-4" />
                      </div>
                    </div>
                  </div>

                  {/* Clean Card Footer */}
                  <div className="px-2.5 py-2 flex items-center justify-between border-t border-white/[0.06] bg-[#0C0D11]">
                    <span className="text-[9px] font-mono text-neutral-400 uppercase tracking-wider truncate max-w-[120px]">
                      {item.photoId}
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

      {/* ── 3. FULLSCREEN SWIPE VIEWER (LIGHTBOX) ── */}
      {viewerOpen && currentViewerItem && (
        <div
          className="fixed inset-0 z-50 bg-[#050507]/98 backdrop-blur-2xl flex flex-col justify-between select-none overflow-hidden"
          onClick={handleCloseViewer}
        >
          {/* ── Top Header Toolbar ── */}
          <div
            className="w-full h-14 sm:h-16 px-3 sm:px-8 border-b border-white/[0.08] flex items-center justify-between bg-[#050507]/95 z-20 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Left: Category Badge & Order Indicator */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded bg-neutral-900 border border-white/10 text-white font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.15em] sm:tracking-[0.2em] font-semibold truncate max-w-[110px] sm:max-w-none shrink-0">
                {currentViewerItem.typeLabel}
              </span>
              <div className="flex items-center gap-1 font-mono text-xs uppercase tracking-wider text-neutral-400 shrink-0">
                <span className="text-white font-bold text-xs sm:text-sm">
                  {activeViewerIndex + 1}
                </span>
                <span className="text-neutral-600">/</span>
                <span className="text-neutral-400">{currentCategoryItems.length}</span>
              </div>
            </div>

            {/* Right: Actions (Download, Share, Close) */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Single Download Button */}
              <button
                onClick={() => {
                  const url = getActiveViewerDisplayUrl(currentViewerItem);
                  handleDownloadSingle(url, currentViewerItem.downloadFilename);
                }}
                className="h-8 w-8 sm:w-auto sm:px-3 rounded-lg bg-white hover:bg-neutral-200 text-black text-[11px] font-bold tracking-wider uppercase flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95"
                title="Unduh foto/media ini"
              >
                <Download className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Unduh</span>
              </button>

              {/* Share Button */}
              <button
                onClick={() => handleShareMedia(currentViewerItem)}
                className="h-8 w-8 sm:w-auto sm:px-3 rounded-lg border border-neutral-800 hover:border-white text-neutral-300 hover:text-white text-[11px] uppercase tracking-wider font-medium flex items-center justify-center gap-1.5 transition-colors"
                title="Bagikan foto ini"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-white shrink-0" />
                    <span className="hidden sm:inline text-white font-semibold">Tersalin</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden sm:inline">Bagikan</span>
                  </>
                )}
              </button>

              {/* Close Button (X) */}
              <button
                onClick={handleCloseViewer}
                aria-label="Tutup Viewer"
                className="h-8 px-2 sm:px-3 rounded-lg border border-neutral-800 hover:border-white text-neutral-300 hover:text-white text-[11px] uppercase tracking-wider font-bold flex items-center justify-center gap-1 transition-colors ml-0.5"
                title="Tutup viewer & kembali ke galeri (Esc)"
              >
                <span className="hidden sm:inline">Tutup</span>
                <X className="w-4 h-4 shrink-0" />
              </button>
            </div>
          </div>

          {/* ── Sub-Tab Selector for "Semua" Category ── */}
          {activeCategory === 'all' && (currentViewerItem.hasGif || (currentViewerItem.rawShots && currentViewerItem.rawShots.length > 0)) && (
            <div
              className="w-full max-w-full flex items-center justify-center py-1.5 px-3 bg-black/60 border-b border-white/[0.06] z-20 shrink-0 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-1 p-1 bg-[#0C0D11] border border-neutral-800 rounded-lg text-xs max-w-full overflow-x-auto no-scrollbar shrink-0">
                <button
                  type="button"
                  onClick={() => setViewerSubTab('framed')}
                  className={`py-1 px-2.5 sm:px-3 rounded-md text-[9px] sm:text-[10px] uppercase tracking-[0.12em] sm:tracking-[0.15em] whitespace-nowrap transition-all ${
                    viewerSubTab === 'framed'
                      ? 'bg-white text-black font-bold shadow-sm'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Foto Berbingkai
                </button>

                {currentViewerItem.hasGif && (
                  <button
                    type="button"
                    onClick={() => setViewerSubTab('gif')}
                    className={`py-1 px-2.5 sm:px-3 rounded-md text-[9px] sm:text-[10px] uppercase tracking-[0.12em] sm:tracking-[0.15em] whitespace-nowrap flex items-center gap-1 transition-all ${
                      viewerSubTab === 'gif'
                        ? 'bg-white text-black font-bold shadow-sm'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Animasi GIF</span>
                  </button>
                )}

                {currentViewerItem.rawShots?.map((raw) => (
                  <button
                    key={raw.index}
                    type="button"
                    onClick={() => setViewerSubTab(`raw_${raw.index}`)}
                    className={`py-1 px-2.5 sm:px-3 rounded-md text-[9px] sm:text-[10px] uppercase tracking-[0.12em] sm:tracking-[0.15em] whitespace-nowrap transition-all ${
                      viewerSubTab === `raw_${raw.index}`
                        ? 'bg-white text-black font-bold shadow-sm'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Pose {raw.index}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Center Stage: Media Display with Swipe & Desktop Chevrons ── */}
          <div
            className="flex-1 w-full relative flex items-center justify-center p-2 sm:p-6 overflow-hidden touch-pan-y"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Desktop Left Chevron Button */}
            {currentCategoryItems.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrev();
                }}
                aria-label="Media Sebelumnya"
                className="hidden md:flex absolute left-4 lg:left-8 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/70 hover:bg-black/95 border border-white/20 text-white items-center justify-center backdrop-blur-md transition-all shadow-xl hover:scale-105 active:scale-95 z-30"
                title="Foto Sebelumnya (Panah Kiri)"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            {/* Media Canvas with Live Transform during swipe */}
            <div
              className="relative max-w-full max-h-[72vh] flex items-center justify-center transition-transform duration-100 ease-out"
              style={{
                transform: `translateX(${dragOffset}px)`,
                transition: isDragging ? 'none' : 'transform 0.25s ease-out',
              }}
            >
              {mediaLoadError[getActiveViewerDisplayUrl(currentViewerItem)] ? (
                <div className="flex flex-col items-center justify-center p-8 text-center text-neutral-400 gap-3 bg-black/60 rounded-2xl border border-neutral-800">
                  <div className="w-12 h-12 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center">
                    <Camera className="w-6 h-6 text-neutral-500" />
                  </div>
                  <div className="text-xs uppercase font-bold tracking-wider text-neutral-200">
                    Media Tidak Dapat Dimuat
                  </div>
                  <p className="text-[11px] text-neutral-500 max-w-xs">
                    File media tidak ditemukan atau gagal diunduh dari server.
                  </p>
                </div>
              ) : (
                <div className="relative group flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      isGifPaused && currentViewerItem.category === 'gif'
                        ? currentViewerItem.thumbUrl
                        : getActiveViewerDisplayUrl(currentViewerItem)
                    }
                    alt={currentViewerItem.title}
                    onError={() => {
                      setMediaLoadError((prev) => ({
                        ...prev,
                        [getActiveViewerDisplayUrl(currentViewerItem)]: true,
                      }));
                    }}
                    className="max-h-[68vh] max-w-[94vw] sm:max-w-[85vw] object-contain filter drop-shadow-2xl mx-auto rounded-lg select-none pointer-events-none"
                  />

                  {/* GIF Play/Pause Control Overlay (if viewing GIF) */}
                  {(currentViewerItem.category === 'gif' || viewerSubTab === 'gif') && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsGifPaused(!isGifPaused);
                      }}
                      className="absolute bottom-4 right-4 px-3 py-1.5 rounded-full bg-black/80 hover:bg-black border border-white/20 text-white text-[10px] font-mono uppercase tracking-wider flex items-center gap-1.5 backdrop-blur-md transition-all shadow-lg pointer-events-auto"
                      title={isGifPaused ? 'Putar Animasi' : 'Jeda Animasi'}
                    >
                      {isGifPaused ? (
                        <>
                          <Play className="w-3 h-3 fill-current text-white" />
                          <span>Putar</span>
                        </>
                      ) : (
                        <>
                          <Pause className="w-3 h-3 fill-current text-white" />
                          <span>Jeda</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Desktop Right Chevron Button */}
            {currentCategoryItems.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleNext();
                }}
                aria-label="Media Berikutnya"
                className="hidden md:flex absolute right-4 lg:right-8 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/70 hover:bg-black/95 border border-white/20 text-white items-center justify-center backdrop-blur-md transition-all shadow-xl hover:scale-105 active:scale-95 z-30"
                title="Foto Berikutnya (Panah Kanan)"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>

          {/* ── Bottom Filmstrip (Thumbnail Strip) ── */}
          <div
            className="w-full bg-[#050507]/95 border-t border-white/[0.08] py-2 px-4 z-20 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              ref={thumbStripRef}
              className="max-w-4xl mx-auto flex items-center gap-2 overflow-x-auto no-scrollbar py-1"
            >
              {currentCategoryItems.map((item, idx) => {
                const isActive = idx === activeViewerIndex;
                return (
                  <button
                    key={item.uid}
                    data-thumb-index={idx}
                    onClick={() => {
                      setActiveViewerIndex(idx);
                      setIsGifPaused(false);
                      setViewerSubTab('framed');
                    }}
                    className={`relative shrink-0 w-11 sm:w-14 aspect-[2/3] rounded-md overflow-hidden border transition-all ${
                      isActive
                        ? 'border-white ring-2 ring-white/90 scale-105 z-10 shadow-lg shadow-white/10'
                        : 'border-white/10 opacity-50 hover:opacity-100 hover:border-white/30'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.thumbUrl}
                      alt={item.title}
                      loading="lazy"
                      className="w-full h-full object-cover pointer-events-none"
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── 4. ZIP DOWNLOAD SELECTION MODAL ── */}
      {zipModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 select-none"
          onClick={() => {
            if (!isDownloadingZip) setZipModalOpen(false);
          }}
        >
          <div
            className="max-w-md w-full bg-[#0C0D11] border border-neutral-800 rounded-2xl p-5 sm:p-6 flex flex-col gap-5 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2">
                <FolderDown className="w-5 h-5 text-white" />
                <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-white">
                  Unduh Arsip ZIP
                </h3>
              </div>
              {!isDownloadingZip && (
                <button
                  onClick={() => setZipModalOpen(false)}
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Description */}
            <p className="text-xs text-neutral-400 leading-relaxed">
              Pilih kategori media yang ingin Anda kompres dan unduh ke perangkat Anda:
            </p>

            {/* 4 Download Options */}
            <div className="flex flex-col gap-2.5">
              {/* 1. Semua Media */}
              <button
                onClick={() => handleExecuteZipDownload('all')}
                disabled={isDownloadingZip}
                className="w-full p-3.5 rounded-xl border border-neutral-800 hover:border-white bg-[#07080A] hover:bg-neutral-900/60 flex items-center justify-between transition-all group disabled:opacity-50 text-left"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-white group-hover:text-white">
                    Semua Media (Arsip Lengkap)
                  </span>
                  <span className="text-[10px] text-neutral-400 font-mono">
                    {totalFramedCount} Foto Berbingkai • {totalGifCount} GIF • {totalRawCount} RAW
                  </span>
                </div>
                <FolderDown className="w-4 h-4 text-neutral-500 group-hover:text-white transition-colors shrink-0" />
              </button>

              {/* 2. Foto Berbingkai */}
              <button
                onClick={() => handleExecuteZipDownload('framed')}
                disabled={isDownloadingZip}
                className="w-full p-3.5 rounded-xl border border-neutral-800 hover:border-white bg-[#07080A] hover:bg-neutral-900/60 flex items-center justify-between transition-all group disabled:opacity-50 text-left"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-white group-hover:text-white">
                    Foto Berbingkai Saja
                  </span>
                  <span className="text-[10px] text-neutral-400 font-mono">
                    {totalFramedCount} Foto Komposit Cetak Siap Pakai
                  </span>
                </div>
                <FolderDown className="w-4 h-4 text-neutral-500 group-hover:text-white transition-colors shrink-0" />
              </button>

              {/* 3. Animasi GIF */}
              <button
                onClick={() => handleExecuteZipDownload('gif')}
                disabled={isDownloadingZip}
                className="w-full p-3.5 rounded-xl border border-neutral-800 hover:border-white bg-[#07080A] hover:bg-neutral-900/60 flex items-center justify-between transition-all group disabled:opacity-50 text-left"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-white group-hover:text-white">
                    Animasi GIF Saja
                  </span>
                  <span className="text-[10px] text-neutral-400 font-mono">
                    {totalGifCount} Berkas Animasi Loop Boomerang (.gif)
                  </span>
                </div>
                <FolderDown className="w-4 h-4 text-neutral-500 group-hover:text-white transition-colors shrink-0" />
              </button>

              {/* 4. Foto Original Mentahan */}
              {totalRawCount > 0 && (
                <button
                  onClick={() => handleExecuteZipDownload('raw')}
                  disabled={isDownloadingZip}
                  className="w-full p-3.5 rounded-xl border border-neutral-800 hover:border-white bg-[#07080A] hover:bg-neutral-900/60 flex items-center justify-between transition-all group disabled:opacity-50 text-left"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-white group-hover:text-white">
                      Foto Original Mentahan (RAW)
                    </span>
                    <span className="text-[10px] text-neutral-400 font-mono">
                      {totalRawCount} Jepretan Asli Sensor Kamera Resolusi Penuh
                    </span>
                  </div>
                  <FolderDown className="w-4 h-4 text-neutral-500 group-hover:text-white transition-colors shrink-0" />
                </button>
              )}
            </div>

            {/* Status / Spinner */}
            {isDownloadingZip && (
              <div className="flex items-center justify-center gap-2.5 p-3 rounded-lg bg-neutral-900/80 border border-neutral-800 text-xs font-mono uppercase tracking-wider text-neutral-300">
                <div className="w-4 h-4 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
                <span>Mengompresi dan menyiapkan arsip...</span>
              </div>
            )}

            {zipDownloadSuccess && (
              <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-white text-black text-xs font-bold uppercase tracking-wider">
                <Check className="w-4 h-4" />
                <span>Unduhan ZIP Berhasil Dimulai!</span>
              </div>
            )}

            {zipDownloadError && (
              <div className="p-3 rounded-lg bg-red-950/60 border border-red-800 text-red-200 text-xs">
                {zipDownloadError}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
