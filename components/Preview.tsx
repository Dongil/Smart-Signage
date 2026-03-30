// Signage monitor panel — mirrors what's displayed on the signage output
'use client';

import { useState, useEffect } from 'react';
import { Slide } from '@/types/slide';
import { useSignageStore } from '@/store/useSignageStore';
import RendererFactory from './renderers/RendererFactory';
import styles from './Preview.module.css';

const SIGNAGE_OUTPUT_KEY = 'signage-output';
const SIGNAGE_STATE_KEY = 'signage-state';
const HEARTBEAT_TIMEOUT = 2000; // 2초 이상 heartbeat 없으면 오프라인

interface SignageState {
  activeIndex: number;
  totalSlides: number;
  timestamp: number;
}

export default function Preview() {
  const slides = useSignageStore((state) => state.slides);
  const [outputSlides, setOutputSlides] = useState<Slide[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLive, setIsLive] = useState(false);

  // Poll signage heartbeat + output data
  useEffect(() => {
    const check = () => {
      // Check heartbeat from signage window
      const stateRaw = localStorage.getItem(SIGNAGE_STATE_KEY);
      if (stateRaw) {
        try {
          const state = JSON.parse(stateRaw) as SignageState;
          const isRecent = Date.now() - state.timestamp < HEARTBEAT_TIMEOUT;

          if (isRecent) {
            setIsLive(true);
            setActiveIndex(state.activeIndex);

            // Load output slides if not loaded yet
            const outputRaw = localStorage.getItem(SIGNAGE_OUTPUT_KEY);
            if (outputRaw) {
              const payload = JSON.parse(outputRaw) as { slides: Slide[] };
              setOutputSlides(payload.slides);
            }
            return;
          }
        } catch { /* ignore */ }
      }

      // No heartbeat = offline
      setIsLive(false);
    };

    check();
    const interval = setInterval(check, 500);
    return () => clearInterval(interval);
  }, []);

  const currentSlide = isLive && outputSlides.length > 0
    ? outputSlides[activeIndex] ?? outputSlides[0]
    : null;

  return (
    <aside className={styles.preview}>
      <div className={styles.header}>
        <h3 className={styles.heading}>사이니지</h3>
        <span className={`${styles.status} ${isLive ? styles.live : styles.offline}`}>
          {isLive ? '출력 중' : '출력 없음'}
        </span>
      </div>

      {currentSlide ? (
        <>
          <div
            className={styles.screen}
            style={{ backgroundColor: currentSlide.backgroundColor }}
          >
            <div className={styles.scaler}>
              <RendererFactory slide={currentSlide} />
            </div>
          </div>
          <div className={styles.meta}>
            <span>{currentSlide.title || currentSlide.type}</span>
            <span>{activeIndex + 1}/{outputSlides.length}</span>
            <span>{currentSlide.duration}초</span>
          </div>
        </>
      ) : (
        <div className={styles.screenEmpty}>
          <p>{slides.length > 0 ? '"사이니지에 표시"를 눌러주세요' : '슬라이드를 추가하세요'}</p>
        </div>
      )}
    </aside>
  );
}
