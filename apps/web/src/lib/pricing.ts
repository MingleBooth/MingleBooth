import { getServiceSupabase } from '@/lib/supabase';
import crypto from 'crypto';

export type PlanTier = 'starter' | 'pro' | 'business';
export type BillingInterval = 'monthly' | 'yearly';

export interface SubscriptionPlanDef {
  id: PlanTier;
  name: string;
  planTier: PlanTier;
  description: string;
  maxDevicesQuota: number;
  isActive: boolean;
}

export interface PlanPriceDef {
  id: string;
  planId: PlanTier;
  billingInterval: BillingInterval;
  amountIdr: number;
  currency: 'IDR';
  durationDays: number;
  version: number;
  isActive: boolean;
  effectiveFrom: string;
  effectiveUntil?: string | null;
}

export interface OrderSnapshot {
  orderId: string;
  organizationId: string;
  planTier: PlanTier;
  billingInterval: BillingInterval;
  amountIdr: number;
  currency: 'IDR';
  durationDays: number;
  priceVersion: number;
  priceId?: string;
  createdAt: string;
  metadata?: Record<string, any>;
}

/**
 * Authoritative Server-Side Baseline Pricing Catalog
 * Used when database tables are pending deployment or during initial cold start.
 */
export const BASELINE_PLANS: SubscriptionPlanDef[] = [
  {
    id: 'starter',
    name: 'Starter',
    planTier: 'starter',
    description: 'Solusi lengkap untuk solo vendor photobooth atau roaming booth.',
    maxDevicesQuota: 1,
    isActive: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    planTier: 'pro',
    description: 'Pilihan paling populer untuk vendor photobooth aktif & wedding studio.',
    maxDevicesQuota: 3,
    isActive: true,
  },
  {
    id: 'business',
    name: 'Business',
    planTier: 'business',
    description: 'Untuk agensi besar dan enterprise dengan armada photobooth multi-event.',
    maxDevicesQuota: 10,
    isActive: true,
  },
];

export const BASELINE_PRICES: PlanPriceDef[] = [
  {
    id: 'price-starter-monthly',
    planId: 'starter',
    billingInterval: 'monthly',
    amountIdr: 549000,
    currency: 'IDR',
    durationDays: 30,
    version: 1,
    isActive: true,
    effectiveFrom: '2026-01-01T00:00:00Z',
  },
  {
    id: 'price-starter-yearly',
    planId: 'starter',
    billingInterval: 'yearly',
    amountIdr: 1499000,
    currency: 'IDR',
    durationDays: 365,
    version: 1,
    isActive: true,
    effectiveFrom: '2026-01-01T00:00:00Z',
  },
  {
    id: 'price-pro-monthly',
    planId: 'pro',
    billingInterval: 'monthly',
    amountIdr: 1099000,
    currency: 'IDR',
    durationDays: 30,
    version: 1,
    isActive: true,
    effectiveFrom: '2026-01-01T00:00:00Z',
  },
  {
    id: 'price-pro-yearly',
    planId: 'pro',
    billingInterval: 'yearly',
    amountIdr: 2999000,
    currency: 'IDR',
    durationDays: 365,
    version: 1,
    isActive: true,
    effectiveFrom: '2026-01-01T00:00:00Z',
  },
  {
    id: 'price-business-monthly',
    planId: 'business',
    billingInterval: 'monthly',
    amountIdr: 2199000,
    currency: 'IDR',
    durationDays: 30,
    version: 1,
    isActive: true,
    effectiveFrom: '2026-01-01T00:00:00Z',
  },
  {
    id: 'price-business-yearly',
    planId: 'business',
    billingInterval: 'yearly',
    amountIdr: 5999000,
    currency: 'IDR',
    durationDays: 365,
    version: 1,
    isActive: true,
    effectiveFrom: '2026-01-01T00:00:00Z',
  },
];

// In-memory runtime override store for dynamic price testing / fallback state
const runtimePriceOverrides = new Map<string, PlanPriceDef>();

