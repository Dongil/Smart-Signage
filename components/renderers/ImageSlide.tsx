// Design Ref: §5.3 — Image renderer with objectFit
'use client';

import { RendererProps } from '../templates/templateRegistry';
import styles from './ImageSlide.module.css';

export default function ImageSlide({ slide }: RendererProps) {
  const mediaUrl = slide.mediaPath ? `media://${slide.mediaPath}` : '';

  return (
    <div className={styles.container}>
      {mediaUrl && (
        <img
          src={mediaUrl}
          alt={slide.title}
          style={{ objectFit: slide.mediaOptions?.objectFit ?? 'cover' }}
          className={styles.image}
        />
      )}
      {slide.title && <h1 className={styles.overlay}>{slide.title}</h1>}
    </div>
  );
}
