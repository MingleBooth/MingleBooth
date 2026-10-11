import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { verifyServerAuth, corsHeaders } from '@/lib/auth-server';
import { executePaymentSettlement } from '@/lib/billing-settlement';
import { isPreviewDeployment, previewBlockedResponse } from '@/lib/preview-guard';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

/**
 * Superadmin Billing Reconciliation & Observability API (Task 4)
 * Provides read-only discrepancy audit and idempotent reconciliation of confirmed orders.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyServerAuth(req);
    if (!auth.isValid) {
      return NextResponse.json({ error: auth.error, code: 'AUTH_REQUIRED' }, { status: auth.status || 401, headers: corsHeaders });
    }
    if (!auth.isSuperAdmin) {
      return NextResponse.json({ error: 'Superadmin privileges required', code: 'ORG_ACCESS_DENIED' }, { status: 403, headers: corsHeaders });
    }

    const client = getServiceSupabase();

    // 1. Probe Remote RPC Status
    let rpcDeployed = false;
    try {
      const { error: rpcErr } = await client.rpc('process_payment_entitlement', {
        p_order_id: 'SYSTEM-PROBE-HEALTHCHECK',
        p_org_id: '00000000-0000-0000-0000-000000000000',
        p_plan_tier: 'pro',
        p_amount_idr: 0,
        p_duration_days: 0,
      });
      // If error is NOT function-missing (PGRST202), the function exists!
      if (!rpcErr || rpcErr.code !== 'PGRST202') {
        rpcDeployed = true;
      }
    } catch {
      rpcDeployed = false;
    }

    // 2. Fetch all payments and organizations for discrepancy scanning
    const { data: payments } = await client
      .from('payments')
      .select('id, order_id, organization_id, plan_tier, amount_idr, payment_status, provider_transaction_id, created_at, paid_at')
      .order('created_at', { ascending: false });

    const { data: orgs } = await client
      .from('organizations')
      .select('id, name, slug, plan_tier, subscription_status, subscription_expires_at, max_devices_quota');

    const orgMap = new Map((orgs || []).map((o) => [o.id, o]));

    // Discrepancy 1: Orphaned Payments (PAID status but organization subscription not active)
    const orphanedPayments: any[] = [];
    // Discrepancy 2: Duplicate provider transaction IDs
    const txIdCounts = new Map<string, string[]>();
    // Discrepancy 3: Stuck Pending orders (> 24 hours old)
    const stuckPending: any[] = [];

    const now = Date.now();

    for (const p of (payments || [])) {
      if (p.provider_transaction_id) {
        const existing = txIdCounts.get(p.provider_transaction_id) || [];
        existing.push(p.order_id);
        txIdCounts.set(p.provider_transaction_id, existing);
      }

      const org = orgMap.get(p.organization_id);

      if (p.payment_status === 'PAID') {
        if (!org || org.subscription_status !== 'active') {
          orphanedPayments.push({
            orderId: p.order_id,
            organizationId: p.organization_id,
            organizationName: org?.name || 'Unknown',
            amountIdr: Number(p.amount_idr),
            planTier: p.plan_tier,
            paidAt: p.paid_at,
            reason: 'Payment marked PAID but organization is not active',
          });
        }
      } else if (p.payment_status === 'PENDING') {
        const createdMs = new Date(p.created_at).getTime();
        if (now - createdMs > 24 * 60 * 60 * 1000) {
          stuckPending.push({
            orderId: p.order_id,
            organizationId: p.organization_id,
            createdAt: p.created_at,
            amountIdr: Number(p.amount_idr),
          });
        }
      }
    }

    const duplicateTxIds = Array.from(txIdCounts.entries())
      .filter(([_, orders]) => orders.length > 1)
      .map(([txId, orders]) => ({ providerTransactionId: txId, orderIds: orders }));

    return NextResponse.json({
      success: true,
      remoteRpc: {
        deployed: rpcDeployed,
        engineMode: rpcDeployed ? 'ATOMIC_DATABASE_RPC' : 'APPLICATION_COMPENSATION_FALLBACK',
      },
      audit: {
        totalPayments: payments?.length || 0,
        orphanedPaymentsCount: orphanedPayments.length,
        duplicateTxIdsCount: duplicateTxIds.length,
        stuckPendingCount: stuckPending.length,
      },
      discrepancies: {
        orphanedPayments,
        duplicateTxIds,
        stuckPending,
      },
    }, { status: 200, headers: corsHeaders });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
}

/**
 * Superadmin manual reconciliation of a verified, provider-confirmed payment
 */
export async function POST(req: NextRequest) {
  try {
    if (isPreviewDeployment()) {
      return previewBlockedResponse(
        'reconcile_billing',
        'Rekonsiliasi billing dinonaktifkan pada Vercel Preview.'
      );
    }

    const auth = await verifyServerAuth(req);
    if (!auth.isValid) {
      return NextResponse.json({ error: auth.error, code: 'AUTH_REQUIRED' }, { status: auth.status || 401, headers: corsHeaders });
    }
    if (!auth.isSuperAdmin) {
      return NextResponse.json({ error: 'Superadmin privileges required', code: 'ORG_ACCESS_DENIED' }, { status: 403, headers: corsHeaders });
    }

    const body = await req.json();
    const { orderId, action } = body;

    if (!orderId || action !== 'reconcile_order') {
      return NextResponse.json({ error: 'orderId and action="reconcile_order" required' }, { status: 400, headers: corsHeaders });
    }

    const client = getServiceSupabase();

    // 1. Fetch Authoritative Payment Record
    const { data: payment, error: payErr } = await client
      .from('payments')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle();

    if (payErr || !payment) {
      return NextResponse.json({ error: `Order ${orderId} not found in payments database` }, { status: 404, headers: corsHeaders });
    }

    // 2. Security guard: NEVER grant entitlement if payment is not marked PAID
    if (payment.payment_status !== 'PAID') {
      return NextResponse.json({
        error: `Cannot reconcile order ${orderId}: Payment status is '${payment.payment_status}', not 'PAID'. Only provider-confirmed payments can be reconciled.`,
        code: 'PAYMENT_NOT_PAID',
      }, { status: 400, headers: corsHeaders });
    }

    // 3. Reconcile Entitlement Idempotently using snapshot duration
    const durationDays = payment.duration_days
      ? Number(payment.duration_days)
      : (payment.billing_interval === 'monthly' ? 30 : 365);

    const settlement = await executePaymentSettlement({
      orderId: payment.order_id,
      organizationId: payment.organization_id,
      planTier: payment.plan_tier as any,
      amountIdr: Number(payment.amount_idr),
      durationDays,
      providerTransactionId: payment.provider_transaction_id,
    });

    const auditEntry = {
      reconciledAt: new Date().toISOString(),
      reconciledBy: auth.email || 'SUPER_ADMIN',
      orderId: payment.order_id,
      organizationId: payment.organization_id,
      planTier: settlement.planTier,
      expiresAt: settlement.expiresAt,
    };

    console.log('[Billing Reconciliation Audit]:', JSON.stringify(auditEntry));

    return NextResponse.json({
      success: true,
      reconciled: true,
      message: `Order ${orderId} successfully reconciled. License active until ${settlement.expiresAt}.`,
      audit: auditEntry,
    }, { status: 200, headers: corsHeaders });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
}
