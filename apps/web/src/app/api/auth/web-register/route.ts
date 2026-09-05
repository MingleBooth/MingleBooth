import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
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
    const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: newOrg, error: orgError } = await client
      .from('organizations')
      .insert({
        name: cleanStudioName,
        slug: orgSlug,
        plan_tier: normalizedPlan,
        subscription_status: 'pending_payment',
        subscription_expires_at: expiresAt,
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

    // 5. Determine Lynk.id checkout URL for pre-filling
    const lynkMapYearly: Record<string, string> = {
      starter: process.env.NEXT_PUBLIC_LYNK_URL_STARTER || 'https://lynk.id/minglebooth/r6k3kdyxj7vw',
      pro: process.env.NEXT_PUBLIC_LYNK_URL_PRO || 'https://lynk.id/minglebooth/4gx630xzzq8r',
      business: process.env.NEXT_PUBLIC_LYNK_URL_BUSINESS || 'https://lynk.id/minglebooth/d4jm3v31kypm',
    };

    const lynkMapMonthly: Record<string, string> = {
      starter: process.env.NEXT_PUBLIC_LYNK_URL_STARTER_MONTHLY || 'https://lynk.id/minglebooth/llx2p98w1qlp',
      pro: process.env.NEXT_PUBLIC_LYNK_URL_PRO_MONTHLY || 'https://lynk.id/minglebooth/eqj6xmrjd51r',
      business: process.env.NEXT_PUBLIC_LYNK_URL_BUSINESS_MONTHLY || 'https://lynk.id/minglebooth/zr78ewnemej1',
    };

    const baseLynkUrl = cycle === 'monthly' ? lynkMapMonthly[normalizedPlan] : lynkMapYearly[normalizedPlan];
    const separator = baseLynkUrl.includes('?') ? '&' : '?';
    const checkoutUrl = `${baseLynkUrl}${separator}email=${encodeURIComponent(cleanEmail)}`;

    return NextResponse.json({
      success: true,
      message: 'Registrasi akun vendor berhasil!',
      user: {
        id: userId,
        email: cleanEmail,
        fullName: cleanStudioName,
        role: 'VENDOR_OWNER',
        org: newOrg,
      },
      checkoutUrl,
      redirectUrl: `/billing?registered=1&plan=${normalizedPlan}&cycle=${cycle}&email=${encodeURIComponent(cleanEmail)}`,
    });
  } catch (err: any) {
    console.error('[Web Register Exception]:', err);
    return NextResponse.json(
      { error: err?.message || 'Terjadi kesalahan pada server saat pendaftaran.' },
      { status: 500 }
    );
  }
}
