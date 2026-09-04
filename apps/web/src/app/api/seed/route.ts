import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const client = getServiceSupabase();

    // 1. Create or upsert organization
    const { data: org, error: orgError } = await client
      .from('organizations')
      .upsert(
        {
          name: 'ABC Photobooth Studio',
          slug: 'abc-photobooth',
          plan_tier: 'pro',
          max_devices_quota: 3,
          subscription_status: 'active',
        },
        { onConflict: 'slug' }
      )
      .select()
      .single();

    if (orgError) {
      return NextResponse.json({ error: 'Org seed failed: ' + orgError.message }, { status: 400 });
    }

    // 2. Create or upsert event
    const { data: event, error: evtError } = await client
      .from('events')
      .upsert(
        {
          organization_id: org.id,
          name: 'Wedding Bayu & Irma',
          slug: 'bayu-irma-wedding',
          status: 'active',
          date: '2026-08-29',
          branding_json: {
            eventName: 'Wedding Bayu & Irma',
            hostNames: 'Bayu & Irma',
            dateFormatted: '29 August 2026',
            hashtag: '#BayuIrmaForever',
          },
        },
        { onConflict: 'organization_id,slug' }
      )
      .select()
      .single();

    if (evtError) {
      return NextResponse.json({ error: 'Event seed failed: ' + evtError.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Supabase seeded successfully with default organization and event!',
      organization: org,
      event: event,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
