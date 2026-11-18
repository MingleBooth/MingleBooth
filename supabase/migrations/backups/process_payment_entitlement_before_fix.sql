-- ==============================================================================
-- MINGLEBOOTH PHASE 15.4.3 — PRODUCTION BILLING IDEMPOTENCY & ENTITLEMENT RPC
-- ==============================================================================
--
-- Migration: 20261009000001_billing_idempotency_rpc.sql
-- Function: public.process_payment_entitlement
--
-- Key Guarantees:
-- 1. Atomic Transaction: Payment record and organization entitlement are mutated
--    within a single PostgreSQL ACID transaction. A downstream failure rolls back
--    the entire transaction automatically.
-- 2. Concurrency & Idempotency: Row locks (FOR UPDATE) on payments and organizations
--    serialize parallel webhook deliveries for the same order reference.
-- 3. Authoritative Order Validation: Pre-registered orders enforce organization
--    immutability and reject underpaid transaction amounts.
-- 4. Transaction Reuse Protection: Rejects attempts to reuse a provider_transaction_id
--    already claimed by another order.
-- 5. Hardened Security: SECURITY DEFINER with fixed search_path = public, pg_temp.
--    Execution strictly granted to service_role; explicitly revoked from public, anon,
--    and authenticated vendor tokens.
-- 6. Safe Re-execution: Idempotent DDL (CREATE OR REPLACE, GRANT/REVOKE) safe to run
--    multiple times without data loss.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.process_payment_entitlement(
    p_order_id TEXT,
    p_org_id UUID,
    p_plan_tier TEXT,
    p_amount_idr BIGINT,
    p_duration_days INTEGER,
    p_provider_transaction_id TEXT DEFAULT NULL,
    p_payment_link_url TEXT DEFAULT 'https://lynk.id'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_existing_pay RECORD;
    v_org RECORD;
    v_target_org_id UUID;
    v_final_plan TEXT;
    v_max_devices INTEGER;
    v_base_time TIMESTAMPTZ;
    v_new_expiry TIMESTAMPTZ;
    v_is_active BOOLEAN;
BEGIN
    -- 0. Input validation
    IF p_order_id IS NULL OR btrim(p_order_id) = '' THEN
        RAISE EXCEPTION 'MISSING_ORDER_ID: order_id is required';
    END IF;

    -- Validate plan tier: do not silently accept invalid or coerce unknown plan
    IF p_plan_tier IS NULL OR p_plan_tier NOT IN ('starter', 'pro', 'business') THEN
        RAISE EXCEPTION 'INVALID_PLAN_TIER: Plan % is not a recognized tier (must be starter, pro, or business)', p_plan_tier;
    END IF;

    -- Validate payment amount
    IF p_amount_idr IS NULL OR p_amount_idr <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: Payment amount must be greater than zero';
    END IF;

    -- Validate duration: permitted durations are strictly 30 (monthly) or 365 (yearly)
    IF p_duration_days IS NULL OR p_duration_days NOT IN (30, 365) THEN
        RAISE EXCEPTION 'INVALID_DURATION: Duration % days is not permitted (must be 30 or 365)', p_duration_days;
    END IF;

    -- 1. Check & Lock payment record if present
    SELECT * INTO v_existing_pay
    FROM public.payments
    WHERE order_id = p_order_id
    FOR UPDATE;

    -- 2. Idempotency Check: If already PAID, handle duplicate delivery safely
    IF v_existing_pay IS NOT NULL AND v_existing_pay.payment_status = 'PAID' THEN
        -- Cross-tenant validation on duplicate deliveries:
        IF p_org_id IS NOT NULL AND v_existing_pay.organization_id IS NOT NULL AND p_org_id <> v_existing_pay.organization_id THEN
            RAISE EXCEPTION 'ORGANIZATION_MISMATCH: Order % is bound to % but requested %',
                p_order_id, v_existing_pay.organization_id, p_org_id;
        END IF;

        SELECT * INTO v_org
        FROM public.organizations
        WHERE id = v_existing_pay.organization_id
        FOR UPDATE;

        -- Authoritative plan is derived ONLY from the trusted payment record, NEVER untrusted incoming data
        v_final_plan := COALESCE(v_existing_pay.plan_tier, v_org.plan_tier, 'pro');
        IF v_final_plan = 'business' THEN
            v_max_devices := 10;
        ELSIF v_final_plan = 'starter' THEN
            v_max_devices := 1;
        ELSE
            v_final_plan := 'pro';
            v_max_devices := 3;
        END IF;

        -- Self-healing check: Only recover if organization was left in 'pending_payment' or missing expiry
        -- (i.e. payment was recorded as PAID but initial entitlement activation never completed).
        -- Must NOT override valid existing expiration timestamp or grant fresh time on expired subscriptions!
        IF v_org IS NOT NULL AND (v_org.subscription_status = 'pending_payment' OR v_org.subscription_expires_at IS NULL) THEN
            v_new_expiry := NOW() + (p_duration_days || ' days')::INTERVAL;

            UPDATE public.organizations
            SET subscription_status = 'active',
                subscription_expires_at = v_new_expiry,
                plan_tier = v_final_plan,
                max_devices_quota = v_max_devices,
                updated_at = NOW()
            WHERE id = v_org.id;

            RETURN jsonb_build_object(
                'success', true,
                'is_duplicate', true,
                'already_paid', true,
                'order_id', p_order_id,
                'organization_id', v_existing_pay.organization_id,
                'plan_tier', v_final_plan,
                'max_devices_quota', v_max_devices,
                'expires_at', v_new_expiry,
                'duration_days', p_duration_days,
                'message', 'Payment previously recorded; recovered missing subscription entitlement'
            );
        END IF;

        -- Normal Duplicate: Return existing org state without modifying expiration timestamp or adding days
        RETURN jsonb_build_object(
            'success', true,
            'is_duplicate', true,
            'already_paid', true,
            'order_id', p_order_id,
            'organization_id', v_existing_pay.organization_id,
            'plan_tier', v_final_plan,
            'max_devices_quota', COALESCE(v_org.max_devices_quota, v_max_devices),
            'expires_at', v_org.subscription_expires_at,
            'duration_days', p_duration_days,
            'message', 'Payment already processed (idempotent)'
        );
    END IF;

    -- 3. Check for provider_transaction_id reuse by a different order
    IF p_provider_transaction_id IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.payments
            WHERE provider_transaction_id = p_provider_transaction_id
              AND order_id <> p_order_id
              AND payment_status = 'PAID'
        ) THEN
            RAISE EXCEPTION 'PROVIDER_TRANSACTION_REUSED: Transaction % was already claimed by another order',
                p_provider_transaction_id;
        END IF;
    END IF;

    -- 4. Authoritative Order Validation against Pre-registered Order (if existing order found)
    IF v_existing_pay IS NOT NULL THEN
        -- a. Validate Organization Binding
        IF v_existing_pay.organization_id IS NOT NULL THEN
            v_target_org_id := v_existing_pay.organization_id;
            IF p_org_id IS NOT NULL AND p_org_id <> v_target_org_id THEN
                RAISE EXCEPTION 'ORGANIZATION_MISMATCH: Order % is bound to % but requested %',
                    p_order_id, v_target_org_id, p_org_id;
            END IF;
        ELSE
            v_target_org_id := p_org_id;
        END IF;

        -- b. Validate Plan Tier Matching (Prevent lower-priced order from settling as higher plan)
        IF v_existing_pay.plan_tier IS NOT NULL AND v_existing_pay.plan_tier <> p_plan_tier THEN
            RAISE EXCEPTION 'PLAN_MISMATCH: Order % is pre-registered for % plan but requested %',
                p_order_id, v_existing_pay.plan_tier, p_plan_tier;
        END IF;

        -- c. Validate Amount (Exact integer IDR match)
        IF v_existing_pay.amount_idr IS NOT NULL AND p_amount_idr < v_existing_pay.amount_idr THEN
            RAISE EXCEPTION 'PAYMENT_AMOUNT_INSUFFICIENT: Received % IDR, expected % IDR',
                p_amount_idr, v_existing_pay.amount_idr;
        END IF;

        IF v_existing_pay.amount_idr IS NOT NULL AND p_amount_idr > v_existing_pay.amount_idr THEN
            RAISE EXCEPTION 'PAYMENT_AMOUNT_MISMATCH: Received % IDR, expected % IDR',
                p_amount_idr, v_existing_pay.amount_idr;
        END IF;

        -- d. Validate Permitted Duration against order snapshot (No brittle amount thresholds)
        IF to_jsonb(v_existing_pay) ? 'duration_days' AND (to_jsonb(v_existing_pay)->>'duration_days') IS NOT NULL THEN
            IF p_duration_days <> (to_jsonb(v_existing_pay)->>'duration_days')::INTEGER THEN
                RAISE EXCEPTION 'INVALID_DURATION: Order % duration is % days, cannot settle with % days',
                    p_order_id, (to_jsonb(v_existing_pay)->>'duration_days'), p_duration_days;
            END IF;
        END IF;

        IF to_jsonb(v_existing_pay) ? 'billing_interval' AND (to_jsonb(v_existing_pay)->>'billing_interval') IS NOT NULL THEN
            IF (to_jsonb(v_existing_pay)->>'billing_interval') = 'monthly' AND p_duration_days <> 30 THEN
                RAISE EXCEPTION 'INVALID_DURATION: Monthly order % cannot be settled with % days duration',
                    p_order_id, p_duration_days;
            END IF;
            IF (to_jsonb(v_existing_pay)->>'billing_interval') = 'yearly' AND p_duration_days <> 365 THEN
                RAISE EXCEPTION 'INVALID_DURATION: Yearly order % cannot be settled with % days duration',
                    p_order_id, p_duration_days;
            END IF;
        END IF;

        -- Authoritative plan is the pre-registered order plan
        v_final_plan := v_existing_pay.plan_tier;
    ELSE
        -- No pre-registered order: Use validated input parameters
        v_target_org_id := p_org_id;
        v_final_plan := p_plan_tier;
    END IF;

    IF v_target_org_id IS NULL THEN
        RAISE EXCEPTION 'MISSING_ORGANIZATION: No organization found for order %', p_order_id;
    END IF;

    -- 5. Lock & Validate target organization
    SELECT * INTO v_org
    FROM public.organizations
    WHERE id = v_target_org_id
    FOR UPDATE;

    IF v_org IS NULL THEN
        RAISE EXCEPTION 'ORGANIZATION_NOT_FOUND: Organization % does not exist', v_target_org_id;
    END IF;

    -- 6. Determine device quota for authoritative plan
    IF v_final_plan = 'business' THEN
        v_max_devices := 10;
    ELSIF v_final_plan = 'starter' THEN
        v_max_devices := 1;
    ELSE
        v_final_plan := 'pro';
        v_max_devices := 3;
    END IF;

    -- 7. Calculate renewal date
    -- Renewal before expiry preserves remaining time (currentExpiry > now && status = 'active')
    -- Renewal after expiry starts fresh from current transaction timestamp (NOW())
    v_is_active := (v_org.subscription_status = 'active' AND v_org.subscription_expires_at > NOW());
    IF v_is_active THEN
        v_base_time := v_org.subscription_expires_at;
    ELSE
        v_base_time := NOW();
    END IF;

    v_new_expiry := v_base_time + (p_duration_days || ' days')::INTERVAL;

    -- 8. Update Organization Entitlements
    UPDATE public.organizations
    SET subscription_status = 'active',
        subscription_expires_at = v_new_expiry,
        plan_tier = v_final_plan,
        max_devices_quota = v_max_devices,
        updated_at = NOW()
    WHERE id = v_target_org_id;

    -- 9. Insert or Transition Payment Record to PAID
    IF v_existing_pay IS NOT NULL THEN
        UPDATE public.payments
        SET payment_status = 'PAID',
            paid_at = NOW(),
            provider_transaction_id = COALESCE(p_provider_transaction_id, v_existing_pay.provider_transaction_id),
            amount_idr = COALESCE(p_amount_idr, v_existing_pay.amount_idr),
            plan_tier = v_final_plan
        WHERE id = v_existing_pay.id;
    ELSE
        INSERT INTO public.payments (
            order_id,
            organization_id,
            plan_tier,
            amount_idr,
            payment_status,
            payment_link_url,
            provider_transaction_id,
            paid_at
        ) VALUES (
            p_order_id,
            v_target_org_id,
            v_final_plan,
            p_amount_idr,
            'PAID',
            p_payment_link_url,
            p_provider_transaction_id,
            NOW()
        );
    END IF;

    -- 10. Return atomic result
    RETURN jsonb_build_object(
        'success', true,
        'is_duplicate', false,
        'already_paid', false,
        'order_id', p_order_id,
        'organization_id', v_target_org_id,
        'plan_tier', v_final_plan,
        'max_devices_quota', v_max_devices,
        'expires_at', v_new_expiry,
        'duration_days', p_duration_days,
        'message', 'Subscription successfully activated/renewed'
    );
END;
$$;

-- Security Grants: Strictly restrict function execution to service_role (deny anon and authenticated vendors)
REVOKE EXECUTE ON FUNCTION public.process_payment_entitlement(TEXT, UUID, TEXT, BIGINT, INTEGER, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_payment_entitlement(TEXT, UUID, TEXT, BIGINT, INTEGER, TEXT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_payment_entitlement(TEXT, UUID, TEXT, BIGINT, INTEGER, TEXT, TEXT) TO service_role;
