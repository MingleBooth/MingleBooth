-- ==============================================================================
-- MINGLEBOOTH — MIGRATION 003: GALLERY READ SECURITY HARDENING (REFINED)
-- File: supabase/migrations/20261118000003_gallery_read_security_hardening.sql
--
-- Objectives:
-- 1. Resolve SEC-02 (unauthenticated global photo/gif enumeration vulnerability).
--    Drop legacy anonymous PostgREST SELECT policies on public.photos & public.gifs.
-- 2. Resolve Finding M-01 (Idempotency):
--    Use unconditional DROP POLICY IF EXISTS before CREATE POLICY to prevent
--    silent skips when policies exist with differing definitions.
-- 3. Resolve Finding M-02 (Principle of Least Privilege):
--    Scope vendor policies strictly to SELECT for authenticated roles.
--    Revoke direct INSERT, UPDATE, and DELETE capabilities via PostgREST; all mutations
--    must be handled server-side by Next.js route handlers using service_role.
-- 4. Enforce Strict Multi-Tenant Isolation:
--    Scope access strictly by event ownership via verified auth organization ID.
-- ==============================================================================

-- 1. DROP GLOBAL ANONYMOUS ENUMERATION POLICIES ON public.photos & public.gifs
-- Drop both Migration 001 and potential intermediate policy names for complete safety.
DROP POLICY IF EXISTS "Public guests can view individual photos" ON public.photos;
DROP POLICY IF EXISTS "Public guests can view ready photos" ON public.photos;
DROP POLICY IF EXISTS "Public guests can view individual gifs" ON public.gifs;
DROP POLICY IF EXISTS "Public guests can view ready gifs" ON public.gifs;

-- 2. REFINED IDEMPOTENT LEAST-PRIVILEGE POLICY FOR VENDORS ON public.photos (SELECT ONLY)
-- Vendors can view only photos belonging to events owned by their verified organization.
-- Direct mutations (INSERT/UPDATE/DELETE) via PostgREST are blocked (handled via service_role).
DROP POLICY IF EXISTS "Vendor members can view their own photos" ON public.photos;
CREATE POLICY "Vendor members can view their own photos"
  ON public.photos FOR SELECT
  TO authenticated
  USING (event_id IN (SELECT id FROM public.events WHERE organization_id = public.get_auth_org_id()));

-- 3. REFINED IDEMPOTENT LEAST-PRIVILEGE POLICY FOR VENDORS ON public.gifs (SELECT ONLY)
-- Vendors can view only GIFs belonging to events owned by their verified organization.
DROP POLICY IF EXISTS "Vendor members can view their own gifs" ON public.gifs;
CREATE POLICY "Vendor members can view their own gifs"
  ON public.gifs FOR SELECT
  TO authenticated
  USING (event_id IN (SELECT id FROM public.events WHERE organization_id = public.get_auth_org_id()));

-- 4. RE-CONFIRM ROW LEVEL SECURITY IS STRICTLY ENABLED
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gifs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_upload_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
