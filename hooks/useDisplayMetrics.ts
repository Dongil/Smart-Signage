// Design Ref: signage-resolution §3.2.1, ui-redesign §3.6, signage-mode §3.4 —
// single hook to read canvas dimensions. Backed by the generic options
// registry. The effective canvas width depends on the signage mode:
// surround → full 5760×h, individual → 1920×h (tiled ×3 on signage output).

import { useOption } from './useOption';

export type SignageMode = 'surround' | 'individual';

export interface DisplayMetrics {
  /** Effective single-tile canvas width (5760 surround / 1920 individual). */
  w: number;
  /** Canvas height (from signage.resolution.h). */
  h: number;
  /** CSS `aspect-ratio` form, e.g. "5760 / 1080" or "1920 / 1080". */
  aspectRatio: string;
  /** How many horizontal copies of the slide the signage window holds. */
  tileCount: number;
  /** Current operational mode. */
  mode: SignageMode;
}

const INDIVIDUAL_TILE_WIDTH = 1920;
const INDIVIDUAL_TILE_COUNT = 3;

export function useDisplayMetrics(): DisplayMetrics {
  const res = useOption<{ w: number; h: number }>('signage.resolution');
  const mode = useOption<SignageMode>('signage.mode');

  const isIndividual = mode === 'individual';
  const w = isIndividual ? INDIVIDUAL_TILE_WIDTH : res.w;
  const tileCount = isIndividual ? INDIVIDUAL_TILE_COUNT : 1;

  return {
    w,
    h: res.h,
    aspectRatio: `${w} / ${res.h}`,
    tileCount,
    mode,
  };
}
