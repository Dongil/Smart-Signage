'use client';

import { useMemo } from 'react';
import { RendererProps } from '../templates/templateRegistry';
import { detectFontSize, calcVerticalPadding } from '../editors/paddingUtils';
import { useDisplayMetrics } from '@/hooks/useDisplayMetrics';
import styles from './TextSlide.module.css';

export default function TextSlide({ slide }: RendererProps) {
  // Design Ref: signage-resolution §3.4 — padding scales with current canvas height
  const { h: displayH } = useDisplayMetrics();
  const fontSize = useMemo(
    () => detectFontSize(slide.content, displayH),
    [slide.content, displayH]
  );
  const verticalPadding = calcVerticalPadding(fontSize, displayH);

  return (
    <div
      className={styles.container}
      style={{ paddingTop: verticalPadding, paddingBottom: verticalPadding }}
      dangerouslySetInnerHTML={{ __html: slide.content }}
    />
  );
}
