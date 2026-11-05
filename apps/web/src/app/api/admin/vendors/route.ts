import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { verifyServerAuth } from '@/lib/auth-server';
import { isPreviewDeployment, previewBlockedResponse } from '@/lib/preview-guard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyServerAuth(req);
    if (!auth.isValid) {
      return NextResponse.json({ error: auth.error, code: 'AUTH_REQUIRED' }, { status: auth.status || 401 });
    }
    if (!auth.isSuperAdmin) {
      return NextResponse.json({ error: 'Superadmin role required', code: 'ORG_ACCESS_DENIED' }, { status: 403 });
    }

    const client = getServiceSupabase();

    const { data: orgs, error: orgErr } = await client
      .from('organizations')
      .select('*, devices(*), events(*)');

    if (orgErr) {
      return NextResponse.json({ error: orgErr.message }, { status: 500 });
    }

    const formattedVendors = (orgs || []).map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      planTier: o.plan_tier,
      subscriptionStatus: o.subscription_status,
      subscriptionExpiresAt: o.subscription_expires_at,
      maxDevicesQuota: o.max_devices_quota,
      activeDevicesCount: o.devices?.filter((d: any) => d.is_active)?.length || 0,
      totalEventsCount: o.events?.length || 0,
      createdAt: o.created_at,
    }));

    return NextResponse.json({
      success: true,
      vendors: formattedVendors,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (isPreviewDeployment()) {
      return previewBlockedResponse(
        'modify_vendor',
        'Modifikasi data vendor dan reset perangkat dinonaktifkan pada Vercel Preview.'
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
    const { orgId, action, planTier, durationMonths, paymentMethod, amountIdr, notes, orgName, email, password } = body;

    const client = getServiceSupabase();

    // 1. Action: Create New Vendor Directly from Admin
    if (action === 'create_vendor') {
      if (!orgName || !email) {
        return NextResponse.json({ error: 'Nama studio dan email vendor wajib diisi' }, { status: 400 });
      }

      const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `studio-${Date.now()}`;
      const months = Number(durationMonths) || 12;
      const initialTier = planTier || 'pro';
      let maxDevices = 3;
      if (initialTier === 'starter') maxDevices = 1;
      if (initialTier === 'business') maxDevices = 10;

      const expiresAt = new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000).toISOString();

      // Insert organization
      const { data: newOrg, error: orgErr } = await client
        .from('organizations')
        .insert({
          name: orgName,
          slug: `${slug}-${Math.random().toString(36).substring(2, 6)}`,
          plan_tier: initialTier,
          max_devices_quota: maxDevices,
          subscription_status: 'active',
          subscription_expires_at: expiresAt,
        })
        .select()
        .single();

      if (orgErr || !newOrg) {
        return NextResponse.json({ error: orgErr?.message || 'Gagal membuat organisasi vendor' }, { status: 500 });
      }

      // Create user profile
      const { error: userErr } = await client
        .from('user_profiles')
        .insert({
          organization_id: newOrg.id,
          email: email.toLowerCase().trim(),
          full_name: orgName,
          role: 'VENDOR_OWNER',
        });

      if (userErr) {
        console.warn('[Admin Create Vendor] Warning creating user_profile:', userErr);
      }

      // Record initial manual activation payment
      await client.from('payments').insert({
        organization_id: newOrg.id,
        order_id: `MANUAL-${Date.now().toString(36).toUpperCase()}`,
        amount_idr: amountIdr || (initialTier === 'business' ? 7999000 : initialTier === 'starter' ? 1499000 : 2999000),
        plan_tier: initialTier,
        payment_status: 'PAID',
        provider_transaction_id: `ADMIN-${paymentMethod || 'MANUAL'}-${(notes || 'Admin Direct Provision').substring(0, 30)}`,
        payment_link_url: 'https://minglebooth.com/admin',
        settled_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });

      return NextResponse.json({
        success: true,
        message: `Vendor "${orgName}" berhasil dibuat dengan lisensi aktif ${initialTier.toUpperCase()} (${months} bulan)!`,
        vendor: newOrg,
      });
    }

    if (!orgId) {
      return NextResponse.json({ error: 'orgId required' }, { status: 400 });
    }

    // 2. Action: Manual License Activation
    if (action === 'manual_activate') {
      const tier = planTier || 'pro';
      const months = Number(durationMonths) || 12;
      let maxDevices = 3;
      if (tier === 'starter') maxDevices = 1;
      if (tier === 'business') maxDevices = 10;

      const expiresAt = new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000).toISOString();

      await client
        .from('organizations')
        .update({
          subscription_status: 'active',
          subscription_expires_at: expiresAt,
          plan_tier: tier,
          max_devices_quota: maxDevices,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orgId);

      // Record payment settlement
      await client.from('payments').insert({
        organization_id: orgId,
        order_id: `ACTIVATE-${Date.now().toString(36).toUpperCase()}`,
        amount_idr: Number(amountIdr) || (tier === 'business' ? 7999000 : tier === 'starter' ? 1499000 : 2999000),
        plan_tier: tier,
        payment_status: 'PAID',
        provider_transaction_id: `ADMIN-${paymentMethod || 'MANUAL'}-${(notes || 'Manual Activation').substring(0, 30)}`,
        payment_link_url: 'https://minglebooth.com/admin',
        settled_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });

      return NextResponse.json({
        success: true,
        message: `Lisensi vendor berhasil diaktifkan: ${tier.toUpperCase()} selama ${months} Bulan (${maxDevices} Device)!`,
      });
    }

    // 3. Action: Extend by 1 Month (+30 Days)
    if (action === 'extend_1_month') {
      const { data: targetOrg } = await client
        .from('organizations')
        .select('subscription_expires_at, subscription_status')
        .eq('id', orgId)
        .single();

      const currentExpiryMs = targetOrg?.subscription_expires_at
        ? new Date(targetOrg.subscription_expires_at).getTime()
        : 0;
      const baseTimeMs =
        currentExpiryMs > Date.now() && targetOrg?.subscription_status !== 'expired'
          ? currentExpiryMs
          : Date.now();
      const expiresAt = new Date(baseTimeMs + 30 * 24 * 60 * 60 * 1000).toISOString();

      await client
        .from('organizations')
        .update({
          subscription_status: 'active',
          subscription_expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orgId);

      return NextResponse.json({ success: true, message: 'Lisensi vendor berhasil diperpanjang +30 Hari!' });
    }

    // 4. Action: Extend by 1 Year (+365 Days)
    if (action === 'extend_1_year') {
      const { data: targetOrg } = await client
        .from('organizations')
        .select('subscription_expires_at, subscription_status')
        .eq('id', orgId)
        .single();

      const currentExpiryMs = targetOrg?.subscription_expires_at
        ? new Date(targetOrg.subscription_expires_at).getTime()
        : 0;
      const baseTimeMs =
        currentExpiryMs > Date.now() && targetOrg?.subscription_status !== 'expired'
          ? currentExpiryMs
          : Date.now();
      const expiresAt = new Date(baseTimeMs + 365 * 24 * 60 * 60 * 1000).toISOString();

      await client
        .from('organizations')
        .update({
          subscription_status: 'active',
          subscription_expires_at: expiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orgId);

      return NextResponse.json({ success: true, message: 'Lisensi vendor berhasil diperpanjang +365 Hari!' });
    }

    // 5. Action: Change Plan Tier
    if (action === 'change_plan') {
      let maxDevices = 3;
      if (planTier === 'starter') maxDevices = 1;
      if (planTier === 'business') maxDevices = 10;

      await client
        .from('organizations')
        .update({
          plan_tier: planTier,
          max_devices_quota: maxDevices,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orgId);

      return NextResponse.json({ success: true, message: `Paket diubah ke ${planTier.toUpperCase()} (Kuota: ${maxDevices} Device)!` });
    }

    // 6. Action: Reset Hardware ID (HWID)
    if (action === 'reset_devices') {
      await client.from('devices').delete().eq('organization_id', orgId);
      return NextResponse.json({ success: true, message: 'Semua HWID perangkat vendor berhasil di-reset!' });
    }

    // 6b. Action: Add Staff Account to Organization
    if (action === 'add_staff') {
      const { staffEmail, staffName, role = 'VENDOR_STAFF' } = body;
      if (!staffEmail) {
        return NextResponse.json({ error: 'Email staf wajib diisi' }, { status: 400 });
      }

      const { data: newStaff, error: staffErr } = await client
        .from('user_profiles')
        .insert({
          organization_id: orgId,
          email: staffEmail.toLowerCase().trim(),
          full_name: staffName || 'Staf Operator',
          role: role,
        })
        .select()
        .single();

      if (staffErr) {
        return NextResponse.json({ error: staffErr.message }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        message: `Akun staf "${staffEmail}" berhasil ditambahkan ke studio ini!`,
        staff: newStaff,
      });
    }

    // 6c. Action: Delete Staff Account
    if (action === 'delete_staff') {
      const { staffId } = body;
      if (!staffId) {
        return NextResponse.json({ error: 'staffId required' }, { status: 400 });
      }

      await client.from('user_profiles').delete().eq('id', staffId).eq('organization_id', orgId);
      return NextResponse.json({ success: true, message: 'Akun staf berhasil dihapus dari studio ini.' });
    }

    // 7. Action: Delete Vendor
    if (action === 'delete_vendor') {
      await client.from('devices').delete().eq('organization_id', orgId);
      await client.from('events').delete().eq('organization_id', orgId);
      await client.from('payments').delete().eq('organization_id', orgId);
      await client.from('user_profiles').delete().eq('organization_id', orgId);
      await client.from('organizations').delete().eq('id', orgId);
      return NextResponse.json({ success: true, message: 'Organisasi vendor dan seluruh datanya berhasil dihapus.' });
    }

    return NextResponse.json({ error: 'Action not supported' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
