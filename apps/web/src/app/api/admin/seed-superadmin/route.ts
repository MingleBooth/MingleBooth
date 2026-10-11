import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { verifyServerAuth } from '@/lib/auth-server';
import { isPreviewDeployment, previewBlockedResponse } from '@/lib/preview-guard';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (isPreviewDeployment()) {
    return previewBlockedResponse('seed_superadmin', 'Database seeding is disabled in Preview deployments.');
  }

  try {
    const client = getServiceSupabase();

    const { count } = await client
      .from('user_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'SUPER_ADMIN');

    if (count && count > 0) {
      const auth = await verifyServerAuth(req);
      if (!auth.isValid || !auth.isSuperAdmin) {
        return NextResponse.json(
          { error: 'Superadmin account already seeded. Access denied.', code: 'ORG_ACCESS_DENIED' },
          { status: 403 }
        );
      }
    }

    // 1. Get default Organization
    let { data: org } = await client
      .from('organizations')
      .select('id')
      .eq('slug', 'abc-photobooth')
      .single();

    if (!org) {
      const { data: newOrg } = await client
        .from('organizations')
        .insert({
          name: 'ABC Photobooth Studio',
          slug: 'abc-photobooth',
          plan_tier: 'pro',
          subscription_status: 'active',
          max_devices_quota: 3,
        })
        .select('id')
        .single();
      org = newOrg;
    }

    // 2. Upsert Superadmin Profile in user_profiles
    const superAdminId = '00000000-0000-0000-0000-000000000001';
    const { data: adminProfile, error: adminErr } = await client
      .from('user_profiles')
      .upsert(
        {
          id: superAdminId,
          email: 'admin@minglebooth.com',
          full_name: 'Super Administrator',
          role: 'SUPER_ADMIN',
          organization_id: org?.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
      .select()
      .single();

    if (adminErr) {
      console.warn('[Seed Superadmin Warning]:', adminErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Superadmin account seeded successfully!',
      superadmin: {
        email: 'admin@minglebooth.com',
        role: 'SUPER_ADMIN',
        organizationId: org?.id,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
