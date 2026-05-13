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
  const { tileCount } = useDisplayMetrics();

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
    if (tileCount <= 1) {
      return <RendererFactory slide={currentSlide} />;
    }
    return (
      <div className={styles.tileRow}>
        {Array.from({ length: tileCount }).map((_, i) => (
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
        <div className={styles.screenEmpty}>
          <p>{visibleSlides.length === 0 ? '슬라이드를 추가하세요' : showHint}</p>
        </div>
      ) : currentSlide ? (
        <>
          <div
            className={styles.screen}
            style={{ backgroundColor: currentSlide.backgroundColor }}
          >
            <div className={styles.scaler}>{renderTiles()}</div>
            <div className={styles.guides} />
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
