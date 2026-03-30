// Design Ref: §3.3 — SlideEditor delegates to EditorFactory
'use client';

import { useSignageStore } from '@/store/useSignageStore';
import EditorFactory from './editors/EditorFactory';
import styles from './SlideEditor.module.css';

export default function SlideEditor() {
  const slides = useSignageStore((state) => state.slides);
  const currentSlideIndex = useSignageStore((state) => state.currentSlideIndex);
  const updateSlide = useSignageStore((state) => state.updateSlide);

  const slide = slides[currentSlideIndex];

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
