// Design Ref: §5.4 — Video renderer with autoplay/loop/muted + onEnded
'use client';

import { useRef } from 'react';
import { RendererProps } from '../templates/templateRegistry';
import styles from './VideoSlide.module.css';

export default function VideoSlide({ slide, onVideoEnd }: RendererProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const mediaUrl = slide.mediaPath ? `media://${slide.mediaPath}` : '';

  if (!mediaUrl) return null;

  return (
    <video
      ref={videoRef}
      src={mediaUrl}
      autoPlay={slide.mediaOptions?.autoplay ?? true}
      loop={slide.mediaOptions?.loop ?? false}
      muted={slide.mediaOptions?.muted ?? true}
      onEnded={onVideoEnd}
      style={{ objectFit: slide.mediaOptions?.objectFit ?? 'cover' }}
      className={styles.video}
    />
  );
}
