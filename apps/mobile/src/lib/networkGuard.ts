/**
 * apps/mobile/src/lib/networkGuard.ts
 *
 * MINGLEBOOTH — CENTRALIZED NETWORK GUARD & EPHEMERAL PAIRING CLIENT
 *
 * Security & Isolation Guarantees:
 * 1. Strict Domain Guardrail (Fail-Closed):
 *    - In Test Isolation Mode, completely blocks any network request to:
 *      - minglebooth.id
 *      - *.minglebooth.id
 *      - supabase.co
 *      - *.supabase.co
 * 2. In-Memory Ephemeral Session Token:
 *    - Session token is stored strictly in memory (RAM).
 *    - NEVER saved to localStorage, sessionStorage, IndexedDB, or written to logs.
 *    - If app is restarted or killed, re-pairing with bridge is required.
 * 3. Dynamic Pairing Handshake:
 *    - Preflights GET /api/bridge-status to verify bridge identity (ISOLATED-LOCAL-TEST).
 *    - Executes POST /api/bridge/session-handshake with dynamic PIN and HWID.
 * 4. Production Passthrough Safety:
 *    - When VITE_TEST_ISOLATION_MODE !== 'true', behaves normally as standard API client,
 *      preserving 100% untouched behavior for official customer builds.
 */

import { getMobileDeviceInfo } from './mobileDevice';

export const IS_TEST_ISOLATION: boolean =
  import.meta.env.VITE_TEST_ISOLATION_MODE === 'true';

// In-Memory Ephemeral Session Storage (Zero Persistence)
let inMemorySessionToken: string | null = null;
let sessionExpiresAt: number = 0;
let lastPairedHwid: string | null = null;

export type SessionExpiredListener = () => void;
const sessionExpiredListeners = new Set<SessionExpiredListener>();

export function onSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListeners.add(listener);
  return () => {
    sessionExpiredListeners.delete(listener);
  };
}

function notifySessionExpired(): void {
  inMemorySessionToken = null;
  sessionExpiresAt = 0;
  lastPairedHwid = null;
  sessionExpiredListeners.forEach((fn) => {
    try {
      fn();
    } catch (err) {
      console.error('[NetworkGuard] Error in session expired listener:', err);
    }
  });
}

/**
 * Get current active in-memory session token.
 */
export function getSessionToken(): string | null {
  if (!inMemorySessionToken) return null;
  if (Date.now() > sessionExpiresAt) {
    notifySessionExpired();
    return null;
  }
  return inMemorySessionToken;
}

/**
 * Get active paired HWID (RAM-only).
 */
export function getLastPairedHwid(): string | null {
  return lastPairedHwid;
}

/**
 * Check whether a valid non-expired in-memory session token exists.
 */
export function hasValidSession(): boolean {
  return Boolean(getSessionToken());
}

/**
 * Clear in-memory session token.
 */
export function clearSessionToken(): void {
  inMemorySessionToken = null;
  sessionExpiresAt = 0;
  lastPairedHwid = null;
}

/**
 * Validate that a URL does NOT point to Production or Supabase domains.
 * In Test Isolation Mode, throws an Error if target URL violates isolation rules.
 */
export function assertValidBackendUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    throw new Error('SECURITY HALT: Backend URL wajib diisi pada Test Build.');
  }

  const trimmed = rawUrl.trim().replace(/\/+$/, '');

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`SECURITY HALT: Format URL tidak valid: "${trimmed}"`);
  }

  if (IS_TEST_ISOLATION) {
    const hostname = parsed.hostname.toLowerCase();

    // Strict Blacklist Check: MingleBooth & Supabase Production domains
    const isProduction =
      hostname === 'minglebooth.id' ||
      hostname.endsWith('.minglebooth.id') ||
      hostname === 'supabase.co' ||
      hostname.endsWith('.supabase.co');

    if (isProduction) {
      throw new Error(
        `SECURITY HALT: Request menuju domain Production (${hostname}) DIBLOKIR MUTLAK pada Test Build.`
      );
    }
  }

  return trimmed;
}

/**
 * Verify synthetic account format in Test Isolation Mode.
 */
export function assertValidTestAccount(email: string): void {
  if (IS_TEST_ISOLATION) {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (cleanEmail !== 'test@synthetic.studio' && !cleanEmail.endsWith('@synthetic.studio')) {
      throw new Error(
        'SECURITY HALT: Hanya akun pengujian @synthetic.studio yang diizinkan pada Test Build.'
      );
    }
  }
}

