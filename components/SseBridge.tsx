// Design Ref: §1.3, §2.M4 — Single SSE listener that fans events out to
// every store. Mounted near the root of pages that need live updates.
// ui-redesign §3.7 — settings.changed now dispatches by registry key so
// every option (current and future) is automatically synced.

'use client';

import { useCallback } from 'react';
import { useSseSubscribe } from '@/hooks/useSseSubscribe';
import { useSignageStore } from '@/store/useSignageStore';
import { usePlaybackStore } from '@/store/usePlaybackStore';
import { useDeviceStore } from '@/store/useDeviceStore';
import { slidesApi } from '@/lib/api/slides';
import { isRegistryKey } from '@/lib/options/registry';
import type { ServerEvent } from '@/lib/api/sse';

export default function SseBridge() {
  const applySlides = useSignageStore((s) => s.applySseHydrate);
  const applyOption = useSignageStore((s) => s.applyOptionSse);
  const applyControl = usePlaybackStore((s) => s.applyServerState);
  const refreshDevice = useDeviceStore((s) => s.applyEvent);

  const handler = useCallback(
    (event: ServerEvent) => {
      switch (event.type) {
        case 'slide.changed':
          // Re-fetch the full list — keeps ordering consistent across reorders/deletes.
          slidesApi
            .list()
            .then(applySlides)
            .catch(() => undefined);
          break;
        case 'control.changed':
          applyControl(event.state);
          break;
        case 'device.changed':
          refreshDevice(event.deviceId).catch(() => undefined);
          break;
        case 'settings.changed':
          // Generic dispatch: any registry key triggers a single-key re-fetch.
          if (isRegistryKey(event.key)) {
            applyOption(event.key).catch(() => undefined);
          }
          break;
      }
    },
    [applySlides, applyOption, applyControl, refreshDevice]
  );

  useSseSubscribe(handler);
  return null;
}
