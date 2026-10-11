import { NextRequest, NextResponse } from 'next/server';
import { verifyServerAuth, corsHeaders } from '@/lib/auth-server';
import { getActivePricingCatalog, updatePlanPrice, PlanTier, BillingInterval } from '@/lib/pricing';
import { getServiceSupabase } from '@/lib/supabase';
import { isPreviewDeployment, previewBlockedResponse } from '@/lib/preview-guard';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

/**
 * Superadmin Pricing Management API
 * Allows authorized administrators to view and configure subscription prices dynamically.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyServerAuth(req);
    if (!auth.isValid) {
      return NextResponse.json(
        { error: auth.error, code: 'AUTH_REQUIRED' },
        { status: auth.status || 401, headers: corsHeaders }
      );
    }
    if (!auth.isSuperAdmin) {
      return NextResponse.json(
        { error: 'Superadmin privileges required to manage pricing', code: 'ORG_ACCESS_DENIED' },
        { status: 403, headers: corsHeaders }
      );
    }

    const catalog = await getActivePricingCatalog();
    const client = getServiceSupabase();

    // Query historical price versions if available
    let priceHistory: any[] = [];
    try {
      const { data: hist } = await client
        .from('plan_prices')
        .select('*')
        .order('created_at', { ascending: false });
      if (hist) priceHistory = hist;
    } catch {
      priceHistory = catalog.prices;
    }

    return NextResponse.json(
      {
        success: true,
        plans: catalog.plans,
        activePrices: catalog.prices,
        history: priceHistory,
        source: catalog.source,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function POST(req: NextRequest) {
  if (isPreviewDeployment()) {
    return previewBlockedResponse('update_pricing', 'Modifying subscription pricing is disabled in Preview deployments.');
  }

  try {
    const auth = await verifyServerAuth(req);
    if (!auth.isValid) {
      return NextResponse.json(
        { error: auth.error, code: 'AUTH_REQUIRED' },
        { status: auth.status || 401, headers: corsHeaders }
      );
    }
    if (!auth.isSuperAdmin) {
      return NextResponse.json(
        { error: 'Superadmin privileges required to modify pricing', code: 'ORG_ACCESS_DENIED' },
        { status: 403, headers: corsHeaders }
      );
    }

    const body = await req.json();
    const { planId, billingInterval, newAmountIdr } = body;

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

    const updatedPrice = await updatePlanPrice({
      planId: planId as PlanTier,
      billingInterval: billingInterval as BillingInterval,
      newAmountIdr,
    });

    return NextResponse.json(
      {
        success: true,
        message: `Price for ${planId} (${billingInterval}) updated to Rp ${newAmountIdr.toLocaleString('id-ID')}`,
        updatedPrice,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