/**
 * Pair with Isolated Local Test Bridge using dynamic pairing PIN.
 */
export async function pairWithBridge(
  rawBridgeUrl: string,
  rawPin: string,
  hwid?: string
): Promise<{ success: boolean; expiresIn: number; expiresAt: number }> {
  const validatedUrl = assertValidBackendUrl(rawBridgeUrl);
  const pin = (rawPin || '').trim().replace(/\D/g, '');

  if (pin.length !== 6) {
    throw new Error('PIN pairing harus berupa 6 digit angka.');
  }

  // Resolve client HWID strictly without placeholder fallback
  let resolvedHwid = '';
  if (typeof hwid === 'string') {
    resolvedHwid = hwid.trim();
  } else {
    const devInfo = getMobileDeviceInfo();
    resolvedHwid = (devInfo.hwid || '').trim();
    if (resolvedHwid === 'server_env') {
      resolvedHwid = '';
    }
  }

  if (!resolvedHwid) {
    throw new Error('MISSING_TEST_HWID: Hardware fingerprint (HWID) tidak tersedia untuk pairing bridge.');
  }

  // 1. Preflight Bridge Health & Identity Probe (Timeout 4s)
  const probeController = new AbortController();
  const probeTimeout = setTimeout(() => probeController.abort(), 4000);

  let probeRes: Response;
  try {
    probeRes = await fetch(`${validatedUrl}/api/bridge-status`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: probeController.signal,
    });
  } catch (err: any) {
    clearTimeout(probeTimeout);
    throw new Error(
      `Gagal terhubung ke bridge pada ${validatedUrl}. Pastikan isolated test server aktif. (${err?.message || 'NetworkError'})`
    );
  }
  clearTimeout(probeTimeout);

  if (!probeRes.ok) {
    throw new Error(`Probe bridge gagal dengan status HTTP ${probeRes.status}.`);
  }

  const probeData = await probeRes.json().catch(() => ({}));
  if (probeData.bridgeId !== 'ISOLATED-LOCAL-TEST') {
    throw new Error(
      `SECURITY HALT: Target server bukan Isolated Test Bridge yang sah (Identity mismatch: "${probeData.bridgeId}").`
    );
  }

  // 2. Session Handshake Exchange (Timeout 5s)
  const handshakeController = new AbortController();
  const handshakeTimeout = setTimeout(() => handshakeController.abort(), 5000);

  let handshakeRes: Response;
  try {
    handshakeRes = await fetch(`${validatedUrl}/api/bridge/session-handshake`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        pin,
        hwid: resolvedHwid,
      }),
      signal: handshakeController.signal,
    });
  } catch (err: any) {
    clearTimeout(handshakeTimeout);
    throw new Error(`Handshake sesi gagal: ${err?.message || 'NetworkError'}`);
  }
  clearTimeout(handshakeTimeout);

  const handshakeData = await handshakeRes.json().catch(() => ({}));

  if (!handshakeRes.ok) {
    if (handshakeRes.status === 429) {
      throw new Error(
        handshakeData.error || 'Batas percobaan pairing tercapai. Tunggu cooldown 1 menit.'
      );
    }
    if (handshakeRes.status === 410) {
      throw new Error(
        handshakeData.error || 'PIN pairing telah kedaluwarsa (Maks 15 Menit). Minta operator restart bridge.'
      );
    }
    if (handshakeRes.status === 401) {
      throw new Error(
        handshakeData.error || 'PIN pairing tidak valid atau sudah pernah digunakan.'
      );
    }
    throw new Error(
      handshakeData.error || `Handshake pairing ditolak oleh server (HTTP ${handshakeRes.status}).`
    );
  }

  if (!handshakeData.sessionToken || typeof handshakeData.sessionToken !== 'string') {
    throw new Error('Bridge tidak mengembalikan session token yang sah.');
  }

  // 3. Store Session Token strictly in memory (Never persisted to disk/storage)
  inMemorySessionToken = handshakeData.sessionToken;
  sessionExpiresAt = handshakeData.expiresAt || (Date.now() + 60 * 60 * 1000);
  lastPairedHwid = resolvedHwid;

  console.log('[NetworkGuard] Sesi pengujian bridge berhasil diaktifkan dalam memori RAM.');

  return {
    success: true,
    expiresIn: handshakeData.expiresIn || 3600,
    expiresAt: sessionExpiresAt,
  };
}

