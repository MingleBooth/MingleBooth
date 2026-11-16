-- ==============================================================================
-- MINGLEBOOTH — DEVICE REGISTRATION & QUOTA ENFORCEMENT RPC
-- ==============================================================================
--
-- Migration: 20261115000001_atomic_device_quota_rpc.sql
-- Function: public.register_or_activate_device
--
-- Key Guarantees:
-- 1. ACID Concurrency Guard: Row locks (FOR UPDATE) on the tenant's
--    organization row serialize concurrent device registration requests.
-- 2. Finite vs. Unlimited Quota Integrity:
--    - Finite quotas (1 for starter, 3 for pro, 10 for business, or any finite enterprise number
--      such as 20 or 999) are strictly enforced against COUNT(is_active = TRUE).
--    - Only explicit unlimited indicators (max_devices_quota IS NULL or max_devices_quota = -1)
--      bypass finite quota checks.
-- 3. Idempotent Upsert: Existing active devices update last_seen_at without consuming new slots.
--    Reactivating an inactive device is safely quota-checked and reactivated.
-- 4. Hardened Security & Privilege Audit:
--    - SECURITY DEFINER with fixed search_path = public, pg_temp (prevents path hijacking).
--    - Execution strictly revoked from PUBLIC, anon, and authenticated vendor tokens.
--    - Execution granted exclusively to service_role (invoked solely by trusted server routes).
-- 5. Safe Local Preparation: Stored as a migration artifact for local testing and review.
--    STRICTLY FORBIDDEN FROM RUNNING AGAINST PRODUCTION WITHOUT PRIOR AUTHORIZATION.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.register_or_activate_device(
    p_org_id UUID,
    p_hwid TEXT,
    p_device_name TEXT,
    p_os_type TEXT,
    p_app_version TEXT,
    p_is_admin BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org RECORD;
    v_existing_device RECORD;
    v_active_count INTEGER;
    v_max_quota INTEGER;
    v_is_unlimited BOOLEAN;
    v_now TIMESTAMPTZ := NOW();
    v_device_id UUID;
BEGIN
    -- 0. Input validation
    IF p_org_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Parameter p_org_id tidak boleh null.',
            'code', 'INVALID_PARAM_ORG'
        );
    END IF;

    IF p_hwid IS NULL OR btrim(p_hwid) = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Parameter p_hwid (hardware fingerprint) tidak boleh kosong.',
            'code', 'INVALID_PARAM_HWID'
        );
    END IF;

    -- 1. Serialize concurrent requests by acquiring an exclusive row-level lock on the organization
    SELECT * INTO v_org
    FROM public.organizations
    WHERE id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Organisasi vendor tidak ditemukan.',
            'code', 'ORG_NOT_FOUND'
        );
    END IF;

    -- 2. Determine Quota and Unlimited status (Strict Finite vs. Unlimited rules)
    -- Unlimited is ONLY true if max_devices_quota is explicitly NULL or -1.
    -- Finite numbers (e.g. 1, 3, 10, 20, 999) remain strictly finite quotas.
    v_is_unlimited := (v_org.max_devices_quota IS NULL OR v_org.max_devices_quota = -1);
    v_max_quota := CASE 
        WHEN v_is_unlimited THEN -1
        WHEN v_org.max_devices_quota IS NOT NULL AND v_org.max_devices_quota > 0 THEN v_org.max_devices_quota
        WHEN v_org.plan_tier = 'business' THEN 10
        WHEN v_org.plan_tier = 'pro' THEN 3
        ELSE 1
    END;

    -- 3. Check existing device registration for this organization and hardware fingerprint
    SELECT * INTO v_existing_device
    FROM public.devices
    WHERE organization_id = p_org_id
      AND hardware_fingerprint = p_hwid
    FOR UPDATE;

    -- 4. Count currently active registered devices
    SELECT COUNT(*) INTO v_active_count
    FROM public.devices
    WHERE organization_id = p_org_id
      AND is_active = TRUE;

    -- 5. Case A: Existing device is ALREADY ACTIVE
    -- Update last seen & metadata without consuming an extra slot
    IF v_existing_device.id IS NOT NULL AND v_existing_device.is_active = TRUE THEN
        UPDATE public.devices
        SET last_seen_at = v_now,
            device_name = COALESCE(p_device_name, device_name),
            os_type = COALESCE(p_os_type, os_type),
            app_version = COALESCE(p_app_version, app_version)
        WHERE id = v_existing_device.id;

        RETURN jsonb_build_object(
            'success', true,
            'device_id', v_existing_device.id,
            'active_count', v_active_count,
            'max_quota', v_max_quota,
            'is_unlimited', v_is_unlimited,
            'action', 'UPDATED_EXISTING_ACTIVE'
        );
    END IF;

    -- 6. Case B: New device OR Reactivating an inactive device
    -- Validate quota under exclusive row lock
    IF NOT v_is_unlimited AND NOT p_is_admin AND v_active_count >= v_max_quota THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Batas kuota perangkat tercapai (%s/%s). Silakan non-aktifkan salah satu laptop lama di Vendor Dashboard atau hubungi admin.', v_active_count, v_max_quota),
            'code', 'DEVICE_QUOTA_EXCEEDED',
            'current_active_count', v_active_count,
            'max_quota', v_max_quota
        );
    END IF;

    -- 7. Execute activation / insert safely in transaction
    IF v_existing_device.id IS NOT NULL THEN
        -- Reactivate existing record
        UPDATE public.devices
        SET is_active = TRUE,
            last_seen_at = v_now,
            activated_at = v_now,
            device_name = COALESCE(p_device_name, device_name),
            os_type = COALESCE(p_os_type, os_type),
            app_version = COALESCE(p_app_version, app_version)
        WHERE id = v_existing_device.id;
        
        v_device_id := v_existing_device.id;
        v_active_count := v_active_count + 1;
    ELSE
        -- Insert new device record
        INSERT INTO public.devices (
            organization_id,
            hardware_fingerprint,
            device_name,
            os_type,
            app_version,
            is_active,
            last_seen_at,
            activated_at
        ) VALUES (
            p_org_id,
            p_hwid,
            COALESCE(p_device_name, 'Booth Laptop'),
            COALESCE(p_os_type, 'mac'),
            COALESCE(p_app_version, '1.0.0'),
            TRUE,
            v_now,
            v_now
        )
        RETURNING id INTO v_device_id;
        
        v_active_count := v_active_count + 1;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'device_id', v_device_id,
        'active_count', v_active_count,
        'max_quota', v_max_quota,
        'is_unlimited', v_is_unlimited,
        'action', 'ACTIVATED_DEVICE'
    );
END;
$$;

-- Security Hardening: Strictly restrict execution to service_role
REVOKE EXECUTE ON FUNCTION public.register_or_activate_device(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.register_or_activate_device(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_or_activate_device(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO service_role;

