// Design Ref: §2.M6, FR-05-4 — One-slide thumbnail in the import modal.
// Mirrors the editor's 5760×1080 canvas but scaled to fit the modal column.

'use client';

import styles from './HwpxImport.module.css';
import type { PreviewSlide } from '@/lib/hwpx/splitByLines';

interface Props {
  index: number;
  total: number;
  slide: PreviewSlide;
}

const CANVAS_W = 5760;
const CANVAS_H = 1080;
const PREVIEW_W = 480;
const SCALE = PREVIEW_W / CANVAS_W;

export default function HwpxPreviewSlide({ index, total, slide }: Props) {
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
        style={{ width: PREVIEW_W, height: CANVAS_H * SCALE }}
      >
        <div
          className={styles.previewCanvas}
          style={{
            width: CANVAS_W,
            height: CANVAS_H,
            transform: `scale(${SCALE})`,
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
