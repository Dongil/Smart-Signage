// Design Ref: §2.M1, §3 — better-sqlite3 singleton with WAL mode
// Owns the single SQLite connection used by Electron main + HTTP API.

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

let dbInstance: Database.Database | null = null;

export interface DbInitOptions {
  /** Absolute path to the SQLite file (typically userData/signage.db). */
  filePath: string;
  /** Absolute path to schema.sql so we can apply it on first run. */
  schemaPath: string;
  /** Optional path to a packaged seed DB to copy on first run. */
  seedDbPath?: string;
}

/**
 * Open (or create) the SQLite database. Idempotent — repeated calls return
 * the same instance. The first call performs file initialization.
 */
export function openDatabase(opts: DbInitOptions): Database.Database {
  if (dbInstance) return dbInstance;

  const dir = path.dirname(opts.filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const dbExists = fs.existsSync(opts.filePath);

  // First-run seeding: copy seed DB if provided, otherwise apply schema.
  if (!dbExists && opts.seedDbPath && fs.existsSync(opts.seedDbPath)) {
    fs.copyFileSync(opts.seedDbPath, opts.filePath);
  }

  const db = new Database(opts.filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 3000');

  // Apply schema (CREATE TABLE IF NOT EXISTS makes this safe to re-run).
  if (fs.existsSync(opts.schemaPath)) {
    const schema = fs.readFileSync(opts.schemaPath, 'utf-8');
    db.exec(schema);
  }

  dbInstance = db;
  return db;
}

export function getDatabase(): Database.Database {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call openDatabase() first.');
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export function nowEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