/**
 * Retrieves all published active subscription plans and prices.
 * Queries Supabase database; gracefully falls back to trusted server baseline if tables are pending.
 */
export async function getActivePricingCatalog(): Promise<{
  plans: SubscriptionPlanDef[];
  prices: PlanPriceDef[];
  source: 'DATABASE' | 'SERVER_BASELINE';
}> {
  const client = getServiceSupabase();

  try {
    const [plansRes, pricesRes] = await Promise.all([
      client.from('subscription_plans').select('*').eq('is_active', true),
      client
        .from('plan_prices')
        .select('*')
        .eq('is_active', true)
        .order('version', { ascending: false }),
    ]);

    if (!plansRes.error && !pricesRes.error && plansRes.data && pricesRes.data.length > 0) {
      const activePlans: SubscriptionPlanDef[] = plansRes.data.map((p: any) => ({
        id: p.id,
        name: p.name,
        planTier: p.plan_tier,
        description: p.description,
        maxDevicesQuota: Number(p.max_devices_quota),
        isActive: Boolean(p.is_active),
      }));

      // Filter latest active price per (planId, billingInterval)
      const seenKey = new Set<string>();
      const activePrices: PlanPriceDef[] = [];

      for (const row of pricesRes.data) {
        const key = `${row.plan_id}:${row.billing_interval}`;
        if (!seenKey.has(key)) {
          seenKey.add(key);
          activePrices.push({
            id: row.id,
            planId: row.plan_id,
            billingInterval: row.billing_interval,
            amountIdr: Number(row.amount_idr),
            currency: 'IDR',
            durationDays: Number(row.duration_days),
            version: Number(row.version),
            isActive: Boolean(row.is_active),
            effectiveFrom: row.effective_from,
            effectiveUntil: row.effective_until,
          });
        }
      }

      return { plans: activePlans, prices: activePrices, source: 'DATABASE' };
    }
  } catch {
    // Database tables pending deployment; proceed to server baseline
  }

  // Merge server baseline with any runtime overrides
  const mergedPrices = BASELINE_PRICES.map((p) => {
    const key = `${p.planId}:${p.billingInterval}`;
    return runtimePriceOverrides.get(key) || p;
  });

  return {
    plans: BASELINE_PLANS,
    prices: mergedPrices,
    source: 'SERVER_BASELINE',
  };
}

/**
 * Resolves the authoritative active price for a specific plan tier and billing interval.
 * Rejects invalid, inactive, or unconfigured plans/intervals.
 */
export async function resolveActivePrice(
  planTier: PlanTier,
  billingInterval: BillingInterval
): Promise<PlanPriceDef> {
  if (!['starter', 'pro', 'business'].includes(planTier)) {
    throw new Error(`INVALID_PLAN_TIER: Plan ${planTier} is not a valid subscription plan`);
  }
  if (!['monthly', 'yearly'].includes(billingInterval)) {
    throw new Error(`INVALID_INTERVAL: Billing interval ${billingInterval} must be monthly or yearly`);
  }

  const { prices } = await getActivePricingCatalog();
  const price = prices.find((p) => p.planId === planTier && p.billingInterval === billingInterval && p.isActive);

  if (!price) {
    throw new Error(`PRICE_NOT_FOUND: No active price configured for plan ${planTier} (${billingInterval})`);
  }

  return price;
}

/**
 * Creates an immutable checkout order snapshot in the database.
 * The payable amount is strictly derived from the server's authoritative active price.
 */
