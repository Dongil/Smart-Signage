// Design Ref: matrix-control §3.2 — singleton orchestrator + IPC bridge.
// Owns one Pn8080MatrixService for the lifetime of the editor BrowserWindow,
// persists host/port/aliases/autoConnect via the existing settingsService, and
// forwards every state/log change to the editor renderer over IPC.

import { ipcMain, BrowserWindow } from 'electron';
import { Pn8080MatrixService } from './Pn8080MatrixService';
import {
  getSetting,
  setSetting,
} from '../server/services/settingsService';
import { getLogger } from '../logger';
import type {
  MatrixAliases,
  MatrixFullState,
  MatrixIpcResult,
  MatrixLogEntry,
  MatrixSnapshot,
} from '../../types/matrix';

const KEY_HOST = 'matrix.host';
const KEY_PORT = 'matrix.port';
const KEY_AUTO = 'matrix.autoConnect';
const KEY_ALIASES = 'matrix.aliases';
const MAX_ALIAS_LEN = 10;

const DEFAULT_ALIASES: MatrixAliases = {
  input: ['1', '2', '3', '4', '5', '6', '7', '8'],
  output: ['1', '2', '3', '4', '5', '6', '7', '8'],
};

let service: Pn8080MatrixService | null = null;
let editorWinRef: BrowserWindow | null = null;
let handlersRegistered = false;

export function initMatrix(editorWin: BrowserWindow): void {
  editorWinRef = editorWin;
  service = new Pn8080MatrixService();

  service.on('state', (snap: MatrixSnapshot) => {
    safeSend('matrix:state', toFullState(snap));
  });
  service.on('log', (entry: MatrixLogEntry) => {
    safeSend('matrix:log', entry);
  });

  if (!handlersRegistered) {
    registerIpc();
    handlersRegistered = true;
  }

  // Optional auto-connect at boot. Errors are background-only — do not block UI.
  const autoConnect = readBool(KEY_AUTO);
  const host = readString(KEY_HOST);
  if (autoConnect && host) {
    const port = readNumber(KEY_PORT) ?? Pn8080MatrixService.DefaultPort;
    safeLog(`auto-connect on boot: ${host}:${port}`);
    service.connect(host, port).catch((err) => {
      safeLog('auto-connect failed: ' + (err?.message ?? err));
    });
  }
}

export async function disposeMatrix(): Promise<void> {
  const svc = service;
  service = null;
  if (!svc) return;
  try { await svc.disconnect(); } catch { /* noop */ }
  svc.dispose();
}

// --------------- IPC handlers ---------------

