import crypto from 'crypto';

/**
 * Verified Lynk.id Webhook Signature Contract
 * Formula: SHA256(amount + ref_id + message_id + secret_key) -> hexadecimal
 *
 * NOTE: The signature covers `amount`, `ref_id`, `message_id`, and `secret_key`.
 * It does NOT cover body fields such as `customer.email` or `items[].title`.
 * Therefore, any authoritative order metadata pre-registered on the server
 * (such as organization binding) must NEVER be overridden by incoming webhook metadata.
 */
export function validateLynkSignature(
  refId: string,
  amount: string | number,
  messageId: string,
  receivedSignature: string,
  secretKey: string
): boolean {
  if (!secretKey) {
    if (process.env.NODE_ENV === 'production') return false; // Fail closed in production
    return true; // Allow dev testing if secret key is not set
  }

  if (!receivedSignature || typeof receivedSignature !== 'string') {
    return false;
  }

  const cleanReceived = receivedSignature.trim().toLowerCase();
  const signatureString = `${amount}${refId}${messageId}${secretKey}`;
  const calculatedSignature = crypto
    .createHash('sha256')
    .update(signatureString)
    .digest('hex');

  const bufCalc = Buffer.from(calculatedSignature, 'utf8');
  const bufRecv = Buffer.from(cleanReceived, 'utf8');

  // Constant-time comparison with exact byte-length guard
  if (bufCalc.length !== bufRecv.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(bufCalc, bufRecv);
  } catch {
    return false;
  }
}

/**
 * Generate Lynk.id Webhook Signature using SHA256 (for signing / test vectors)
 */
export function generateLynkSignature(
  refId: string,
  amount: string | number,
  messageId: string,
  secretKey: string
): string {
  const str = `${amount}${refId}${messageId}${secretKey}`;
  return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Reference Test Vectors for Provider Verification
 */
export const LYNK_TEST_VECTORS = [
  {
    refId: 'MB-TEST-001',
    amount: '1099000',
    messageId: 'MSG-001',
    secretKey: 'mock_secret_key_123',
    expectedSignature: 'd4039d1d8d8e70ceafae22096c5a84a274c99c215cc73428326d57f9872f27df',
  },
  {
    refId: 'LYNK-TX-99881',
    amount: '2999000',
    messageId: 'MSG-99881',
    secretKey: 'super_secret_merchant_key',
    expectedSignature: 'd9d9325ffb81f19f244e6845c048ab54f779f1c76d804fbb753b0b3e5fdd7a3b',
  },
];
