import { LicenseVerifier } from '@minglebooth/license';
import { LicenseVerificationResult, PlanTier } from '@minglebooth/shared';
import { getMobileDeviceInfo } from './mobileDevice';
import { MobileVendorUser } from '../store/mobile-booth-store';
import { safeApiFetch, IS_TEST_ISOLATION } from './networkGuard';

export const MB_LICENSE_TOKEN_KEY = 'mb_license_token';
export const MB_IS_DEMO_KEY = 'mb_is_demo';
export const MB_VENDOR_USER_KEY = 'mb_vendor_user';
export const MB_BACKEND_URL_KEY = 'mb_backend_url';

export type MobileLicenseStatus =
  | 'loading'
  | 'valid'
  | 'demo'
  | 'expired'
  | 'device_mismatch'
  | 'unauthenticated';

export interface LicenseUpdateEvent {
  isDemo: boolean;
  status: MobileLicenseStatus;
  message?: string;
}

export type LicenseUpdateListener = (event: LicenseUpdateEvent) => void;
const licenseListeners = new Set<LicenseUpdateListener>();

export function onLicenseUpdate(listener: LicenseUpdateListener): () => void {
  licenseListeners.add(listener);
  return () => {
    licenseListeners.delete(listener);
  };
}

export function notifyLicenseListeners(event: LicenseUpdateEvent): void {
  licenseListeners.forEach((fn) => {
    try {
      fn(event);
    } catch (err) {
      console.error('[MobileLicense] Listener error:', err);
    }
  });
}

export interface MobileLicenseVerificationState {
  status: MobileLicenseStatus;
  isValid: boolean;
  isDemo: boolean;
  isGracePeriod: boolean;
  tier: PlanTier;
  message: string;
  gracePeriodNotice: string | null;
  user: MobileVendorUser | null;
  daysRemaining: number;
}

export function getCachedLicenseToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(MB_LICENSE_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setCachedLicenseToken(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MB_LICENSE_TOKEN_KEY, token);
  } catch {}
}

export function getCachedVendorUser(): MobileVendorUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(MB_VENDOR_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setCachedVendorUser(user: MobileVendorUser | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (user) {
      localStorage.setItem(MB_VENDOR_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(MB_VENDOR_USER_KEY);
    }
  } catch {}
}

export function clearCachedLicenseSession(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(MB_LICENSE_TOKEN_KEY);
    localStorage.removeItem(MB_VENDOR_USER_KEY);
    localStorage.setItem(MB_IS_DEMO_KEY, 'true');
  } catch {}
}

/**
 * Verifikasi token lisensi mobile secara offline-first dengan verifier kriptografis bersama.
 * Mendukung deteksi offline grace period, demo mode, expiry, dan validasi latar belakang.
 */
