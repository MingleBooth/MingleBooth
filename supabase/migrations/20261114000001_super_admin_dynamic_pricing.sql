-- ==============================================================================
-- MINGLEBOOTH — SUPER ADMIN DYNAMIC PRICING MANAGEMENT SYSTEM
-- ==============================================================================
-- Migration: 20261114000001_super_admin_dynamic_pricing.sql
--
-- Key Capabilities & Security Guarantees:
-- 1. Schema Reconciliation: Additive, self-healing migration logic compatible with:
--    - Fresh database installations.
--    - Intermediate databases containing draft migration 20261009000002.
--    - Production-like legacy databases with the 10-column payments schema.
-- 2. Bidirectional Plan Synchronization: True two-way trigger ensuring canonical
--    (plan_key, display_name, device_quota) and legacy (plan_tier, name, max_devices_quota)
--    columns remain 100% in sync across both legacy-only and canonical-only writes.
-- 3. Non-Destructive Status Backfill: Fast-default-safe status provisioning on
--    plan_prices, evaluating pre-update values (is_active, effective_from, effective_until)
--    before assigning defaults, preventing corrupt active versions.
-- 4. Idempotent Seed: ON CONFLICT DO NOTHING guarantees rerun safety without
--    resetting legitimate Super Admin plan customizations or price adjustments.
-- 5. Append-Only Snapshots: Immutable checkout snapshot table preserving original
--    commercial terms for all pending and historical payment orders.
-- 6. Transactional Stored Procedures: SECURITY DEFINER procedures with search_path hardening
--    and row-level locking (FOR UPDATE) for single-transaction price mutations.
-- ==============================================================================

-- Ensure baseline cryptographic & UUID extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- SECTION 1: SUBSCRIPTION PLANS SCHEMA RECONCILIATION
-- ==============================================================================

-- 1.1 Ensure base subscription_plans table exists
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id TEXT PRIMARY KEY -- 'starter', 'pro', 'business'
);

-- 1.2 Add all canonical and backwards-compatible columns idempotently
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS plan_key TEXT;
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS plan_tier TEXT;
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS duration_days INTEGER DEFAULT 30;
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS device_quota INTEGER DEFAULT 1;
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS max_devices_quota INTEGER DEFAULT 1;
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 1.3 Backfill existing data using explicit deterministic arbitration rules
UPDATE public.subscription_plans
SET
    plan_key = CASE
        WHEN plan_key IS NOT NULL AND plan_key IN ('starter', 'pro', 'business')
             AND (plan_tier IS NULL OR plan_tier = plan_key) THEN plan_key
        WHEN (plan_key IS NULL OR plan_key NOT IN ('starter', 'pro', 'business'))
             AND plan_tier IS NOT NULL AND plan_tier IN ('starter', 'pro', 'business') THEN plan_tier
        WHEN plan_key IS NOT NULL AND plan_tier IS NOT NULL AND plan_key <> plan_tier THEN
             CASE
                 WHEN plan_key = id THEN plan_key
                 WHEN plan_tier = id THEN plan_tier
                 ELSE id
             END
        ELSE id
    END,
    plan_tier = CASE
        WHEN plan_key IS NOT NULL AND plan_key IN ('starter', 'pro', 'business')
             AND (plan_tier IS NULL OR plan_tier = plan_key) THEN plan_key
        WHEN (plan_key IS NULL OR plan_key NOT IN ('starter', 'pro', 'business'))
             AND plan_tier IS NOT NULL AND plan_tier IN ('starter', 'pro', 'business') THEN plan_tier
        WHEN plan_key IS NOT NULL AND plan_tier IS NOT NULL AND plan_key <> plan_tier THEN
             CASE
                 WHEN plan_key = id THEN plan_key
                 WHEN plan_tier = id THEN plan_tier
                 ELSE id
             END
        ELSE id
    END,
    display_name = CASE
        WHEN display_name IS NOT NULL AND btrim(display_name) <> '' THEN btrim(display_name)
        WHEN name IS NOT NULL AND btrim(name) <> '' THEN btrim(name)
        ELSE INITCAP(id)
    END,
    name = CASE
        WHEN display_name IS NOT NULL AND btrim(display_name) <> '' THEN btrim(display_name)
        WHEN name IS NOT NULL AND btrim(name) <> '' THEN btrim(name)
        ELSE INITCAP(id)
    END,
    device_quota = CASE
        WHEN id = 'business' AND (device_quota IS NULL OR device_quota <= 1) AND (max_devices_quota IS NULL OR max_devices_quota <= 1) THEN 10
        WHEN id = 'pro' AND (device_quota IS NULL OR device_quota <= 1) AND (max_devices_quota IS NULL OR max_devices_quota <= 1) THEN 3
        WHEN device_quota IS NOT NULL AND device_quota > 0 THEN device_quota
        WHEN max_devices_quota IS NOT NULL AND max_devices_quota > 0 THEN max_devices_quota
        ELSE CASE id WHEN 'business' THEN 10 WHEN 'pro' THEN 3 ELSE 1 END
    END,
    max_devices_quota = CASE
        WHEN id = 'business' AND (device_quota IS NULL OR device_quota <= 1) AND (max_devices_quota IS NULL OR max_devices_quota <= 1) THEN 10
        WHEN id = 'pro' AND (device_quota IS NULL OR device_quota <= 1) AND (max_devices_quota IS NULL OR max_devices_quota <= 1) THEN 3
        WHEN device_quota IS NOT NULL AND device_quota > 0 THEN device_quota
        WHEN max_devices_quota IS NOT NULL AND max_devices_quota > 0 THEN max_devices_quota
        ELSE CASE id WHEN 'business' THEN 10 WHEN 'pro' THEN 3 ELSE 1 END
    END,
    duration_days = CASE
        WHEN duration_days IS NOT NULL AND duration_days IN (30, 365) THEN duration_days
        ELSE 30
    END;

