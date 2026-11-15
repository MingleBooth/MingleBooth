import React, { useState, useEffect } from 'react';
import { useMobileBoothStore } from './store/mobile-booth-store';
import { ReviewResultModal } from './components/ReviewResultModal';
import { StudioSetupView } from './components/StudioSetupView';
import { SonyDirectCamera } from './lib/plugins/sonyCameraPlugin';
import { EventGalleryQrModal } from './components/EventGalleryQrModal';
import logoHeader from './assets/logo-minglebooth-header.png';
import { FolderPlus, Images, User, ShieldCheck, LogOut, QrCode } from 'lucide-react';
import './index.css';

// Check URL params early
const urlParamsEarly = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
const isConnectedMock = urlParamsEarly ? urlParamsEarly.get('connected') === 'true' : false;

if (isConnectedMock) {
  SonyDirectCamera.getCameraStatus = async () => ({
    isConnected: true,
    state: 'CAMERA_READY',
    model: 'Sony Alpha-A6300',
    batteryLevel: 95,
    isLiveViewStreaming: true,
  });
  SonyDirectCamera.startLiveView = async () => ({
    streamUrl: '',
    width: 1024,
    height: 682,
    fps: 30,
  });
}

// Immediately seed store synchronously so initial render has full data
useMobileBoothStore.setState({
  isReviewOpen: true,
  isDemoMode: true,
  licenseStatus: 'demo',
  phase: 'setup',
  setupTab: 'camera',
  cameraMode: 'usb_direct',
  usbCameraConnected: isConnectedMock,
  usbCameraModel: isConnectedMock ? 'Sony Alpha-A6300' : 'Camera',
  usbCameraState: isConnectedMock ? 'LIVE_VIEW_STREAMING' : 'DISCONNECTED',
  usbLiveViewUrl: null,
  composedPhotoUrl: '',
  composedGifUrl: '',
  user: {
    id: 'usr_demo',
    email: 'demo@minglebooth.id',
    vendorName: 'MingleBooth Headquarters',
    organizationId: 'org_demo',
    planTier: 'free',
    deviceLimit: 1,
    activeDevicesCount: 1,
    isDemo: true,
    token: 'valid_demo_token',
  },
  currentEvent: {
    id: 'evt_demo_mobile',
    name: 'Grand Celebration 2026',
    code: 'CELEBRATE2026',
    date: '2026-08-29',
    hashtag: '#MingleBoothParty',
  },
  rawShots: [],
});

