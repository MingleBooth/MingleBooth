import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-org-id, x-vendor-email',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  try {
    const client = getServiceSupabase();
    const vendorEmail = req.headers.get('x-vendor-email') || req.nextUrl.searchParams.get('email');
    const orgIdHeader = req.headers.get('x-org-id') || req.nextUrl.searchParams.get('orgId');

    let orgId = orgIdHeader;

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

    if (!orgId) {
      const { data: defaultOrg } = await client.from('organizations').select('id').eq('slug', 'abc-photobooth').limit(1).single();
      orgId = defaultOrg?.id;
    }

    if (!orgId) {
      return NextResponse.json({ devices: [] }, { headers: corsHeaders });
    }

    // STRICT MULTI-TENANT FILTER: Query ONLY devices belonging to this organization_id
    const { data: devices, error } = await client
      .from('devices')
      .select('*')
      .eq('organization_id', orgId)
      .order('activated_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400, headers: corsHeaders });
    }

    return NextResponse.json({ devices: devices || [] }, { headers: corsHeaders });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500, headers: corsHeaders });
  }
}
