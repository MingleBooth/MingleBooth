import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MINGLEBOOTH — Ekosistem Photobooth Profesional',
  description:
    'Sistem operasi photobooth modern offline-first pertama untuk vendor wedding, corporate event, dan fotografer di Indonesia.',
  icons: {
    icon: '/icon.png',
    apple: '/icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="dark" style={{ backgroundColor: '#090A0C', color: '#EDEDED' }}>
      <body
        style={{
          backgroundColor: '#090A0C',
          color: '#EDEDED',
          minHeight: '100vh',
          margin: 0,
          padding: 0,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
        }}
        className="bg-[#090A0C] text-[#EDEDED] antialiased"
      >
        {children}
      </body>
    </html>
  );
}
