import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { verifyServerAuth, corsHeaders } from '@/lib/auth-server';
import { isPreviewDeployment, previewBlockedResponse } from '@/lib/preview-guard';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

/**
 * Live Supabase Events API — Authenticated & Multi-Tenant Isolated
 */
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

    // Fetch Organization Info
    const { data: org } = await client
      .from('organizations')
      .select('id, name, plan_tier, subscription_status, subscription_expires_at, max_devices_quota')
      .eq('id', orgId)
      .single();

    // STRICT MULTI-TENANT FILTER: Query ONLY events belonging to the verified organization
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
    if (isPreviewDeployment()) {
      return previewBlockedResponse(
        'create_event',
        'Pembuatan event baru dinonaktifkan pada Vercel Preview untuk melindungi integritas database produksi bersama.'
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
        { error: 'Mode Demo tidak dapat membuat event di cloud. Silakan aktifkan langganan berbayar.', code: 'DEMO_MODE_BLOCKED' },
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
              ? 'Masa aktif langganan Anda telah berakhir. Perpanjang langganan untuk membuat event baru.'
              : 'Akun Anda belum memiliki langganan aktif. Silakan pilih paket langganan untuk membuat event.',
            code: 'SUBSCRIPTION_REQUIRED',
          },
          { status: 403, headers: corsHeaders }
        );
      }
    }

    const body = await req.json();
    const { name, date, outputType = 'photo' } = body;

    if (!name || !date) {
      return NextResponse.json({ error: 'Name and date are required' }, { status: 400, headers: corsHeaders });
    }

    const targetOrgId = auth.orgId;

    // Create unique slug for this event within this organization
    const baseSlug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    const eventSlug = `${baseSlug}-${Date.now().toString().slice(-4)}`;

    const defaultBranding = {
      eventName: name,
      hostNames: name,
      dateFormatted: new Date(date).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
      primaryColor: '#000000',
    };

    const defaultConfig = {
      countdownSeconds: 3,
      shotsPerSession: 2,
      outputType: outputType,
      selectedFormatId: 'format_4r_portrait',
      aspectRatio: '4:5',
    };

    const { data: newEvent, error } = await client
      .from('events')
      .insert({
        organization_id: targetOrgId,
        name: name.trim(),
        slug: eventSlug,
        date: date,
        status: 'ready',
        output_type: outputType,
        branding_json: defaultBranding,
        config_json: defaultConfig,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400, headers: corsHeaders });
    }

    return NextResponse.json({
      success: true,
      event: {
        id: newEvent.id,
        name: newEvent.name,
        slug: newEvent.slug,
        date: newEvent.date,
        status: 'Ready',
        branding: newEvent.branding_json,
      },
    }, { headers: corsHeaders });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500, headers: corsHeaders });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    if (isPreviewDeployment()) {
      return previewBlockedResponse(
        'update_event',
        'Pembaruan event dinonaktifkan pada Vercel Preview untuk melindungi integritas database produksi bersama.'
      );
    }

    const auth = await verifyServerAuth(req);
    if (!auth.success) {
      return NextResponse.json(
        { error: auth.error, code: auth.code },
        { status: auth.status, headers: corsHeaders }
      );
    }

    const client = getServiceSupabase();
    const body = await req.json();
    const { id, name, date, outputType, status, branding } = body;

    if (!id) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400, headers: corsHeaders });
    }

    // 1. Verify event ownership
    const { data: existingEvent, error: fetchErr } = await client
      .from('events')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !existingEvent || (!auth.isSuperAdmin && existingEvent.organization_id !== auth.orgId)) {
      return NextResponse.json(
        { error: 'Akses ditolak: Acara tidak ditemukan atau bukan milik organisasi Anda.', code: 'ORG_ACCESS_DENIED' },
        { status: 403, headers: corsHeaders }
      );
    }

    // 2. Merge branding if provided
    let updatedBranding = existingEvent.branding_json || {};
    if (branding && typeof branding === 'object') {
      updatedBranding = {
        ...updatedBranding,
        ...branding,
      };
    }

    const updatePayload: Record<string, any> = {
      branding_json: updatedBranding,
      updated_at: new Date().toISOString(),
    };
    if (name !== undefined) updatePayload.name = name;
    if (date !== undefined) updatePayload.date = date;
    if (outputType !== undefined) updatePayload.output_type = outputType;
    if (status !== undefined) updatePayload.status = status;

    const { data: updatedEvent, error } = await client
      .from('events')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400, headers: corsHeaders });
    }

    return NextResponse.json({ success: true, event: updatedEvent }, { headers: corsHeaders });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500, headers: corsHeaders });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (isPreviewDeployment()) {
      return previewBlockedResponse(
        'delete_event',
        'Penghapusan event dinonaktifkan pada Vercel Preview untuk melindungi file storage produksi.'
      );
    }

    const auth = await verifyServerAuth(req);
    if (!auth.success) {
      return NextResponse.json(
        { error: auth.error, code: auth.code },
        { status: auth.status, headers: corsHeaders }
      );
    }

    const client = getServiceSupabase();
    const eventId = req.nextUrl.searchParams.get('id');

    if (!eventId) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400, headers: corsHeaders });
    }

    // 1. Verify event ownership
    const { data: existingEvent, error: fetchErr } = await client
      .from('events')
      .select('id, organization_id')
      .eq('id', eventId)
      .maybeSingle();

    if (fetchErr || !existingEvent || (!auth.isSuperAdmin && existingEvent.organization_id !== auth.orgId)) {
      return NextResponse.json(
        { error: 'Akses ditolak: Acara tidak ditemukan atau bukan milik organisasi Anda.', code: 'ORG_ACCESS_DENIED' },
        { status: 403, headers: corsHeaders }
      );
    }

    // 2. Delete related database records
    await client.from('photos').delete().eq('event_id', eventId);
    await client.from('gifs').delete().eq('event_id', eventId);
    await client.from('cloud_sync_logs').delete().eq('event_id', eventId);

    // 3. Clean up physical files from Supabase Storage
    try {
      const { data: rawFiles } = await client.storage
        .from('minglebooth-storage')
        .list(`events/${eventId}/raw`);

      if (rawFiles && rawFiles.length > 0) {
        const rawPaths = rawFiles.map((f) => `events/${eventId}/raw/${f.name}`);
        await client.storage.from('minglebooth-storage').remove(rawPaths);
      }

      const { data: mainFiles } = await client.storage
        .from('minglebooth-storage')
        .list(`events/${eventId}`);

      if (mainFiles && mainFiles.length > 0) {
        const mainPaths = mainFiles
          .filter((f) => f.name !== 'raw')
          .map((f) => `events/${eventId}/${f.name}`);
        if (mainPaths.length > 0) {
          await client.storage.from('minglebooth-storage').remove(mainPaths);
        }
      }
    } catch (storageErr) {
      console.warn('Storage cleanup notice on event delete:', storageErr);
    }

    // 4. Delete event record
    const { error } = await client
      .from('events')
      .delete()
      .eq('id', eventId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400, headers: corsHeaders });
    }

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500, headers: corsHeaders });
  }
}
