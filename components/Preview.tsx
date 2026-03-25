'use client';

import { useSignageStore } from '@/store/useSignageStore';
import styles from './Preview.module.css';

export default function Preview() {
  const slides = useSignageStore((state) => state.slides);
  const currentSlideIndex = useSignageStore((state) => state.currentSlideIndex);

  const slide = slides[currentSlideIndex];

  if (!slide) {
    return (
      <aside className={styles.preview}>
        <p className={styles.empty}>미리보기</p>
      </aside>
    );
  }

  return (
    <aside className={styles.preview}>
      <h3 className={styles.heading}>미리보기</h3>
      <div
        className={styles.screen}
        style={{ backgroundColor: slide.backgroundColor }}
      >
        <div className={styles.content}>
          <h2 className={styles.title}>{slide.title}</h2>
          <p className={styles.text}>{slide.content}</p>
        </div>
      </div>
      <p className={styles.meta}>{slide.duration}초</p>
    </aside>
  );
}
