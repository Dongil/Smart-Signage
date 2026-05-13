// Design Ref: §1.2 — Signage window liveness reporter.
//
// The signage page only beats while the host's BrowserWindow is actually
// visible. We get that signal from Electron main via the `signage-visibility`
// IPC channel — this is more reliable than `document.visibilityState`,
// which flickers between hidden→visible→hidden during initial load and
// caused `signageActive=true` to appear briefly on app launch.
//
// In a non-Electron browser (the user opened /signage directly) we fall
// back to the visibility API, but that path mostly only matters for dev.

'use client';

import { useEffect, useRef, useState } from 'react';
import { controlApi } from '@/lib/api/control';
import { getApiBaseUrl } from '@/lib/api/client';

const HEARTBEAT_MS = 1000;

export function useSignageLiveness() {
  // Tracks whether the host window currently has the signage on screen.
  // Defaults to false; we wait for the first explicit signal before
  // sending heartbeats so cold-load can never claim signageActive=true.
  const [active, setActive] = useState(false);
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // Subscribe to visibility signals from Electron main.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const api = window.electronAPI;
    if (!api) {
      // Non-Electron fallback: rely on document visibility (browser dev only).
      const sync = () => setActive(!document.hidden);
      sync();
      document.addEventListener('visibilitychange', sync);
      return () => document.removeEventListener('visibilitychange', sync);
    }
    api.on('signage-visibility', (visible) => setActive(!!visible));
    // Resolve the current visibility once on mount in case main already
    // toggled before our listener was registered (e.g. fast click cycles).
    api.invoke('signage-is-visible').then((v) => {
      setActive(!!v);
    });
    return () => api.removeAllListeners('signage-visibility');
  }, []);

  // Heartbeat loop — only beats while `active` is true. Flipping to false
  // immediately POSTs a stop so the editor sees "출력 없음" without waiting
  // for the 3-second server timeout.
  //
  // Important: the cleanup of this effect runs ALSO on deps change (false→true
  // and true→false). If we sent signageStop() in the cleanup, the next
  // signageHeartbeat() would race with it, sometimes letting stop arrive last
  // and pinning the server at signageActive=false. That caused "first click
  // shows signage but PlaybackControls stay hidden until a second click."
  //
  // Fix: the `else` branch below handles every true→false transition
  // (window hidden → explicit stop). Real unmount is handled by a separate
  // empty-deps effect below.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      if (cancelled || !activeRef.current) return;
      controlApi.signageHeartbeat().catch(() => undefined);
    };

    if (active) {
      tick();
      timer = setInterval(tick, HEARTBEAT_MS);
    } else {
      // Window just hidden (or never shown) — make sure server agrees.
      controlApi.signageStop().catch(() => undefined);
    }

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [active]);

  // Window-close / unmount safety net — only fires on actual page teardown,
  // never on active-flip. Uses sendBeacon so the stop survives abrupt closes.
  useEffect(() => {
    const sendStopBeacon = () => {
      if (typeof navigator === 'undefined' || !navigator.sendBeacon) return;
      getApiBaseUrl()
        .then((base) => {
          try {
            navigator.sendBeacon(
              `${base}/api/control/signage-stop`,
              new Blob([], { type: 'application/json' })
            );
          } catch {
            // ignore — server still has the heartbeat-timeout backstop.
          }
        })
        .catch(() => undefined);
    };

    window.addEventListener('pagehide', sendStopBeacon);
    window.addEventListener('beforeunload', sendStopBeacon);

    return () => {
      window.removeEventListener('pagehide', sendStopBeacon);
      window.removeEventListener('beforeunload', sendStopBeacon);
      controlApi.signageStop().catch(() => undefined);
    };
  }, []);
}
