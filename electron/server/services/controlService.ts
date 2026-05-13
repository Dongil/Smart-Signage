// Design Ref: §2.M2, §4.2 — Slideshow control state machine.
//
// State lives in-memory. `isPlaying` is bound to signage liveness: the
// signage window pings `recordSignageHeartbeat()` while open; if no ping
// arrives for SIGNAGE_TIMEOUT_MS we treat the signage as gone and force a
// pause. This is what makes "재생 중" honest — a stale flag from before the
// signage window closed cannot survive once heartbeats stop.

import { eventBus } from './eventBus';
import { listSlides, updateSlide } from './slideService';
import { getSetting } from './settingsService';
import type { PlaybackState } from '../events';
import type { SignageMode } from '../../../types/slide';

export type ControlAction =
  | { action: 'play' }
  | { action: 'pause' }
  | { action: 'next' }
  | { action: 'prev' }
  | { action: 'first' }
  | { action: 'last' }
  | { action: 'goto'; payload: { index: number } }
  | { action: 'setDuration'; payload: { duration: number } };

const DEFAULT_DURATION = 5;
const SIGNAGE_TIMEOUT_MS = 3000;
const LIVENESS_TICK_MS = 1000;

interface InternalState extends PlaybackState {
  lastSignageHeartbeatAt: number;
}

let state: InternalState = {
  isPlaying: false,
  currentIndex: 0,
  totalSlides: 0,
  duration: DEFAULT_DURATION,
  updatedAt: 0,
  signageActive: false,
  lastSignageHeartbeatAt: 0,
};

let livenessTimer: NodeJS.Timeout | null = null;

function publicSnapshot(): PlaybackState {
  return {
    isPlaying: state.isPlaying,
    currentIndex: state.currentIndex,
    totalSlides: state.totalSlides,
    duration: state.duration,
    updatedAt: state.updatedAt,
    signageActive: state.signageActive,
  };
}

function getCurrentMode(): SignageMode {
  // Design Ref: signage-mode §3.2.3 — playback always operates on the slide
  // collection of the currently selected mode. Default 'surround' covers
  // both fresh installs and migrated v1.3 data.
  const stored = getSetting<SignageMode>('signage.mode');
  return stored === 'individual' ? 'individual' : 'surround';
}

function refreshFromSlides(): void {
  const slides = listSlides(getCurrentMode());
  state.totalSlides = slides.length;
  if (state.currentIndex >= slides.length) {
    state.currentIndex = Math.max(0, slides.length - 1);
  }
  const slide = slides[state.currentIndex];
  state.duration = slide?.duration ?? state.duration;
}

function commit(): PlaybackState {
  state.updatedAt = Date.now();
  refreshFromSlides();
  const out = publicSnapshot();
  eventBus.emit({ type: 'control.changed', state: out });
  return out;
}

function tickLiveness(): void {
  if (!state.signageActive) return;
  if (Date.now() - state.lastSignageHeartbeatAt <= SIGNAGE_TIMEOUT_MS) return;
  // Heartbeat lapsed — signage gone.
  state.signageActive = false;
  if (state.isPlaying) state.isPlaying = false;
  commit();
}

export function initControl(): void {
  const def = getSetting<number>('playback.defaultDuration');
  if (typeof def === 'number') state.duration = def;
  refreshFromSlides();
  if (!livenessTimer) {
    livenessTimer = setInterval(tickLiveness, LIVENESS_TICK_MS);
    if (typeof livenessTimer.unref === 'function') livenessTimer.unref();
  }
  // signage-mode §3.2.3 — when the user flips signage.mode, slide collections
  // swap entirely. Reset playback so the new mode starts fresh instead of
  // pointing at a stale currentIndex that may exceed the new mode's count.
  eventBus.on((event) => {
    if (event.type === 'settings.changed' && event.key === 'signage.mode') {
      state.currentIndex = 0;
      state.isPlaying = false;
      commit();
    }
  });
}

export function shutdownControl(): void {
  if (livenessTimer) {
    clearInterval(livenessTimer);
    livenessTimer = null;
  }
}

export function getControlState(): PlaybackState {
  refreshFromSlides();
  return publicSnapshot();
}

/**
 * Called by every signage output window roughly every second. Updates the
 * heartbeat timestamp and, if this is the first ping after a quiet period,
 * marks the signage as active and emits an event.
 */
export function recordSignageHeartbeat(): PlaybackState {
  state.lastSignageHeartbeatAt = Date.now();
  if (!state.signageActive) {
    state.signageActive = true;
    return commit();
  }
  return publicSnapshot();
}

/** Explicit signal from a closing signage window (beforeunload / button). */
export function markSignageStopped(): PlaybackState {
  state.signageActive = false;
  state.lastSignageHeartbeatAt = 0;
  if (state.isPlaying) state.isPlaying = false;
  return commit();
}

/**
 * Remote-trigger: a (possibly remote) editor wants the host's signage
 * BrowserWindow shown or hidden. The server merely forwards the request via
 * SSE; the host's editor renderer translates it to an IPC call to Electron
 * main, which is the only place that can actually move the BrowserWindow.
 *
 * Why this is safe to fire from any client (no popup blocker concerns):
 * Electron's BrowserWindow.show() does not require a user gesture, unlike
 * the browser-side window.open() that bit us in earlier iterations.
 */
export function requestSignage(action: 'show' | 'hide'): PlaybackState {
  if (action === 'show' && listSlides(getCurrentMode()).length > 0) {
    state.isPlaying = true;
  } else if (action === 'hide' && state.isPlaying) {
    state.isPlaying = false;
  }
  const snap = commit();
  eventBus.emit({ type: 'signage.requested', action });
  return snap;
}

export function dispatchControl(cmd: ControlAction): PlaybackState {
  const slides = listSlides(getCurrentMode());
  const total = slides.length;

  switch (cmd.action) {
    case 'play':
      state.isPlaying = total > 0;
      break;
    case 'pause':
      state.isPlaying = false;
      break;
    case 'next':
      if (total > 0) state.currentIndex = (state.currentIndex + 1) % total;
      break;
    case 'prev':
      if (total > 0) state.currentIndex = (state.currentIndex - 1 + total) % total;
      break;
    case 'first':
      state.currentIndex = 0;
      break;
    case 'last':
      if (total > 0) state.currentIndex = total - 1;
      break;
    case 'goto':
      if (total > 0) {
        state.currentIndex = Math.max(0, Math.min(total - 1, cmd.payload.index));
      }
      break;
    case 'setDuration': {
      const slide = slides[state.currentIndex];
      if (slide) updateSlide(slide.id, { duration: cmd.payload.duration });
      state.duration = cmd.payload.duration;
      break;
    }
  }

  return commit();
}
