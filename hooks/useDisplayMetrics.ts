// Design Ref: signage-resolution §3.2.1, ui-redesign §3.6, signage-mode §3.4 —
// single hook to read canvas dimensions. Backed by the generic options
// registry. The effective canvas width depends on the signage mode:
// surround → full 5760×h, individual → 1920×h (tiled ×3 on signage output).
//
// Design Ref: monitor-target §3.6 — tile=1 when targetId set.
// Individual mode + user-selected target → render exactly 1 tile (the signage
// window will be placed on a 1920×1080 physical monitor, so tiling ×3 would
// just squeeze 3 copies into 1920 — defeating the purpose of the selection).

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
  const targetId = useOption<number | null>('signage.targetDisplayId');

  const isIndividual = mode === 'individual';
  const hasTarget = targetId !== null && targetId !== undefined;
  const w = isIndividual ? INDIVIDUAL_TILE_WIDTH : res.w;
  // Plan SC-2: individual + target → 1 tile native; individual auto → keep ×3 legacy.
  const tileCount = isIndividual ? (hasTarget ? 1 : INDIVIDUAL_TILE_COUNT) : 1;

  return {
    w,
    h: res.h,
    aspectRatio: `${w} / ${res.h}`,
    tileCount,
    mode,
  };
}