export const PreviewApp: React.FC = () => {
  const [currentView, setCurrentView] = useState<'camera' | 'review'>('camera');
  const [mode, setMode] = useState<'demo' | 'paid'>('demo');
  const [hideControls, setHideControls] = useState(false);

  const setView = (view: 'camera' | 'review') => {
    setCurrentView(view);
    if (view === 'camera') {
      useMobileBoothStore.setState({
        isReviewOpen: false,
        phase: 'setup',
        setupTab: 'camera',
        cameraMode: 'usb_direct',
        usbCameraConnected: isConnectedMock,
        usbCameraModel: isConnectedMock ? 'Sony Alpha-A6300' : 'Camera',
        usbCameraState: isConnectedMock ? 'LIVE_VIEW_STREAMING' : 'DISCONNECTED',
        usbLiveViewUrl: null,
      });
    } else {
      useMobileBoothStore.setState({
        isReviewOpen: true,
      });
    }
  };

  const setDemoModeActive = (isDemo: boolean) => {
    setMode(isDemo ? 'demo' : 'paid');
    useMobileBoothStore.setState({
      isDemoMode: isDemo,
      licenseStatus: isDemo ? 'demo' : 'valid',
      user: isDemo
        ? {
            id: 'usr_demo',
            email: 'demo@minglebooth.id',
            vendorName: 'MingleBooth Headquarters',
            organizationId: 'org_demo',
            planTier: 'free',
            deviceLimit: 1,
            activeDevicesCount: 1,
            isDemo: true,
            token: 'valid_demo_token',
          }
        : {
            id: 'usr_memorie_pro',
            email: 'vendor@memoriephotobooth.id',
            vendorName: 'Memorie Photobooth Official',
            organizationId: 'org_memorie',
            planTier: 'pro',
            deviceLimit: 5,
            activeDevicesCount: 1,
            isDemo: false,
            token: 'valid_jwt_token_paid_vendor',
          },
    });
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const viewParam = urlParams.get('view');
    if (viewParam === 'review') {
      setView('review');
    } else {
      setView('camera');
    }
    if (urlParams.get('mode') === 'paid') {
      setDemoModeActive(false);
    } else {
      setDemoModeActive(true);
    }
    if (urlParams.get('hideControls') === 'true') {
      setHideControls(true);
    }

    if (isConnectedMock) {
      const timer = setTimeout(() => {
        useMobileBoothStore.setState({
          usbCameraConnected: true,
          usbCameraModel: 'Sony Alpha-A6300',
          usbCameraState: 'LIVE_VIEW_STREAMING',
          usbLiveViewUrl: null,
        });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <div className="relative w-screen h-screen bg-[#090A0C] text-[#EDEDED] flex flex-col font-sans select-none antialiased overflow-hidden">
      {/* Demo Banner */}
      {mode === 'demo' && (
        <div className="z-50 bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 text-black font-semibold text-xs px-3 sm:px-4 py-1.5 sm:py-2 flex items-center justify-between shadow-lg border-b border-amber-400/40 select-none shrink-0 safe-top">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
            <span className="px-2 py-0.5 rounded bg-black/25 text-black font-mono font-bold text-[10px] uppercase tracking-wider shrink-0">
              DEMO MODE
            </span>
            <span className="font-medium text-black hidden sm:inline truncate">
              Akun: MingleBooth Headquarters • Langganan Belum Aktif • Fitur Berbayar Terkunci (Pengujian Kamera Lokal)
            </span>
            <span className="font-medium text-black sm:hidden text-[11px] truncate">
              Akun: MingleBooth Headquarters • Demo
            </span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-2">
            <button
              type="button"
              className="px-2 sm:px-3 py-1 rounded-lg bg-black text-white font-bold text-[11px] sm:text-xs flex items-center gap-1.5 shadow-sm"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="hidden sm:inline">Aktifkan Langganan</span>
              <span className="sm:hidden">Aktifkan</span>
            </button>
            <button
              type="button"
              className="px-2 sm:px-2.5 py-1 rounded-lg bg-black/20 text-black font-semibold text-[11px] sm:text-xs flex items-center gap-1"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span>Keluar</span>
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="h-14 px-3 sm:px-5 border-b border-white/[0.08] bg-[#0F1014] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <img src={logoHeader} alt="MingleBooth" className="h-6 sm:h-7 w-auto object-contain shrink-0" />
          <div className="h-3.5 w-[1px] bg-white/10 hidden sm:block" />
          <span className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase hidden sm:inline truncate">
            Studio Setup
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => useMobileBoothStore.getState().setIsEventQrModalOpen(true)}
            className="h-8 px-2.5 sm:px-3 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-xs font-semibold text-cyan-400 flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
            title="Tampilkan QR Galeri untuk seluruh album acara"
          >
            <QrCode className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">QR Galeri</span>
          </button>
          <button
            type="button"
            className="h-8 px-2.5 sm:px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs font-medium text-neutral-300 flex items-center gap-1.5"
          >
            <FolderPlus className="w-3.5 h-3.5 text-neutral-400" />
            <span className="hidden sm:inline">Folder</span>
          </button>
          <button
            type="button"
            onClick={() => useMobileBoothStore.getState().setIsGalleryOpen(true)}
            className="h-8 px-2.5 sm:px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs font-medium text-neutral-300 flex items-center gap-1.5"
          >
            <Images className="w-3.5 h-3.5 text-neutral-400" />
            <span>Galeri</span>
          </button>
          <button
            type="button"
            className="h-8 px-2.5 sm:px-3 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs font-medium text-neutral-400 flex items-center gap-1.5"
          >
            <User className="w-3.5 h-3.5 text-neutral-400" />
            <span className="hidden sm:inline">Akun</span>
          </button>
        </div>
      </header>

      {/* Main Content View */}
      {currentView === 'camera' ? (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <StudioSetupView />
        </div>
      ) : (
        <ReviewResultModal />
      )}

      {/* Event Gallery QR Modal */}
      <EventGalleryQrModal
        isOpen={useMobileBoothStore((s) => s.isEventQrModalOpen)}
        onClose={() => useMobileBoothStore.getState().setIsEventQrModalOpen(false)}
        eventId={useMobileBoothStore.getState().currentEvent?.id || ''}
        eventName={useMobileBoothStore.getState().currentEvent?.name || 'Acara Photobooth'}
        backendUrl={useMobileBoothStore.getState().backendUrl}
        isDemoMode={useMobileBoothStore.getState().isDemoMode}
        onOpenSubscription={() => useMobileBoothStore.getState().setIsAuthOpen(true)}
      />

      {/* Floating switcher for test / screenshot capture */}
      {!hideControls && (
        <div className="fixed bottom-4 right-4 z-[9999] flex items-center gap-2 bg-black/95 p-2 rounded-2xl border border-white/20 shadow-2xl backdrop-blur-md">
          <button
            type="button"
            onClick={() => setView('camera')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              currentView === 'camera'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Tab Kamera
          </button>
          <button
            type="button"
            onClick={() => setView('review')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              currentView === 'review'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Review Result
          </button>
        </div>
      )}
    </div>
  );
};

export default PreviewApp;
