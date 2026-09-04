-- ==============================================================================
-- MINGLEBOOTH INITIAL DATABASE SCHEMA & ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Organizations (Tenants)
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    plan_tier TEXT NOT NULL DEFAULT 'starter', -- 'starter' | 'pro' | 'business' | 'enterprise'
    subscription_status TEXT NOT NULL DEFAULT 'dev_mode', -- 'active' | 'expired' | 'trial' | 'dev_mode'
    subscription_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '365 days'),
    max_devices_quota INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. User Profiles & Organization Membership
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'VENDOR_STAFF', -- 'SUPER_ADMIN' | 'ADMIN' | 'VENDOR_OWNER' | 'VENDOR_STAFF'
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Hardware Devices
CREATE TABLE IF NOT EXISTS public.devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    hardware_fingerprint TEXT NOT NULL,
    device_name TEXT NOT NULL,
    os_type TEXT NOT NULL, -- 'mac' | 'windows' | 'linux' | 'ios' | 'android'
    app_version TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, hardware_fingerprint)
);

-- 4. Events
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'ready', -- 'draft' | 'ready' | 'active' | 'completed' | 'archived'
    output_type TEXT NOT NULL DEFAULT 'photo', -- 'photo' | 'gif' | 'both'
    config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    branding_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, slug)
);

-- 5. Event Templates
CREATE TABLE IF NOT EXISTS public.event_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    aspect_ratio TEXT NOT NULL DEFAULT '4:5',
    config_json JSONB NOT NULL,
    overlay_storage_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Captured Photos (30-Day Retention)
CREATE TABLE IF NOT EXISTS public.photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    template_id UUID REFERENCES public.event_templates(id),
    cloud_storage_path TEXT NOT NULL,
    thumbnail_storage_path TEXT,
    file_size_bytes BIGINT,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    qr_url TEXT NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    is_cloud_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

-- 7. Captured GIFs (30-Day Retention)
CREATE TABLE IF NOT EXISTS public.gifs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    cloud_storage_path TEXT NOT NULL,
    frames_count INTEGER NOT NULL DEFAULT 4,
    duration_ms INTEGER NOT NULL DEFAULT 1000,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    is_cloud_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

-- 8. Payments & Orders
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id TEXT UNIQUE NOT NULL, -- e.g. MB-2026-000001
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    plan_tier TEXT NOT NULL,
    amount_idr BIGINT NOT NULL,
    payment_status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED'
    payment_link_url TEXT,
    provider_transaction_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMPTZ
);

-- 9. Sync Queue Tracking
CREATE TABLE IF NOT EXISTS public.cloud_sync_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    entity_id UUID NOT NULL,
    entity_type TEXT NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indices for High-Performance Lookups & 30-day Cleanup Job
CREATE INDEX IF NOT EXISTS idx_photos_event ON public.photos(event_id);
CREATE INDEX IF NOT EXISTS idx_photos_retention ON public.photos(expires_at) WHERE is_cloud_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_gifs_retention ON public.gifs(expires_at) WHERE is_cloud_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_devices_org ON public.devices(organization_id);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gifs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Helper function: get user's organization
CREATE OR REPLACE FUNCTION public.get_auth_org_id()
RETURNS UUID AS $$
    SELECT organization_id FROM public.user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Organization Isolation Policies
CREATE POLICY "Vendor members can view their own organization"
    ON public.organizations FOR SELECT
    USING (id = public.get_auth_org_id());

CREATE POLICY "Vendor members can manage their own events"
    ON public.events FOR ALL
    USING (organization_id = public.get_auth_org_id());

CREATE POLICY "Vendor members can view their own photos"
    ON public.photos FOR ALL
    USING (organization_id = public.get_auth_org_id());

-- Public Guest Access: Guests can read photos by Photo UUID without auth
CREATE POLICY "Public guests can view individual photos"
    ON public.photos FOR SELECT
    TO anon, authenticated
    USING (is_cloud_deleted = FALSE);
