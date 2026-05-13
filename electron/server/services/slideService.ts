// Design Ref: §2.M2, §4.1 — Slide CRUD with optimistic ordering and event emission.
// signage-mode §3.2.2 — mode-aware listing, creation, and reordering. Each mode
// keeps its own position sequence so reordering one mode never touches the other.

import { randomUUID } from 'crypto';
import { getDatabase, nowEpochSeconds } from '../../db/database';
import { eventBus } from './eventBus';
import { rowToSlide, type SlideRow } from './slideMapper';
import type { Slide, MediaOptions, SlideType, SignageMode } from '../../../types/slide';

const SELECT_ALL = `
  SELECT id, type, mode, title, content, background_color, duration,
         media_path, media_options, position, created_at, updated_at
  FROM slides
  ORDER BY mode ASC, position ASC, created_at ASC
`;

const SELECT_BY_MODE = `
  SELECT id, type, mode, title, content, background_color, duration,
         media_path, media_options, position, created_at, updated_at
  FROM slides
  WHERE mode = ?
  ORDER BY position ASC, created_at ASC
`;

const SELECT_BY_ID = `
  SELECT id, type, mode, title, content, background_color, duration,
         media_path, media_options, position, created_at, updated_at
  FROM slides WHERE id = ?
`;

export interface CreateSlideInput {
  type: SlideType;
  mode?: SignageMode;
  title?: string;
  content?: string;
  backgroundColor?: string;
  duration?: number;
  mediaPath?: string;
  mediaOptions?: MediaOptions;
}

export interface UpdateSlideInput {
  type?: SlideType;
  title?: string;
  content?: string;
  backgroundColor?: string;
  duration?: number;
  mediaPath?: string | null;
  mediaOptions?: MediaOptions | null;
}

function normalizeMode(mode: unknown): SignageMode {
  return mode === 'individual' ? 'individual' : 'surround';
}

export function listSlides(mode?: SignageMode): Slide[] {
  const db = getDatabase();
  const rows = mode
    ? (db.prepare(SELECT_BY_MODE).all(mode) as SlideRow[])
    : (db.prepare(SELECT_ALL).all() as SlideRow[]);
  return rows.map(rowToSlide);
}

export function getSlide(id: string): Slide | null {
  const row = getDatabase().prepare(SELECT_BY_ID).get(id) as SlideRow | undefined;
  return row ? rowToSlide(row) : null;
}

export function createSlide(input: CreateSlideInput): Slide {
  const db = getDatabase();
  const now = nowEpochSeconds();
  const id = randomUUID();
  const mode = normalizeMode(input.mode);

  // signage-mode §3.2.2 — position is unique within the mode, not globally.
  const maxRow = db
    .prepare('SELECT COALESCE(MAX(position), -1) AS max FROM slides WHERE mode = ?')
    .get(mode) as { max: number };
  const position = maxRow.max + 1;

  db.prepare(
    `INSERT INTO slides (
      id, type, mode, title, content, background_color, duration,
      media_path, media_options, position, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.type,
    mode,
    input.title ?? '',
    input.content ?? '',
    input.backgroundColor ?? '#1a1a2e',
    input.duration ?? 5,
    input.mediaPath ?? null,
    input.mediaOptions ? JSON.stringify(input.mediaOptions) : null,
    position,
    now,
    now
  );

  const slide = getSlide(id);
  if (!slide) throw new Error('createSlide: failed to read back inserted row');
  eventBus.emit({ type: 'slide.changed', op: 'create', ids: [id] });
  return slide;
}

export function updateSlide(id: string, patch: UpdateSlideInput): Slide | null {
  const db = getDatabase();
  const existing = getSlide(id);
  if (!existing) return null;

  const sets: string[] = [];
  const values: unknown[] = [];

  if (patch.type !== undefined) {
    sets.push('type = ?');
    values.push(patch.type);
  }
  if (patch.title !== undefined) {
    sets.push('title = ?');
    values.push(patch.title);
  }
  if (patch.content !== undefined) {
    sets.push('content = ?');
    values.push(patch.content);
  }
  if (patch.backgroundColor !== undefined) {
    sets.push('background_color = ?');
    values.push(patch.backgroundColor);
  }
  if (patch.duration !== undefined) {
    sets.push('duration = ?');
    values.push(patch.duration);
  }
  if (patch.mediaPath !== undefined) {
    sets.push('media_path = ?');
    values.push(patch.mediaPath);
  }
  if (patch.mediaOptions !== undefined) {
    sets.push('media_options = ?');
    values.push(patch.mediaOptions === null ? null : JSON.stringify(patch.mediaOptions));
  }

  if (sets.length === 0) return existing;

  sets.push('updated_at = ?');
  values.push(nowEpochSeconds());
  values.push(id);

  db.prepare(`UPDATE slides SET ${sets.join(', ')} WHERE id = ?`).run(...values);

  const updated = getSlide(id);
  if (updated) {
    eventBus.emit({ type: 'slide.changed', op: 'update', ids: [id] });
  }
  return updated;
}

export function deleteSlide(id: string): boolean {
  const db = getDatabase();
  const existing = getSlide(id);
  if (!existing) return false;
  const result = db.prepare('DELETE FROM slides WHERE id = ?').run(id);
  if (result.changes === 0) return false;
  // Compact positions within the affected mode so they remain contiguous.
  compactPositions(existing.mode);
  eventBus.emit({ type: 'slide.changed', op: 'delete', ids: [id] });
  return true;
}

export function reorderSlides(mode: SignageMode, orderedIds: string[]): Slide[] {
  // Design Ref: signage-mode §3.2.2 — reorder is scoped to a single mode.
  // The ids array must only contain rows whose mode matches; any foreign id
  // is silently ignored by the WHERE-clause filter.
  const db = getDatabase();
  const update = db.prepare(
    'UPDATE slides SET position = ?, updated_at = ? WHERE id = ? AND mode = ?'
  );
  const tx = db.transaction((ids: string[]) => {
    const now = nowEpochSeconds();
    ids.forEach((id, idx) => update.run(idx, now, id, mode));
  });
  tx(orderedIds);
  eventBus.emit({ type: 'slide.changed', op: 'reorder', ids: orderedIds });
  return listSlides(mode);
}

function compactPositions(mode: SignageMode): void {
  const db = getDatabase();
  const rows = db
    .prepare('SELECT id FROM slides WHERE mode = ? ORDER BY position ASC')
    .all(mode) as { id: string }[];
  const update = db.prepare(
    'UPDATE slides SET position = ? WHERE id = ? AND mode = ?'
  );
  const tx = db.transaction(() => {
    rows.forEach((row, idx) => update.run(idx, row.id, mode));
  });
  tx();
}
