import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { verifyServerAuth, corsHeaders } from '@/lib/auth-server';
import { isPreviewDeployment, previewBlockedResponse } from '@/lib/preview-guard';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyServerAuth(req);
    if (!auth.success) {
      return NextResponse.json(
        { error: auth.error, code: auth.code },
        { status: auth.status, headers: corsHeaders }
      );
    }

    const client = getServiceSupabase();
    const orgId = auth.orgId;

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
    if (isPreviewDeployment()) {
      return previewBlockedResponse(
        'create_template',
        'Pembuatan template baru dinonaktifkan pada Vercel Preview untuk melindungi integritas database produksi bersama.'
      );
    }

    const auth = await verifyServerAuth(req);
    if (!auth.success) {
      return NextResponse.json(
        { error: auth.error, code: auth.code },
        { status: auth.status, headers: corsHeaders }
      );
    }

    if (auth.payload?.isDemo) {
      return NextResponse.json(
        { error: 'Mode Demo tidak dapat membuat template kustom di cloud. Silakan aktifkan langganan berbayar.', code: 'DEMO_MODE_BLOCKED' },
        { status: 403, headers: corsHeaders }
      );
    }

    const client = getServiceSupabase();

    // Verify active subscription in database
    if (!auth.isSuperAdmin) {
      const { data: orgData, error: orgErr } = await client
        .from('organizations')
        .select('id, name, subscription_status, subscription_expires_at')
        .eq('id', auth.orgId)
        .single();

      if (orgErr || !orgData) {
        return NextResponse.json(
          { error: 'Organisasi vendor tidak ditemukan.', code: 'ORG_ACCESS_DENIED' },
          { status: 404, headers: corsHeaders }
        );
      }

      const now = new Date();
      const expiresAt = orgData.subscription_expires_at ? new Date(orgData.subscription_expires_at) : new Date(0);
      const hasActiveSub = orgData.subscription_status === 'active' && expiresAt >= now;

      if (!hasActiveSub) {
        return NextResponse.json(
          {
            error: orgData.subscription_status === 'expired'
              ? 'Masa aktif langganan Anda telah berakhir. Perpanjang langganan untuk mengunggah template baru.'
              : 'Akun Anda belum memiliki langganan aktif. Silakan pilih paket langganan untuk mengunggah template.',
            code: 'SUBSCRIPTION_REQUIRED',
          },
          { status: 403, headers: corsHeaders }
        );
      }
    }

    const body = await req.json();
    const {
      name,
      aspectRatio = '4:5',
      slots = 1,
      overlayStoragePath,
      overlayBase64,
    } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400, headers: corsHeaders });
    }

    const targetOrgId = auth.orgId;

    const { data: newTemplate, error } = await client
      .from('event_templates')
      .insert({
        organization_id: targetOrgId,
        name: name.trim(),
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
    if (isPreviewDeployment()) {
      return previewBlockedResponse(
        'delete_template',
        'Penghapusan template dinonaktifkan pada Vercel Preview.'
      );
    }

    const auth = await verifyServerAuth(req);
    if (!auth.success) {
      return NextResponse.json(
        { error: auth.error, code: auth.code },
        { status: auth.status, headers: corsHeaders }
      );
    }

    const { searchParams } = new URL(req.url);
    const templateId = searchParams.get('id');

    if (!templateId) {
      return NextResponse.json({ error: 'Template ID required' }, { status: 400, headers: corsHeaders });
    }

    const client = getServiceSupabase();

    // Verify template ownership
    const { data: existingTemplate } = await client
      .from('event_templates')
      .select('id, organization_id')
      .eq('id', templateId)
      .maybeSingle();

    if (!existingTemplate || (!auth.isSuperAdmin && existingTemplate.organization_id !== auth.orgId)) {
      return NextResponse.json(
        { error: 'Akses ditolak: Template tidak ditemukan atau bukan milik organisasi Anda.', code: 'ORG_ACCESS_DENIED' },
        { status: 403, headers: corsHeaders }
      );
    }

    const { error } = await client.from('event_templates').delete().eq('id', templateId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400, headers: corsHeaders });
    }

    return NextResponse.json({ success: true, message: 'Template deleted' }, { headers: corsHeaders });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500, headers: corsHeaders });
  }
}
