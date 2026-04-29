// Design Ref: §2.M4 — One SSE connection per page that fans out to stores.

import { useEffect } from 'react';
import { subscribeToServerEvents, type ServerEvent } from '@/lib/api/sse';

export function useSseSubscribe(handler: (event: ServerEvent) => void) {
  useEffect(() => {
    let sub: { close: () => void } | null = null;
    let cancelled = false;
    subscribeToServerEvents({
      onEvent: handler,
    }).then((s) => {
      if (cancelled) {
        s.close();
      } else {
        sub = s;
      }
    });
    return () => {
      cancelled = true;
      sub?.close();
    };
  }, [handler]);
}
