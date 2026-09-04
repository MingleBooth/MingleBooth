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
   * Verifies local license token or provides development bypass
   */
  public verify(license?: LicensePayload | null): LicenseVerificationResult {
    // 1. Development Bypass (when SUBSCRIPTION_ENABLED=false)
    if (!this.subscriptionEnabled) {
      return {
        isValid: true,
        isDevMode: true,
        isExpired: false,
        isLimitedMode: false,
        daysRemaining: 999,
        tier: 'business',
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
        allowedFeatures: DEFAULT_PLAN_LIMITS.starter,
        message: 'No active license found. Running in Limited Mode (local data viewing only).',
      };
    }

    // 3. Expiration Check
    const now = new Date().getTime();
    const expiryDate = new Date(license.validUntil).getTime();
    const diffDays = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) {
      // Check grace period
      const gracePeriodMs = (license.offlineGracePeriodDays || 7) * 24 * 60 * 60 * 1000;
      const isWithinGracePeriod = now <= expiryDate + gracePeriodMs;

      if (isWithinGracePeriod) {
        return {
          isValid: true,
          isDevMode: false,
          isExpired: true,
          isLimitedMode: false,
          daysRemaining: diffDays,
          tier: license.tier,
          allowedFeatures: DEFAULT_PLAN_LIMITS[license.tier] || DEFAULT_PLAN_LIMITS.starter,
          message: `Subscription expired! Operating within offline grace period (${Math.abs(diffDays)} days past due).`,
        };
      }

      return {
        isValid: false,
        isDevMode: false,
        isExpired: true,
        isLimitedMode: true,
        daysRemaining: 0,
        tier: license.tier,
        allowedFeatures: DEFAULT_PLAN_LIMITS[license.tier] || DEFAULT_PLAN_LIMITS.starter,
        message: 'Subscription has expired. New event creation and cloud synchronization disabled.',
      };
    }

    // 4. Valid Active License
    return {
      isValid: true,
      isDevMode: false,
      isExpired: false,
      isLimitedMode: false,
      daysRemaining: diffDays,
      tier: license.tier,
      allowedFeatures: DEFAULT_PLAN_LIMITS[license.tier] || DEFAULT_PLAN_LIMITS.starter,
      message: `Active License (${license.tier.toUpperCase()} Plan). ${diffDays} days remaining.`,
    };
  }
}
