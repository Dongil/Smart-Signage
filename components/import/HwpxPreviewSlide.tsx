// Design Ref: §2.M6, FR-05-4 — One-slide thumbnail in the import modal.
// signage-resolution §3.3.2 — canvas dims sourced from store so preview matches
// the operational signage canvas (e.g. 5760×1080 vs 5760×1200).

'use client';

import { useDisplayMetrics } from '@/hooks/useDisplayMetrics';
import styles from './HwpxImport.module.css';
import type { PreviewSlide } from '@/lib/hwpx/splitByLines';

interface Props {
  index: number;
  total: number;
  slide: PreviewSlide;
}

const PREVIEW_W = 480;

export default function HwpxPreviewSlide({ index, total, slide }: Props) {
  const { w: CANVAS_W, h: CANVAS_H } = useDisplayMetrics();
  const scale = PREVIEW_W / CANVAS_W;
  return (
    <div className={styles.previewItem}>
      <div className={styles.previewHeader}>
        <span>
          {index + 1}/{total}
        </span>
        <span className={styles.previewMeta}>
          {slide.blocks.length}줄 · 폰트 {slide.representativeFontSize}px
        </span>
      </div>
      <div
        className={styles.previewCanvasWrap}
        style={{ width: PREVIEW_W, height: CANVAS_H * scale }}
      >
        <div
          className={styles.previewCanvas}
          style={{
            width: CANVAS_W,
            height: CANVAS_H,
            transform: `scale(${scale})`,
          }}
        >
          <div
            className={styles.previewBody}
            dangerouslySetInnerHTML={{ __html: slide.contentHtml }}
          />
          <div className={styles.previewGuides} />
        </div>
      </div>
    </div>
  );
}
