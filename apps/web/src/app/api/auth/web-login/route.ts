import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';

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
      return NextResponse.json({
        success: true,
        user: {
          id: '00000000-0000-0000-0000-000000000001',
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
      .eq('email', cleanEmail)
      .limit(1)
      .single();

    if (userProfile) {
      const isSuper = userProfile.role === 'SUPER_ADMIN';
      return NextResponse.json({
        success: true,
        user: {
          id: userProfile.id,
          email: userProfile.email,
          fullName: userProfile.full_name || 'Vendor Owner',
          role: userProfile.role || 'VENDOR_STAFF',
          org: userProfile.organizations,
        },
        redirectUrl: isSuper ? '/admin' : '/dashboard',
      });
    }

    // 3. Fallback for vendor login demo
    const { data: defaultOrg } = await client.from('organizations').select('*').limit(1).single();

    return NextResponse.json({
      success: true,
      user: {
        id: 'vendor_user_1',
        email: cleanEmail,
        fullName: defaultOrg?.name || 'ABC Photobooth Studio',
        role: 'VENDOR_OWNER',
        org: defaultOrg,
      },
      redirectUrl: '/dashboard',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Login gagal' }, { status: 500 });
  }
}
