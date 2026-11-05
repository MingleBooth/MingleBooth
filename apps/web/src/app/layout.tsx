import type { Metadata, Viewport } from 'next';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

const siteUrl = 'https://www.minglebooth.id';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'MingleBooth — Software Photobooth Indonesia #1 | Kiosk Foto & Event',
    template: '%s | MingleBooth Software Photobooth',
  },
  description:
    'Software photobooth modern #1 di Indonesia untuk laptop (macOS & Windows) dan tablet/Android. Kompatibel dengan kamera Sony Mirrorless (USB PC Remote), webcam, cetak foto otomatis, QR download tamu instan, dan 100% offline-first.',
  keywords: [
    'software photobooth',
    'software photo',
    'photobooth',
    'aplikasi photobooth',
    'software photobooth indonesia',
    'software photobooth wedding',
    'software photobooth laptop',
    'software photobooth mac',
    'software photobooth windows',
    'software photobooth sony',
    'aplikasi photo booth',
    'kiosk photobooth',
    'software cetak foto',
    'photobooth event',
    'minglebooth',
    'mingle booth',
    'software selfie photobooth',
    'aplikasi kamera photobooth',
    'tethering kamera sony photobooth',
  ],
  authors: [{ name: 'MingleBooth Team', url: siteUrl }],
  creator: 'MingleBooth',
  publisher: 'MingleBooth',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    title: 'MingleBooth — Software Photobooth Indonesia #1',
    description:
      'Software photobooth terbaik untuk vendor event, wedding, dan fotografer di Indonesia. Koneksi kamera Sony USB PC Remote, cetak otomatis, QR download instan, dan 100% offline-first.',
    url: siteUrl,
    siteName: 'MingleBooth',
    images: [
      {
        url: '/logo-studio-tight.png',
        width: 1200,
        height: 630,
        alt: 'MingleBooth Software Photobooth Indonesia',
      },
    ],
    locale: 'id_ID',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MingleBooth — Software Photobooth Indonesia #1',
    description:
      'Software photobooth terbaik untuk vendor event & wedding di Indonesia. Cepat, tangguh, dan 100% offline-first.',
    images: ['/logo-studio-tight.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: 'google10fa59cf98c7853a.html',
    other: {
      'google-site-verification': ['10fa59cf98c7853a', 'google10fa59cf98c7853a.html'],
    },
  },
  icons: {
    icon: '/icon.png',
    apple: '/icon.png',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: 'MingleBooth Studio',
      operatingSystem: 'macOS, Windows 10/11, Android, iOS',
      applicationCategory: 'PhotographyApplication',
      description:
        'Software photobooth profesional dan modern di Indonesia. Mendukung kamera Sony Mirrorless, USB PC Remote tethering, webcam, cetak foto otomatis, QR code album instan, dan offline-first.',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'IDR',
        priceValidUntil: '2028-12-31',
        availability: 'https://schema.org/InStock',
      },
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: '4.9',
        ratingCount: '128',
      },
      featureList: [
        'Live View Streaming & Sony PC Remote Tethering',
        'Automatic Photo Printing & Strip Cutter',
        'Instant Guest Download QR Code',
        'Offline-First Capture & Cloud Sync Queue',
        'GIF Boomerang & Custom Frame Overlays',
      ],
    },
    {
      '@type': 'Organization',
      name: 'MingleBooth',
      url: siteUrl,
      logo: `${siteUrl}/logo-minglebooth.png`,
      sameAs: [
        'https://instagram.com/minglebooth',
        'https://tiktok.com/@minglebooth',
      ],
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'Customer Support',
        availableLanguage: ['Indonesian', 'English'],
      },
    },
    {
      '@type': 'WebSite',
      url: siteUrl,
      name: 'MingleBooth',
      description: 'Platform Ekosistem Software Photobooth Profesional Indonesia',
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  if (prefersDark) {
                    document.documentElement.classList.add('dark');
                    document.documentElement.setAttribute('data-theme', 'dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                    document.documentElement.setAttribute('data-theme', 'light');
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;700;800&family=Figtree:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-mb-bg text-mb-ink antialiased">
        {children}
      </body>
    </html>
  );
}
