// Design Ref: §5.5 — Webpage renderer with sandbox security
'use client';

import { RendererProps } from '../templates/templateRegistry';
import styles from './WebpageSlide.module.css';

export default function WebpageSlide({ slide }: RendererProps) {
  if (!slide.content) return null;

  return (
    <iframe
      src={slide.content}
      sandbox="allow-scripts allow-same-origin"
      referrerPolicy="no-referrer"
      className={styles.iframe}
      title={slide.title || 'Webpage'}
    />
  );
}