-- 1.4 Apply constraints safely after reconciliation backfill
ALTER TABLE public.subscription_plans ALTER COLUMN plan_key SET NOT NULL;
ALTER TABLE public.subscription_plans ALTER COLUMN display_name SET NOT NULL;
ALTER TABLE public.subscription_plans ALTER COLUMN duration_days SET NOT NULL;
ALTER TABLE public.subscription_plans ALTER COLUMN device_quota SET NOT NULL;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_subscription_plans_plan_key'
    ) THEN
        ALTER TABLE public.subscription_plans
        ADD CONSTRAINT chk_subscription_plans_plan_key
        CHECK (plan_key IN ('starter', 'pro', 'business'));
    END IF;
END $$;

-- 1.5 True Bidirectional Synchronization Trigger
CREATE OR REPLACE FUNCTION public.sync_subscription_plans_bidirectional()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Handle INSERT operations
    IF TG_OP = 'INSERT' THEN
        -- Synchronize plan_key and plan_tier
        IF NEW.plan_key IS NOT NULL AND NEW.plan_tier IS NULL THEN
            NEW.plan_tier := NEW.plan_key;
        ELSIF NEW.plan_tier IS NOT NULL AND NEW.plan_key IS NULL THEN
            NEW.plan_key := NEW.plan_tier;
        ELSIF NEW.plan_key IS NOT NULL AND NEW.plan_tier IS NOT NULL AND NEW.plan_key <> NEW.plan_tier THEN
            RAISE EXCEPTION 'AMBIGUOUS_INSERT: Conflicting plan_key (%) and plan_tier (%) provided', NEW.plan_key, NEW.plan_tier;
        ELSE
            NEW.plan_key := COALESCE(NEW.plan_key, NEW.id);
            NEW.plan_tier := NEW.plan_key;
        END IF;

        -- Synchronize display_name and name
        IF NEW.display_name IS NOT NULL AND NEW.name IS NULL THEN
            NEW.name := NEW.display_name;
        ELSIF NEW.name IS NOT NULL AND NEW.display_name IS NULL THEN
            NEW.display_name := NEW.name;
        ELSIF NEW.display_name IS NOT NULL AND NEW.name IS NOT NULL AND NEW.display_name <> NEW.name THEN
            RAISE EXCEPTION 'AMBIGUOUS_INSERT: Conflicting display_name (%) and name (%) provided', NEW.display_name, NEW.name;
        ELSE
            NEW.display_name := COALESCE(NEW.display_name, INITCAP(NEW.id));
            NEW.name := NEW.display_name;
        END IF;

        -- Synchronize device_quota and max_devices_quota
        IF NEW.device_quota IS NOT NULL AND NEW.max_devices_quota IS NULL THEN
            NEW.max_devices_quota := NEW.device_quota;
        ELSIF NEW.max_devices_quota IS NOT NULL AND NEW.device_quota IS NULL THEN
            NEW.device_quota := NEW.max_devices_quota;
        ELSIF NEW.device_quota IS NOT NULL AND NEW.max_devices_quota IS NOT NULL AND NEW.device_quota <> NEW.max_devices_quota THEN
            RAISE EXCEPTION 'AMBIGUOUS_INSERT: Conflicting device_quota (%) and max_devices_quota (%) provided', NEW.device_quota, NEW.max_devices_quota;
        ELSE
            NEW.device_quota := COALESCE(NEW.device_quota, 1);
            NEW.max_devices_quota := NEW.device_quota;
        END IF;

        NEW.duration_days := COALESCE(NEW.duration_days, 30);
        RETURN NEW;
    END IF;

    -- Handle UPDATE operations (detect caller intent via IS DISTINCT FROM)
    IF TG_OP = 'UPDATE' THEN
        -- 1. Sync plan_key / plan_tier
        IF (NEW.plan_key IS DISTINCT FROM OLD.plan_key) AND (NEW.plan_tier IS NOT DISTINCT FROM OLD.plan_tier) THEN
            NEW.plan_tier := NEW.plan_key;
        ELSIF (NEW.plan_tier IS DISTINCT FROM OLD.plan_tier) AND (NEW.plan_key IS NOT DISTINCT FROM OLD.plan_key) THEN
            NEW.plan_key := NEW.plan_tier;
        ELSIF (NEW.plan_key IS DISTINCT FROM OLD.plan_key) AND (NEW.plan_tier IS DISTINCT FROM OLD.plan_tier) THEN
            IF NEW.plan_key <> NEW.plan_tier THEN
                RAISE EXCEPTION 'AMBIGUOUS_UPDATE: Conflicting updates to plan_key (%) and plan_tier (%)', NEW.plan_key, NEW.plan_tier;
            END IF;
        END IF;

        -- 2. Sync display_name / name
        IF (NEW.display_name IS DISTINCT FROM OLD.display_name) AND (NEW.name IS NOT DISTINCT FROM OLD.name) THEN
            NEW.name := NEW.display_name;
        ELSIF (NEW.name IS DISTINCT FROM OLD.name) AND (NEW.display_name IS NOT DISTINCT FROM OLD.display_name) THEN
            NEW.display_name := NEW.name;
        ELSIF (NEW.display_name IS DISTINCT FROM OLD.display_name) AND (NEW.name IS DISTINCT FROM OLD.name) THEN
            IF NEW.display_name <> NEW.name THEN
                RAISE EXCEPTION 'AMBIGUOUS_UPDATE: Conflicting updates to display_name (%) and name (%)', NEW.display_name, NEW.name;
            END IF;
        END IF;

        -- 3. Sync device_quota / max_devices_quota
        IF (NEW.device_quota IS DISTINCT FROM OLD.device_quota) AND (NEW.max_devices_quota IS NOT DISTINCT FROM OLD.max_devices_quota) THEN
            NEW.max_devices_quota := NEW.device_quota;
        ELSIF (NEW.max_devices_quota IS DISTINCT FROM OLD.max_devices_quota) AND (NEW.device_quota IS NOT DISTINCT FROM OLD.device_quota) THEN
            NEW.device_quota := NEW.max_devices_quota;
        ELSIF (NEW.device_quota IS DISTINCT FROM OLD.device_quota) AND (NEW.max_devices_quota IS DISTINCT FROM OLD.max_devices_quota) THEN
            IF NEW.device_quota <> NEW.max_devices_quota THEN
                RAISE EXCEPTION 'AMBIGUOUS_UPDATE: Conflicting updates to device_quota (%) and max_devices_quota (%)', NEW.device_quota, NEW.max_devices_quota;
            END IF;
        END IF;

        NEW.duration_days := COALESCE(NEW.duration_days, OLD.duration_days, 30);
        NEW.updated_at := NOW();
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_subscription_plans_bidirectional ON public.subscription_plans;
CREATE TRIGGER trg_sync_subscription_plans_bidirectional
BEFORE INSERT OR UPDATE ON public.subscription_plans
FOR EACH ROW EXECUTE FUNCTION public.sync_subscription_plans_bidirectional();

