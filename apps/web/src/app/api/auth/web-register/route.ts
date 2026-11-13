import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { createSignedToken } from '@/lib/auth-server';
import { isPreviewDeployment, previewBlockedResponse } from '@/lib/preview-guard';
import { sendWelcomeEmail } from '@/lib/brevo';
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

    // 1. Strict Layer 1: Check user_profiles table (case-insensitive)
    const { data: existingUser } = await client
      .from('user_profiles')
      .select('id, email, organization_id')
      .ilike('email', cleanEmail)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email ini sudah terdaftar. Silakan login ke portal atau gunakan email lain.' },
        { status: 409 }
      );
    }

    // 2. Strict Layer 2: Pre-create in Supabase Auth Admin (guarantees auth-level email uniqueness before creating any org)
    const { data: authUser, error: authErr } = await client.auth.admin.createUser({
      email: cleanEmail,
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: cleanStudioName,
      },
    });

    if (authErr || !authUser?.user?.id) {
      const authErrMsg = (authErr?.message || '').toLowerCase();
      if (
        authErrMsg.includes('already') ||
        authErrMsg.includes('registered') ||
        authErrMsg.includes('exists') ||
        authErr?.status === 422
      ) {
        return NextResponse.json(
          { error: 'Email ini sudah terdaftar. Silakan login ke portal atau gunakan email lain.' },
          { status: 409 }
        );
      }
      console.error('[Web Register] Auth creation error:', authErr);
      return NextResponse.json(
        { error: authErr?.message || 'Gagal mendaftarkan akun. Silakan periksa kembali data Anda.' },
        { status: 400 }
      );
    }

    const userId = authUser.user.id;

    // 3. Determine quota based on selected plan
    const normalizedPlan = ['starter', 'pro', 'business'].includes(plan) ? plan : 'pro';
    const quotaMap: Record<string, number> = {
      starter: 1,
      pro: 3,
      business: 10,
    };
    const maxDevices = quotaMap[normalizedPlan] || 3;
    const durationDays = cycle === 'monthly' ? 30 : 365;

    // 4. Create or provision organization
    const orgSlug = `${cleanStudioName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Math.random().toString(36).substring(2, 7)}`;
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
      // Rollback newly created auth user
      try { await client.auth.admin.deleteUser(userId); } catch {}
      console.error('[Web Register] Org creation error:', orgError);
      return NextResponse.json(
        { error: orgError?.message || 'Gagal membuat profil studio.' },
        { status: 500 }
      );
    }

    // 5. Create User Profile with exact auth userId
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
      // Rollback org and auth user
      try {
        await client.from('organizations').delete().eq('id', newOrg.id);
        await client.auth.admin.deleteUser(userId);
      } catch {}
      console.error('[Web Register] Profile insert error:', profileErr);
      return NextResponse.json(
        { error: profileErr.message || 'Gagal menyimpan profil studio.' },
        { status: 500 }
      );
    }

    // 6. Update user_metadata with organization_id
    try {
      await client.auth.admin.updateUserById(userId, {
        user_metadata: {
          full_name: cleanStudioName,
          organization_id: newOrg.id,
        },
      });
    } catch {}

    // 7. Transactional Welcome Email via Brevo (Non-blocking & Idempotent)
    try {
      const origin = req.nextUrl.origin || process.env.NEXT_PUBLIC_APP_URL || 'https://www.minglebooth.id';
      
      // Idempotency check: verify user hasn't already received the welcome email
      const isAlreadySent = authUser.user.user_metadata?.welcome_email_sent === true;
      if (!isAlreadySent) {
        const emailResult = await sendWelcomeEmail({
          toEmail: cleanEmail,
          studioName: cleanStudioName,
          appBaseUrl: origin,
        });

        if (emailResult.success && emailResult.messageId) {
          // Record successful dispatch in user_metadata without touching database schema
          await client.auth.admin.updateUserById(userId, {
            user_metadata: {
              full_name: cleanStudioName,
              organization_id: newOrg.id,
              welcome_email_sent: true,
              welcome_email_sent_at: new Date().toISOString(),
              welcome_email_message_id: emailResult.messageId,
            },
          });
        } else if (!emailResult.skipped) {
          console.warn(`[Web Register] Welcome email delivery failed for ${cleanEmail}:`, emailResult.error);
        }
      }
    } catch (emailErr) {
      // Strict rule: Registration SUCCESS MUST NOT depend on Brevo email delivery
      console.error('[Web Register] Unexpected error during welcome email delivery:', emailErr);
    }

    // 8. Generate authenticated bearer token for vendor session
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
