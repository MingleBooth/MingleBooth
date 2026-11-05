import React from 'react';
import Link from 'next/link';

interface FooterProps {
  showLynkNotice?: boolean;
  showDokuNotice?: boolean;
}

export function Footer({ showLynkNotice = false, showDokuNotice = false }: FooterProps) {
  const showPayment = showLynkNotice || showDokuNotice;
  return (
    <footer className="border-t border-mb-line py-8 text-mb-muted text-[15px] font-sans">
      <div className="max-w-[1080px] mx-auto px-5 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
        <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-5 gap-y-2">
          <Link href="/" className="hover:text-mb-ink transition-colors">
            Beranda
          </Link>
          <Link href="/dashboard" className="hover:text-mb-ink transition-colors">
            Vendor Dashboard
          </Link>
          <Link href="/billing" className="hover:text-mb-ink transition-colors">
            Paket Lisensi
          </Link>
          <Link href="/login" className="hover:text-mb-ink transition-colors">
            Unduh Studio
          </Link>
          <Link href="/login" className="hover:text-mb-ink transition-colors">
            Masuk
          </Link>
          <Link href="/register" className="hover:text-mb-ink transition-colors">
            Daftar Vendor
          </Link>
        </div>

        <div className="flex flex-col items-center md:items-end gap-1">
          <span>
            &copy; 2026 MingleBooth by{' '}
            <a
              href="https://www.instagram.com/sebuah.kenang"
              target="_blank"
              rel="noopener noreferrer"
              className="text-mb-ink underline decoration-mb-muted/50 hover:decoration-mb-ink font-medium transition-colors"
            >
              sebuah.kenang
            </a>
            . Setiap Momen Berarti.
          </span>
          {showPayment && (
            <span className="text-xs text-mb-muted opacity-80">
              Sistem Pembayaran Aman &amp; Terverifikasi Otomatis
            </span>
          )}
        </div>
      </div>
    </footer>
  );
}