-- 1.6 Safe Baseline Seed: ON CONFLICT DO NOTHING preserves admin modifications
INSERT INTO public.subscription_plans (
    id, plan_key, display_name, name, description, duration_days, device_quota, max_devices_quota, is_active
) VALUES
    ('starter', 'starter', 'Starter', 'Starter', 'Solusi lengkap untuk solo vendor photobooth atau roaming booth.', 30, 1, 1, TRUE),
    ('pro', 'pro', 'Pro', 'Pro', 'Pilihan paling populer untuk vendor photobooth aktif & wedding studio.', 30, 3, 3, TRUE),
    ('business', 'business', 'Business', 'Business', 'Untuk agensi besar dan enterprise dengan armada photobooth multi-event.', 30, 10, 10, TRUE)
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- SECTION 2: PLAN PRICES SCHEMA RECONCILIATION & STATUS BACKFILL
-- ==============================================================================

-- 2.1 Ensure base plan_prices table exists
CREATE TABLE IF NOT EXISTS public.plan_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id TEXT NOT NULL REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
    billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'yearly')),
    amount_idr BIGINT NOT NULL CHECK (amount_idr > 0),
    currency TEXT NOT NULL DEFAULT 'IDR',
    duration_days INTEGER NOT NULL CHECK (duration_days IN (30, 365)),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_until TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.2 Add lifecycle columns WITHOUT default values (avoids fast-default corruption)
