import { NextRequest } from 'next/server';
import crypto from 'crypto';

export interface VerifiedAuthResult {
  success: boolean;
  isValid: boolean;
  status: number;
  error?: string;
  code?: 'AUTH_REQUIRED' | 'LICENSE_INVALID' | 'LICENSE_EXPIRED' | 'ORG_ACCESS_DENIED';
  orgId?: string;
  orgName?: string;
  role?: string;
  hwid?: string;
  email?: string;
  isSuperAdmin?: boolean;
  payload?: any;
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-org-id, x-vendor-email',
};

export const getSigningSecret = (): string => {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('CRITICAL_SECURITY_ERROR: SUPABASE_SERVICE_ROLE_KEY is required in production.');
    }
    return 'minglebooth_secret_hwid_key'; // Development fallback only
  }
  return secret;
};

/**
 * Creates a cryptographically signed HMAC-SHA256 bearer token
 */
export function createSignedToken(payload: Record<string, any>): string {
  const secret = getSigningSecret();
  const signature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');

  return Buffer.from(
    JSON.stringify({ payload, sig: signature })
  ).toString('base64');
}

/**
 * Server-Side Authentication & Tenant Identity Verification
 * Validates HMAC-SHA256 signature on Bearer tokens and derives verified organization ID.
 * NEVER trusts raw x-org-id or x-vendor-email headers.
 */
export async function verifyServerAuth(req: NextRequest): Promise<VerifiedAuthResult> {
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return {
      success: false,
      isValid: false,
      status: 401,
      code: 'AUTH_REQUIRED',
      error: 'Autentikasi diperlukan. Sertakan header Authorization: Bearer <token>.',
    };
  }

  const rawToken = authHeader.substring(7).trim();
  if (!rawToken) {
    return {
      success: false,
      isValid: false,
      status: 401,
      code: 'AUTH_REQUIRED',
      error: 'Token autentikasi kosong.',
    };
  }

  let parsed: { payload?: any; sig?: string };
  try {
    const jsonStr = Buffer.from(rawToken, 'base64').toString('utf8');
    parsed = JSON.parse(jsonStr);
  } catch {
    return {
      success: false,
      isValid: false,
      status: 401,
      code: 'LICENSE_INVALID',
      error: 'Format token autentikasi rusak atau bukan Base64 JSON yang sah.',
    };
  }

  if (!parsed || !parsed.payload || !parsed.sig || typeof parsed.payload !== 'object') {
    return {
      success: false,
      isValid: false,
      status: 401,
      code: 'LICENSE_INVALID',
      error: 'Struktur payload atau tanda tangan token tidak lengkap.',
    };
  }

  const { payload, sig } = parsed;
  const secret = getSigningSecret();

  // Cryptographic Signature Verification
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  const sigBuffer = Buffer.from(sig, 'hex');
  const expectedBuffer = Buffer.from(expectedSig, 'hex');

  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return {
      success: false,
      isValid: false,
      status: 401,
      code: 'LICENSE_INVALID',
      error: 'Tanda tangan kriptografis token tidak valid atau telah dimodifikasi (LICENSE_INVALID).',
    };
  }

  const orgId = payload.orgId || payload.organizationId;
  const expiresAtStr = payload.expiresAt || payload.validUntil;

  if (!orgId) {
    return {
      success: false,
      isValid: false,
      status: 401,
      code: 'LICENSE_INVALID',
      error: 'Identitas organisasi tidak ditemukan dalam payload lisensi.',
    };
  }

  // Expiration & Offline Grace Period Check
  if (expiresAtStr) {
    const expiryMs = new Date(expiresAtStr).getTime();
    if (!isNaN(expiryMs)) {
      const now = Date.now();
      const gracePeriodDays = payload.offlineGracePeriodDays || 7;
      const gracePeriodMs = gracePeriodDays * 24 * 60 * 60 * 1000;

      if (now > expiryMs + gracePeriodMs) {
        return {
          success: false,
          isValid: false,
          status: 403,
          code: 'LICENSE_EXPIRED',
          error: 'Masa aktif lisensi telah berakhir dan melewati masa tenggang (LICENSE_EXPIRED).',
        };
      }
    }
  }

  const role = payload.role || 'VENDOR_OWNER';
  const email = (payload.email || '').toLowerCase().trim();
  const isSuperAdmin =
    role === 'SUPER_ADMIN' ||
    email === 'admin@minglebooth.com' ||
    email === 'superadmin@minglebooth.com';

  return {
    success: true,
    isValid: true,
    status: 200,
    orgId,
    orgName: payload.orgName || payload.organizationName,
    role,
    hwid: payload.hwid,
    email,
    isSuperAdmin,
    payload,
  };
}
