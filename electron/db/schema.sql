-- Design Ref: §3.1 — SQLite schema for Smart Signage v1.1
-- All timestamps stored as Unix epoch (seconds)

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- app_meta: schema version + arbitrary metadata
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- devices: registered devices (Electron host + remote clients)
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  is_signage_output INTEGER NOT NULL DEFAULT 0 CHECK(is_signage_output IN (0, 1)),
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_devices_signage ON devices(is_signage_output);

-- slides: ordered list of signage slides
-- Design Ref: signage-mode §3.1 — `mode` column lets the same row layout
-- carry both surround (5760×h, rendered once) and individual (1920×h,
-- tiled ×3 on signage) slides. Existing rows default to 'surround'.
CREATE TABLE IF NOT EXISTS slides (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('text', 'image', 'video', 'webpage')),
  mode TEXT NOT NULL DEFAULT 'surround' CHECK(mode IN ('surround', 'individual')),
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  background_color TEXT NOT NULL DEFAULT '#1a1a2e',
  duration INTEGER NOT NULL DEFAULT 5,
  media_path TEXT,
  media_options TEXT,
  position INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_slides_position ON slides(position);
-- Note: idx_slides_mode_position is created by the v1→v2 migration
-- (electron/db/migrations.ts) after the `mode` column is guaranteed to
-- exist on pre-existing databases. Keeping it out of schema.sql avoids
-- a "no such column: mode" error during the openDatabase step on
-- v1.3-era installs that boot up before migrations run.

-- settings: key-value (value is JSON)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
