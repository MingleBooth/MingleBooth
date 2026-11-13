import crypto from 'crypto';

export interface DokuConfig {
  clientId: string;
  secretKey: string;
  environment: 'sandbox' | 'production';
}

/**
 * Detects whether the current execution is running in an authoritative Production deployment.
 * Respects preview environments (which are blocked from financial operations).
 */
export function isProductionDeployment(): boolean {
  // 1. Explicit Vercel Preview environment
  if (
    process.env.VERCEL_ENV === 'preview' ||
    process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview' ||
    process.env.MINGLEBOOTH_ENV === 'preview' ||
    process.env.IS_PREVIEW === 'true'
  ) {
    return false;
  }

  // 2. Explicit Vercel Production environment
  if (
    process.env.VERCEL_ENV === 'production' ||
    process.env.NEXT_PUBLIC_VERCEL_ENV === 'production'
  ) {
    return true;
  }

  // 3. Explicit project production environment flag
  if (
    process.env.MINGLEBOOTH_ENV === 'production' ||
    process.env.ENVIRONMENT === 'production'
  ) {
    return true;
  }

  // 4. Node production environment without test flags or localhost app URLs
  if (
    process.env.NODE_ENV === 'production' &&
    !process.env.IS_TEST &&
    !process.env.NEXT_TEST_MODE
  ) {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || '').toLowerCase();
    if (appUrl && !appUrl.includes('localhost') && !appUrl.includes('127.0.0.1')) {
      return true;
    }
  }

  return false;
}

/**
 * Returns the authoritative DOKU configuration.
 *
 * MANDATORY SECURITY SAFEGUARDS (Phase 1):
 * 1. In Production, DOKU_ENVIRONMENT MUST be explicitly set to 'production'.
 * 2. Silent fallback to 'sandbox' is strictly prohibited in Production deployments.
 * 3. Secret keys MUST NOT use NEXT_PUBLIC_ prefixes.
 * 4. Fails closed with descriptive server errors without exposing secret values.
 */
export function getDokuConfig(): DokuConfig {
  const isProd = isProductionDeployment();
  const rawEnv = (process.env.DOKU_ENVIRONMENT || '').toLowerCase().trim();

  let environment: 'sandbox' | 'production';

  if (isProd) {
    if (rawEnv !== 'production') {
      throw new Error(
        'SECURITY_CONFIGURATION_ERROR: DOKU_ENVIRONMENT must be explicitly set to "production" in production deployments. Sandbox gateway is strictly prohibited in Production.'
      );
    }
    environment = 'production';
  } else {
    // In local development or explicitly configured non-production staging
    environment = rawEnv === 'production' ? 'production' : 'sandbox';
  }

  // Secret credentials must strictly never be read from NEXT_PUBLIC_ variables
  const clientId = (process.env.DOKU_CLIENT_ID || '').trim();
  const secretKey = (process.env.DOKU_SECRET_KEY || '').trim();

  return {
    clientId,
    secretKey,
    environment,
  };
}

/**
 * Generates an environment-namespaced order ID:
 * Sandbox:    MB-SBX-[timestamp]-[random]
 * Production: MB-[timestamp]-[random]
 */
export function generateDokuOrderId(environment?: 'sandbox' | 'production'): string {
  const env = environment || getDokuConfig().environment;
  const timestamp = Date.now().toString(36).toUpperCase();
  const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();

  if (env === 'sandbox') {
    return `MB-SBX-${timestamp}-${randomHex}`;
  }
  return `MB-${timestamp}-${randomHex}`;
}

/**
 * Dedicated internal QA organization (STUDIO ONE).
 * Testing & sandbox transactions associated with this tenant are segregated from commercial metrics.
 * Preserved for backward compatibility.
 */
export const INTERNAL_QA_ORG_ID = 'f9077b0e-0486-4749-820a-a025ceb010b6';

/**
 * Static baseline of explicitly approved QA organization UUIDs.
 * Only known, audited internal QA organizations are included.
 * Future QA organization UUIDs must be explicitly added after formal approval.
 */
export const STATIC_INTERNAL_QA_ORG_IDS: readonly string[] = Object.freeze([
  INTERNAL_QA_ORG_ID,
]);

/**
 * In-memory registry of dynamically registered QA organization UUIDs (for testing / runtime).
 */
