'use client';

import { useSignageStore } from '@/store/useSignageStore';
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
      <div className={styles.field}>
        <label htmlFor="slide-title">제목</label>
        <input
          id="slide-title"
          type="text"
          value={slide.title}
          onChange={(e) => updateSlide(slide.id, { title: e.target.value })}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="slide-content">내용</label>
        <textarea
          id="slide-content"
          rows={8}
          value={slide.content}
          onChange={(e) => updateSlide(slide.id, { content: e.target.value })}
        />
      </div>
      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="slide-bg">배경색</label>
          <div className={styles.colorInput}>
            <input
              id="slide-bg"
              type="color"
              value={slide.backgroundColor}
              onChange={(e) => updateSlide(slide.id, { backgroundColor: e.target.value })}
            />
            <span>{slide.backgroundColor}</span>
          </div>
        </div>
        <div className={styles.field}>
          <label htmlFor="slide-duration">표시 시간 (초)</label>
          <input
            id="slide-duration"
            type="number"
            min={1}
            max={300}
            value={slide.duration}
            onChange={(e) => updateSlide(slide.id, { duration: Number(e.target.value) })}
          />
        </div>
      </div>
    </section>
  );
}
