-- ==============================================================================
-- MINGLEBOOTH PHASE 15.4.3.9 — PROPOSED SUBSCRIPTION STATE HARDENING MIGRATION
-- ==============================================================================
-- Migration: 20261009000003_subscription_state_hardening.sql
-- Status: PREPARED / NOT DEPLOYED (Strict Safety Invariant)
--
-- Key Guarantees:
-- 1. Default Subscription Status Hardening:
--    Alters public.organizations.subscription_status default from 'dev_mode' to 'pending_payment'.
--    Ensures that any organization inserted without an explicit status defaults to an unpaid, non-entitled state.
-- 2. Nullable Subscription Expiry:
--    Drops NOT NULL constraint from public.organizations.subscription_expires_at and sets DEFAULT NULL.
--    Allows newly created unpaid organizations to have a NULL expiration timestamp rather than an arbitrary epoch
--    or misleading future date before payment is authoritatively confirmed.
-- 3. Backward Compatibility:
--    Existing rows remain untouched. Applications handling NULL expiry dates are fully compatible.
-- ==============================================================================

-- 1. Update default for subscription_status to 'pending_payment'
ALTER TABLE public.organizations 
    ALTER COLUMN subscription_status SET DEFAULT 'pending_payment';

-- 2. Allow subscription_expires_at to be NULL for unpaid accounts and drop default
ALTER TABLE public.organizations 
    ALTER COLUMN subscription_expires_at DROP NOT NULL;

ALTER TABLE public.organizations 
    ALTER COLUMN subscription_expires_at SET DEFAULT NULL;

-- 3. Document table columns
COMMENT ON COLUMN public.organizations.subscription_status IS 
    'Subscription entitlement state: pending_payment (default for new unpaid orgs), active (paid), expired, dev_mode (local/test only)';

COMMENT ON COLUMN public.organizations.subscription_expires_at IS 
    'Timestamp when paid entitlement expires. NULL for pending_payment accounts until first payment settlement.';
