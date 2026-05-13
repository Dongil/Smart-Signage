// Design Ref: §1.3, §2.M4 — Single SSE listener that fans events out to
// every store. Mounted near the root of pages that need live updates.

'use client';

import { useCallback } from 'react';
import { useSseSubscribe } from '@/hooks/useSseSubscribe';
import { useSignageStore } from '@/store/useSignageStore';
import { usePlaybackStore } from '@/store/usePlaybackStore';
import { useDeviceStore } from '@/store/useDeviceStore';
import { slidesApi } from '@/lib/api/slides';
import type { ServerEvent } from '@/lib/api/sse';

export default function SseBridge() {
  const applySlides = useSignageStore((s) => s.applySseHydrate);
  const applySettings = useSignageStore((s) => s.applySettingsSse);
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
          // Design Ref: signage-resolution §3.5.3 — re-fetch settings on change.
          // Server is source of truth; broadcasts hit initiator + observers alike.
          if (event.key === 'signage.resolution') {
            applySettings().catch(() => undefined);
          }
          break;
      }
    },
    [applySlides, applySettings, applyControl, refreshDevice]
  );

  useSseSubscribe(handler);
  return null;
}