ALTER TABLE public.plan_prices ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE public.plan_prices ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.plan_prices ADD COLUMN IF NOT EXISTS change_reason TEXT;

-- 2.3 Backfill status using explicit lifecycle precedence on actual pre-update values
UPDATE public.plan_prices
SET
    status = CASE
        -- Precedence 1: Retain already valid explicit status if present
        WHEN status IS NOT NULL AND status IN ('active', 'scheduled', 'superseded', 'cancelled') THEN status
        -- Precedence 2: Expired prices are superseded
        WHEN effective_until IS NOT NULL AND effective_until <= NOW() THEN 'superseded'
        -- Precedence 3: Future effective dates are scheduled
        WHEN effective_from > NOW() THEN 'scheduled'
        -- Precedence 4: Explicitly inactive prices are superseded
        WHEN is_active = FALSE THEN 'superseded'
        -- Precedence 5: Active, current, unexpired prices are active
        WHEN is_active = TRUE AND (effective_until IS NULL OR effective_until > NOW()) AND effective_from <= NOW() THEN 'active'
        -- Safe fail-closed fallback
        ELSE 'superseded'
    END,
    is_active = CASE
        WHEN status = 'active' OR (status IS NULL AND is_active = TRUE AND (effective_until IS NULL OR effective_until > NOW()) AND effective_from <= NOW()) THEN TRUE
        ELSE FALSE
    END,
    created_by = COALESCE(created_by, 'system'),
    change_reason = COALESCE(change_reason, 'Initial baseline catalog backfill')
WHERE status IS NULL OR created_by IS NULL OR change_reason IS NULL;

-- 2.4 De-duplicate active prices (ensures partial unique index can be created safely)
WITH ranked_active AS (
    SELECT id, ROW_NUMBER() OVER (
        PARTITION BY plan_id, billing_interval
        ORDER BY version DESC, effective_from DESC
    ) as rn
    FROM public.plan_prices
    WHERE status = 'active' AND is_active = TRUE
)
UPDATE public.plan_prices
SET status = 'superseded',
    is_active = FALSE,
    effective_until = COALESCE(effective_until, NOW())
WHERE id IN (SELECT id FROM ranked_active WHERE rn > 1);

-- 2.5 Set defaults and constraints for future rows
ALTER TABLE public.plan_prices ALTER COLUMN status SET DEFAULT 'active';
ALTER TABLE public.plan_prices ALTER COLUMN created_by SET DEFAULT 'system';
ALTER TABLE public.plan_prices ALTER COLUMN change_reason SET DEFAULT 'Price version update';

