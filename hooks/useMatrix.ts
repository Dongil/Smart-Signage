// Design Ref: matrix-control §3.5.2 — hook that wires IPC subscriptions and
// runs the initial hydrate. Mounted at the top of RightPanel; safely no-ops
// outside Electron (e.g. remote LAN browsers) because matrixApi.available()
// returns false there.

'use client';

import { useEffect } from 'react';
import { matrixApi } from '@/lib/api/matrix';
import { useMatrixStore } from '@/store/useMatrixStore';

export function useMatrix(): void {
  const hydrate = useMatrixStore((s) => s.hydrate);
  const applyState = useMatrixStore((s) => s.applyStatePush);
  const applyLog = useMatrixStore((s) => s.applyLogPush);

  useEffect(() => {
    if (!matrixApi.available()) return;
    hydrate();
    matrixApi.onState(applyState);
    matrixApi.onLog(applyLog);
    return () => matrixApi.offAll();
  }, [hydrate, applyState, applyLog]);
}
