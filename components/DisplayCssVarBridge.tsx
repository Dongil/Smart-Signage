// Design Ref: signage-resolution §3.2.2, ui-redesign §3.5.4 — mirrors all
// CSS-bound options into body custom properties so stylesheets can read:
//   --canvas-w  / --canvas-h  / --canvas-aspect (from signage.resolution)
//   --slide-padding-y                            (from slide.padding)
//   --slide-transition                           (from slide.transitionSec, 0=none)
// Plan SC-1, SC-5 — immediate update across editor/preview/HWPX/signage.

'use client';

import { useEffect } from 'react';
import { useDisplayMetrics } from '@/hooks/useDisplayMetrics';
import { useOption } from '@/hooks/useOption';

export default function DisplayCssVarBridge() {
  const { w, h, aspectRatio, tileCount } = useDisplayMetrics();
  const slidePadding = useOption<number>('slide.padding');
  const transitionSec = useOption<number>('slide.transitionSec');

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const body = document.body;
    // signage-mode §3.4.2 — `canvas-*` describes a single editor tile,
    // while `signage-*` describes the full signage window (one tile in
    // surround mode, `tileCount` tiles concatenated in individual mode).
    body.style.setProperty('--canvas-w', `${w}px`);
    body.style.setProperty('--canvas-h', `${h}px`);
    body.style.setProperty('--canvas-aspect', aspectRatio);
    body.style.setProperty('--tile-count', `${tileCount}`);
    const signageW = w * tileCount;
    body.style.setProperty('--signage-w', `${signageW}px`);
    body.style.setProperty('--signage-aspect', `${signageW} / ${h}`);
    body.style.setProperty('--slide-padding-y', `${slidePadding}px`);
    body.style.setProperty(
      '--slide-transition',
      transitionSec > 0 ? `opacity ${transitionSec}s ease-in-out` : 'none'
    );
  }, [w, h, aspectRatio, tileCount, slidePadding, transitionSec]);

  return null;
}
