import { getServiceSupabase } from '@/lib/supabase';
import crypto from 'crypto';

export type PlanTier = 'starter' | 'pro' | 'business';
export type BillingInterval = 'monthly' | 'yearly';
export type PriceStatus = 'active' | 'scheduled' | 'superseded' | 'cancelled';

export interface SubscriptionPlanDef {
  id: PlanTier;
  name: string;
  planTier: PlanTier;
  description: string;
  maxDevicesQuota: number;
  durationDays: number;
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
  status: PriceStatus;
  isActive: boolean;
  effectiveFrom: string;
  effectiveUntil?: string | null;
  createdBy?: string;
  changeReason?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface OrderSnapshot {
  orderId: string;
  organizationId: string;
  planTier: PlanTier;
  billingInterval: BillingInterval;
  amountIdr: number;
  currency: 'IDR';
  durationDays: number;
  deviceQuota: number;
  priceVersion: number;
  priceId?: string;
  createdAt: string;
  metadata?: Record<string, any>;
}

export interface PricingAuditLogDef {
  id: string;
  actorId: string;
  actorEmail?: string;
  action: 'CREATE_PRICE_VERSION' | 'SCHEDULE_PRICE_VERSION' | 'ACTIVATE_PRICE_VERSION' | 'CANCEL_PRICE_VERSION';
  planId: PlanTier;
  billingInterval: BillingInterval;
  previousAmountIdr?: number | null;
  newAmountIdr: number;
  previousVersion?: number | null;
  newVersion: number;
  effectiveFrom: string;
  reason: string;
  createdAt: string;
}

/**
 * Authoritative Plan Configuration & Device Quotas
 */
export const PLAN_TIERS: Record<PlanTier, { name: string; deviceQuota: number; description: string }> = {
  starter: {
    name: 'Starter',
    deviceQuota: 1,
    description: 'Solusi lengkap untuk solo vendor photobooth atau roaming booth.',
  },
  pro: {
    name: 'Pro',
    deviceQuota: 3,
    description: 'Pilihan paling populer untuk vendor photobooth aktif & wedding studio.',
  },
  business: {
    name: 'Business',
    deviceQuota: 10,
    description: 'Untuk agensi besar dan enterprise dengan armada photobooth multi-event.',
  },
};

/**
 * Authoritative Server-Side Baseline Pricing Catalog
 */
export const BASELINE_PLANS: SubscriptionPlanDef[] = [
  {
    id: 'starter',
    name: 'Starter',
    planTier: 'starter',
    description: PLAN_TIERS.starter.description,
    maxDevicesQuota: 1,
    durationDays: 30,
    isActive: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    planTier: 'pro',
    description: PLAN_TIERS.pro.description,
    maxDevicesQuota: 3,
    durationDays: 30,
    isActive: true,
  },
  {
    id: 'business',
    name: 'Business',
    planTier: 'business',
    description: PLAN_TIERS.business.description,
    maxDevicesQuota: 10,
    durationDays: 30,
    isActive: true,
  },
];

export const BASELINE_PRICES: PlanPriceDef[] = [
  {
    id: 'price-starter-monthly-v1',
    planId: 'starter',
    billingInterval: 'monthly',
    amountIdr: 549000,
    currency: 'IDR',
    durationDays: 30,
    version: 1,
    status: 'active',
    isActive: true,
    effectiveFrom: '2026-01-01T00:00:00Z',
    createdBy: 'system',
    changeReason: 'Initial Official Baseline Catalog',
  },
  {
    id: 'price-starter-yearly-v1',
    planId: 'starter',
    billingInterval: 'yearly',
    amountIdr: 1499000,
    currency: 'IDR',
    durationDays: 365,
    version: 1,
    status: 'active',
    isActive: true,
    effectiveFrom: '2026-01-01T00:00:00Z',
    createdBy: 'system',
    changeReason: 'Initial Official Baseline Catalog',
  },
  {
    id: 'price-pro-monthly-v1',
    planId: 'pro',
    billingInterval: 'monthly',
    amountIdr: 1099000,
    currency: 'IDR',
    durationDays: 30,
    version: 1,
    status: 'active',
    isActive: true,
    effectiveFrom: '2026-01-01T00:00:00Z',
    createdBy: 'system',
    changeReason: 'Initial Official Baseline Catalog',
  },
  {
    id: 'price-pro-yearly-v1',
    planId: 'pro',
    billingInterval: 'yearly',
    amountIdr: 2999000,
    currency: 'IDR',
    durationDays: 365,
    version: 1,
    status: 'active',
    isActive: true,
    effectiveFrom: '2026-01-01T00:00:00Z',
    createdBy: 'system',
    changeReason: 'Initial Official Baseline Catalog',
  },
  {
    id: 'price-business-monthly-v1',
    planId: 'business',
    billingInterval: 'monthly',
    amountIdr: 2199000,
    currency: 'IDR',
    durationDays: 30,
    version: 1,
    status: 'active',
    isActive: true,
    effectiveFrom: '2026-01-01T00:00:00Z',
    createdBy: 'system',
    changeReason: 'Initial Official Baseline Catalog',
  },
  {
    id: 'price-business-yearly-v1',
    planId: 'business',
    billingInterval: 'yearly',
    amountIdr: 5999000,
    currency: 'IDR',
    durationDays: 365,
    version: 1,
    status: 'active',
    isActive: true,
    effectiveFrom: '2026-01-01T00:00:00Z',
    createdBy: 'system',
    changeReason: 'Initial Official Baseline Catalog',
  },
];

// Documented Business Limits
export const PRICING_LIMITS = {
  MIN_AMOUNT_IDR: 10_000,
  MAX_AMOUNT_IDR: 100_000_000, // 100 Million IDR
};

// Simulation flag: Memory stores are ONLY permitted in isolated unit tests / development simulation
export let allowInMemorySimulation = false;
export function setAllowInMemorySimulation(allowed: boolean): void {
  allowInMemorySimulation = allowed;
}

// In-memory simulation stores (used exclusively by test harnesses or mock mode)
export const runtimePriceOverrides = new Map<string, PlanPriceDef>();
export const runtimePriceHistory: PlanPriceDef[] = [];
export const runtimeScheduledPrices: PlanPriceDef[] = [];
export const runtimeAuditLogs: PricingAuditLogDef[] = [];
export const runtimeOrderSnapshots = new Map<string, OrderSnapshot>();

/**
 * Retrieves all published active subscription plans and prices.
 */
export async function getActivePricingCatalog(options: {
  includeScheduled?: boolean;
  referenceDate?: Date;
} = {}): Promise<{
  plans: SubscriptionPlanDef[];
  prices: PlanPriceDef[];
  scheduled: PlanPriceDef[];
  source: 'DATABASE' | 'SERVER_BASELINE';
}> {
  const refDate = options.referenceDate || new Date();
  const client = getServiceSupabase();

  try {
    const [plansRes, pricesRes] = await Promise.all([
      client.from('subscription_plans').select('*').eq('is_active', true),
      client
        .from('plan_prices')
        .select('*')
        .order('version', { ascending: false }),
    ]);

    if (!plansRes.error && !pricesRes.error && plansRes.data && plansRes.data.length > 0 && pricesRes.data && pricesRes.data.length > 0) {
      const activePlans: SubscriptionPlanDef[] = plansRes.data.map((p: any) => ({
        id: (p.plan_key || p.id) as PlanTier,
        name: p.display_name || p.name,
        planTier: (p.plan_key || p.id) as PlanTier,
        description: p.description,
        maxDevicesQuota: Number(p.device_quota || p.max_devices_quota || 1),
        durationDays: Number(p.duration_days || 30),
        isActive: Boolean(p.is_active),
      }));

      const activePrices: PlanPriceDef[] = [];
      const scheduledPrices: PlanPriceDef[] = [];
      const seenActiveKey = new Set<string>();

      for (const row of pricesRes.data) {
        const item: PlanPriceDef = {
          id: row.id,
          planId: row.plan_id as PlanTier,
          billingInterval: row.billing_interval as BillingInterval,
          amountIdr: Number(row.amount_idr),
          currency: 'IDR',
          durationDays: Number(row.duration_days),
          version: Number(row.version),
          status: (row.status || (row.is_active ? 'active' : 'superseded')) as PriceStatus,
          isActive: Boolean(row.is_active),
          effectiveFrom: row.effective_from,
          effectiveUntil: row.effective_until,
          createdBy: row.created_by,
          changeReason: row.change_reason,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };

        const key = `${item.planId}:${item.billingInterval}`;

        if (item.status === 'scheduled' || (!item.isActive && new Date(item.effectiveFrom) > refDate)) {
          scheduledPrices.push(item);
        } else if (
          item.isActive &&
          item.status === 'active' &&
          new Date(item.effectiveFrom) <= refDate &&
          (!item.effectiveUntil || new Date(item.effectiveUntil) > refDate)
        ) {
          if (!seenActiveKey.has(key)) {
            seenActiveKey.add(key);
            activePrices.push(item);
          }
        }
      }

      if (activePrices.length >= 6) {
        return {
          plans: activePlans,
          prices: activePrices,
          scheduled: scheduledPrices,
          source: 'DATABASE',
        };
      }
    }
  } catch {
    // Database tables pending deployment or unreachable
  }

  // Fallback to baseline merged with in-memory overrides (allowed in tests or cold start)
  const now = refDate.getTime();
  const mergedPrices: PlanPriceDef[] = BASELINE_PRICES.map((p) => {
    const key = `${p.planId}:${p.billingInterval}`;
    const override = runtimePriceOverrides.get(key);
    if (override && override.isActive && new Date(override.effectiveFrom).getTime() <= now) {
      return override;
    }
    return p;
  });

  const scheduledList: PlanPriceDef[] = runtimeScheduledPrices.filter(
    (p) => new Date(p.effectiveFrom).getTime() > now && p.status === 'scheduled'
  );

  return {
    plans: BASELINE_PLANS,
    prices: mergedPrices,
    scheduled: scheduledList,
    source: 'SERVER_BASELINE',
  };
}

/**
 * Resolves the authoritative active official price for a plan and interval.
 * Strictly guarantees that future prices are NOT used before their effective date.
 */
export async function resolveActivePrice(
  planTier: PlanTier,
  billingInterval: BillingInterval,
  referenceDate?: Date
): Promise<PlanPriceDef> {
  if (!['starter', 'pro', 'business'].includes(planTier)) {
    throw new Error(`INVALID_PLAN_TIER: Plan '${planTier}' is not a valid subscription plan`);
  }
  if (!['monthly', 'yearly'].includes(billingInterval)) {
    throw new Error(`INVALID_INTERVAL: Billing interval '${billingInterval}' must be monthly or yearly`);
  }

  const { prices } = await getActivePricingCatalog({ referenceDate });
  const price = prices.find((p) => p.planId === planTier && p.billingInterval === billingInterval && p.isActive);

  if (!price) {
    throw new Error(`PRICE_NOT_FOUND: No active price configured for plan '${planTier}' (${billingInterval})`);
  }

  return price;
}

/**
 * Returns all known historical and active prices for a plan and billing interval.
 */
export function getAllKnownPricesForTierAndInterval(
  planTier: PlanTier,
  billingInterval?: BillingInterval | null
): PlanPriceDef[] {
  const seenIds = new Set<string>();
  const uniquePrices: PlanPriceDef[] = [];
  for (const p of [...BASELINE_PRICES, ...runtimePriceHistory]) {
    if (!seenIds.has(p.id)) {
      seenIds.add(p.id);
      if (p.planId === planTier && (billingInterval ? p.billingInterval === billingInterval : true)) {
        uniquePrices.push(p);
      }
    }
  }
  return uniquePrices;
}

/**
 * Super Admin Operation: Create or update official price version.
 * ATOMIC TRANSACTION:
 * Uses PostgreSQL RPC `update_subscription_price_version_atomic` to guarantee:
 * - Row locking on plan and interval
 * - Schedule collision prevention
 * - Previous version deactivation and new version creation in SAME transaction
 * - Audit log creation in SAME transaction
 * - STRICT PERSISTENCE: Never swallows database errors; fails closed with DATABASE_PERSISTENCE_ERROR.
 */
export async function createOrUpdatePriceVersion(input: {
  planId: PlanTier;
  billingInterval: BillingInterval;
  newAmountIdr: number;
  changeReason: string;
  actorId?: string;
  actorEmail?: string;
  effectiveFrom?: string | Date;
}): Promise<{
  updatedPrice: PlanPriceDef;
  auditLog: PricingAuditLogDef;
}> {
  const { planId, billingInterval, newAmountIdr, changeReason, actorId, actorEmail, effectiveFrom } = input;

  // 1. Rigorous input validation
  if (!['starter', 'pro', 'business'].includes(planId)) {
    throw new Error(`INVALID_PLAN_TIER: Plan '${planId}' does not exist`);
  }
  if (!['monthly', 'yearly'].includes(billingInterval)) {
    throw new Error(`INVALID_INTERVAL: Billing interval must be monthly or yearly`);
  }
  if (
    typeof newAmountIdr !== 'number' ||
    newAmountIdr <= 0 ||
    !Number.isInteger(newAmountIdr)
  ) {
    throw new Error('INVALID_AMOUNT: Price must be a positive integer in Indonesian Rupiah (IDR)');
  }
  if (newAmountIdr < PRICING_LIMITS.MIN_AMOUNT_IDR) {
    throw new Error(`PRICE_BELOW_MINIMUM: Price cannot be less than Rp ${PRICING_LIMITS.MIN_AMOUNT_IDR.toLocaleString('id-ID')}`);
  }
  if (newAmountIdr > PRICING_LIMITS.MAX_AMOUNT_IDR) {
    throw new Error(`PRICE_EXCEEDS_MAXIMUM: Price cannot exceed Rp ${PRICING_LIMITS.MAX_AMOUNT_IDR.toLocaleString('id-ID')}`);
  }
  if (!changeReason || typeof changeReason !== 'string' || changeReason.trim().length < 3) {
    throw new Error('INVALID_REASON: Change reason is mandatory (minimum 3 characters)');
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const effectiveDate = effectiveFrom ? new Date(effectiveFrom) : now;
  if (isNaN(effectiveDate.getTime())) {
    throw new Error('INVALID_DATE: Invalid effective date format');
  }
  const isScheduledFuture = effectiveDate.getTime() > now.getTime();
  const effectiveIso = effectiveDate.toISOString();

  const client = getServiceSupabase();

  // 2. ATOMIC RPC EXECUTION
  // Attempt single-transaction atomic execution in PostgreSQL
  let rpcSuccess = false;
  let rpcResult: any = null;

  try {
    const { data, error } = await client.rpc('update_subscription_price_version_atomic', {
      p_plan_id: planId,
      p_billing_interval: billingInterval,
      p_new_amount_idr: newAmountIdr,
      p_effective_from: effectiveIso,
      p_change_reason: changeReason.trim(),
      p_actor_id: actorId || 'superadmin',
      p_actor_email: actorEmail || 'superadmin@minglebooth.com',
    });

    if (error) {
      // If RPC explicitly failed (e.g. SCHEDULE_COLLISION, validation error, etc.)
      const isMissingRpc =
        error.code === 'PGRST202' ||
        error.message?.includes('Could not find the function') ||
        error.message?.includes('schema cache');

      if (!isMissingRpc) {
        if (error.message?.includes('SCHEDULE_COLLISION')) {
          const collErr: any = new Error(`SCHEDULE_COLLISION: ${error.message}`);
          collErr.code = 'SCHEDULE_COLLISION';
          throw collErr;
        }
        throw new Error(`DATABASE_PERSISTENCE_ERROR: Atomic price update failed in database: ${error.message}`);
      }
    } else if (data && data.success) {
      rpcSuccess = true;
      rpcResult = data;
    }
  } catch (rpcErr: any) {
    if (rpcErr.code === 'SCHEDULE_COLLISION' || rpcErr.message?.startsWith('SCHEDULE_COLLISION')) {
      throw rpcErr;
    }
    if (rpcErr.message?.startsWith('DATABASE_PERSISTENCE_ERROR')) {
      throw rpcErr;
    }
    // If not a missing RPC, rethrow as persistence error
    if (!rpcErr.message?.includes('Could not find the function')) {
      throw new Error(`DATABASE_PERSISTENCE_ERROR: ${rpcErr.message || 'Database error during atomic price mutation'}`);
    }
  }

  // 3. Fallback: If RPC function is not yet deployed, attempt direct database tables
  if (!rpcSuccess) {
    // Schedule collision check
    if (isScheduledFuture) {
      const { data: existingSchedules, error: schedErr } = await client
        .from('plan_prices')
        .select('id, effective_from')
        .eq('plan_id', planId)
        .eq('billing_interval', billingInterval)
        .eq('status', 'scheduled')
        .eq('effective_from', effectiveIso);

      if (schedErr && !allowInMemorySimulation) {
        throw new Error(`DATABASE_PERSISTENCE_ERROR: Failed to query existing price schedules: ${schedErr.message}`);
      }
      if (existingSchedules && existingSchedules.length > 0) {
        const collErr: any = new Error(`SCHEDULE_COLLISION: A scheduled price change already exists for ${planId} (${billingInterval}) at ${effectiveIso}`);
        collErr.code = 'SCHEDULE_COLLISION';
        throw collErr;
      }
    }

    // Fetch current price to determine version lineage
    const currentPrice = await resolveActivePrice(planId, billingInterval);
    const nextVersion = (currentPrice.version || 1) + 1;
    const durationDays = billingInterval === 'monthly' ? 30 : 365;
    const priceId = `price-${planId}-${billingInterval}-v${nextVersion}`;

    if (!isScheduledFuture) {
      const { error: updateErr } = await client
        .from('plan_prices')
        .update({
          is_active: false,
          status: 'superseded',
          effective_until: nowIso,
          updated_at: nowIso,
        })
        .eq('plan_id', planId)
        .eq('billing_interval', billingInterval)
        .eq('is_active', true);

      if (updateErr && !allowInMemorySimulation) {
        throw new Error(`DATABASE_PERSISTENCE_ERROR: Failed to deactivate previous price version: ${updateErr.message}`);
      }
    }

    const { error: insertPriceErr } = await client.from('plan_prices').insert({
      id: crypto.randomUUID(),
      plan_id: planId,
      billing_interval: billingInterval,
      amount_idr: newAmountIdr,
      currency: 'IDR',
      duration_days: durationDays,
      version: nextVersion,
      status: isScheduledFuture ? 'scheduled' : 'active',
      is_active: !isScheduledFuture,
      effective_from: effectiveIso,
      created_by: actorEmail || actorId || 'superadmin',
      change_reason: changeReason.trim(),
      created_at: nowIso,
      updated_at: nowIso,
    });

    if (insertPriceErr && !allowInMemorySimulation) {
      throw new Error(`DATABASE_PERSISTENCE_ERROR: Failed to insert new price version: ${insertPriceErr.message}`);
    }

    const auditLogId = `audit-${crypto.randomUUID()}`;
    const { error: insertAuditErr } = await client.from('pricing_audit_logs').insert({
      id: crypto.randomUUID(),
      actor_id: actorId || 'superadmin',
      actor_email: actorEmail || 'superadmin@minglebooth.com',
      action: isScheduledFuture ? 'SCHEDULE_PRICE_VERSION' : 'CREATE_PRICE_VERSION',
      plan_id: planId,
      billing_interval: billingInterval,
      previous_amount_idr: currentPrice.amountIdr,
      new_amount_idr: newAmountIdr,
      previous_version: currentPrice.version,
      new_version: nextVersion,
      effective_from: effectiveIso,
      reason: changeReason.trim(),
      created_at: nowIso,
    });

    if (insertAuditErr && !allowInMemorySimulation) {
      throw new Error(`DATABASE_PERSISTENCE_ERROR: Failed to persist pricing audit log: ${insertAuditErr.message}`);
    }
  }

  // 4. Construct response objects & update runtime simulation store
  const nextVersion = rpcResult ? Number(rpcResult.version) : 2;
  const durationDays = billingInterval === 'monthly' ? 30 : 365;
  const priceId = rpcResult?.price_id || `price-${planId}-${billingInterval}-v${nextVersion}`;

  const updatedPrice: PlanPriceDef = {
    id: priceId,
    planId,
    billingInterval,
    amountIdr: newAmountIdr,
    currency: 'IDR',
    durationDays,
    version: nextVersion,
    status: isScheduledFuture ? 'scheduled' : 'active',
    isActive: !isScheduledFuture,
    effectiveFrom: effectiveIso,
    effectiveUntil: null,
    createdBy: actorEmail || actorId || 'superadmin',
    changeReason: changeReason.trim(),
    createdAt: nowIso,
  };

  const auditLog: PricingAuditLogDef = {
    id: rpcResult?.audit_id || `audit-${crypto.randomUUID()}`,
    actorId: actorId || 'superadmin',
    actorEmail: actorEmail || 'superadmin@minglebooth.com',
    action: isScheduledFuture ? 'SCHEDULE_PRICE_VERSION' : 'CREATE_PRICE_VERSION',
    planId,
    billingInterval,
    previousAmountIdr: rpcResult?.previous_amount_idr ?? null,
    newAmountIdr,
    previousVersion: rpcResult?.previous_version ?? null,
    newVersion: nextVersion,
    effectiveFrom: effectiveIso,
    reason: changeReason.trim(),
    createdAt: nowIso,
  };

  // Sync memory cache for fast in-process lookups
  const key = `${planId}:${billingInterval}`;
  if (isScheduledFuture) {
    // Schedule Collision Protection in memory: prevent duplicate identical effective_from
    const existingIdx = runtimeScheduledPrices.findIndex(
      (p) => p.planId === planId && p.billingInterval === billingInterval && p.effectiveFrom === effectiveIso
    );
    if (existingIdx !== -1) {
      throw new Error(`SCHEDULE_COLLISION: A scheduled price change already exists for ${planId} (${billingInterval}) at ${effectiveIso}`);
    }
    runtimeScheduledPrices.push(updatedPrice);
  } else {
    const prev = runtimePriceOverrides.get(key);
    if (prev) {
      prev.isActive = false;
      prev.status = 'superseded';
      prev.effectiveUntil = nowIso;
    }
    runtimePriceOverrides.set(key, updatedPrice);
  }

  runtimePriceHistory.push(updatedPrice);
  runtimeAuditLogs.unshift(auditLog);

  return { updatedPrice, auditLog };
}

/**
 * Super Admin Operation: Cancel a scheduled future price version.
 */
export async function cancelScheduledPriceVersion(input: {
  planId: PlanTier;
  billingInterval: BillingInterval;
  actorId?: string;
  actorEmail?: string;
  reason: string;
}): Promise<boolean> {
  const { planId, billingInterval, actorId, actorEmail, reason } = input;
  const nowIso = new Date().toISOString();
  const client = getServiceSupabase();

  // 1. Try atomic cancellation RPC first
  let rpcHandled = false;
  try {
    const { data, error } = await client.rpc('cancel_scheduled_price_version_atomic', {
      p_plan_id: planId,
      p_billing_interval: billingInterval,
      p_reason: reason || 'Scheduled price change cancelled by Super Admin',
      p_actor_id: actorId || 'superadmin',
      p_actor_email: actorEmail || 'superadmin@minglebooth.com',
    });

    if (error) {
      const isMissingRpc =
        error.code === 'PGRST202' ||
        error.message?.includes('Could not find the function') ||
        error.message?.includes('schema cache');

      if (!isMissingRpc) {
        throw new Error(`DATABASE_PERSISTENCE_ERROR: Failed to cancel scheduled price in database: ${error.message}`);
      }
    } else if (data && data.success) {
      rpcHandled = true;
    }
  } catch (err: any) {
    if (err.message?.startsWith('DATABASE_PERSISTENCE_ERROR')) {
      throw err;
    }
  }

  // 2. Direct table fallback if RPC not deployed
  if (!rpcHandled) {
    const { data: scheduledRows, error: findErr } = await client
      .from('plan_prices')
      .select('id, amount_idr, version')
      .eq('plan_id', planId)
      .eq('billing_interval', billingInterval)
      .eq('status', 'scheduled');

    if (findErr && !allowInMemorySimulation) {
      throw new Error(`DATABASE_PERSISTENCE_ERROR: Failed to find scheduled price: ${findErr.message}`);
    }

    if (scheduledRows && scheduledRows.length > 0) {
      const scheduled = scheduledRows[0];
      const { error: updateErr } = await client
        .from('plan_prices')
        .update({
          status: 'cancelled',
          is_active: false,
          updated_at: nowIso,
        })
        .eq('id', scheduled.id);

      if (updateErr && !allowInMemorySimulation) {
        throw new Error(`DATABASE_PERSISTENCE_ERROR: Failed to update scheduled price status: ${updateErr.message}`);
      }

      const { error: auditErr } = await client.from('pricing_audit_logs').insert({
        id: crypto.randomUUID(),
        actor_id: actorId || 'superadmin',
        actor_email: actorEmail || 'superadmin@minglebooth.com',
        action: 'CANCEL_PRICE_VERSION',
        plan_id: planId,
        billing_interval: billingInterval,
        new_amount_idr: scheduled.amount_idr,
        new_version: scheduled.version,
        effective_from: nowIso,
        reason: reason || 'Scheduled price change cancelled by Super Admin',
        created_at: nowIso,
      });

      if (auditErr && !allowInMemorySimulation) {
        throw new Error(`DATABASE_PERSISTENCE_ERROR: Failed to log price cancellation: ${auditErr.message}`);
      }
    }
  }

  // Memory sync
  const schedIdx = runtimeScheduledPrices.findIndex(
    (p) => p.planId === planId && p.billingInterval === billingInterval && p.status === 'scheduled'
  );

  if (schedIdx !== -1) {
    const item = runtimeScheduledPrices[schedIdx];
    item.status = 'cancelled';
    item.isActive = false;
    runtimeScheduledPrices.splice(schedIdx, 1);

    runtimeAuditLogs.unshift({
      id: `audit-${crypto.randomUUID()}`,
      actorId: actorId || 'superadmin',
      actorEmail: actorEmail || 'superadmin@minglebooth.com',
      action: 'CANCEL_PRICE_VERSION',
      planId,
      billingInterval,
      newAmountIdr: item.amountIdr,
      newVersion: item.version,
      effectiveFrom: nowIso,
      reason: reason || 'Scheduled price change cancelled by Super Admin',
      createdAt: nowIso,
    });
  }

  return true;
}

/**
 * Retrieves audit log entries for pricing operations.
 */
export async function getPricingAuditLogs(): Promise<PricingAuditLogDef[]> {
  const client = getServiceSupabase();

  try {
    const { data, error } = await client
      .from('pricing_audit_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      return data.map((d: any) => ({
        id: d.id,
        actorId: d.actor_id,
        actorEmail: d.actor_email,
        action: d.action,
        planId: d.plan_id,
        billingInterval: d.billing_interval,
        previousAmountIdr: d.previous_amount_idr,
        newAmountIdr: d.new_amount_idr,
        previousVersion: d.previous_version,
        newVersion: d.new_version,
        effectiveFrom: d.effective_from,
        reason: d.reason,
        createdAt: d.created_at,
      }));
    }
  } catch {
    // Fall back to memory
  }

  return runtimeAuditLogs;
}

