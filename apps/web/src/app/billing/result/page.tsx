'use client';

import React, { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  Monitor,
  Building2,
  Receipt,
  Calendar,
  CreditCard,
  LogIn,
} from 'lucide-react';

interface VerificationResult {
  success: boolean;
  status: 'SUCCESS' | 'PROCESSING' | 'FAILED' | 'EXPIRED' | 'UNKNOWN';
  paymentStatus?: string;
  isSettled?: boolean;
  order?: {
    orderId: string;
    planTier: string;
    amountIdr: number;
    billingInterval?: string;
    durationDays?: number;
    paidAt?: string;
    providerTransactionId?: string;
    paymentMethod?: string;
  };
  organization?: {
    id: string;
    name: string;
    planTier: string;
    subscriptionStatus: string;
    subscriptionExpiresAt: string;
    maxDevicesQuota: number;
    isEntitlementActive: boolean;
  };
  message?: string;
  error?: string;
  code?: string;
}

function PaymentResultContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderId = searchParams.get('orderId') || searchParams.get('invoice_number') || '';

  const [state, setState] = useState<'IDLE' | 'LOADING' | 'SUCCESS' | 'PROCESSING' | 'FAILED' | 'EXPIRED' | 'AUTH_REQUIRED' | 'INVALID'>('IDLE');
  const [data, setData] = useState<VerificationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [pollCount, setPollCount] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const maxPolls = 10; // 10 attempts * 3s = 30 seconds max auto-polling
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const getAuthToken = (): string => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('mb_web_token') || '';
  };

  const verifyOrder = useCallback(
    async (isManualRefresh = false) => {
      if (!orderId) {
        setState('INVALID');
        return;
      }

      const token = getAuthToken();
      if (!token) {
        setState('AUTH_REQUIRED');
        return;
      }

      if (isManualRefresh) {
        setIsRefreshing(true);
      }

      try {
        const res = await fetch('/api/vendor/billing/verify-order', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ orderId }),
        });

        const json: VerificationResult = await res.json().catch(() => ({
          success: false,
          status: 'UNKNOWN' as const,
          error: 'Format respons tidak valid',
        }));

        if (res.status === 401 || json.code === 'AUTH_REQUIRED') {
          setState('AUTH_REQUIRED');
          return;
        }

        if (res.status === 403 && json.code === 'ORG_MISMATCH') {
          setState('FAILED');
          setErrorMessage('Pesanan ini milik akun vendor lain. Pastikan Anda masuk dengan akun yang sesuai.');
          return;
        }

        if (res.status === 404 || json.code === 'ORDER_NOT_FOUND') {
          setState('INVALID');
          setErrorMessage(`Nomor pesanan ${orderId} tidak ditemukan.`);
          return;
        }

        setData(json);

        if (json.status === 'SUCCESS' || json.paymentStatus === 'PAID') {
          setState('SUCCESS');
          if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
        } else if (json.status === 'FAILED' || json.paymentStatus === 'FAILED') {
          setState('FAILED');
          setErrorMessage(json.message || 'Pembayaran dinyatakan gagal oleh penyedia pembayaran.');
          if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
        } else if (json.status === 'EXPIRED' || json.paymentStatus === 'EXPIRED') {
          setState('EXPIRED');
          setErrorMessage(json.message || 'Waktu pembayaran telah kedaluwarsa.');
          if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
        } else {
          // PROCESSING or PENDING
          setState('PROCESSING');
          setPollCount((prev) => {
            const nextCount = prev + 1;
            if (nextCount < maxPolls) {
              pollTimerRef.current = setTimeout(() => {
                verifyOrder(false);
              }, 3000);
            }
            return nextCount;
          });
        }
      } catch (err: any) {
        console.error('Verify order network error:', err);
        if (state === 'IDLE' || state === 'LOADING') {
          setState('PROCESSING');
        }
      } finally {
        setIsRefreshing(false);
      }
    },
    [orderId, maxPolls, state]
  );

  useEffect(() => {
    setState('LOADING');
    verifyOrder(false);

    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [orderId]);

  const formatIDR = (amount?: number) => {
    if (typeof amount !== 'number') return 'Rp 0';
    return `Rp ${amount.toLocaleString('id-ID')}`;
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return '-';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  const getPlanDisplayName = (planTier?: string, interval?: string) => {
    const tier = (planTier || 'PRO').toUpperCase();
    const cycle = interval === 'monthly' ? 'Bulanan' : 'Tahunan';
    return `MingleBooth ${tier} (${cycle})`;
  };

  return (
    <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-12 flex-1 flex flex-col justify-center">
      {/* 1. STATE: LOADING */}
      {state === 'LOADING' && (
        <div className="p-8 sm:p-12 rounded-2xl bg-mb-surface border border-mb-line text-center flex flex-col items-center shadow-lg">
          <div className="w-16 h-16 rounded-full bg-mb-accent/15 border border-mb-accent/30 flex items-center justify-center text-mb-ink mb-6">
            <Loader2 className="w-8 h-8 animate-spin text-mb-ink" />
          </div>
          <h2 className="text-xl sm:text-2xl font-heading font-extrabold text-mb-ink">
            Memverifikasi Pembayaran...
          </h2>
          <p className="text-sm text-mb-muted mt-2 max-w-md">
            Sistem sedang menghubungi gateway pembayaran DOKU untuk memastikan status transaksi Anda.
          </p>
          {orderId && (
            <div className="mt-4 px-3 py-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs font-mono text-mb-muted border border-mb-line">
              Invoice: {orderId}
            </div>
          )}
        </div>
      )}

      {/* 2. STATE: AUTH REQUIRED */}
      {state === 'AUTH_REQUIRED' && (
        <div className="p-8 sm:p-12 rounded-2xl bg-mb-surface border border-mb-line text-center flex flex-col items-center shadow-lg">
          <div className="w-16 h-16 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 mb-6">
            <LogIn className="w-8 h-8" />
          </div>
          <h2 className="text-xl sm:text-2xl font-heading font-extrabold text-mb-ink">
            Autentikasi Diperlukan
          </h2>
          <p className="text-sm text-mb-muted mt-2 max-w-md">
            Sesi akun vendor Anda belum aktif di browser ini. Silakan masuk terlebih dahulu untuk memverifikasi dan melihat aktivasi lisensi pesanan Anda.
          </p>
          {orderId && (
            <div className="mt-4 px-3 py-1.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs font-mono text-mb-muted border border-mb-line">
              Invoice: {orderId}
            </div>
          )}
          <div className="mt-8 flex flex-col sm:flex-row items-center gap-3">
            <Link
              href={`/login?redirect=${encodeURIComponent(`/billing/result?orderId=${orderId}`)}`}
              className="h-11 px-6 rounded-xl bg-mb-accent hover:brightness-95 text-mb-accent-ink font-heading font-bold text-sm flex items-center gap-2 shadow-md transition-all active:scale-95"
            >
              <span>Masuk ke Akun Vendor</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/billing"
              className="h-11 px-5 rounded-xl border border-mb-line bg-mb-surface hover:bg-neutral-100 dark:hover:bg-neutral-800 text-mb-ink text-sm font-medium flex items-center gap-2 transition-colors"
            >
              Kembali ke Billing
            </Link>
          </div>
        </div>
      )}

      {/* 3. STATE: INVALID ORDER ID */}
      {state === 'INVALID' && (
        <div className="p-8 sm:p-12 rounded-2xl bg-mb-surface border border-mb-line text-center flex flex-col items-center shadow-lg">
          <div className="w-16 h-16 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-500 mb-6">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl sm:text-2xl font-heading font-extrabold text-mb-ink">
            Pesanan Tidak Ditemukan
          </h2>
          <p className="text-sm text-mb-muted mt-2 max-w-md">
            {errorMessage || 'Tautan pembayaran tidak memuat nomor order ID yang sah atau pesanan tidak terdaftar di sistem.'}
          </p>
          <div className="mt-8">
            <Link
              href="/billing"
              className="h-11 px-6 rounded-xl bg-mb-accent hover:brightness-95 text-mb-accent-ink font-heading font-bold text-sm inline-flex items-center gap-2 shadow-md transition-all active:scale-95"
            >
              <span>Kembali ke Halaman Paket &amp; Billing</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}

      {/* 4. STATE: SUCCESS */}
      {state === 'SUCCESS' && data && (
        <div className="space-y-6">
          {/* Hero Success Card */}
          <div className="p-6 sm:p-8 rounded-3xl bg-mb-surface border-2 border-emerald-500/30 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 pb-6 border-b border-mb-line">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-500 flex-shrink-0 shadow-inner">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Pembayaran Berhasil &amp; Lisensi Aktif
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-heading font-extrabold text-mb-ink mt-2">
                  Terima Kasih atas Pembayaran Anda!
                </h1>
                <p className="text-sm text-mb-muted mt-1">
                  Langganan studio Anda telah berhasil diaktifkan secara otomatis ke seluruh sistem MingleBooth.
                </p>
              </div>
            </div>

            {/* Transaction Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-6">
              <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-900/60 border border-mb-line flex items-start gap-3">
                <Building2 className="w-5 h-5 text-mb-muted flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="text-xs text-mb-muted block">Studio / Organisasi</span>
                  <span className="text-sm font-bold text-mb-ink truncate block">
                    {data.organization?.name || 'Studio Vendor'}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-900/60 border border-mb-line flex items-start gap-3">
                <Receipt className="w-5 h-5 text-mb-muted flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="text-xs text-mb-muted block">No. Invoice</span>
                  <span className="text-sm font-mono font-bold text-mb-ink truncate block">
                    {data.order?.orderId || orderId}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-900/60 border border-mb-line flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-mb-muted flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="text-xs text-mb-muted block">Paket Berlangganan</span>
                  <span className="text-sm font-bold text-mb-ink truncate block">
                    {getPlanDisplayName(data.order?.planTier || data.organization?.planTier, data.order?.billingInterval)}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-900/60 border border-mb-line flex items-start gap-3">
                <CreditCard className="w-5 h-5 text-mb-muted flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="text-xs text-mb-muted block">Total Pembayaran &amp; Metode</span>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 block">
                    {formatIDR(data.order?.amountIdr)}
                  </span>
                  <span className="text-[11px] text-mb-muted block">
                    {data.order?.paymentMethod || 'DOKU Sandbox / Virtual Account'}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-900/60 border border-mb-line flex items-start gap-3">
                <Calendar className="w-5 h-5 text-mb-muted flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="text-xs text-mb-muted block">Masa Aktif Lisensi Hingga</span>
                  <span className="text-sm font-bold text-mb-ink block">
                    {formatDate(data.organization?.subscriptionExpiresAt)}
                  </span>
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 block">
                    {data.order?.durationDays ? `+${data.order.durationDays} Hari Ditambahkan` : 'Lisensi Aktif'}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-900/60 border border-mb-line flex items-start gap-3">
                <Monitor className="w-5 h-5 text-mb-muted flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="text-xs text-mb-muted block">Kuota Perangkat Booth (HWID)</span>
                  <span className="text-sm font-bold text-mb-ink block">
                    {data.organization?.maxDevicesQuota || 3} Perangkat Aktif
                  </span>
                  <span className="text-[11px] text-mb-muted block">
                    Dapat dihubungkan di Mac, Windows &amp; Android
                  </span>
                </div>
              </div>
            </div>

            {/* CTAs */}
            <div className="pt-6 border-t border-mb-line flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                <Link
                  href="/dashboard"
                  className="w-full sm:w-auto h-12 px-6 rounded-xl bg-mb-accent hover:brightness-95 text-mb-accent-ink font-heading font-extrabold text-sm flex items-center justify-center gap-2 shadow-md transition-all active:scale-95"
                >
                  <span>Buka Vendor Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/billing"
                  className="w-full sm:w-auto h-12 px-5 rounded-xl border border-mb-line bg-mb-surface hover:bg-neutral-100 dark:hover:bg-neutral-800 text-mb-ink text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <CreditCard className="w-4 h-4 text-mb-muted" />
                  <span>Kelola Langganan</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. STATE: PROCESSING (WAITING GATEWAY) */}
      {state === 'PROCESSING' && (
        <div className="p-8 sm:p-12 rounded-3xl bg-mb-surface border border-mb-line text-center flex flex-col items-center shadow-lg relative overflow-hidden">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 mb-6">
            <Clock className="w-8 h-8 animate-pulse" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 uppercase tracking-wider mb-2">
            Status: Menunggu Konfirmasi Pembayaran
          </div>
          <h2 className="text-xl sm:text-2xl font-heading font-extrabold text-mb-ink">
            Pembayaran Sedang Diverifikasi
          </h2>
          <p className="text-sm text-mb-muted mt-2 max-w-md leading-relaxed">
            Jika Anda baru saja menyelesaikan transfer Virtual Account atau QRIS di DOKU, sistem sedang menyelaraskan settlement. Halaman ini memperbarui status secara otomatis.
          </p>

          {orderId && (
            <div className="mt-4 px-4 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-xs font-mono text-mb-muted border border-mb-line flex items-center gap-2">
              <Receipt className="w-4 h-4" />
              <span>Invoice: <strong>{orderId}</strong></span>
              {data?.order?.amountIdr ? (
                <span>• {formatIDR(data.order.amountIdr)}</span>
              ) : null}
            </div>
          )}

          <div className="mt-8 flex flex-col sm:flex-row items-center gap-3">
            <button
              onClick={() => verifyOrder(true)}
              disabled={isRefreshing}
              className="h-11 px-6 rounded-xl bg-mb-accent hover:brightness-95 disabled:opacity-50 text-mb-accent-ink font-heading font-bold text-sm flex items-center gap-2 shadow-md transition-all active:scale-95"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Memeriksa...' : 'Cek Status Sekarang'}</span>
            </button>
            <Link
              href="/billing"
              className="h-11 px-5 rounded-xl border border-mb-line bg-mb-surface hover:bg-neutral-100 dark:hover:bg-neutral-800 text-mb-ink text-sm font-medium flex items-center gap-2 transition-colors"
            >
              Kembali ke Menu Billing
            </Link>
          </div>
        </div>
      )}

      {/* 6. STATE: FAILED */}
      {state === 'FAILED' && (
        <div className="p-8 sm:p-12 rounded-3xl bg-mb-surface border-2 border-rose-500/30 text-center flex flex-col items-center shadow-xl">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-500 mb-6">
            <AlertCircle className="w-8 h-8" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 uppercase tracking-wider mb-2">
            Status: Pembayaran Gagal
          </div>
          <h2 className="text-xl sm:text-2xl font-heading font-extrabold text-mb-ink">
            Transaksi Tidak Berhasil
          </h2>
          <p className="text-sm text-mb-muted mt-2 max-w-md leading-relaxed">
            {errorMessage || 'Pembayaran ditolak atau dibatalkan oleh pihak bank/gateway. Saldo rekening Anda tidak terpotong.'}
          </p>

          {orderId && (
            <div className="mt-4 px-4 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-xs font-mono text-mb-muted border border-mb-line">
              Invoice: {orderId}
            </div>
          )}

          <div className="mt-8 flex flex-col sm:flex-row items-center gap-3">
            <Link
              href="/billing"
              className="h-11 px-6 rounded-xl bg-mb-accent hover:brightness-95 text-mb-accent-ink font-heading font-bold text-sm inline-flex items-center gap-2 shadow-md transition-all active:scale-95"
            >
              <span>Ulangi Pembayaran di Billing</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/dashboard"
              className="h-11 px-5 rounded-xl border border-mb-line bg-mb-surface hover:bg-neutral-100 dark:hover:bg-neutral-800 text-mb-ink text-sm font-medium flex items-center gap-2 transition-colors"
            >
              Kembali ke Dashboard
            </Link>
          </div>
        </div>
      )}

      {/* 7. STATE: EXPIRED */}
      {state === 'EXPIRED' && (
        <div className="p-8 sm:p-12 rounded-3xl bg-mb-surface border-2 border-neutral-500/30 text-center flex flex-col items-center shadow-xl">
          <div className="w-16 h-16 rounded-2xl bg-neutral-500/15 border border-neutral-500/30 flex items-center justify-center text-neutral-400 mb-6">
            <Clock className="w-8 h-8" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-neutral-500/15 text-neutral-400 border border-neutral-500/30 uppercase tracking-wider mb-2">
            Status: Tagihan Kedaluwarsa
          </div>
          <h2 className="text-xl sm:text-2xl font-heading font-extrabold text-mb-ink">
            Waktu Pembayaran Telah Berakhir
          </h2>
          <p className="text-sm text-mb-muted mt-2 max-w-md leading-relaxed">
            {errorMessage || 'Batas waktu pembayaran untuk nomor invoice ini telah habis. Silakan buat sesi pembayaran baru untuk mengaktifkan lisensi studio Anda.'}
          </p>

          {orderId && (
            <div className="mt-4 px-4 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-xs font-mono text-mb-muted border border-mb-line">
              Invoice: {orderId}
            </div>
          )}

          <div className="mt-8 flex flex-col sm:flex-row items-center gap-3">
            <Link
              href="/billing"
              className="h-11 px-6 rounded-xl bg-mb-accent hover:brightness-95 text-mb-accent-ink font-heading font-bold text-sm inline-flex items-center gap-2 shadow-md transition-all active:scale-95"
            >
              <span>Buat Invoice Baru di Billing</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/dashboard"
              className="h-11 px-5 rounded-xl border border-mb-line bg-mb-surface hover:bg-neutral-100 dark:hover:bg-neutral-800 text-mb-ink text-sm font-medium flex items-center gap-2 transition-colors"
            >
              Kembali ke Dashboard
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PaymentResultPage() {
  return (
    <div className="min-h-screen bg-mb-bg text-mb-ink flex flex-col font-sans transition-colors antialiased">
      <Navbar />
      <Suspense
        fallback={
          <div className="max-w-3xl mx-auto w-full px-4 sm:px-6 py-20 flex-1 flex flex-col items-center justify-center text-center">
            <Loader2 className="w-8 h-8 animate-spin text-mb-muted mb-4" />
            <p className="text-sm text-mb-muted">Memuat halaman hasil pembayaran...</p>
          </div>
        }
      >
        <PaymentResultContent />
      </Suspense>
      <Footer />
    </div>
  );
}

