// Design Ref: matrix-control §3.5.1 — renderer-side mirror of the main service.
// All mutations go through IPC; main pushes back authoritative state via
// matrix:state. We keep an `error` slot so the UI can display the last failure
// from setOption / connect / route without crashing.

import { create } from 'zustand';
import { matrixApi } from '@/lib/api/matrix';
import type {
  ConnectionState,
  MatrixAliases,
  MatrixFullState,
  MatrixIpcResult,
  MatrixLogEntry,
  MatrixPreset,
  RouteMap,
} from '@/types/matrix';

const MAX_LOG = 200;
const DEFAULT_ALIASES: MatrixAliases = {
  input: ['1', '2', '3', '4', '5', '6', '7', '8'],
  output: ['1', '2', '3', '4', '5', '6', '7', '8'],
};

interface MatrixStoreState {
  state: ConnectionState;
  host: string;
  port: number;
  autoConnect: boolean;
  routes: RouteMap;
  aliases: MatrixAliases;
  presets: MatrixPreset[];
  log: MatrixLogEntry[];
  selectedInput: number | null;
  error: string | null;

  hydrate: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  routeTo: (output: number) => Promise<void>;
  refresh: () => Promise<void>;
  setHost: (host: string, port: number) => Promise<void>;
  setAlias: (isInput: boolean, idx1: number, value: string) => Promise<void>;
  setAutoConnect: (on: boolean) => Promise<void>;
  setSelectedInput: (n: number | null) => void;
  setHostDraft: (host: string, port: number) => void;
  applyStatePush: (state: MatrixFullState) => void;
  applyLogPush: (entry: MatrixLogEntry) => void;
  clearError: () => void;
  // ui-polish §7.1 — preset actions. addPreset returns IpcResult so the modal
  // can show errors inline (limit-reached, not-connected, etc).
  addPreset: (name: string, outputs: number[]) => Promise<MatrixIpcResult>;
  deletePreset: (id: string) => Promise<void>;
  applyPreset: (id: string) => Promise<void>;
}

export const useMatrixStore = create<MatrixStoreState>((set, get) => ({
  state: 'disconnected',
  host: '',
  port: 8000,
  autoConnect: false,
  routes: {},
  aliases: { input: [...DEFAULT_ALIASES.input], output: [...DEFAULT_ALIASES.output] },
  presets: [],
  log: [],
  selectedInput: null,
  error: null,

  hydrate: async () => {
    if (!matrixApi.available()) return;
    const s = await matrixApi.getState();
    if (s) {
      set({
        state: s.state,
        host: s.host,
        port: s.port,
        autoConnect: s.autoConnect,
        routes: s.routes,
        aliases: s.aliases,
        presets: s.presets ?? [],
      });
    }
  },

  connect: async () => {
    const { host, port } = get();
    set({ error: null });
    const r = await matrixApi.connect(host, port);
    if (!r.ok) set({ error: r.error });
  },

  disconnect: async () => {
    const r = await matrixApi.disconnect();
    if (!r.ok) set({ error: r.error });
    else set({ selectedInput: null });
  },

  routeTo: async (output) => {
    const input = get().selectedInput;
    if (!input) return;
    set({ error: null });
    const r = await matrixApi.route(input, output);
    if (!r.ok) set({ error: r.error });
    // Keep selectedInput so the operator can route to additional outputs quickly.
  },

  refresh: async () => {
    set({ error: null });
    const r = await matrixApi.refresh();
    if (!r.ok) set({ error: r.error });
  },

  setHost: async (host, port) => {
    set({ host, port });
    const r = await matrixApi.setHost(host, port);
    if (!r.ok) set({ error: r.error });
  },

  setHostDraft: (host, port) => set({ host, port }),

  setAlias: async (isInput, idx1, value) => {
    const r = await matrixApi.setAlias(isInput, idx1, value);
    if (!r.ok) set({ error: r.error });
    // applyStatePush updates aliases when main confirms.
  },

  setAutoConnect: async (on) => {
    set({ autoConnect: on });
    const r = await matrixApi.setAutoConnect(on);
    if (!r.ok) set({ error: r.error });
  },

  setSelectedInput: (n) => set({ selectedInput: n }),

  applyStatePush: (s) =>
    set({
      state: s.state,
      host: s.host,
      port: s.port,
      routes: s.routes,
      aliases: s.aliases ?? get().aliases,
      autoConnect: s.autoConnect ?? get().autoConnect,
      presets: s.presets ?? get().presets,
    }),

  applyLogPush: (entry) =>
    set((prev) => ({
      log: [...prev.log.slice(-(MAX_LOG - 1)), entry],
    })),

  clearError: () => set({ error: null }),

  addPreset: async (name, outputs) => {
    const r = await matrixApi.addPreset(name, outputs);
    if (!r.ok) set({ error: r.error });
    // On success, main broadcasts matrix:state with updated presets list.
    return r;
  },

  deletePreset: async (id) => {
    const r = await matrixApi.deletePreset(id);
    if (!r.ok) set({ error: r.error });
  },

  applyPreset: async (id) => {
    set({ error: null });
    const r = await matrixApi.applyPreset(id);
    if (!r.ok) {
      set({ error: r.error ?? 'apply-failed' });
      return;
    }
    if (r.failedRoutes.length > 0) {
      set({ error: `${r.failedRoutes.length}/${r.appliedCount + r.failedRoutes.length} 채널 적용 실패` });
    }
  },
}));