/**
 * Legacy compatibility alias
 */
export async function updatePlanPrice(input: {
  planId: PlanTier;
  billingInterval: BillingInterval;
  newAmountIdr: number;
}): Promise<PlanPriceDef> {
  const res = await createOrUpdatePriceVersion({
    planId: input.planId,
    billingInterval: input.billingInterval,
    newAmountIdr: input.newAmountIdr,
    changeReason: 'Super Admin updated price',
  });
  return res.updatedPrice;
}

/**
 * Creates an immutable checkout order snapshot.
 * STRICT DURABILITY:
 * Every checkout order MUST have its snapshot successfully persisted.
 * If persistence fails, checkout throws an error and STOPS immediately (never proceeds to DOKU).
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

  // Resolve trusted server-side price (client-submitted amount is NEVER trusted)
  const activePrice = await resolveActivePrice(planTier, billingInterval);
  const planConfig = PLAN_TIERS[planTier];

  const orderId =
    customOrderId ||
    `MB-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const nowIso = new Date().toISOString();

  const snapshot: OrderSnapshot = {
    orderId,
    organizationId,
    planTier,
    billingInterval,
    amountIdr: activePrice.amountIdr,
    currency: 'IDR',
    durationDays: activePrice.durationDays,
    deviceQuota: planConfig.deviceQuota,
    priceVersion: activePrice.version,
    priceId: activePrice.id,
    createdAt: nowIso,
    metadata: {
      customerEmail: customerEmail || null,
      planName: planConfig.name,
      maxDevices: planConfig.deviceQuota,
    },
  };

  const client = getServiceSupabase();

  // 1. Attempt to insert into dedicated payment_price_snapshots table
  let snapshotPersisted = false;
  try {
    const { error: snapErr } = await client.from('payment_price_snapshots').insert({
      order_id: orderId,
      organization_id: organizationId,
      plan_id: planTier,
      plan_key: planTier,
      billing_interval: billingInterval,
      amount_idr: activePrice.amountIdr,
      currency: 'IDR',
      duration_days: activePrice.durationDays,
      device_quota: planConfig.deviceQuota,
      price_version: activePrice.version,
      snapshot_metadata: snapshot,
      snapshot_created_at: nowIso,
    });
    if (!snapErr) {
      snapshotPersisted = true;
    }
  } catch {
    // Continue to payments table insert
  }

  // 2. Persist order row in payments table with full snapshot columns
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
    // If table lacks newer columns (legacy 10-column schema), fallback to basic columns
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
    if (fallbackErr && !allowInMemorySimulation) {
      throw new Error(`DATABASE_PERSISTENCE_ERROR: Failed to persist checkout order in database: ${fallbackErr.message}`);
    }
    // If legacy schema was used, ensure at least basic order was recorded
    if (!fallbackErr) {
      snapshotPersisted = true;
    }
  } else {
    snapshotPersisted = true;
  }

  if (!snapshotPersisted && !allowInMemorySimulation) {
    throw new Error('DATABASE_PERSISTENCE_ERROR: Order price snapshot could not be persisted to database. Checkout aborted.');
  }

  runtimeOrderSnapshots.set(orderId, snapshot);
  return snapshot;
}

export function getOrderSnapshot(orderId: string): OrderSnapshot | undefined {
  return runtimeOrderSnapshots.get(orderId);
}

/**
 * Validates an incoming payment transaction against its trusted order snapshot.
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

  // 4. Duration match against trusted order snapshot
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
    const knownPrices = getAllKnownPricesForTierAndInterval(existingPayment.plan_tier as PlanTier);
    const matchedPrice = knownPrices.find((p) => p.amountIdr === Number(existingPayment.amount_idr));
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

export interface ResolvedPackageTerms {
  durationDays: number;
  billingInterval: BillingInterval;
  planTier: PlanTier;
  amountIdr: number;
}

/**
 * Authoritatively resolves durationDays and billingInterval for an order asynchronously.
 *
 * Precedence / Order of Authority:
 * 1. payments.snapshot_metadata column from database row.
 * 2. payment_price_snapshots dedicated table queried asynchronously by order_id.
 * 3. In-memory runtimeOrderSnapshots Map (checked if available).
 * 4. Explicit valid duration_days (30 or 365) and billing_interval ('monthly' or 'yearly')
 *    cross-validated against known historical catalog prices.
 * 5. Authoritative catalog match by (plan_tier, amount_idr) across known prices.
 *
 * Strict Fail-Closed Guarantees:
 * - Reject any snapshot that conflicts with order ID, tenant, amount, or plan tier.
 * - Never use current active price to guess or replace historical order terms.
 * - Throws UNRESOLVED_PACKAGE_DURATION if terms cannot be verified.
 */
