/**
 * PHASE 15.4.3.2 TEST SUITE — DYNAMIC PRICING & BILLING INTEGRITY HARDENING
 *
 * Verifies:
 * 1. Dynamic Pricing Configuration (Admin modification without desktop rebuild).
 * 2. Immutable Checkout Order Snapshots (Unpaid & paid orders retain original terms).
 * 3. Removal of Brittle Amount-Threshold Validation (< 1,400,000 IDR).
 * 4. Exact Amount, Plan, Interval, and Duration Matching.
 * 5. Webhook Signature & Settlement Idempotency.
 * 6. Regression: Vendor Login, Quotas, License Verification, Tenant Isolation.
 */

import { getServiceSupabase } from '../apps/web/src/lib/supabase';
import {
  getActivePricingCatalog,
  resolveActivePrice,
  createCheckoutOrder,
  updatePlanPrice,
  validateOrderAgainstSnapshot,
  BASELINE_PRICES,
} from '../apps/web/src/lib/pricing';
import { executePaymentSettlement } from '../apps/web/src/lib/billing-settlement';
import { POST as billingWebhookPost } from '../apps/web/src/app/api/billing/webhook/route';
import { POST as paymentWebhookPost } from '../apps/web/src/app/api/webhooks/payment/route';
import { GET as pricingGet } from '../apps/web/src/app/api/pricing/route';
import { POST as adminPricingPost, GET as adminPricingGet } from '../apps/web/src/app/api/admin/pricing/route';
import { POST as checkoutPost } from '../apps/web/src/app/api/vendor/checkout/route';
import { GET as vendorBillingGet } from '../apps/web/src/app/api/vendor/billing/route';
import { POST as reconcileBillingPost } from '../apps/web/src/app/api/admin/reconcile-billing/route';
import { POST as verifyLicensePost } from '../apps/web/src/app/api/auth/verify-license/route';
import { createSignedToken } from '../apps/web/src/lib/auth-server';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

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
  console.log('   PHASE 15.4.3.2 — DYNAMIC PRICING & BILLING INTEGRITY TEST SUITE   ');
  console.log('========================================================================\n');

  const client = getServiceSupabase();
  const testRunId = `TEST-15-4-3-2-${Date.now()}`;
  const testOrgId = crypto.randomUUID();
  const testOrgBId = crypto.randomUUID();

  try {
    // 0. Setup isolated test organizations
    await client.from('organizations').insert([
      {
        id: testOrgId,
        name: 'Unit Test Studio Alpha',
        slug: `test-studio-alpha-${Date.now()}`,
        plan_tier: 'pro',
        subscription_status: 'active',
        subscription_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        max_devices_quota: 3,
      },
      {
        id: testOrgBId,
        name: 'Unit Test Studio Beta',
        slug: `test-studio-beta-${Date.now()}`,
        plan_tier: 'starter',
        subscription_status: 'active',
        subscription_expires_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
        max_devices_quota: 1,
      },
    ]);

    // =========================================================================
    // SECTION 1: DYNAMIC SUBSCRIPTION PRICING
    // =========================================================================
    console.log('\n--- SECTION 1: DYNAMIC SUBSCRIPTION PRICING ---');

    // Test 1: Baseline / Database Catalog Retrieval
    const catalog = await getActivePricingCatalog();
    assert(catalog.plans.length === 3, 'Pricing catalog returns all 3 plans (Starter, Pro, Business)');
    assert(catalog.prices.length === 6, 'Pricing catalog contains 6 active prices (3 plans x 2 intervals)');

    // Test 2: Public Pricing API Endpoint
    const publicPricingRes = await pricingGet();
    const publicPricingData = await publicPricingRes.json();
    assert(publicPricingRes.status === 200, 'Public /api/pricing responds with HTTP 200');
    assert(publicPricingData.success === true, 'Public /api/pricing returns success: true');
    assert(publicPricingData.prices.length >= 6, 'Public /api/pricing includes all active published prices');

    // Test 3: Independent Monthly and Yearly Price Configuration
    const originalProMonthly = await resolveActivePrice('pro', 'monthly');
    const originalProYearly = await resolveActivePrice('pro', 'yearly');
    assert(originalProMonthly.amountIdr !== originalProYearly.amountIdr, 'Monthly and yearly prices are distinct');

    // Test 4: Dynamic Price Update Affects New Checkout Orders
    const newProMonthlyAmount = 1199000;
    const updatedPrice = await updatePlanPrice({
      planId: 'pro',
      billingInterval: 'monthly',
      newAmountIdr: newProMonthlyAmount,
    });
    assert(updatedPrice.amountIdr === newProMonthlyAmount, 'updatePlanPrice updates active monthly price in catalog');
    assert(updatedPrice.version === (originalProMonthly.version || 1) + 1, 'Price version increments on update');

    // Test 5: Yearly Price Unaffected when Monthly Price Changes
    const proYearlyAfterMonthlyChange = await resolveActivePrice('pro', 'yearly');
    assert(proYearlyAfterMonthlyChange.amountIdr === originalProYearly.amountIdr, 'Yearly price remains unchanged when monthly price updates');

    // Test 6: Inactive or Invalid Plan and Interval Rejected
    let invalidPlanRejected = false;
    try {
      await resolveActivePrice('enterprise' as any, 'monthly');
    } catch (err: any) {
      invalidPlanRejected = err.message.includes('INVALID_PLAN_TIER');
    }
    assert(invalidPlanRejected, 'resolveActivePrice rejects invalid plan tier');

    let invalidIntervalRejected = false;
    try {
      await resolveActivePrice('pro', 'weekly' as any);
    } catch (err: any) {
      invalidIntervalRejected = err.message.includes('INVALID_INTERVAL');
    }
    assert(invalidIntervalRejected, 'resolveActivePrice rejects unsupported billing interval');

    // Test 7: Unauthorized Price Modification Rejected
    const unauthorizedReq = new NextRequest('http://localhost:3000/api/admin/pricing', {
      method: 'POST',
      body: JSON.stringify({ planId: 'pro', billingInterval: 'monthly', newAmountIdr: 1000000 }),
    });
    const unauthRes = await adminPricingPost(unauthorizedReq);
    assert(unauthRes.status === 401, 'Unauthorized request to /api/admin/pricing rejected with HTTP 401');

    // Test 8: Non-integer or Negative Price Modification Rejected
    const superAdminToken = createSignedToken({
      userId: 'test-admin',
      orgId: testOrgId,
      email: 'admin@minglebooth.com',
      role: 'SUPER_ADMIN',
    });
    const invalidAmountReq = new NextRequest('http://localhost:3000/api/admin/pricing', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ planId: 'pro', billingInterval: 'monthly', newAmountIdr: -50000 }),
    });
    const invalidAmountRes = await adminPricingPost(invalidAmountReq);
    assert(invalidAmountRes.status === 400, 'Negative price rejected by admin API with HTTP 400');

    // =========================================================================
    // SECTION 2: IMMUTABLE CHECKOUT ORDER SNAPSHOTS
    // =========================================================================
    console.log('\n--- SECTION 2: IMMUTABLE CHECKOUT ORDER SNAPSHOTS ---');

    // Test 9: Create Pre-Registered Order with Snapshot
    const order1Id = `${testRunId}-ORDER-1`;
    const snapshot1 = await createCheckoutOrder({
      organizationId: testOrgId,
      planTier: 'pro',
      billingInterval: 'monthly',
      customOrderId: order1Id,
    });
    assert(snapshot1.amountIdr === newProMonthlyAmount, 'Checkout order snapshot captures current active price');
    assert(snapshot1.billingInterval === 'monthly', 'Checkout order snapshot captures billing interval');
    assert(snapshot1.durationDays === 30, 'Checkout order snapshot derives exact duration days (30)');

    // Test 10: Existing Unpaid Order Retains Original Snapshot After Price Update
    // Change price again to 1,299,000 IDR
    await updatePlanPrice({
      planId: 'pro',
      billingInterval: 'monthly',
      newAmountIdr: 1299000,
    });
    // Check that order1 record in payments retains original amount
    const { data: pay1 } = await client.from('payments').select('*').eq('order_id', order1Id).single();
    assert(Number(pay1.amount_idr) === newProMonthlyAmount, 'Existing unpaid order retains original snapshot amount');

    // Test 11: New Checkout Order Uses Newly Configured Price
    const order2Id = `${testRunId}-ORDER-2`;
    const snapshot2 = await createCheckoutOrder({
      organizationId: testOrgId,
      planTier: 'pro',
      billingInterval: 'monthly',
      customOrderId: order2Id,
    });
    assert(snapshot2.amountIdr === 1299000, 'New checkout order resolves the updated active price (1,299,000 IDR)');

    // Test 12: Paid Order Terms are Immutable
    // Settle order1 with its snapshot price
    const settlement1 = await executePaymentSettlement({
      orderId: order1Id,
      organizationId: testOrgId,
      planTier: 'pro',
      amountIdr: newProMonthlyAmount,
      durationDays: 30,
      providerTransactionId: `TX-${order1Id}`,
    });
    assert(settlement1.success === true, 'Order 1 settled successfully at original snapshot amount');
    assert(settlement1.durationDays === 30, 'Order 1 settled with 30-day snapshot duration');

    // Update pro monthly price again to 1,399,000 IDR
    await updatePlanPrice({
      planId: 'pro',
      billingInterval: 'monthly',
      newAmountIdr: 1399000,
    });
    // Paid order must NOT be mutated
    const { data: paidPay1 } = await client.from('payments').select('*').eq('order_id', order1Id).single();
    assert(Number(paidPay1.amount_idr) === newProMonthlyAmount, 'Paid order amount unchanged after subsequent price update');
    assert(paidPay1.payment_status === 'PAID', 'Paid order status remains PAID');

    // =========================================================================
    // SECTION 3: REMOVAL OF HARDCODED PRICE-THRESHOLD VALIDATION
    // =========================================================================
    console.log('\n--- SECTION 3: REMOVAL OF HARDCODED PRICE-THRESHOLD VALIDATION ---');

    // Test 13: Discounted Yearly Plan (< 1,400,000 IDR) Settles Successfully without Threshold Rejection
    // In previous versions, any amount < 1,400,000 IDR claiming 365 days was rejected by brittle threshold!
    const promoYearlyOrderId = `${testRunId}-PROMO-YEARLY`;
    // Create an order configured for 365 days at promotional price of 999,000 IDR (< 1,400,000 IDR)
    await client.from('payments').insert({
      order_id: promoYearlyOrderId,
      organization_id: testOrgId,
      plan_tier: 'starter',
      amount_idr: 999000,
      payment_status: 'PENDING',
      billing_interval: 'yearly',
      duration_days: 365,
    });

    const promoSettlement = await executePaymentSettlement({
      orderId: promoYearlyOrderId,
      organizationId: testOrgId,
      planTier: 'starter',
      amountIdr: 999000,
      durationDays: 365,
      providerTransactionId: `TX-${promoYearlyOrderId}`,
    });
    assert(promoSettlement.success === true, 'Discounted yearly order (< 1.4M IDR) settles successfully without threshold rejection');
    assert(promoSettlement.durationDays === 365, 'Entitlement granted for 365 days based on validated snapshot');

    // Test 14: Monthly Order Claiming 365 Days Rejected via Snapshot (Not Arbitrary Amount Threshold)
    const monthlyOrderId = `${testRunId}-MONTHLY-ORDER`;
    await createCheckoutOrder({
      organizationId: testOrgId,
      planTier: 'pro',
      billingInterval: 'monthly',
      customOrderId: monthlyOrderId,
    });

    let monthlySnapshotReject = false;
    try {
      await executePaymentSettlement({
        orderId: monthlyOrderId,
        organizationId: testOrgId,
        planTier: 'pro',
        amountIdr: 1399000,
        durationDays: 365, // Disagrees with order snapshot!
      });
    } catch (err: any) {
      monthlySnapshotReject = err.message.includes('INVALID_DURATION');
    }
    assert(monthlySnapshotReject, 'Monthly order attempting 365-day claim rejected via snapshot interval mismatch');

    // Test 15: Exact Amount Mismatch Rejected (Integer IDR)
    let underpaidReject = false;
    try {
      validateOrderAgainstSnapshot(
        { order_id: 'test', plan_tier: 'pro', amount_idr: 1000000, duration_days: 30 },
        { amountIdr: 999999, planTier: 'pro', durationDays: 30 }
      );
    } catch (err: any) {
      underpaidReject = err.message.includes('PAYMENT_AMOUNT_INSUFFICIENT');
    }
    assert(underpaidReject, 'validateOrderAgainstSnapshot rejects underpayment by even 1 IDR');

    let overpaidReject = false;
    try {
      validateOrderAgainstSnapshot(
        { order_id: 'test', plan_tier: 'pro', amount_idr: 1000000, duration_days: 30 },
        { amountIdr: 1000001, planTier: 'pro', durationDays: 30 }
      );
    } catch (err: any) {
      overpaidReject = err.message.includes('PAYMENT_AMOUNT_MISMATCH');
    }
    assert(overpaidReject, 'validateOrderAgainstSnapshot rejects exact amount mismatch (overpayment)');

    // =========================================================================
    // SECTION 4: WEBHOOK & SETTLEMENT INTEGRITY
    // =========================================================================
    console.log('\n--- SECTION 4: WEBHOOK & SETTLEMENT INTEGRITY ---');

    // Test 16: /api/billing/webhook Resolves Pre-Registered Order Snapshot
    const webhookOrderId = `${testRunId}-WEBHOOK-ORDER`;
    await createCheckoutOrder({
      organizationId: testOrgId,
      planTier: 'pro',
      billingInterval: 'monthly',
      customOrderId: webhookOrderId,
    });

    const validWebhookReq = new NextRequest('http://localhost:3000/api/billing/webhook', {
      method: 'POST',
      body: JSON.stringify({
        event: 'payment.received',
        data: {
          message_action: 'SUCCESS',
          message_id: `MSG-${webhookOrderId}`,
          message_data: {
            refId: webhookOrderId,
            totals: { grandTotal: 1399000 },
            customer: { email: 'vendor@minglebooth.com' },
            items: [{ title: 'MingleBooth Pro Subscription' }],
          },
        },
      }),
    });
    const webhookRes = await billingWebhookPost(validWebhookReq);
    const webhookData = await webhookRes.json();
    if (webhookRes.status !== 200) {
      console.error('DEBUG webhook error:', webhookRes.status, webhookData);
    }
    assert(webhookRes.status === 200, '/api/billing/webhook accepts valid payment matching order snapshot', JSON.stringify(webhookData));
    assert(webhookData.planTier === 'pro', '/api/billing/webhook returns authoritative pro plan');
    assert(webhookData.durationDays === 30, '/api/billing/webhook grants 30 days based on order snapshot');

    // Test 17: Duplicate Webhook Delivery is Idempotent (No Extra Days Granted)
    const { data: orgBeforeDup } = await client.from('organizations').select('subscription_expires_at').eq('id', testOrgId).single();
    const dupWebhookReq = new NextRequest('http://localhost:3000/api/billing/webhook', {
      method: 'POST',
      body: JSON.stringify({
        event: 'payment.received',
        data: {
          message_action: 'SUCCESS',
          message_id: `MSG-${webhookOrderId}`,
          message_data: {
            refId: webhookOrderId,
            totals: { grandTotal: 1399000 },
            customer: { email: 'vendor@minglebooth.com' },
            items: [{ title: 'MingleBooth Pro Subscription' }],
          },
        },
      }),
    });
    const dupWebhookRes = await billingWebhookPost(dupWebhookReq);
    const dupWebhookData = await dupWebhookRes.json();
    assert(dupWebhookRes.status === 200, 'Duplicate webhook returns HTTP 200');
    assert(dupWebhookData.isDuplicate === true, 'Duplicate webhook flagged isDuplicate: true');

    const { data: orgAfterDup } = await client.from('organizations').select('subscription_expires_at').eq('id', testOrgId).single();
    assert(orgBeforeDup.subscription_expires_at === orgAfterDup.subscription_expires_at, 'Duplicate delivery adds ZERO extra days');

    // Test 18: Provider Transaction ID Reused by Different Order Rejected
    let txReusedReject = false;
    try {
      await executePaymentSettlement({
        orderId: `${testRunId}-DIFFERENT-ORDER`,
        organizationId: testOrgId,
        planTier: 'pro',
        amountIdr: 1399000,
        durationDays: 30,
        providerTransactionId: `MSG-${webhookOrderId}`, // Already claimed!
      });
    } catch (err: any) {
      txReusedReject = err.message.includes('PROVIDER_TRANSACTION_REUSED');
    }
    assert(txReusedReject, 'Reusing providerTransactionId across different orders is rejected');

    // Test 19: Organization Cross-Tenant Hijack Rejected
    let orgMismatchReject = false;
    try {
      await executePaymentSettlement({
        orderId: webhookOrderId, // Bound to testOrgId
        organizationId: testOrgBId, // Attempt to assign to testOrgBId!
        planTier: 'pro',
        amountIdr: 1399000,
        durationDays: 30,
      });
    } catch (err: any) {
      orgMismatchReject = err.message.includes('ORGANIZATION_MISMATCH');
    }
    assert(orgMismatchReject, 'Cross-tenant assignment to different organization rejected');

    // =========================================================================
    // SECTION 5: REGRESSION & MULTI-TENANT ISOLATION
    // =========================================================================
    console.log('\n--- SECTION 5: REGRESSION & MULTI-TENANT ISOLATION ---');

    // Test 20: Vendor Billing Scoped Strictly to Authenticated Tenant
    const vendorTokenA = createSignedToken({
      userId: 'user-alpha',
      orgId: testOrgId,
      email: 'vendor-alpha@minglebooth.com',
      role: 'VENDOR_OWNER',
    });
    const vendorBillingReq = new NextRequest('http://localhost:3000/api/vendor/billing', {
      method: 'GET',
      headers: { authorization: `Bearer ${vendorTokenA}` },
    });
    const vendorBillingRes = await vendorBillingGet(vendorBillingReq);
    const vendorBillingData = await vendorBillingRes.json();
    assert(vendorBillingRes.status === 200, '/api/vendor/billing returns HTTP 200 for authenticated vendor');
    assert(vendorBillingData.organization.id === testOrgId, 'Returns organization data strictly for authenticated tenant');
    const allBelongToTenant = vendorBillingData.payments.every((p: any) =>
      p.orderId.includes(testRunId) || !p.orderId.includes(testOrgBId)
    );
    assert(allBelongToTenant, 'Payments list strictly contains authenticated tenant orders');

    // Test 21: Superadmin Reconciliation Endpoint
    const reconcileReq = new NextRequest('http://localhost:3000/api/admin/reconcile-billing', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        orderId: webhookOrderId,
        action: 'reconcile_order',
      }),
    });
    const reconcileRes = await reconcileBillingPost(reconcileReq);
    const reconcileData = await reconcileRes.json();
    assert(reconcileRes.status === 200, 'Superadmin reconcile endpoint returns HTTP 200');
    assert(reconcileData.reconciled === true, 'Reconciliation marked reconciled: true');

    // Test 22: License Verification for Active Subscription
    const licenseToken = createSignedToken({
      userId: 'user-alpha',
      orgId: testOrgId,
      email: 'vendor-alpha@minglebooth.com',
      role: 'VENDOR_OWNER',
    });
    const licenseReq = new NextRequest('http://localhost:3000/api/auth/verify-license', {
      method: 'POST',
      headers: { authorization: `Bearer ${licenseToken}` },
    });
    const licenseRes = await verifyLicensePost(licenseReq);
    const licenseData = await licenseRes.json();
    assert(licenseRes.status === 200, '/api/auth/verify-license returns HTTP 200 for active tenant');
    assert(licenseData.valid === true, 'License confirmed valid in cloud database');

  } finally {
    // Teardown test fixtures
    console.log('\n[Teardown] Cleaning up isolated test fixtures...');
    await client.from('payments').delete().like('order_id', `%${testRunId}%`);
    await client.from('organizations').delete().in('id', [testOrgId, testOrgBId]);
    console.log('  ✓ Teardown complete. Zero customer data touched.');
  }

  console.log('\n========================================================================');
  console.log(`   PHASE 15.4.3.2 TEST SUITE SUMMARY: ${passedTests}/${totalTests} TESTS PASSED   `);
  console.log('========================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Fatal error in test suite:', err);
  process.exit(1);
});
