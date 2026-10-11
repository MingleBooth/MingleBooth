import { NextRequest, NextResponse } from 'next/server';
import { verifyServerAuth, corsHeaders } from '@/lib/auth-server';
import { createCheckoutOrder, PlanTier, BillingInterval } from '@/lib/pricing';
import { getServiceSupabase } from '@/lib/supabase';
import { isPreviewDeployment, previewBlockedResponse } from '@/lib/preview-guard';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

/**
 * Vendor Checkout Order API
 * Generates an immutable server-side payment order snapshot before redirecting to Lynk.id.
 * The payable amount is strictly resolved on the server and cannot be altered by the client.
 */
export async function POST(req: NextRequest) {
  try {
    if (isPreviewDeployment()) {
      return previewBlockedResponse(
        'checkout',
        'Pembuatan order checkout dinonaktifkan pada Vercel Preview.'
      );
    }

    const auth = await verifyServerAuth(req);
    if (!auth.isValid || !auth.orgId) {
      return NextResponse.json(
        {
          error: auth.error || 'Authentication required to create checkout order.',
          code: 'AUTH_REQUIRED',
        },
        { status: 401, headers: corsHeaders }
      );
    }

    const body = await req.json();

    const {
      planTier,
      billingInterval = 'yearly',
      customerEmail,
      paymentLinkUrl,
      organizationId: bodyOrgId,
    } = body;

    // Enforce verified tenant binding: Reject conflicting client-supplied organization ID
    if (bodyOrgId && bodyOrgId !== auth.orgId) {
      return NextResponse.json(
        {
          error: `ORGANIZATION_MISMATCH: Conflicting organization ID supplied. Checkout must be created for authenticated organization ${auth.orgId}.`,
          code: 'ORGANIZATION_MISMATCH',
        },
        { status: 400, headers: corsHeaders }
      );
    }

    const targetOrgId = auth.orgId;

    if (!['starter', 'pro', 'business'].includes(planTier)) {
      return NextResponse.json(
        {
          error: `Invalid plan tier: '${planTier}'. Supported plans: starter, pro, business.`,
          code: 'INVALID_PLAN_TIER',
        },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!['monthly', 'yearly'].includes(billingInterval)) {
      return NextResponse.json(
        {
          error: `Invalid billing interval: '${billingInterval}'. Supported intervals: monthly, yearly.`,
          code: 'INVALID_INTERVAL',
        },
        { status: 400, headers: corsHeaders }
      );
    }

    // Server-authoritative order snapshot creation
    const snapshot = await createCheckoutOrder({
      organizationId: targetOrgId,
      planTier: planTier as PlanTier,
      billingInterval: billingInterval as BillingInterval,
      customerEmail: customerEmail || auth.email || undefined,
      paymentLinkUrl,
    });

    return NextResponse.json(
      {
        success: true,
        order: snapshot,
        message: 'Order created with immutable commercial terms snapshot',
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (err: any) {
    const isValidationErr =
      err.message?.includes('INVALID_') ||
      err.message?.includes('PRICE_NOT_FOUND') ||
      err.message?.includes('MISSING_') ||
      err.message?.includes('ORGANIZATION_MISMATCH');
    const status = isValidationErr ? 400 : 500;

    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status, headers: corsHeaders }
    );
  }
}
