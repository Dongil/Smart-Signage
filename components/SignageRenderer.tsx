// Design Ref: §2.M4, §1.3, §6 — Signage output driven by SQLite + SSE.
// State sources:
//   - useSignageStore.slides     (server mirror)
//   - usePlaybackStore           (server PlaybackState mirror via SSE)
// Auto-advance behavior moves to Module 5 (PlaybackControls). For now,
// we honor isPlaying + currentIndex from the server so SSE control already works.
//
// ui-redesign §3.5.5 (revised) — true crossfade. Two stacked layers: the
// committed slide sits underneath at full opacity, and an incoming slide
// fades 0→1 above it. Because the committed slide is fully opaque the
// whole time, no black background ever shows between slides. After the
// transition duration we promote the incoming slide to "committed" and
// unmount the top layer. With transitionSec=0 we just swap, no layering.

'use client';

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useSignageStore } from '@/store/useSignageStore';
import { usePlaybackStore } from '@/store/usePlaybackStore';
import { useSignageLiveness } from '@/hooks/useSignageLiveness';
import { useOption } from '@/hooks/useOption';
import { useDisplayMetrics } from '@/hooks/useDisplayMetrics';
import RendererFactory from './renderers/RendererFactory';
import type { Slide, SignageMode } from '@/types/slide';
import styles from './SignageRenderer.module.css';

export default function SignageRenderer() {
  const slides = useSignageStore((s) => s.slides);
  const hydrateSlides = useSignageStore((s) => s.hydrate);
  const hydratePlayback = usePlaybackStore((s) => s.hydrate);
  const dispatch = usePlaybackStore((s) => s.dispatch);
  const currentIndex = usePlaybackStore((s) => s.currentIndex);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const transitionSec = useOption<number>('slide.transitionSec');
  const mode = useOption<SignageMode>('signage.mode');
  const { tileCount } = useDisplayMetrics();

  // signage-mode §3.6.1 — only slides of the current mode are eligible for
  // playback; controlService's currentIndex is indexed into this filtered
  // collection, so they must agree on the same view of the data.
  const visibleSlides = useMemo(
    () => slides.filter((s) => s.mode === mode),
    [slides, mode]
  );

  const target: Slide | null = visibleSlides[currentIndex] ?? null;

  const [committed, setCommitted] = useState<Slide | null>(target);
  const [incoming, setIncoming] = useState<Slide | null>(null);
  const [incomingVisible, setIncomingVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const promoteRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tells the editor "I'm here". Closing this window stops the heartbeat
  // and the editor flips to "출력 없음" within ~3 seconds (or instantly via
  // the sendBeacon stop signal on graceful close).
  useSignageLiveness();

  useEffect(() => {
    hydrateSlides();
    hydratePlayback();
  }, [hydrateSlides, hydratePlayback]);

  // Crossfade controller — runs whenever the target slide or transitionSec change.
  useEffect(() => {
    if (!target) {
      setCommitted(null);
      setIncoming(null);
      setIncomingVisible(false);
      return;
    }
    // First render / initial assignment.
    if (committed === null) {
      setCommitted(target);
      return;
    }
    if (target === committed) return;
    if (transitionSec <= 0) {
      // CUT — instant swap, no transition layer.
      setCommitted(target);
      setIncoming(null);
      setIncomingVisible(false);
      return;
    }

    // Start crossfade: mount incoming above committed at opacity 0, then on
    // the next two animation frames flip to opacity 1 so the CSS transition
    // engages. (One rAF is sometimes enough but two is robust across browsers
    // when the element was just mounted.)
    setIncoming(target);
    setIncomingVisible(false);

    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setIncomingVisible(true));
    });

    // After the fade duration plus a small buffer, promote incoming and drop
    // the top layer. The buffer compensates for the 2-frame setup delay so
    // the swap happens after the eye has seen a full fade-in.
    const promoteMs = Math.round(transitionSec * 1000) + 60;
    if (promoteRef.current) clearTimeout(promoteRef.current);
    promoteRef.current = setTimeout(() => {
      setCommitted(target);
      setIncoming(null);
      setIncomingVisible(false);
    }, promoteMs);

    return () => {
      if (raf1) cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      if (promoteRef.current) {
        clearTimeout(promoteRef.current);
        promoteRef.current = null;
      }
    };
  }, [target, transitionSec, committed]);

  // Auto-advance — only the signage device drives this so the timer fires
  // exactly once per slide regardless of how many remote viewers are connected.
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!isPlaying) return;
    if (visibleSlides.length <= 1) return;
    const slide = visibleSlides[currentIndex];
    if (!slide) return;
    if (slide.type === 'video' && !slide.mediaOptions?.loop) {
      // Video auto-advance happens via onVideoEnd.
      return;
    }
    timerRef.current = setTimeout(() => {
      dispatch({ action: 'next' }).catch(() => undefined);
    }, slide.duration * 1000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isPlaying, currentIndex, visibleSlides, dispatch]);

  const handleVideoEnd = useCallback(() => {
    dispatch({ action: 'next' }).catch(() => undefined);
  }, [dispatch]);

  if (!committed) {
    return (
      <div className={styles.container}>
        <p className={styles.waiting}>사이니지 대기 중...</p>
      </div>
    );
  }

  const transitionCss =
    transitionSec > 0 ? `opacity ${transitionSec}s ease-in-out` : 'none';

  // signage-mode §3.6.1 — individual mode tiles the 1920-wide slide ×3
  // across the 5760-wide signage window. Only the first tile receives the
  // onVideoEnd callback so a single "next" fires per slide.
  const renderTiles = (slide: Slide) => {
    if (tileCount <= 1) {
      return <RendererFactory slide={slide} onVideoEnd={handleVideoEnd} />;
    }
    return (
      <div className={styles.tileRow}>
        {Array.from({ length: tileCount }).map((_, i) => (
          <div key={i} className={styles.tile}>
            <RendererFactory
              slide={slide}
              onVideoEnd={i === 0 ? handleVideoEnd : undefined}
            />
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <div
        className={styles.layer}
        style={{
          backgroundColor: committed.backgroundColor,
          opacity: 1,
          zIndex: 0,
        }}
      >
        {renderTiles(committed)}
      </div>
      {incoming && (
        <div
          className={styles.layer}
          style={{
            backgroundColor: incoming.backgroundColor,
            opacity: incomingVisible ? 1 : 0,
            transition: transitionCss,
            zIndex: 1,
          }}
        >
          {renderTiles(incoming)}
        </div>
      )}
    </div>
  );
}
