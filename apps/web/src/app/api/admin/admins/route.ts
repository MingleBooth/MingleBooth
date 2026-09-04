import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
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
