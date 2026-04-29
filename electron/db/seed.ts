// Design Ref: §2.M1 — Initial seed data and default settings.
// Run after schema is created and migrations are applied.

import type Database from 'better-sqlite3';
import { nowEpochSeconds } from './database';

interface SettingsRow {
  key: string;
}

const DEFAULT_SETTINGS: Array<[string, unknown]> = [
  ['playback.defaultDuration', 5],
  ['ui.theme', 'dark'],
];

/**
 * Insert default settings if they are not already present.
 * Idempotent — safe to call on every app start.
 */
export function seedDefaultSettings(db: Database.Database): void {
  const existing = db.prepare('SELECT key FROM settings').all() as SettingsRow[];
  const existingKeys = new Set(existing.map((r) => r.key));

  const insert = db.prepare(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)'
  );
  const now = nowEpochSeconds();

  const tx = db.transaction(() => {
    for (const [key, value] of DEFAULT_SETTINGS) {
      if (!existingKeys.has(key)) {
        insert.run(key, JSON.stringify(value), now);
      }
    }
  });
  tx();
}
