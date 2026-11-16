import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { verifyServerAuth } from '@/lib/auth-server';
import { isQaOrTestPayment } from '@/lib/doku';

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

    // 1. Fetch Organizations with Devices & Events
    const { data: orgs, error: orgErr } = await client
      .from('organizations')
      .select('*, devices(*), events(*)');

    if (orgErr) throw orgErr;

    // Filter out automated test dummy studios if any remain
    const isTestStudio = (name: string) => {
      if (!name) return false;
      const lower = name.toLowerCase();
      return (
        lower.startsWith('unpaid studio') ||
        lower.startsWith('expired studio') ||
        lower.startsWith('test-') ||
        lower.startsWith('mock-') ||
        lower.startsWith('studio readiness') ||
        lower.startsWith('studio audit')
      );
    };

    const cleanOrgs = (orgs || []).filter((o: any) => !isTestStudio(o.name));

    // 2. Fetch Payments (Revenue)
    const { data: payments, error: payErr } = await client
      .from('payments')
      .select('*')
      .order('created_at', { ascending: false });

    // 3. Fetch User Profiles
    const { data: users, error: userErr } = await client
      .from('user_profiles')
      .select('*, organizations(name, plan_tier, subscription_status, subscription_expires_at)');

    // 4. Fetch All Devices
    const { data: allDevices, error: devErr } = await client
      .from('devices')
      .select('*')
      .order('last_seen_at', { ascending: false });

    // Separate commercial payments from QA/test payments
    const isTestingPayment = (p: any) => isQaOrTestPayment(p);
    const commercialPayments = (payments || []).filter((p: any) => !isTestingPayment(p));
    const testingPayments = (payments || []).filter((p: any) => isTestingPayment(p));

    const totalRevenueIdr = commercialPayments.reduce(
      (sum: number, p: any) => sum + (p.payment_status === 'PAID' ? Number(p.amount_idr || 0) : 0),
      0
    );

    const testingRevenueIdr = testingPayments.reduce(
      (sum: number, p: any) => sum + (p.payment_status === 'PAID' ? Number(p.amount_idr || 0) : 0),
      0
    );

    // Filter out test users if any
    const testEmailPrefixes = ['readiness_', 'newvendor-test-'];
    const cleanUsers = (users || []).filter((u: any) => {
      const email = (u.email || '').toLowerCase().trim();
      return !testEmailPrefixes.some(prefix => email.startsWith(prefix)) && email !== 'hd722875@gmail.com';
    });

    // 1. Total Akun Terdaftar: unique customer emails
    const uniqueRegisteredEmails = Array.from(
      new Set(cleanUsers.map((u: any) => (u.email || '').toLowerCase().trim()).filter(Boolean))
    );
    const totalRegisteredAccounts = uniqueRegisteredEmails.length;

    // 2. Total Perangkat Login: devices linked to clean customer orgs
    const cleanOrgIds = new Set(cleanOrgs.map((o: any) => o.id));
    const cleanDevices = (allDevices || []).filter((d: any) => cleanOrgIds.has(d.organization_id));
    const totalLoggedInDevices = cleanDevices.length;

    // 3. Verified Paid Payments (PAID confirmed transactions)
    const confirmedPaidPayments = commercialPayments.filter((p: any) => p.payment_status === 'PAID');

    // Group confirmed payments by organization_id
    const orgPaidMap = new Map<string, any[]>();
    for (const p of confirmedPaidPayments) {
      if (!orgPaidMap.has(p.organization_id)) {
        orgPaidMap.set(p.organization_id, []);
      }
      orgPaidMap.get(p.organization_id)!.push(p);
    }

    // 4. Calculate Paid vs Unpaid Customers (One email counted strictly once)
    const paidEmailsSet = new Set<string>();
    const paidCustomersList: any[] = [];
    const unpaidCustomersList: any[] = [];

    for (const email of uniqueRegisteredEmails) {
      const userProfiles = cleanUsers.filter((u: any) => (u.email || '').toLowerCase().trim() === email);
      const profile = userProfiles.find((u: any) => u.role === 'VENDOR_OWNER') || userProfiles[0];
      const orgId = profile?.organization_id;
      const org = cleanOrgs.find((o: any) => o.id === orgId) || (profile?.organizations ? { ...profile.organizations, id: orgId } : null);

      const orgPayments = orgId ? (orgPaidMap.get(orgId) || []) : [];
      const orgDevices = orgId ? cleanDevices.filter((d: any) => d.organization_id === orgId) : [];

      if (orgPayments.length > 0) {
        paidEmailsSet.add(email);
        const totalAmount = orgPayments.reduce((sum: number, p: any) => sum + Number(p.amount_idr || 0), 0);
        const sortedPayments = [...orgPayments].sort(
          (a: any, b: any) => new Date(b.created_at || b.paid_at).getTime() - new Date(a.created_at || a.paid_at).getTime()
        );
        const latestPayment = sortedPayments[0];

        paidCustomersList.push({
          email,
          studioName: org?.name || 'Studio Pribadi',
          planTier: org?.plan_tier || latestPayment.plan_tier || 'pro',
          totalPaidAmount: totalAmount,
          latestPaymentAmount: Number(latestPayment.amount_idr || 0),
          latestPaymentDate: latestPayment.paid_at || latestPayment.created_at,
          latestOrderId: latestPayment.order_id,
          licenseStatus: org?.subscription_status || 'active',
          licenseExpiresAt: org?.subscription_expires_at || null,
          devicesCount: orgDevices.length,
          activeDevicesCount: orgDevices.filter((d: any) => d.is_active).length,
        });
      } else {
        unpaidCustomersList.push({
          email,
          studioName: org?.name || 'Studio Baru',
          planTier: org?.plan_tier || 'starter',
          licenseStatus: org?.subscription_status || 'pending_payment',
          registeredAt: profile?.created_at,
          devicesCount: orgDevices.length,
        });
      }
    }

    const totalPaidCustomers = paidEmailsSet.size;
    const totalUnpaidCustomers = uniqueRegisteredEmails.length - totalPaidCustomers;

    // 5. Customer Devices List mapped to owner account email
    const customerDevicesList = cleanDevices.map((d: any) => {
      const org = cleanOrgs.find((o: any) => o.id === d.organization_id);
      const owner =
        cleanUsers.find((u: any) => u.organization_id === d.organization_id && u.role === 'VENDOR_OWNER') ||
        cleanUsers.find((u: any) => u.organization_id === d.organization_id);
      return {
        id: d.id,
        ownerEmail: owner?.email || (org?.slug === 'minglebooth-hq' ? 'admin@minglebooth.com' : 'Belum Terikat'),
        studioName: org?.name || 'Studio',
        deviceName: d.device_name || 'Operator Laptop',
        platform: d.os_type || 'mac',
        appVersion: d.app_version || '1.0.0',
        fingerprint: d.hardware_fingerprint ? d.hardware_fingerprint.substring(0, 16) + '...' : null,
        fullFingerprint: d.hardware_fingerprint || null,
        lastSeenAt: d.last_seen_at || d.activated_at,
        activatedAt: d.activated_at,
        isActive: Boolean(d.is_active),
      };
    });

    const superAdmins = (users || []).filter((u: any) => u.role === 'SUPER_ADMIN');

    return NextResponse.json({
      success: true,
      metrics: {
        totalRevenueIdr,
        testingRevenueIdr,
        totalRegisteredAccounts,
        totalLoggedInDevices,
        totalPaidCustomers,
        totalUnpaidCustomers,
        totalActiveVendors: (cleanOrgs || []).filter(
          (o: any) => o.subscription_status === 'active' || o.subscription_status === 'dev_mode'
        ).length,
        totalActiveDevices: cleanDevices.filter((d: any) => d.is_active).length,
        totalEvents: (cleanOrgs || []).reduce((sum: number, o: any) => sum + (o.events?.length || 0), 0),
        totalUsersCount: totalRegisteredAccounts,
      },
      paidCustomersList,
      unpaidCustomersList,
      customerDevicesList,
      superAdmins,
      users: cleanUsers,
      vendors: (cleanOrgs || []).map((o: any) => {
        const orgUsers = (cleanUsers || []).filter((u: any) => u.organization_id === o.id);
        const owner = orgUsers.find((u: any) => u.role === 'VENDOR_OWNER') || orgUsers[0];
        return {
          id: o.id,
          name: o.name,
          slug: o.slug,
          ownerEmail: owner?.email || null,
          ownerName: owner?.full_name || null,
          accounts: orgUsers.map((u: any) => ({
            id: u.id,
            email: u.email,
            name: u.full_name || 'Staff',
            role: u.role || 'VENDOR_STAFF',
            createdAt: u.created_at,
          })),
          devices: (o.devices || []).map((d: any) => ({
            id: d.id,
            name: d.device_name || d.deviceName || 'Laptop Operator',
            isActive: d.is_active,
            lastSeenAt: d.last_seen_at || d.updated_at,
            fingerprint: d.hardware_fingerprint ? d.hardware_fingerprint.substring(0, 12) + '...' : null,
          })),
          planTier: o.plan_tier,
          subscriptionStatus: o.subscription_status,
          subscriptionExpiresAt: o.subscription_expires_at,
          maxDevicesQuota: o.max_devices_quota,
          activeDevicesCount: o.devices?.filter((d: any) => d.is_active)?.length || 0,
          totalEventsCount: o.events?.length || 0,
          createdAt: o.created_at,
        };
      }),
      recentTransactions: (payments && payments.length > 0) ? payments : []
    });
  } catch (err: any) {
    console.error('[Admin Overview Error]:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
