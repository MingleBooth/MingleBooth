'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Menu, X, Play, LogIn, LayoutDashboard, LogOut, Download } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface NavbarProps {
  activePage?: 'home' | 'pricing' | 'download' | 'login' | 'register' | 'dashboard';
}

export function Navbar({ activePage }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [user, setUser] = useState<{ id?: string; email?: string } | null>(null);

  useEffect(() => {
    // 1. Check local session
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('mb_web_user');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed && (parsed.id || parsed.email)) {
            setUser(parsed);
          }
        } catch {
          // ignore
        }
      }
    }

    // 2. Check supabase session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email });
      }
    });

    // 3. Realtime listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email });
      } else {
        const stored = typeof window !== 'undefined' ? localStorage.getItem('mb_web_user') : null;
        if (stored) {
          try {
            setUser(JSON.parse(stored));
          } catch {
            setUser(null);
          }
        } else {
          setUser(null);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('mb_web_user');
      localStorage.removeItem('mb_web_token');
    }
    await supabase.auth.signOut();
    setUser(null);
    setMobileMenuOpen(false);
  };

  return (
    <header className="bg-[#0B0B0D] text-white border-b border-white/10 sticky top-0 z-50 transition-colors">
      <div className="max-w-[1080px] mx-auto px-5 py-4 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD21F] rounded-lg">
          <img
            src="/logo-minglebooth-header.png"
            alt="MingleBooth"
            className="h-9 w-auto object-contain block"
          />
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6 text-[17px] font-medium font-sans">
          <Link
            href="/#demo"
            className="text-[#B8B8BE] hover:text-white transition-colors"
          >
            Coba Demo
          </Link>
          <Link
            href="/billing"
            className={`transition-colors ${
              activePage === 'pricing' ? 'text-[#FFD21F]' : 'text-[#B8B8BE] hover:text-white'
            }`}
          >
            Paket &amp; Lisensi
          </Link>
          <Link
            href={user ? '/dashboard' : '/login'}
            className="transition-colors text-[#B8B8BE] hover:text-white"
          >
            Unduh Aplikasi
          </Link>

          {user ? (
            <div className="flex items-center gap-3 ml-2">
              <Link
                href="/dashboard"
                className="px-4 py-2 rounded-full bg-white text-[#0B0B0D] font-semibold text-[15px] hover:bg-neutral-100 transition-all flex items-center gap-2"
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>Dashboard</span>
              </Link>
              <button
                onClick={handleLogout}
                title="Keluar"
                className="p-2 rounded-full text-[#B8B8BE] hover:text-white hover:bg-white/10 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 ml-2">
              <Link
                href="/login"
                className="text-[#B8B8BE] hover:text-white transition-colors px-2 py-1"
              >
                Masuk
              </Link>
              <Link
                href="/register"
                className="px-4 py-2 rounded-full bg-white text-[#0B0B0D] font-semibold text-[15px] hover:bg-neutral-100 transition-all"
              >
                Daftar Vendor
              </Link>
            </div>
          )}
        </nav>

        {/* Mobile Hamburger Button */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 rounded-lg text-[#B8B8BE] hover:text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFD21F]"
          aria-label={mobileMenuOpen ? 'Tutup menu' : 'Buka menu'}
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-white/10 bg-[#0B0B0D] px-5 py-6 space-y-4 font-sans animate-fadeIn">
          <Link
            href="/#demo"
            onClick={() => setMobileMenuOpen(false)}
            className="block text-[#B8B8BE] hover:text-white text-base py-1.5"
          >
            Coba Demo
          </Link>
          <Link
            href="/billing"
            onClick={() => setMobileMenuOpen(false)}
            className="block text-[#B8B8BE] hover:text-white text-base py-1.5"
          >
            Paket &amp; Lisensi
          </Link>
          <Link
            href={user ? '/dashboard' : '/login'}
            onClick={() => setMobileMenuOpen(false)}
            className="block text-[#B8B8BE] hover:text-white text-base py-1.5"
          >
            Unduh Aplikasi Studio
          </Link>

          <div className="pt-4 border-t border-white/10 flex flex-col gap-3">
            {user ? (
              <>
                <Link
                  href="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full py-3 rounded-full bg-white text-[#0B0B0D] font-semibold text-center text-base"
                >
                  Buka Vendor Dashboard
                </Link>
                <button
                  onClick={handleLogout}
                  className="w-full py-2.5 rounded-full border border-white/20 text-white font-medium text-center text-sm"
                >
                  Keluar Akun
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/register"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full py-3 rounded-full bg-white text-[#0B0B0D] font-semibold text-center text-base"
                >
                  Buat Akun Vendor Gratis
                </Link>
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full py-2.5 rounded-full border border-white/20 text-white font-medium text-center text-sm"
                >
                  Masuk ke Portal
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
