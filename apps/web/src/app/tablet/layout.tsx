import type { Metadata, Viewport } from 'next';
import '../globals.css';

export const metadata: Metadata = {
  title: 'MingleBooth Studio — Unduh Software Photobooth Kiosk',
  description: 'Unduh MingleBooth Studio Desktop untuk macOS (.dmg) dan Windows (.exe).',
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

export default function TabletLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full bg-[#090A0C] text-[#EDEDED] font-sans">
      {children}
    </div>
  );
}
