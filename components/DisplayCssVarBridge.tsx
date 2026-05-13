// Design Ref: signage-resolution §3.2.2 — mirrors store resolution into body
// CSS custom properties so any stylesheet can read `var(--canvas-w/h/aspect)`.
// Plan SC-1, SC-5 — immediate canvas update across editor/preview/HWPX.

'use client';

import { useEffect } from 'react';
import { useDisplayMetrics } from '@/hooks/useDisplayMetrics';

export default function DisplayCssVarBridge() {
  const { w, h, aspectRatio } = useDisplayMetrics();
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const body = document.body;
    body.style.setProperty('--canvas-w', `${w}px`);
    body.style.setProperty('--canvas-h', `${h}px`);
    body.style.setProperty('--canvas-aspect', aspectRatio);
  }, [w, h, aspectRatio]);
  return null;
}
