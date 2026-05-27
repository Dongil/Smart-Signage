// Design Ref: §2.M4, §1.3 — Preview reflects the server-authoritative
// PlaybackState (synced via SSE). Signage liveness flips automatically
// when the host's BrowserWindow shows or hides.
//
// ui-redesign §3.3.5 — In v1.3 the right column is a RightPanel that owns
// Preview + PlaybackControls + OperationOptionsPanel as siblings.
//
// signage-mode §3.6.3 — slides are filtered to the current mode (so the
// currentIndex matches the server's mode-scoped index) and the thumbnail
// tiles individual-mode slides ×3 to mirror what the signage window shows.
//
// monitor-target §UX-1 (v1.7 follow-up) — Preview decouples from
// SignageRenderer's tileCount: Individual mode always shows a single
// 1920×1080 logical screen (one monitor's worth) regardless of whether
// the output ends up tiled ×3 across a Surround canvas. The 3-segment
// guide overlay is suppressed in Individual mode for the same reason.

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSignageStore } from '@/store/useSignageStore';
import { usePlaybackStore } from '@/store/usePlaybackStore';
import { useOption } from '@/hooks/useOption';
import { useDisplayMetrics } from '@/hooks/useDisplayMetrics';
import RendererFactory from './renderers/RendererFactory';
import type { SignageMode } from '@/types/slide';
import styles from './Preview.module.css';

export default function Preview() {
  const slides = useSignageStore((s) => s.slides);
  const currentIndex = usePlaybackStore((s) => s.currentIndex);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const signageActive = usePlaybackStore((s) => s.signageActive);
  const mode = useOption<SignageMode>('signage.mode');
  const { w, h, tileCount } = useDisplayMetrics();
  // monitor-target §UX-1 — preview uses single tile in individual mode.
  const previewTileCount = mode === 'individual' ? 1 : tileCount;
  const previewW = mode === 'individual' ? 1920 : w * tileCount;
  const previewAspect = `${previewW} / ${h}`;
  // Right panel effective width = 608px (640 panel - 16+16 padding). Scale
  // the logical scaler down so 1920 logical width fits inside the .screen.
  // This replaces the hard-coded 0.1056 scale baked in Preview.module.css.
  const PREVIEW_DISPLAY_WIDTH = 608;
  const previewScale = PREVIEW_DISPLAY_WIDTH / previewW;

  const [isElectron, setIsElectron] = useState(false);
  useEffect(() => {
    setIsElectron(typeof window !== 'undefined' && !!window.electronAPI);
  }, []);

  const visibleSlides = useMemo(
    () => slides.filter((s) => s.mode === mode),
    [slides, mode]
  );
  const currentSlide = visibleSlides[currentIndex] ?? null;

  let liveLabel: string;
  let liveClass: string;
  if (!signageActive) {
    liveLabel = '출력 없음';
    liveClass = styles.offline;
  } else if (isPlaying) {
    liveLabel = '출력 중';
    liveClass = styles.live;
  } else {
    liveLabel = '일시정지';
    liveClass = styles.offline;
  }

  const showHint = isElectron
    ? '"사이니지에 표시"를 눌러 확장 모니터에 출력하세요'
    : '"원격 사이니지에 표시"를 눌러 호스트의 사이니지를 켜세요';

  const renderTiles = () => {
    if (!currentSlide) return null;
    if (previewTileCount <= 1) {
      return <RendererFactory slide={currentSlide} />;
    }
    return (
      <div className={styles.tileRow} style={{ ['--tile-count' as string]: previewTileCount }}>
        {Array.from({ length: previewTileCount }).map((_, i) => (
          <div key={i} className={styles.tile}>
            <RendererFactory slide={currentSlide} />
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={styles.preview}>
      <div className={styles.header}>
        <h3 className={styles.heading}>사이니지</h3>
        <span className={`${styles.status} ${liveClass}`}>{liveLabel}</span>
      </div>

      {!signageActive ? (
        <div className={styles.screenEmpty} style={{ aspectRatio: previewAspect }}>
          <p>{visibleSlides.length === 0 ? '슬라이드를 추가하세요' : showHint}</p>
        </div>
      ) : currentSlide ? (
        <>
          <div
            className={styles.screen}
            style={{
              backgroundColor: currentSlide.backgroundColor,
              aspectRatio: previewAspect,
            }}
          >
            <div
              className={styles.scaler}
              style={{
                width: `${previewW}px`,
                height: `${h}px`,
                transform: `scale(${previewScale})`,
              }}
            >
              {renderTiles()}
            </div>
            {previewTileCount > 1 && (
              <div
                className={styles.guides}
                style={{
                  width: `${previewW}px`,
                  height: `${h}px`,
                  transform: `scale(${previewScale})`,
                }}
              />
            )}
          </div>
          <div className={styles.meta}>
            <span>{currentSlide.title || currentSlide.type}</span>
            <span>
              {currentIndex + 1}/{visibleSlides.length}
            </span>
            <span>{currentSlide.duration}초</span>
          </div>
        </>
      ) : (
        <div className={styles.screenEmpty}>
          <p>슬라이드를 추가하세요</p>
        </div>
      )}
    </div>
  );
}