const dynamicInternalQaOrgIds = new Set<string>();

/**
 * Returns the consolidated set of all explicitly designated QA organization UUIDs.
 * Evaluates:
 * 1. Static baseline (STUDIO ONE).
 * 2. Any additional approved QA UUIDs in the INTERNAL_QA_ORG_IDS environment variable (comma-separated).
 * 3. Dynamically registered test QA UUIDs.
 */
export function getInternalQaOrgIds(): Set<string> {
  const ids = new Set<string>();
  for (const id of STATIC_INTERNAL_QA_ORG_IDS) {
    ids.add(id.trim().toLowerCase());
  }

  const envOrgs = process.env.INTERNAL_QA_ORG_IDS;
  if (envOrgs && typeof envOrgs === 'string') {
    for (const raw of envOrgs.split(',')) {
      const clean = raw.trim().toLowerCase();
      if (clean) ids.add(clean);
    }
  }

  for (const id of dynamicInternalQaOrgIds) {
    ids.add(id);
  }

  return ids;
}

/**
 * Exported Set representation of configured internal QA organization UUIDs.
 * Note: Use getInternalQaOrgIds() or isInternalQaOrg() for dynamic lookup.
 */
export const INTERNAL_QA_ORG_IDS: ReadonlySet<string> = new Set<string>(
  STATIC_INTERNAL_QA_ORG_IDS.map((id) => id.trim().toLowerCase())
);

/**
 * Checks whether an organization UUID belongs to an explicitly configured internal QA organization.
 * Case-insensitive comparison, handles whitespace and null/undefined values safely.
 */
export function isInternalQaOrg(organizationId?: string | null): boolean {
  if (!organizationId || typeof organizationId !== 'string') return false;
  const clean = organizationId.trim().toLowerCase();
  if (!clean) return false;
  return getInternalQaOrgIds().has(clean);
}

/**
 * Programmatically registers an approved QA organization UUID at runtime (e.g. for testing).
 */
export function registerInternalQaOrgId(orgId: string): void {
  if (orgId && typeof orgId === 'string') {
    const clean = orgId.trim().toLowerCase();
    if (clean) dynamicInternalQaOrgIds.add(clean);
  }
}

/**
 * Programmatically unregisters a QA organization UUID (e.g. for test teardown).
 */
export function unregisterInternalQaOrgId(orgId: string): void {
  if (orgId && typeof orgId === 'string') {
    const clean = orgId.trim().toLowerCase();
    if (clean) dynamicInternalQaOrgIds.delete(clean);
  }
}

/**
 * Checks if a payment record is an internal QA or Sandbox transaction that must be
 * segregated from commercial revenue metrics.
 *
 * Excludes:
 * 1. Explicitly configured QA organization UUIDs (case-insensitive).
 * 2. Existing Sandbox invoice prefixes ('MB-SBX-').
 * 3. Both historical Sandbox invoice IDs ('MB-MWARY392-F84E78', 'MB-MWASYKYT-7B46A7').
 */
export function isQaOrTestPayment(payment: {
  organization_id?: string | null;
  order_id?: string | null;
  [key: string]: any;
}): boolean {
  if (!payment || typeof payment !== 'object') return false;

  if (payment.organization_id && isInternalQaOrg(payment.organization_id)) {
    return true;
  }

  if (payment.order_id && isDokuSandboxOrderId(payment.order_id)) {
    return true;
  }

  return false;
}

/**
 * Known historical sandbox orders from early integration testing
 * that were created before the MB-SBX- namespace prefix was introduced.
 * These are strictly kept immutable for audit and historical record integrity.
 */
export const HISTORICAL_SANDBOX_ORDERS = new Set<string>([
  'MB-MWARY392-F84E78',
  'MB-MWASYKYT-7B46A7',
]);

/**
 * Validates whether an order ID belongs to the Sandbox environment namespace.
 */
export function isDokuSandboxOrderId(orderId: string): boolean {
  if (!orderId || typeof orderId !== 'string') return false;
  const clean = orderId.trim().toUpperCase();
  return clean.startsWith('MB-SBX-') || HISTORICAL_SANDBOX_ORDERS.has(clean);
}

/**
 * Enforces strict environment namespace matching on an order ID.
 * Throws a security error if a Sandbox order is presented to Production, or vice versa.
 */
