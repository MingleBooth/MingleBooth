import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../apps/web/.env.local') });

import { getServiceSupabase } from '@/lib/supabase';
import { createSignedToken } from '@/lib/auth-server';
import { POST as checkoutPost } from '@/app/api/vendor/checkout/route';
import { POST as registerPost } from '@/app/api/auth/web-register/route';
import { POST as vendorLoginPost } from '@/app/api/auth/vendor-login/route';
import { POST as verifyLicensePost } from '@/app/api/auth/verify-license/route';
import { executePaymentSettlement } from '@/lib/billing-settlement';
import { NextRequest } from 'next/server';
import crypto from 'crypto';

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
  console.log('   PHASE 15.4.3.9 — CHECKOUT & SUBSCRIPTION STATE HARDENING SUITE      ');
  console.log('========================================================================\n');

  const client = getServiceSupabase();
  const testRunId = `TEST-15-4-3-9-${Date.now().toString(36)}`;
  const orgAId = crypto.randomUUID();
  const orgBId = crypto.randomUUID();
  const devOrgId = crypto.randomUUID();

  const createdOrgIds: string[] = [orgAId, orgBId, devOrgId];
  const createdOrderIds: string[] = [];

  try {
    console.log('[Setup] Provisioning isolated test fixtures...');

    // 1. Setup Org A and Org B
    await client.from('organizations').insert([
      {
        id: orgAId,
        name: `Org A ${testRunId}`,
        slug: `org-a-${testRunId}`,
        plan_tier: 'pro',
        subscription_status: 'active',
        subscription_expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        max_devices_quota: 3,
      },
      {
        id: orgBId,
        name: `Org B ${testRunId}`,
        slug: `org-b-${testRunId}`,
        plan_tier: 'starter',
        subscription_status: 'active',
        subscription_expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        max_devices_quota: 1,
      },
      {
        id: devOrgId,
        name: `Dev Org ${testRunId}`,
        slug: `dev-org-${testRunId}`,
        plan_tier: 'pro',
        subscription_status: 'dev_mode',
        subscription_expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        max_devices_quota: 3,
      },
    ]);

    const tokenOrgA = createSignedToken({
      userId: crypto.randomUUID(),
      email: `vendor-a-${testRunId}@example.com`,
      orgId: orgAId,
      role: 'VENDOR_OWNER',
    });

    console.log('  ✓ Setup completed successfully.\n');

    // ------------------------------------------------------------------------
    // [Test 1] Unauthenticated checkout cannot create an order
    // ------------------------------------------------------------------------
    console.log('[Test 1] Unauthenticated Checkout Cannot Create Order For Arbitrary Org');
    const unauthReq = new NextRequest('http://localhost:3000/api/vendor/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organizationId: orgAId,
        planTier: 'pro',
        billingInterval: 'yearly',
      }),
    });

    const unauthRes = await checkoutPost(unauthReq);
    const unauthJson = await unauthRes.json();

    assert(
      unauthRes.status === 401 && unauthJson.code === 'AUTH_REQUIRED',
      'Unauthenticated request rejected with HTTP 401 AUTH_REQUIRED',
      `Got status ${unauthRes.status}, code ${unauthJson.code}`
    );

    // Verify no payment was created for Org A from this attempt
    const { data: paymentsAfterUnauth } = await client
      .from('payments')
      .select('id')
      .eq('organization_id', orgAId);
    assert(
      (paymentsAfterUnauth?.length || 0) === 0,
      'Zero payment orders created for target organization'
    );

    // ------------------------------------------------------------------------
    // [Test 2] Authenticated checkout uses authenticated organization ID
    // ------------------------------------------------------------------------
    console.log('\n[Test 2] Authenticated Checkout Uses Authenticated Organization ID');
    const authReq = new NextRequest('http://localhost:3000/api/vendor/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenOrgA}`,
      },
      body: JSON.stringify({
        planTier: 'business',
        billingInterval: 'yearly',
      }),
    });

    const authRes = await checkoutPost(authReq);
    const authJson = await authRes.json();

    assert(
      authRes.status === 201 && authJson.success === true,
      'Authenticated checkout successfully creates order snapshot',
      `Got status ${authRes.status}`
    );
    assert(
      authJson.order?.organizationId === orgAId,
      'Order snapshot bound strictly to authenticated organization ID',
      `Got orgId ${authJson.order?.organizationId}`
    );

    if (authJson.order?.orderId) {
      createdOrderIds.push(authJson.order.orderId);
    }

    // ------------------------------------------------------------------------
    // [Test 3] Conflicting client-supplied organization IDs are rejected
    // ------------------------------------------------------------------------
    console.log('\n[Test 3] Conflicting Client-Supplied Organization IDs Are Rejected');
    const conflictReq = new NextRequest('http://localhost:3000/api/vendor/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenOrgA}`,
      },
      body: JSON.stringify({
        organizationId: orgBId, // Attempting to create order for Org B using Org A token
        planTier: 'starter',
        billingInterval: 'monthly',
      }),
    });

    const conflictRes = await checkoutPost(conflictReq);
    const conflictJson = await conflictRes.json();

    assert(
      conflictRes.status === 400 && conflictJson.code === 'ORGANIZATION_MISMATCH',
      'Conflicting organization ID rejected with HTTP 400 ORGANIZATION_MISMATCH',
      `Got status ${conflictRes.status}, code ${conflictJson.code}`
    );

    // ------------------------------------------------------------------------
    // [Test 4] Legitimate first-time registration and checkout flow
    // ------------------------------------------------------------------------
    console.log('\n[Test 4] Legitimate First-Time Registration & Checkout Flow');
    const regEmail = `newvendor-${testRunId}@example.com`;
    const regReq = new NextRequest('http://localhost:3000/api/auth/web-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studioName: `Studio ${testRunId}`,
        email: regEmail,
        password: 'ValidPassword123!',
        plan: 'pro',
        cycle: 'yearly',
      }),
    });

    const regRes = await registerPost(regReq);
    const regJson = await regRes.json();

    assert(
      regRes.status === 200 && regJson.success === true,
      'First-time registration succeeds with HTTP 200',
      `Got status ${regRes.status}`
    );
    assert(
      typeof regJson.token === 'string' && regJson.token.length > 20,
      'Registration issues valid bearer token for immediate vendor session'
    );
    assert(
      typeof regJson.checkoutUrl === 'string' && regJson.checkoutUrl.includes('refId='),
      'Registration provides Lynk checkout URL with pre-registered order reference'
    );

    const newlyRegisteredOrgId = regJson.user?.org?.id;
    if (newlyRegisteredOrgId) {
      createdOrgIds.push(newlyRegisteredOrgId);
    }
    if (regJson.orderId) {
      createdOrderIds.push(regJson.orderId);
    }

    // ------------------------------------------------------------------------
    // [Test 5] Unpaid registration has no misleading paid expiry
    // ------------------------------------------------------------------------
    console.log('\n[Test 5] Unpaid Registration Has No Misleading Paid Expiry');
    const { data: unpaidOrg } = await client
      .from('organizations')
      .select('subscription_status, subscription_expires_at')
      .eq('id', newlyRegisteredOrgId)
      .single();

    assert(
      unpaidOrg?.subscription_status === 'pending_payment',
      'Newly registered org has subscription_status = pending_payment'
    );

    const expiryMs = unpaidOrg?.subscription_expires_at
      ? new Date(unpaidOrg.subscription_expires_at).getTime()
      : 0;
    const nowMs = Date.now();
    assert(
      expiryMs <= nowMs,
      'Unpaid org subscription_expires_at is NOT a future date (0 or epoch timestamp)',
      `Expiry: ${unpaidOrg?.subscription_expires_at}`
    );

    // ------------------------------------------------------------------------
    // [Test 6] Vendor login rejects pending_payment accounts
    // ------------------------------------------------------------------------
    console.log('\n[Test 6] Vendor Login Rejects pending_payment Accounts');
    const loginReq = new NextRequest('http://localhost:3000/api/auth/vendor-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: regEmail,
        password: 'ValidPassword123!',
        hardwareFingerprint: `HWID-${testRunId}`,
        deviceName: 'Test Photobooth Device',
        osType: 'mac',
      }),
    });

    const loginRes = await vendorLoginPost(loginReq);
    const loginJson = await loginRes.json();

    assert(
      loginRes.status === 403 && loginJson.code === 'SUBSCRIPTION_PENDING_PAYMENT',
      'Unpaid vendor rejected with HTTP 403 SUBSCRIPTION_PENDING_PAYMENT',
      `Got status ${loginRes.status}, code ${loginJson.code}`
    );

    // ------------------------------------------------------------------------
    // [Test 7] License verification rejects pending_payment accounts
    // ------------------------------------------------------------------------
    console.log('\n[Test 7] License Verification Rejects pending_payment Accounts');
    const unpaidToken = createSignedToken({
      userId: crypto.randomUUID(),
      email: regEmail,
      orgId: newlyRegisteredOrgId,
      role: 'VENDOR_OWNER',
    });

    const verifyReq = new NextRequest('http://localhost:3000/api/auth/verify-license', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${unpaidToken}`,
      },
      body: JSON.stringify({}),
    });

    const verifyRes = await verifyLicensePost(verifyReq);
    const verifyJson = await verifyRes.json();

    assert(
      verifyRes.status === 403 && verifyJson.code === 'SUBSCRIPTION_PENDING_PAYMENT',
      'Desktop license verification fails closed with SUBSCRIPTION_PENDING_PAYMENT',
      `Got status ${verifyRes.status}`
    );

    // ------------------------------------------------------------------------
    // [Test 8] Dev Mode Handling in Development vs Production
    // ------------------------------------------------------------------------
    console.log('\n[Test 8] Dev Mode Handling In Development vs Production');
    const devToken = createSignedToken({
      userId: crypto.randomUUID(),
      email: `dev-${testRunId}@example.com`,
      orgId: devOrgId,
      role: 'VENDOR_OWNER',
    });
    
    // In development mode, dev_mode is permitted for local hardware testing
    const devVerifyReq = new NextRequest('http://localhost:3000/api/auth/verify-license', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${devToken}`,
      },
      body: JSON.stringify({}),
    });
    const devVerifyRes = await verifyLicensePost(devVerifyReq);
    const devVerifyJson = await devVerifyRes.json();
    assert(
      devVerifyRes.status === 200 && devVerifyJson.valid === true,
      'dev_mode account permitted in development mode (NODE_ENV !== production)'
    );

    // Test in simulated production environment
    const prevEnv = process.env.NODE_ENV;
    try {
      (process.env as any).NODE_ENV = 'production';

      const prodVerifyReq = new NextRequest('http://localhost:3000/api/auth/verify-license', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${devToken}`,
        },
        body: JSON.stringify({}),
      });

      const prodVerifyRes = await verifyLicensePost(prodVerifyReq);
      const prodVerifyJson = await prodVerifyRes.json();

      assert(
        prodVerifyRes.status === 403 && prodVerifyJson.code === 'DEV_MODE_UNAUTHORIZED',
        'dev_mode account rejected in production with HTTP 403 DEV_MODE_UNAUTHORIZED',
        `Got status ${prodVerifyRes.status}, code ${prodVerifyJson.code}`
      );
    } finally {
      (process.env as any).NODE_ENV = prevEnv;
    }

    // ------------------------------------------------------------------------
    // [Test 9] NULL / Epoch Expiry Handled Safely Across Verification
    // ------------------------------------------------------------------------
    console.log('\n[Test 9] NULL / Epoch Expiry Handled Safely Across Verification');
    const expiredOrgId = crypto.randomUUID();
    createdOrgIds.push(expiredOrgId);

    await client.from('organizations').insert({
      id: expiredOrgId,
      name: `Expired Org ${testRunId}`,
      slug: `expired-org-${testRunId}`,
      plan_tier: 'starter',
      subscription_status: 'expired',
      subscription_expires_at: new Date(0).toISOString(), // Epoch 1970
      max_devices_quota: 1,
    });

    const expiredToken = createSignedToken({
      userId: crypto.randomUUID(),
      email: `expired-${testRunId}@example.com`,
      orgId: expiredOrgId,
      role: 'VENDOR_OWNER',
    });

    const expVerifyReq = new NextRequest('http://localhost:3000/api/auth/verify-license', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${expiredToken}`,
      },
      body: JSON.stringify({}),
    });

    const expVerifyRes = await verifyLicensePost(expVerifyReq);
    const expVerifyJson = await expVerifyRes.json();

    assert(
      expVerifyRes.status === 403 && expVerifyJson.code === 'LICENSE_EXPIRED',
      'Epoch expiry correctly fails with LICENSE_EXPIRED without crashing',
      `Got status ${expVerifyRes.status}`
    );

    // ------------------------------------------------------------------------
    // [Test 10] Paid Settlement Grants Exact Expiry to Newly Registered Org
    // ------------------------------------------------------------------------
    console.log('\n[Test 10] Paid Settlement Grants Exact Expiry To Newly Registered Org');
    const orderIdToSettle = regJson.orderId;
    if (orderIdToSettle) {
      const settlement = await executePaymentSettlement({
        orderId: orderIdToSettle,
        organizationId: newlyRegisteredOrgId,
        planTier: 'pro',
        amountIdr: 2999000,
        durationDays: 365,
        providerTransactionId: `TX-HARDENING-${Date.now()}`,
        paymentLinkUrl: 'https://lynk.id',
      });

      assert(
        settlement.success === true,
        'Settlement succeeds for valid registered order'
      );

      const { data: activatedOrg } = await client
        .from('organizations')
        .select('subscription_status, subscription_expires_at')
        .eq('id', newlyRegisteredOrgId)
        .single();

      assert(
        activatedOrg?.subscription_status === 'active',
        'Organization subscription_status transitioned to active'
      );

      const activatedExpiryMs = new Date(activatedOrg?.subscription_expires_at || 0).getTime();
      const expectedMinExpiryMs = Date.now() + 360 * 24 * 3600 * 1000;
      assert(
        activatedExpiryMs > expectedMinExpiryMs,
        'Active paid expiration granted strictly upon payment settlement'
      );
    } else {
      assert(false, 'Cannot test settlement: orderId was not returned from registration');
    }

    // ------------------------------------------------------------------------
    // [Test 11] Existing Paid Renewal Preserves Remaining Time
    // ------------------------------------------------------------------------
    console.log('\n[Test 11] Existing Paid Renewal Preserves Remaining Time');
    const { data: orgABefore } = await client
      .from('organizations')
      .select('subscription_expires_at')
      .eq('id', orgAId)
      .single();

    const initialExpiryMs = new Date(orgABefore?.subscription_expires_at || 0).getTime();

    // Create and settle renewal order for Org A
    const renewalOrderId = `ORDER-RENEW-${Date.now().toString(36)}`;
    createdOrderIds.push(renewalOrderId);

    await client.from('payments').insert({
      order_id: renewalOrderId,
      organization_id: orgAId,
      plan_tier: 'pro',
      amount_idr: 1099000,
      payment_status: 'PENDING',
      created_at: new Date().toISOString(),
    });

    const renewalSettlement = await executePaymentSettlement({
      orderId: renewalOrderId,
      organizationId: orgAId,
      planTier: 'pro',
      amountIdr: 1099000,
      durationDays: 30,
      providerTransactionId: `TX-RENEW-${Date.now()}`,
      paymentLinkUrl: 'https://lynk.id',
    });

    assert(
      renewalSettlement.success === true,
      'Renewal settlement succeeds'
    );

    const { data: orgAAfter } = await client
      .from('organizations')
      .select('subscription_expires_at')
      .eq('id', orgAId)
      .single();

    const newExpiryMs = new Date(orgAAfter?.subscription_expires_at || 0).getTime();
    const extendedMs = newExpiryMs - initialExpiryMs;
    const extendedDays = Math.round(extendedMs / (24 * 3600 * 1000));

    assert(
      extendedDays === 30,
      `Renewal added exactly 30 days onto remaining time (got ${extendedDays} days)`
    );

  } catch (err: any) {
    console.error('[Suite Exception]:', err);
    failedTests++;
  } finally {
    console.log('\n[Teardown] Cleaning up isolated test fixtures...');
    try {
      if (createdOrderIds.length > 0) {
        await client.from('payments').delete().in('order_id', createdOrderIds);
      }
      if (createdOrgIds.length > 0) {
        await client.from('devices').delete().in('organization_id', createdOrgIds);
        await client.from('user_profiles').delete().in('organization_id', createdOrgIds);
        await client.from('organizations').delete().in('id', createdOrgIds);
      }
      console.log('  ✓ Teardown complete. Zero customer data touched.');
    } catch (cleanupErr) {
      console.warn('  ⚠ Teardown notice:', cleanupErr);
    }
  }

  console.log('\n========================================================================');
  console.log(`   HARDENING SUITE RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('========================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