ALTER TABLE public.plan_prices ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.plan_prices ALTER COLUMN created_by SET NOT NULL;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_plan_prices_status'
    ) THEN
        ALTER TABLE public.plan_prices
        ADD CONSTRAINT chk_plan_prices_status
        CHECK (status IN ('active', 'scheduled', 'superseded', 'cancelled'));
    END IF;
END $$;

-- 2.6 Enforce unique constraint on (plan_id, billing_interval, version)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_plan_price_version'
    ) THEN
        ALTER TABLE public.plan_prices
        ADD CONSTRAINT uq_plan_price_version UNIQUE (plan_id, billing_interval, version);
    END IF;
END $$;

-- 2.7 Partial unique index: Guarantee no overlapping active prices
CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_prices_single_active
ON public.plan_prices (plan_id, billing_interval)
WHERE is_active = TRUE AND status = 'active';

-- Index for high-performance lookup
CREATE INDEX IF NOT EXISTS idx_plan_prices_effective_lookup
ON public.plan_prices (plan_id, billing_interval, status, effective_from);

-- 2.8 Seed Baseline Catalog Prices: DO NOTHING preserves all existing price records
INSERT INTO public.plan_prices (
    plan_id, billing_interval, amount_idr, currency, duration_days, version, status, is_active, effective_from, created_by, change_reason
) VALUES
    ('starter', 'monthly', 549000, 'IDR', 30, 1, 'active', TRUE, NOW(), 'system', 'Initial Official Baseline Catalog'),
    ('starter', 'yearly', 1499000, 'IDR', 365, 1, 'active', TRUE, NOW(), 'system', 'Initial Official Baseline Catalog'),
    ('pro', 'monthly', 1099000, 'IDR', 30, 1, 'active', TRUE, NOW(), 'system', 'Initial Official Baseline Catalog'),
    ('pro', 'yearly', 2999000, 'IDR', 365, 1, 'active', TRUE, NOW(), 'system', 'Initial Official Baseline Catalog'),
    ('business', 'monthly', 2199000, 'IDR', 30, 1, 'active', TRUE, NOW(), 'system', 'Initial Official Baseline Catalog'),
    ('business', 'yearly', 5999000, 'IDR', 365, 1, 'active', TRUE, NOW(), 'system', 'Initial Official Baseline Catalog')
ON CONFLICT (plan_id, billing_interval, version) DO NOTHING;

-- ==============================================================================
-- SECTION 3: IMMUTABLE PAYMENT PRICE SNAPSHOTS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.payment_price_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL UNIQUE,
    payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
    organization_id UUID NOT NULL,
    plan_id TEXT NOT NULL,
    plan_key TEXT NOT NULL CHECK (plan_key IN ('starter', 'pro', 'business')),
    billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'yearly')),
    amount_idr BIGINT NOT NULL CHECK (amount_idr > 0),
    currency TEXT NOT NULL DEFAULT 'IDR',
    duration_days INTEGER NOT NULL CHECK (duration_days IN (30, 365)),
    device_quota INTEGER NOT NULL CHECK (device_quota > 0),
    price_version INTEGER NOT NULL DEFAULT 1,
    price_id UUID REFERENCES public.plan_prices(id) ON DELETE SET NULL,
    snapshot_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    snapshot_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_price_snapshots_order_id
ON public.payment_price_snapshots (order_id);

CREATE INDEX IF NOT EXISTS idx_payment_price_snapshots_org_id
ON public.payment_price_snapshots (organization_id);

-- Enforce IMMUTABILITY of payment_price_snapshots
CREATE OR REPLACE FUNCTION public.prevent_snapshot_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'SECURITY_VIOLATION: payment_price_snapshots records are immutable and cannot be modified or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_payment_price_snapshots ON public.payment_price_snapshots;
CREATE TRIGGER trg_immutable_payment_price_snapshots
BEFORE UPDATE OR DELETE ON public.payment_price_snapshots
FOR EACH ROW EXECUTE FUNCTION public.prevent_snapshot_modification();

