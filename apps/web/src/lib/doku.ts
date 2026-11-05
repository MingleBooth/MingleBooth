import crypto from 'crypto';

export interface DokuConfig {
  clientId: string;
  secretKey: string;
  environment: 'sandbox' | 'production';
}

export function getDokuConfig(): DokuConfig {
  return {
    clientId: process.env.DOKU_CLIENT_ID || process.env.NEXT_PUBLIC_DOKU_CLIENT_ID || '',
    secretKey: process.env.DOKU_SECRET_KEY || '',
    environment: (process.env.DOKU_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox',
  };
}

export function getDokuBaseUrl(environment?: 'sandbox' | 'production'): string {
  const env = environment || getDokuConfig().environment;
  return env === 'production'
    ? 'https://api.doku.com'
    : 'https://api-sandbox.doku.com';
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
    return true; // Allow local dev testing if secret key is not yet set
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

/**
 * Creates a DOKU Checkout Payment URL.
 * Calls DOKU Jokul Checkout API (`/checkout/v1/payment`).
 * If credentials are not yet filled in, returns a simulated sandbox URL so developers can test.
 */
export async function createDokuCheckoutSession(
  params: DokuCheckoutOrderParams
): Promise<DokuCheckoutResult> {
  const config = getDokuConfig();

  // If Client ID & Secret Key are configured, initiate official DOKU Checkout API session
  if (config.clientId && config.secretKey) {
    const baseUrl = getDokuBaseUrl(config.environment);
    const requestTarget = '/checkout/v1/payment';
    const requestId = crypto.randomUUID();
    const requestTimestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

    const appBaseUrl =
      process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const callbackUrl =
      params.callbackUrl || `${appBaseUrl}/dashboard?payment=success&orderId=${encodeURIComponent(params.orderId)}`;
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
    });

    if (response.ok) {
      const data = await response.json();
      const dokuUrl = data?.response?.payment?.url;
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
    }
  }

  // Fallback for development / mock when DOKU credentials are not yet configured:
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const mockDokuUrl = `${appBaseUrl}/dashboard?doku_checkout=1&orderId=${encodeURIComponent(params.orderId)}&amount=${params.amountIdr}`;

  return {
    paymentUrl: mockDokuUrl,
    invoiceNumber: params.orderId,
    isMock: true,
  };
}
