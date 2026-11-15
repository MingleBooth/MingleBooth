import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../apps/web/.env.local') });

import { NextRequest } from 'next/server';
import { createSignedToken } from '@/lib/auth-server';
import { GET as getEventsRoute } from '@/app/api/vendor/events/route';

async function main() {
  console.log('========================================================================');
  console.log('   AUDITING BACKEND & SUPABASE DATA SOURCE FOR VENDOR EVENTS           ');
  console.log('========================================================================\n');

  // 1. Valid Token for ABC Photobooth Studio (org with real event)
  const abcPayload = {
    orgId: '3d7a886f-b3b2-47a6-bcf5-e0a7c3a8f117',
    orgName: 'ABC Photobooth Studio',
    planTier: 'starter',
    role: 'VENDOR_OWNER',
    email: 'abc@photobooth.id',
    hwid: 'MOBILE-EXPO-PREVIEW-01',
    expiresAt: '2027-09-01T11:06:33.573Z',
    isDemo: false,
  };
  const abcToken = createSignedToken(abcPayload);

  const reqAbc = new NextRequest('http://localhost:3000/api/vendor/events', {
    method: 'GET',
    headers: { Authorization: `Bearer ${abcToken}` },
  });

  const resAbc = await getEventsRoute(reqAbc);
  console.log(`[Test 1] GET /api/vendor/events (ABC Photobooth Studio) -> HTTP ${resAbc.status}`);
  const dataAbc = await resAbc.json();
  console.log('Response shape:', {
    hasEvents: Array.isArray(dataAbc.events),
    eventCount: dataAbc.events?.length,
    events: dataAbc.events,
    org: dataAbc.org,
  });

  if (resAbc.status !== 200 || dataAbc.events?.length !== 1 || dataAbc.events[0].id !== '8d17755c-b86a-4229-b4cf-94c574bb6109') {
    throw new Error('Test 1 Failed: ABC Photobooth Studio event did not match database record!');
  }
  console.log('✓ PASS: Real event from Supabase successfully retrieved via authenticated API route.\n');

  // 2. Organization with 0 events
  const emptyOrgPayload = {
    orgId: '1874a03a-686a-49f9-96cd-246f79ab7232',
    orgName: 'Expired Studio 94c9b97d',
    planTier: 'starter',
    role: 'VENDOR_OWNER',
    email: 'empty@studio.test',
    hwid: 'MOBILE-EXPO-PREVIEW-02',
    expiresAt: '2027-09-01T11:06:33.573Z',
    isDemo: false,
  };
  const emptyToken = createSignedToken(emptyOrgPayload);

  const reqEmpty = new NextRequest('http://localhost:3000/api/vendor/events', {
    method: 'GET',
    headers: { Authorization: `Bearer ${emptyToken}` },
  });

  const resEmpty = await getEventsRoute(reqEmpty);
  console.log(`[Test 2] GET /api/vendor/events (Empty Org) -> HTTP ${resEmpty.status}`);
  const dataEmpty = await resEmpty.json();
  console.log('Response shape:', {
    hasEvents: Array.isArray(dataEmpty.events),
    eventCount: dataEmpty.events?.length,
  });

  if (resEmpty.status !== 200 || !Array.isArray(dataEmpty.events) || dataEmpty.events.length !== 0) {
    throw new Error('Test 2 Failed: Empty org should return empty events array!');
  }
  console.log('✓ PASS: Empty database results properly returned as empty array (no mock fallback).\n');

  // 3. Unauthenticated request
  const reqNoAuth = new NextRequest('http://localhost:3000/api/vendor/events', { method: 'GET' });
  const resNoAuth = await getEventsRoute(reqNoAuth);
  console.log(`[Test 3] GET /api/vendor/events (No Auth) -> HTTP ${resNoAuth.status}`);
  const dataNoAuth = await resNoAuth.json();
  console.log('Error returned:', dataNoAuth);

  if (resNoAuth.status !== 401 || dataNoAuth.code !== 'AUTH_REQUIRED') {
    throw new Error('Test 3 Failed: Unauthenticated request was not rejected with 401 AUTH_REQUIRED!');
  }
  console.log('✓ PASS: Unauthenticated access properly rejected with 401 AUTH_REQUIRED.\n');

  // 4. Corrupted / invalid token
  const reqInvalid = new NextRequest('http://localhost:3000/api/vendor/events', {
    method: 'GET',
    headers: { Authorization: 'Bearer invalid.tampered.token' },
  });
  const resInvalid = await getEventsRoute(reqInvalid);
  console.log(`[Test 4] GET /api/vendor/events (Invalid Token) -> HTTP ${resInvalid.status}`);
  const dataInvalid = await resInvalid.json();
  console.log('Error returned:', dataInvalid);

  if (resInvalid.status !== 401 || dataInvalid.code !== 'LICENSE_INVALID') {
    throw new Error('Test 4 Failed: Invalid token was not rejected with 401 LICENSE_INVALID!');
  }
  console.log('✓ PASS: Invalid token properly rejected with 401 LICENSE_INVALID.\n');

  console.log('========================================================================');
  console.log('   ALL AUDIT CHECKS PASSED: BACKEND ROUTE & SUPABASE READY              ');
  console.log('========================================================================');
}

main().catch((err) => {
  console.error('Audit execution error:', err);
  process.exit(1);
});
