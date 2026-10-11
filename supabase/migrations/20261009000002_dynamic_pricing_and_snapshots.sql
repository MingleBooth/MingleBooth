-- ==============================================================================
-- MINGLEBOOTH PHASE 15.4.3.2 — DYNAMIC PRICING & IMMUTABLE CHECKOUT SNAPSHOTS
-- ==============================================================================
-- Migration: 20261009000002_dynamic_pricing_and_snapshots.sql
--
-- Key Guarantees:
-- 1. Dynamic Pricing Schema: subscription_plans and plan_prices tables allow
--    superadmins to configure prices without rebuilding or reinstalling desktop clients.
-- 2. Immutable Order Snapshots: payments table augmented with billing_interval,
--    currency, duration_days, price_version, and snapshot_metadata columns.
-- 3. Versioned & Auditable: plan_prices tracks price versions with effective periods.
-- 4. Safe & Non-Destructive: Backward-compatible with all existing payment rows.
-- 5. Row-Level Security: Public can view active pricing; writes strictly restricted to service_role.
-- ==============================================================================

-- 1. Create subscription_plans table
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id TEXT PRIMARY KEY, -- 'starter', 'pro', 'business'
    name TEXT NOT NULL,
    plan_tier TEXT NOT NULL UNIQUE CHECK (plan_tier IN ('starter', 'pro', 'business')),
    description TEXT,
    max_devices_quota INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default plans if not already present
INSERT INTO public.subscription_plans (id, name, plan_tier, description, max_devices_quota, is_active)
VALUES
    ('starter', 'Starter', 'starter', 'Solusi lengkap untuk solo vendor photobooth atau roaming booth.', 1, TRUE),
    ('pro', 'Pro', 'pro', 'Pilihan paling populer untuk vendor photobooth aktif & wedding studio.', 3, TRUE),
    ('business', 'Business', 'business', 'Untuk agensi besar dan enterprise dengan armada photobooth multi-event.', 10, TRUE)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    max_devices_quota = EXCLUDED.max_devices_quota,
    description = EXCLUDED.description,
    updated_at = NOW();

-- 2. Create plan_prices table
CREATE TABLE IF NOT EXISTS public.plan_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id TEXT NOT NULL REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
    billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'yearly')),
    amount_idr BIGINT NOT NULL CHECK (amount_idr > 0),
    currency TEXT NOT NULL DEFAULT 'IDR',
    duration_days INTEGER NOT NULL CHECK (duration_days IN (30, 365)),
    version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_until TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_plan_price_version UNIQUE (plan_id, billing_interval, version)
);

-- Index for high-performance active price resolution
CREATE INDEX IF NOT EXISTS idx_plan_prices_lookup 
ON public.plan_prices (plan_id, billing_interval) 
WHERE is_active = TRUE;

-- Seed default pricing catalog (v1)
INSERT INTO public.plan_prices (plan_id, billing_interval, amount_idr, currency, duration_days, version, is_active, effective_from)
VALUES
    ('starter', 'monthly', 549000, 'IDR', 30, 1, TRUE, NOW()),
    ('starter', 'yearly', 1499000, 'IDR', 365, 1, TRUE, NOW()),
    ('pro', 'monthly', 1099000, 'IDR', 30, 1, TRUE, NOW()),
    ('pro', 'yearly', 2999000, 'IDR', 365, 1, TRUE, NOW()),
    ('business', 'monthly', 2199000, 'IDR', 30, 1, TRUE, NOW()),
    ('business', 'yearly', 5999000, 'IDR', 365, 1, TRUE, NOW())
ON CONFLICT (plan_id, billing_interval, version) DO UPDATE
SET amount_idr = EXCLUDED.amount_idr,
    duration_days = EXCLUDED.duration_days,
    updated_at = NOW();

-- 3. Enhance payments table with immutable commercial snapshot columns
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS billing_interval TEXT DEFAULT 'monthly';
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'IDR';
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS duration_days INTEGER DEFAULT 30;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS price_version INTEGER DEFAULT 1;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS price_id UUID REFERENCES public.plan_prices(id) ON DELETE SET NULL;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS snapshot_metadata JSONB DEFAULT '{}'::jsonb;

-- Backfill duration_days and billing_interval on existing payments based on historical amount
UPDATE public.payments
SET billing_interval = 'yearly',
    duration_days = 365
WHERE (amount_idr = 1499000 OR amount_idr = 2999000 OR amount_idr = 5999000)
  AND (duration_days = 30 OR duration_days IS NULL);

-- 4. Row Level Security Policies
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_prices ENABLE ROW LEVEL SECURITY;

-- Read policy: Anyone (anon, authenticated, service_role) can view active plans
DROP POLICY IF EXISTS "Public can view active plans" ON public.subscription_plans;
CREATE POLICY "Public can view active plans" 
ON public.subscription_plans FOR SELECT 
USING (is_active = TRUE);

-- Read policy: Anyone can view active published prices
DROP POLICY IF EXISTS "Public can view active prices" ON public.plan_prices;
CREATE POLICY "Public can view active prices" 
ON public.plan_prices FOR SELECT 
USING (is_active = TRUE AND (effective_until IS NULL OR effective_until > NOW()));

-- Write policies: Strictly service_role can modify plans or prices
DROP POLICY IF EXISTS "Service role manages subscription plans" ON public.subscription_plans;
CREATE POLICY "Service role manages subscription plans" 
ON public.subscription_plans FOR ALL 
TO service_role USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Service role manages plan prices" ON public.plan_prices;
CREATE POLICY "Service role manages plan prices" 
ON public.plan_prices FOR ALL 
TO service_role USING (TRUE) WITH CHECK (TRUE);
