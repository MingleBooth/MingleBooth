-- ==============================================================================
-- MINGLEBOOTH — MIGRATION 002: CLOUDFLARE R2 GALLERY STORAGE INTEGRATION
-- Migration File: supabase/migrations/20261118000002_gallery_r2_schema.sql
--
-- STRICT OPERATIONAL NOTE:
-- This migration file is prepared for STAGING DEPLOYMENT ONLY.
-- DO NOT execute or apply this migration against production database 'qnayeagrksnkeelthehq'.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. RELAX LEGACY CONSTRAINTS FOR PENDING ASSET LIFECYCLE
-- ------------------------------------------------------------------------------
-- Allow cloud_storage_path, qr_url, width, and height to be nullable during upload initialization.
-- They will be populated upon confirmation when upload_status transitions to 'READY'.
-- Fabricated default dimensions (1200x1800) are explicitly dropped.
ALTER TABLE public.photos
  ALTER COLUMN cloud_storage_path DROP NOT NULL,
  ALTER COLUMN qr_url DROP NOT NULL,
  ALTER COLUMN width DROP NOT NULL,
  ALTER COLUMN height DROP NOT NULL;

ALTER TABLE public.photos
  ALTER COLUMN width DROP DEFAULT,
  ALTER COLUMN height DROP DEFAULT;

ALTER TABLE public.gifs
  ALTER COLUMN cloud_storage_path DROP NOT NULL;

-- ------------------------------------------------------------------------------
-- 2. SAFE ADDITIVE EXPANSION OF public.photos
-- ------------------------------------------------------------------------------
-- Step 2a: Add new columns as nullable initially WITHOUT DEFAULT to prevent PostgreSQL 11+
-- metadata rewrites that would overwrite authentic historical captured_at timestamps.
ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS session_photo_id TEXT,
  ADD COLUMN IF NOT EXISTS upload_status TEXT,
  ADD COLUMN IF NOT EXISTS storage_provider TEXT,
  ADD COLUMN IF NOT EXISTS active_upload_attempt_id UUID,
  ADD COLUMN IF NOT EXISTS upload_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS upload_lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS raw_files JSONB,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Step 2b: Safe backfill of historical legacy rows.
-- Preserves authentic captured_at timestamp for created_at and updated_at.
-- Legacy photos stored in Supabase Storage default to 'supabase' and 'UPLOADED'.
UPDATE public.photos
SET
  storage_provider = COALESCE(storage_provider, 'supabase'),
  upload_status = COALESCE(upload_status, 'UPLOADED'),
  raw_files = COALESCE(raw_files, '[]'::jsonb),
  created_at = COALESCE(captured_at, created_at, NOW()),
  updated_at = COALESCE(captured_at, updated_at, NOW()),
  session_photo_id = COALESCE(
    session_photo_id,
    substring(cloud_storage_path from 'events/[^/]+/([^.]+)\.')
  )
WHERE storage_provider IS NULL
   OR upload_status IS NULL
   OR raw_files IS NULL
   OR created_at IS NULL
   OR updated_at IS NULL;

-- Step 2c: Enforce NOT NULL and DEFAULTS only after backfill validation.
ALTER TABLE public.photos
  ALTER COLUMN storage_provider SET DEFAULT 'supabase',
  ALTER COLUMN storage_provider SET NOT NULL,
  ALTER COLUMN upload_status SET DEFAULT 'PENDING',
  ALTER COLUMN upload_status SET NOT NULL,
  ALTER COLUMN raw_files SET DEFAULT '[]'::jsonb,
  ALTER COLUMN raw_files SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET NOT NULL;

