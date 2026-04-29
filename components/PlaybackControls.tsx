// Design Ref: §2.M5, Plan FR-04 — Slideshow control bar.
// Renders below the signage preview. All actions go through the API so the
// signage window stays synchronized via SSE.

'use client';

import { useEffect, useState } from 'react';
import { usePlaybackStore } from '@/store/usePlaybackStore';
import { useSignageStore } from '@/store/useSignageStore';
import styles from './PlaybackControls.module.css';

const DURATION_MIN = 1;
const DURATION_MAX = 60;

export default function PlaybackControls() {
  const slides = useSignageStore((s) => s.slides);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const currentIndex = usePlaybackStore((s) => s.currentIndex);
  const duration = usePlaybackStore((s) => s.duration);
  const dispatch = usePlaybackStore((s) => s.dispatch);

  const total = slides.length;
  const currentSlide = slides[currentIndex];
  // Local mirror so the slider feels snappy while the user is dragging.
  const [draftDuration, setDraftDuration] = useState<number>(currentSlide?.duration ?? duration);

  useEffect(() => {
    setDraftDuration(currentSlide?.duration ?? duration);
  }, [currentSlide?.id, currentSlide?.duration, duration]);

  const send = (cmd: Parameters<typeof dispatch>[0]) => {
    dispatch(cmd).catch(() => undefined);
  };

  const onDurationCommit = (val: number) => {
    if (Number.isNaN(val)) return;
    const clamped = Math.max(DURATION_MIN, Math.min(DURATION_MAX, Math.round(val)));
    send({ action: 'setDuration', payload: { duration: clamped } });
  };

  const disabled = total === 0;

  return (
    <div className={styles.controls}>
      <div className={styles.row}>
        <button
          className={styles.btn}
          onClick={() => send({ action: 'first' })}
          disabled={disabled}
          title="처음 (Home)"
        >
          ⏮
        </button>
        <button
          className={styles.btn}
          onClick={() => send({ action: 'prev' })}
          disabled={disabled}
          title="이전 (←/Backspace/PageUp/P)"
        >
          ◀
        </button>
        <button
          className={`${styles.btn} ${styles.primary}`}
          onClick={() => send({ action: isPlaying ? 'pause' : 'play' })}
          disabled={disabled}
          title={isPlaying ? '일시정지 (S)' : '재생 (S)'}
        >
          {isPlaying ? '❚❚' : '▶'}
        </button>
        <button
          className={styles.btn}
          onClick={() => send({ action: 'next' })}
          disabled={disabled}
          title="다음 (Space/→/PageDown/N)"
        >
          ▶
        </button>
        <button
          className={styles.btn}
          onClick={() => send({ action: 'last' })}
          disabled={disabled}
          title="마지막 (End)"
        >
          ⏭
        </button>
        <span className={styles.counter}>
          {total === 0 ? '0/0' : `${currentIndex + 1}/${total}`}
        </span>
      </div>

      <div className={styles.row}>
        <label className={styles.label}>전환 시간</label>
        <input
          type="range"
          className={styles.slider}
          min={DURATION_MIN}
          max={DURATION_MAX}
          step={1}
          value={draftDuration}
          onChange={(e) => setDraftDuration(Number(e.target.value))}
          onPointerUp={() => onDurationCommit(draftDuration)}
          onKeyUp={() => onDurationCommit(draftDuration)}
          disabled={disabled}
        />
        <input
          type="number"
          className={styles.numberInput}
          min={DURATION_MIN}
          max={DURATION_MAX}
          step={1}
          value={draftDuration}
          onChange={(e) => {
            const v = Number(e.target.value);
            setDraftDuration(v);
          }}
          onBlur={() => onDurationCommit(draftDuration)}
          disabled={disabled}
        />
        <span className={styles.unit}>초</span>
      </div>

      <div className={styles.shortcutHint}>
        키: Space/→ 다음, ←/Backspace 이전, S 재생/일시정지, Home/End 처음/끝
      </div>
    </div>
  );
}
