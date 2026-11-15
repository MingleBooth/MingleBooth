import { NextRequest, NextResponse } from 'next/server';
import { verifyServerAuth, corsHeaders } from '@/lib/auth-server';
import {
  getActivePricingCatalog,
  createOrUpdatePriceVersion,
  cancelScheduledPriceVersion,
  getPricingAuditLogs,
  PlanTier,
  BillingInterval,
  PRICING_LIMITS,
} from '@/lib/pricing';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

/**
 * Super Admin Pricing Management API
 * GET: Retrieve official active prices, scheduled price changes, and audit logs.
 * POST: Create/schedule a new price version or cancel a scheduled version.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyServerAuth(req);
    if (!auth.isValid) {
      return NextResponse.json(
        { error: auth.error || 'Authentication required', code: 'AUTH_REQUIRED' },
        { status: auth.status || 401, headers: corsHeaders }
      );
    }
    if (!auth.isSuperAdmin) {
      return NextResponse.json(
        { error: 'Super Admin privileges required to manage pricing', code: 'ORG_ACCESS_DENIED' },
        { status: 403, headers: corsHeaders }
      );
    }

    const catalog = await getActivePricingCatalog({ includeScheduled: true });
    const auditLogs = await getPricingAuditLogs();

    return NextResponse.json(
      {
        success: true,
        plans: catalog.plans,
        activePrices: catalog.prices,
        scheduledPrices: catalog.scheduled,
        auditLogs,
        limits: PRICING_LIMITS,
        source: catalog.source,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (err: any) {
    console.error('[Admin Pricing GET Error]', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyServerAuth(req);
    if (!auth.isValid) {
      return NextResponse.json(
        { error: auth.error || 'Authentication required', code: 'AUTH_REQUIRED' },
        { status: auth.status || 401, headers: corsHeaders }
      );
    }
    if (!auth.isSuperAdmin) {
      return NextResponse.json(
        { error: 'Super Admin privileges required to modify pricing', code: 'ORG_ACCESS_DENIED' },
        { status: 403, headers: corsHeaders }
      );
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'update_price';

    // 1. Action: Cancel a scheduled price change
    if (action === 'cancel_scheduled') {
      const { planId, billingInterval, reason } = body;

      if (!['starter', 'pro', 'business'].includes(planId)) {
        return NextResponse.json(
          { error: `Invalid plan tier: '${planId}'`, code: 'INVALID_PLAN_TIER' },
          { status: 400, headers: corsHeaders }
        );
      }
      if (!['monthly', 'yearly'].includes(billingInterval)) {
        return NextResponse.json(
          { error: `Invalid billing interval: '${billingInterval}'`, code: 'INVALID_INTERVAL' },
          { status: 400, headers: corsHeaders }
        );
      }

      await cancelScheduledPriceVersion({
        planId: planId as PlanTier,
        billingInterval: billingInterval as BillingInterval,
        actorId: auth.orgId || 'superadmin',
        actorEmail: auth.email || 'superadmin@minglebooth.com',
        reason: reason || 'Scheduled price change cancelled by Super Admin',
      });

      return NextResponse.json(
        {
          success: true,
          message: `Scheduled price change for ${planId} (${billingInterval}) was cancelled.`,
        },
        { status: 200, headers: corsHeaders }
      );
    }

    // 2. Action: Create or schedule new price version
    const { planId, billingInterval, newAmountIdr, changeReason, effectiveFrom } = body;

    if (!['starter', 'pro', 'business'].includes(planId)) {
      return NextResponse.json(
        { error: `Invalid plan tier: '${planId}'`, code: 'INVALID_PLAN_TIER' },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!['monthly', 'yearly'].includes(billingInterval)) {
      return NextResponse.json(
        { error: `Invalid billing interval: '${billingInterval}'`, code: 'INVALID_INTERVAL' },
        { status: 400, headers: corsHeaders }
      );
    }

    if (
      typeof newAmountIdr !== 'number' ||
      newAmountIdr <= 0 ||
      !Number.isInteger(newAmountIdr)
    ) {
      return NextResponse.json(
        {
          error: 'Price amount must be a positive integer in Indonesian Rupiah (IDR)',
          code: 'INVALID_AMOUNT',
        },
        { status: 400, headers: corsHeaders }
      );
    }

    if (newAmountIdr < PRICING_LIMITS.MIN_AMOUNT_IDR) {
      return NextResponse.json(
        {
          error: `Price cannot be less than minimum limit of Rp ${PRICING_LIMITS.MIN_AMOUNT_IDR.toLocaleString('id-ID')}`,
          code: 'PRICE_BELOW_MINIMUM',
        },
        { status: 400, headers: corsHeaders }
      );
    }

    if (newAmountIdr > PRICING_LIMITS.MAX_AMOUNT_IDR) {
      return NextResponse.json(
        {
          error: `Price cannot exceed maximum limit of Rp ${PRICING_LIMITS.MAX_AMOUNT_IDR.toLocaleString('id-ID')}`,
          code: 'PRICE_EXCEEDS_MAXIMUM',
        },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!changeReason || typeof changeReason !== 'string' || changeReason.trim().length < 3) {
      return NextResponse.json(
        {
          error: 'Change reason is mandatory (minimum 3 characters required for audit trail)',
          code: 'INVALID_REASON',
        },
        { status: 400, headers: corsHeaders }
      );
    }

    const { updatedPrice, auditLog } = await createOrUpdatePriceVersion({
      planId: planId as PlanTier,
      billingInterval: billingInterval as BillingInterval,
      newAmountIdr,
      changeReason: changeReason.trim(),
      actorId: auth.orgId || 'superadmin',
      actorEmail: auth.email || 'superadmin@minglebooth.com',
      effectiveFrom,
    });

    const isScheduled = updatedPrice.status === 'scheduled';
    const message = isScheduled
      ? `Price change for ${planId} (${billingInterval}) scheduled to Rp ${newAmountIdr.toLocaleString('id-ID')} effective ${new Date(updatedPrice.effectiveFrom).toLocaleString('id-ID')}`
      : `Official price for ${planId} (${billingInterval}) updated to Rp ${newAmountIdr.toLocaleString('id-ID')} (Version ${updatedPrice.version})`;

    return NextResponse.json(
      {
        success: true,
        message,
        updatedPrice,
        auditLog,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (err: any) {
    console.error('[Admin Pricing POST Error]', err);
    const errorCode = err?.code || (err?.message?.includes('DATABASE_PERSISTENCE_ERROR') ? 'DATABASE_PERSISTENCE_ERROR' : 'PRICING_UPDATE_FAILED');
    const statusCode = errorCode === 'SCHEDULE_COLLISION' ? 409 : (err?.status || 500);
    return NextResponse.json(
      { error: err?.message || 'Internal server error modifying pricing', code: errorCode },
      { status: statusCode, headers: corsHeaders }
    );
  }
}
