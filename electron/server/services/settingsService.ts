// Design Ref: §2.M2, §4 — Generic key/value settings, value stored as JSON.
// signage-resolution Plan NFR-6 — log every settings mutation so resolution
// transitions (1080↔1200) leave a trail in main.log for ops diagnostics.

import { getDatabase, nowEpochSeconds } from '../../db/database';
import { getLogger } from '../../logger';
import { eventBus } from './eventBus';

interface SettingsRow {
  key: string;
  value: string;
}

export type SettingsMap = Record<string, unknown>;

export function listSettings(): SettingsMap {
  const rows = getDatabase()
    .prepare('SELECT key, value FROM settings')
    .all() as SettingsRow[];
  const out: SettingsMap = {};
  for (const row of rows) {
    try {
      out[row.key] = JSON.parse(row.value);
    } catch {
      out[row.key] = row.value;
    }
  }
  return out;
}

export function getSetting<T = unknown>(key: string): T | null {
  const row = getDatabase()
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(key) as SettingsRow | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return row.value as unknown as T;
  }
}

export function setSetting(key: string, value: unknown): void {
  const json = JSON.stringify(value);
  const now = nowEpochSeconds();
  const prev = getSetting(key);
  getDatabase()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, json, now);
  try {
    getLogger().info(`[settings] ${key} changed:`, prev, '→', value);
  } catch {
    // never let a logging fault break a write
  }
  eventBus.emit({ type: 'settings.changed', key });
}