-- Step 2d: Add Check Constraints.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_photos_storage_provider') THEN
    ALTER TABLE public.photos ADD CONSTRAINT chk_photos_storage_provider
      CHECK (storage_provider IN ('supabase', 'r2'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_photos_upload_status') THEN
    ALTER TABLE public.photos ADD CONSTRAINT chk_photos_upload_status
      CHECK (upload_status IN ('PENDING', 'UPLOADED', 'VERIFYING', 'READY', 'FAILED', 'QUARANTINED'));
  END IF;
END $$;

-- Step 2e: High-performance partial and composite indexes.
CREATE INDEX IF NOT EXISTS idx_photos_event_status
  ON public.photos(event_id, upload_status)
  WHERE is_cloud_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_photos_session_lookup
  ON public.photos(organization_id, event_id, session_photo_id);

-- Partial Unique Index: Strictly ONE active photo record per session in an event (Phase 2.2F.10).
CREATE UNIQUE INDEX IF NOT EXISTS uidx_photos_active_session
  ON public.photos (organization_id, event_id, session_photo_id)
  WHERE is_cloud_deleted = FALSE
  AND session_photo_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_photos_storage_provider
  ON public.photos(storage_provider);

-- Step 2f: Safe additive expansion of public.gifs
ALTER TABLE public.gifs
  ADD COLUMN IF NOT EXISTS session_photo_id TEXT,
  ADD COLUMN IF NOT EXISTS storage_provider TEXT DEFAULT 'supabase';

UPDATE public.gifs
SET session_photo_id = COALESCE(
  session_photo_id,
  substring(cloud_storage_path from 'events/[^/]+/(?:gifs/)?([^.]+)\.')
),
storage_provider = COALESCE(storage_provider, 'supabase')
WHERE session_photo_id IS NULL OR storage_provider IS NULL;

CREATE INDEX IF NOT EXISTS idx_gifs_session_lookup
  ON public.gifs (organization_id, event_id, session_photo_id);

-- ------------------------------------------------------------------------------
-- 3. AUTHORITATIVE UPLOAD ATTEMPT REGISTRY (gallery_upload_attempts)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gallery_upload_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  photo_id UUID REFERENCES public.photos(id) ON DELETE CASCADE,
  session_photo_id TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('photo', 'thumbnail', 'gif', 'raw')),
  raw_index INTEGER CHECK (
    (asset_type = 'raw' AND raw_index BETWEEN 1 AND 50) OR
    (asset_type != 'raw' AND raw_index IS NULL)
  ),
  storage_provider TEXT NOT NULL DEFAULT 'r2' CHECK (storage_provider IN ('supabase', 'r2')),
  bucket_name TEXT NOT NULL,
  object_key TEXT NOT NULL,
  expected_size_bytes BIGINT,
  actual_size_bytes BIGINT,
  mime_type TEXT NOT NULL,
  etag TEXT,
  attempt_status TEXT NOT NULL DEFAULT 'ISSUED' CHECK (
    attempt_status IN ('ISSUED', 'CONFIRMED', 'EXPIRED', 'SUPERSEDED', 'FAILED')
  ),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial Unique Index: Strictly ONE active ISSUED attempt per asset at any time.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_active_asset_attempt
  ON public.gallery_upload_attempts (event_id, session_photo_id, asset_type, COALESCE(raw_index, -1))
  WHERE attempt_status = 'ISSUED';

-- Query indexing for lookups by event and session.
CREATE INDEX IF NOT EXISTS idx_upload_attempts_lookup
  ON public.gallery_upload_attempts (organization_id, event_id, session_photo_id, asset_type);

CREATE INDEX IF NOT EXISTS idx_upload_attempts_expiry
  ON public.gallery_upload_attempts (expires_at)
  WHERE attempt_status = 'ISSUED';

-- ------------------------------------------------------------------------------
-- 4. R2 ORPHAN QUARANTINE MANIFEST (r2_orphan_quarantine_manifest)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.r2_orphan_quarantine_manifest (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bucket_name TEXT NOT NULL,
  object_key TEXT NOT NULL,
  file_size_bytes BIGINT,
  etag TEXT,
  quarantined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  quarantine_reason TEXT NOT NULL,
  purged_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'QUARANTINED' CHECK (
    status IN ('QUARANTINED', 'REVIEWED', 'PURGED', 'RESTORED')
  )
);

CREATE INDEX IF NOT EXISTS idx_quarantine_status
  ON public.r2_orphan_quarantine_manifest(status, quarantined_at);

-- ------------------------------------------------------------------------------
-- 5. ATOMIC STORED PROCEDURE: append_photo_raw_file
-- ------------------------------------------------------------------------------
-- Guarantees:
-- 1. Deterministic lock order: Locks public.photos first (FOR UPDATE), then gallery_upload_attempts (FOR UPDATE).
-- 2. Strict attempt binding: Validates asset_type='raw', raw_index, object_key, expected_size_bytes, storage_provider.
-- 3. Short-circuit-proof casting with length-bounded regex validation.
-- 4. Safe expired attempt handling: Updates attempt to EXPIRED and commits via non-exception return.
-- 5. Full idempotency: Repeated confirmation with exact matching metadata returns existing array.
CREATE OR REPLACE FUNCTION public.append_photo_raw_file(
  p_organization_id UUID,
  p_event_id UUID,
  p_photo_id UUID,
  p_upload_attempt_id UUID,
  p_raw_index INTEGER,
  p_file_size_bytes BIGINT,
  p_storage_path TEXT,
  p_etag TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
  v_role TEXT;
  v_session_photo_id TEXT;
  v_current_raw JSONB;
  v_existing_item JSONB;
  v_updated_raw JSONB;
  v_new_entry JSONB;
  v_attempt_status TEXT;
  v_attempt_expires TIMESTAMPTZ;
  v_attempt_asset_type TEXT;
  v_attempt_raw_index INTEGER;
  v_attempt_object_key TEXT;
  v_attempt_expected_size BIGINT;
  v_attempt_storage_provider TEXT;
BEGIN
  -- Step 1: Authorization - only service_role or superuser
  v_role := NULLIF(current_setting('request.jwt.claim.role', true), '');
  IF v_role IS DISTINCT FROM 'service_role' AND current_user != 'service_role' AND session_user != 'postgres' THEN
    RAISE EXCEPTION 'Access denied: append_photo_raw_file requires service_role'
      USING ERRCODE = '42501';
  END IF;

  -- Step 2: Validate Non-Null Parameters
  IF p_organization_id IS NULL OR p_event_id IS NULL OR p_photo_id IS NULL OR p_upload_attempt_id IS NULL THEN
    RAISE EXCEPTION 'Missing required identifiers: organization_id, event_id, photo_id, and upload_attempt_id are required'
      USING ERRCODE = '22023';
  END IF;

  -- Step 3: Validate Numeric Bounds
  IF p_raw_index IS NULL OR p_raw_index < 1 OR p_raw_index > 50 THEN
    RAISE EXCEPTION 'Invalid raw_index: must be an integer between 1 and 50 (got %)', p_raw_index
      USING ERRCODE = '22023';
  END IF;

  IF p_file_size_bytes IS NULL OR p_file_size_bytes < 1 OR p_file_size_bytes > 52428800 THEN
    RAISE EXCEPTION 'Invalid file_size_bytes: must be between 1B and 50MB (got %)', p_file_size_bytes
      USING ERRCODE = '22023';
  END IF;

  -- Step 4: Storage Path Traversal and Length Check
  IF p_storage_path IS NULL
     OR length(p_storage_path) < 10
     OR length(p_storage_path) > 512
     OR p_storage_path ~ '\.\.'
     OR NOT (p_storage_path ~ '^[a-zA-Z0-9_\-\./]+$') THEN
    RAISE EXCEPTION 'Invalid storage_path: path traversal or illegal characters detected: %', p_storage_path
      USING ERRCODE = '22023';
  END IF;

  -- Step 5: MANDATORY LOCK ORDER - Lock Photo Row First (FOR UPDATE)
  SELECT session_photo_id, COALESCE(raw_files, '[]'::JSONB)
  INTO v_session_photo_id, v_current_raw
  FROM public.photos
  WHERE id = p_photo_id
    AND organization_id = p_organization_id
    AND event_id = p_event_id
    AND is_cloud_deleted = FALSE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active photo record not found for id % (org: %, event: %)',
      p_photo_id, p_organization_id, p_event_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Step 6: MANDATORY LOCK ORDER - Lock Attempt Row Second (FOR UPDATE)
  -- Select all verification metadata to strictly bind attempt to this confirmation
  SELECT
    attempt_status,
    expires_at,
    asset_type,
    raw_index,
    object_key,
    expected_size_bytes,
    storage_provider
  INTO
    v_attempt_status,
    v_attempt_expires,
    v_attempt_asset_type,
    v_attempt_raw_index,
    v_attempt_object_key,
    v_attempt_expected_size,
    v_attempt_storage_provider
  FROM public.gallery_upload_attempts
  WHERE id = p_upload_attempt_id
    AND organization_id = p_organization_id
    AND event_id = p_event_id
    AND photo_id = p_photo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Upload attempt % not found for photo % (or photo_id is NULL/mismatched)',
      p_upload_attempt_id, p_photo_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Step 7: BIND ATTEMPT METADATA CHECKS (Strict verification against issued attempt)
  IF v_attempt_asset_type != 'raw' THEN
    RAISE EXCEPTION 'Invalid asset_type: attempt % is for "%", but append_photo_raw_file only permits "raw"',
      p_upload_attempt_id, v_attempt_asset_type
      USING ERRCODE = '22023';
  END IF;

  IF v_attempt_raw_index IS DISTINCT FROM p_raw_index THEN
    RAISE EXCEPTION 'Mismatched raw_index: attempt expects %, but confirmation requested %',
      v_attempt_raw_index, p_raw_index
      USING ERRCODE = '22023';
  END IF;

  IF v_attempt_object_key IS DISTINCT FROM p_storage_path THEN
    RAISE EXCEPTION 'Mismatched storage_path: attempt expects "%", but confirmation requested "%"',
      v_attempt_object_key, p_storage_path
      USING ERRCODE = '22023';
  END IF;

  IF v_attempt_expected_size IS NOT NULL AND v_attempt_expected_size != p_file_size_bytes THEN
    RAISE EXCEPTION 'Mismatched file size: attempt expected % bytes, but confirmation reported % bytes',
      v_attempt_expected_size, p_file_size_bytes
      USING ERRCODE = '22023';
  END IF;

  IF v_attempt_storage_provider != 'r2' THEN
    RAISE EXCEPTION 'Attempt % specifies unsupported storage_provider "%" (expected "r2")',
      p_upload_attempt_id, v_attempt_storage_provider
      USING ERRCODE = '22023';
  END IF;

  -- Step 8A: Idempotent Retry on an Already-CONFIRMED Attempt
  IF v_attempt_status = 'CONFIRMED' THEN
    SELECT item INTO v_existing_item
    FROM jsonb_array_elements(v_current_raw) AS item
    WHERE (item->>'raw_index')::integer = p_raw_index
    LIMIT 1;

    IF v_existing_item IS NOT NULL AND
       (v_existing_item->>'storage_path' = p_storage_path) AND
       ((v_existing_item->>'file_size_bytes')::bigint = p_file_size_bytes) THEN
      RETURN jsonb_build_object(
        'success', true,
        'photo_id', p_photo_id,
        'raw_files', v_current_raw,
        'idempotent', true
      );
    ELSE
      RAISE EXCEPTION 'RAW index conflict: attempt is CONFIRMED but raw_index % metadata differs', p_raw_index
        USING ERRCODE = '23505';
    END IF;
  END IF;

  -- Step 8B: Strictly Reject SUPERSEDED Attempts (never grant confirmation even if metadata matches)
  IF v_attempt_status = 'SUPERSEDED' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ATTEMPT_SUPERSEDED',
      'code', 'ATTEMPT_SUPERSEDED',
      'message', format('Upload attempt %s has been SUPERSEDED by a newer attempt', p_upload_attempt_id),
      'attempt_status', 'SUPERSEDED'
    );
  END IF;

  -- Step 8C: Strictly Reject EXPIRED Attempts using Wall-Clock clock_timestamp()
  -- Expired attempts must NOT receive confirmation success even if metadata matches.
  IF (v_attempt_status = 'ISSUED' AND clock_timestamp() > v_attempt_expires) OR v_attempt_status = 'EXPIRED' THEN
    IF v_attempt_status = 'ISSUED' THEN
      UPDATE public.gallery_upload_attempts
      SET attempt_status = 'EXPIRED', updated_at = NOW()
      WHERE id = p_upload_attempt_id;
    END IF;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'ATTEMPT_EXPIRED',
      'code', 'ATTEMPT_EXPIRED',
      'message', format('Upload attempt %s has expired at %s (current: %s)', p_upload_attempt_id, v_attempt_expires, clock_timestamp()),
      'attempt_status', 'EXPIRED'
    );
  END IF;

  -- Step 8D: Verify Attempt Status is strictly ISSUED for new confirmation
  IF v_attempt_status != 'ISSUED' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('ATTEMPT_%s', v_attempt_status),
      'code', format('ATTEMPT_%s', v_attempt_status),
      'message', format('Cannot confirm attempt %s: status is %s (expected ISSUED)', p_upload_attempt_id, v_attempt_status),
      'attempt_status', v_attempt_status
    );
  END IF;

  -- Step 8E: For active ISSUED attempt, check raw_files for conflict or duplicate
  SELECT item INTO v_existing_item
  FROM jsonb_array_elements(v_current_raw) AS item
  WHERE (item->>'raw_index')::integer = p_raw_index
  LIMIT 1;

  IF v_existing_item IS NOT NULL THEN
    IF (v_existing_item->>'storage_path' = p_storage_path)
       AND ((v_existing_item->>'file_size_bytes')::bigint = p_file_size_bytes) THEN
      -- Existing matching entry in photos.raw_files: transition this attempt to CONFIRMED
      UPDATE public.gallery_upload_attempts
      SET
        attempt_status = 'CONFIRMED',
        actual_size_bytes = p_file_size_bytes,
        etag = COALESCE(p_etag, etag),
        confirmed_at = NOW(),
        updated_at = NOW()
      WHERE id = p_upload_attempt_id;

      RETURN jsonb_build_object(
        'success', true,
        'photo_id', p_photo_id,
        'raw_files', v_current_raw,
        'idempotent', true
      );
    ELSE
      -- Differing metadata: Reject to protect data integrity
      RAISE EXCEPTION 'RAW index conflict: raw_index % already exists with differing metadata', p_raw_index
        USING ERRCODE = '23505';
    END IF;
  END IF;

  -- Step 11: Construct new entry and append atomically
  v_new_entry := jsonb_build_object(
    'raw_index', p_raw_index,
    'storage_path', p_storage_path,
    'file_size_bytes', p_file_size_bytes,
    'etag', p_etag,
    'storage_provider', 'r2',
    'uploaded_at', NOW()::text
  );

  v_updated_raw := v_current_raw || jsonb_build_array(v_new_entry);

  -- Step 12: Update photos table
  UPDATE public.photos
  SET
    raw_files = v_updated_raw,
    updated_at = NOW()
  WHERE id = p_photo_id;

  -- Step 13: Transition attempt to CONFIRMED
  UPDATE public.gallery_upload_attempts
  SET
    attempt_status = 'CONFIRMED',
    actual_size_bytes = p_file_size_bytes,
    etag = COALESCE(p_etag, etag),
    confirmed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_upload_attempt_id;

  RETURN jsonb_build_object(
    'success', true,
    'photo_id', p_photo_id,
    'raw_files', v_updated_raw,
    'idempotent', false
  );
