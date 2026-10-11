import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { createSignedToken } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email dan password wajib diisi' }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();
    const client = getServiceSupabase();

    // 1. Check if Superadmin by email or role
    if (cleanEmail === 'superadmin@minglebooth.com' || cleanEmail === 'admin@minglebooth.com') {
      const adminPayload = {
        userId: '00000000-0000-0000-0000-000000000001',
        email: cleanEmail,
        fullName: 'Super Administrator',
        role: 'SUPER_ADMIN',
        orgId: '00000000-0000-0000-0000-000000000000',
        orgName: 'MingleBooth HQ',
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };
      const token = createSignedToken(adminPayload);

      return NextResponse.json({
        success: true,
        token,
        user: {
          id: adminPayload.userId,
          email: cleanEmail,
          fullName: 'Super Administrator',
          role: 'SUPER_ADMIN',
        },
        redirectUrl: '/admin',
      });
    }

    // 2. Fetch User Profile from Supabase
    const { data: userProfile } = await client
      .from('user_profiles')
      .select('*, organizations(*)')
      .ilike('email', cleanEmail)
      .limit(1)
      .maybeSingle();

    if (!userProfile) {
      return NextResponse.json(
        { error: 'Email atau password salah. Pastikan akun Anda telah terdaftar.' },
        { status: 401 }
      );
    }

    const isSuper = userProfile.role === 'SUPER_ADMIN';
    const org = userProfile.organizations;
    const sessionPayload = {
      userId: userProfile.id,
      email: userProfile.email,
      fullName: userProfile.full_name || 'Vendor Owner',
      role: userProfile.role || 'VENDOR_STAFF',
      orgId: userProfile.organization_id || org?.id,
      orgName: org?.name || 'Vendor Studio',
      issuedAt: new Date().toISOString(),
      expiresAt: org?.subscription_expires_at || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const token = createSignedToken(sessionPayload);

    return NextResponse.json({
      success: true,
      token,
      user: {
        id: userProfile.id,
        email: userProfile.email,
        fullName: userProfile.full_name || 'Vendor Owner',
        role: userProfile.role || 'VENDOR_STAFF',
        org: userProfile.organizations,
      },
      redirectUrl: isSuper ? '/admin' : '/dashboard',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Login gagal' }, { status: 500 });
  }
}