export function validateDokuOrderEnvironment(
  orderId: string,
  currentEnvironment: 'sandbox' | 'production',
  allowHistoricalSandbox: boolean = false
): void {
  if (!orderId || typeof orderId !== 'string') {
    throw new Error('ORDER_ID_REQUIRED: orderId is required for environment validation.');
  }

  const clean = orderId.trim().toUpperCase();
  const isSandbox = clean.startsWith('MB-SBX-');
  const isHistorical = HISTORICAL_SANDBOX_ORDERS.has(clean);

  if (currentEnvironment === 'production') {
    if (isSandbox || isHistorical) {
      throw new Error(
        `SECURITY_ENVIRONMENT_MISMATCH: Production DOKU gateway cannot process or settle Sandbox order: ${clean}`
      );
    }
  } else if (currentEnvironment === 'sandbox') {
    // In Sandbox: All new orders must start with MB-SBX-.
    // If an order starts with MB- and does NOT have -SBX-:
    if (clean.startsWith('MB-') && !isSandbox) {
      if (allowHistoricalSandbox && isHistorical) {
        return;
      }
      throw new Error(
        `SECURITY_ENVIRONMENT_MISMATCH: Sandbox DOKU gateway cannot process or settle Production order: ${clean}`
      );
    }
  }
}

export function getDokuBaseUrl(environment?: 'sandbox' | 'production'): string {
  const env = environment || getDokuConfig().environment;
  return env === 'production'
    ? 'https://api.doku.com'
    : 'https://api-sandbox.doku.com';
}

/**
 * Returns the explicit canonical application URL with HTTPS protocol.
 * Falls back to Vercel production URL or localhost for dev.
 */
export function getCanonicalAppUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '');
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    const host = process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    return `https://${host}`;
  }
  return 'http://localhost:3000';
}

/**
 * Validate DOKU ISO8601 UTC Request-Timestamp freshness.
 * Format: YYYY-MM-DDTHH:mm:ssZ (e.g. 2026-11-10T14:00:00Z)
 * Maximum permitted clock skew is 300 seconds (5 minutes) per DOKU specifications.
 */
export function isDokuTimestampValid(requestTimestamp: string, maxSkewSeconds = 300): boolean {
  if (!requestTimestamp || typeof requestTimestamp !== 'string') return false;
  // Strict ISO 8601 UTC regex check: e.g. 2026-11-10T14:00:00Z or with millis
  const isoUtcRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
  if (!isoUtcRegex.test(requestTimestamp.trim())) return false;
  const parsedTime = Date.parse(requestTimestamp);
  if (isNaN(parsedTime)) return false;
  const now = Date.now();
  const diffSeconds = Math.abs(now - parsedTime) / 1000;
  return diffSeconds <= maxSkewSeconds;
}

/**
 * Generate DOKU SHA-256 Digest of the JSON payload.
 * Formula: Base64(SHA256(body))
 */
export function generateDokuDigest(bodyString: string): string {
  return crypto.createHash('sha256').update(bodyString, 'utf8').digest('base64');
}

/**
 * Generate DOKU HMAC-SHA256 Request Signature.
 * Component:
 * Client-Id:{clientId}\n
 * Request-Id:{requestId}\n
 * Request-Timestamp:{requestTimestamp}\n
 * Request-Target:{requestTarget}\n
 * Digest:{digest}
 */
export function generateDokuSignature({
  clientId,
  requestId,
  requestTimestamp,
  requestTarget,
  digest,
  secretKey,
}: {
  clientId: string;
  requestId: string;
  requestTimestamp: string;
  requestTarget: string;
  digest: string;
  secretKey: string;
}): string {
  const component =
    `Client-Id:${clientId}\n` +
    `Request-Id:${requestId}\n` +
    `Request-Timestamp:${requestTimestamp}\n` +
    `Request-Target:${requestTarget}\n` +
    `Digest:${digest}`;

  const hmac = crypto.createHmac('sha256', secretKey).update(component).digest('base64');
  return `HMACSHA256=${hmac}`;
}

/**
 * Validate incoming DOKU Webhook Notification Signature.
 */
