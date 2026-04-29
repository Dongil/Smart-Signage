// Design Ref: §4.2 — Typed wrappers for /api/control.
import { apiFetch } from './client';

export interface PlaybackState {
  isPlaying: boolean;
  currentIndex: number;
  totalSlides: number;
  duration: number;
  updatedAt: number;
  signageActive: boolean;
}

export type ControlAction =
  | { action: 'play' }
  | { action: 'pause' }
  | { action: 'next' }
  | { action: 'prev' }
  | { action: 'first' }
  | { action: 'last' }
  | { action: 'goto'; payload: { index: number } }
  | { action: 'setDuration'; payload: { duration: number } };

export const controlApi = {
  get: async (): Promise<PlaybackState> => {
    const res = await apiFetch<{ state: PlaybackState }>('/api/control');
    return res.state;
  },

  dispatch: async (cmd: ControlAction): Promise<PlaybackState> => {
    const res = await apiFetch<{ state: PlaybackState }>('/api/control', {
      method: 'POST',
      body: cmd,
    });
    return res.state;
  },

  signageHeartbeat: async (): Promise<PlaybackState> => {
    const res = await apiFetch<{ state: PlaybackState }>(
      '/api/control/signage-heartbeat',
      { method: 'POST', body: {} }
    );
    return res.state;
  },

  signageStop: async (): Promise<PlaybackState> => {
    const res = await apiFetch<{ state: PlaybackState }>(
      '/api/control/signage-stop',
      { method: 'POST', body: {} }
    );
    return res.state;
  },

  /** Asks the host (Electron) to show or hide its signage BrowserWindow.
   *  Remote browsers call this; the host's editor renderer turns the
   *  resulting SSE signal into an Electron IPC call. */
  requestSignage: async (action: 'show' | 'hide'): Promise<PlaybackState> => {
    const res = await apiFetch<{ state: PlaybackState }>(
      '/api/control/signage-request',
      { method: 'POST', body: { action } }
    );
    return res.state;
  },
};
