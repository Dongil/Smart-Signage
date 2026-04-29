// Design Ref: §2.M4, §1.3 — Zustand store as a server-mirror.
// All mutations go through the HTTP API; SSE re-hydrates after any change.
// The store no longer owns playback state (see usePlaybackStore).

import { create } from 'zustand';
import { slidesApi, type CreateSlidePayload, type UpdateSlidePayload } from '@/lib/api/slides';
import type { Slide } from '@/types/slide';

export type { Slide };

interface SignageState {
  slides: Slide[];
  loading: boolean;
  error: string | null;
  /** Index of the slide currently selected in the editor (UI-only). */
  editingIndex: number;

  hydrate: () => Promise<void>;
  addSlide: (payload: CreateSlidePayload) => Promise<Slide>;
  updateSlide: (id: string, patch: UpdateSlidePayload) => Promise<Slide | null>;
  deleteSlide: (id: string) => Promise<void>;
  reorderSlides: (orderedIds: string[]) => Promise<void>;
  setEditingIndex: (index: number) => void;
  applySseHydrate: (slides: Slide[]) => void;
}

export const useSignageStore = create<SignageState>((set, get) => ({
  slides: [],
  loading: false,
  error: null,
  editingIndex: 0,

  hydrate: async () => {
    set({ loading: true, error: null });
    try {
      const slides = await slidesApi.list();
      set((s) => ({
        slides,
        loading: false,
        editingIndex: Math.min(s.editingIndex, Math.max(0, slides.length - 1)),
      }));
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : 'fetch-failed' });
    }
  },

  addSlide: async (payload) => {
    const created = await slidesApi.create(payload);
    // SSE will eventually re-hydrate, but updating eagerly avoids flicker.
    set((s) => ({ slides: [...s.slides, created] }));
    return created;
  },

  updateSlide: async (id, patch) => {
    const prev = get().slides.find((s) => s.id === id);
    if (!prev) return null;
    // Optimistic update.
    set((s) => ({
      slides: s.slides.map((sl) => (sl.id === id ? { ...sl, ...patch } as Slide : sl)),
    }));
    try {
      const updated = await slidesApi.update(id, patch);
      set((s) => ({
        slides: s.slides.map((sl) => (sl.id === id ? updated : sl)),
      }));
      return updated;
    } catch (e) {
      // Roll back.
      set((s) => ({
        slides: s.slides.map((sl) => (sl.id === id ? prev : sl)),
        error: e instanceof Error ? e.message : 'update-failed',
      }));
      throw e;
    }
  },

  deleteSlide: async (id) => {
    const prev = get().slides;
    set((s) => ({
      slides: s.slides.filter((sl) => sl.id !== id),
      editingIndex: Math.min(s.editingIndex, Math.max(0, prev.length - 2)),
    }));
    try {
      await slidesApi.remove(id);
    } catch (e) {
      set({ slides: prev, error: e instanceof Error ? e.message : 'delete-failed' });
      throw e;
    }
  },

  reorderSlides: async (orderedIds) => {
    const prev = get().slides;
    const map = new Map(prev.map((s) => [s.id, s]));
    const optimistic = orderedIds.map((id) => map.get(id)).filter(Boolean) as Slide[];
    set({ slides: optimistic });
    try {
      const updated = await slidesApi.reorder(orderedIds);
      set({ slides: updated });
    } catch (e) {
      set({ slides: prev, error: e instanceof Error ? e.message : 'reorder-failed' });
      throw e;
    }
  },

  setEditingIndex: (index) => set({ editingIndex: index }),

  applySseHydrate: (slides) => {
    set((s) => ({
      slides,
      editingIndex: Math.min(s.editingIndex, Math.max(0, slides.length - 1)),
    }));
  },
}));
