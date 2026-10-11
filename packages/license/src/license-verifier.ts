import {
  DEFAULT_PLAN_LIMITS,
  LicensePayload,
  LicenseVerificationResult,
  PlanTier,
} from '@minglebooth/shared';

export class LicenseVerifier {
  private subscriptionEnabled: boolean;

  constructor(subscriptionEnabled: boolean = false) {
    this.subscriptionEnabled = subscriptionEnabled;
  }

  /**
   * Decodes and verifies a raw base64 license token string
   * Verifies structure, HWID device binding, expiration date, and offline grace period.
   * NOTE: Full HMAC-SHA256 signature verification is performed by the server
   * to protect server signing secrets from client-side exposure.
   */
  public verifyTokenString(rawToken: string, currentHwid?: string): LicenseVerificationResult {
    // 1. Development Bypass (when SUBSCRIPTION_ENABLED=false)
    if (!this.subscriptionEnabled) {
      return {
        isValid: true,
        isDevMode: true,
        isExpired: false,
        isLimitedMode: false,
        daysRemaining: 999,
        tier: 'business',
        code: 'LICENSE_VALID',
        allowedFeatures: DEFAULT_PLAN_LIMITS.business,
        message: 'Development Mode Active: All Pro/Business features unlocked for testing',
      };
    }

    if (!rawToken || typeof rawToken !== 'string') {
      return {
        isValid: false,
        isDevMode: false,
        isExpired: true,
        isLimitedMode: true,
        daysRemaining: 0,
        tier: 'starter',
        code: 'AUTH_REQUIRED',
        allowedFeatures: DEFAULT_PLAN_LIMITS.starter,
        message: 'Token lisensi tidak ditemukan (AUTH_REQUIRED). Silakan masuk dengan akun vendor Anda.',
      };
    }

    let parsed: any;
    try {
      let jsonStr: string;
      if (typeof Buffer !== 'undefined') {
        jsonStr = Buffer.from(rawToken, 'base64').toString('utf8');
      } else if (typeof atob === 'function') {
        jsonStr = atob(rawToken);
      } else {
        throw new Error('No base64 decoding environment available');
      }
      parsed = JSON.parse(jsonStr);
    } catch {
      return {
        isValid: false,
        isDevMode: false,
        isExpired: true,
        isLimitedMode: true,
        daysRemaining: 0,
        tier: 'starter',
        code: 'LICENSE_INVALID',
        allowedFeatures: DEFAULT_PLAN_LIMITS.starter,
        message: 'Format token lisensi rusak atau tidak valid (LICENSE_INVALID).',
      };
    }

    if (!parsed || !parsed.payload || typeof parsed.payload !== 'object') {
      return {
        isValid: false,
        isDevMode: false,
        isExpired: true,
        isLimitedMode: true,
        daysRemaining: 0,
        tier: 'starter',
        code: 'LICENSE_INVALID',
        allowedFeatures: DEFAULT_PLAN_LIMITS.starter,
        message: 'Payload token lisensi tidak memiliki struktur yang sah (LICENSE_INVALID).',
      };
    }

    const payload = parsed.payload;
    const orgId = payload.orgId || payload.organizationId;
    const orgName = payload.orgName || payload.organizationName || 'Vendor';
    const expiresAtStr = payload.expiresAt || payload.validUntil;
    const planTier: PlanTier = (payload.planTier || payload.tier || 'starter') as PlanTier;
    const tokenHwid = payload.hwid || payload.hardwareFingerprint;

    // Handle authenticated demo token (unpaid accounts)
    if (payload.isDemo) {
      return {
        isValid: true,
        isDevMode: false,
        isExpired: false,
        isGracePeriod: false,
        isLimitedMode: true,
        isDemo: true,
        daysRemaining: 0,
        tier: planTier,
        code: 'DEMO_MODE',
        allowedFeatures: DEFAULT_PLAN_LIMITS[planTier] || DEFAULT_PLAN_LIMITS.starter,
        message: 'Akun terautentikasi dalam Mode Demo (Fitur berbayar terkunci)',
        orgId,
        orgName,
        hwid: tokenHwid,
        payload,
      };
    }

    if (!orgId || !expiresAtStr) {
      return {
        isValid: false,
        isDevMode: false,
        isExpired: true,
        isLimitedMode: true,
        daysRemaining: 0,
        tier: planTier,
        code: 'LICENSE_INVALID',
        allowedFeatures: DEFAULT_PLAN_LIMITS[planTier] || DEFAULT_PLAN_LIMITS.starter,
        message: 'Data organisasi atau tanggal kedaluwarsa tidak lengkap dalam lisensi (LICENSE_INVALID).',
      };
    }

    // 2. Hardware Fingerprint (Device Binding) Check
    if (currentHwid && tokenHwid && currentHwid !== tokenHwid) {
      return {
        isValid: false,
        isDevMode: false,
        isExpired: false,
        isLimitedMode: true,
        daysRemaining: 0,
        tier: planTier,
        code: 'DEVICE_MISMATCH',
        allowedFeatures: DEFAULT_PLAN_LIMITS[planTier] || DEFAULT_PLAN_LIMITS.starter,
        message: 'Lisensi ini terdaftar untuk perangkat lain (DEVICE_MISMATCH). Silakan aktivasi laptop ini dengan akun vendor Anda.',
        orgId,
        orgName,
        hwid: tokenHwid,
        payload,
      };
    }

    // 3. Expiration & Grace Period Check
    const now = Date.now();
    const expiryDate = new Date(expiresAtStr).getTime();
    if (isNaN(expiryDate)) {
      return {
        isValid: false,
        isDevMode: false,
        isExpired: true,
        isLimitedMode: true,
        daysRemaining: 0,
        tier: planTier,
        code: 'LICENSE_INVALID',
        allowedFeatures: DEFAULT_PLAN_LIMITS[planTier] || DEFAULT_PLAN_LIMITS.starter,
        message: 'Format tanggal kedaluwarsa tidak valid dalam lisensi.',
      };
    }

    const diffDays = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
    const gracePeriodDays = payload.offlineGracePeriodDays || 7;
    const gracePeriodMs = gracePeriodDays * 24 * 60 * 60 * 1000;

    if (diffDays <= 0) {
      const isWithinGracePeriod = now <= (expiryDate + gracePeriodMs);
      if (isWithinGracePeriod) {
        return {
          isValid: true,
          isDevMode: false,
          isExpired: true,
          isGracePeriod: true,
          isLimitedMode: false,
          daysRemaining: diffDays,
          tier: planTier,
          code: 'LICENSE_VALID',
          allowedFeatures: DEFAULT_PLAN_LIMITS[planTier] || DEFAULT_PLAN_LIMITS.starter,
          message: `Masa aktif lisensi telah berakhir. Berjalan dalam mode tenggang offline (${Math.abs(diffDays)} hari lewat jatuh tempo).`,
          orgId,
          orgName,
          hwid: tokenHwid,
          payload,
        };
      }

      return {
        isValid: false,
        isDevMode: false,
        isExpired: true,
        isGracePeriod: false,
        isLimitedMode: true,
        daysRemaining: 0,
        tier: planTier,
        code: 'LICENSE_EXPIRED',
        allowedFeatures: DEFAULT_PLAN_LIMITS[planTier] || DEFAULT_PLAN_LIMITS.starter,
        message: 'Masa aktif lisensi Anda telah berakhir (LICENSE_EXPIRED). Hubungkan ke internet untuk memperbarui langganan.',
        orgId,
        orgName,
        hwid: tokenHwid,
        payload,
      };
    }

    // 4. Valid Active License
    return {
      isValid: true,
      isDevMode: false,
      isExpired: false,
      isGracePeriod: false,
      isLimitedMode: false,
      daysRemaining: diffDays,
      tier: planTier,
      code: 'LICENSE_VALID',
      allowedFeatures: DEFAULT_PLAN_LIMITS[planTier] || DEFAULT_PLAN_LIMITS.starter,
      message: `Lisensi Aktif (Paket ${planTier.toUpperCase()}). Sisa masa aktif: ${diffDays} hari.`,
      orgId,
      orgName,
      hwid: tokenHwid,
      payload,
    };
  }

