export type PlanTier = 'starter' | 'pro' | 'business' | 'enterprise';

export type SubscriptionStatus =
  | 'active'
  | 'trial'
  | 'past_due'
  | 'expired'
  | 'cancelled'
  | 'dev_mode';

export interface PlanLimits {
  tier: PlanTier;
  maxDevices: number;
  unlimitedEvents: boolean;
  unlimitedTemplates: boolean;
  gifSupport: 'none' | 'basic' | 'advanced';
  customBranding: boolean;
  whiteLabel: boolean;
  customDomain: boolean;
  multiUser: boolean;
  apiAccess: boolean;
  galleryRetentionDays: number; // 30
}

export interface DeviceInfo {
  deviceId: string;
  hardwareFingerprint: string;
  deviceName: string;
  os: 'mac' | 'windows' | 'linux' | 'ios' | 'android';
  appVersion: string;
  activatedAt: string;
  lastSeenAt: string;
  isActive: boolean;
}

export interface LicensePayload {
  organizationId: string;
  organizationName: string;
  tier: PlanTier;
  maxDevices: number;
  subscriptionStatus: SubscriptionStatus;
  validUntil: string; // ISO string
  offlineGracePeriodDays: number; // e.g. 7-14 days
  issuedAt: string;
  signature: string;
}

export interface LicenseVerificationResult {
  isValid: boolean;
  isDevMode: boolean;
  isExpired: boolean;
  isLimitedMode: boolean;
  daysRemaining: number;
  tier: PlanTier;
  allowedFeatures: PlanLimits;
  message: string;
}
