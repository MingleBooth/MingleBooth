import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { verifyServerAuth } from '@/lib/auth-server';
import { isPreviewDeployment, previewBlockedResponse } from '@/lib/preview-guard';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    if (isPreviewDeployment()) {
      return previewBlockedResponse(
        'create_admin',
        'Penambahan akun admin dinonaktifkan pada Vercel Preview.'
      );
    }

    const auth = await verifyServerAuth(req);
    if (!auth.isValid) {
      return NextResponse.json({ error: auth.error, code: 'AUTH_REQUIRED' }, { status: auth.status || 401 });
    }
    if (!auth.isSuperAdmin) {
      return NextResponse.json({ error: 'Superadmin role required', code: 'ORG_ACCESS_DENIED' }, { status: 403 });
    }

    const body = await req.json();
    const { email, fullName, role = 'SUPER_ADMIN' } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email admin wajib diisi' }, { status: 400 });
    }

    const client = getServiceSupabase();

    // 1. Get default Organization for admin binding
    const { data: org } = await client.from('organizations').select('id').limit(1).single();

    const newUserId = crypto.randomUUID();

    const { data: newUser, error } = await client
      .from('user_profiles')
      .upsert(
        {
          id: newUserId,
          email,
          full_name: fullName || 'Administrator',
          role: role,
          organization_id: org?.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'email' }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `Akun Admin (${email}) berhasil ditambahkan ke sistem!`,
      user: newUser,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (isPreviewDeployment()) {
      return previewBlockedResponse(
        'delete_admin',
        'Penghapusan akun admin dinonaktifkan pada Vercel Preview.'
      );
    }

    const auth = await verifyServerAuth(req);
    if (!auth.isValid) {
      return NextResponse.json({ error: auth.error, code: 'AUTH_REQUIRED' }, { status: auth.status || 401 });
    }
    if (!auth.isSuperAdmin) {
      return NextResponse.json({ error: 'Superadmin role required', code: 'ORG_ACCESS_DENIED' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('id');

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    const client = getServiceSupabase();
    await client.from('user_profiles').delete().eq('id', userId);

    return NextResponse.json({
      success: true,
      message: 'Akun admin berhasil dihapus dari sistem.',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
