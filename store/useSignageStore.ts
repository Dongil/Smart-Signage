// Design Ref: §2.M4, §1.3 — Zustand store as a server-mirror.
// All mutations go through the HTTP API; SSE re-hydrates after any change.
// The store no longer owns playback state (see usePlaybackStore).
//
// ui-redesign §3.1.3 — operation options live in a generic Record<key, value>
// keyed by OPTION_REGISTRY entries. Callers read via useOption<T>(key);
// writers use setOption(key, value). This supersedes the older
// resolution-specific API.

import { create } from 'zustand';
import { slidesApi, type CreateSlidePayload, type UpdateSlidePayload } from '@/lib/api/slides';
import { settingsApi } from '@/lib/api/settings';
import { OPTION_REGISTRY, isRegistryKey, getOptionDefault } from '@/lib/options/registry';
import type { Slide, SignageMode } from '@/types/slide';

export type { Slide };

export interface SignageResolution {
  w: number;
  h: number;
}

function pickMode(options: Record<string, unknown>): SignageMode {
  return options['signage.mode'] === 'individual' ? 'individual' : 'surround';
}

interface SignageState {
  slides: Slide[];
  loading: boolean;
  error: string | null;
  /** Index of the slide currently selected in the editor (UI-only). */
  editingIndex: number;
  /** All operational options keyed by registry key. Hydrated from SQLite. */
  options: Record<string, unknown>;

  hydrate: () => Promise<void>;
  hydrateAllOptions: () => Promise<void>;
  addSlide: (payload: CreateSlidePayload) => Promise<Slide>;
  updateSlide: (id: string, patch: UpdateSlidePayload) => Promise<Slide | null>;
  deleteSlide: (id: string) => Promise<void>;
  reorderSlides: (orderedIds: string[]) => Promise<void>;
  setEditingIndex: (index: number) => void;
  setOption: (key: string, value: unknown) => Promise<void>;
  applySseHydrate: (slides: Slide[]) => void;
  applyOptionSse: (key: string) => Promise<void>;
}

function initialOptions(): Record<string, unknown> {
  // Pre-seed with registry defaults so first paint never sees undefined.
  const out: Record<string, unknown> = {};
  for (const schema of OPTION_REGISTRY) {
    out[schema.key] = schema.default;
  }
  return out;
}

export const useSignageStore = create<SignageState>((set, get) => ({
  slides: [],
  loading: false,
  error: null,
  editingIndex: 0,
  options: initialOptions(),

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

  hydrateAllOptions: async () => {
    // ui-redesign §3.1.3 — iterate registry so adding an option requires no
    // change here. Missing keys stay at their registry default.
    const next: Record<string, unknown> = { ...get().options };
    for (const schema of OPTION_REGISTRY) {
      try {
        const { value } = await settingsApi.get<unknown>(schema.key);
        next[schema.key] = value;
      } catch {
        next[schema.key] = schema.default;
      }
    }
    set({ options: next });
  },

  setOption: async (key, value) => {
    if (!isRegistryKey(key)) return;
    const prevOptions = get().options;
    set({ options: { ...prevOptions, [key]: value } });
    try {
      await settingsApi.set(key, value);
    } catch (e) {
      // Roll back to the value we had before this write.
      const fallback = prevOptions[key] ?? getOptionDefault(key);
      set({
        options: { ...get().options, [key]: fallback },
        error: e instanceof Error ? e.message : 'set-option-failed',
      });
      throw e;
    }
  },

  applyOptionSse: async (key) => {
    if (!isRegistryKey(key)) return;
    try {
      const { value } = await settingsApi.get<unknown>(key);
      set((s) => ({ options: { ...s.options, [key]: value } }));
    } catch {
      // server returned 404 / network blip — keep current value
    }
  },

  addSlide: async (payload) => {
    // signage-mode §3.5.3 — new slides inherit the active mode so SlideList
    // immediately shows them. Caller can override by passing mode explicitly.
    const mode = payload.mode ?? pickMode(get().options);
    const created = await slidesApi.create({ ...payload, mode });
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
    // signage-mode §3.5.3 — reorder is scoped to the current mode. Slides of
    // the other mode keep their relative order untouched on the client too.
    const mode = pickMode(get().options);
    const prev = get().slides;
    const map = new Map(prev.map((s) => [s.id, s]));
    const reorderedIds = orderedIds.filter((id) => map.get(id)?.mode === mode);
    const reordered = reorderedIds
      .map((id) => map.get(id))
      .filter((s): s is Slide => Boolean(s));
    const optimistic = [
      ...prev.filter((s) => s.mode !== mode),
      ...reordered,
    ];
    set({ slides: optimistic });
    try {
      const updatedThisMode = await slidesApi.reorder(mode, reorderedIds);
      set((s) => ({
        slides: [
          ...s.slides.filter((sl) => sl.mode !== mode),
          ...updatedThisMode,
        ],
      }));
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
