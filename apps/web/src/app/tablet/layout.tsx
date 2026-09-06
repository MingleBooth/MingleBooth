import type { Metadata, Viewport } from 'next';
import '../globals.css';

export const metadata: Metadata = {
  title: 'MingleBooth Tablet Studio — Operator Photobooth',
  description: 'Sistem Operasi Photobooth Profesional untuk iPad dan Android Tablet.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'MingleBooth',
  },
  icons: {
    icon: '/icon.png',
    apple: '/icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#090A0C',
};

import { VendorAuthGate } from '@/components/VendorAuthGate';

export default function TabletLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen w-screen overflow-hidden bg-[#090A0C] text-[#EDEDED] select-none touch-none font-sans">
      <VendorAuthGate>{children}</VendorAuthGate>
    </div>
  );
}