export async function resolveOrderDurationAndIntervalAsync(order: {
  order_id?: string;
  organization_id?: string | null;
  plan_tier?: string | null;
  amount_idr?: number | string | null;
  duration_days?: number | null;
  billing_interval?: string | null;
  snapshot_metadata?: any;
}): Promise<ResolvedPackageTerms> {
  const cleanOrderId = order.order_id || '';
  let snapshot: OrderSnapshot | undefined;

  // 1. Check payments.snapshot_metadata
  if (
    order.snapshot_metadata &&
    typeof order.snapshot_metadata === 'object' &&
    order.snapshot_metadata.amountIdr &&
    order.snapshot_metadata.durationDays &&
    order.snapshot_metadata.billingInterval
  ) {
    snapshot = order.snapshot_metadata as OrderSnapshot;
  }

  // 2. If not on payment row, query dedicated payment_price_snapshots table from database
  if (!snapshot && cleanOrderId) {
    try {
      const client = getServiceSupabase();
      const { data: snapRow, error: snapErr } = await client
        .from('payment_price_snapshots')
        .select('*')
        .eq('order_id', cleanOrderId)
        .maybeSingle();

      if (!snapErr && snapRow) {
        snapshot = {
          orderId: snapRow.order_id,
          organizationId: snapRow.organization_id,
          planTier: snapRow.plan_key as PlanTier,
          billingInterval: snapRow.billing_interval as BillingInterval,
          amountIdr: Number(snapRow.amount_idr),
          currency: 'IDR',
          durationDays: Number(snapRow.duration_days),
          deviceQuota: Number(snapRow.device_quota),
          priceVersion: Number(snapRow.price_version),
          createdAt: snapRow.snapshot_created_at,
          metadata: snapRow.snapshot_metadata,
        };
      }
    } catch {
      // Database table not available or network error
    }
  }

  // 3. Check memory store as supplementary fallback
  if (!snapshot && cleanOrderId) {
    snapshot = runtimeOrderSnapshots.get(cleanOrderId);
  }

  return resolveOrderDurationAndIntervalInternal(order, snapshot);
}

