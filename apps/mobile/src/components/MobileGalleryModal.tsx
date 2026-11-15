import React, { useState, useEffect, useMemo } from 'react';
import { useMobileBoothStore } from '../store/mobile-booth-store';
import {
  getEventMobileCaptures,
  clearDemoCaptures,
  getStorageEstimate,
  StorageEstimateInfo,
  MobileCaptureItem,
} from '../lib/mobileStorage';
import { syncPendingCaptures } from '../lib/mobileSync';
import {
  ArrowLeft,
  FolderPlus,
  FolderOpen,
  CloudUpload,
  RefreshCw,
  X,
  Film,
  Camera,
  Images,
  Trash2,
  Download,
  Printer,
  QrCode,
} from 'lucide-react';
import { PrintChoiceModal } from './PrintChoiceModal';
import { EventGalleryQrModal } from './EventGalleryQrModal';

interface MobileGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MobileGalleryModal: React.FC<MobileGalleryModalProps> = ({ isOpen, onClose }) => {
  const { currentEvent, isDemoMode, user, backendUrl, setIsAuthOpen } = useMobileBoothStore();
  const [captures, setCaptures] = useState<MobileCaptureItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [filterTab, setFilterTab] = useState<'all' | 'photo' | 'gif' | 'original'>('all');
  const [selectedCapture, setSelectedCapture] = useState<MobileCaptureItem | null>(null);
  const [lightboxTab, setLightboxTab] = useState<'photo' | 'gif' | 'original'>('photo');
  const [lightboxRawIndex, setLightboxRawIndex] = useState<number>(0);
  const [storageInfo, setStorageInfo] = useState<StorageEstimateInfo | null>(null);
  const [folderToast, setFolderToast] = useState<string | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
  const [isEventQrModalOpen, setIsEventQrModalOpen] = useState<boolean>(false);

  const loadCaptures = async () => {
    setIsLoading(true);
    try {
      const [items, storage] = await Promise.all([
        getEventMobileCaptures(currentEvent.id),
        getStorageEstimate(),
      ]);
      setCaptures(items);
      setStorageInfo(storage);
    } catch (err) {
      console.error('[GalleryModal] Failed to load captures:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadCaptures();
    }
  }, [isOpen, currentEvent.id]);

  // Counts
  const totalSessions = captures.length;
  const photoCount = captures.filter((c) => Boolean(c.photoDataUrl)).length;
  const gifCount = captures.filter((c) => Boolean(c.hasGif && c.gifDataUrl)).length;
  const totalRawPoses = useMemo(() => {
    return captures.reduce((acc, c) => acc + (c.rawShots?.length || 0), 0);
  }, [captures]);

  // Filtered photos
  const filteredPhotos = useMemo(() => {
    if (filterTab === 'gif') {
      return captures.filter((c) => c.hasGif && c.gifDataUrl);
    }
    if (filterTab === 'original') {
      return captures.filter((c) => c.rawShots && c.rawShots.length > 0);
    }
    return captures;
  }, [captures, filterTab]);

  if (!isOpen) return null;