  /**
   * Verifies local license token or provides development bypass
   */
  public verify(license?: LicensePayload | null, currentHwid?: string): LicenseVerificationResult {
    // 1. Development Bypass (when SUBSCRIPTION_ENABLED=false)
    if (!this.subscriptionEnabled) {
      return {
        isValid: true,
        isDevMode: true,
        isExpired: false,
        isLimitedMode: false,
        daysRemaining: 999,
        tier: 'business',
        code: 'LICENSE_VALID',
        allowedFeatures: DEFAULT_PLAN_LIMITS.business,
        message: 'Development Mode Active: All Pro/Business features unlocked for testing',
      };
    }

    // 2. No License Token Provided
    if (!license) {
      return {
        isValid: false,
        isDevMode: false,
        isExpired: true,
        isLimitedMode: true,
        daysRemaining: 0,
        tier: 'starter',
        code: 'AUTH_REQUIRED',
        allowedFeatures: DEFAULT_PLAN_LIMITS.starter,
        message: 'No active license found. Running in Limited Mode (local data viewing only).',
      };
    }

    // 3. Expiration Check
    const now = new Date().getTime();
    const expiryDate = new Date((license as any).validUntil || (license as any).expiresAt).getTime();
    const diffDays = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
    const tier = (license.tier || (license as any).planTier || 'starter') as PlanTier;

    if (diffDays <= 0) {
      // Check grace period
      const gracePeriodMs = (license.offlineGracePeriodDays || 7) * 24 * 60 * 60 * 1000;
      const isWithinGracePeriod = now <= expiryDate + gracePeriodMs;

      if (isWithinGracePeriod) {
        return {
          isValid: true,
          isDevMode: false,
          isExpired: true,
          isGracePeriod: true,
          isLimitedMode: false,
          daysRemaining: diffDays,
          tier,
          code: 'LICENSE_VALID',
          allowedFeatures: DEFAULT_PLAN_LIMITS[tier] || DEFAULT_PLAN_LIMITS.starter,
          message: `Subscription expired! Operating within offline grace period (${Math.abs(diffDays)} days past due).`,
        };
      }

      return {
        isValid: false,
        isDevMode: false,
        isExpired: true,
        isGracePeriod: false,
        isLimitedMode: true,
        daysRemaining: 0,
        tier,
        code: 'LICENSE_EXPIRED',
        allowedFeatures: DEFAULT_PLAN_LIMITS[tier] || DEFAULT_PLAN_LIMITS.starter,
        message: 'Subscription has expired (LICENSE_EXPIRED). New event creation and cloud synchronization disabled.',
      };
    }

    // 4. Valid Active License
    return {
      isValid: true,
      isDevMode: false,
      isExpired: false,
      isGracePeriod: false,
      isLimitedMode: false,
      daysRemaining: diffDays,
      tier,
      code: 'LICENSE_VALID',
      allowedFeatures: DEFAULT_PLAN_LIMITS[tier] || DEFAULT_PLAN_LIMITS.starter,
      message: `Active License (${tier.toUpperCase()} Plan). ${diffDays} days remaining.`,
    };
  }
}