END;
$$;

-- Secure procedure permissions
REVOKE ALL ON FUNCTION public.append_photo_raw_file(UUID, UUID, UUID, UUID, INTEGER, BIGINT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.append_photo_raw_file(UUID, UUID, UUID, UUID, INTEGER, BIGINT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.append_photo_raw_file(UUID, UUID, UUID, UUID, INTEGER, BIGINT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.append_photo_raw_file(UUID, UUID, UUID, UUID, INTEGER, BIGINT, TEXT, TEXT) TO service_role;

-- ------------------------------------------------------------------------------
-- ------------------------------------------------------------------------------
-- 5B. ATOMIC STORED PROCEDURE: confirm_gallery_asset_upload
-- ------------------------------------------------------------------------------
-- Atomically confirms non-RAW assets (photo, thumbnail, gif) within a single database transaction.
-- Guarantees:
-- 1. Deterministic lock order: Locks public.photos first (FOR UPDATE), then gallery_upload_attempts (FOR UPDATE),
--    strictly matching append_photo_raw_file to mathematically prevent deadlocks during concurrent uploads.
-- 2. Strict attempt verification: status ISSUED, unexpired, matching object key, tenant, event, expected size.
-- 3. Reject NULL/invalid asset_type and NULL/non-positive/oversized file sizes.
-- 4. Duplicate photo records detection: Fails transaction with SQLSTATE 23505 if duplicates exist.
-- 5. Idempotent retries return existing confirmation details.
-- 6. Expired attempts are persisted as EXPIRED without leaving partial metadata.
CREATE OR REPLACE FUNCTION public.confirm_gallery_asset_upload(
  p_organization_id UUID,
  p_event_id UUID,
  p_upload_attempt_id UUID,
  p_session_photo_id TEXT,
  p_asset_type TEXT,
  p_storage_path TEXT,
  p_file_size_bytes BIGINT,
  p_etag TEXT DEFAULT NULL,
  p_qr_url TEXT DEFAULT NULL,
  p_retention_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
  v_target_photo_id UUID;
  v_photo_count INTEGER;
  v_attempt_status TEXT;
  v_attempt_expires TIMESTAMPTZ;
  v_attempt_asset_type TEXT;
  v_attempt_object_key TEXT;
  v_attempt_expected_size BIGINT;
  v_attempt_storage_provider TEXT;
  v_confirmed_at TIMESTAMPTZ := clock_timestamp();
  v_gif_id UUID;
  v_updated_rows INTEGER;
BEGIN
  -- Step 1: Security and Role Enforcement
  v_role := NULLIF(current_setting('request.jwt.claim.role', true), '');
  IF v_role IS DISTINCT FROM 'service_role' AND current_user != 'service_role' AND session_user != 'postgres' THEN
    RAISE EXCEPTION 'Access denied: confirm_gallery_asset_upload requires service_role'
      USING ERRCODE = '42501';
  END IF;

  -- Step 2: Validate asset_type (Reject NULL and invalid values explicitly)
  IF p_asset_type IS NULL OR p_asset_type NOT IN ('photo', 'thumbnail', 'gif') THEN
    RAISE EXCEPTION 'Invalid asset_type: confirm_gallery_asset_upload only supports photo, thumbnail, gif (received: %)', COALESCE(p_asset_type, 'NULL')
      USING ERRCODE = '22023';
  END IF;

  -- Step 2B: Validate p_file_size_bytes bounds and system limits
  IF p_file_size_bytes IS NULL OR p_file_size_bytes < 1 THEN
    RAISE EXCEPTION 'Invalid file_size_bytes: file size must be a positive integer greater than zero (received: %)', COALESCE(p_file_size_bytes::text, 'NULL')
      USING ERRCODE = '22023';
  END IF;

  IF (p_asset_type = 'photo' AND p_file_size_bytes > 20971520) OR
     (p_asset_type = 'thumbnail' AND p_file_size_bytes > 5242880) OR
     (p_asset_type = 'gif' AND p_file_size_bytes > 26214400) THEN
    RAISE EXCEPTION 'File size % exceeds maximum allowed limit for asset type "%"', p_file_size_bytes, p_asset_type
      USING ERRCODE = '22023';
  END IF;

  -- Step 2C: Storage Path Traversal and Length Check
  IF p_storage_path IS NULL
     OR length(p_storage_path) < 10
     OR length(p_storage_path) > 512
     OR p_storage_path ~ '\.\.'
     OR NOT (p_storage_path ~ '^[a-zA-Z0-9_\-\./]+$') THEN
    RAISE EXCEPTION 'Invalid storage_path: path traversal or illegal characters detected: %', p_storage_path
      USING ERRCODE = '22023';
  END IF;

  -- Step 3: MANDATORY DETERMINISTIC LOCK ORDER — Lock Photo Row First (FOR UPDATE)
  -- Enforces that all transactions accessing both photos and attempts lock in identical sequence:
  -- 1st: public.photos -> 2nd: public.gallery_upload_attempts.
  -- This guarantees that concurrent RAW confirmations and photo/thumbnail confirmations cannot deadlock.
  IF p_asset_type IN ('photo', 'thumbnail') THEN
    SELECT COUNT(*)
    INTO v_photo_count
    FROM public.photos
    WHERE organization_id = p_organization_id
      AND event_id = p_event_id
      AND session_photo_id = p_session_photo_id
      AND is_cloud_deleted = FALSE;

    IF v_photo_count = 0 THEN
      IF p_asset_type = 'thumbnail' THEN
        RAISE EXCEPTION 'Target parent photo not found for thumbnail session % in event %', p_session_photo_id, p_event_id
          USING ERRCODE = 'P0002';
      ELSE
        RAISE EXCEPTION 'Target photo record not found for session % in event %', p_session_photo_id, p_event_id
          USING ERRCODE = 'P0002';
      END IF;
    ELSIF v_photo_count > 1 THEN
      RAISE EXCEPTION 'Duplicate photo records detected: % active photos found for session % in event %',
        v_photo_count, p_session_photo_id, p_event_id
        USING ERRCODE = '23505';
    END IF;

    -- Lock the validated photo row by session and tenant
    SELECT id INTO v_target_photo_id
    FROM public.photos
    WHERE organization_id = p_organization_id
      AND event_id = p_event_id
      AND session_photo_id = p_session_photo_id
      AND is_cloud_deleted = FALSE
    FOR UPDATE;
  END IF;

  -- Step 4: MANDATORY DETERMINISTIC LOCK ORDER — Lock Attempt Row Second (FOR UPDATE)
  SELECT
    attempt_status,
    expires_at,
    asset_type,
    object_key,
    expected_size_bytes,
    storage_provider
  INTO
    v_attempt_status,
    v_attempt_expires,
    v_attempt_asset_type,
    v_attempt_object_key,
    v_attempt_expected_size,
    v_attempt_storage_provider
  FROM public.gallery_upload_attempts
  WHERE id = p_upload_attempt_id
    AND organization_id = p_organization_id
    AND event_id = p_event_id
    AND session_photo_id = p_session_photo_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Upload attempt % not found for session % in event %', p_upload_attempt_id, p_session_photo_id, p_event_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Step 5: Strict Attempt Binding Checks
  IF v_attempt_asset_type != p_asset_type THEN
    RAISE EXCEPTION 'Mismatched asset_type: attempt expects %, but confirmation requested %',
      v_attempt_asset_type, p_asset_type
      USING ERRCODE = '22023';
  END IF;

  IF v_attempt_object_key IS DISTINCT FROM p_storage_path THEN
    RAISE EXCEPTION 'Mismatched storage_path: attempt expects "%", but confirmation requested "%"',
      v_attempt_object_key, p_storage_path
      USING ERRCODE = '22023';
  END IF;

  IF v_attempt_storage_provider != 'r2' THEN
    RAISE EXCEPTION 'Attempt specifies unsupported storage_provider "%" (expected "r2")',
      v_attempt_storage_provider
      USING ERRCODE = '22023';
  END IF;

  -- Validate expected_size_bytes against reported p_file_size_bytes
  IF v_attempt_expected_size IS NOT NULL AND v_attempt_expected_size != p_file_size_bytes THEN
    RAISE EXCEPTION 'Mismatched file size: attempt expected % bytes, but confirmation reported % bytes',
      v_attempt_expected_size, p_file_size_bytes
      USING ERRCODE = '22023';
  END IF;

  -- Step 6: Idempotency Check
  IF v_attempt_status = 'CONFIRMED' THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'upload_status', 'READY',
      'session_photo_id', p_session_photo_id,
      'asset_type', p_asset_type,
      'object_key', p_storage_path,
      'confirmed_at', v_confirmed_at
    );
  END IF;

  -- Step 7A: Strictly Reject SUPERSEDED Attempts
  IF v_attempt_status = 'SUPERSEDED' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ATTEMPT_SUPERSEDED',
      'code', 'ATTEMPT_SUPERSEDED',
      'message', format('Upload attempt %s has been SUPERSEDED by a newer attempt', p_upload_attempt_id),
      'attempt_status', 'SUPERSEDED'
    );
  END IF;

  -- Step 7B: Strictly Reject EXPIRED Attempts using Wall-Clock clock_timestamp()
  IF (v_attempt_status = 'ISSUED' AND clock_timestamp() > v_attempt_expires) OR v_attempt_status = 'EXPIRED' THEN
    IF v_attempt_status = 'ISSUED' THEN
      UPDATE public.gallery_upload_attempts
      SET attempt_status = 'EXPIRED', updated_at = NOW()
      WHERE id = p_upload_attempt_id;
    END IF;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'ATTEMPT_EXPIRED',
      'code', 'ATTEMPT_EXPIRED',
      'message', format('Upload attempt %s has expired at %s', p_upload_attempt_id, v_attempt_expires),
      'attempt_status', 'EXPIRED'
    );
  END IF;

  -- Step 7C: Verify Attempt Status is strictly ISSUED
  IF v_attempt_status != 'ISSUED' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('ATTEMPT_%s', v_attempt_status),
      'code', format('ATTEMPT_%s', v_attempt_status),
      'message', format('Cannot confirm attempt %s: status is %s (expected ISSUED)', p_upload_attempt_id, v_attempt_status),
      'attempt_status', v_attempt_status
    );
  END IF;

  -- Step 8: Update Metadata based on asset_type
  IF p_asset_type = 'photo' THEN
    UPDATE public.photos
    SET
      upload_status = 'READY',
      cloud_storage_path = p_storage_path,
      file_size_bytes = p_file_size_bytes,
      storage_provider = 'r2',
      active_upload_attempt_id = p_upload_attempt_id,
      upload_confirmed_at = v_confirmed_at,
      qr_url = COALESCE(p_qr_url, qr_url),
      expires_at = COALESCE(p_retention_expires_at, expires_at),
      updated_at = v_confirmed_at
    WHERE id = v_target_photo_id;

    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
    IF v_updated_rows = 0 THEN
      RAISE EXCEPTION 'Target photo record not found for session % in event %', p_session_photo_id, p_event_id
        USING ERRCODE = 'P0002';
    ELSIF v_updated_rows > 1 THEN
      RAISE EXCEPTION 'Duplicate photo records updated: % rows affected for session % in event %', v_updated_rows, p_session_photo_id, p_event_id
        USING ERRCODE = '23505';
    END IF;

  ELSIF p_asset_type = 'thumbnail' THEN
    UPDATE public.photos
    SET
      thumbnail_storage_path = p_storage_path,
      updated_at = v_confirmed_at
    WHERE id = v_target_photo_id;

    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
    IF v_updated_rows = 0 THEN
      RAISE EXCEPTION 'Target parent photo not found for thumbnail session % in event %', p_session_photo_id, p_event_id
        USING ERRCODE = 'P0002';
    ELSIF v_updated_rows > 1 THEN
      RAISE EXCEPTION 'Duplicate photo records updated: % rows affected for thumbnail session % in event %', v_updated_rows, p_session_photo_id, p_event_id
        USING ERRCODE = '23505';
    END IF;

  ELSIF p_asset_type = 'gif' THEN
    SELECT id INTO v_gif_id
    FROM public.gifs
    WHERE organization_id = p_organization_id
      AND event_id = p_event_id
      AND (
        session_photo_id = p_session_photo_id
        OR cloud_storage_path = p_storage_path
        OR cloud_storage_path = ('events/' || p_event_id || '/' || p_session_photo_id || '.gif')
      )
    LIMIT 1;

    IF v_gif_id IS NOT NULL THEN
      UPDATE public.gifs
      SET
        session_photo_id = p_session_photo_id,
        cloud_storage_path = p_storage_path,
        storage_provider = 'r2',
        captured_at = v_confirmed_at
      WHERE id = v_gif_id;
    ELSE
      INSERT INTO public.gifs (
        event_id,
        organization_id,
        session_photo_id,
        cloud_storage_path,
        storage_provider,
        frames_count,
        duration_ms,
        captured_at,
        expires_at
      ) VALUES (
        p_event_id,
        p_organization_id,
        p_session_photo_id,
        p_storage_path,
        'r2',
        4,
        1000,
        v_confirmed_at,
        COALESCE(p_retention_expires_at, v_confirmed_at + INTERVAL '30 days')
      );
    END IF;
  END IF;

  -- Step 9: Atomically update attempt status to CONFIRMED
  UPDATE public.gallery_upload_attempts
  SET
    attempt_status = 'CONFIRMED',
    actual_size_bytes = p_file_size_bytes,
    etag = COALESCE(p_etag, etag),
    confirmed_at = v_confirmed_at,
    updated_at = v_confirmed_at
  WHERE id = p_upload_attempt_id;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'upload_status', 'READY',
    'session_photo_id', p_session_photo_id,
    'asset_type', p_asset_type,
    'object_key', p_storage_path,
    'confirmed_at', v_confirmed_at
  );
