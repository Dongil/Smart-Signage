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
  // Design Ref: signage-resolution §3.1.1 — default canvas resolution
  ['signage.resolution', { w: 5760, h: 1080 }],
  // Design Ref: signage-mode §3.3.2 — default mode for fresh installs
  ['signage.mode', 'surround'],
  // Design Ref: ui-redesign §3.1.5 — operational option defaults
  ['slide.padding', 50],
  ['slide.transitionSec', 0.5],
  // Design Ref: matrix-control §3.4 — PN-8080 control defaults
  ['matrix.host', '192.168.10.199'],
  ['matrix.port', 8000],
  ['matrix.autoConnect', false],
  ['matrix.aliases', {
    input: ['1', '2', '3', '4', '5', '6', '7', '8'],
    output: ['1', '2', '3', '4', '5', '6', '7', '8'],
  }],
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
