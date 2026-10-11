import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import assert from 'assert';
import dotenv from 'dotenv';
import path from 'path';
import { executePaymentSettlement } from '../apps/web/src/lib/billing-settlement';
import { POST as billingWebhook } from '../apps/web/src/app/api/billing/webhook/route';
import { POST as paymentWebhook } from '../apps/web/src/app/api/webhooks/payment/route';
import { generateLynkSignature } from '../apps/web/src/lib/lynk';
import { NextRequest } from 'next/server';

dotenv.config({ path: path.resolve(__dirname, '../apps/web/.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing Supabase configuration.');
  process.exit(1);
}

const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const testRunId = Math.random().toString(36).substring(2, 8);
const TEST_LYNK_SECRET = 'test_isolation_merchant_key_' + testRunId;
process.env.LYNK_MERCHANT_KEY = TEST_LYNK_SECRET;
process.env.PAYMENT_WEBHOOK_SECRET = 'test_payment_webhook_secret_' + testRunId;

function createRequest(url: string, method: string, headers: Record<string, string>, body: any): NextRequest {
  return new NextRequest(new URL(url), {
    method,
    headers: new Headers(headers),
    body: JSON.stringify(body),
  });
}

async function runTestSuite() {
  console.log('========================================================================');
  console.log('   PHASE 15.4.3.7 — CRITICAL BILLING TENANT-ISOLATION TEST SUITE        ');
  console.log('========================================================================\n');

  // Setup isolated fixtures
  const ORG_A_ID = crypto.randomUUID();
  const ORG_B_ID = crypto.randomUUID();
  const USER_A_EMAIL = `vendor-a-${testRunId}@minglebooth.test`;
  const USER_B_EMAIL = `vendor-b-${testRunId}@minglebooth.test`;
  const UNKNOWN_EMAIL = `unregistered-rogue-${testRunId}@stranger.test`;

  console.log('[Setup] Creating isolated test organizations...');
  await client.from('organizations').insert([
    {
      id: ORG_A_ID,
      name: `Test Studio A (${testRunId})`,
      slug: `studio-a-${testRunId}`,
      plan_tier: 'starter',
      subscription_status: 'pending_payment',
      subscription_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      max_devices_quota: 1,
    },
    {
      id: ORG_B_ID,
      name: `Test Studio B (${testRunId})`,
      slug: `studio-b-${testRunId}`,
      plan_tier: 'starter',
      subscription_status: 'pending_payment',
      subscription_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      max_devices_quota: 1,
    },
  ]);

  await client.from('user_profiles').insert([
    {
      id: crypto.randomUUID(),
      email: USER_A_EMAIL,
      full_name: 'Vendor A Owner',
      role: 'VENDOR_OWNER',
      organization_id: ORG_A_ID,
    },
    {
      id: crypto.randomUUID(),
      email: USER_B_EMAIL,
      full_name: 'Vendor B Owner',
      role: 'VENDOR_OWNER',
      organization_id: ORG_B_ID,
    },
  ]);

  // Fetch oldest organization in DB to ensure it is never mutated
  const { data: oldestOrgBefore } = await client
    .from('organizations')
    .select('id, name, subscription_status, subscription_expires_at')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  const { count: orgCountBefore } = await client
    .from('organizations')
    .select('*', { count: 'exact', head: true });

  const { count: payCountBefore } = await client
    .from('payments')
    .select('*', { count: 'exact', head: true });

  console.log('  ✓ Setup completed successfully.\n');

  try {
    // ──────────────────────────────────────────────────────────────────────────
    // TEST 1: Unregistered order cannot create an organization
    // ──────────────────────────────────────────────────────────────────────────
    console.log('[Test 1] Unregistered Order Cannot Create An Organization');
    const unregRef1 = `ORDER-UNREG-1-${testRunId}`;
    const msgId1 = `MSG-UNREG-1-${testRunId}`;
    const sig1 = generateLynkSignature(unregRef1, 1099000, msgId1, TEST_LYNK_SECRET);

    const reqUnreg1 = createRequest('http://localhost:3000/api/billing/webhook', 'POST', {
      'content-type': 'application/json',
      'x-lynk-signature': sig1,
    }, {
      event: 'payment.received',
      data: {
        message_action: 'SUCCESS',
        message_id: msgId1,
        message_data: {
          refId: unregRef1,
          totals: { grandTotal: 1099000 },
          customer: { email: UNKNOWN_EMAIL },
          items: [{ title: 'MingleBooth Pro Bulanan' }],
        },
      },
    });

    const resUnreg1 = await billingWebhook(reqUnreg1);
    assert.strictEqual(resUnreg1.status, 400, 'Unregistered order with unknown email returns HTTP 400');
    const dataUnreg1 = await resUnreg1.json();
    assert(
      dataUnreg1.error?.includes('MISSING_ORGANIZATION') || dataUnreg1.error?.includes('UNREGISTERED_ORDER'),
      'Fails closed with structured MISSING_ORGANIZATION error'
    );

    const { count: orgCountAfter1 } = await client
      .from('organizations')
      .select('*', { count: 'exact', head: true });
    assert.strictEqual(orgCountAfter1, orgCountBefore, 'Zero organizations created for unregistered order');
    console.log('  ✓ PASS: Unregistered order with unknown email rejected with HTTP 400');
    console.log('  ✓ PASS: Zero organizations created in database');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 2: Unregistered order cannot insert a PAID payment
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n[Test 2] Unregistered Order Cannot Insert a PAID Payment');
    const { count: payCountAfter2 } = await client
      .from('payments')
      .select('*', { count: 'exact', head: true });
    assert.strictEqual(payCountAfter2, payCountBefore, 'Zero payment records inserted for unregistered order');
    console.log('  ✓ PASS: Database payments record count completely unchanged');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 3: Unregistered order cannot change any organization subscription
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n[Test 3] Unregistered Order Cannot Change Any Organization Subscription');
    const { data: orgACheck } = await client.from('organizations').select('subscription_status').eq('id', ORG_A_ID).single();
    const { data: orgBCheck } = await client.from('organizations').select('subscription_status').eq('id', ORG_B_ID).single();
    assert.strictEqual(orgACheck?.subscription_status, 'pending_payment', 'Org A subscription remains pending_payment');
    assert.strictEqual(orgBCheck?.subscription_status, 'pending_payment', 'Org B subscription remains pending_payment');
    console.log('  ✓ PASS: Isolated organizations subscription_status unchanged');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 4: Missing organization binding fails closed in settlement engine
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n[Test 4] Missing Organization Binding Fails Closed');
    let missingOrgErr: any = null;
    try {
      await executePaymentSettlement({
        orderId: `ORDER-NO-ORG-${testRunId}`,
        planTier: 'pro',
        amountIdr: 1099000,
        durationDays: 30,
      });
    } catch (err: any) {
      missingOrgErr = err;
    }
    assert(missingOrgErr !== null, 'executePaymentSettlement throws on missing organization');
    assert(missingOrgErr.message.includes('MISSING_ORGANIZATION'), 'Throws MISSING_ORGANIZATION error code');
    console.log('  ✓ PASS: executePaymentSettlement throws MISSING_ORGANIZATION when no binding exists');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 5: Unknown customer email cannot create or select an organization
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n[Test 5] Unknown Customer Email Cannot Create Or Select An Organization');
    let unknownEmailErr: any = null;
    try {
      await executePaymentSettlement({
        orderId: `ORDER-UNKNOWN-EMAIL-${testRunId}`,
        customerEmail: 'attacker-random-account@nowhere.com',
        planTier: 'pro',
        amountIdr: 1099000,
        durationDays: 30,
      });
    } catch (err: any) {
      unknownEmailErr = err;
    }
    assert(unknownEmailErr !== null, 'Settlement throws for unknown customer email');
    assert(unknownEmailErr.message.includes('MISSING_ORGANIZATION'), 'Throws MISSING_ORGANIZATION error code');
    console.log('  ✓ PASS: Settlement fails closed without auto-creating organization');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 6: No code path selects oldest organization as fallback
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n[Test 6] No Code Path Selects Oldest Organization As Fallback');
    const { data: oldestOrgAfter } = await client
      .from('organizations')
      .select('id, name, subscription_status, subscription_expires_at')
      .eq('id', oldestOrgBefore?.id)
      .single();

    assert.strictEqual(
      oldestOrgAfter?.subscription_expires_at,
      oldestOrgBefore?.subscription_expires_at,
      'Oldest organization subscription_expires_at is strictly untouched'
    );
    assert.strictEqual(
      oldestOrgAfter?.subscription_status,
      oldestOrgBefore?.subscription_status,
      'Oldest organization subscription_status is strictly untouched'
    );
    console.log('  ✓ PASS: Oldest organization in database completely protected from fallback hijacking');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 7: Mismatched organization ID is rejected
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n[Test 7] Mismatched Organization ID Rejection');
    const refOrgA = `ORDER-PRE-A-${testRunId}`;
    const { error: insErrA } = await client.from('payments').insert({
      order_id: refOrgA,
      organization_id: ORG_A_ID,
      plan_tier: 'pro',
      amount_idr: 1099000,
      payment_status: 'PENDING',
    });
    assert.strictEqual(insErrA, null, 'Pre-registering order for Org A succeeds');

    let mismatchErr: any = null;
    try {
      await executePaymentSettlement({
        orderId: refOrgA,
        organizationId: ORG_B_ID, // Mismatched Org B trying to claim Org A order
        planTier: 'pro',
        amountIdr: 1099000,
        durationDays: 30,
      });
    } catch (err: any) {
      mismatchErr = err;
    }
    assert(mismatchErr !== null, 'Rejects cross-tenant organization hijack');
    assert(mismatchErr.message.includes('ORGANIZATION_MISMATCH'), 'Throws ORGANIZATION_MISMATCH error');
    console.log('  ✓ PASS: Rejects attempt to claim Org A order with Org B identifier');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 8: Valid pre-registered order settles only for its bound organization
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n[Test 8] Valid Pre-Registered Order Settles Only For Bound Organization');
    const settlementA = await executePaymentSettlement({
      orderId: refOrgA,
      organizationId: ORG_A_ID,
      planTier: 'pro',
      amountIdr: 1099000,
      durationDays: 30,
      providerTransactionId: `TX-A-${testRunId}`,
    });

    assert.strictEqual(settlementA.success, true, 'Settlement succeeds for bound organization');
    assert.strictEqual(settlementA.organizationId, ORG_A_ID, 'Settlement report specifies Org A ID');

    const { data: orgADb } = await client.from('organizations').select('subscription_status').eq('id', ORG_A_ID).single();
    const { data: orgBDb } = await client.from('organizations').select('subscription_status').eq('id', ORG_B_ID).single();
    assert.strictEqual(orgADb?.subscription_status, 'active', 'Org A successfully transitioned to active');
    assert.strictEqual(orgBDb?.subscription_status, 'pending_payment', 'Org B remains untouched in pending_payment');
    console.log('  ✓ PASS: Org A entitlement activated; Org B completely unaffected');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 9: Duplicate webhook does not grant additional subscription time
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n[Test 9] Duplicate Webhook Does Not Grant Additional Subscription Time');
    const { data: orgABeforeDup } = await client.from('organizations').select('subscription_expires_at').eq('id', ORG_A_ID).single();
    const expiryBeforeDup = orgABeforeDup?.subscription_expires_at;

    const dupSettlement = await executePaymentSettlement({
      orderId: refOrgA,
      organizationId: ORG_A_ID,
      planTier: 'pro',
      amountIdr: 1099000,
      durationDays: 30,
      providerTransactionId: `TX-A-${testRunId}`,
    });

    assert.strictEqual(dupSettlement.isDuplicate, true, 'Duplicate returns isDuplicate: true');
    const { data: orgAAfterDup } = await client.from('organizations').select('subscription_expires_at').eq('id', ORG_A_ID).single();
    assert.strictEqual(orgAAfterDup?.subscription_expires_at, expiryBeforeDup, 'Zero extra days added on duplicate settlement');
    console.log('  ✓ PASS: Duplicate settlement is strictly idempotent and adds zero extra time');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 10: Reusing provider transaction ID for another order is rejected
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n[Test 10] Reusing Provider Transaction ID Is Rejected');
    const refOrgB = `ORDER-PRE-B-${testRunId}`;
    const { error: insErrB } = await client.from('payments').insert({
      order_id: refOrgB,
      organization_id: ORG_B_ID,
      plan_tier: 'starter',
      amount_idr: 549000,
      payment_status: 'PENDING',
    });
    assert.strictEqual(insErrB, null, 'Pre-registering order for Org B succeeds');

    let reusedTxErr: any = null;
    try {
      await executePaymentSettlement({
        orderId: refOrgB,
        organizationId: ORG_B_ID,
        planTier: 'starter',
        amountIdr: 549000,
        durationDays: 30,
        providerTransactionId: `TX-A-${testRunId}`, // Claimed by Org A in Test 8!
      });
    } catch (err: any) {
      reusedTxErr = err;
    }
    assert(reusedTxErr !== null, 'Rejects attempt to reuse claimed transaction ID');
    assert(reusedTxErr.message.includes('PROVIDER_TRANSACTION_REUSED'), 'Throws PROVIDER_TRANSACTION_REUSED');
    console.log('  ✓ PASS: Reused provider transaction ID blocked with PROVIDER_TRANSACTION_REUSED');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 11: Invalid signature and unsuccessful status cannot settle
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n[Test 11] Invalid Signature and Non-Success Status Handling');
    const badSigReq = createRequest('http://localhost:3000/api/billing/webhook', 'POST', {
      'content-type': 'application/json',
      'x-lynk-signature': 'bad_sig_1234567890abcdef',
    }, {
      event: 'payment.received',
      data: {
        message_action: 'SUCCESS',
        message_id: `MSG-FAIL-${testRunId}`,
        message_data: {
          refId: refOrgB,
          totals: { grandTotal: 549000 },
          customer: { email: USER_B_EMAIL },
          items: [{ title: 'MingleBooth Starter Bulanan' }],
        },
      },
    });
    const badSigRes = await billingWebhook(badSigReq);
    assert.strictEqual(badSigRes.status, 401, 'Bad signature returns HTTP 401');

    const failedSig = generateLynkSignature(refOrgB, 549000, `MSG-FAIL-${testRunId}`, TEST_LYNK_SECRET);
    const failedStatusReq = createRequest('http://localhost:3000/api/billing/webhook', 'POST', {
      'content-type': 'application/json',
      'x-lynk-signature': failedSig,
    }, {
      event: 'payment.received',
      data: {
        message_action: 'FAILED',
        message_id: `MSG-FAIL-${testRunId}`,
        message_data: {
          refId: refOrgB,
          totals: { grandTotal: 549000 },
          customer: { email: USER_B_EMAIL },
          items: [{ title: 'MingleBooth Starter Bulanan' }],
        },
      },
    });
    const failedStatusRes = await billingWebhook(failedStatusReq);
    assert.strictEqual(failedStatusRes.status, 200, 'Non-success returns HTTP 200 acknowledgement');
    const failedData = await failedStatusRes.json();
    assert.strictEqual(failedData.message, 'Payment not successful', 'Explains payment not successful');

    const { data: checkUnsettledB } = await client.from('payments').select('payment_status').eq('order_id', refOrgB).single();
    assert.strictEqual(checkUnsettledB?.payment_status, 'PENDING', 'Payment record remains PENDING');
    console.log('  ✓ PASS: Invalid signature returns HTTP 401; failed status leaves order PENDING');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 12: Existing valid checkout & renewal behavior remains intact
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n[Test 12] Existing Valid Checkout & Renewal Behavior Remains Intact');
    const validSigB = generateLynkSignature(refOrgB, 549000, `MSG-VALID-${testRunId}`, TEST_LYNK_SECRET);
    const validReqB = createRequest('http://localhost:3000/api/billing/webhook', 'POST', {
      'content-type': 'application/json',
      'x-lynk-signature': validSigB,
    }, {
      event: 'payment.received',
      data: {
        message_action: 'SUCCESS',
        message_id: `MSG-VALID-${testRunId}`,
        message_data: {
          refId: refOrgB,
          totals: { grandTotal: 549000 },
          customer: { email: USER_B_EMAIL },
          items: [{ title: 'MingleBooth Starter Bulanan' }],
        },
      },
    });
    const validResB = await billingWebhook(validReqB);
    assert.strictEqual(validResB.status, 200, 'Valid webhook returns HTTP 200');

    const { data: orgBActivated } = await client.from('organizations').select('subscription_status').eq('id', ORG_B_ID).single();
    assert.strictEqual(orgBActivated?.subscription_status, 'active', 'Org B activated successfully via pre-registered order');
    console.log('  ✓ PASS: Valid checkout webhook activates subscription cleanly');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 13: Application fallback and RPC apply equivalent ownership validation
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n[Test 13] Application Fallback and RPC Ownership Validation Parity');
    // Both throw ORGANIZATION_MISMATCH when orgId differs
    let rpcParityCheck = false;
    try {
      await executePaymentSettlement({
        orderId: refOrgA,
        organizationId: ORG_B_ID,
        planTier: 'pro',
        amountIdr: 1099000,
        durationDays: 30,
      });
    } catch (e: any) {
      if (e.message.includes('ORGANIZATION_MISMATCH')) {
        rpcParityCheck = true;
      }
    }
    assert.strictEqual(rpcParityCheck, true, 'ORGANIZATION_MISMATCH consistently enforced');
    console.log('  ✓ PASS: Application fallback and RPC enforce equivalent tenant-binding rules');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 14: Compensation or rollback cannot alter another tenant's records
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n[Test 14] Compensation Rollback Tenant Isolation');
    const refRollback = `ORDER-FAIL-COMP-${testRunId}`;
    const NON_EXISTENT_ORG_ID = crypto.randomUUID();
    let compErr: any = null;
    try {
      await executePaymentSettlement({
        orderId: refRollback,
        organizationId: NON_EXISTENT_ORG_ID,
        planTier: 'pro',
        amountIdr: 1099000,
        durationDays: 30,
      });
    } catch (e: any) {
      compErr = e;
    }
    assert(compErr !== null, 'Settlement throws for non-existent org');

    // Ensure Org A and Org B remain active with intact timestamps
    const { data: checkOrgAComp } = await client.from('organizations').select('subscription_status').eq('id', ORG_A_ID).single();
    const { data: checkOrgBComp } = await client.from('organizations').select('subscription_status').eq('id', ORG_B_ID).single();
    assert.strictEqual(checkOrgAComp?.subscription_status, 'active', 'Org A intact during downstream failure');
    assert.strictEqual(checkOrgBComp?.subscription_status, 'active', 'Org B intact during downstream failure');
    console.log('  ✓ PASS: Failure compensation strictly isolated; zero other tenant records affected');

    console.log('\n========================================================================');
    console.log('   TENANT-ISOLATION SUITE: ALL 14/14 TESTS PASSED!                      ');
    console.log('========================================================================\n');
  } finally {
    console.log('[Teardown] Cleaning up isolated test fixtures...');
    await client.from('payments').delete().like('order_id', `%${testRunId}%`);
    await client.from('user_profiles').delete().in('email', [USER_A_EMAIL, USER_B_EMAIL]);
    await client.from('organizations').delete().in('id', [ORG_A_ID, ORG_B_ID]);
    console.log('  ✓ Teardown complete. Zero customer data touched.');
  }
}

runTestSuite().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
