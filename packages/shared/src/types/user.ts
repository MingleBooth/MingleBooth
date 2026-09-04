export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'VENDOR_OWNER' | 'VENDOR_STAFF';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  organizationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string;
  planTier: 'starter' | 'pro' | 'business';
  subscriptionStatus: 'active' | 'expired' | 'trial' | 'dev_mode';
  subscriptionExpiresAt: string;
  activeDevicesCount: number;
  maxDevicesQuota: number;
  createdAt: string;
}
