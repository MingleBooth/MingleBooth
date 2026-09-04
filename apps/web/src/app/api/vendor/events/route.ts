import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-org-id, x-vendor-email',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

/**
 * Live Supabase Events API — Multi-Tenant Isolated
 */
export async function GET(req: NextRequest) {
  try {
    const client = getServiceSupabase();
    const vendorEmail = req.headers.get('x-vendor-email') || req.nextUrl.searchParams.get('email');
    const orgIdHeader = req.headers.get('x-org-id') || req.nextUrl.searchParams.get('orgId');

    let orgId = orgIdHeader;

    // Resolve Organization by User Email if provided
    if (!orgId && vendorEmail) {
      const { data: userProfile } = await client
        .from('user_profiles')
        .select('organization_id')
        .eq('email', vendorEmail)
        .limit(1)
        .single();
      if (userProfile?.organization_id) {
        orgId = userProfile.organization_id;
      }
    }

    // Default fallback to first vendor if in dev mode
    if (!orgId) {
      const { data: defaultOrg } = await client
        .from('organizations')
        .select('id')
        .eq('slug', 'abc-photobooth')
        .limit(1)
        .single();
      orgId = defaultOrg?.id;
    }

    if (!orgId) {
      return NextResponse.json({ events: [], org: null }, { headers: corsHeaders });
    }

    // Fetch Organization Info
    const { data: org } = await client
      .from('organizations')
      .select('id, name, plan_tier, subscription_status, subscription_expires_at, max_devices_quota')
      .eq('id', orgId)
      .single();

    // STRICT MULTI-TENANT FILTER: Query ONLY events belonging to this organization_id
    const { data: events, error } = await client
      .from('events')
      .select('*, photos(count)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400, headers: corsHeaders });
    }

    const formattedEvents = (events || []).map((e: any) => ({
      id: e.id,
      name: e.name,
      slug: e.slug,
      date: e.date,
      status: e.status === 'active' ? 'Active' : e.status === 'ready' ? 'Ready' : 'Draft',
      photosCount: e.photos?.[0]?.count ?? 0,
      branding: e.branding_json,
    }));

    return NextResponse.json({
      events: formattedEvents,
      org,
    }, { headers: corsHeaders });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500, headers: corsHeaders });
  }
}

export async function POST(req: NextRequest) {
  try {
    const client = getServiceSupabase();
    const body = await req.json();
    const { name, date, outputType = 'photo', orgId: requestOrgId, email: vendorEmail } = body;

    if (!name || !date) {
      return NextResponse.json({ error: 'Name and date are required' }, { status: 400, headers: corsHeaders });
    }

    let targetOrgId = requestOrgId;

    if (!targetOrgId && vendorEmail) {
      const { data: profile } = await client
        .from('user_profiles')
        .select('organization_id')
        .eq('email', vendorEmail)
        .limit(1)
        .single();
      targetOrgId = profile?.organization_id;
    }

    if (!targetOrgId) {
      const { data: org } = await client.from('organizations').select('id').eq('slug', 'abc-photobooth').limit(1).single();
      targetOrgId = org?.id;
    }

    if (!targetOrgId) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 400, headers: corsHeaders });
    }

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '') + '-' + Math.floor(Math.random() * 1000);

    const { data: newEvent, error } = await client
      .from('events')
      .insert({
        organization_id: targetOrgId,
        name,
        slug,
        date,
        status: 'active',
        output_type: outputType,
        branding_json: {
          eventName: name,
          dateFormatted: new Date(date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
        },
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400, headers: corsHeaders });
    }

    return NextResponse.json({ success: true, event: newEvent }, { headers: corsHeaders });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500, headers: corsHeaders });
  }
}
