import { NextRequest, NextResponse } from 'next/server';
import { verifyServerAuth, corsHeaders } from '@/lib/auth-server';
import { createCheckoutOrder, PlanTier, BillingInterval } from '@/lib/pricing';
import { createDokuCheckoutSession, generateDokuOrderId, getDokuConfig, getCanonicalAppUrl } from '@/lib/doku';
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

    // Resolve environment-namespaced Order ID:
    // Sandbox: MB-SBX-[timestamp]-[random]
    // Production: MB-[timestamp]-[random]
    const dokuConfig = getDokuConfig();
    const namespacedOrderId = generateDokuOrderId(dokuConfig.environment);

    // Server-authoritative order snapshot creation
    const snapshot = await createCheckoutOrder({
      organizationId: targetOrgId,
      planTier: planTier as PlanTier,
      billingInterval: billingInterval as BillingInterval,
      customerEmail: customerEmail || auth.email || undefined,
      paymentLinkUrl,
      customOrderId: namespacedOrderId,
    });

    // Generate DOKU Checkout Session URL
    const dokuSession = await createDokuCheckoutSession({
      orderId: snapshot.orderId,
      amountIdr: snapshot.amountIdr,
      planName: `${planTier.toUpperCase()} (${billingInterval === 'yearly' ? 'Tahunan' : 'Bulanan'})`,
      customerEmail: customerEmail || auth.email || 'vendor@minglebooth.com',
      customerName: auth.email?.split('@')[0] || 'Studio Vendor',
      organizationId: targetOrgId,
    });

    // 1. Validate DOKU paymentUrl presence (Temuan 1)
    const rawPaymentUrl = dokuSession?.paymentUrl;
    if (!rawPaymentUrl || typeof rawPaymentUrl !== 'string' || !rawPaymentUrl.trim()) {
      console.error(
        `[Checkout Route] Missing DOKU paymentUrl for order ${snapshot.orderId} (isMock: ${Boolean(dokuSession?.isMock)})`
      );
      throw new Error('DOKU_GATEWAY_ERROR: Payment gateway did not return a valid checkout URL.');
    }

    // 2. Validate checkout URL security and origin (Temuan 2)
    let isUrlValid = false;
    try {
      const parsed = new URL(rawPaymentUrl);
      if (dokuSession.isMock) {
        // Mock URL must strictly match application canonical origin and designated mock path
        const canonicalBase = getCanonicalAppUrl();
        const canonicalParsed = new URL(canonicalBase);
        isUrlValid =
          parsed.origin === canonicalParsed.origin &&
          parsed.pathname.startsWith('/billing/result') &&
          parsed.searchParams.get('mock') === '1';
      } else {
        // Real DOKU checkout URL must be HTTPS and strictly on doku.com domain or subdomains
        isUrlValid =
          parsed.protocol === 'https:' &&
          (parsed.hostname === 'doku.com' || parsed.hostname.endsWith('.doku.com'));
      }
    } catch {
      isUrlValid = false;
    }

    if (!isUrlValid) {
      console.error(
        `[Checkout Route] Invalid DOKU paymentUrl origin/format for order ${snapshot.orderId} (isMock: ${Boolean(dokuSession.isMock)})`
      );
      throw new Error('DOKU_GATEWAY_ERROR: Invalid checkout URL format or domain returned by payment gateway.');
    }

    // 3. Persist authoritative DOKU Checkout URL into payments record (Temuan 3)
    const client = getServiceSupabase();
    const { data: updatedRows, error: updateErr } = await client
      .from('payments')
      .update({
        payment_link_url: rawPaymentUrl,
      })
      .eq('order_id', snapshot.orderId)
      .eq('organization_id', targetOrgId)
      .eq('payment_status', 'PENDING')
      .select('id');

    if (updateErr) {
      console.error(
        `[Checkout Route] Database error persisting paymentUrl for order ${snapshot.orderId}:`,
        updateErr.message
      );
      throw new Error(`Failed to persist payment gateway URL: ${updateErr.message}`);
    }

    if (!updatedRows || updatedRows.length === 0) {
      console.error(
        `[Checkout Route] Zero rows updated when persisting paymentUrl for order ${snapshot.orderId}`
      );
      throw new Error('Failed to update payment record: order record not found in PENDING state');
    }

    if (updatedRows.length > 1) {
      console.error(
        `[Checkout Route] Ambiguous update: multiple rows (${updatedRows.length}) matched order ${snapshot.orderId}`
      );
      throw new Error('Failed to update payment record: ambiguous multiple records updated');
    }

    return NextResponse.json(
      {
        success: true,
        order: snapshot,
        paymentUrl: dokuSession.paymentUrl,
        isMock: dokuSession.isMock,
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
