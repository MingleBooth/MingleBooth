'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useMemo } from 'react';
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
  Filter,
  Eye,
  Copy,
  FolderDown,
} from 'lucide-react';
import Link from 'next/link';

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
      link.download = `MingleBooth_${(data?.eventName || 'Acara').replace(/[^a-zA-Z0-9_-]/g, '_')}_Arsip_Foto.zip`;
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
    return data?.photos.filter((p) => p.hasGif).length || 0;
  }, [data?.photos]);

  const totalRawCount = useMemo(() => {
    return data?.photos.reduce((sum, p) => sum + (p.rawShots?.length || 0), 0) || 0;
  }, [data?.photos]);

  const filteredPhotos = useMemo(() => {
    if (!data?.photos) return [];
    return data.photos.filter((p) => {
      // Type Filter
      if (activeFilter === 'gif' && !p.hasGif) return false;
      if (activeFilter === 'raw' && (!p.rawShots || p.rawShots.length === 0)) return false;
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        if (!p.photoId.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [data?.photos, activeFilter, searchQuery]);

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
    <div className="min-h-screen bg-[#090A0C] text-[#EDEDED] flex flex-col font-sans select-none antialiased">
      {/* Top Navbar */}
      <header className="h-16 px-4 sm:px-8 border-b border-white/[0.08] flex items-center justify-between bg-[#101116]/80 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="h-8 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-neutral-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
          <div className="h-4 w-px bg-white/10 hidden sm:block" />
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-studio-transparent.png" alt="MingleBooth" className="w-6 h-6 object-contain" />
            <span className="text-sm font-semibold text-white tracking-tight">MingleBooth Gallery</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyShareLink}
            className="h-8 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-medium text-white flex items-center gap-1.5 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-semibold">Tersalin!</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5 text-neutral-400" />
                <span className="hidden sm:inline">Bagikan Galeri</span>
              </>
            )}
          </button>

          <Link
            href="/tablet"
            className="h-8 px-3.5 rounded-lg bg-white hover:bg-neutral-200 text-black text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Buka Studio</span>
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-8 flex flex-col gap-6">
        {/* Event Header Banner */}
        <div className="p-6 sm:p-8 rounded-3xl bg-[#121318] border border-white/[0.08] shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
          <div className="flex flex-col gap-2 relative z-10">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Album Acara Live
              </span>
              <span className="text-xs text-neutral-500 font-mono">
                {data?.eventDate || '2026-08-29'}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {data?.eventName || 'Wedding Bayu & Irma'}
            </h1>
            <p className="text-xs sm:text-sm text-neutral-400 max-w-xl leading-relaxed">
              Arsip lengkap photobooth: Foto berbingkai cetak, animasi GIF boomerang, dan foto original (mentah) camera take setiap pose tamu.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 relative z-10 self-start md:self-auto">
            <div className="px-4 py-2.5 rounded-2xl bg-black/50 border border-white/10 flex items-center gap-3 text-xs">
              <div className="text-center">
                <span className="block text-lg font-bold text-white font-mono leading-none">
                  {data?.totalPhotos || 0}
                </span>
                <span className="text-[10px] text-neutral-400 mt-0.5 block">Sesi Foto</span>
              </div>
              <div className="w-px h-6 bg-white/10" />
              <div className="text-center">
                <span className="block text-lg font-bold text-white font-mono leading-none">
                  {totalGifsCount}
                </span>
                <span className="text-[10px] text-neutral-400 mt-0.5 block">Animasi GIF</span>
              </div>
              <div className="w-px h-6 bg-white/10" />
              <div className="text-center">
                <span className="block text-lg font-bold text-white font-mono leading-none">
                  {totalRawCount}
                </span>
                <span className="text-[10px] text-neutral-400 mt-0.5 block">Foto Mentah</span>
              </div>
            </div>

            <button
              onClick={handleDownloadZip}
              disabled={isDownloadingZip}
              className="h-10 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-white text-xs font-semibold flex items-center gap-2 transition-all active:scale-98 shadow-sm disabled:opacity-50"
              title="Unduh seluruh foto berbingkai, animasi GIF, dan foto mentahan dalam 1 file ZIP"
            >
              {isDownloadingZip ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Menyiapkan ZIP...</span>
                </>
              ) : (
                <>
                  <FolderDown className="w-4 h-4 text-neutral-300" />
                  <span>Unduh Paket ZIP</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Filters & Search Toolbar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 rounded-2xl bg-[#121318] border border-white/[0.06]">
          {/* Search Box */}
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Cari ID foto (misal: mb_...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-8 pr-7 bg-[#1A1C20] border border-white/[0.06] rounded-lg text-xs text-white placeholder:text-neutral-500 outline-none focus:border-white/20 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* 4-Way Media Filter Buttons */}
          <div className="flex flex-wrap items-center bg-[#1A1C20] rounded-xl p-0.5 border border-white/[0.06] text-xs">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeFilter === 'all'
                  ? 'bg-white text-black font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Semua ({data?.photos.length || 0})
            </button>
            <button
              onClick={() => setActiveFilter('photo')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeFilter === 'photo'
                  ? 'bg-white text-black font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Foto Berbingkai
            </button>
            <button
              onClick={() => setActiveFilter('gif')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-all ${
                activeFilter === 'gif'
                  ? 'bg-white text-black font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>Animasi GIF ({totalGifsCount})</span>
            </button>
            <button
              onClick={() => setActiveFilter('raw')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-all ${
                activeFilter === 'raw'
                  ? 'bg-white text-black font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Camera className="w-3 h-3 text-blue-400" />
              <span>Foto Original ({totalRawCount})</span>
            </button>
          </div>
        </div>

        {/* Gallery Grid Section */}
        {loading ? (
          <div className="p-16 text-center text-xs text-neutral-500 font-mono flex flex-col items-center justify-center gap-3">
            <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            <span>Memuat seluruh galeri foto acara...</span>
          </div>
        ) : error ? (
          <div className="p-12 rounded-2xl bg-[#121318] border border-rose-500/20 text-center text-rose-400 text-xs">
            {error}
          </div>
        ) : filteredPhotos.length === 0 ? (
          <div className="p-16 rounded-3xl bg-[#121318] border border-dashed border-white/10 text-center flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-neutral-400">
              <Camera className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-white">Belum Ada Foto Tersimpan</h3>
            <p className="text-xs text-neutral-400 max-w-sm">
              Mulai sesi foto di tablet booth untuk melihat seluruh momen tamu muncul secara langsung di album ini.
            </p>
            <Link
              href="/tablet"
              className="mt-2 h-8 px-4 rounded-lg bg-white hover:bg-neutral-200 text-black text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Buka Mode Tablet</span>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {filteredPhotos.map((photo) => {
              // Determine thumbnail and default tab based on filter
              const thumbSrc =
                activeFilter === 'raw' && photo.rawShots && photo.rawShots.length > 0
                  ? photo.rawShots[0].url
                  : photo.thumbUrl;

              return (
                <div
                  key={photo.photoId}
                  onClick={() => {
                    setSelectedPhoto(photo);
                    if (activeFilter === 'gif' && photo.hasGif) {
                      setLightboxTab('gif');
                    } else if (activeFilter === 'raw' && photo.rawShots && photo.rawShots.length > 0) {
                      setLightboxTab(`raw_${photo.rawShots[0].index}`);
                    } else {
                      setLightboxTab('photo');
                    }
                  }}
                  className="group relative rounded-2xl bg-[#121318] border border-white/[0.08] hover:border-white/30 overflow-hidden cursor-pointer transition-all shadow-md hover:shadow-2xl flex flex-col"
                >
                  {/* Visual Thumbnail */}
                  <div className="w-full aspect-[3/4] bg-black relative flex items-center justify-center overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumbSrc}
                      alt={photo.photoId}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />

                    {/* Badges Container */}
                    <div className="absolute top-2 left-2 flex flex-col gap-1">
                      {photo.hasGif && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-black/70 backdrop-blur-md text-amber-300 border border-amber-400/30 flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                          GIF
                        </span>
                      )}
                      {photo.rawShots && photo.rawShots.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-black/70 backdrop-blur-md text-blue-300 border border-blue-400/30 flex items-center gap-1">
                          <Camera className="w-2.5 h-2.5 text-blue-400" />
                          {photo.rawShots.length} Pose
                        </span>
                      )}
                    </div>

                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-2.5">
                      <span className="text-[10px] font-mono text-neutral-300 truncate max-w-[100px]">
                        {photo.photoId}
                      </span>
                      <div className="w-7 h-7 rounded-lg bg-white/20 backdrop-blur-md text-white flex items-center justify-center hover:bg-white/40 transition-colors">
                        <Eye className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>

                  {/* Footer Info */}
                  <div className="p-2.5 flex items-center justify-between border-t border-white/[0.04] bg-[#0E0F12]">
                    <span className="text-[10px] font-mono text-neutral-400 truncate">
                      {new Date(photo.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <Link
                      href={`/p/${photo.photoId}`}
                      target="_blank"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[10px] text-neutral-400 hover:text-white flex items-center gap-0.5 transition-colors"
                      title="Buka halaman unduh tamu"
                    >
                      <span>Tamu</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ── Modal Lightbox Preview (Photo, GIF, Raw Takes) ── */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-fadeIn select-none"
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className="max-w-2xl w-full bg-[#121316] border border-white/15 rounded-3xl p-5 sm:p-6 flex flex-col gap-4 shadow-2xl relative my-auto max-h-[94vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Modal */}
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono text-neutral-400">ID: {selectedPhoto.photoId}</span>
                {selectedPhoto.hasGif && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-400/10 text-amber-300 border border-amber-400/20 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    Animasi GIF
                  </span>
                )}
                {selectedPhoto.rawShots && selectedPhoto.rawShots.length > 0 && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-400/10 text-blue-300 border border-blue-400/20 flex items-center gap-1">
                    <Camera className="w-3 h-3 text-blue-400" />
                    {selectedPhoto.rawShots.length} Foto Original
                  </span>
                )}
              </div>
              <button
                onClick={() => setSelectedPhoto(null)}
                className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-neutral-300 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Asset Tab Selector (Framed Composite, GIF, Raw Takes) */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-black/50 border border-white/[0.06] text-xs font-medium overflow-x-auto">
              <button
                type="button"
                onClick={() => setLightboxTab('photo')}
                className={`flex-1 py-1.5 px-2.5 rounded-lg flex items-center justify-center gap-1.5 whitespace-nowrap transition-all ${
                  lightboxTab === 'photo'
                    ? 'bg-white text-black font-semibold shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Foto Berbingkai</span>
              </button>

              {selectedPhoto.hasGif && (
                <button
                  type="button"
                  onClick={() => setLightboxTab('gif')}
                  className={`flex-1 py-1.5 px-2.5 rounded-lg flex items-center justify-center gap-1.5 whitespace-nowrap transition-all ${
                    lightboxTab === 'gif'
                      ? 'bg-white text-black font-semibold shadow-sm'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Animasi GIF</span>
                </button>
              )}

              {/* Dynamic Raw Takes */}
              {selectedPhoto.rawShots && selectedPhoto.rawShots.length > 0 ? (
                selectedPhoto.rawShots.map((raw) => (
                  <button
                    key={raw.index}
                    type="button"
                    onClick={() => setLightboxTab(`raw_${raw.index}`)}
                    className={`flex-1 py-1.5 px-2.5 rounded-lg flex items-center justify-center gap-1.5 whitespace-nowrap transition-all ${
                      lightboxTab === `raw_${raw.index}`
                        ? 'bg-white text-black font-semibold shadow-sm'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    <Camera className="w-3.5 h-3.5 text-blue-400" />
                    <span>Pose {raw.index} (Mentah)</span>
                  </button>
                ))
              ) : (
                <button
                  type="button"
                  onClick={() => setLightboxTab('raw_1')}
                  className={`flex-1 py-1.5 px-2.5 rounded-lg flex items-center justify-center gap-1.5 whitespace-nowrap transition-all ${
                    lightboxTab === 'raw_1'
                      ? 'bg-white text-black font-semibold shadow-sm'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5 text-blue-400" />
                  <span>Foto Mentah</span>
                </button>
              )}
            </div>

            {/* Visual Preview Frame */}
            <div className="w-full max-h-[56vh] bg-black rounded-2xl border border-white/[0.08] flex items-center justify-center overflow-hidden p-2 relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getLightboxPreviewUrl(selectedPhoto, lightboxTab)}
                alt={selectedPhoto.photoId}
                className="max-h-[52vh] max-w-full object-contain filter drop-shadow-2xl rounded-lg"
              />
            </div>

            {/* Action Buttons: Primary Download & QR Guest Link */}
            <div className="flex flex-col gap-2 pt-1">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    const url = getLightboxPreviewUrl(selectedPhoto, lightboxTab);
                    const isGif = lightboxTab === 'gif';
                    const isRaw = lightboxTab.startsWith('raw_');
                    const ext = isGif ? 'gif' : 'jpg';
                    const prefix = isGif ? 'Animasi' : isRaw ? `Raw_${lightboxTab.replace('raw_', 'Pose')}` : 'Foto';
                    handleDownload(url, `MingleBooth_${prefix}_${selectedPhoto.photoId}.${ext}`);
                  }}
                  className="flex-1 h-11 rounded-xl bg-white hover:bg-neutral-200 text-black font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-98"
                >
                  <Download className="w-4 h-4" />
                  <span>
                    Unduh{' '}
                    {lightboxTab === 'gif'
                      ? 'Animasi GIF (.gif)'
                      : lightboxTab.startsWith('raw_')
                      ? `Foto Original Pose ${lightboxTab.replace('raw_', '')} (.jpg)`
                      : 'Foto Berbingkai (.jpg)'}
                  </span>
                </button>

                <Link
                  href={`/p/${selectedPhoto.photoId}`}
                  target="_blank"
                  className="h-11 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <span>Halaman Tamu (QR)</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>

              {/* Quick Individual Download Badges */}
              <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] text-[11px] text-neutral-400">
                <span>Unduh cepat format lain:</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      handleDownload(selectedPhoto.fullUrl, `MingleBooth_Foto_${selectedPhoto.photoId}.jpg`)
                    }
                    className="hover:text-white underline"
                  >
                    Foto Cetak
                  </button>
                  {selectedPhoto.hasGif && selectedPhoto.gifUrl && (
                    <>
                      <span>•</span>
                      <button
                        onClick={() =>
                          handleDownload(selectedPhoto.gifUrl!, `MingleBooth_Animasi_${selectedPhoto.photoId}.gif`)
                        }
                        className="hover:text-amber-300 underline"
                      >
                        GIF Loop
                      </button>
                    </>
                  )}
                  {selectedPhoto.rawShots &&
                    selectedPhoto.rawShots.map((raw) => (
                      <React.Fragment key={raw.index}>
                        <span>•</span>
                        <button
                          onClick={() =>
                            handleDownload(raw.url, `MingleBooth_Raw_Pose${raw.index}_${selectedPhoto.photoId}.jpg`)
                          }
                          className="hover:text-blue-300 underline"
                        >
                          Pose {raw.index}
                        </button>
                      </React.Fragment>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