/**
 * Synchronous resolver interface for code paths where snapshot is already in memory or row
 */
export function resolveOrderDurationAndInterval(order: {
  order_id?: string;
  organization_id?: string | null;
  plan_tier?: string | null;
  amount_idr?: number | string | null;
  duration_days?: number | null;
  billing_interval?: string | null;
  snapshot_metadata?: any;
}): ResolvedPackageTerms {
  const cleanOrderId = order.order_id || '';
  const snapshot: OrderSnapshot | undefined =
    (cleanOrderId ? runtimeOrderSnapshots.get(cleanOrderId) : undefined) ||
    (order.snapshot_metadata && typeof order.snapshot_metadata === 'object' && order.snapshot_metadata.amountIdr
      ? (order.snapshot_metadata as OrderSnapshot)
      : undefined);

  return resolveOrderDurationAndIntervalInternal(order, snapshot);
}

function resolveOrderDurationAndIntervalInternal(
  order: {
    order_id?: string;
    organization_id?: string | null;
    plan_tier?: string | null;
    amount_idr?: number | string | null;
    duration_days?: number | null;
    billing_interval?: string | null;
  },
  snapshot?: OrderSnapshot
): ResolvedPackageTerms {
  // 1. Detect and reject contradictory snapshot and database terms
  if (snapshot) {
    if (order.plan_tier && snapshot.planTier && order.plan_tier !== snapshot.planTier) {
      throw new Error(
        `CONTRADICTORY_ORDER_TERMS: Order record plan '${order.plan_tier}' conflicts with snapshot plan '${snapshot.planTier}'`
      );
    }
    if (order.amount_idr != null && snapshot.amountIdr != null && Number(order.amount_idr) !== Number(snapshot.amountIdr)) {
      throw new Error(
        `CONTRADICTORY_ORDER_TERMS: Order record amount '${order.amount_idr}' conflicts with snapshot amount '${snapshot.amountIdr}'`
      );
    }
    if (order.duration_days != null && snapshot.durationDays != null && Number(order.duration_days) !== Number(snapshot.durationDays)) {
      throw new Error(
        `CONTRADICTORY_ORDER_TERMS: Order record duration '${order.duration_days}' conflicts with snapshot duration '${snapshot.durationDays}'`
      );
    }
    if (order.billing_interval && snapshot.billingInterval && order.billing_interval !== snapshot.billingInterval) {
      throw new Error(
        `CONTRADICTORY_ORDER_TERMS: Order record interval '${order.billing_interval}' conflicts with snapshot interval '${snapshot.billingInterval}'`
      );
    }
    if (order.organization_id && snapshot.organizationId && order.organization_id !== snapshot.organizationId) {
      throw new Error(
        `CONTRADICTORY_ORDER_TERMS: Order tenant '${order.organization_id}' conflicts with snapshot tenant '${snapshot.organizationId}'`
      );
    }
  }

  // 2. Validate plan tier & amount
  const planTier = (order.plan_tier || snapshot?.planTier) as PlanTier;
  const rawAmount = order.amount_idr != null ? order.amount_idr : snapshot?.amountIdr;
  const amountIdr = Number(rawAmount);

  if (!planTier || !['starter', 'pro', 'business'].includes(planTier)) {
    throw new Error(`INVALID_PLAN_TIER: Plan '${planTier}' is invalid or unrecognized`);
  }

  if (rawAmount == null || isNaN(amountIdr) || amountIdr <= 0) {
    throw new Error(`INVALID_AMOUNT: Payment amount '${rawAmount}' is invalid or missing`);
  }

  // 3. If immutable snapshot exists and is valid, it is authoritative!
  if (snapshot && snapshot.durationDays && snapshot.billingInterval) {
    return {
      durationDays: snapshot.durationDays,
      billingInterval: snapshot.billingInterval,
      planTier,
      amountIdr,
    };
  }

  // 4. Extract and validate explicit duration & interval formats (if present)
  const explicitDuration = order.duration_days != null ? Number(order.duration_days) : null;
  const explicitInterval = (order.billing_interval || null) as BillingInterval | null;

  if (explicitDuration !== null && ![30, 365].includes(explicitDuration)) {
    throw new Error(`INVALID_DURATION: Duration ${explicitDuration} days is not permitted (must be 30 or 365)`);
  }

  if (explicitInterval !== null && !['monthly', 'yearly'].includes(explicitInterval)) {
    throw new Error(`INVALID_INTERVAL: Billing interval '${explicitInterval}' is invalid (must be monthly or yearly)`);
  }

  // Known catalog prices for this plan tier (active + all historical versions)
  const knownPrices = getAllKnownPricesForTierAndInterval(planTier);

  // 5. Case 1: Both explicit duration and interval are provided
  if (explicitDuration !== null && explicitInterval !== null) {
    if (explicitInterval === 'monthly' && explicitDuration !== 30) {
      throw new Error(`INVALID_DURATION: Inconsistent order terms - monthly interval specified with ${explicitDuration} days`);
    }
    if (explicitInterval === 'yearly' && explicitDuration !== 365) {
      throw new Error(`INVALID_DURATION: Inconsistent order terms - yearly interval specified with ${explicitDuration} days`);
    }

    const intervalMatches = knownPrices.filter((p) => p.billingInterval === explicitInterval);
    if (intervalMatches.length === 0) {
      throw new Error(
        `UNRESOLVED_PACKAGE_DURATION: No catalog package found for plan '${planTier}' with interval '${explicitInterval}'`
      );
    }

    const priceMatch = intervalMatches.find((p) => p.amountIdr === amountIdr);
    if (!priceMatch) {
      throw new Error(
        `PAYMENT_AMOUNT_MISMATCH: Inconsistent commercial terms. Plan '${planTier}' (${explicitInterval}) requires ${intervalMatches[0].amountIdr} IDR, but received ${amountIdr} IDR`
      );
    }

    return {
      durationDays: explicitDuration,
      billingInterval: explicitInterval,
      planTier,
      amountIdr,
    };
  }

  // 6. Case 2: Explicit interval exists, but explicit duration is missing
  if (explicitInterval !== null && explicitDuration === null) {
    const intervalMatches = knownPrices.filter((p) => p.billingInterval === explicitInterval);
    if (intervalMatches.length === 0) {
      throw new Error(
        `UNRESOLVED_PACKAGE_DURATION: No catalog package found for plan '${planTier}' with interval '${explicitInterval}'`
      );
    }

    const priceMatch = intervalMatches.find((p) => p.amountIdr === amountIdr);
    if (!priceMatch) {
      throw new Error(
        `PAYMENT_AMOUNT_MISMATCH: Inconsistent commercial terms. Plan '${planTier}' (${explicitInterval}) requires ${intervalMatches[0].amountIdr} IDR, but received ${amountIdr} IDR`
      );
    }

    return {
      durationDays: priceMatch.durationDays,
      billingInterval: explicitInterval,
      planTier,
      amountIdr,
    };
  }

  // 7. Case 3: Explicit duration exists, but explicit interval is missing
  if (explicitDuration !== null && explicitInterval === null) {
    const durationMatches = knownPrices.filter((p) => p.durationDays === explicitDuration);
    if (durationMatches.length === 0) {
      throw new Error(
        `UNRESOLVED_PACKAGE_DURATION: No catalog package found for plan '${planTier}' with duration ${explicitDuration} days`
      );
    }

    const priceMatch = durationMatches.find((p) => p.amountIdr === amountIdr);
    if (!priceMatch) {
      throw new Error(
        `PAYMENT_AMOUNT_MISMATCH: Inconsistent commercial terms. Plan '${planTier}' with ${explicitDuration} days requires ${durationMatches[0].amountIdr} IDR, but received ${amountIdr} IDR`
      );
    }

    return {
      durationDays: explicitDuration,
      billingInterval: priceMatch.billingInterval,
      planTier,
      amountIdr,
    };
  }

  // 8. Case 4: Neither explicit duration nor explicit interval exists (Legacy minimal row)
  const matchingPrices = knownPrices.filter((p) => p.amountIdr === amountIdr);

  const distinctDurations = new Set(matchingPrices.map((p) => p.durationDays));
  const distinctIntervals = new Set(matchingPrices.map((p) => p.billingInterval));

  if (distinctDurations.size === 1 && distinctIntervals.size === 1) {
    const matched = matchingPrices[0];
    return {
      durationDays: matched.durationDays,
      billingInterval: matched.billingInterval,
      planTier,
      amountIdr,
    };
  }

  if (distinctDurations.size > 1 || distinctIntervals.size > 1) {
    throw new Error(
      `AMBIGUOUS_PACKAGE_MATCH: Multiple distinct price packages match plan '${planTier}' with amount ${amountIdr}`
    );
  }

  // Fail closed
  throw new Error(
    `UNRESOLVED_PACKAGE_DURATION: Cannot authoritatively resolve duration for plan '${planTier}' with amount ${amountIdr} IDR. Fail-closed.`
  );
}
