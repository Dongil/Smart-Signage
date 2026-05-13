// Design Ref: §3.2, §3.3, §13 — Schema versioning + v1.0 localStorage data import
// Plan SC-6: v1.0 localStorage 슬라이드 자동 마이그레이션 무손실

import type Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { nowEpochSeconds } from './database';

// signage-mode §3.1 — bump to 2 for slides.mode column.
export const CURRENT_SCHEMA_VERSION = 2;

interface AppMetaRow {
  value: string;
}

interface SlideRow {
  id: string;
  position: number;
}

export interface LegacySlidePayload {
  id: string;
  type?: 'text' | 'image' | 'video' | 'webpage';
  title?: string;
  content?: string;
  backgroundColor?: string;
  duration?: number;
  mediaPath?: string;
  mediaOptions?: Record<string, unknown>;
}

/**
 * Get current schema_version stored in app_meta. Returns 0 if absent
 * (treated as a fresh install needing initial setup).
 */
export function getSchemaVersion(db: Database.Database): number {
  const row = db
    .prepare('SELECT value FROM app_meta WHERE key = ?')
    .get('schema_version') as AppMetaRow | undefined;
  return row ? parseInt(row.value, 10) : 0;
}

export function setSchemaVersion(db: Database.Database, version: number): void {
  db.prepare(
    'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run('schema_version', String(version));
}

/**
 * Run any pending schema migrations. Schema CREATE statements are idempotent
 * (handled by openDatabase). This function only manages version bookkeeping
 * and any future ALTER TABLE migrations as the schema evolves.
 */
export function runMigrations(db: Database.Database): void {
  const current = getSchemaVersion(db);
  if (current === 0) {
    setSchemaVersion(db, CURRENT_SCHEMA_VERSION);
    const now = nowEpochSeconds();
    db.prepare(
      'INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, ?)'
    ).run('created_at', String(now));
    db.prepare(
      'INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, ?)'
    ).run('app_version', '1.1.0');
    return;
  }
  // Design Ref: signage-mode §3.1 — v1 → v2: add slides.mode for surround/individual
  if (current < 2) {
    addSlideModeColumn(db);
    setSchemaVersion(db, 2);
  }
}

interface ColumnInfoRow {
  name: string;
}

function addSlideModeColumn(db: Database.Database): void {
  // Idempotent: skip ALTER if a previous run already added the column
  // (e.g. partial migration on a crashed boot).
  const cols = db.prepare('PRAGMA table_info(slides)').all() as ColumnInfoRow[];
  const hasMode = cols.some((c) => c.name === 'mode');
  if (!hasMode) {
    db.exec(
      "ALTER TABLE slides ADD COLUMN mode TEXT NOT NULL DEFAULT 'surround'"
    );
  }
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_slides_mode_position ON slides(mode, position)'
  );
}

/**
 * Import a v1.0 localStorage payload into SQLite.
 * Caller is responsible for deciding whether to import (e.g. only if slides table is empty).
 *
 * @returns the number of slides imported, or 0 on no-op.
 */
export function importLegacySlides(
  db: Database.Database,
  payload: LegacySlidePayload[],
  backupDir: string
): number {
  if (!Array.isArray(payload) || payload.length === 0) return 0;

  // Snapshot to backup file before mutating.
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const backupFile = path.join(
    backupDir,
    `migrate-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  );
  fs.writeFileSync(backupFile, JSON.stringify(payload, null, 2), 'utf-8');

  const insert = db.prepare(`
    INSERT INTO slides (
      id, type, title, content, background_color, duration,
      media_path, media_options, position, created_at, updated_at
    ) VALUES (
      @id, @type, @title, @content, @background_color, @duration,
      @media_path, @media_options, @position, @created_at, @updated_at
    )
    ON CONFLICT(id) DO NOTHING
  `);

  const tx = db.transaction((rows: LegacySlidePayload[]) => {
    const now = nowEpochSeconds();
    let inserted = 0;
    rows.forEach((row, idx) => {
      const result = insert.run({
        id: row.id,
        type: row.type ?? 'text',
        title: row.title ?? '',
        content: row.content ?? '',
        background_color: row.backgroundColor ?? '#1a1a2e',
        duration: row.duration ?? 5,
        media_path: row.mediaPath ?? null,
        media_options: row.mediaOptions ? JSON.stringify(row.mediaOptions) : null,
        position: idx,
        created_at: now,
        updated_at: now,
      });
      if (result.changes > 0) inserted += 1;
    });
    return inserted;
  });

  return tx(payload);
}

/**
 * Convenience: returns true if there are no slides in DB (caller can decide to migrate).
 */
export function isSlideTableEmpty(db: Database.Database): boolean {
  const row = db.prepare('SELECT id FROM slides LIMIT 1').get() as SlideRow | undefined;
  return !row;
}
