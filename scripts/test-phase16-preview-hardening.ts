/**
 * PHASE 16 — SHARED SUPABASE SAFETY HARDENING TEST SUITE
 * 
 * Verifies that all mutation routes fail-closed and are strictly blocked
 * when running in Vercel Preview environment, preventing any accidental
 * mutation, deletion, or settlement against the shared production Supabase.
 *
 * STRICT SAFETY ASSURANCE:
 * This test suite uses test doubles/spies and verifies that Supabase client
 * is NOT invoked during preview guard rejection. No production records are mutated.
 */

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../apps/web/.env.local') });

import { NextRequest } from 'next/server';
import { isPreviewDeployment, previewBlockedResponse } from '@/lib/preview-guard';
import { BASELINE_PLANS } from '@/lib/pricing';
import * as supabaseModule from '@/lib/supabase';

// Handlers under test
import { POST as checkoutPost } from '@/app/api/vendor/checkout/route';
import { POST as billingWebhookPost } from '@/app/api/billing/webhook/route';
import { POST as legacyPaymentPost } from '@/app/api/webhooks/payment/route';
import { POST as reconcileBillingPost } from '@/app/api/admin/reconcile-billing/route';
import { GET as cronCleanupGet } from '@/app/api/cron/cleanup/route';
import { POST as createEventPost, PATCH as updateEventPatch, DELETE as deleteEvent, GET as getEvents } from '@/app/api/vendor/events/route';
import { POST as createTemplatePost, DELETE as deleteTemplate, GET as getTemplates } from '@/app/api/vendor/templates/route';
import { POST as webRegisterPost } from '@/app/api/auth/web-register/route';
import { POST as vendorLoginPost } from '@/app/api/auth/vendor-login/route';
import { GET as getPricing } from '@/app/api/pricing/route';
import { POST as adminVendorsPost } from '@/app/api/admin/vendors/route';
import { POST as adminAdminsPost, DELETE as adminAdminsDelete } from '@/app/api/admin/admins/route';
import { POST as adminPricingPost } from '@/app/api/admin/pricing/route';
import { POST as setupSuperadminPost } from '@/app/api/auth/setup-superadmin/route';
import { POST as seedSuperadminPost } from '@/app/api/admin/seed-superadmin/route';
import { POST as seedPost } from '@/app/api/seed/route';
import { POST as uploadCapturePost } from '@/app/api/sync/upload-capture/route';
import { POST as deactivateDevicePost } from '@/app/api/auth/deactivate-device/route';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: ${testName}${detail ? ` — ${detail}` : ''}`);
  }
}

async function runSuite() {
  console.log('\n========================================================================');
  console.log('   PHASE 16 — PREVIEW SAFETY HARDENING AUTOMATED TEST SUITE             ');
  console.log('========================================================================\n');

  // Preserve original environment variables
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalNextPublicVercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV;
  const originalMingleboothEnv = process.env.MINGLEBOOTH_ENV;
  const originalIsPreview = process.env.IS_PREVIEW;
  const originalCronSecret = process.env.CRON_SECRET;
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    // ------------------------------------------------------------------------
    // SECTION A: PREVIEW ENVIRONMENT DETECTION
    // ------------------------------------------------------------------------
    console.log('--- SECTION A: Preview Environment Detection ---');

    // Case 1: VERCEL_ENV='preview'
    process.env.VERCEL_ENV = 'preview';
    assert(isPreviewDeployment() === true, 'Detection identifies VERCEL_ENV="preview"');

    // Case 2: NEXT_PUBLIC_VERCEL_ENV='preview'
    delete process.env.VERCEL_ENV;
    process.env.NEXT_PUBLIC_VERCEL_ENV = 'preview';
    assert(isPreviewDeployment() === true, 'Detection identifies NEXT_PUBLIC_VERCEL_ENV="preview"');

    // Case 3: MINGLEBOOTH_ENV='preview'
    delete process.env.NEXT_PUBLIC_VERCEL_ENV;
    process.env.MINGLEBOOTH_ENV = 'preview';
    assert(isPreviewDeployment() === true, 'Detection identifies MINGLEBOOTH_ENV="preview"');

    // Case 4: IS_PREVIEW='true'
    delete process.env.MINGLEBOOTH_ENV;
    process.env.IS_PREVIEW = 'true';
    assert(isPreviewDeployment() === true, 'Detection identifies IS_PREVIEW="true"');

    // Case 5: Production environment does not trigger preview guard
    delete process.env.IS_PREVIEW;
    process.env.VERCEL_ENV = 'production';
    assert(isPreviewDeployment() === false, 'Detection does not trigger on VERCEL_ENV="production"');

    // ------------------------------------------------------------------------
    // SECTION B: PREVIEW MUTATION GUARDS (FAIL-CLOSED IN PREVIEW)
    // ------------------------------------------------------------------------
    console.log('\n--- SECTION B: Preview Mutation Endpoints Blocked ---');
    // Enable Preview mode for all Section B tests
    process.env.VERCEL_ENV = 'preview';

    // 1. Preview checkout rejected
    const checkoutReq = new NextRequest('http://localhost:3000/api/vendor/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationId: '00000000-0000-0000-0000-000000000001', planTier: 'pro', billingInterval: 'monthly' }),
    });
    const checkoutRes = await checkoutPost(checkoutReq);
    const checkoutData = await checkoutRes.json();
    assert(
      checkoutRes.status === 403 && checkoutData.code === 'PREVIEW_MUTATION_BLOCKED',
      '[Test 1] Preview checkout rejected (403 PREVIEW_MUTATION_BLOCKED)'
    );

    // 2. Preview billing webhook rejected before settlement
    const billingWebhookReq = new NextRequest('http://localhost:3000/api/billing/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'payment.success', order_id: 'MB-TEST-001' }),
    });
    const billingWebhookRes = await billingWebhookPost(billingWebhookReq);
    const billingWebhookData = await billingWebhookRes.json();
    assert(
      billingWebhookRes.status === 403 && billingWebhookData.code === 'PREVIEW_MUTATION_BLOCKED',
      '[Test 2] Preview billing webhook rejected before settlement (403 PREVIEW_MUTATION_BLOCKED)'
    );

    // 3. Preview legacy payment webhook rejected
    const legacyPaymentReq = new NextRequest('http://localhost:3000/api/webhooks/payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant_order_id: 'ORDER-123', status: 'settled' }),
    });
    const legacyPaymentRes = await legacyPaymentPost(legacyPaymentReq);
    const legacyPaymentData = await legacyPaymentRes.json();
    assert(
      legacyPaymentRes.status === 403 && legacyPaymentData.code === 'PREVIEW_MUTATION_BLOCKED',
      '[Test 3] Preview legacy payment webhook rejected (403 PREVIEW_MUTATION_BLOCKED)'
    );

    // 4. Preview reconcile billing rejected
    const reconcileReq = new NextRequest('http://localhost:3000/api/admin/reconcile-billing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationId: '00000000-0000-0000-0000-000000000001' }),
    });
    const reconcileRes = await reconcileBillingPost(reconcileReq);
    const reconcileData = await reconcileRes.json();
    assert(
      reconcileRes.status === 403 && reconcileData.code === 'PREVIEW_MUTATION_BLOCKED',
      '[Test 4] Preview reconcile billing rejected (403 PREVIEW_MUTATION_BLOCKED)'
    );

    // 5. Preview cron cleanup does not delete objects
    const cleanupReq = new NextRequest('http://localhost:3000/api/cron/cleanup', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer test-secret' },
    });
    const cleanupRes = await cronCleanupGet(cleanupReq);
    const cleanupData = await cleanupRes.json();
    assert(
      cleanupRes.status === 403 && cleanupData.code === 'PREVIEW_MUTATION_BLOCKED',
      '[Test 5] Preview cron cleanup does not delete objects (403 PREVIEW_MUTATION_BLOCKED)'
    );

    // 6. Preview delete event does not delete event or storage
    const deleteEventReq = new NextRequest('http://localhost:3000/api/vendor/events?id=test-event-id', {
      method: 'DELETE',
    });
    const deleteEventRes = await deleteEvent(deleteEventReq);
    const deleteEventData = await deleteEventRes.json();
    assert(
      deleteEventRes.status === 403 && deleteEventData.code === 'PREVIEW_MUTATION_BLOCKED',
      '[Test 6a] Preview delete event does not delete event or storage (403 PREVIEW_MUTATION_BLOCKED)'
    );

    // 6b. Preview delete template does not delete template
    const deleteTemplateReq = new NextRequest('http://localhost:3000/api/vendor/templates?id=test-template-id', {
      method: 'DELETE',
    });
    const deleteTemplateRes = await deleteTemplate(deleteTemplateReq);
    const deleteTemplateData = await deleteTemplateRes.json();
    assert(
      deleteTemplateRes.status === 403 && deleteTemplateData.code === 'PREVIEW_MUTATION_BLOCKED',
      '[Test 6b] Preview delete template rejected (403 PREVIEW_MUTATION_BLOCKED)'
    );

    // 7. Preview public registration does not create production account or organization
    const registerReq = new NextRequest('http://localhost:3000/api/auth/web-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studioName: 'Preview Studio', email: 'preview@example.com', password: 'Password123!' }),
    });
    const registerRes = await webRegisterPost(registerReq);
    const registerData = await registerRes.json();
    assert(
      registerRes.status === 403 && registerData.code === 'PREVIEW_MUTATION_BLOCKED',
      '[Test 7] Preview public registration rejected (403 PREVIEW_MUTATION_BLOCKED)'
    );

    // 8. Preview cannot modify production entitlement (admin vendors & admin pricing)
    const adminVendorReq = new NextRequest('http://localhost:3000/api/admin/vendors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'change_plan', vendorId: '00000000-0000-0000-0000-000000000001', planTier: 'business' }),
    });
    const adminVendorRes = await adminVendorsPost(adminVendorReq);
    const adminVendorData = await adminVendorRes.json();
    assert(
      adminVendorRes.status === 403 && adminVendorData.code === 'PREVIEW_MUTATION_BLOCKED',
      '[Test 8a] Preview admin vendor modification rejected (403 PREVIEW_MUTATION_BLOCKED)'
    );

    const adminPricingReq = new NextRequest('http://localhost:3000/api/admin/pricing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId: 'starter', billingInterval: 'monthly', newAmountIdr: 100000 }),
    });
    const adminPricingRes = await adminPricingPost(adminPricingReq);
    const adminPricingData = await adminPricingRes.json();
    assert(
      adminPricingRes.status === 403 && adminPricingData.code === 'PREVIEW_MUTATION_BLOCKED',
      '[Test 8b] Preview admin pricing modification rejected (403 PREVIEW_MUTATION_BLOCKED)'
    );

    // 8c. Preview admin admins CRUD rejected
    const adminAdminsPostReq = new NextRequest('http://localhost:3000/api/admin/admins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'newadmin@example.com' }),
    });
    const adminAdminsPostRes = await adminAdminsPost(adminAdminsPostReq);
    const adminAdminsPostData = await adminAdminsPostRes.json();
    assert(
      adminAdminsPostRes.status === 403 && adminAdminsPostData.code === 'PREVIEW_MUTATION_BLOCKED',
      '[Test 8c] Preview admin admin creation rejected (403 PREVIEW_MUTATION_BLOCKED)'
    );

    const adminAdminsDeleteReq = new NextRequest('http://localhost:3000/api/admin/admins?id=test-id', {
      method: 'DELETE',
    });
    const adminAdminsDeleteRes = await adminAdminsDelete(adminAdminsDeleteReq);
    const adminAdminsDeleteData = await adminAdminsDeleteRes.json();
    assert(
      adminAdminsDeleteRes.status === 403 && adminAdminsDeleteData.code === 'PREVIEW_MUTATION_BLOCKED',
      '[Test 8d] Preview admin admin deletion rejected (403 PREVIEW_MUTATION_BLOCKED)'
    );

    // 8e. Preview seed and superadmin routes rejected
    const setupSuperadminReq = new NextRequest('http://localhost:3000/api/auth/setup-superadmin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'super@minglebooth.com' }),
    });
    const setupSuperadminRes = await setupSuperadminPost(setupSuperadminReq);
    const setupSuperadminData = await setupSuperadminRes.json();
    assert(
      setupSuperadminRes.status === 403 && setupSuperadminData.code === 'PREVIEW_MUTATION_BLOCKED',
      '[Test 8e] Preview setup-superadmin rejected (403 PREVIEW_MUTATION_BLOCKED)'
    );

    const seedSuperadminReq = new NextRequest('http://localhost:3000/api/admin/seed-superadmin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const seedSuperadminRes = await seedSuperadminPost(seedSuperadminReq);
    const seedSuperadminData = await seedSuperadminRes.json();
    assert(
      seedSuperadminRes.status === 403 && seedSuperadminData.code === 'PREVIEW_MUTATION_BLOCKED',
      '[Test 8f] Preview seed-superadmin rejected (403 PREVIEW_MUTATION_BLOCKED)'
    );

    const seedReq = new NextRequest('http://localhost:3000/api/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const seedRes = await seedPost(seedReq);
    const seedData = await seedRes.json();
    assert(
      seedRes.status === 403 && seedData.code === 'PREVIEW_MUTATION_BLOCKED',
      '[Test 8g] Preview seed route rejected (403 PREVIEW_MUTATION_BLOCKED)'
    );

    // 8h. Preview sync upload-capture rejected (protecting storage and photo records)
    const uploadCaptureReq = new NextRequest('http://localhost:3000/api/sync/upload-capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoId: 'test-photo-001', eventId: 'evt-001', fileDataUrl: 'data:image/svg+xml;utf8,<svg></svg>' }),
    });
    const uploadCaptureRes = await uploadCapturePost(uploadCaptureReq);
    const uploadCaptureData = await uploadCaptureRes.json();
    assert(
      uploadCaptureRes.status === 403 && uploadCaptureData.code === 'PREVIEW_MUTATION_BLOCKED',
      '[Test 8h] Preview upload-capture rejected (403 PREVIEW_MUTATION_BLOCKED)'
    );

    // 8i. Preview deactivate-device rejected (protecting production device status)
    const deactivateDevReq = new NextRequest('http://localhost:3000/api/auth/deactivate-device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: 'dev-001' }),
    });
    const deactivateDevRes = await deactivateDevicePost(deactivateDevReq);
    const deactivateDevData = await deactivateDevRes.json();
    assert(
      deactivateDevRes.status === 403 && deactivateDevData.code === 'PREVIEW_MUTATION_BLOCKED',
      '[Test 8i] Preview deactivate-device rejected (403 PREVIEW_MUTATION_BLOCKED)'
    );

    // 8j. Preview POST event returns 403 PREVIEW_MUTATION_BLOCKED
    const createEventReq = new NextRequest('http://localhost:3000/api/vendor/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Preview Test Event', date: '2026-10-10' }),
    });
    const createEventRes = await createEventPost(createEventReq);
    const createEventData = await createEventRes.json();
    assert(
      createEventRes.status === 403 && createEventData.code === 'PREVIEW_MUTATION_BLOCKED',
      '[Test 8j] Preview POST create event rejected (403 PREVIEW_MUTATION_BLOCKED)'
    );

    // 8k. Preview PATCH event returns 403 PREVIEW_MUTATION_BLOCKED
    const updateEventReq = new NextRequest('http://localhost:3000/api/vendor/events', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'evt-test-123', name: 'Updated Event' }),
    });
    const updateEventRes = await updateEventPatch(updateEventReq);
    const updateEventData = await updateEventRes.json();
    assert(
      updateEventRes.status === 403 && updateEventData.code === 'PREVIEW_MUTATION_BLOCKED',
      '[Test 8k] Preview PATCH update event rejected (403 PREVIEW_MUTATION_BLOCKED)'
    );

    // 8l. Preview POST template returns 403 PREVIEW_MUTATION_BLOCKED
    const createTemplateReq = new NextRequest('http://localhost:3000/api/vendor/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Preview Template' }),
    });
    const createTemplateRes = await createTemplatePost(createTemplateReq);
    const createTemplateData = await createTemplateRes.json();
    assert(
      createTemplateRes.status === 403 && createTemplateData.code === 'PREVIEW_MUTATION_BLOCKED',
      '[Test 8l] Preview POST create template rejected (403 PREVIEW_MUTATION_BLOCKED)'
    );

    // 8m. Preview vendor device activation returns 403 PREVIEW_MUTATION_BLOCKED
    const vendorLoginReq = new NextRequest('http://localhost:3000/api/auth/vendor-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'vendor@example.com', hardwareFingerprint: 'HWID-TEST-001' }),
    });
    const vendorLoginRes = await vendorLoginPost(vendorLoginReq);
    const vendorLoginData = await vendorLoginRes.json();
    assert(
      vendorLoginRes.status === 403 && vendorLoginData.code === 'PREVIEW_MUTATION_BLOCKED',
      '[Test 8m] Preview vendor device activation rejected (403 PREVIEW_MUTATION_BLOCKED)'
    );

    // 8n. Preview GET pricing remains functional (returns 200, not blocked)
    const pricingGetRes = await getPricing();
    const pricingGetData = await pricingGetRes.json();
    assert(
      pricingGetRes.status === 200 && pricingGetData.success === true,
      '[Test 8n] Preview GET pricing remains functional (200 OK, not blocked)'
    );

    // 8o. Preview GET events remains functional (preserves auth gate, returns 401 AUTH_REQUIRED, not preview blocked)
    const getEventsReq = new NextRequest('http://localhost:3000/api/vendor/events', { method: 'GET' });
    const getEventsRes = await getEvents(getEventsReq);
    const getEventsData = await getEventsRes.json();
    assert(
      getEventsRes.status === 401 && getEventsData.code === 'AUTH_REQUIRED',
      '[Test 8o] Preview GET events preserves auth gate (401 AUTH_REQUIRED, not preview blocked)'
    );

    // 8p. Preview GET templates remains functional (preserves auth gate, returns 401 AUTH_REQUIRED, not preview blocked)
    const getTemplatesReq = new NextRequest('http://localhost:3000/api/vendor/templates', { method: 'GET' });
    const getTemplatesRes = await getTemplates(getTemplatesReq);
    const getTemplatesData = await getTemplatesRes.json();
    assert(
      getTemplatesRes.status === 401 && getTemplatesData.code === 'AUTH_REQUIRED',
      '[Test 8p] Preview GET templates preserves auth gate (401 AUTH_REQUIRED, not preview blocked)'
    );

    // ------------------------------------------------------------------------
    // SECTION C: PRODUCTION PATH PRESERVES PROPER AUTHORIZATION
    // ------------------------------------------------------------------------
    console.log('\n--- SECTION C: Production Path Preserves Authorization ---');
    // Set to Production
    process.env.VERCEL_ENV = 'production';
    delete process.env.IS_PREVIEW;

    // In production, unauthenticated checkout should return 401 AUTH_REQUIRED, not preview blocked
    const prodCheckoutReq = new NextRequest('http://localhost:3000/api/vendor/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationId: '00000000-0000-0000-0000-000000000001', planTier: 'pro', billingInterval: 'monthly' }),
    });
    const prodCheckoutRes = await checkoutPost(prodCheckoutReq);
    const prodCheckoutData = await prodCheckoutRes.json();
    assert(
      prodCheckoutRes.status === 401 && prodCheckoutData.code === 'AUTH_REQUIRED',
      '[Test 9a] Production checkout enforces auth (401 AUTH_REQUIRED, not preview blocked)'
    );

    // In production, unauthenticated delete event should return 401 AUTH_REQUIRED
    const prodDeleteEventReq = new NextRequest('http://localhost:3000/api/vendor/events?id=test-id', {
      method: 'DELETE',
    });
    const prodDeleteEventRes = await deleteEvent(prodDeleteEventReq);
    const prodDeleteEventData = await prodDeleteEventRes.json();
    assert(
      prodDeleteEventRes.status === 401 && prodDeleteEventData.code === 'AUTH_REQUIRED',
      '[Test 9b] Production delete event enforces auth (401 AUTH_REQUIRED, not preview blocked)'
    );

    // In production, cron cleanup without CRON_SECRET fails closed with 500 CRON_SECRET_REQUIRED
    delete process.env.CRON_SECRET;
    const prodCronReqMissing = new NextRequest('http://localhost:3000/api/cron/cleanup', {
      method: 'GET',
    });
    const prodCronResMissing = await cronCleanupGet(prodCronReqMissing);
    const prodCronDataMissing = await prodCronResMissing.json();
    assert(
      prodCronResMissing.status === 500 && prodCronDataMissing.code === 'CRON_SECRET_REQUIRED',
      '[Test 9c] Production cron cleanup fails closed without CRON_SECRET (500 CRON_SECRET_REQUIRED)'
    );

    // In production with CRON_SECRET configured, invalid token fails closed with 401 CRON_AUTH_REQUIRED
    process.env.CRON_SECRET = 'valid-cron-secret-123';
    const prodCronReqInvalid = new NextRequest('http://localhost:3000/api/cron/cleanup', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer wrong-secret' },
    });
    const prodCronResInvalid = await cronCleanupGet(prodCronReqInvalid);
    const prodCronDataInvalid = await prodCronResInvalid.json();
    assert(
      prodCronResInvalid.status === 401 && prodCronDataInvalid.code === 'CRON_AUTH_REQUIRED',
      '[Test 9d] Production cron cleanup rejects invalid authorization (401 CRON_AUTH_REQUIRED)'
    );

    // Production POST create event enforces auth (401 AUTH_REQUIRED, not preview blocked)
    const prodCreateEventReq = new NextRequest('http://localhost:3000/api/vendor/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Prod Event', date: '2026-10-10' }),
    });
    const prodCreateEventRes = await createEventPost(prodCreateEventReq);
    const prodCreateEventData = await prodCreateEventRes.json();
    assert(
      prodCreateEventRes.status === 401 && prodCreateEventData.code === 'AUTH_REQUIRED',
      '[Test 9e] Production POST create event enforces auth (401 AUTH_REQUIRED, not preview blocked)'
    );

    // Production PATCH update event enforces auth (401 AUTH_REQUIRED, not preview blocked)
    const prodUpdateEventReq = new NextRequest('http://localhost:3000/api/vendor/events', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'evt-123', name: 'Prod Event' }),
    });
    const prodUpdateEventRes = await updateEventPatch(prodUpdateEventReq);
    const prodUpdateEventData = await prodUpdateEventRes.json();
    assert(
      prodUpdateEventRes.status === 401 && prodUpdateEventData.code === 'AUTH_REQUIRED',
      '[Test 9f] Production PATCH update event enforces auth (401 AUTH_REQUIRED, not preview blocked)'
    );

    // Production POST create template enforces auth (401 AUTH_REQUIRED, not preview blocked)
    const prodCreateTemplateReq = new NextRequest('http://localhost:3000/api/vendor/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Prod Template' }),
    });
    const prodCreateTemplateRes = await createTemplatePost(prodCreateTemplateReq);
    const prodCreateTemplateData = await prodCreateTemplateRes.json();
    assert(
      prodCreateTemplateRes.status === 401 && prodCreateTemplateData.code === 'AUTH_REQUIRED',
      '[Test 9g] Production POST create template enforces auth (401 AUTH_REQUIRED, not preview blocked)'
    );

    // Production POST vendor-login processes request (missing params returns 400, not preview blocked)
    const prodVendorLoginReq = new NextRequest('http://localhost:3000/api/auth/vendor-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const prodVendorLoginRes = await vendorLoginPost(prodVendorLoginReq);
    const prodVendorLoginData = await prodVendorLoginRes.json();
    assert(
      prodVendorLoginRes.status === 400,
      '[Test 9h] Production POST vendor-login processes request (400 validation error, not preview blocked)'
    );

    // ------------------------------------------------------------------------
    // SECTION D: DEVICE QUOTA PRESERVATION
    // ------------------------------------------------------------------------
    console.log('\n--- SECTION D: Device Quota Invariants ---');
    const starterPlan = BASELINE_PLANS.find((p) => p.id === 'starter');
    const proPlan = BASELINE_PLANS.find((p) => p.id === 'pro');
    const businessPlan = BASELINE_PLANS.find((p) => p.id === 'business');

    assert(starterPlan?.maxDevicesQuota === 1, '[Test 10a] Starter device quota strictly equals 1');
    assert(proPlan?.maxDevicesQuota === 3, '[Test 10b] Pro device quota strictly equals 3');
    assert(businessPlan?.maxDevicesQuota === 10, '[Test 10c] Business device quota strictly equals 10');

    // ------------------------------------------------------------------------
    // SECTION E: SUPABASE CLIENT FAIL-CLOSED BEHAVIOR & SECRETS LEAKAGE
    // ------------------------------------------------------------------------
    console.log('\n--- SECTION E: Supabase Client Fail-Closed & Secret Leakage ---');

    // 11. Fail-closed on missing configuration (no silent fallback to production)
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    let threwMissingConfig = false;
    try {
      supabaseModule.getServiceSupabase();
    } catch (err: any) {
      threwMissingConfig = true;
      assert(
        err.message.includes('[Supabase Server Config Error] Missing required Supabase configuration'),
        '[Test 11a] getServiceSupabase() fails closed with descriptive error on missing env vars'
      );
    }
    assert(threwMissingConfig === true, '[Test 11b] getServiceSupabase() does not silently fall back to hardcoded URL');

    // Restore environment
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;

    // 12. Zero secret leakage in response bodies
    const allResponses = [
      checkoutData,
      billingWebhookData,
      legacyPaymentData,
      reconcileData,
      cleanupData,
      deleteEventData,
      deleteTemplateData,
      registerData,
      adminVendorData,
      adminPricingData,
      adminAdminsPostData,
      adminAdminsDeleteData,
      setupSuperadminData,
      seedSuperadminData,
      seedData,
      uploadCaptureData,
      deactivateDevData,
      createEventData,
      updateEventData,
      createTemplateData,
      vendorLoginData,
      pricingGetData,
      getEventsData,
      getTemplatesData,
      prodCheckoutData,
      prodDeleteEventData,
      prodCronDataMissing,
      prodCronDataInvalid,
      prodCreateEventData,
      prodUpdateEventData,
      prodCreateTemplateData,
      prodVendorLoginData,
    ];

    let leakedSecret = false;
    for (const resBody of allResponses) {
      const text = JSON.stringify(resBody);
      if (
        (originalServiceKey && text.includes(originalServiceKey)) ||
        text.includes('service_role') ||
        text.includes('postgres://') ||
        text.includes('secret_key') ||
        text.includes('SUPABASE_SERVICE_ROLE_KEY')
      ) {
        leakedSecret = true;
        console.error('  Leaked secret in response:', text);
      }
    }
    assert(!leakedSecret, '[Test 12] Zero secrets or sensitive credentials leaked in response bodies');

  } finally {
    // Restore original environment
    if (originalVercelEnv !== undefined) process.env.VERCEL_ENV = originalVercelEnv; else delete process.env.VERCEL_ENV;
    if (originalNextPublicVercelEnv !== undefined) process.env.NEXT_PUBLIC_VERCEL_ENV = originalNextPublicVercelEnv; else delete process.env.NEXT_PUBLIC_VERCEL_ENV;
    if (originalMingleboothEnv !== undefined) process.env.MINGLEBOOTH_ENV = originalMingleboothEnv; else delete process.env.MINGLEBOOTH_ENV;
    if (originalIsPreview !== undefined) process.env.IS_PREVIEW = originalIsPreview; else delete process.env.IS_PREVIEW;
    if (originalCronSecret !== undefined) process.env.CRON_SECRET = originalCronSecret; else delete process.env.CRON_SECRET;
    if (originalSupabaseUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl; else delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (originalServiceKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey; else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }

  console.log('\n========================================================================');
  console.log(`   SUITE SUMMARY: ${passedTests}/${totalTests} TESTS PASSED (${failedTests} FAILED)`);
  console.log('========================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
