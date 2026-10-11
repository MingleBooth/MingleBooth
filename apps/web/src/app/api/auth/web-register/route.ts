import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { createSignedToken } from '@/lib/auth-server';
import { isPreviewDeployment, previewBlockedResponse } from '@/lib/preview-guard';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    if (isPreviewDeployment()) {
      return previewBlockedResponse(
        'registration',
        'Pendaftaran organisasi baru dinonaktifkan pada Vercel Preview untuk melindungi database produksi bersama.'
      );
    }

    const body = await req.json();
    const { studioName, email, password, plan = 'pro', cycle = 'yearly' } = body;

    if (!studioName || !email || !password) {
      return NextResponse.json(
        { error: 'Nama Studio, Email, dan Password wajib diisi.' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password minimal harus 6 karakter.' },
        { status: 400 }
      );
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanStudioName = studioName.trim();
    const client = getServiceSupabase();

    // 1. Check if user profile with this email already exists
    const { data: existingUser } = await client
      .from('user_profiles')
      .select('id, email, organization_id')
      .ilike('email', cleanEmail)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email ini sudah terdaftar. Silakan login ke portal.' },
        { status: 409 }
      );
    }

    // 2. Determine quota based on selected plan
    const normalizedPlan = ['starter', 'pro', 'business'].includes(plan) ? plan : 'pro';
    const quotaMap: Record<string, number> = {
      starter: 1,
      pro: 3,
      business: 10,
    };
    const maxDevices = quotaMap[normalizedPlan] || 3;
    const durationDays = cycle === 'monthly' ? 30 : 365;

    // 3. Create or provision organization
    const orgSlug = `${cleanStudioName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Math.random().toString(36).substring(2, 7)}`;
    // Newly registered unpaid organizations receive pending_payment status with zero paid entitlement.
    // In current DB schema, subscription_expires_at has a NOT NULL constraint, so epoch (1970-01-01)
    // is set to avoid granting a misleading future expiry before payment is settled.
    const unpaidEpochExpiry = new Date(0).toISOString();

    const { data: newOrg, error: orgError } = await client
      .from('organizations')
      .insert({
        name: cleanStudioName,
        slug: orgSlug,
        plan_tier: normalizedPlan,
        subscription_status: 'pending_payment',
        subscription_expires_at: unpaidEpochExpiry,
        max_devices_quota: maxDevices,
      })
      .select('*')
      .single();

    if (orgError || !newOrg) {
      console.error('[Web Register] Org creation error:', orgError);
      return NextResponse.json(
        { error: orgError?.message || 'Gagal membuat profil studio.' },
        { status: 500 }
      );
    }

    // 4. Create User Profile
    let userId: string = crypto.randomUUID();
    try {
      const { data: authUser, error: authErr } = await client.auth.admin.createUser({
        email: cleanEmail,
        password: password,
        email_confirm: true,
        user_metadata: {
          full_name: cleanStudioName,
          organization_id: newOrg.id,
        },
      });

      if (!authErr && authUser?.user?.id) {
        userId = authUser.user.id;
      }
    } catch (authException) {
      console.warn('[Web Register] Supabase Admin auth notice (using generated UUID):', authException);
    }

    const { data: profile, error: profileErr } = await client
      .from('user_profiles')
      .insert({
        id: userId,
        email: cleanEmail,
        full_name: cleanStudioName,
        role: 'VENDOR_OWNER',
        organization_id: newOrg.id,
      })
      .select('*')
      .single();

    if (profileErr) {
      console.warn('[Web Register] Profile insert notice:', profileErr.message);
    }

    // 5. Generate authenticated bearer token for vendor session
    const sessionToken = createSignedToken({
      userId,
      email: cleanEmail,
      orgId: newOrg.id,
      role: 'VENDOR_OWNER',
    });

    return NextResponse.json({
      success: true,
      message: 'Registrasi akun vendor gratis berhasil!',
      token: sessionToken,
      user: {
        id: userId,
        email: cleanEmail,
        fullName: cleanStudioName,
        role: 'VENDOR_OWNER',
        org: newOrg,
      },
      redirectUrl: '/dashboard?welcome=1',
    });
  } catch (err: any) {
    console.error('[Web Register Exception]:', err);
    return NextResponse.json(
      { error: err?.message || 'Terjadi kesalahan pada server saat pendaftaran.' },
      { status: 500 }
    );
  }
}
