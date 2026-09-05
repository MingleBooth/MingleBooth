import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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
      return NextResponse.json({ templates: [] }, { headers: corsHeaders });
    }

    // STRICT MULTI-TENANT FILTER
    const { data: templates, error } = await client
      .from('event_templates')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400, headers: corsHeaders });
    }

    // Normalize DB templates (only vendor-uploaded custom templates)
    const mappedDbTemplates = (templates || []).map((t: any) => ({
      ...t,
      slots: t.slots || t.config_json?.slotsCount || 1,
      overlay_base64: t.overlay_base64 || t.config_json?.overlayBase64 || null,
    }));

    return NextResponse.json({ templates: mappedDbTemplates }, { headers: corsHeaders });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500, headers: corsHeaders });
  }
}

export async function POST(req: NextRequest) {
  try {
    const client = getServiceSupabase();
    const body = await req.json();
    const {
      name,
      aspectRatio = '4:5',
      slots = 1,
      overlayStoragePath,
      overlayBase64,
      orgId: requestOrgId,
      email: vendorEmail,
    } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400, headers: corsHeaders });
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

    const { data: newTemplate, error } = await client
      .from('event_templates')
      .insert({
        organization_id: targetOrgId,
        name,
        aspect_ratio: aspectRatio,
        config_json: {
          slotsCount: slots,
          width: aspectRatio === '2:6' ? 600 : 1200,
          height: aspectRatio === '2:6' ? 1800 : 1500,
          overlayBase64: overlayBase64 || null,
        },
        overlay_storage_path: overlayStoragePath || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400, headers: corsHeaders });
    }

    return NextResponse.json({ success: true, template: newTemplate }, { headers: corsHeaders });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500, headers: corsHeaders });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const templateId = searchParams.get('id');

    if (!templateId) {
      return NextResponse.json({ error: 'Template ID required' }, { status: 400, headers: corsHeaders });
    }

    const client = getServiceSupabase();
    const { error } = await client.from('event_templates').delete().eq('id', templateId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400, headers: corsHeaders });
    }

    return NextResponse.json({ success: true, message: 'Template deleted' }, { headers: corsHeaders });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500, headers: corsHeaders });
  }
}
