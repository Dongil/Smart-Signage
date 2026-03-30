// Design Ref: §9 — SignageRenderer with full slide array + auto slideshow
'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Slide } from '@/types/slide';
import { useSignageListener } from '@/hooks/useElectronIPC';
import BaseRenderer from './renderers/BaseRenderer';
import RendererFactory from './renderers/RendererFactory';
import styles from './SignageRenderer.module.css';

const SIGNAGE_STATE_KEY = 'signage-state';

export default function SignageRenderer() {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSlidesReceived = useCallback((newSlides: Slide[], startIndex: number) => {
    setSlides(newSlides);
    setActiveIndex(startIndex);
    setIsVisible(true);
  }, []);

  useSignageListener(handleSlidesReceived);

  const advanceSlide = useCallback(() => {
    if (slides.length <= 1) return;
    setIsVisible(false);
    setTimeout(() => {
      setActiveIndex((prev) => (prev + 1) % slides.length);
      setIsVisible(true);
    }, 500);
  }, [slides.length]);

  const handleVideoEnd = useCallback(() => {
    advanceSlide();
  }, [advanceSlide]);

  // Auto slideshow (duration-based)
  useEffect(() => {
    if (slides.length <= 1) return;
    const currentSlide = slides[activeIndex];
    if (!currentSlide) return;

    if (currentSlide.type === 'video' && !currentSlide.mediaOptions?.loop) {
      return;
    }

    timerRef.current = setTimeout(advanceSlide, currentSlide.duration * 1000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [activeIndex, slides, advanceSlide]);

  // Broadcast state to editor (heartbeat + current index)
  useEffect(() => {
    if (slides.length === 0) return;

    const broadcast = () => {
      localStorage.setItem(SIGNAGE_STATE_KEY, JSON.stringify({
        activeIndex,
        totalSlides: slides.length,
        timestamp: Date.now(),
      }));
    };

    broadcast();
    const interval = setInterval(broadcast, 500);

    // Cleanup: remove state on unmount (window close)
    return () => {
      clearInterval(interval);
      localStorage.removeItem(SIGNAGE_STATE_KEY);
    };
  }, [activeIndex, slides.length]);

  const currentSlide = slides[activeIndex];

  if (!currentSlide) {
    return (
      <div className={styles.container}>
        <p className={styles.waiting}>사이니지 대기 중...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <BaseRenderer slide={currentSlide} isVisible={isVisible}>
        <RendererFactory slide={currentSlide} onVideoEnd={handleVideoEnd} />
      </BaseRenderer>
    </div>
  );
}
