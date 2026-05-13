// Design Ref: §3.3 — SlideEditor delegates to EditorFactory
// signage-mode §3.5.4 — slides list is filtered to the current mode so the
// editingIndex always refers to a slide of the active mode.
'use client';

import { useMemo } from 'react';
import { useSignageStore } from '@/store/useSignageStore';
import { useOption } from '@/hooks/useOption';
import type { SignageMode } from '@/types/slide';
import EditorFactory from './editors/EditorFactory';
import styles from './SlideEditor.module.css';

export default function SlideEditor() {
  const slides = useSignageStore((state) => state.slides);
  const editingIndex = useSignageStore((state) => state.editingIndex);
  const updateSlide = useSignageStore((state) => state.updateSlide);
  const mode = useOption<SignageMode>('signage.mode');

  const visibleSlides = useMemo(
    () => slides.filter((s) => s.mode === mode),
    [slides, mode]
  );
  const slide = visibleSlides[editingIndex];

  if (!slide) {
    return (
      <section className={styles.editor}>
        <p className={styles.empty}>슬라이드를 추가하세요</p>
      </section>
    );
  }

  return (
    <section className={styles.editor}>
      <EditorFactory
        slide={slide}
        onUpdate={(updates) => updateSlide(slide.id, updates)}
      />
    </section>
  );
}
