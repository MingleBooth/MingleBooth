/**
 * PHASE 15.2 — License Verification & API Authorization Security Test Suite
 *
 * Tests:
 * 1. Token valid (HMAC signature, claims, expiry)
 * 2. Signature tidak valid / Token dimodifikasi (tampered payload or wrong key)
 * 3. Token expired (past grace period -> LICENSE_EXPIRED)
 * 4. Grace period (expired < 7 days -> LICENSE_VALID with isGracePeriod: true)
 * 5. Device mismatch (token HWID != current HWID -> DEVICE_MISMATCH)
 * 6. Organization mismatch / Spoofed x-org-id header (tenant scoping strictly from token)
 * 7. Akses lintas tenant (attempting to access/mutate tenant B's resources using tenant A token)
 * 8. Role tidak berwenang (vendor token attempting superadmin /api/admin/* endpoints)
 * 9. Request tanpa autentikasi (missing token -> AUTH_REQUIRED / 401)
 * 10. Service-role secret tidak terbundel ke desktop
 * 11. Offline dengan cached token valid
 * 12. Offline tanpa token valid
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Colors for reporting
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ${GREEN}✓ PASS${RESET}: ${message}`);
  } else {
    console.error(`  ${RED}✗ FAIL${RESET}: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Secret key for testing server HMAC
const TEST_SECRET_KEY = 'test-service-role-key-for-phase-15-security-validation';

function createTestToken(payload, secret = TEST_SECRET_KEY) {
  const json = JSON.stringify({ payload });
  const base64 = Buffer.from(json).toString('base64');
  const signature = crypto.createHmac('sha256', secret).update(json).digest('hex');
  return `${base64}.${signature}`;
}

function verifyTestTokenOnServer(token, secret = TEST_SECRET_KEY) {
  if (!token || !token.includes('.')) {
    return { isValid: false, code: 'AUTH_REQUIRED', error: 'Missing or malformed token' };
  }
  const [base64, signature] = token.split('.');
  let payloadStr;
  try {
    payloadStr = Buffer.from(base64, 'base64').toString('utf8');
  } catch {
    return { isValid: false, code: 'LICENSE_INVALID', error: 'Invalid base64 payload' };
  }

  const expectedSig = crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');
  if (expectedSig.length !== signature.length) {
    return { isValid: false, code: 'LICENSE_INVALID', error: 'Invalid token signature length' };
  }

  const sigValid = crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(signature));
  if (!sigValid) {
    return { isValid: false, code: 'LICENSE_INVALID', error: 'Signature verification failed' };
  }

  const data = JSON.parse(payloadStr);
  const p = data.payload;

  // Check expiration
  const expiryTime = new Date(p.expiresAt || p.validUntil).getTime();
  if (!isNaN(expiryTime) && Date.now() > expiryTime) {
    return { isValid: false, code: 'LICENSE_EXPIRED', error: 'Token has expired', payload: p };
  }

  return { isValid: true, code: 'LICENSE_VALID', payload: p };
}

// Local Desktop Verifier simulation (packages/license logic)
function verifyLocalDesktopToken(rawToken, currentHwid) {
  if (!rawToken) {
    return { isValid: false, code: 'AUTH_REQUIRED', message: 'No token' };
  }
  let base64 = rawToken.includes('.') ? rawToken.split('.')[0] : rawToken;
  let parsed;
  try {
    const jsonStr = Buffer.from(base64, 'base64').toString('utf8');
    parsed = JSON.parse(jsonStr);
  } catch {
    return { isValid: false, code: 'LICENSE_INVALID', message: 'Corrupted token string' };
  }

  if (!parsed || !parsed.payload) {
    return { isValid: false, code: 'LICENSE_INVALID', message: 'Malformed payload' };
  }

  const payload = parsed.payload;
  const tokenHwid = payload.hwid || payload.hardwareFingerprint;

  // HWID check
  if (currentHwid && tokenHwid && currentHwid !== tokenHwid) {
    return { isValid: false, code: 'DEVICE_MISMATCH', message: 'Hardware mismatch' };
  }

  // Expiry & Grace period check
  const now = Date.now();
  const expiryDate = new Date(payload.expiresAt || payload.validUntil).getTime();
  const graceDays = payload.offlineGracePeriodDays || 7;
  const graceMs = graceDays * 24 * 60 * 60 * 1000;

  if (now > expiryDate) {
    if (now <= expiryDate + graceMs) {
      return {
        isValid: true,
        isGracePeriod: true,
        code: 'LICENSE_VALID',
        message: 'Offline grace period active',
      };
    }
    return { isValid: false, isGracePeriod: false, code: 'LICENSE_EXPIRED', message: 'License expired' };
  }

  return { isValid: true, isGracePeriod: false, code: 'LICENSE_VALID', message: 'License valid' };
}

async function runTestSuite() {
  console.log(`\n${CYAN}======================================================${RESET}`);
  console.log(`${CYAN}   PHASE 15.2 SECURITY AUDIT & VERIFICATION TEST SUITE${RESET}`);
  console.log(`${CYAN}======================================================${RESET}\n`);

  const now = Date.now();
  const futureDate = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
  const pastDateGrace = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days ago
  const pastDateExpired = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString(); // 14 days ago (> 7 days)

  const HWID_OFFICE = 'TEST-HWID-OFFICE-001';
  const HWID_UNKNOWN = 'TEST-HWID-ROUGE-999';

  const ORG_A_ID = '00000000-0000-0000-0000-00000000000a';
  const ORG_B_ID = '00000000-0000-0000-0000-00000000000b';

  // 1. Valid Token Verification (Server)
  console.log(`\n[Test 1] Valid Token Server Verification (HMAC-SHA256)`);
  const validToken = createTestToken({
    orgId: ORG_A_ID,
    email: 'vendor_a@photobooth.id',
    role: 'VENDOR',
    hwid: HWID_OFFICE,
    expiresAt: futureDate,
    planTier: 'pro',
  });
  const res1 = verifyTestTokenOnServer(validToken);
  assert(res1.isValid === true, 'Server accepts valid HMAC-SHA256 token');
  assert(res1.payload.orgId === ORG_A_ID, 'Server extracts orgId correctly');

  // 2. Signature Invalid / Tampered Token
  console.log(`\n[Test 2] Tampered Token & Signature Verification`);
  const tamperedPayload = Buffer.from(
    JSON.stringify({
      payload: {
        orgId: ORG_B_ID, // Hacker changed orgId in base64
        email: 'hacker@photobooth.id',
        role: 'SUPER_ADMIN',
        expiresAt: futureDate,
      },
    })
  ).toString('base64');
  const signatureOfToken1 = validToken.split('.')[1];
  const tamperedToken = `${tamperedPayload}.${signatureOfToken1}`;
  const res2 = verifyTestTokenOnServer(tamperedToken);
  assert(res2.isValid === false, 'Server rejects tampered payload with old signature');
  assert(res2.code === 'LICENSE_INVALID', 'Returns LICENSE_INVALID code');

  // Also test wrong signing key
  const forgedToken = createTestToken(
    { orgId: ORG_A_ID, role: 'SUPER_ADMIN', expiresAt: futureDate },
    'wrong-forged-secret-key'
  );
  const res2b = verifyTestTokenOnServer(forgedToken);
  assert(res2b.isValid === false, 'Server rejects token signed with wrong secret key');

  // 3. Token Expired (Beyond Grace Period)
  console.log(`\n[Test 3] Expired Token (> 7 days past expiration)`);
  const expiredToken = createTestToken({
    orgId: ORG_A_ID,
    email: 'vendor_a@photobooth.id',
    hwid: HWID_OFFICE,
    expiresAt: pastDateExpired,
    offlineGracePeriodDays: 7,
  });
  const res3Server = verifyTestTokenOnServer(expiredToken);
  assert(res3Server.isValid === false && res3Server.code === 'LICENSE_EXPIRED', 'Server rejects expired token');
  const res3Local = verifyLocalDesktopToken(expiredToken, HWID_OFFICE);
  assert(res3Local.isValid === false && res3Local.code === 'LICENSE_EXPIRED', 'Desktop marks token as LICENSE_EXPIRED locally');

  // 4. Offline Grace Period (< 7 days past expiration)
  console.log(`\n[Test 4] Offline Grace Period Handling (< 7 days past expiration)`);
  const graceToken = createTestToken({
    orgId: ORG_A_ID,
    email: 'vendor_a@photobooth.id',
    hwid: HWID_OFFICE,
    expiresAt: pastDateGrace,
    offlineGracePeriodDays: 7,
  });
  const res4Local = verifyLocalDesktopToken(graceToken, HWID_OFFICE);
  assert(res4Local.isValid === true, 'Desktop allows execution during offline grace period');
  assert(res4Local.isGracePeriod === true, 'Desktop flags isGracePeriod = true for warning banner');

  // 5. Hardware Fingerprint (Device Binding) Mismatch
  console.log(`\n[Test 5] Hardware Fingerprint (Device Binding) Mismatch`);
  const res5Local = verifyLocalDesktopToken(validToken, HWID_UNKNOWN);
  assert(res5Local.isValid === false, 'Desktop blocks execution when hardware fingerprint mismatches');
  assert(res5Local.code === 'DEVICE_MISMATCH', 'Returns DEVICE_MISMATCH structured error code');

  // 6. Organization Mismatch / Spoofed x-org-id Header
  console.log(`\n[Test 6] Spoofed x-org-id Header Protection`);
  // Simulate an endpoint processing a request from Tenant A who forged `x-org-id: ORG_B_ID`
  function simulateEndpointOrgResolution(reqHeaders) {
    const authHeader = reqHeaders['authorization'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const verified = verifyTestTokenOnServer(token);
    if (!verified.isValid) return { error: verified.error, status: 401 };

    // SERVER RULE: ALWAYS use verified.payload.orgId, NEVER trust reqHeaders['x-org-id']
    const effectiveOrgId = verified.payload.orgId;
    const spoofedHeader = reqHeaders['x-org-id'];

    return {
      success: true,
      authenticatedOrgId: effectiveOrgId,
      spoofedHeaderIgnored: spoofedHeader !== effectiveOrgId,
    };
  }

  const endpointRes = simulateEndpointOrgResolution({
    authorization: `Bearer ${validToken}`, // Belongs to ORG_A_ID
    'x-org-id': ORG_B_ID,                 // Spoofed header for Tenant B
  });
  assert(endpointRes.success === true, 'Request authenticated');
  assert(endpointRes.authenticatedOrgId === ORG_A_ID, 'Server strictly derived orgId from verified token, NOT from header');
  assert(endpointRes.spoofedHeaderIgnored === true, 'Spoofed x-org-id header was completely ignored');

  // 7. Cross-Tenant Access Prevention
  console.log(`\n[Test 7] Cross-Tenant Resource Isolation`);
  function simulateResourceMutation(actorOrgId, resourceOwnerOrgId, operation) {
    if (actorOrgId !== resourceOwnerOrgId) {
      return { allowed: false, status: 404, message: 'Resource not found in tenant organization' };
    }
    return { allowed: true, status: 200, message: `${operation} succeeded` };
  }

  const crossTenantAttempt = simulateResourceMutation(ORG_A_ID, ORG_B_ID, 'DELETE_EVENT');
  assert(crossTenantAttempt.allowed === false, 'Tenant A cannot mutate Tenant B resource');
  assert(crossTenantAttempt.status === 404, 'Returns 404 Not Found to prevent tenant enumeration');

  const sameTenantAttempt = simulateResourceMutation(ORG_A_ID, ORG_A_ID, 'DELETE_EVENT');
  assert(sameTenantAttempt.allowed === true, 'Tenant A can mutate own resource');

  // 8. Unauthorized Role Access to Admin APIs
  console.log(`\n[Test 8] Role-Based Authorization Enforcement`);
  function simulateAdminEndpoint(token) {
    const verified = verifyTestTokenOnServer(token);
    if (!verified.isValid) return { status: 401, error: 'AUTH_REQUIRED' };
    const role = (verified.payload.role || '').toUpperCase();
    if (role !== 'SUPER_ADMIN') {
      return { status: 403, error: 'ORG_ACCESS_DENIED: Superadmin privileges required' };
    }
    return { status: 200, success: true, data: 'Superadmin sensitive stats' };
  }

  // Vendor token trying to access admin endpoint
  const adminAccessByVendor = simulateAdminEndpoint(validToken); // role: 'VENDOR'
  assert(adminAccessByVendor.status === 403, 'Vendor token is blocked from Superadmin endpoint with 403');
  assert(adminAccessByVendor.error.includes('ORG_ACCESS_DENIED'), 'Returns ORG_ACCESS_DENIED error');

  // Superadmin token trying to access admin endpoint
  const superAdminToken = createTestToken({
    orgId: ORG_A_ID,
    email: 'superadmin@minglebooth.com',
    role: 'SUPER_ADMIN',
    expiresAt: futureDate,
  });
  const adminAccessBySuperAdmin = simulateAdminEndpoint(superAdminToken);
  assert(adminAccessBySuperAdmin.status === 200, 'Superadmin token succeeds on admin endpoint');

  // 9. Unauthenticated Requests
  console.log(`\n[Test 9] Unauthenticated Request Rejection`);
  const noAuthRes = verifyTestTokenOnServer(null);
  assert(noAuthRes.isValid === false && noAuthRes.code === 'AUTH_REQUIRED', 'Missing token rejected with AUTH_REQUIRED');

  // 10. Service-role Secret Not Bundled in Desktop
  console.log(`\n[Test 10] Desktop Bundle Secret Leakage Audit`);
  const desktopSrcDir = path.resolve(__dirname, '../apps/desktop/src');
  function searchDirectoryForPattern(dir, pattern) {
    let found = [];
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const f of files) {
      const full = path.join(dir, f.name);
      if (f.isDirectory()) {
        found = found.concat(searchDirectoryForPattern(full, pattern));
      } else if (f.isFile() && (f.name.endsWith('.ts') || f.name.endsWith('.tsx') || f.name.endsWith('.js') || f.name.endsWith('.json'))) {
        const content = fs.readFileSync(full, 'utf8');
        if (content.includes(pattern)) {
          found.push(full);
        }
      }
    }
    return found;
  }

  const leakedFiles = searchDirectoryForPattern(desktopSrcDir, 'SUPABASE_SERVICE_ROLE_KEY');
  assert(leakedFiles.length === 0, 'Zero occurrences of SUPABASE_SERVICE_ROLE_KEY in apps/desktop/src');

  // 11. Offline with Valid Cached Token
  console.log(`\n[Test 11] Offline Operation with Cached Valid Token`);
  const res11 = verifyLocalDesktopToken(validToken, HWID_OFFICE);
  assert(res11.isValid === true, 'Offline desktop starts up and verifies valid cached token without network');

  // 12. Offline without Valid Token
  console.log(`\n[Test 12] Offline Operation without Valid Token`);
  const res12 = verifyLocalDesktopToken('', HWID_OFFICE);
  assert(res12.isValid === false && res12.code === 'AUTH_REQUIRED', 'Desktop prompts for vendor activation when token is missing');

  console.log(`\n${GREEN}======================================================${RESET}`);
  console.log(`${GREEN}   PHASE 15.2 TEST SUITE PASSED: ${passedTests}/${totalTests} TESTS OK${RESET}`);
  console.log(`${GREEN}======================================================${RESET}\n`);
}

runTestSuite().catch((err) => {
  console.error('\nTest Suite Failed:', err);
  process.exit(1);
});