export async function createCheckoutOrder(input: {
  organizationId: string;
  planTier: PlanTier;
  billingInterval: BillingInterval;
  customerEmail?: string;
  paymentLinkUrl?: string;
  customOrderId?: string;
}): Promise<OrderSnapshot> {
  const { organizationId, planTier, billingInterval, customerEmail, paymentLinkUrl, customOrderId } = input;

  if (!organizationId) {
    throw new Error('MISSING_ORGANIZATION: organizationId is required to create an order');
  }

  // Resolve trusted server-side price (browser is never trusted to set amount)
  const activePrice = await resolveActivePrice(planTier, billingInterval);

  const orderId = customOrderId || `MB-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const nowIso = new Date().toISOString();

  const snapshot: OrderSnapshot = {
    orderId,
    organizationId,
    planTier,
    billingInterval,
    amountIdr: activePrice.amountIdr,
    currency: 'IDR',
    durationDays: activePrice.durationDays,
    priceVersion: activePrice.version,
    priceId: activePrice.id,
    createdAt: nowIso,
    metadata: {
      customerEmail: customerEmail || null,
      planName: planTier.charAt(0).toUpperCase() + planTier.slice(1),
      maxDevices: planTier === 'business' ? 10 : planTier === 'starter' ? 1 : 3,
    },
  };

  const client = getServiceSupabase();

  // Try inserting with full snapshot columns first
  const fullInsertPayload = {
    order_id: orderId,
    organization_id: organizationId,
    plan_tier: planTier,
    amount_idr: activePrice.amountIdr,
    payment_status: 'PENDING',
    payment_link_url: paymentLinkUrl || 'https://lynk.id',
    billing_interval: billingInterval,
    currency: 'IDR',
    duration_days: activePrice.durationDays,
    price_version: activePrice.version,
    snapshot_metadata: snapshot,
    created_at: nowIso,
  };

  const { error: insertErr } = await client.from('payments').insert(fullInsertPayload);

  if (insertErr) {
    // If remote DB lacks the new columns, fall back to core schema columns
    const fallbackPayload = {
      order_id: orderId,
      organization_id: organizationId,
      plan_tier: planTier,
      amount_idr: activePrice.amountIdr,
      payment_status: 'PENDING',
      payment_link_url: paymentLinkUrl || 'https://lynk.id',
      created_at: nowIso,
    };

    const { error: fallbackErr } = await client.from('payments').insert(fallbackPayload);
    if (fallbackErr) {
      throw new Error(`Failed to persist checkout order: ${fallbackErr.message}`);
    }
  }

  runtimeOrderSnapshots.set(orderId, snapshot);
  return snapshot;
}

/**
 * Updates subscription pricing for a plan and interval (Superadmin privileged operation).
 * Archives previous price version and sets effective period.
 */
export async function updatePlanPrice(input: {
  planId: PlanTier;
  billingInterval: BillingInterval;
  newAmountIdr: number;
}): Promise<PlanPriceDef> {
  const { planId, billingInterval, newAmountIdr } = input;

  if (!['starter', 'pro', 'business'].includes(planId)) {
    throw new Error(`INVALID_PLAN_TIER: Plan ${planId} does not exist`);
  }
  if (!['monthly', 'yearly'].includes(billingInterval)) {
    throw new Error(`INVALID_INTERVAL: Interval must be monthly or yearly`);
  }
  if (typeof newAmountIdr !== 'number' || newAmountIdr <= 0 || !Number.isInteger(newAmountIdr)) {
    throw new Error('INVALID_AMOUNT: New price must be a positive integer IDR amount');
  }

  const currentPrice = await resolveActivePrice(planId, billingInterval);
  const nextVersion = (currentPrice.version || 1) + 1;
  const durationDays = billingInterval === 'monthly' ? 30 : 365;
  const nowIso = new Date().toISOString();

  const newPriceDef: PlanPriceDef = {
    id: `price-${planId}-${billingInterval}-v${nextVersion}`,
    planId,
    billingInterval,
    amountIdr: newAmountIdr,
    currency: 'IDR',
    durationDays,
    version: nextVersion,
    isActive: true,
    effectiveFrom: nowIso,
  };

  const client = getServiceSupabase();

  try {
    // Inactivate old version in database if plan_prices exists
    await client
      .from('plan_prices')
      .update({ is_active: false, effective_until: nowIso, updated_at: nowIso })
      .eq('plan_id', planId)
      .eq('billing_interval', billingInterval)
      .eq('is_active', true);

    // Insert new version
    await client.from('plan_prices').insert({
      plan_id: planId,
      billing_interval: billingInterval,
      amount_idr: newAmountIdr,
      currency: 'IDR',
      duration_days: durationDays,
      version: nextVersion,
      is_active: true,
      effective_from: nowIso,
    });
  } catch {
    // If database table is pending deployment, record in runtime override store
  }

  // Update in-memory runtime store for immediate live resolution
  runtimePriceOverrides.set(`${planId}:${billingInterval}`, newPriceDef);

  return newPriceDef;
}

// Runtime order snapshots cache for pre-registered orders
export const runtimeOrderSnapshots = new Map<string, OrderSnapshot>();

export function getOrderSnapshot(orderId: string): OrderSnapshot | undefined {
  return runtimeOrderSnapshots.get(orderId);
}

/**
 * Validates an incoming payment transaction against its trusted order snapshot.
 * Eliminates all hardcoded price thresholds (`amount < 1400000`).
 */
export function validateOrderAgainstSnapshot(
  existingPayment: {
    order_id: string;
    organization_id?: string | null;
    plan_tier: string;
    amount_idr: number | string;
    duration_days?: number | null;
    billing_interval?: string | null;
  },
  incoming: {
    amountIdr: number;
    planTier: string;
    durationDays: number;
    organizationId?: string | null;
  }
): void {
  // 1. Organization binding check
  if (
    existingPayment.organization_id &&
    incoming.organizationId &&
    incoming.organizationId !== existingPayment.organization_id
  ) {
    throw new Error(
      `ORGANIZATION_MISMATCH: Order ${existingPayment.order_id} is bound to ${existingPayment.organization_id} but requested ${incoming.organizationId}`
    );
  }

  // 2. Plan tier match check
  if (existingPayment.plan_tier && existingPayment.plan_tier !== incoming.planTier) {
    throw new Error(
      `PLAN_MISMATCH: Order ${existingPayment.order_id} is pre-registered for ${existingPayment.plan_tier} plan but requested ${incoming.planTier}`
    );
  }

  // 3. Exact amount check (Integer IDR)
  const expectedAmount = Number(existingPayment.amount_idr);
  if (incoming.amountIdr < expectedAmount) {
    throw new Error(
      `PAYMENT_AMOUNT_INSUFFICIENT: Received ${incoming.amountIdr} IDR, expected ${expectedAmount} IDR`
    );
  }
  if (incoming.amountIdr > expectedAmount) {
    throw new Error(
      `PAYMENT_AMOUNT_MISMATCH: Received ${incoming.amountIdr} IDR, expected ${expectedAmount} IDR`
    );
  }

  // 4. Duration match against trusted order snapshot (No brittle price thresholds!)
  const snapshot = runtimeOrderSnapshots.get(existingPayment.order_id);
  const effectiveDuration = existingPayment.duration_days ?? snapshot?.durationDays;
  const effectiveInterval = existingPayment.billing_interval ?? snapshot?.billingInterval;

  if (effectiveDuration && incoming.durationDays !== Number(effectiveDuration)) {
    throw new Error(
      `INVALID_DURATION: Order ${existingPayment.order_id} is configured for ${effectiveDuration} days, cannot settle with ${incoming.durationDays} days`
    );
  }

  let resolvedInterval = effectiveInterval;
  if (!resolvedInterval && existingPayment.plan_tier && existingPayment.amount_idr) {
    const matchedPrice = BASELINE_PRICES.find(
      (p) => p.planId === existingPayment.plan_tier && p.amountIdr === Number(existingPayment.amount_idr)
    );
    if (matchedPrice) {
      resolvedInterval = matchedPrice.billingInterval;
    }
  }

  if (resolvedInterval) {
    if (resolvedInterval === 'monthly' && incoming.durationDays !== 30) {
      throw new Error(
        `INVALID_DURATION: Monthly order cannot be settled with ${incoming.durationDays} days duration`
      );
    }
    if (resolvedInterval === 'yearly' && incoming.durationDays !== 365) {
      throw new Error(
        `INVALID_DURATION: Yearly order cannot be settled with ${incoming.durationDays} days duration`
      );
    }
  }
}
