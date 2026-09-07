import React, { useEffect } from 'react';
import { usePhotoboothStore } from './store/photobooth-store';
import { HeaderBar } from './components/HeaderBar';
import { CameraPreview } from './components/CameraPreview';
import { OperatorControls } from './components/OperatorControls';
import { InstantResultModal } from './components/InstantResultModal';
import { AdminTestingModal } from './components/AdminTestingModal';
import { StorageManagerModal } from './components/StorageManagerModal';
import { VendorAuthGate } from './components/VendorAuthGate';

export const App: React.FC = () => {
  const { initialize } = usePhotoboothStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <VendorAuthGate>
      <div className="flex flex-col h-screen w-screen bg-[#07090E] text-slate-100 overflow-hidden relative font-sans">
        {/* Top Header Navigation & Status Bar */}
        <HeaderBar />

        {/* Main Studio Viewport (Camera Preview & Framing Guides) */}
        <main className="flex-1 flex flex-col min-h-0 relative">
          <CameraPreview />
        </main>

        {/* Bottom Operator Controls & Tactile Capture Action */}
        <OperatorControls />

        {/* Instant Result & QR Review Modal */}
        <InstantResultModal />

        {/* Admin Testing Panel Modal */}
        <AdminTestingModal />

        {/* Photo Storage Directory Manager Modal */}
        <StorageManagerModal />
      </div>
    </VendorAuthGate>
  );
};
