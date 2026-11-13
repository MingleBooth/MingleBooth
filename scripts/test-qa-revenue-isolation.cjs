/**
 * MingleBooth — QA Revenue Isolation Hardening Test Suite
 *
 * Validates:
 * 1. STUDIO ONE remains excluded from commercial metrics.
 * 2. Multiple explicitly configured QA UUIDs (via env var and dynamic registry) are excluded.
 * 3. Normal commercial organizations remain included.
 * 4. Unknown organizations are NOT automatically treated as QA (no naming-only bypass).
 * 5. Existing 'MB-SBX-' prefix transactions remain excluded.
 * 6. Both historical Sandbox invoice IDs remain excluded.
 * 7. Production commercial payments remain included.
 * 8. Testing and reconciliation reporting accurately calculates commercial vs testing revenue.
 */

const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');

// 1. Hook Node module resolution for TypeScript & @/ path aliases
const origResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    const rel = request.slice(2);
    const candidate = path.resolve(__dirname, '../apps/web/src', rel);
    try {
      return origResolve.call(this, candidate, parent, isMain, options);
    } catch {
      if (fs.existsSync(candidate + '.ts')) return candidate + '.ts';
      if (fs.existsSync(candidate + '.tsx')) return candidate + '.tsx';
      if (fs.existsSync(candidate + '/index.ts')) return candidate + '/index.ts';
      if (fs.existsSync(candidate + '/route.ts')) return candidate + '/route.ts';
    }
  }
  return origResolve.call(this, request, parent, isMain, options);
};

require.extensions['.ts'] = function(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });
  return module._compile(compiled.outputText, filename);
};

// 2. Import isolation functions under test
const {
  INTERNAL_QA_ORG_ID,
  STATIC_INTERNAL_QA_ORG_IDS,
  getInternalQaOrgIds,
  isInternalQaOrg,
  registerInternalQaOrgId,
  unregisterInternalQaOrgId,
  isDokuSandboxOrderId,
  HISTORICAL_SANDBOX_ORDERS,
  isQaOrTestPayment,
} = require('../apps/web/src/lib/doku.ts');

let passedCount = 0;
let failedCount = 0;

function assert(condition, testName, message) {
  if (condition) {
    console.log(`  ✔ PASS [${testName}] ${message}`);
    passedCount++;
  } else {
    console.error(`  ✖ FAIL [${testName}] ${message}`);
    failedCount++;
  }
}

