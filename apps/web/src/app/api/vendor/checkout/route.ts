import { NextRequest, NextResponse } from 'next/server';
import { verifyServerAuth, corsHeaders, createSignedToken } from '@/lib/auth-server';
import { createCheckoutOrder, PlanTier, BillingInterval } from '@/lib/pricing';
import { createDokuCheckoutSession, generateDokuOrderId, getDokuConfig, getCanonicalAppUrl, HQ_ORG_ID } from '@/lib/doku';
import { getServiceSupabase } from '@/lib/supabase';
import { isPreviewDeployment, previewBlockedResponse } from '@/lib/preview-guard';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

/**
 * Vendor Checkout Order API
 * Generates an immutable server-side payment order snapshot before redirecting to Lynk.id.
 * The payable amount is strictly resolved on the server and cannot be altered by the client.
 */
export async function POST(req: NextRequest) {
  try {
    if (isPreviewDeployment()) {
      return previewBlockedResponse(
        'checkout',
        'Pembuatan order checkout dinonaktifkan pada Vercel Preview.'
      );
    }

    const auth = await verifyServerAuth(req);
    if (!auth.isValid) {
      return NextResponse.json(
        {
          error: auth.error || 'Authentication required to create checkout order.',
          code: 'AUTH_REQUIRED',
        },
        { status: 401, headers: corsHeaders }
      );
    }

    const client = getServiceSupabase();
    const cleanUserEmail = (auth.email || '').toLowerCase().trim();

    // =========================================================================
    // AUTHORITATIVE TENANT RESOLUTION
    // Strictly resolves the organization against database records.
    // NEVER trusts unverified client parameters or stale/dummy token org IDs.
    // =========================================================================
    let targetOrgId: string | null = null;
    let targetOrgName: string | null = null;
    let tokenNeedsRefresh = false;

    // 1. Super Admin / Platform Operator
    if (auth.isSuperAdmin || cleanUserEmail === 'admin@minglebooth.com' || cleanUserEmail === 'superadmin@minglebooth.com') {
      const { data: hqOrg } = await client
        .from('organizations')
        .select('id, name')
        .eq('id', HQ_ORG_ID)
        .maybeSingle();

      if (hqOrg) {
        targetOrgId = hqOrg.id;
        targetOrgName = hqOrg.name;
      } else {
        const { data: hqBySlug } = await client
          .from('organizations')
          .select('id, name')
          .eq('slug', 'minglebooth-hq')
          .maybeSingle();
        if (hqBySlug) {
          targetOrgId = hqBySlug.id;
          targetOrgName = hqBySlug.name;
        }
      }

      if (!targetOrgId) {
        throw new Error('HQ_ORGANIZATION_NOT_FOUND: MingleBooth Headquarters organization record is missing.');
      }

      if (auth.orgId !== targetOrgId) {
        tokenNeedsRefresh = true;
      }
    } else {
      // 2. Customer / Studio Vendor
      // Step A: Check if the token's orgId exists in database AND is verified for this user
      if (auth.orgId && auth.orgId !== '00000000-0000-0000-0000-000000000000') {
        const { data: tokenOrg } = await client
          .from('organizations')
          .select('id, name')
          .eq('id', auth.orgId)
          .maybeSingle();

        if (tokenOrg) {
          const { data: profile } = await client
            .from('user_profiles')
            .select('id, organization_id')
            .eq('email', cleanUserEmail)
            .maybeSingle();

          // If user profile has this organization_id (or if profile has no org yet, bind it)
          if (profile) {
            if (profile.organization_id === tokenOrg.id) {
              targetOrgId = tokenOrg.id;
              targetOrgName = tokenOrg.name;
            } else if (!profile.organization_id) {
              await client
                .from('user_profiles')
                .update({ organization_id: tokenOrg.id })
                .eq('id', profile.id);
              targetOrgId = tokenOrg.id;
              targetOrgName = tokenOrg.name;
            }
          } else {
            targetOrgId = tokenOrg.id;
            targetOrgName = tokenOrg.name;
          }
        }
      }

      // Step B: If token's orgId was missing, stale, or invalid, resolve authoritatively from user_profiles
      if (!targetOrgId && cleanUserEmail) {
        const { data: userProfile } = await client
          .from('user_profiles')
          .select('id, organization_id, full_name, role')
          .eq('email', cleanUserEmail)
          .maybeSingle();

        if (userProfile?.organization_id) {
          const { data: profileOrg } = await client
            .from('organizations')
            .select('id, name')
            .eq('id', userProfile.organization_id)
            .maybeSingle();

          if (profileOrg) {
            targetOrgId = profileOrg.id;
            targetOrgName = profileOrg.name;
            tokenNeedsRefresh = true;
          }
        }

        // Step C: If user has NO valid organization in database:
        // Automatically and safely provision an organization for this customer
        if (!targetOrgId) {
          const studioName = userProfile?.full_name || cleanUserEmail.split('@')[0] || 'Studio Vendor';
          const orgSlug = `${studioName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Math.random().toString(36).substring(2, 7)}`;
          const bodyPayload = await req.clone().json().catch(() => ({}));
          const reqPlan = ['starter', 'pro', 'business'].includes(bodyPayload.planTier) ? bodyPayload.planTier : 'pro';
          const quotaMap: Record<string, number> = { starter: 1, pro: 3, business: 10 };
          const maxDevices = quotaMap[reqPlan] || 3;

          const { data: newOrg, error: newOrgErr } = await client
            .from('organizations')
            .insert({
              name: studioName,
              slug: orgSlug,
              plan_tier: reqPlan,
              subscription_status: 'pending_payment',
              subscription_expires_at: new Date(0).toISOString(),
              max_devices_quota: maxDevices,
            })
            .select('id, name')
            .single();

          if (newOrgErr || !newOrg) {
            console.error('[Checkout Route] Failed to auto-provision organization:', newOrgErr);
            throw new Error('ORGANIZATION_PROVISION_FAILED: Gagal menyiapkan organisasi studio untuk checkout.');
          }

          targetOrgId = newOrg.id;
          targetOrgName = newOrg.name;
          tokenNeedsRefresh = true;

          // If userProfile exists, bind organization_id
          if (userProfile) {
            await client
              .from('user_profiles')
              .update({ organization_id: targetOrgId })
              .eq('id', userProfile.id);
          } else if (auth.payload?.userId) {
            try {
              await client.from('user_profiles').insert({
                id: auth.payload.userId,
                email: cleanUserEmail,
                full_name: studioName,
                role: 'VENDOR_OWNER',
                organization_id: targetOrgId,
              });
            } catch (pErr) {
              console.warn('[Checkout Route] Could not link user_profile:', pErr);
            }
          }
        }
      }
    }

    if (!targetOrgId) {
      return NextResponse.json(
        {
          error: 'ORGANIZATION_NOT_RESOLVED: Tidak dapat menemukan atau menyiapkan organisasi yang sah untuk akun Anda.',
          code: 'ORGANIZATION_NOT_FOUND',
        },
        { status: 400, headers: corsHeaders }
      );
    }

    const body = await req.json();

    const {
      planTier,
      billingInterval = 'yearly',
      customerEmail,
      paymentLinkUrl,
      organizationId: bodyOrgId,
    } = body;

    // Enforce verified tenant binding: Reject conflicting client-supplied organization ID
    if (bodyOrgId && bodyOrgId !== targetOrgId && bodyOrgId !== auth.orgId) {
      return NextResponse.json(
        {
          error: `ORGANIZATION_MISMATCH: Conflicting organization ID supplied. Checkout must be created for authenticated organization ${targetOrgId}.`,
          code: 'ORGANIZATION_MISMATCH',
        },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!['starter', 'pro', 'business'].includes(planTier)) {
      return NextResponse.json(
        {
          error: `Invalid plan tier: '${planTier}'. Supported plans: starter, pro, business.`,
          code: 'INVALID_PLAN_TIER',
        },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!['monthly', 'yearly'].includes(billingInterval)) {
      return NextResponse.json(
        {
          error: `Invalid billing interval: '${billingInterval}'. Supported intervals: monthly, yearly.`,
          code: 'INVALID_INTERVAL',
        },
        { status: 400, headers: corsHeaders }
      );
    }

    // Resolve environment-namespaced Order ID:
    // Sandbox: MB-SBX-[timestamp]-[random]
    // Production: MB-[timestamp]-[random]
    const dokuConfig = getDokuConfig();
    const namespacedOrderId = generateDokuOrderId(dokuConfig.environment);

    // Server-authoritative order snapshot creation
    const snapshot = await createCheckoutOrder({
      organizationId: targetOrgId,
      planTier: planTier as PlanTier,
      billingInterval: billingInterval as BillingInterval,
      customerEmail: customerEmail || auth.email || undefined,
      paymentLinkUrl,
      customOrderId: namespacedOrderId,
    });

    // Generate DOKU Checkout Session URL
    const dokuSession = await createDokuCheckoutSession({
      orderId: snapshot.orderId,
      amountIdr: snapshot.amountIdr,
      planName: `${planTier.toUpperCase()} (${billingInterval === 'yearly' ? 'Tahunan' : 'Bulanan'})`,
      customerEmail: customerEmail || auth.email || 'vendor@minglebooth.com',
      customerName: auth.email?.split('@')[0] || 'Studio Vendor',
      organizationId: targetOrgId,
    });

    // 1. Validate DOKU paymentUrl presence (Temuan 1)
    const rawPaymentUrl = dokuSession?.paymentUrl;
    if (!rawPaymentUrl || typeof rawPaymentUrl !== 'string' || !rawPaymentUrl.trim()) {
      console.error(
        `[Checkout Route] Missing DOKU paymentUrl for order ${snapshot.orderId} (isMock: ${Boolean(dokuSession?.isMock)})`
      );
      throw new Error('DOKU_GATEWAY_ERROR: Payment gateway did not return a valid checkout URL.');
    }

    // 2. Validate checkout URL security and origin (Temuan 2)
    let isUrlValid = false;
    try {
      const parsed = new URL(rawPaymentUrl);
      if (dokuSession.isMock) {
        // Mock URL must strictly match application canonical origin and designated mock path
        const canonicalBase = getCanonicalAppUrl();
        const canonicalParsed = new URL(canonicalBase);
        isUrlValid =
          parsed.origin === canonicalParsed.origin &&
          parsed.pathname.startsWith('/billing/result') &&
          parsed.searchParams.get('mock') === '1';
      } else {
        // Real DOKU checkout URL must be HTTPS and strictly on doku.com domain or subdomains
        isUrlValid =
          parsed.protocol === 'https:' &&
          (parsed.hostname === 'doku.com' || parsed.hostname.endsWith('.doku.com'));
      }
    } catch {
      isUrlValid = false;
    }

    if (!isUrlValid) {
      console.error(
        `[Checkout Route] Invalid DOKU paymentUrl origin/format for order ${snapshot.orderId} (isMock: ${Boolean(dokuSession.isMock)})`
      );
      throw new Error('DOKU_GATEWAY_ERROR: Invalid checkout URL format or domain returned by payment gateway.');
    }

    // 3. Persist authoritative DOKU Checkout URL into payments record (Temuan 3)
    const { data: updatedRows, error: updateErr } = await client
      .from('payments')
      .update({
        payment_link_url: rawPaymentUrl,
      })
      .eq('order_id', snapshot.orderId)
      .eq('organization_id', targetOrgId)
      .eq('payment_status', 'PENDING')
      .select('id');

    if (updateErr) {
      console.error(
        `[Checkout Route] Database error persisting paymentUrl for order ${snapshot.orderId}:`,
        updateErr.message
      );
      throw new Error(`Failed to persist payment gateway URL: ${updateErr.message}`);
    }

    if (!updatedRows || updatedRows.length === 0) {
      console.error(
        `[Checkout Route] Zero rows updated when persisting paymentUrl for order ${snapshot.orderId}`
      );
      throw new Error('Failed to update payment record: order record not found in PENDING state');
    }

    if (updatedRows.length > 1) {
      console.error(
        `[Checkout Route] Ambiguous update: multiple rows (${updatedRows.length}) matched order ${snapshot.orderId}`
      );
      throw new Error('Failed to update payment record: ambiguous multiple records updated');
    }

    // Refresh auth token if organization was resolved, provisioned, or healed
    let refreshedToken: string | undefined = undefined;
    if (tokenNeedsRefresh || targetOrgId !== auth.orgId) {
      const refreshedPayload = {
        ...auth.payload,
        orgId: targetOrgId,
        orgName: targetOrgName || auth.payload?.orgName || 'MingleBooth Studio',
        role: auth.role || auth.payload?.role || 'VENDOR_OWNER',
        issuedAt: new Date().toISOString(),
      };
      refreshedToken = createSignedToken(refreshedPayload);
    }

    return NextResponse.json(
      {
        success: true,
        order: snapshot,
        paymentUrl: dokuSession.paymentUrl,
        isMock: dokuSession.isMock,
        token: refreshedToken,
        message: 'Order created with immutable commercial terms snapshot',
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (err: any) {
    const isValidationErr =
      err.message?.includes('INVALID_') ||
      err.message?.includes('PRICE_NOT_FOUND') ||
      err.message?.includes('MISSING_') ||
      err.message?.includes('ORGANIZATION_MISMATCH');
    const status = isValidationErr ? 400 : 500;

    return NextResponse.json(
      { error: err?.message || 'Internal server error' },
      { status, headers: corsHeaders }
    );
  }
}