-- ==============================================================================
-- SECTION 4: IMMUTABLE PRICING AUDIT LOGS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.pricing_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id TEXT NOT NULL,
    actor_email TEXT,
    action TEXT NOT NULL CHECK (action IN ('CREATE_PRICE_VERSION', 'SCHEDULE_PRICE_VERSION', 'ACTIVATE_PRICE_VERSION', 'CANCEL_PRICE_VERSION')),
    plan_id TEXT NOT NULL,
    billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'yearly')),
    previous_amount_idr BIGINT,
    new_amount_idr BIGINT NOT NULL CHECK (new_amount_idr > 0),
    previous_version INTEGER,
    new_version INTEGER NOT NULL CHECK (new_version > 0),
    effective_from TIMESTAMPTZ NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pricing_audit_logs_plan
ON public.pricing_audit_logs (plan_id, billing_interval, created_at DESC);

-- Enforce APPEND-ONLY pricing_audit_logs
CREATE OR REPLACE FUNCTION public.prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'SECURITY_VIOLATION: pricing_audit_logs records are permanent audit records and cannot be modified or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_pricing_audit_logs ON public.pricing_audit_logs;
CREATE TRIGGER trg_immutable_pricing_audit_logs
BEFORE UPDATE OR DELETE ON public.pricing_audit_logs
FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_modification();

-- ==============================================================================
-- SECTION 5: TRANSACTIONAL STORED PROCEDURES
-- ==============================================================================