export function validateDokuWebhookSignature({
  clientId,
  requestId,
  requestTimestamp,
  requestTarget,
  rawBody,
  receivedSignature,
  secretKey,
}: {
  clientId: string;
  requestId: string;
  requestTimestamp: string;
  requestTarget: string;
  rawBody: string;
  receivedSignature: string;
  secretKey: string;
}): boolean {
  if (!secretKey) {
    if (process.env.NODE_ENV === 'production') return false; // Fail-closed in production
    return false; // Strict validation requires secretKey
  }

  if (!receivedSignature) return false;

  const cleanReceived = receivedSignature.replace(/^HMACSHA256=/, '').trim();
  const digest = generateDokuDigest(rawBody);

  const component =
    `Client-Id:${clientId}\n` +
    `Request-Id:${requestId}\n` +
    `Request-Timestamp:${requestTimestamp}\n` +
    `Request-Target:${requestTarget}\n` +
    `Digest:${digest}`;

  const calculated = crypto.createHmac('sha256', secretKey).update(component).digest('base64');

  const bufCalc = Buffer.from(calculated, 'utf8');
  const bufRecv = Buffer.from(cleanReceived, 'utf8');

  if (bufCalc.length !== bufRecv.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(bufCalc, bufRecv);
  } catch {
    return false;
  }
}

export interface DokuCheckoutOrderParams {
  orderId: string;
  amountIdr: number;
  planName: string;
  customerEmail: string;
  customerName: string;
  organizationId: string;
  callbackUrl?: string;
  callbackBackUrl?: string;
}

export interface DokuCheckoutResult {
  paymentUrl: string;
  invoiceNumber: string;
  isMock: boolean;
}

export interface DokuOrderStatusResult {
  success: boolean;
  orderId: string;
  transactionStatus: 'SUCCESS' | 'PENDING' | 'FAILED' | 'EXPIRED' | 'UNKNOWN';
  amount?: number;
  paymentChannel?: string;
  originalRequestId?: string;
  raw?: any;
  error?: string;
}

/**
 * Checks transaction and order status directly from DOKU API.
 * Uses official Jokul Check Status endpoint: GET /orders/v1/status/{invoice_number}
 * Signature formula for GET:
 * Component = Client-Id:{clientId}\nRequest-Id:{requestId}\nRequest-Timestamp:{requestTimestamp}\nRequest-Target:{requestTarget}
 */
