import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = body.email || 'superadmin@minglebooth.com';
    const password = body.password || 'SuperAdmin2026!';
    const fullName = body.fullName || 'Super Administrator MingleBooth';

    const client = getServiceSupabase();

    // 1. Get or create Master Organization
    let { data: org } = await client
      .from('organizations')
      .select('id')
      .eq('slug', 'minglebooth-hq')
      .single();

    if (!org) {
      const { data: newOrg } = await client
        .from('organizations')
        .insert({
          name: 'MingleBooth Headquarters',
          slug: 'minglebooth-hq',
          plan_tier: 'business',
          subscription_status: 'active',
          max_devices_quota: 999,
        })
        .select('id')
        .single();
      org = newOrg;
    }

    // 2. Hash / prepare profile ID
    const superAdminId = '00000000-0000-0000-0000-000000000001';

    // 3. Upsert user_profiles in Supabase
    const { data: userProfile, error: profileErr } = await client
      .from('user_profiles')
      .upsert(
        {
          id: superAdminId,
          email: email.toLowerCase().trim(),
          full_name: fullName,
          role: 'SUPER_ADMIN',
          organization_id: org?.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
      .select()
      .single();

    if (profileErr) {
      console.warn('[Setup Superadmin DB Notice]:', profileErr.message);
    }

    // Also register 'admin@minglebooth.com' alias
    const aliasId = '00000000-0000-0000-0000-000000000002';
    await client.from('user_profiles').upsert(
      {
        id: aliasId,
        email: 'admin@minglebooth.com',
        full_name: 'Primary Administrator',
        role: 'SUPER_ADMIN',
        organization_id: org?.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    return NextResponse.json({
      success: true,
      message: 'Akun Superadmin resmi berhasil dibuat di Supabase Cloud!',
      credentials: {
        email: email,
        password: password,
        role: 'SUPER_ADMIN',
        organization: 'MingleBooth Headquarters',
        loginUrl: 'https://minglebooth.id/login',
        portalUrl: 'https://minglebooth.id/admin',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