export async function verifyMobileLicenseSession(
  backendUrl: string,
  providedToken?: string
): Promise<MobileLicenseVerificationState> {
  const token = providedToken || getCachedLicenseToken();
  const deviceInfo = getMobileDeviceInfo();
  const currentHwid = deviceInfo.hwid;

  // 1. Jika tidak ada token, default ke Mode Demo aman (Unauthenticated)
  if (!token) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(MB_IS_DEMO_KEY, 'true');
    }
    return {
      status: 'unauthenticated',
      isValid: false,
      isDemo: true,
      isGracePeriod: false,
      tier: 'starter',
      message: 'Mode Demo Aktif — Masuk dengan akun vendor untuk membuka seluruh fitur.',
      gracePeriodNotice: null,
      user: null,
      daysRemaining: 0,
    };
  }

  // 2. Monotonic Clock Skew Guard (Mendeteksi rollback waktu perangkat)
  const LAST_KNOWN_TIME_KEY = 'mb_last_known_time';
  if (typeof window !== 'undefined') {
    const lastKnownTimeStr = localStorage.getItem(LAST_KNOWN_TIME_KEY);
    const now = Date.now();
    if (lastKnownTimeStr) {
      const lastKnown = parseInt(lastKnownTimeStr, 10);
      if (!isNaN(lastKnown) && now < lastKnown - 5 * 60 * 1000) {
        console.warn('[MobileLicense] Device clock skew/rollback detected.');
        localStorage.setItem(MB_IS_DEMO_KEY, 'true');
        return {
          status: 'expired',
          isValid: false,
          isDemo: true,
          isGracePeriod: false,
          tier: 'starter',
          message: 'Deteksi manipulasi jam perangkat. Sinkronkan waktu perangkat Anda dengan waktu internet.',
          gracePeriodNotice: null,
          user: getCachedVendorUser(),
          daysRemaining: 0,
        };
      }
    }
    localStorage.setItem(LAST_KNOWN_TIME_KEY, now.toString());
  }

  // 3. Verifikasi offline kriptografis lokal via shared package (@minglebooth/license)
  // Menjaga kepatuhan 100% terhadap aturan lisensi Desktop (Subscription Enabled = true)
  const verifier = new LicenseVerifier(true);
  const localResult: LicenseVerificationResult = verifier.verifyTokenString(token, currentHwid);

  let cachedUser = getCachedVendorUser();

  // 4. Evaluasi hasil verifikasi lokal (Immediate Expiration + Strict Offline)
  if (!localResult.isValid) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(MB_IS_DEMO_KEY, 'true');
    }

    if (localResult.code === 'DEVICE_MISMATCH') {
      return {
        status: 'device_mismatch',
        isValid: false,
        isDemo: true,
        isGracePeriod: false,
        tier: localResult.tier,
        message: localResult.message || 'Lisensi ini terdaftar untuk perangkat lain.',
        gracePeriodNotice: null,
        user: cachedUser,
        daysRemaining: 0,
      };
    }

    if (localResult.isExpired || localResult.code === 'LICENSE_EXPIRED') {
      return {
        status: 'expired',
        isValid: false,
        isDemo: true,
        isGracePeriod: false,
        tier: localResult.tier,
        message: localResult.message || 'Masa aktif lisensi telah berakhir.',
        gracePeriodNotice: 'Masa aktif lisensi telah berakhir. Aplikasi berjalan dalam Mode Demo.',
        user: cachedUser,
        daysRemaining: 0,
      };
    }

    // Format rusak atau tidak valid
    return {
      status: 'unauthenticated',
      isValid: false,
      isDemo: true,
      isGracePeriod: false,
      tier: 'starter',
      message: localResult.message || 'Format lisensi tidak valid.',
      gracePeriodNotice: null,
      user: null,
      daysRemaining: 0,
    };
  }

  // 4. Token valid secara struktur & device
  const previouslyMarkedDemo = typeof window !== 'undefined' && localStorage.getItem(MB_IS_DEMO_KEY) === 'true';
  const isExpired = Boolean(!localResult.isValid && (localResult.isExpired || localResult.code === 'LICENSE_EXPIRED'));
  const isDemo = Boolean(isExpired || localResult.isDemo || localResult.code === 'DEMO_MODE' || previouslyMarkedDemo);
  const isGracePeriod = false; // Strict offline policy: zero grace period
  const gracePeriodNotice = isDemo ? 'Masa aktif langganan telah berakhir. Aplikasi berjalan dalam Mode Demo.' : null;

  if (typeof window !== 'undefined') {
    localStorage.setItem(MB_IS_DEMO_KEY, isDemo ? 'true' : 'false');
  }

  // Bangun profil user vendor dari token payload jika cachedUser belum lengkap
  if (!cachedUser || cachedUser.token !== token) {
    const payload = localResult.payload || {};
    cachedUser = {
      id: payload.userId || payload.vendorId || 'vendor_mob',
      email: payload.email || '',
      vendorName: payload.orgName || payload.vendorName || localResult.orgName || 'Vendor Partner',
      organizationId: payload.orgId || localResult.orgId || '',
      planTier: localResult.tier,
      deviceLimit: payload.deviceLimit || 1,
      activeDevicesCount: payload.activeDevicesCount || 1,
      isDemo,
      token,
    };
    setCachedVendorUser(cachedUser);
  }

  // 5. Non-blocking background verification jika online (tidak menghentikan startup offline)
  if (typeof window !== 'undefined' && window.navigator && window.navigator.onLine) {
    if (!IS_TEST_ISOLATION || (backendUrl && backendUrl.trim() !== '')) {
      const baseUrl = backendUrl.replace(/\/$/, '');
      safeApiFetch(`${baseUrl}/api/auth/verify-license`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          token,
          hardwareFingerprint: currentHwid,
        }),
      })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json().catch(() => null);

          // Defensive Type Check: Response must contain valid boolean isLicensed
          if (!data || typeof data.isLicensed !== 'boolean') {
            console.warn('[MobileLicense] Invalid response structure from verify-license, preserving offline state');
            return;
          }

          if (data.isLicensed === true && data.isDemo === false) {
            // REACTIVATION: Subscription renewed/active in cloud
            localStorage.setItem(MB_IS_DEMO_KEY, 'false');
            if (data.licenseToken) {
              setCachedLicenseToken(data.licenseToken);
            }
            notifyLicenseListeners({
              isDemo: false,
              status: 'valid',
              message: data.message || 'Lisensi Aktif',
            });
          } else if (data.isLicensed === false || data.isDemo === true || data.subscriptionStatus === 'expired') {
            // EXPIRATION: Subscription expired/demo
            localStorage.setItem(MB_IS_DEMO_KEY, 'true');
            notifyLicenseListeners({
              isDemo: true,
              status: data.subscriptionStatus === 'expired' ? 'expired' : 'demo',
              message: data.message || 'Masa aktif langganan telah berakhir di cloud. Aplikasi berjalan dalam Mode Demo.',
            });
          }
        } else if (res.status === 401 || res.status === 403) {
          const errData = await res.json().catch(() => ({}));
          if (['LICENSE_EXPIRED', 'SUBSCRIPTION_REQUIRED'].includes(errData.code)) {
            console.warn('[MobileLicense] Token expired/unsubscribed in cloud:', errData);
            localStorage.setItem(MB_IS_DEMO_KEY, 'true');
            notifyLicenseListeners({
              isDemo: true,
              status: 'expired',
              message: errData.error || 'Masa aktif langganan Anda telah berakhir. Aplikasi berjalan dalam Mode Demo.',
            });
          } else if (['DEVICE_MISMATCH', 'ORG_ACCESS_DENIED', 'REVOKED'].includes(errData.code)) {
            console.warn('[MobileLicense] Token revoked by cloud:', errData);
            clearCachedLicenseSession();
            notifyLicenseListeners({
              isDemo: true,
              status: 'unauthenticated',
              message: errData.error || 'Lisensi tidak lagi valid di server.',
            });
          }
        }
      })
      .catch((netErr) => {
        console.log('[MobileLicense] Cloud unreachable, strict offline policy enforced:', netErr.message);
        if (isDemo && typeof window !== 'undefined') {
          localStorage.setItem(MB_IS_DEMO_KEY, 'true');
        }
      });
    }
  }

  return {
    status: isDemo ? 'demo' : 'valid',
    isValid: true,
    isDemo,
    isGracePeriod: false,
    tier: localResult.tier,
    message: isDemo
      ? 'Mode Demo Aktif — Beberapa fitur terbatas.'
      : `Lisensi Aktif (${localResult.tier.toUpperCase()} Plan)`,
    gracePeriodNotice,
    user: cachedUser,
    daysRemaining: localResult.daysRemaining,
  };
}
