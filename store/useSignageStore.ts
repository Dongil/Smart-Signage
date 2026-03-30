// Design Ref: §10 — Store with slide type migration
import { create } from 'zustand';
import { Slide } from '@/types/slide';

export type { Slide };

// Plan SC: SC-1 하위 호환성 — type 필드 없는 기존 데이터 마이그레이션
const migrateSlide = (raw: Record<string, unknown>): Slide => ({
  id: (raw.id as string) ?? crypto.randomUUID(),
  type: (raw.type as Slide['type']) ?? 'text',
  title: (raw.title as string) ?? '',
  content: (raw.content as string) ?? '',
  backgroundColor: (raw.backgroundColor as string) ?? '#1a1a2e',
  duration: (raw.duration as number) ?? 5,
  mediaPath: raw.mediaPath as string | undefined,
  mediaOptions: raw.mediaOptions as Slide['mediaOptions'] | undefined,
});

const SLIDES_PATH = '/data/slides.json';

interface SignageState {
  slides: Slide[];
  currentSlideIndex: number;
  isFullscreen: boolean;
  addSlide: (slide: Slide) => void;
  updateSlide: (id: string, updates: Partial<Omit<Slide, 'id'>>) => void;
  deleteSlide: (id: string) => void;
  reorderSlides: (fromIndex: number, toIndex: number) => void;
  setCurrentSlideIndex: (index: number) => void;
  setFullscreen: (value: boolean) => void;
  saveToFile: () => Promise<void>;
  loadFromFile: () => Promise<void>;
}

export const useSignageStore = create<SignageState>((set) => ({
  slides: [],
  currentSlideIndex: 0,
  isFullscreen: false,

  addSlide: (slide) =>
    set((state) => ({ slides: [...state.slides, slide] })),

  updateSlide: (id, updates) =>
    set((state) => ({
      slides: state.slides.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    })),

  deleteSlide: (id) =>
    set((state) => {
      const slides = state.slides.filter((s) => s.id !== id);
      const currentSlideIndex = Math.min(state.currentSlideIndex, Math.max(0, slides.length - 1));
      return { slides, currentSlideIndex };
    }),

  reorderSlides: (fromIndex, toIndex) =>
    set((state) => {
      const slides = [...state.slides];
      const [moved] = slides.splice(fromIndex, 1);
      slides.splice(toIndex, 0, moved);
      return { slides };
    }),

  setCurrentSlideIndex: (index) => set({ currentSlideIndex: index }),
  setFullscreen: (value) => set({ isFullscreen: value }),

  saveToFile: async () => {
    const { slides, currentSlideIndex } = useSignageStore.getState();
    const data = JSON.stringify(slides, null, 2);
    if (window.electronAPI) {
      await window.electronAPI.invoke('save-file', { path: SLIDES_PATH, data });
      // Also push updated slides to signage window
      window.electronAPI.send('show-on-signage', { slides, startIndex: currentSlideIndex });
    } else {
      localStorage.setItem('signage-slides', data);
      // Also update signage output so the signage window picks up changes
      localStorage.setItem('signage-output', JSON.stringify({ slides, startIndex: currentSlideIndex }));
    }
  },

  loadFromFile: async () => {
    let raw: string | null = null;
    if (window.electronAPI) {
      raw = (await window.electronAPI.invoke('load-file', { path: SLIDES_PATH })) as string | null;
    } else {
      raw = localStorage.getItem('signage-slides');
    }
    if (raw) {
      const parsed = JSON.parse(raw);
      // Handle both array format and legacy object format
      const arr = Array.isArray(parsed) ? parsed : [];
      if (arr.length > 0) {
        const slides = arr.map((item: Record<string, unknown>) => migrateSlide(item));
        set({ slides, currentSlideIndex: 0 });
      }
    }
  },
}));
