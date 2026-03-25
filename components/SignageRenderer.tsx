'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Slide } from '@/types/slide';
import { useSignageListener } from '@/hooks/useElectronIPC';
import styles from './SignageRenderer.module.css';

export default function SignageRenderer() {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSlideData = useCallback((data: Slide) => {
    setSlides((prev) => {
      const exists = prev.find((s) => s.id === data.id);
      if (exists) {
        return prev.map((s) => (s.id === data.id ? data : s));
      }
      return [...prev, data];
    });
  }, []);

  useSignageListener(handleSlideData);

  // 자동 슬라이드쇼
  useEffect(() => {
    if (slides.length <= 1) return;

    const currentSlide = slides[activeIndex];
    if (!currentSlide) return;

    timerRef.current = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => {
        setActiveIndex((prev) => (prev + 1) % slides.length);
        setIsVisible(true);
      }, 500);
    }, currentSlide.duration * 1000);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [activeIndex, slides]);

  const currentSlide = slides[activeIndex];

  if (!currentSlide) {
    return <div className={styles.container} />;
  }

  return (
    <div className={styles.container}>
      {/* 3패널 Surround 레이아웃 */}
      <div className={styles.panels}>
        {[0, 1, 2].map((panelIndex) => (
          <div
            key={panelIndex}
            className={styles.panel}
            style={{
              backgroundColor: currentSlide.backgroundColor,
              opacity: isVisible ? 1 : 0,
            }}
          >
            <div className={styles.content}>
              <h1 className={styles.title}>{currentSlide.title}</h1>
              <p className={styles.text}>{currentSlide.content}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
