import { NextResponse } from 'next/server';
import { getActivePricingCatalog } from '@/lib/pricing';
import { corsHeaders } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

/**
 * Public Dynamic Pricing Endpoint
 * Returns authoritative published subscription plans and prices.
 * Sourced from Supabase database with server-side baseline fallback.
 */
export async function GET() {
  try {
    const catalog = await getActivePricingCatalog();

    return NextResponse.json(
      {
        success: true,
        plans: catalog.plans,
        prices: catalog.prices,
        source: catalog.source,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to retrieve pricing catalog' },
      { status: 500, headers: corsHeaders }
    );
  }
}
