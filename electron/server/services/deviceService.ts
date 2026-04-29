// Design Ref: §2.M3, §4.3 — Device registry. Module 2 supplies basic
// read/touch/issue helpers; Module 3 will layer the signage-output toggle on top.

import { randomUUID } from 'crypto';
import { getDatabase, nowEpochSeconds } from '../../db/database';
import { eventBus } from './eventBus';

interface DeviceRow {
  id: string;
  name: string;
  is_signage_output: number;
  created_at: number;
  last_seen_at: number;
}

export interface Device {
  id: string;
  name: string;
  isSignageOutput: boolean;
  createdAt: number;
  lastSeenAt: number;
}

function rowToDevice(row: DeviceRow): Device {
  return {
    id: row.id,
    name: row.name,
    isSignageOutput: row.is_signage_output === 1,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  };
}

export function getDevice(id: string): Device | null {
  const row = getDatabase()
    .prepare('SELECT * FROM devices WHERE id = ?')
    .get(id) as DeviceRow | undefined;
  return row ? rowToDevice(row) : null;
}

/**
 * Ensure a device row exists and refresh last_seen_at. Used by the
 * device-context middleware on every request.
 */
export function touchDevice(id: string, fallbackName: string): Device {
  const db = getDatabase();
  const now = nowEpochSeconds();
  const existing = getDevice(id);
  if (existing) {
    db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').run(now, id);
    return { ...existing, lastSeenAt: now };
  }
  db.prepare(
    'INSERT INTO devices (id, name, is_signage_output, created_at, last_seen_at) VALUES (?, ?, 0, ?, ?)'
  ).run(id, fallbackName, now, now);
  const inserted = getDevice(id);
  if (!inserted) throw new Error('touchDevice: failed to read back inserted device');
  eventBus.emit({ type: 'device.changed', deviceId: id });
  return inserted;
}

/** Issue a brand-new device id (used when no cookie is present yet). */
export function issueDeviceId(): string {
  return randomUUID();
}

export function listDevices(): Device[] {
  const rows = getDatabase()
    .prepare('SELECT * FROM devices ORDER BY created_at ASC')
    .all() as DeviceRow[];
  return rows.map(rowToDevice);
}

/** Module 3 — used by the signage-output guard. */
export function setSignageOutput(id: string, on: boolean): Device | null {
  const db = getDatabase();
  const result = db
    .prepare('UPDATE devices SET is_signage_output = ? WHERE id = ?')
    .run(on ? 1 : 0, id);
  if (result.changes === 0) return null;
  const updated = getDevice(id);
  if (updated) eventBus.emit({ type: 'device.changed', deviceId: id });
  return updated;
}