function registerIpc(): void {
  ipcMain.handle('matrix:connect', async (_e, host: string, port: number): Promise<MatrixIpcResult> => {
    try {
      if (!service) return { ok: false, error: 'service-not-initialized' };
      const safeHost = (host ?? '').trim();
      const safePort = Number.isFinite(port) ? Math.floor(port) : Pn8080MatrixService.DefaultPort;
      if (!safeHost) return { ok: false, error: 'host-required' };
      setSetting(KEY_HOST, safeHost);
      setSetting(KEY_PORT, safePort);
      await service.connect(safeHost, safePort);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: describeError(e) };
    }
  });

  ipcMain.handle('matrix:disconnect', async (): Promise<MatrixIpcResult> => {
    try {
      if (!service) return { ok: false, error: 'service-not-initialized' };
      await service.disconnect();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: describeError(e) };
    }
  });

  ipcMain.handle('matrix:route', async (_e, input: number, output: number): Promise<MatrixIpcResult> => {
    try {
      if (!service) return { ok: false, error: 'service-not-initialized' };
      await service.route(input, output);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: describeError(e) };
    }
  });

  ipcMain.handle('matrix:route-all', async (_e, input: number): Promise<MatrixIpcResult> => {
    try {
      if (!service) return { ok: false, error: 'service-not-initialized' };
      await service.routeAll(input);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: describeError(e) };
    }
  });

  ipcMain.handle('matrix:refresh', async (): Promise<MatrixIpcResult> => {
    try {
      if (!service) return { ok: false, error: 'service-not-initialized' };
      await service.refresh();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: describeError(e) };
    }
  });

  ipcMain.handle('matrix:get-state', (): MatrixFullState => {
    const snap = service ? service.getState() : {
      state: 'disconnected' as const,
      host: readString(KEY_HOST) ?? '',
      port: readNumber(KEY_PORT) ?? Pn8080MatrixService.DefaultPort,
      routes: {},
    };
    return toFullState(snap);
  });

  ipcMain.handle('matrix:set-alias', (_e, isInput: boolean, idx1: number, value: string): MatrixIpcResult => {
    try {
      const list = readAliases();
      const arr = isInput ? list.input : list.output;
      if (!Number.isInteger(idx1) || idx1 < 1 || idx1 > arr.length) {
        return { ok: false, error: 'index-out-of-range' };
      }
      const normalized = normalizeAlias(value, idx1);
      arr[idx1 - 1] = normalized;
      setSetting(KEY_ALIASES, list);
      // Push the new state so every renderer sees the alias change immediately.
      const snap = service?.getState() ?? {
        state: 'disconnected' as const,
        host: readString(KEY_HOST) ?? '',
        port: readNumber(KEY_PORT) ?? Pn8080MatrixService.DefaultPort,
        routes: {},
      };
      safeSend('matrix:state', { ...toFullState(snap), aliases: list });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: describeError(e) };
    }
  });

  ipcMain.handle('matrix:set-host', (_e, host: string, port: number): MatrixIpcResult => {
    try {
      const safeHost = (host ?? '').trim();
      const safePort = Number.isFinite(port) ? Math.floor(port) : Pn8080MatrixService.DefaultPort;
      setSetting(KEY_HOST, safeHost);
      setSetting(KEY_PORT, safePort);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: describeError(e) };
    }
  });

  ipcMain.handle('matrix:set-auto-connect', (_e, on: boolean): MatrixIpcResult => {
    try {
      setSetting(KEY_AUTO, !!on);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: describeError(e) };
    }
  });
}

// --------------- Helpers ---------------

function safeSend(channel: string, payload: unknown): void {
  const win = editorWinRef;
  if (!win || win.isDestroyed()) return;
  try { win.webContents.send(channel, payload); } catch { /* noop */ }
}

function safeLog(msg: string): void {
  try { getLogger().info('[matrix] ' + msg); } catch { /* noop */ }
}

function toFullState(snap: MatrixSnapshot): MatrixFullState {
  return {
    ...snap,
    aliases: readAliases(),
    autoConnect: readBool(KEY_AUTO),
  };
}

function readString(key: string): string {
  const v = getSetting<unknown>(key);
  return typeof v === 'string' ? v : '';
}

function readNumber(key: string): number | undefined {
  const v = getSetting<unknown>(key);
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function readBool(key: string): boolean {
  const v = getSetting<unknown>(key);
  return v === true || v === 'true';
}

function readAliases(): MatrixAliases {
  const v = getSetting<unknown>(KEY_ALIASES);
  if (
    v &&
    typeof v === 'object' &&
    Array.isArray((v as { input?: unknown }).input) &&
    Array.isArray((v as { output?: unknown }).output)
  ) {
    const obj = v as { input: unknown[]; output: unknown[] };
    return {
      input: padTo8(obj.input.map(String)),
      output: padTo8(obj.output.map(String)),
    };
  }
  return { input: [...DEFAULT_ALIASES.input], output: [...DEFAULT_ALIASES.output] };
}

function padTo8(arr: string[]): string[] {
  const out = arr.slice(0, 8);
  for (let i = out.length; i < 8; i++) out.push(String(i + 1));
  return out;
}

function normalizeAlias(value: unknown, fallbackIndex: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length === 0) return String(fallbackIndex);
  return text.length > MAX_ALIAS_LEN ? text.slice(0, MAX_ALIAS_LEN) : text;
}

function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  try { return String(e); } catch { return 'unknown'; }
}
