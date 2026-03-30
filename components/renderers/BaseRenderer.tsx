// Design Ref: §5.1 — Full Surround (5760x1080) single slide display
'use client';

import { Slide } from '@/types/slide';
import styles from './BaseRenderer.module.css';

interface BaseRendererProps {
  slide: Slide;
  isVisible: boolean;
  children: React.ReactNode;
}

export default function BaseRenderer({ slide, isVisible, children }: BaseRendererProps) {
  return (
    <div
      className={styles.fullscreen}
      style={{
        backgroundColor: slide.backgroundColor,
        opacity: isVisible ? 1 : 0,
      }}
    >
      {children}
    </div>
  );
}
