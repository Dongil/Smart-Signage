// Design Ref: §2.M4 — Mirror of the server's PlaybackState (§4.2).
// Single client (the registered signage device) drives auto-advance via the
// API; everyone else just observes.
//
// Staleness guard: every PlaybackState carries `updatedAt` (server-set on
// every commit). HTTP responses to `dispatch()` and SSE `control.changed`
// events can arrive in either order — if the HTTP response is older than
// what SSE has already delivered, dropping the stale write keeps the store
// from briefly flipping back to a past snapshot (e.g. signageActive=true
// → false → true) which was visible at 5760×1200 as a 1+ second delay
// before PlaybackControls reappeared.

import { create } from 'zustand';
import { controlApi, type ControlAction, type PlaybackState } from '@/lib/api/control';

interface PlaybackStoreState extends PlaybackState {
  hydrate: () => Promise<void>;
  applyServerState: (state: PlaybackState) => void;
  dispatch: (cmd: ControlAction) => Promise<PlaybackState>;
}

function applyIfFresh(prev: PlaybackState, next: PlaybackState): PlaybackState {
  // If `next` is strictly older than what we already have, drop it.
  // Equal timestamps still apply (same commit, idempotent).
  return next.updatedAt >= prev.updatedAt ? next : prev;
}

export const usePlaybackStore = create<PlaybackStoreState>((set) => ({
  isPlaying: false,
  currentIndex: 0,
  totalSlides: 0,
  duration: 5,
  updatedAt: 0,
  signageActive: false,

  hydrate: async () => {
    const state = await controlApi.get();
    set((prev) => applyIfFresh(prev, state));
  },

  applyServerState: (state) => set((prev) => applyIfFresh(prev, state)),

  dispatch: async (cmd) => {
    const state = await controlApi.dispatch(cmd);
    set((prev) => applyIfFresh(prev, state));
    return state;
  },
}));
