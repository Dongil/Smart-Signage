// Design Ref: §2.M2, §4.5 — Server event types broadcast to all SSE clients.
// These types are shared by services (emitters) and the SSE manager (consumer).

export type ServerEvent =
  | {
      type: 'slide.changed';
      op: 'create' | 'update' | 'delete' | 'reorder';
      ids: string[];
    }
  | {
      type: 'control.changed';
      state: PlaybackState;
    }
  | {
      type: 'settings.changed';
      key: string;
    }
  | {
      type: 'device.changed';
      deviceId: string;
    }
  | {
      // Remote → host signal: a remote browser clicked "원격 사이니지에 표시".
      // The host's editor renderer subscribes to this event and forwards it
      // to Electron main via IPC (which then shows/hides the BrowserWindow).
      // Browsers receive the event but ignore it — they cannot run signage.
      type: 'signage.requested';
      action: 'show' | 'hide';
    };

export interface PlaybackState {
  isPlaying: boolean;
  currentIndex: number;
  totalSlides: number;
  duration: number;
  updatedAt: number;
  /** True while at least one signage output window is alive (heartbeat
   *  received within the timeout). When false, isPlaying is forced false. */
  signageActive: boolean;
}
