// Design Ref: §4.5, §8 — EventSource subscription with automatic reconnect.

import { getApiBaseUrl } from './client';
import type { PlaybackState } from './control';

export type ServerEvent =
  | { type: 'slide.changed'; op: 'create' | 'update' | 'delete' | 'reorder'; ids: string[] }
  | { type: 'control.changed'; state: PlaybackState }
  | { type: 'settings.changed'; key: string }
  | { type: 'device.changed'; deviceId: string }
  | { type: 'signage.requested'; action: 'show' | 'hide' };

const EVENT_NAMES: ServerEvent['type'][] = [
  'slide.changed',
  'control.changed',
  'settings.changed',
  'device.changed',
  'signage.requested',
];

interface SubscribeOptions {
  onEvent: (event: ServerEvent) => void;
  onOpen?: () => void;
  onError?: (err: unknown) => void;
}

export interface SseSubscription {
  close: () => void;
}

const RECONNECT_INITIAL_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

export async function subscribeToServerEvents(
  opts: SubscribeOptions
): Promise<SseSubscription> {
  const base = await getApiBaseUrl();
  const url = `${base}/api/events`;

  let es: EventSource | null = null;
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let backoffMs = RECONNECT_INITIAL_MS;

  const handle = (e: MessageEvent) => {
    try {
      const parsed = JSON.parse(e.data) as ServerEvent;
      opts.onEvent(parsed);
    } catch {
      // ignore malformed
    }
  };

  const connect = () => {
    if (closed) return;
    es = new EventSource(url, { withCredentials: true });

    es.onopen = () => {
      backoffMs = RECONNECT_INITIAL_MS;
      opts.onOpen?.();
    };

    for (const name of EVENT_NAMES) {
      es.addEventListener(name, handle);
    }

    es.onerror = (err) => {
      opts.onError?.(err);
      es?.close();
      es = null;
      if (closed) return;
      reconnectTimer = setTimeout(connect, backoffMs);
      backoffMs = Math.min(backoffMs * 2, RECONNECT_MAX_MS);
    };
  };

  connect();

  return {
    close: () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
      es = null;
    },
  };
}
