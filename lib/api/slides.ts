// Design Ref: §4.1 — Typed wrappers for /api/slides.
import { apiFetch } from './client';
import type { Slide, MediaOptions, SlideType } from '@/types/slide';

export interface CreateSlidePayload {
  type: SlideType;
  title?: string;
  content?: string;
  backgroundColor?: string;
  duration?: number;
  mediaPath?: string;
  mediaOptions?: MediaOptions;
}

export type UpdateSlidePayload = Partial<CreateSlidePayload>;

export const slidesApi = {
  list: async (): Promise<Slide[]> => {
    const res = await apiFetch<{ slides: Slide[] }>('/api/slides');
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

  reorder: async (orderedIds: string[]): Promise<Slide[]> => {
    const res = await apiFetch<{ slides: Slide[] }>('/api/slides/reorder', {
      method: 'POST',
      body: { orderedIds },
    });
    return res.slides;
  },
};
