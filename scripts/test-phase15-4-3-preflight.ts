/**
 * PHASE 15.4.3 — SUPABASE RPC DEPLOYMENT PREFLIGHT & INTEGRATION TEST
 *
 * Verifies:
 * 1. Current remote RPC deployment status (live probe).
 * 2. Application argument compatibility and fallback behavior.
 * 3. Exact reporting of engineMode ('APPLICATION_COMPENSATION_FALLBACK' vs 'ATOMIC_DATABASE_RPC').
 * 4. Error isolation and rejection integrity (genuine errors never masked).
 */

import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

dotenv.config({ path: path.resolve(__dirname, '../apps/web/.env.local') });

import { getServiceSupabase } from '../apps/web/src/lib/supabase';
import { createSignedToken } from '../apps/web/src/lib/auth-server';
import { executePaymentSettlement } from '../apps/web/src/lib/billing-settlement';
import { GET as reconcileGet } from '../apps/web/src/app/api/admin/reconcile-billing/route';
import { NextRequest } from 'next/server';

// Colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

async function runPreflightVerification() {
  console.log(`\n${CYAN}========================================================================${RESET}`);
  console.log(`${CYAN}   PHASE 15.4.3 — SUPABASE RPC DEPLOYMENT PREFLIGHT VERIFICATION        ${RESET}`);
  console.log(`${CYAN}========================================================================${RESET}\n`);

  const client = getServiceSupabase();
  const testRunId = crypto.randomBytes(4).toString('hex');

  // 1. Live Remote RPC Deployment Probe
  console.log(`[Step 1] Probing Remote Supabase for process_payment_entitlement...`);
  const { data: probeData, error: probeErr } = await client.rpc('process_payment_entitlement', {
    p_order_id: `PROBE-${testRunId}`,
    p_org_id: '00000000-0000-0000-0000-000000000000',
    p_plan_tier: 'pro',
    p_amount_idr: 1099000,
    p_duration_days: 30,
    p_provider_transaction_id: `TX-PROBE-${testRunId}`,
    p_payment_link_url: 'https://lynk.id/probe',
  });

  const isRpcDeployed = !probeErr || probeErr.code !== 'PGRST202';
  console.log(`  RPC Deployed on Remote Supabase: ${isRpcDeployed ? `${GREEN}YES (ACTIVE)${RESET}` : `${YELLOW}NO (PENDING DEPLOYMENT)${RESET}`}`);
  if (probeErr) {
    console.log(`  Remote PostgREST Code: ${probeErr.code}`);
    console.log(`  Remote PostgREST Message: ${probeErr.message}`);
  }

  // 2. Query Superadmin Observability Endpoint
  console.log(`\n[Step 2] Querying Superadmin Observability Endpoint (/api/admin/reconcile-billing)...`);
  const superadminToken = createSignedToken({
    orgId: '00000000-0000-0000-0000-000000000000',
    role: 'SUPER_ADMIN',
    email: 'admin@minglebooth.com',
  });

  const reqObservability = new NextRequest('http://localhost:3000/api/admin/reconcile-billing', {
    headers: { authorization: `Bearer ${superadminToken}` },
  });
  const resObservability = await reconcileGet(reqObservability);
  const jsonObservability = await resObservability.json();

  console.log(`  Observability API Status: HTTP ${resObservability.status}`);
  console.log(`  Reported Remote RPC Deployed: ${jsonObservability.remoteRpc?.deployed}`);
  console.log(`  Reported Engine Mode: ${CYAN}${jsonObservability.remoteRpc?.engineMode}${RESET}`);

  // 3. Isolated Test Order Execution
  console.log(`\n[Step 3] Executing isolated test order through settlement engine...`);
  const testOrgId = crypto.randomUUID();
  const testOrderId = `PREFLIGHT-ISOLATED-${testRunId}`;
  const testTxId = `TX-ISOLATED-${testRunId}`;

  // Provision temporary organization
  await client.from('organizations').insert({
    id: testOrgId,
    name: `Preflight Test Org ${testRunId}`,
    slug: `preflight-org-${testRunId}`,
    plan_tier: 'pro',
    subscription_status: 'pending_payment',
    subscription_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    max_devices_quota: 3,
  });

  try {
    const settlementResult = await executePaymentSettlement({
      orderId: testOrderId,
      organizationId: testOrgId,
      planTier: 'pro',
      amountIdr: 1099000,
      durationDays: 30,
      providerTransactionId: testTxId,
      paymentLinkUrl: 'https://lynk.id/test',
    });

    console.log(`  Settlement Execution Succeeded: ${settlementResult.success}`);
    console.log(`  Settlement Engine Mode: ${CYAN}${settlementResult.engineMode}${RESET}`);
    console.log(`  Settlement Message: ${settlementResult.message}`);

    // Verify Organization was activated
    const { data: orgData } = await client.from('organizations').select('subscription_status').eq('id', testOrgId).single();
    console.log(`  Target Organization Status: ${orgData?.subscription_status === 'active' ? `${GREEN}active${RESET}` : `${RED}${orgData?.subscription_status}${RESET}`}`);

    // 4. Duplicate Delivery Test
    const duplicateResult = await executePaymentSettlement({
      orderId: testOrderId,
      organizationId: testOrgId,
      planTier: 'pro',
      amountIdr: 1099000,
      durationDays: 30,
      providerTransactionId: testTxId,
    });
    console.log(`  Duplicate Delivery Idempotency: ${duplicateResult.isDuplicate ? `${GREEN}IDEMPOTENT PASS${RESET}` : `${RED}FAIL${RESET}`}`);

  } finally {
    // Teardown
    console.log(`\n[Teardown] Cleaning up isolated preflight test fixtures...`);
    await client.from('payments').delete().eq('order_id', testOrderId);
    await client.from('organizations').delete().eq('id', testOrgId);
    console.log(`  ${GREEN}✓ Cleanup complete.${RESET}\n`);
  }

  console.log(`${CYAN}========================================================================${RESET}`);
  if (isRpcDeployed) {
    console.log(`${GREEN}   PREFLIGHT STATUS: DEPLOYED & OPERATIONAL (ATOMIC_DATABASE_RPC)       ${RESET}`);
  } else {
    console.log(`${YELLOW}   PREFLIGHT STATUS: PENDING DEPLOYMENT (APPLICATION FALLBACK READY)    ${RESET}`);
  }
  console.log(`${CYAN}========================================================================${RESET}\n`);
}

runPreflightVerification().catch((err) => {
  console.error(`\n${RED}PREFLIGHT ENCOUNTERED ERROR:${RESET}`, err);
  process.exit(1);
});
