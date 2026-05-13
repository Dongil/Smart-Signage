// Design Ref: §2.M4, §1.3 — Preview reflects the server-authoritative
// PlaybackState (synced via SSE). Signage liveness flips automatically
// when the host's BrowserWindow shows or hides.

'use client';

import { useEffect, useState } from 'react';
import { useSignageStore } from '@/store/useSignageStore';
import { usePlaybackStore } from '@/store/usePlaybackStore';
import RendererFactory from './renderers/RendererFactory';
import PlaybackControls from './PlaybackControls';
import ResolutionSelect from './ResolutionSelect';
import styles from './Preview.module.css';

export default function Preview() {
  const slides = useSignageStore((s) => s.slides);
  const currentIndex = usePlaybackStore((s) => s.currentIndex);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const signageActive = usePlaybackStore((s) => s.signageActive);

  const [isElectron, setIsElectron] = useState(false);
  useEffect(() => {
    setIsElectron(typeof window !== 'undefined' && !!window.electronAPI);
  }, []);

  const currentSlide = slides[currentIndex] ?? null;

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

  return (
    <aside className={styles.preview}>
      <div className={styles.header}>
        <h3 className={styles.heading}>사이니지</h3>
        <ResolutionSelect />
        <span className={`${styles.status} ${liveClass}`}>{liveLabel}</span>
      </div>

      {!signageActive ? (
        <div className={styles.screenEmpty}>
          <p>{slides.length === 0 ? '슬라이드를 추가하세요' : showHint}</p>
        </div>
      ) : currentSlide ? (
        <>
          <div
            className={styles.screen}
            style={{ backgroundColor: currentSlide.backgroundColor }}
          >
            <div className={styles.scaler}>
              <RendererFactory slide={currentSlide} />
            </div>
            <div className={styles.guides} />
          </div>
          <div className={styles.meta}>
            <span>{currentSlide.title || currentSlide.type}</span>
            <span>
              {currentIndex + 1}/{slides.length}
            </span>
            <span>{currentSlide.duration}초</span>
          </div>
          <PlaybackControls />
        </>
      ) : (
        <div className={styles.screenEmpty}>
          <p>슬라이드를 추가하세요</p>
        </div>
      )}
    </aside>
  );
}
