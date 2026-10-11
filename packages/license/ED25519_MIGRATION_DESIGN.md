# ARCHITECTURAL DESIGN & MIGRATION PLAN: ED25519 ASYMMETRIC LICENSE VERIFICATION

**Project:** MingleBooth Studio  
**Component:** `@minglebooth/license` & `@minglebooth/web` Auth Subsystem  
**Phase:** 15.4.1 Security Audit  
**Status:** MIGRATION PLAN PREPARED (PENDING STAGED ROLLOUT)

---

## 1. Executive Summary & Root Cause Analysis

### 1.1 The Cryptographic Dilemma in Desktop Client Software
In MingleBooth Studio's commercial model:
1. Vendor operator kiosks run on vendor laptops (macOS and Windows), often at wedding/event venues without internet access.
2. The server authenticates vendors and issues license tokens granting kiosk operation.
3. In Phase 15.2 and 15.4, tokens are signed using **HMAC-SHA256**.
4. HMAC is a **symmetric** cryptographic algorithm: the exact same secret key is required both to create the signature and to verify it.
5. If the server's HMAC secret (`SUPABASE_SERVICE_ROLE_KEY` or shared secret) were embedded in the desktop application, any vendor or reverse-engineer with a disassembler or DevTools could extract the secret and forge infinite lifetime licenses for any organization.
6. To avoid leaking server secrets, `packages/license/src/license-verifier.ts` explicitly omitted client-side HMAC signature checking:
   ```typescript
   // NOTE: Full HMAC-SHA256 signature verification is performed by the server
   // to protect server signing secrets from client-side exposure.
   ```
7. Consequently, in the current implementation, when the kiosk is **offline**, `verifyTokenString()` only inspects decoded payload fields (`orgId`, `hwid`, `expiresAt`) without cryptographic verification of `sig`.
8. While online verification (`POST /api/auth/verify-license`) cryptographically validates the token against the database, an offline device could technically be tricked if a local token is manually altered, until the kiosk reconnects to the internet.

---

## 2. Asymmetric Cryptography Solution: Ed25519 (RFC 8032)

To enable **cryptographically secure offline verification** without leaking signing capability:
We transition from symmetric HMAC to **asymmetric public-key cryptography** using **Ed25519** (Edwards-curve Digital Signature Algorithm over Curve25519).

### 2.1 Key Pair Architecture
| Key | Location | Security Boundary | Purpose |
| :--- | :--- | :--- | :--- |
| **Private Signing Key** (`ed25519_sk`) | Server-only (`process.env.LICENSE_SIGNING_PRIVATE_KEY_ED25519`) | Stored in Supabase Vault / Vercel Secrets | Generates digital signatures for issued licenses. Never distributed. |
| **Public Verification Key** (`ed25519_pk`) | Embedded in Desktop App (`apps/desktop`) | Publicly embeddable (safe for reverse-engineering) | Verifies that a license token was signed by MingleBooth HQ. Cannot sign new tokens. |

---

## 3. License Token Format Specification (v2: Ed25519)

The v2 license token follows a compact, tamper-evident 3-part format:
```text
Base64Url(Header) . Base64Url(Payload) . Base64Url(Ed25519Signature)
```

### 3.1 Header
```json
{
  "alg": "Ed25519",
  "typ": "MBL-v2",
  "kid": "mb-sign-2026-v1"
}
```

### 3.2 Payload (Claims)
```json
{
  "sub": "3d7a886f-b3b2-47a6-bcf5-e0a7c3a8f117",
  "orgName": "Sebuah Kenang Studio",
  "planTier": "pro",
  "maxDevices": 3,
  "hwid": "MAC-8f921ab0",
  "iat": 1788000000,
  "exp": 1819536000,
  "graceDays": 7,
  "nonce": "7a8b9c0d1e2f"
}
```

### 3.3 Signature
64-byte Ed25519 signature computed over `UTF8(Base64Url(Header) + "." + Base64Url(Payload))`.

---

## 4. Threat Model & Offline Defenses

### 4.1 Payload Tampering
- **Threat:** Vendor edits Base64 string to change `exp` or `planTier`.
- **Mitigation:** The desktop client runs `crypto.verify(null, data, publicKey, signature)` (or WebCrypto `subtle.verify`). If a single bit in the header or payload is modified, mathematical verification fails with 100% certainty.

### 4.2 Replay to Another Machine
- **Threat:** Vendor copies a valid license token to an unauthorized laptop.
- **Mitigation:** Hardware fingerprinting (`hwid`) binding is included in signed claims. The desktop client computes the local machine's HWID and verifies `claims.hwid === localHwid`.

### 4.3 Clock Rollback Attack
- **Threat:** Vendor sets system clock back to 2025 to keep an expired token valid offline.
- **Mitigation:** 
  1. Desktop client persists a local monotonic timestamp checkpoint (`last_known_utc_ms`) in secure app storage whenever the app runs or captures photos.
  2. If `current_system_time < last_known_utc_ms - 1_hour`, clock tampering is detected.
  3. App enters limited mode and demands an online time sync.

### 4.4 Device Revocation (Refunds / Deactivations)
- **Threat:** Vendor deactivates a laptop on Vendor Dashboard, but continues using it offline.
- **Mitigation:**
  1. The token has a maximum offline lifetime (e.g. 7-day grace period or 30-day periodic re-attestation).
  2. Whenever network is available, non-blocking background check hits `/api/auth/verify-license`.
  3. If server responds with `DEVICE_MISMATCH` or `LICENSE_EXPIRED`, local token is purged.

---

## 5. Staged Migration Plan (Zero-Downtime)

To avoid breaking existing deployed vendor installations, rollout proceeds in 4 controlled stages:

### Stage 1: Design & Audit (Phase 15.4.1 — COMPLETED)
- Formally document the cryptographic boundary and limitation.
- Maintain existing HMAC tokens for backward compatibility.
- Ensure server rejects forged/expired tokens during all online API calls.

### Stage 2: Dual Token Issuer (Server Release)
- Provision server Ed25519 keypair in production environment.
- Update `/api/auth/vendor-login` to issue v2 Ed25519 tokens while preserving legacy metadata fields.
- Update `/api/auth/verify-license` to accept both v1 HMAC tokens and v2 Ed25519 tokens.

### Stage 3: Desktop Dual-Verifier Rollout
- Update `packages/license/src/license-verifier.ts` to inspect token header:
  - If `alg === 'Ed25519'`: perform full asymmetric signature verification with embedded public key.
  - If legacy format (v1 HMAC): perform payload claim validation with a transition grace period.
- Ship with next desktop application installer release.

### Stage 4: Sunset Legacy v1 HMAC Tokens
- After 90 days, sunset v1 token acceptance.
- All kiosks operate under full cryptographic asymmetric offline verification.
