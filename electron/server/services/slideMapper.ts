// Design Ref: §3.1, §5.1 — Maps SQLite rows ⇆ API/Slide domain shape.
// API uses camelCase (matches frontend Slide type); SQLite uses snake_case.

import type { Slide, SlideType, MediaOptions } from '../../../types/slide';

export interface SlideRow {
  id: string;
  type: SlideType;
  title: string;
  content: string;
  background_color: string;
  duration: number;
  media_path: string | null;
  media_options: string | null;
  position: number;
  created_at: number;
  updated_at: number;
}

export function rowToSlide(row: SlideRow): Slide {
  const slide: Slide = {
    id: row.id,
    type: row.type,
    title: row.title,
    content: row.content,
    backgroundColor: row.background_color,
    duration: row.duration,
  };
  if (row.media_path) slide.mediaPath = row.media_path;
  if (row.media_options) {
    try {
      slide.mediaOptions = JSON.parse(row.media_options) as MediaOptions;
    } catch {
      // Corrupted JSON in DB — drop silently rather than break the API.
    }
  }
  return slide;
}