async function runTests() {
  console.log('\n===============================================================');
  console.log('   MINGLEBOOTH — QA REVENUE ISOLATION HARDENING TESTS');
  console.log('===============================================================\n');

  // Test 1: STUDIO ONE remains excluded
  console.log('--- Test 1: STUDIO ONE exclusion ---');
  const studioOneId = 'f9077b0e-0486-4749-820a-a025ceb010b6';
  const t1_isQa = isInternalQaOrg(studioOneId);
  const t1_caseInsensitive = isInternalQaOrg(studioOneId.toUpperCase());
  const t1_whitespace = isInternalQaOrg(`  ${studioOneId}  `);
  const t1_payment = isQaOrTestPayment({
    organization_id: studioOneId,
    order_id: 'MB-20261113-PROD01',
  });
  assert(
    t1_isQa && t1_caseInsensitive && t1_whitespace && t1_payment,
    'Test 1',
    'STUDIO ONE (f9077b0e-0486-4749-820a-a025ceb010b6) is strictly recognized as QA and its payments are excluded'
  );

  // Test 2: Multiple explicitly configured QA UUIDs are excluded
  console.log('\n--- Test 2: Multiple explicitly configured QA UUIDs ---');
  const dynamicQaId = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';
  registerInternalQaOrgId(dynamicQaId);

  // Also test env var support
  const envQaId = 'e9f8a7b6-c5d4-4e3f-2a1b-0c9d8e7f6a5b';
  process.env.INTERNAL_QA_ORG_IDS = `${envQaId}, 11223344-5566-7788-99aa-bbccddeeff00`;

  const t2_dyn = isInternalQaOrg(dynamicQaId);
  const t2_env = isInternalQaOrg(envQaId);
  const t2_env_second = isInternalQaOrg('11223344-5566-7788-99aa-bbccddeeff00');
  const t2_payment_dyn = isQaOrTestPayment({
    organization_id: dynamicQaId,
    order_id: 'MB-20261113-PROD02',
  });
  const t2_payment_env = isQaOrTestPayment({
    organization_id: envQaId,
    order_id: 'MB-20261113-PROD03',
  });

  assert(
    t2_dyn && t2_env && t2_env_second && t2_payment_dyn && t2_payment_env,
    'Test 2',
    'Multiple explicitly configured QA UUIDs (via registry and INTERNAL_QA_ORG_IDS env) are recognized and excluded'
  );

  // Clean up dynamic registry for subsequent tests
  unregisterInternalQaOrgId(dynamicQaId);
  delete process.env.INTERNAL_QA_ORG_IDS;

  // Test 3: Normal commercial organization remains included
  console.log('\n--- Test 3: Normal commercial organization included ---');
  const commercialOrgId = '77777777-8888-4444-9999-000000000000';
  const commercialOrderId = 'MB-20261113-REAL01';
  const t3_isQa = isInternalQaOrg(commercialOrgId);
  const t3_isTestPay = isQaOrTestPayment({
    organization_id: commercialOrgId,
    order_id: commercialOrderId,
  });
  assert(
    !t3_isQa && !t3_isTestPay,
    'Test 3',
    'Normal commercial organization is NOT treated as QA and its production payments remain commercial revenue'
  );

  // Test 4: Unknown organization is not automatically treated as QA (no naming bypass)
  console.log('\n--- Test 4: Unknown organization not treated as QA ---');
  const unknownOrgId = '55555555-5555-4555-8555-555555555555';
  const t4_isQa = isInternalQaOrg(unknownOrgId);
  const t4_payWithTestName = isQaOrTestPayment({
    organization_id: unknownOrgId,
    order_id: 'MB-PROD-TESTSTUDIO-001',
    studio_name: 'test-studio-alpha',
    description: 'Testing subscription',
  });
  assert(
    !t4_isQa && !t4_payWithTestName,
    'Test 4',
    'Studio names, order descriptions, or prefixes alone DO NOT classify a payment as QA without explicit UUID or Sandbox prefix'
  );

  // Test 5: Existing MB-SBX- transactions remain excluded
  console.log('\n--- Test 5: Sandbox MB-SBX- transactions excluded ---');
  const t5_sbxOrder = 'MB-SBX-MWEPZ4ZJ-713C7F';
  const t5_isSbx = isDokuSandboxOrderId(t5_sbxOrder);
  const t5_sbxPay = isQaOrTestPayment({
    organization_id: commercialOrgId, // even under a commercial org
    order_id: t5_sbxOrder,
  });
  assert(
    t5_isSbx && t5_sbxPay,
    'Test 5',
    'MB-SBX- prefixed orders are strictly excluded from commercial revenue regardless of organization'
  );

  // Test 6: Both historical Sandbox invoices remain excluded
  console.log('\n--- Test 6: Historical Sandbox invoices excluded ---');
  const h1 = 'MB-MWARY392-F84E78';
  const h2 = 'MB-MWASYKYT-7B46A7';
  const t6_h1 = isDokuSandboxOrderId(h1) && isQaOrTestPayment({ organization_id: commercialOrgId, order_id: h1 });
  const t6_h2 = isDokuSandboxOrderId(h2) && isQaOrTestPayment({ organization_id: commercialOrgId, order_id: h2 });
  assert(
    t6_h1 && t6_h2,
    'Test 6',
    'Both historical sandbox orders (MB-MWARY392-F84E78, MB-MWASYKYT-7B46A7) are strictly excluded from commercial revenue'
  );

  // Test 7: Production commercial payments remain included
  console.log('\n--- Test 7: Production commercial payments included ---');
  const prodOrder1 = 'MB-MWEPZ4ZJ-1272D6';
  const prodOrder2 = 'MB-MWEPZ4ZJ-8899AA';
  const t7_pay1 = !isQaOrTestPayment({ organization_id: commercialOrgId, order_id: prodOrder1 });
  const t7_pay2 = !isQaOrTestPayment({ organization_id: commercialOrgId, order_id: prodOrder2 });
  assert(
    t7_pay1 && t7_pay2,
    'Test 7',
    'Genuine Production orders for commercial tenants are fully included in commercial revenue'
  );

  // Test 8: End-to-End Simulation of Overview Revenue Aggregation
  console.log('\n--- Test 8: SuperAdmin Overview revenue segregation simulation ---');
  // Configure QA org for test
  const secondaryQaOrgId = 'bbbbbbbb-cccc-4ddd-eeee-ffffffffffff';
  registerInternalQaOrgId(secondaryQaOrgId);

  const mockPayments = [
    // Commercial PAID (Included in totalRevenueIdr)
    { id: 'p1', organization_id: commercialOrgId, order_id: 'MB-PROD-001', amount_idr: 1499000, payment_status: 'PAID' },
    { id: 'p2', organization_id: commercialOrgId, order_id: 'MB-PROD-002', amount_idr: 2999000, payment_status: 'PAID' },
    // Commercial PENDING / FAILED (Not counted in totalRevenueIdr because not PAID)
    { id: 'p3', organization_id: commercialOrgId, order_id: 'MB-PROD-003', amount_idr: 549000, payment_status: 'FAILED' },

    // STUDIO ONE QA (Excluded from totalRevenueIdr, included in testingRevenueIdr)
    { id: 'p4', organization_id: studioOneId, order_id: 'MB-PROD-004', amount_idr: 2999000, payment_status: 'PAID' },
    { id: 'p5', organization_id: studioOneId, order_id: 'MB-PROD-005', amount_idr: 549000, payment_status: 'PAID' },

    // Second Designated QA Org (Excluded from totalRevenueIdr, included in testingRevenueIdr)
    { id: 'p6', organization_id: secondaryQaOrgId, order_id: 'MB-PROD-006', amount_idr: 549000, payment_status: 'PAID' },

    // Sandbox MB-SBX- payments (Excluded from totalRevenueIdr, included in testingRevenueIdr)
    { id: 'p7', organization_id: commercialOrgId, order_id: 'MB-SBX-TEST-001', amount_idr: 2999000, payment_status: 'PAID' },
    { id: 'p8', organization_id: commercialOrgId, order_id: 'MB-SBX-TEST-002', amount_idr: 1499000, payment_status: 'PAID' },

    // Historical Sandbox payments (Excluded from totalRevenueIdr, included in testingRevenueIdr)
    { id: 'p9', organization_id: commercialOrgId, order_id: 'MB-MWARY392-F84E78', amount_idr: 2999000, payment_status: 'PAID' },
    { id: 'p10', organization_id: commercialOrgId, order_id: 'MB-MWASYKYT-7B46A7', amount_idr: 2999000, payment_status: 'PAID' },
  ];

  const commercialPayments = mockPayments.filter(p => !isQaOrTestPayment(p));
  const testingPayments = mockPayments.filter(p => isQaOrTestPayment(p));

  const totalRevenueIdr = commercialPayments.reduce(
    (sum, p) => sum + (p.payment_status === 'PAID' ? Number(p.amount_idr || 0) : 0),
    0
  );

  const testingRevenueIdr = testingPayments.reduce(
    (sum, p) => sum + (p.payment_status === 'PAID' ? Number(p.amount_idr || 0) : 0),
    0
  );

  const expectedCommercialTotal = 1499000 + 2999000; // Rp 4.498.000
  const expectedTestingTotal = 2999000 + 549000 + 549000 + 2999000 + 1499000 + 2999000 + 2999000; // Rp 14.593.000

  assert(
    commercialPayments.length === 3 &&
    testingPayments.length === 7 &&
    mockPayments.length === 10 &&
    totalRevenueIdr === expectedCommercialTotal &&
    testingRevenueIdr === expectedTestingTotal,
    'Test 8',
    `Revenue strictly segregated: Commercial=${totalRevenueIdr} (expected ${expectedCommercialTotal}), Testing=${testingRevenueIdr} (expected ${expectedTestingTotal}), 0 payments deleted/suppressed`
  );

  unregisterInternalQaOrgId(secondaryQaOrgId);

  console.log('\n===============================================================');
  console.log(`   TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('===============================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

