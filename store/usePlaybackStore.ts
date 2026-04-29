// Design Ref: §2.M4 — Mirror of the server's PlaybackState (§4.2).
// Single client (the registered signage device) drives auto-advance via the
// API; everyone else just observes.

import { create } from 'zustand';
import { controlApi, type ControlAction, type PlaybackState } from '@/lib/api/control';

interface PlaybackStoreState extends PlaybackState {
  hydrate: () => Promise<void>;
  applyServerState: (state: PlaybackState) => void;
  dispatch: (cmd: ControlAction) => Promise<PlaybackState>;
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
    set(state);
  },

  applyServerState: (state) => set(state),

  dispatch: async (cmd) => {
    const state = await controlApi.dispatch(cmd);
    set(state);
    return state;
  },
}));
