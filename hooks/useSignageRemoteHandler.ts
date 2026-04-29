// Design Ref: Plan FR-03 (simplified) — Host-side handler for remote signage requests.
//
// The "원격 사이니지에 표시" button on a remote browser POSTs to the server,
// which broadcasts a `signage.requested` SSE event. Only the host's editor
// renderer (Electron) acts on it — it calls Electron IPC, which then shows
// or hides the dedicated signage BrowserWindow on the secondary monitor.
//
// Browsers without `window.electronAPI` short-circuit immediately so a
// remote tab never tries to open anything on its own screen.

'use client';

import { useEffect, useRef } from 'react';
import { useSseSubscribe } from '@/hooks/useSseSubscribe';
import type { ServerEvent } from '@/lib/api/sse';

export function useSignageRemoteHandler() {
  const isElectronRef = useRef(false);
  useEffect(() => {
    isElectronRef.current =
      typeof window !== 'undefined' && !!window.electronAPI;
  }, []);

  useSseSubscribe((event: ServerEvent) => {
    if (event.type !== 'signage.requested') return;
    if (!isElectronRef.current) return;
    const api = window.electronAPI;
    if (!api) return;
    if (event.action === 'show') {
      // Fire-and-forget — the local Toolbar handler will surface the
      // "확장 모니터 없음" error when the click originates on this PC.
      // For events triggered by remote PCs, we still try to show; if no
      // secondary monitor is attached, IPC simply returns ok=false and
      // the user on the remote PC can be told via a future toast/badge.
      api.invoke('signage-show').catch(() => undefined);
    } else {
      api.send('signage-hide');
    }
  });
}
