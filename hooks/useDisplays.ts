// Design Ref: monitor-target §3.4 — runtime display enumeration.
// Calls `get-displays` IPC on mount and re-fetches whenever main broadcasts
// the `displays-changed` event (display-added/removed/metrics-changed).

'use client';

import { useCallback, useEffect, useState } from 'react';

export interface DisplayInfo {
  id: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  isPrimary: boolean;
}

interface ElectronApi {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  on: (channel: string, cb: (...args: unknown[]) => void) => void;
  removeAllListeners: (channel: string) => void;
}

function getApi(): ElectronApi | null {
  if (typeof window === 'undefined') return null;
  const api = (window as unknown as { electronAPI?: ElectronApi }).electronAPI;
  return api ?? null;
}

export function useDisplays(): { displays: DisplayInfo[]; loading: boolean } {
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const refetch = useCallback(async () => {
    const api = getApi();
    if (!api) {
      setDisplays([]);
      setLoading(false);
      return;
    }
    try {
      const result = (await api.invoke('get-displays')) as DisplayInfo[];
      setDisplays(Array.isArray(result) ? result : []);
    } catch {
      setDisplays([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
    const api = getApi();
    if (!api) return;
    api.on('displays-changed', () => {
      void refetch();
    });
    return () => {
      api.removeAllListeners('displays-changed');
    };
  }, [refetch]);

  return { displays, loading };
}
