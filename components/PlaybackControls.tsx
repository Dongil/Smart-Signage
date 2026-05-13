// Design Ref: §2.M5, Plan FR-04 — Slideshow control bar.
// ui-redesign §3.4 — always rendered; visually disabled when signage is off.
// All actions go through the API so the signage window stays in sync via SSE.

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
  const signageActive = usePlaybackStore((s) => s.signageActive);
  const dispatch = usePlaybackStore((s) => s.dispatch);

  const total = slides.length;
  const currentSlide = slides[currentIndex];
  // Local mirror so the slider feels snappy while the user is dragging.
  const [draftDuration, setDraftDuration] = useState<number>(currentSlide?.duration ?? duration);

  useEffect(() => {
    setDraftDuration(currentSlide?.duration ?? duration);
  }, [currentSlide?.id, currentSlide?.duration, duration]);

  // ui-redesign §3.4 — controls are always visible. They are disabled either
  // because the signage window is off, or because there are no slides yet.
  // Click attempts on disabled buttons should be no-ops (native disabled + the
  // wrapper's pointer-events:none for belt-and-suspenders).
  const noSlides = total === 0;
  const disabled = !signageActive || noSlides;

  const send = (cmd: Parameters<typeof dispatch>[0]) => {
    if (disabled) return;
    dispatch(cmd).catch(() => undefined);
  };

  const onDurationCommit = (val: number) => {
    if (disabled) return;
    if (Number.isNaN(val)) return;
    const clamped = Math.max(DURATION_MIN, Math.min(DURATION_MAX, Math.round(val)));
    send({ action: 'setDuration', payload: { duration: clamped } });
  };

  let hint: string | null = null;
  if (noSlides) hint = '슬라이드를 추가하세요';
  else if (!signageActive) hint = '"사이니지에 표시"를 누르면 활성화됩니다';

  return (
    <div className={`${styles.controls} ${disabled ? styles.disabled : ''}`}>
      <div className={styles.transport}>
        <button
          className={styles.btn}
          onClick={() => send({ action: 'first' })}
          disabled={disabled}
          title="처음 (Home)"
          aria-label="처음 슬라이드"
        >
          ⏮
        </button>
        <button
          className={styles.btn}
          onClick={() => send({ action: 'prev' })}
          disabled={disabled}
          title="이전 (←/Backspace/PageUp/P)"
          aria-label="이전 슬라이드"
        >
          ◀
        </button>
        <button
          className={`${styles.btn} ${styles.primary}`}
          onClick={() => send({ action: isPlaying ? 'pause' : 'play' })}
          disabled={disabled}
          title={isPlaying ? '일시정지 (S)' : '재생 (S)'}
          aria-label={isPlaying ? '일시정지' : '재생'}
        >
          {isPlaying ? '❚❚' : '▶'}
        </button>
        <button
          className={styles.btn}
          onClick={() => send({ action: 'next' })}
          disabled={disabled}
          title="다음 (Space/→/PageDown/N)"
          aria-label="다음 슬라이드"
        >
          ▶
        </button>
        <button
          className={styles.btn}
          onClick={() => send({ action: 'last' })}
          disabled={disabled}
          title="마지막 (End)"
          aria-label="마지막 슬라이드"
        >
          ⏭
        </button>
        <span className={styles.counter}>
          {total === 0 ? '0/0' : `${currentIndex + 1}/${total}`}
        </span>
      </div>

      <div className={styles.durationRow}>
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

      {hint && <div className={styles.hint}>{hint}</div>}

      <div className={styles.shortcutHint}>
        키: Space/→ 다음, ←/Backspace 이전, S 재생/일시정지, Home/End 처음/끝
      </div>
    </div>
  );
}
