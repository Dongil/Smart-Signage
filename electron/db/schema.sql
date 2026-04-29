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
CREATE TABLE IF NOT EXISTS slides (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('text', 'image', 'video', 'webpage')),
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

-- settings: key-value (value is JSON)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
