// Design Ref: §2.M4, §1.3, §6 — Signage output driven by SQLite + SSE.
// State sources:
//   - useSignageStore.slides     (server mirror)
//   - usePlaybackStore           (server PlaybackState mirror via SSE)
// Auto-advance behavior moves to Module 5 (PlaybackControls). For now,
// we honor isPlaying + currentIndex from the server so SSE control already works.

'use client';

import { useEffect, useState, useRef } from 'react';
import { useSignageStore } from '@/store/useSignageStore';
import { usePlaybackStore } from '@/store/usePlaybackStore';
import { useSignageLiveness } from '@/hooks/useSignageLiveness';
import BaseRenderer from './renderers/BaseRenderer';
import RendererFactory from './renderers/RendererFactory';
import styles from './SignageRenderer.module.css';

export default function SignageRenderer() {
  const slides = useSignageStore((s) => s.slides);
  const hydrateSlides = useSignageStore((s) => s.hydrate);
  const hydratePlayback = usePlaybackStore((s) => s.hydrate);
  const dispatch = usePlaybackStore((s) => s.dispatch);
  const currentIndex = usePlaybackStore((s) => s.currentIndex);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);

  const [isVisible, setIsVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tells the editor "I'm here". Closing this window stops the heartbeat
  // and the editor flips to "출력 없음" within ~3 seconds (or instantly via
  // the sendBeacon stop signal on graceful close).
  useSignageLiveness();

  useEffect(() => {
    hydrateSlides();
    hydratePlayback();
  }, [hydrateSlides, hydratePlayback]);

  // Local fade animation when slide changes.
  useEffect(() => {
    setIsVisible(false);
    const t = setTimeout(() => setIsVisible(true), 250);
    return () => clearTimeout(t);
  }, [currentIndex]);

  // Auto-advance — only the signage device drives this so the timer fires
  // exactly once per slide regardless of how many remote viewers are connected.
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!isPlaying) return;
    if (slides.length <= 1) return;
    const slide = slides[currentIndex];
    if (!slide) return;
    if (slide.type === 'video' && !slide.mediaOptions?.loop) {
      // Video auto-advance happens via onVideoEnd.
      return;
    }
    timerRef.current = setTimeout(() => {
      dispatch({ action: 'next' }).catch(() => undefined);
    }, slide.duration * 1000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isPlaying, currentIndex, slides, dispatch]);

  const handleVideoEnd = () => {
    dispatch({ action: 'next' }).catch(() => undefined);
  };

  const currentSlide = slides[currentIndex];

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