/**
 * Centralized Safe API Fetch wrapper.
 * All outbound API calls in mobile application MUST pass through this method.
 */
export async function safeApiFetch(
  pathOrUrl: string,
  options: RequestInit = {},
  customBackendUrl?: string
): Promise<Response> {
  // If Production Build, passthrough directly to standard fetch without test restrictions
  if (!IS_TEST_ISOLATION) {
    return fetch(pathOrUrl, options);
  }

  // --- TEST ISOLATION MODE GUARDS ---

  // 1. Resolve full URL
  let resolvedUrl: string;
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    resolvedUrl = pathOrUrl;
  } else {
    // Resolve relative path against provided or active backend URL
    const base = customBackendUrl || '';
    if (!base) {
      throw new Error(
        'SECURITY HALT: Backend URL belum dikonfigurasi. Permintaan API diblokir secara Fail-Closed.'
      );
    }
    const cleanBase = base.replace(/\/+$/, '');
    const cleanPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
    resolvedUrl = `${cleanBase}${cleanPath}`;
  }

  // 2. Validate URL Domain (Throws immediately on *.minglebooth.id or *.supabase.co)
  const validatedTarget = assertValidBackendUrl(resolvedUrl);
  const parsedTarget = new URL(validatedTarget);

  // 3. Check Endpoint Session Token Requirement
  const pathname = parsedTarget.pathname;
  const isExempt =
    pathname === '/api/bridge-status' ||
    pathname === '/api/bridge/session-handshake' ||
    options.method === 'OPTIONS';

  const headers = new Headers(options.headers || {});

  if (!isExempt) {
    const activeToken = getSessionToken();
    if (!activeToken) {
      throw new Error(
        'UNAUTHORIZED_TEST_SESSION: Perangkat belum dipairing ke Isolated Test Bridge atau sesi telah kedaluwarsa. Silakan lakukan pairing ulang dengan PIN dari terminal bridge.'
      );
    }
    headers.set('X-MingleBooth-Test-Session', activeToken);

    // Resolve active HWID: prioritize lastPairedHwid, fallback to validated getMobileDeviceInfo().hwid
    let activeHwid = (lastPairedHwid || '').trim();
    if (!activeHwid) {
      const devHwid = (getMobileDeviceInfo().hwid || '').trim();
      if (devHwid && devHwid !== 'server_env') {
        activeHwid = devHwid;
      }
    }

    if (!activeHwid) {
      throw new Error(
        'MISSING_TEST_HWID: Hardware fingerprint (HWID) tidak tersedia pada Test Build. Permintaan API dibatalkan sebelum network fetch.'
      );
    }

    headers.set('X-HWID', activeHwid);
  }

  // 4. Execute Network Request
  const finalOptions: RequestInit = {
    ...options,
    headers,
  };

  let response: Response;
  try {
    response = await fetch(validatedTarget, finalOptions);
  } catch (netErr: any) {
    // Network errors (e.g. bridge stopped, tunnel disconnected)
    // Re-throw so caller can handle offline grace period locally
    throw netErr;
  }

  // 5. Handle Session Expiry or Revocation from Bridge
  if (response.status === 401) {
    const clone = response.clone();
    const data = await clone.json().catch(() => null);
    if (data && data.code === 'UNAUTHORIZED_TEST_SESSION') {
      console.warn('[NetworkGuard] Sesi pengujian bridge telah kedaluwarsa atau ditolak server.');
      notifySessionExpired();
    }
  }

  return response;
}

/**
 * Get Safe Base URL for Public QR Codes & Gallery.
 * In Test Isolation Mode, NEVER returns Production domain.
 */
export function getSafeGalleryBaseUrl(backendUrl?: string): string {
  if (IS_TEST_ISOLATION) {
    if (!backendUrl || backendUrl.trim() === '') {
      return 'http://127.0.0.1:3099';
    }
    try {
      return assertValidBackendUrl(backendUrl);
    } catch {
      return 'http://127.0.0.1:3099';
    }
  }
  return (backendUrl || 'https://www.minglebooth.id').replace(/\/+$/, '');
}