END;
$$;

-- Secure procedure permissions
REVOKE ALL ON FUNCTION public.confirm_gallery_asset_upload(UUID, UUID, UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_gallery_asset_upload(UUID, UUID, UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TIMESTAMPTZ) FROM anon;
REVOKE ALL ON FUNCTION public.confirm_gallery_asset_upload(UUID, UUID, UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_gallery_asset_upload(UUID, UUID, UUID, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TIMESTAMPTZ) TO service_role;

-- ------------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) HARDENING
-- ------------------------------------------------------------------------------
-- Enable RLS on newly created tables
ALTER TABLE public.gallery_upload_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.r2_orphan_quarantine_manifest ENABLE ROW LEVEL SECURITY;

-- Vendors can view their own upload attempts (Strictly scoped to authenticated)
DROP POLICY IF EXISTS "Vendors can view own upload attempts" ON public.gallery_upload_attempts;
CREATE POLICY "Vendors can view own upload attempts"
  ON public.gallery_upload_attempts FOR SELECT
  TO authenticated
  USING (organization_id = public.get_auth_org_id());

-- Clean up legacy public guest access policies on photos table:
-- PostgREST anonymous access to photos is eliminated (SEC-02 hardening).
-- Guest access is exclusively served via server-side Next.js route handlers using service_role.
DROP POLICY IF EXISTS "Public guests can view individual photos" ON public.photos;
DROP POLICY IF EXISTS "Public guests can view ready photos" ON public.photos;
