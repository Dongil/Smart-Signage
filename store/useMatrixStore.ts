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
  MatrixLogEntry,
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
}

export const useMatrixStore = create<MatrixStoreState>((set, get) => ({
  state: 'disconnected',
  host: '',
  port: 8000,
  autoConnect: false,
  routes: {},
  aliases: { input: [...DEFAULT_ALIASES.input], output: [...DEFAULT_ALIASES.output] },
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
    }),

  applyLogPush: (entry) =>
    set((prev) => ({
      log: [...prev.log.slice(-(MAX_LOG - 1)), entry],
    })),

  clearError: () => set({ error: null }),
}));
