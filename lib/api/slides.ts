// Design Ref: §4.1, signage-mode §3.5.2 — Typed wrappers for /api/slides.
// `mode` lets list/create/reorder operate within a specific signage mode.
import { apiFetch } from './client';
import type { Slide, MediaOptions, SlideType, SignageMode } from '@/types/slide';

export interface CreateSlidePayload {
  type: SlideType;
  mode?: SignageMode;
  title?: string;
  content?: string;
  backgroundColor?: string;
  duration?: number;
  mediaPath?: string;
  mediaOptions?: MediaOptions;
}

export type UpdateSlidePayload = Partial<CreateSlidePayload>;

export const slidesApi = {
  list: async (mode?: SignageMode): Promise<Slide[]> => {
    const path = mode
      ? `/api/slides?mode=${encodeURIComponent(mode)}`
      : '/api/slides';
    const res = await apiFetch<{ slides: Slide[] }>(path);
    return res.slides;
  },

  create: async (payload: CreateSlidePayload): Promise<Slide> => {
    const res = await apiFetch<{ slide: Slide }>('/api/slides', {
      method: 'POST',
      body: payload,
    });
    return res.slide;
  },

  update: async (id: string, patch: UpdateSlidePayload): Promise<Slide> => {
    const res = await apiFetch<{ slide: Slide }>(`/api/slides/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: patch,
    });
    return res.slide;
  },

  remove: async (id: string): Promise<void> => {
    await apiFetch<void>(`/api/slides/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  reorder: async (mode: SignageMode, orderedIds: string[]): Promise<Slide[]> => {
    const res = await apiFetch<{ slides: Slide[] }>('/api/slides/reorder', {
      method: 'POST',
      body: { mode, orderedIds },
    });
    return res.slides;
  },
};
