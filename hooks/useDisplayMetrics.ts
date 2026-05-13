// Design Ref: signage-resolution §3.2.1 — single hook to read canvas dimensions.
// All TS consumers (RichTextEditor, HwpxPreviewSlide, …) read through this hook
// instead of importing the store directly, so the source of truth stays in one place.

import { useSignageStore } from '@/store/useSignageStore';

export interface DisplayMetrics {
  w: number;
  h: number;
  /** CSS `aspect-ratio` form, e.g. "5760 / 1080". */
  aspectRatio: string;
}

export function useDisplayMetrics(): DisplayMetrics {
  const res = useSignageStore((s) => s.resolution);
  return {
    w: res.w,
    h: res.h,
    aspectRatio: `${res.w} / ${res.h}`,
  };
}
