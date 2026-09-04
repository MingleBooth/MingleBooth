export const SQLITE_LOCAL_SCHEMA = `
CREATE TABLE IF NOT EXISTS local_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS local_licenses (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  tier TEXT NOT NULL,
  license_token TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  cached_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS local_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL,
  config_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS local_templates (
  id TEXT PRIMARY KEY,
  event_id TEXT,
  name TEXT NOT NULL,
  config_json TEXT NOT NULL,
  overlay_path TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS local_captures (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  raw_file_path TEXT NOT NULL,
  processed_file_path TEXT NOT NULL,
  thumbnail_file_path TEXT,
  qr_url TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'local',
  cloud_url TEXT,
  captured_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  metadata_json TEXT
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  cloud_storage_bucket TEXT NOT NULL,
  cloud_storage_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 5,
  last_error TEXT,
  progress_percent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TEXT,
  next_retry_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_captures_event ON local_captures(event_id);
CREATE INDEX IF NOT EXISTS idx_captures_sync ON local_captures(sync_status);
CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
`;
