// Design Ref: signage-resolution §3.2.1, ui-redesign §3.6 — single hook to
// read canvas dimensions. Backed by the generic options registry — the
// signage.resolution entry stores {w, h}, and useOption supplies the default
// when the store hasn't yet hydrated.

import { useOption } from './useOption';

export interface DisplayMetrics {
  w: number;
  h: number;
  /** CSS `aspect-ratio` form, e.g. "5760 / 1080". */
  aspectRatio: string;
}

export function useDisplayMetrics(): DisplayMetrics {
  const res = useOption<{ w: number; h: number }>('signage.resolution');
  return {
    w: res.w,
    h: res.h,
    aspectRatio: `${res.w} / ${res.h}`,
  };
}