  const handleManualSync = async () => {
    if (isDemoMode || !user?.token) return;
    setIsSyncing(true);
    try {
      await syncPendingCaptures(backendUrl, user.token, false);
      await loadCaptures();
    } catch (err) {
      console.error('[GalleryModal] Manual sync error:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClearDemo = async () => {
    if (confirm('Hapus seluruh sesi foto demo dari memori sementara perangkat?')) {
      await clearDemoCaptures();
      await loadCaptures();
    }
  };

  const handleFolderNotice = (msg: string) => {
    setFolderToast(msg);
    setTimeout(() => setFolderToast(null), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#090A0C] text-[#EDEDED] flex flex-col font-sans select-none overflow-hidden antialiased animate-fade-in">
      {/* ── Top Header Bar (1:1 Desktop Parity Screenshot 5) ── */}
      <header className="px-4 sm:px-6 py-2.5 border-b border-white/[0.08] bg-[#0F1014] flex flex-wrap items-center justify-between gap-3 shrink-0 min-h-[64px]">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-semibold text-neutral-200 hover:text-white flex items-center gap-2 transition-all cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali ke Studio</span>
          </button>

          <div className="h-4 w-[1px] bg-white/10 hidden sm:block shrink-0" />

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-semibold text-white truncate max-w-[200px] sm:max-w-md">
                Galeri Foto: {currentEvent?.name || 'Sesi Photobooth'}
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-[10px] font-medium text-neutral-300 shrink-0">
                Khusus Acara Terpilih
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 truncate">
              {totalSessions} sesi foto tersimpan •{' '}
              {isDemoMode
                ? 'Penyimpanan Sesi Sementara (Demo)'
                : 'Penyimpanan Internal Android / Native Documents'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={() =>
              handleFolderNotice('Folder acara: Directory.Documents/MingleBooth/' + (currentEvent?.name || 'demo'))
            }
            className="h-8 sm:h-9 px-2.5 sm:px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-medium text-neutral-200 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer"
            title="Atur atau buat folder penyimpanan di perangkat"
          >
            <FolderPlus className="w-3.5 h-3.5 text-neutral-300" />
            <span className="hidden xs:inline">Atur / Buat Folder</span>
          </button>

          <button
            type="button"
            onClick={() =>
              handleFolderNotice('Berkas foto tersimpan aman di internal device (MingleBooth/' + (currentEvent?.name || 'demo') + ')')
            }
            className="h-8 sm:h-9 px-2.5 sm:px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-medium text-neutral-200 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer"
            title="Informasi lokasi folder foto di perangkat"
          >
            <FolderOpen className="w-3.5 h-3.5 text-neutral-300" />
            <span className="hidden xs:inline">Buka Folder</span>
          </button>

          {!isDemoMode && user?.token && (
            <button
              type="button"
              onClick={handleManualSync}
              disabled={isSyncing}
              className={`h-8 sm:h-9 px-2.5 sm:px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                isSyncing
                  ? 'bg-blue-600/20 border-blue-500/30 text-blue-300 animate-pulse'
                  : 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-400 hover:text-emerald-300'
              }`}
              title="Unggah semua foto lokal acara ini ke Cloud Supabase agar bisa di-scan dari HP"
            >
              <CloudUpload className={`w-3.5 h-3.5 ${isSyncing ? 'animate-bounce' : ''}`} />
              <span className="hidden xs:inline">{isSyncing ? 'Menyinkronkan...' : 'Sinkronkan ke Cloud'}</span>
            </button>
          )}

          {isDemoMode && captures.length > 0 && (
            <button
              type="button"
              onClick={handleClearDemo}
              className="h-8 sm:h-9 px-2.5 sm:px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-xs font-medium text-rose-300 flex items-center gap-1.5 transition-all cursor-pointer"
              title="Bersihkan foto demo"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Hapus Demo</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsEventQrModalOpen(true)}
            className="h-8 sm:h-9 px-2.5 sm:px-3 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-xs font-semibold text-cyan-400 flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95 shrink-0"
            title="Tampilkan QR Galeri untuk seluruh album acara"
          >
            <QrCode className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="hidden xs:inline">QR Galeri</span>
          </button>

          <button
            type="button"
            onClick={() => loadCaptures()}
            className="h-8 sm:h-9 px-2.5 sm:px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-xs font-medium text-neutral-200 hover:text-white flex items-center gap-1.5 transition-all cursor-pointer"
            title="Muat ulang galeri"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Perbarui</span>
          </button>
        </div>
      </header>

      {/* Folder Toast Notice */}
      {folderToast && (
        <div className="z-40 px-4 py-2 bg-neutral-900 border-b border-white/10 text-neutral-200 text-xs flex items-center justify-between shrink-0 animate-fadeIn">
          <span>{folderToast}</span>
          <button
            type="button"
            onClick={() => setFolderToast(null)}
            className="text-neutral-400 hover:text-white text-xs font-bold px-2 py-0.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Filter Navigation Bar (1:1 Desktop Parity Screenshot 5) ── */}
      <div className="px-4 sm:px-6 py-2.5 border-b border-white/[0.06] bg-[#0C0D10] flex items-center justify-between shrink-0 overflow-x-auto">
        <div className="flex items-center gap-1.5 bg-[#141519] p-1 rounded-xl border border-white/[0.08] shrink-0">
          <button
            type="button"
            onClick={() => setFilterTab('all')}
            className={`px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              filterTab === 'all'
                ? 'bg-white text-black font-semibold shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Semua ({totalSessions})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('photo')}
            className={`px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              filterTab === 'photo'
                ? 'bg-white text-black font-semibold shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Foto Cetak ({photoCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('gif')}
            className={`px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
              filterTab === 'gif'
                ? 'bg-white text-black font-semibold shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Animasi GIF ({gifCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('original')}
            className={`px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
              filterTab === 'original'
                ? 'bg-white text-black font-semibold shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Foto Original ({totalRawPoses > 0 ? totalRawPoses : totalSessions})</span>
          </button>
        </div>

        <div className="text-xs text-neutral-400 hidden lg:block shrink-0 ml-4 truncate">
          Acara aktif: <span className="text-white font-medium">{currentEvent?.name || 'Sesi Photobooth'}</span>
        </div>
      </div>

      {/* ── Gallery Grid Body (Proportional and Uncropped) ── */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-0">
        {isLoading ? (
          <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-xs text-neutral-400 gap-3">
            <RefreshCw className="w-7 h-7 animate-spin text-white" />
            <span>Memuat galeri acara {currentEvent?.name}...</span>
          </div>
        ) : filteredPhotos.length === 0 ? (
          <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-6 gap-3">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center text-neutral-400">
              <Camera className="w-8 h-8 text-neutral-300" />
            </div>
            <div>
              <h4 className="text-base font-semibold text-white">Belum Ada Sesi Foto</h4>
              <p className="text-xs text-neutral-400 max-w-md mt-1.5 leading-relaxed">
                Foto yang diambil pada sesi photobooth acara &quot;{currentEvent?.name}&quot; akan tampil di galeri ini.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 h-9 px-4 rounded-xl bg-white text-black font-semibold text-xs transition-all hover:bg-neutral-200 cursor-pointer shadow-md"
            >
              Mulai Sesi Photobooth
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
            {filteredPhotos.map((item, idx) => (
              <div
                key={item.photoId || idx}
                onClick={() => {
                  setSelectedCapture(item);
                  setLightboxTab(
                    filterTab === 'gif' && item.hasGif
                      ? 'gif'
                      : filterTab === 'original'
                      ? 'original'
                      : 'photo'
                  );
                  setLightboxRawIndex(0);
                }}
                className="group relative aspect-[2/3] rounded-2xl overflow-hidden bg-[#0A0B0E] border border-white/[0.08] hover:border-white/30 transition-all cursor-pointer shadow-lg hover:shadow-2xl flex items-center justify-center p-1"
              >
                <img
                  src={
                    filterTab === 'original' && item.rawShots && item.rawShots.length > 0
                      ? item.rawShots[0].dataUrl
                      : item.photoDataUrl
                  }
                  alt={item.photoId}
                  className="w-full h-full object-contain rounded-xl group-hover:scale-[1.02] transition-transform duration-300"
                />

                {/* Badges Top (Screenshot 5 parity) */}
                <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                  {item.hasGif && (
                    <div className="px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-sm border border-white/20 text-[10px] font-bold text-white flex items-center gap-1 shadow-sm">
                      <Film className="w-2.5 h-2.5" />
                      <span>GIF</span>
                    </div>
                  )}
                  {item.rawShots && item.rawShots.length > 0 && (
                    <div className="px-1.5 py-0.5 rounded-md bg-black/75 backdrop-blur-sm border border-white/20 text-[10px] font-medium text-neutral-300 shadow-sm">
                      {item.rawShots.length} Pose
                    </div>
                  )}
                  {item.isDemo && (
                    <div className="px-1.5 py-0.5 rounded-md bg-amber-500/80 text-[9px] font-bold text-black uppercase shadow-sm">
                      Demo
                    </div>
                  )}
                </div>

                {/* Bottom Details Overlay (Screenshot 5 parity) */}
                <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex items-end justify-between">
                  <span className="text-[11px] font-mono text-white/90">
                    {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="text-[11px] text-white/70 group-hover:text-white transition-colors font-medium">
                    Buka &rarr;
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── Detail / Lightbox Modal ── */}
      {selectedCapture && (
        <div
          onClick={() => setSelectedCapture(null)}
          className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 select-none animate-fadeIn"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-lg w-full bg-[#121316] border border-white/10 rounded-3xl p-4 sm:p-6 flex flex-col items-center shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <button
              type="button"
              onClick={() => setSelectedCapture(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 text-neutral-300 hover:text-white flex items-center justify-center transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Lightbox Switcher */}
            <div className="flex items-center p-1 rounded-xl bg-white/[0.06] border border-white/[0.08] gap-1 mb-3 shrink-0">
              <button
                type="button"
                onClick={() => setLightboxTab('photo')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  lightboxTab === 'photo' ? 'bg-white text-black shadow-sm font-bold' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Foto Cetak
              </button>
              {selectedCapture.hasGif && selectedCapture.gifDataUrl && (
                <button
                  type="button"
                  onClick={() => setLightboxTab('gif')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer ${
                    lightboxTab === 'gif' ? 'bg-white text-black shadow-sm font-bold' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <Film className="w-3 h-3" />
                  <span>Animasi GIF</span>
                </button>
              )}
              {selectedCapture.rawShots && selectedCapture.rawShots.length > 0 && (
                <button
                  type="button"
                  onClick={() => setLightboxTab('original')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer ${
                    lightboxTab === 'original' ? 'bg-white text-black shadow-sm font-bold' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <Camera className="w-3 h-3" />
                  <span>Foto Original</span>
                </button>
              )}
            </div>

            {/* Pose sub-selector for original raw shots */}
            {lightboxTab === 'original' && selectedCapture.rawShots && selectedCapture.rawShots.length > 1 && (
              <div className="flex items-center gap-1.5 bg-white/[0.04] p-1 rounded-xl border border-white/[0.06] overflow-x-auto max-w-full mb-3 shrink-0">
                {selectedCapture.rawShots.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setLightboxRawIndex(idx)}
                    className={`px-2.5 py-0.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                      lightboxRawIndex === idx
                        ? 'bg-white text-black font-semibold shadow-sm'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Pose {idx + 1}
                  </button>
                ))}
              </div>
            )}

            {/* Image Preview Box */}
            <div className="relative max-h-[38vh] w-auto flex items-center justify-center rounded-2xl overflow-hidden bg-black border border-white/10 shadow-inner mb-3 shrink-0">
              <img
                src={
                  lightboxTab === 'photo'
                    ? selectedCapture.photoDataUrl
                    : lightboxTab === 'gif' && selectedCapture.gifDataUrl
                    ? selectedCapture.gifDataUrl
                    : selectedCapture.rawShots && selectedCapture.rawShots[lightboxRawIndex]
                    ? selectedCapture.rawShots[lightboxRawIndex].dataUrl
                    : selectedCapture.photoDataUrl
                }
                alt={selectedCapture.photoId}
                className="max-h-[38vh] w-auto object-contain rounded-xl"
              />

              {/* Demo Watermark if in demo mode */}
              {selectedCapture.isDemo && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="rotate-[-25deg] border-2 border-amber-400/40 bg-black/60 backdrop-blur-[2px] px-5 py-2 rounded-xl text-amber-300/80 font-black tracking-widest text-[11px] uppercase shadow-2xl select-none">
                    MINGLEBOOTH DEMO • CETAK TERKUNCI
                  </div>
                </div>
              )}
            </div>

            {/* Actions: Cetak Foto & Tampilkan QR Galeri */}
            <div className="w-full grid grid-cols-2 gap-2 mb-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(true)}
                className={`h-11 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-98 cursor-pointer ${
                  selectedCapture.isDemo || isDemoMode
                    ? 'bg-[#18140f] border border-amber-600/80 text-amber-400'
                    : 'bg-white hover:bg-neutral-200 text-black'
                }`}
                title={selectedCapture.isDemo || isDemoMode ? 'Cetak Foto (Terkunci di Mode Demo)' : 'Cetak Foto'}
              >
                <Printer className="w-4 h-4 shrink-0" />
                <span>{selectedCapture.isDemo || isDemoMode ? 'Cetak (Demo)' : 'Cetak Foto'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsEventQrModalOpen(true)}
                className="h-11 px-3 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-98"
                title="Tampilkan QR Galeri untuk seluruh album acara"
              >
                <QrCode className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Tampilkan QR Galeri</span>
              </button>
            </div>

            {/* Metadata Footer */}
            <div className="w-full text-center text-xs text-neutral-300 space-y-0.5 pt-1 border-t border-white/[0.08]">
              <p className="font-mono text-[11px] text-neutral-400">{selectedCapture.photoId}</p>
              <p className="text-[10px] text-neutral-500">
                Waktu:{' '}
                {new Date(selectedCapture.createdAt).toLocaleString([], {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </p>
              <p className="text-[10px] text-neutral-400">
                Status:{' '}
                {selectedCapture.isDemo ? (
                  <span className="text-amber-400 font-medium">Mode Demo (Penyimpanan Sementara di RAM)</span>
                ) : selectedCapture.syncStatus === 'synced' ? (
                  <span className="text-emerald-400 font-medium">Tersinkronisasi Cloud</span>
                ) : (
                  <span className="text-blue-400 font-medium">Tersimpan di Dokumen Perangkat</span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Print Choice Modal */}
      {selectedCapture && (
        <PrintChoiceModal
          isOpen={isPrintModalOpen}
          onClose={() => setIsPrintModalOpen(false)}
          compositePhotoUrl={selectedCapture.photoDataUrl}
          rawShots={selectedCapture.rawShots}
          isDemoMode={selectedCapture.isDemo || isDemoMode}
          onOpenSubscription={() => setIsAuthOpen(true)}
        />
      )}

      {/* Event Gallery QR Modal */}
      <EventGalleryQrModal
        isOpen={isEventQrModalOpen}
        onClose={() => setIsEventQrModalOpen(false)}
        eventId={currentEvent.id}
        eventName={currentEvent.name}
        backendUrl={backendUrl}
        isDemoMode={isDemoMode}
        onOpenSubscription={() => setIsAuthOpen(true)}
      />
    </div>
  );
};
