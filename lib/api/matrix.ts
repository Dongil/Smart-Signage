// Design Ref: matrix-control §3.3.2 — typed IPC wrapper for the editor renderer.
// Returns either { ok: true } or { ok: false, error } so the store can surface
// failures without crashing. Mounting outside Electron (e.g. remote LAN browser)
// hits matrixApi.available() = false — callers must guard with that before use.

import type {
  MatrixApplyPresetResult,
  MatrixFullState,
  MatrixIpcResult,
  MatrixLogEntry,
} from '@/types/matrix';

interface ElectronAPI {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  on: (channel: string, callback: (...args: unknown[]) => void) => void;
  removeAllListeners: (channel: string) => void;
}

function getApi(): ElectronAPI | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { electronAPI?: ElectronAPI };
  return w.electronAPI ?? null;
}

function invokeResult(channel: string, ...args: unknown[]): Promise<MatrixIpcResult> {
  const api = getApi();
  if (!api) return Promise.resolve({ ok: false, error: 'not-electron' });
  return api.invoke(channel, ...args).then(
    (r) => (r as MatrixIpcResult) ?? { ok: false, error: 'empty-response' },
    (err) => ({ ok: false, error: err instanceof Error ? err.message : String(err) })
  );
}

export const matrixApi = {
  available: (): boolean => getApi() !== null,

  connect: (host: string, port: number) =>
    invokeResult('matrix:connect', host, port),

  disconnect: () => invokeResult('matrix:disconnect'),

  route: (input: number, output: number) =>
    invokeResult('matrix:route', input, output),

  routeAll: (input: number) => invokeResult('matrix:route-all', input),

  refresh: () => invokeResult('matrix:refresh'),

  getState: async (): Promise<MatrixFullState | null> => {
    const api = getApi();
    if (!api) return null;
    try {
      const v = await api.invoke('matrix:get-state');
      return v as MatrixFullState;
    } catch {
      return null;
    }
  },

  setAlias: (isInput: boolean, idx1: number, value: string) =>
    invokeResult('matrix:set-alias', isInput, idx1, value),

  setHost: (host: string, port: number) =>
    invokeResult('matrix:set-host', host, port),

  setAutoConnect: (on: boolean) => invokeResult('matrix:set-auto-connect', on),

  // ui-polish §5.3 — preset CRUD + apply
  addPreset: (name: string, outputs: number[]) =>
    invokeResult('matrix:add-preset', name, outputs),

  deletePreset: (id: string) => invokeResult('matrix:delete-preset', id),

  applyPreset: async (id: string): Promise<MatrixApplyPresetResult> => {
    const api = getApi();
    if (!api) {
      return { ok: false, appliedCount: 0, failedRoutes: [], error: 'not-electron' };
    }
    try {
      const v = await api.invoke('matrix:apply-preset', id);
      return (v as MatrixApplyPresetResult) ?? {
        ok: false, appliedCount: 0, failedRoutes: [], error: 'empty-response',
      };
    } catch (e) {
      return {
        ok: false,
        appliedCount: 0,
        failedRoutes: [],
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },

  onState: (cb: (state: MatrixFullState) => void): void => {
    getApi()?.on('matrix:state', (s) => cb(s as MatrixFullState));
  },

  onLog: (cb: (entry: MatrixLogEntry) => void): void => {
    getApi()?.on('matrix:log', (e) => cb(e as MatrixLogEntry));
  },

  offAll: (): void => {
    const api = getApi();
    if (!api) return;
    api.removeAllListeners('matrix:state');
    api.removeAllListeners('matrix:log');
  },
};
