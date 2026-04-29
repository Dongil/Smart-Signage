// Design Ref: §2.M3 — Bootstrap the host Electron device row.
// Module 1 only ensures the device row exists; output-device toggling
// (is_signage_output) is handled in Module 3 (auth/registerSignage).

import type Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { nowEpochSeconds } from './database';

interface DeviceRow {
  id: string;
}

const DEVICE_ID_FILENAME = 'device-id';

/**
 * Returns the host device's device-id, creating one on first run.
 * The id is persisted to both:
 *   1. A plain text file in userData (so we survive DB resets), and
 *   2. The devices table (so the HTTP API can look it up).
 */
export function ensureHostDevice(db: Database.Database, userDataDir: string): string {
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  const idFile = path.join(userDataDir, DEVICE_ID_FILENAME);
  let deviceId: string;

  if (fs.existsSync(idFile)) {
    deviceId = fs.readFileSync(idFile, 'utf-8').trim();
  } else {
    deviceId = randomUUID();
    fs.writeFileSync(idFile, deviceId, 'utf-8');
  }

  const now = nowEpochSeconds();
  const existing = db
    .prepare('SELECT id FROM devices WHERE id = ?')
    .get(deviceId) as DeviceRow | undefined;

  if (!existing) {
    db.prepare(
      'INSERT INTO devices (id, name, is_signage_output, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)'
    ).run(deviceId, 'Host (Electron)', 0, now, now);
  } else {
    db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').run(now, deviceId);
  }

  return deviceId;
}
