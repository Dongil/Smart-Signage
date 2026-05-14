// Design Ref: matrix-control §3.2 — singleton orchestrator + IPC bridge.
// Owns one Pn8080MatrixService for the lifetime of the editor BrowserWindow,
// persists host/port/aliases/autoConnect via the existing settingsService, and
// forwards every state/log change to the editor renderer over IPC.

import { ipcMain, BrowserWindow } from 'electron';
import { randomUUID } from 'crypto';
import { Pn8080MatrixService } from './Pn8080MatrixService';
import {
  getSetting,
  setSetting,
} from '../server/services/settingsService';
import { getLogger } from '../logger';
import type {
  MatrixAliases,
  MatrixApplyPresetResult,
  MatrixFullState,
  MatrixIpcResult,
  MatrixLogEntry,
  MatrixPreset,
  MatrixPresetRoute,
  MatrixSnapshot,
} from '../../types/matrix';

const KEY_HOST = 'matrix.host';
const KEY_PORT = 'matrix.port';
const KEY_AUTO = 'matrix.autoConnect';
const KEY_ALIASES = 'matrix.aliases';
const KEY_PRESETS = 'matrix.presets';
const MAX_ALIAS_LEN = 10;
const MAX_PRESET_NAME = 20;
const MAX_PRESETS = 20;

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

  // ui-polish §5.1 — Preset CRUD + apply.
  ipcMain.handle('matrix:add-preset', (_e, name: string, outputs: number[]): MatrixIpcResult => {
    try {
      if (!service) return { ok: false, error: 'service-not-initialized' };
      const cleanName = typeof name === 'string' ? name.trim().slice(0, MAX_PRESET_NAME) : '';
      if (!cleanName) return { ok: false, error: 'name-required' };
      if (!Array.isArray(outputs) || outputs.length === 0) {
        return { ok: false, error: 'outputs-required' };
      }
      if (service.getState().state !== 'connected') {
        // Plan FR-9 interpretation: presets only meaningful when connected,
        // since "current routing" snapshot requires live state.
        return { ok: false, error: 'not-connected' };
      }
      const presets = readPresets();
      if (presets.length >= MAX_PRESETS) return { ok: false, error: 'limit-reached' };

      const routes = service.getState().routes;
      const snapshot: MatrixPresetRoute[] = outputs
        .filter((o) => Number.isInteger(o) && o >= 1 && o <= 8)
        .map((o) => ({ output: o, input: routes[o] ?? 0 }))
        .filter((r) => r.input >= 1 && r.input <= 8);

      if (snapshot.length === 0) return { ok: false, error: 'no-active-routes' };

      const preset: MatrixPreset = {
        id: randomUUID(),
        name: cleanName,
        routes: snapshot,
        createdAt: Date.now(),
      };
      presets.push(preset);
      setSetting(KEY_PRESETS, presets);
      safeLog(`preset added: "${cleanName}" (${snapshot.length} routes)`);
      broadcastState();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: describeError(e) };
    }
  });

  ipcMain.handle('matrix:delete-preset', (_e, id: string): MatrixIpcResult => {
    try {
      if (typeof id !== 'string' || !id) return { ok: false, error: 'id-required' };
      const before = readPresets();
      const after = before.filter((p) => p.id !== id);
      if (after.length === before.length) {
        // Not found is not an error — UI may race; still re-broadcast for safety.
        broadcastState();
        return { ok: true };
      }
      setSetting(KEY_PRESETS, after);
      safeLog(`preset deleted: ${id}`);
      broadcastState();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: describeError(e) };
    }
  });

  ipcMain.handle('matrix:apply-preset', async (_e, id: string): Promise<MatrixApplyPresetResult> => {
    if (!service) {
      return { ok: false, appliedCount: 0, failedRoutes: [], error: 'service-not-initialized' };
    }
    if (typeof id !== 'string' || !id) {
      return { ok: false, appliedCount: 0, failedRoutes: [], error: 'id-required' };
    }
    const preset = readPresets().find((p) => p.id === id);
    if (!preset) {
      return { ok: false, appliedCount: 0, failedRoutes: [], error: 'preset-not-found' };
    }
    if (service.getState().state !== 'connected') {
      return { ok: false, appliedCount: 0, failedRoutes: [], error: 'not-connected' };
    }

    // Plan NFR-3 — best-effort: failure on one route does not stop the rest.
    // Each route() call enters Pn8080MatrixService's single-flight queue, so
    // concurrent user clicks naturally serialize behind the preset's routes.
    safeLog(`preset apply start: "${preset.name}" (${preset.routes.length} routes)`);
    let applied = 0;
    const failed: MatrixApplyPresetResult['failedRoutes'] = [];
    for (const r of preset.routes) {
      try {
        await service.route(r.input, r.output);
        applied++;
      } catch (e) {
        failed.push({ route: r, error: describeError(e) });
      }
    }
    safeLog(`preset apply done: "${preset.name}" applied=${applied} failed=${failed.length}`);
    return { ok: true, appliedCount: applied, failedRoutes: failed };
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
    presets: readPresets(),
  };
}

function broadcastState(): void {
  const snap = service ? service.getState() : {
    state: 'disconnected' as const,
    host: readString(KEY_HOST) ?? '',
    port: readNumber(KEY_PORT) ?? Pn8080MatrixService.DefaultPort,
    routes: {},
  };
  safeSend('matrix:state', toFullState(snap));
}

function readPresets(): MatrixPreset[] {
  const v = getSetting<unknown>(KEY_PRESETS);
  if (!Array.isArray(v)) return [];
  const out: MatrixPreset[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    if (typeof obj.id !== 'string' || !obj.id) continue;
    if (typeof obj.name !== 'string' || !obj.name) continue;
    if (!Array.isArray(obj.routes)) continue;
    const routes: MatrixPresetRoute[] = [];
    for (const r of obj.routes) {
      if (!r || typeof r !== 'object') continue;
      const ro = r as Record<string, unknown>;
      const input = typeof ro.input === 'number' ? ro.input : Number(ro.input);
      const output = typeof ro.output === 'number' ? ro.output : Number(ro.output);
      if (!Number.isInteger(input) || input < 1 || input > 8) continue;
      if (!Number.isInteger(output) || output < 1 || output > 8) continue;
      routes.push({ input, output });
    }
    if (routes.length === 0) continue;
    const createdAt = typeof obj.createdAt === 'number' ? obj.createdAt : Date.now();
    out.push({ id: obj.id, name: obj.name, routes, createdAt });
  }
  return out;
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
