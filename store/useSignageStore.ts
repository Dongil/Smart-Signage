import { create } from 'zustand';
import { Slide } from '@/types/slide';

export type { Slide };

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
    const { slides } = useSignageStore.getState();
    await window.electronAPI?.invoke('save-file', {
      path: SLIDES_PATH,
      data: JSON.stringify(slides, null, 2),
    });
  },

  loadFromFile: async () => {
    const result = await window.electronAPI?.invoke('load-file', {
      path: SLIDES_PATH,
    });
    if (result) {
      const slides = JSON.parse(result as string) as Slide[];
      set({ slides, currentSlideIndex: 0 });
    }
  },
}));