export async function checkDokuOrderStatus(orderId: string): Promise<DokuOrderStatusResult> {
  const config = getDokuConfig();
  validateDokuOrderEnvironment(orderId, config.environment);

  if (!config.clientId || !config.secretKey) {
    return {
      success: false,
      orderId,
      transactionStatus: 'UNKNOWN',
      error: 'DOKU credentials are not configured',
    };
  }

  const baseUrl = getDokuBaseUrl(config.environment);
  const requestTarget = `/orders/v1/status/${encodeURIComponent(orderId)}`;
  const requestId = crypto.randomUUID();
  const requestTimestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  const component =
    `Client-Id:${config.clientId}\n` +
    `Request-Id:${requestId}\n` +
    `Request-Timestamp:${requestTimestamp}\n` +
    `Request-Target:${requestTarget}`;

  const hmac = crypto.createHmac('sha256', config.secretKey).update(component).digest('base64');
  const signature = `HMACSHA256=${hmac}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${baseUrl}${requestTarget}`, {
      method: 'GET',
      headers: {
        'Client-Id': config.clientId,
        'Request-Id': requestId,
        'Request-Timestamp': requestTimestamp,
        Signature: signature,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      const rawStatus = (data?.transaction?.status || data?.order?.status || '').toUpperCase();
      let status: 'SUCCESS' | 'PENDING' | 'FAILED' | 'EXPIRED' | 'UNKNOWN' = 'UNKNOWN';
      if (rawStatus === 'SUCCESS') status = 'SUCCESS';
      else if (rawStatus === 'PENDING' || rawStatus === 'ORDER_GENERATED') status = 'PENDING';
      else if (rawStatus === 'FAILED') status = 'FAILED';
      else if (rawStatus === 'EXPIRED' || rawStatus === 'ORDER_EXPIRED') status = 'EXPIRED';

      return {
        success: true,
        orderId,
        transactionStatus: status,
        amount: Number(data?.order?.amount || 0),
        paymentChannel: data?.channel?.id || data?.service?.id || 'DOKU_CHECKOUT',
        originalRequestId: data?.transaction?.original_request_id || requestId,
        raw: data,
      };
    } else {
      const errText = await response.text();
      return {
        success: false,
        orderId,
        transactionStatus: 'UNKNOWN',
        error: `DOKU API returned HTTP ${response.status}: ${errText}`,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      orderId,
      transactionStatus: 'UNKNOWN',
      error: `Network error calling DOKU status: ${err?.message || err}`,
    };
  }
}

/**
 * Creates a DOKU Checkout Payment URL.
 * Calls DOKU Jokul Checkout API (`/checkout/v1/payment`).
 * If credentials are not yet filled in, returns a simulated sandbox URL so developers can test.
 */
export async function createDokuCheckoutSession(
  params: DokuCheckoutOrderParams
): Promise<DokuCheckoutResult> {
  const config = getDokuConfig();
  validateDokuOrderEnvironment(params.orderId, config.environment);

  if (config.environment === 'production' && (!config.clientId || !config.secretKey)) {
    throw new Error('DOKU_CREDENTIALS_REQUIRED: DOKU_CLIENT_ID and DOKU_SECRET_KEY are required in Production.');
  }

  // If Client ID & Secret Key are configured, initiate official DOKU Checkout API session
  if (config.clientId && config.secretKey) {
    const baseUrl = getDokuBaseUrl(config.environment);
    const requestTarget = '/checkout/v1/payment';
    const requestId = crypto.randomUUID();
    const requestTimestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

    const appBaseUrl = getCanonicalAppUrl();
    const callbackUrl =
      params.callbackUrl || `${appBaseUrl}/billing/result?orderId=${encodeURIComponent(params.orderId)}`;
    const callbackBackUrl =
      params.callbackBackUrl || `${appBaseUrl}/billing?payment=cancelled`;

    const payload = {
      order: {
        invoice_number: params.orderId,
        amount: params.amountIdr,
        callback_url: callbackUrl,
        callback_back_url: callbackBackUrl,
        line_items: [
          {
            name: `MingleBooth ${params.planName}`,
            price: params.amountIdr,
            quantity: 1,
          },
        ],
      },
      payment: {
        payment_due_date: 60, // 60 minutes
      },
      customer: {
        id: params.organizationId,
        name: params.customerName || 'Studio Vendor',
        email: params.customerEmail,
      },
    };

    const bodyString = JSON.stringify(payload);
    const digest = generateDokuDigest(bodyString);
    const signature = generateDokuSignature({
      clientId: config.clientId,
      requestId,
      requestTimestamp,
      requestTarget,
      digest,
      secretKey: config.secretKey,
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${baseUrl}${requestTarget}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Client-Id': config.clientId,
          'Request-Id': requestId,
          'Request-Timestamp': requestTimestamp,
          Signature: signature,
        },
        body: bodyString,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const dokuUrl = data?.response?.payment?.url || data?.payment?.url;
        if (dokuUrl) {
          return {
            paymentUrl: dokuUrl,
            invoiceNumber: params.orderId,
            isMock: false,
          };
        }
      } else {
        const errText = await response.text();
        console.error('[DOKU API Error]', response.status, errText);
        if (config.environment === 'production') {
          throw new Error(`DOKU_GATEWAY_ERROR: Payment gateway returned HTTP ${response.status}`);
        }
      }
    } catch (fetchErr: any) {
      console.error('[DOKU Checkout Request Failed]', fetchErr?.message);
      if (config.environment === 'production') {
        throw new Error(`DOKU_CHECKOUT_FAILED: ${fetchErr?.message || 'Failed to initiate production checkout session'}`);
      }
    }
  }

  if (config.environment === 'production') {
    throw new Error('DOKU_SESSION_FAILED: Production payment session could not be established.');
  }

  // Fallback for development / mock when DOKU credentials are not yet configured in Sandbox/Dev:
  const appBaseUrl = getCanonicalAppUrl();
  const mockDokuUrl = `${appBaseUrl}/billing/result?orderId=${encodeURIComponent(params.orderId)}&mock=1`;

  return {
    paymentUrl: mockDokuUrl,
    invoiceNumber: params.orderId,
    isMock: true,
  };
}
