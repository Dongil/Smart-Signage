'use client';

import { useMemo } from 'react';
import { RendererProps } from '../templates/templateRegistry';
import { detectFontSize, calcVerticalPadding } from '../editors/paddingUtils';
import styles from './TextSlide.module.css';

export default function TextSlide({ slide }: RendererProps) {
  const fontSize = useMemo(() => detectFontSize(slide.content), [slide.content]);
  const verticalPadding = calcVerticalPadding(fontSize);

  return (
    <div
      className={styles.container}
      style={{ paddingTop: verticalPadding, paddingBottom: verticalPadding }}
      dangerouslySetInnerHTML={{ __html: slide.content }}
    />
  );
}
