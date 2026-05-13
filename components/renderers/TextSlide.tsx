'use client';

import { useMemo } from 'react';
import { RendererProps } from '../templates/templateRegistry';
import { detectFontSize, calcVerticalPadding } from '../editors/paddingUtils';
import { useDisplayMetrics } from '@/hooks/useDisplayMetrics';
import { useOption } from '@/hooks/useOption';
import styles from './TextSlide.module.css';

export default function TextSlide({ slide }: RendererProps) {
  // Design Ref: signage-resolution §3.4 — padding scales with current canvas height
  // ui-redesign §3.5.2 — user-set slide.padding overrides the auto-calc curve
  const { h: displayH } = useDisplayMetrics();
  const slidePadding = useOption<number>('slide.padding');
  const fontSize = useMemo(
    () => detectFontSize(slide.content, displayH, slidePadding),
    [slide.content, displayH, slidePadding]
  );
  const verticalPadding = calcVerticalPadding(fontSize, displayH, slidePadding);

  return (
    <div
      className={styles.container}
      style={{ paddingTop: verticalPadding, paddingBottom: verticalPadding }}
      dangerouslySetInnerHTML={{ __html: slide.content }}
    />
  );
}