-- 5.1 update_subscription_price_version
CREATE OR REPLACE FUNCTION public.update_subscription_price_version(
    p_plan_id TEXT,
    p_billing_interval TEXT,
    p_new_amount_idr BIGINT,
    p_effective_from TIMESTAMPTZ,
    p_change_reason TEXT,
    p_actor_id TEXT,
    p_actor_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_plan_record RECORD;
    v_active_price RECORD;
    v_prev_amount BIGINT := NULL;
    v_prev_version INTEGER := NULL;
    v_next_version INTEGER := 1;
    v_duration_days INTEGER := 30;
    v_is_future BOOLEAN := FALSE;
    v_new_price_id UUID := gen_random_uuid();
    v_audit_id UUID := gen_random_uuid();
    v_status TEXT := 'active';
    v_is_active BOOLEAN := TRUE;
    v_effective_from TIMESTAMPTZ;
BEGIN
    -- 1. Input Validation
    IF p_plan_id NOT IN ('starter', 'pro', 'business') THEN
        RAISE EXCEPTION 'INVALID_PLAN_TIER: Plan % is not valid', p_plan_id;
    END IF;

    IF p_billing_interval NOT IN ('monthly', 'yearly') THEN
        RAISE EXCEPTION 'INVALID_INTERVAL: Billing interval % is not valid', p_billing_interval;
    END IF;

    IF p_new_amount_idr IS NULL OR p_new_amount_idr <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: Amount must be positive integer IDR';
    END IF;

    IF p_new_amount_idr < 10000 THEN
        RAISE EXCEPTION 'PRICE_BELOW_MINIMUM: Price cannot be less than 10000 IDR';
    END IF;

    IF p_new_amount_idr > 100000000 THEN
        RAISE EXCEPTION 'PRICE_EXCEEDS_MAXIMUM: Price cannot exceed 100000000 IDR';
    END IF;

    IF p_change_reason IS NULL OR LENGTH(TRIM(p_change_reason)) < 3 THEN
        RAISE EXCEPTION 'INVALID_REASON: Change reason is mandatory (min 3 chars)';
    END IF;

    v_effective_from := COALESCE(p_effective_from, NOW());
    v_is_future := v_effective_from > NOW();

    -- 2. Concurrency Control: Lock subscription plan row for update
    SELECT id, duration_days INTO v_plan_record
    FROM public.subscription_plans
    WHERE id = p_plan_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PLAN_NOT_FOUND: Plan % does not exist in subscription_plans', p_plan_id;
    END IF;

    -- 3. Lock currently active price row (if exists)
    SELECT id, version, amount_idr, effective_from INTO v_active_price
    FROM public.plan_prices
    WHERE plan_id = p_plan_id
      AND billing_interval = p_billing_interval
      AND is_active = TRUE
      AND status = 'active'
    FOR UPDATE;

    IF FOUND THEN
        v_prev_amount := v_active_price.amount_idr;
        v_prev_version := v_active_price.version;
    END IF;

    -- 4. Calculate next sequential version number
    SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
    FROM public.plan_prices
    WHERE plan_id = p_plan_id
      AND billing_interval = p_billing_interval;

    v_duration_days := CASE WHEN p_billing_interval = 'monthly' THEN 30 ELSE 365 END;

    -- 5. Schedule collision check
    IF v_is_future THEN
        v_status := 'scheduled';
        v_is_active := FALSE;

        -- Prevent duplicate scheduled prices with identical effective timestamp
        IF EXISTS (
            SELECT 1 FROM public.plan_prices
            WHERE plan_id = p_plan_id
              AND billing_interval = p_billing_interval
              AND status = 'scheduled'
              AND effective_from = v_effective_from
        ) THEN
            RAISE EXCEPTION 'SCHEDULE_COLLISION: Duplicate scheduled price already exists for % (%) at %',
                p_plan_id, p_billing_interval, v_effective_from;
        END IF;

        -- Cancel any previously scheduled un-activated versions for this package
        UPDATE public.plan_prices
        SET status = 'cancelled',
            is_active = FALSE,
            updated_at = NOW()
        WHERE plan_id = p_plan_id
          AND billing_interval = p_billing_interval
          AND status = 'scheduled'
          AND effective_from <= v_effective_from;
    ELSE
        v_status := 'active';
        v_is_active := TRUE;

        -- Supersede currently active version
        UPDATE public.plan_prices
        SET is_active = FALSE,
            status = 'superseded',
            effective_until = v_effective_from,
            updated_at = NOW()
        WHERE plan_id = p_plan_id
          AND billing_interval = p_billing_interval
          AND is_active = TRUE
          AND status = 'active';
    END IF;

    -- 6. Insert new version
    INSERT INTO public.plan_prices (
        id, plan_id, billing_interval, amount_idr, currency, duration_days,
        version, status, is_active, effective_from, effective_until,
        created_by, change_reason, created_at, updated_at
    ) VALUES (
        v_new_price_id, p_plan_id, p_billing_interval, p_new_amount_idr, 'IDR', v_duration_days,
        v_next_version, v_status, v_is_active, v_effective_from, NULL,
        COALESCE(p_actor_email, p_actor_id, 'system'), TRIM(p_change_reason), NOW(), NOW()
    );

    -- 7. Insert audit log record in SAME transaction
    INSERT INTO public.pricing_audit_logs (
        id, actor_id, actor_email, action, plan_id, billing_interval,
        previous_amount_idr, new_amount_idr, previous_version, new_version,
        effective_from, reason, created_at
    ) VALUES (
        v_audit_id, COALESCE(p_actor_id, 'system'), p_actor_email,
        CASE WHEN v_is_future THEN 'SCHEDULE_PRICE_VERSION' ELSE 'CREATE_PRICE_VERSION' END,
        p_plan_id, p_billing_interval, v_prev_amount, p_new_amount_idr,
        v_prev_version, v_next_version, v_effective_from, TRIM(p_change_reason), NOW()
    );

    -- 8. Return structured result
    RETURN jsonb_build_object(
        'success', TRUE,
        'price_id', v_new_price_id,
        'plan_id', p_plan_id,
        'billing_interval', p_billing_interval,
        'amount_idr', p_new_amount_idr,
        'duration_days', v_duration_days,
        'version', v_next_version,
        'status', v_status,
        'is_active', v_is_active,
        'effective_from', v_effective_from,
        'previous_amount_idr', v_prev_amount,
        'previous_version', v_prev_version,
        'audit_id', v_audit_id
    );
END;
$$;

-- 5.2 cancel_scheduled_price_version
CREATE OR REPLACE FUNCTION public.cancel_scheduled_price_version(
    p_plan_id TEXT,
    p_billing_interval TEXT,
    p_reason TEXT,
    p_actor_id TEXT,
    p_actor_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_scheduled RECORD;
    v_audit_id UUID := gen_random_uuid();
BEGIN
    SELECT id, amount_idr, version, effective_from INTO v_scheduled
    FROM public.plan_prices
    WHERE plan_id = p_plan_id
      AND billing_interval = p_billing_interval
      AND status = 'scheduled'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NO_SCHEDULED_PRICE: No scheduled price found for % (%)', p_plan_id, p_billing_interval;
    END IF;

    UPDATE public.plan_prices
    SET status = 'cancelled',
        is_active = FALSE,
        updated_at = NOW()
    WHERE id = v_scheduled.id;

    INSERT INTO public.pricing_audit_logs (
        id, actor_id, actor_email, action, plan_id, billing_interval,
        previous_amount_idr, new_amount_idr, previous_version, new_version,
        effective_from, reason, created_at
    ) VALUES (
        v_audit_id, COALESCE(p_actor_id, 'system'), p_actor_email,
        'CANCEL_PRICE_VERSION', p_plan_id, p_billing_interval,
        v_scheduled.amount_idr, v_scheduled.amount_idr,
        v_scheduled.version, v_scheduled.version,
        NOW(), TRIM(COALESCE(p_reason, 'Cancelled by Super Admin')), NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'cancelled_price_id', v_scheduled.id,
        'plan_id', p_plan_id,
        'billing_interval', p_billing_interval,
        'audit_id', v_audit_id
    );
END;
$$;

-- ==============================================================================
-- SECTION 6: ROW LEVEL SECURITY AND PERMISSIONS
-- ==============================================================================

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_price_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_audit_logs ENABLE ROW LEVEL SECURITY;

-- Read policies
DROP POLICY IF EXISTS "Public can view active subscription plans" ON public.subscription_plans;
CREATE POLICY "Public can view active subscription plans"
ON public.subscription_plans FOR SELECT
USING (is_active = TRUE);

DROP POLICY IF EXISTS "Public can view active published prices" ON public.plan_prices;
CREATE POLICY "Public can view active published prices"
ON public.plan_prices FOR SELECT
USING (
    is_active = TRUE
    AND status = 'active'
    AND effective_from <= NOW()
    AND (effective_until IS NULL OR effective_until > NOW())
);

-- Drop legacy migration 3 policy to resolve policy collision
DROP POLICY IF EXISTS "Public can view active prices"
ON public.plan_prices;

-- Service role administrative policies (wrapped conditionally for safe execution)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        DROP POLICY IF EXISTS "Service role manages subscription plans" ON public.subscription_plans;
        CREATE POLICY "Service role manages subscription plans"
        ON public.subscription_plans FOR ALL
        TO service_role USING (TRUE) WITH CHECK (TRUE);

        DROP POLICY IF EXISTS "Service role manages plan prices" ON public.plan_prices;
        CREATE POLICY "Service role manages plan prices"
        ON public.plan_prices FOR ALL
        TO service_role USING (TRUE) WITH CHECK (TRUE);

        DROP POLICY IF EXISTS "Service role manages payment snapshots" ON public.payment_price_snapshots;
        CREATE POLICY "Service role manages payment snapshots"
        ON public.payment_price_snapshots FOR INSERT
        TO service_role WITH CHECK (TRUE);

        DROP POLICY IF EXISTS "Service role manages pricing audit logs" ON public.pricing_audit_logs;
        CREATE POLICY "Service role manages pricing audit logs"
        ON public.pricing_audit_logs FOR ALL
        TO service_role USING (TRUE) WITH CHECK (TRUE);
    END IF;
END $$;

-- Execution grants on stored procedures
DO $$ BEGIN
    REVOKE EXECUTE ON FUNCTION public.update_subscription_price_version(TEXT, TEXT, BIGINT, TIMESTAMPTZ, TEXT, TEXT, TEXT) FROM PUBLIC;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE EXECUTE ON FUNCTION public.update_subscription_price_version(TEXT, TEXT, BIGINT, TIMESTAMPTZ, TEXT, TEXT, TEXT) FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE EXECUTE ON FUNCTION public.update_subscription_price_version(TEXT, TEXT, BIGINT, TIMESTAMPTZ, TEXT, TEXT, TEXT) FROM authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.update_subscription_price_version(TEXT, TEXT, BIGINT, TIMESTAMPTZ, TEXT, TEXT, TEXT) TO service_role;
    END IF;

    REVOKE EXECUTE ON FUNCTION public.cancel_scheduled_price_version(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE EXECUTE ON FUNCTION public.cancel_scheduled_price_version(TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE EXECUTE ON FUNCTION public.cancel_scheduled_price_version(TEXT, TEXT, TEXT, TEXT, TEXT) FROM authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.cancel_scheduled_price_version(TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
    END IF;
END $$;
