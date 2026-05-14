# Design: v1.5.0 PN-8080 메트릭스 제어 (Matrix Control)

| Field | Value |
|-------|-------|
| Feature key | `matrix-control` |
| Plan | `docs/01-plan/features/matrix-control.plan.md` |
| Architecture | **C. Pragmatic Balance** (concrete service + Zustand store + 2 컴포넌트) |
| Created | 2026-05-13 |
| Target version | v1.5.0 |
| Status | Design (Checkpoint 3 confirmed) |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 운영 중 매트릭스 라우팅을 별도 앱 없이 사이니지 앱에서 처리. |
| **WHO** | 운영자(호스트 PC) 전용 — 원격 LAN PC는 매트릭스 패널 비표시 (안전성). |
| **RISK** | Electron main TCP 안정성 / PN-8080 응답 파싱 / Renderer ↔ main IPC 동기화 / 패널 폭 fit. |
| **SUCCESS** | 입력→출력 클릭 즉시 라우팅 + 별칭 영속 + 자동 재연결 + 재시작 자동 복원. |
| **SCOPE** | 단일 PN-8080(8×8) + Auto-Take + Persistent+AutoReconnect 고정. |

---

## 1. Overview

### 1.1 핵심 아키텍처

```
┌──────────────────────────────────────────────────────────────────────┐
│                       Electron Main Process                          │
│                                                                      │
│  Pn8080MatrixService (concrete)                                      │
│    ├ net.Socket (TCP/8000 ASCII)                                     │
│    ├ Command queue (SemaphoreSlim-style)                             │
│    ├ Watchdog (2s tick, socket alive check)                          │
│    ├ AutoReconnect [500, 1000, 2000, 5000, 5000] ms × 5              │
│    ├ Response parser (regex: input N -> output M, errors E00-E02)    │
│    └ EventEmitter: 'state' | 'log' | 'connected'                     │
│                              │                                       │
│  matrixManager (singleton)                                           │
│    ├ Wraps single service instance                                   │
│    ├ Registers IPC handlers (invoke + send)                          │
│    ├ Hydrates settings on app whenReady (host/port/aliases/auto)    │
│    └ Forwards events to focused editor BrowserWindow                 │
│                              │                                       │
│  IPC channels                                                        │
│   invoke:                          send (main → renderer):           │
│    matrix:connect                   matrix:state  ({routes, connected,│
│    matrix:disconnect                              host, port, ...})  │
│    matrix:route                     matrix:log   (Tx/Rx/Info/Error)  │
│    matrix:route-all                                                  │
│    matrix:refresh                                                    │
│    matrix:get-state                                                  │
│    matrix:set-alias                                                  │
│    matrix:set-host                                                   │
│    matrix:set-auto-connect                                           │
│                              │                                       │
└──────────────────────────────┼───────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Editor Renderer (Electron only)                   │
│                                                                      │
│  useMatrixStore (Zustand)                                            │
│    - state mirror: { connected, reconnecting, host, port,            │
│                      autoConnect, routes, aliases, log[] }           │
│    - actions: connect/disconnect/route/setAlias/setHost/...          │
│    - applyStatePush(state) — IPC matrix:state listener               │
│    - applyLogPush(entry)   — IPC matrix:log listener                 │
│                                                                      │
│  useMatrix() hook — typed accessors                                  │
│                                                                      │
│  Components:                                                         │
│   MatrixControlPanel — RightPanel 하단, Electron 가드                │
│    ├ Header row: IP input, Port input, 연결/해제 버튼, 상태 인디케이터 │
│    └ 4×9 grid:                                                       │
│         row 0  입력 (alias cell, click → select)                     │
│         row 1  No.   (1..8 static)                                   │
│         row 2  연결 (current input alias mapped to output)           │
│         row 3  출력 (alias cell, click → route if input selected)    │
│   MatrixAliasCell — label + double-click → inline edit overlay        │
└──────────────────────────────────────────────────────────────────────┘
```

**핵심 원칙**:
1. **단일 진실 출처**: main process Pn8080MatrixService — routes/connection/aliases 모두 여기서 관리
2. **TS 코드 일관성**: 참고 C# 프로젝트의 검증된 패턴(`_sendGate`, watchdog, 백오프 배열)을 TS Promise + setInterval로 1:1 포팅
3. **호스트 전용**: MatrixControlPanel은 `window.electronAPI` 가드. 원격 LAN PC에는 IPC 없으니 마운트 안 됨
4. **상태 동기화**: main이 상태 변경 시 `matrix:state` IPC push → 모든 main BrowserWindow 중 editor 1개에만 전달
5. **에러 격리**: 모든 IPC handler + main TCP 함수는 try/catch로 main process 크래시 방지

### 1.2 Plan FR 매핑

| Plan FR | Design 모듈 |
|---------|------------|
| FR-1 RightPanel 하단 표시 | M8 |
| FR-2 Electron 가드 | M8 (`window.electronAPI` 체크) |
| FR-3 IP/Port input | M6 (Header row) |
| FR-4 연결/해제 버튼 | M6 (Header) |
| FR-5 상태 인디케이터 | M5 (state) + M6 (UI) |
| FR-6 4×9 그리드 | M6 (Grid) |
| FR-7 입력 셀 클릭 활성화 | M6 (selectedInput state) |
| FR-8 출력 셀 클릭 즉시 라우팅 (Auto-Take) | M6 + M5 → IPC matrix:route |
| FR-9 별칭 더블클릭 편집 | M7 MatrixAliasCell |
| FR-10 별칭 영속 | M2 matrixManager.setAlias → settings |
| FR-11 host/port 변경 시 처리 | M5 setHost → matrixManager → settings + 재연결 안내 |
| FR-12 자동 재연결 | M1 Pn8080MatrixService.tryReconnect |
| FR-13 응답 파싱 | M1 parseRoutes |
| FR-14 에러 코드 처리 | M1 + M6 (UI log) |
| FR-15 부팅 autoConnect | M2 matrixManager.init |
| FR-16 IPC try/catch | M2 모든 handler |

---

## 2. Modules

| Module | Files | Purpose |
|--------|-------|---------|
| **M1: Pn8080 TCP Service** | `electron/services/Pn8080MatrixService.ts` | TCP/8000 raw socket, command queue, watchdog, AutoReconnect, regex 응답 파싱 |
| **M2: Matrix Manager + IPC** | `electron/services/matrixManager.ts` | singleton + 9 IPC handlers + settings hydrate + event forwarding |
| **M3: Renderer API + Preload** | `lib/api/matrix.ts`, `electron/preload.ts` | typed IPC wrappers + 채널 화이트리스트 |
| **M4: Settings Schema** | `electron/db/seed.ts` | 4개 새 settings 키 default seed |
| **M5: Store + Hook** | `store/useMatrixStore.ts`, `hooks/useMatrix.ts` | Zustand store + typed accessors |
| **M6: MatrixControlPanel** | `components/MatrixControlPanel.{tsx,module.css}` | Header + 4×9 그리드 UI |
| **M7: MatrixAliasCell** | `components/MatrixAliasCell.{tsx,module.css}` | label + inline edit overlay |
| **M8: RightPanel Integration** | `components/RightPanel.tsx` | Electron 가드로 패널 마운트 |
| **M9: Lifecycle Wiring** | `electron/main.ts` | matrixManager.init + app.before-quit disconnect |

---

## 3. Module Details

### 3.1 M1 — Pn8080 TCP Service

#### 3.1.1 `electron/services/Pn8080MatrixService.ts` (new)

**파일 1개, 약 300 LOC** — 참고 C# `Pn8080MatrixService` + `MatrixServiceBase`의 TS 포팅.

```typescript
// Design Ref: matrix-control §3.1 — concrete PN-8080 TCP service.
// Faithful port of the C# Pn8080MatrixService: ASCII protocol on TCP/8000,
// command-end '!', Persistent + AutoReconnect, single-flight command queue.
//
// Public surface mirrors only what matrixManager needs; private methods cover
// the wire/state details the renderer never has to know about.

import { EventEmitter } from 'events';
import { createConnection, Socket } from 'net';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
export type LogDirection = 'tx' | 'rx' | 'info' | 'error';

export interface MatrixLogEntry {
  ts: number;
  dir: LogDirection;
  text: string;
}

export interface RouteMap {
  // output (1..8) → input (1..8)
  [output: number]: number;
}

interface PendingCommand {
  cmd: string;
  resolve: (response: string) => void;
  reject: (err: Error) => void;
}

const CONNECT_TIMEOUT_MS = 2000;
const OVERALL_TIMEOUT_MS = 2000;
const QUIET_PERIOD_MS = 100;
const WATCHDOG_TICK_MS = 2000;
const RECONNECT_BACKOFFS_MS = [500, 1000, 2000, 5000, 5000];

const ROUTE_LINE = /input\s+([0-8])\s*->\s*output\s+([1-8])/gi;
const ERROR_CODE = /\bE0[0-2]\b/i;

export class Pn8080MatrixService extends EventEmitter {
  static readonly Inputs = 8;
  static readonly Outputs = 8;
  static readonly DefaultPort = 8000;

  private socket: Socket | null = null;
  private state: ConnectionState = 'disconnected';
  private host = '';
  private port = Pn8080MatrixService.DefaultPort;
  private routes: RouteMap = {};
  private queue: PendingCommand[] = [];
  private inFlight = false;
  private rxBuffer = '';
  private watchdogTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private autoReconnect = true;
  private disposed = false;

  // EventEmitter: 'state' | 'log' | 'connected'
  // 'state' payload: { state, host, port, routes }
  // 'log' payload: MatrixLogEntry
  // 'connected' payload: boolean

  async connect(host: string, port: number): Promise<void> { /* ... */ }
  async disconnect(): Promise<void> { /* ... */ }
  async route(input: number, output: number): Promise<void> { /* s in N av out M! */ }
  async routeAll(input: number): Promise<void> { /* s in N av out 0! */ }
  async refresh(): Promise<void> { /* r av out 0! */ }
  getState(): { state, host, port, routes }
  dispose(): void

  // Private:
  private openSocket(): Promise<void>
  private closeSocket(reason: string): void
  private sendCommand(cmd: string): Promise<string>
  private writeAndRead(cmd: string): Promise<string>
  private parseRoutes(response: string): RouteMap
  private applyResponseOrFallback(response: string, input: number, output: number): void
  private startWatchdog(): void
  private stopWatchdog(): void
  private isSocketAlive(): boolean
  private tryReconnect(): Promise<void>
  private log(dir: LogDirection, text: string): void
  private setState(next: ConnectionState, reason?: string): void
  private emitState(): void
}
```

**핵심 구현 디테일** (C# 포팅):

| 부분 | TS 구현 |
|------|---------|
| Command queue + single-flight | `inFlight` flag + 내부 큐 — `sendCommand` 이 큐에 enqueue 후 처리 |
| Connect timeout (2s) | `Promise.race([connectPromise, sleep(2000)])` |
| Write-and-read with quiet period | 응답 첫 데이터 후 `QUIET_PERIOD_MS=100`ms 동안 추가 데이터 없으면 종료. 전체 `OVERALL_TIMEOUT_MS=2000` 상한. |
| Stream drain | 새 명령 보내기 전 socket의 미수신 데이터 버림 (참고 C# DrainStream) |
| Watchdog | `setInterval(2000)` — socket Poll 흉내: `socket.destroyed || !socket.writable` 체크. 끊김이면 setState('reconnecting'). |
| AutoReconnect | `RECONNECT_BACKOFFS_MS` 배열을 순회. 각 항목 후 openSocket 시도. 5회 실패 시 setState('disconnected'). |
| 응답 파싱 | `ROUTE_LINE` regex로 `output → input` 매핑 추출. 빈 응답 또는 매칭 0건이면 요청 라우팅을 cache 직접 반영 (fallback). |
| 에러 코드 | response에 E00/E01/E02 매칭 시 log('error') + 라우팅 cache 미반영. |

#### 3.1.2 Event payload 타입

```typescript
// emitted to listeners
service.emit('state', {
  state: 'connected',
  host: '192.168.10.199',
  port: 8000,
  routes: { 1: 1, 2: 2, ... }
});
service.emit('log', { ts: Date.now(), dir: 'tx', text: 's in 1 av out 1!' });
service.emit('connected', true);
```

### 3.2 M2 — matrixManager (Singleton + IPC)

#### 3.2.1 `electron/services/matrixManager.ts` (new)

**약 200 LOC** — singleton wrapper. 책임:
1. Pn8080MatrixService 인스턴스 1개 보유
2. 부팅 시 settings에서 host/port/autoConnect/aliases 로드
3. autoConnect=true이고 host 있으면 자동 connect 시도
4. IPC handlers 9개 등록
5. service의 'state'/'log' event를 editor BrowserWindow에 IPC send
6. app.quit 시 dispose

```typescript
// Design Ref: matrix-control §3.2 — singleton orchestrator + IPC bridge.
// Owns one Pn8080MatrixService for the lifetime of the app, persists state
// changes to SQLite, and forwards events to the editor BrowserWindow.

import { ipcMain, BrowserWindow } from 'electron';
import { Pn8080MatrixService } from './Pn8080MatrixService';
import { getSetting, setSetting } from '../server/services/settingsService';
import { getLogger } from '../logger';

const KEY_HOST = 'matrix.host';
const KEY_PORT = 'matrix.port';
const KEY_AUTO = 'matrix.autoConnect';
const KEY_ALIASES = 'matrix.aliases';

let service: Pn8080MatrixService | null = null;
let editorWinRef: BrowserWindow | null = null;

export function initMatrix(editorWin: BrowserWindow): void {
  editorWinRef = editorWin;
  service = new Pn8080MatrixService();

  // Wire events to editor
  service.on('state', (st) => safeSend('matrix:state', { ...st, aliases: getAliases() }));
  service.on('log', (entry) => safeSend('matrix:log', entry));

  registerIpc();

  // Optional auto-connect at boot
  const autoConnect = getSetting<boolean>(KEY_AUTO) ?? false;
  const host = getSetting<string>(KEY_HOST) ?? '';
  if (autoConnect && host) {
    const port = getSetting<number>(KEY_PORT) ?? Pn8080MatrixService.DefaultPort;
    service.connect(host, port).catch((err) =>
      getLogger().warn('[matrix] auto-connect failed:', err?.message ?? err)
    );
  }
}

export async function disposeMatrix(): Promise<void> {
  if (!service) return;
  try { await service.disconnect(); } catch {}
  service.dispose();
  service = null;
}

function safeSend(channel: string, payload: unknown) {
  const win = editorWinRef;
  if (win && !win.isDestroyed()) {
    try { win.webContents.send(channel, payload); } catch {}
  }
}

function registerIpc() {
  ipcMain.handle('matrix:connect', async (_e, host: string, port: number) => {
    try {
      await service!.connect(host, port);
      setSetting(KEY_HOST, host);
      setSetting(KEY_PORT, port);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'connect-failed' };
    }
  });

  ipcMain.handle('matrix:disconnect', async () => {
    try { await service!.disconnect(); return { ok: true }; }
    catch (e: any) { return { ok: false, error: e?.message ?? 'disconnect-failed' }; }
  });

  ipcMain.handle('matrix:route', async (_e, input: number, output: number) => {
    try { await service!.route(input, output); return { ok: true }; }
    catch (e: any) { return { ok: false, error: e?.message ?? 'route-failed' }; }
  });

  ipcMain.handle('matrix:route-all', async (_e, input: number) => {
    try { await service!.routeAll(input); return { ok: true }; }
    catch (e: any) { return { ok: false, error: e?.message ?? 'route-all-failed' }; }
  });

  ipcMain.handle('matrix:refresh', async () => {
    try { await service!.refresh(); return { ok: true }; }
    catch (e: any) { return { ok: false, error: e?.message ?? 'refresh-failed' }; }
  });

  ipcMain.handle('matrix:get-state', () => ({
    ...service!.getState(),
    aliases: getAliases(),
    autoConnect: getSetting<boolean>(KEY_AUTO) ?? false,
  }));

  ipcMain.handle('matrix:set-alias', (_e, isInput: boolean, idx1: number, value: string) => {
    const aliases = getAliases();
    const list = isInput ? aliases.input : aliases.output;
    if (idx1 < 1 || idx1 > list.length) return { ok: false, error: 'index-oob' };
    const normalized = (value ?? '').trim().slice(0, 10);
    list[idx1 - 1] = normalized;
    setSetting(KEY_ALIASES, aliases);
    safeSend('matrix:state', { ...service!.getState(), aliases });
    return { ok: true };
  });

  ipcMain.handle('matrix:set-host', (_e, host: string, port: number) => {
    setSetting(KEY_HOST, host);
    setSetting(KEY_PORT, port);
    return { ok: true };
  });

  ipcMain.handle('matrix:set-auto-connect', (_e, on: boolean) => {
    setSetting(KEY_AUTO, !!on);
    return { ok: true };
  });
}

function getAliases(): { input: string[]; output: string[] } {
  const stored = getSetting<{ input: string[]; output: string[] }>(KEY_ALIASES);
  if (stored && Array.isArray(stored.input) && Array.isArray(stored.output)) return stored;
  return {
    input: ['1', '2', '3', '4', '5', '6', '7', '8'],
    output: ['1', '2', '3', '4', '5', '6', '7', '8'],
  };
}
```

### 3.3 M3 — Renderer API + Preload

#### 3.3.1 `electron/preload.ts` (modify)

기존 화이트리스트에 `matrix:*` 채널 추가:
- invoke: `matrix:connect`, `matrix:disconnect`, `matrix:route`, `matrix:route-all`, `matrix:refresh`, `matrix:get-state`, `matrix:set-alias`, `matrix:set-host`, `matrix:set-auto-connect`
- on: `matrix:state`, `matrix:log`
- removeAllListeners: `matrix:state`, `matrix:log`

#### 3.3.2 `lib/api/matrix.ts` (new)

```typescript
// Design Ref: matrix-control §3.3 — typed IPC wrapper for the editor renderer.
// Returns either { ok:true } or { ok:false, error: string } so the store can
// surface failures without crashing.

import type { MatrixLogEntry } from '@/types/matrix';

interface OkResult { ok: true }
interface ErrResult { ok: false; error: string }
type Result<T = unknown> = (OkResult & T) | ErrResult;

const api = (typeof window !== 'undefined' ? window.electronAPI : null) as
  | { invoke: (ch: string, ...args: unknown[]) => Promise<unknown>;
      on: (ch: string, cb: (...args: unknown[]) => void) => void;
      removeAllListeners: (ch: string) => void; }
  | null;

export const matrixApi = {
  available: () => api !== null,
  connect: (host: string, port: number): Promise<Result> =>
    api!.invoke('matrix:connect', host, port) as Promise<Result>,
  disconnect: (): Promise<Result> => api!.invoke('matrix:disconnect') as Promise<Result>,
  route: (input: number, output: number): Promise<Result> =>
    api!.invoke('matrix:route', input, output) as Promise<Result>,
  routeAll: (input: number): Promise<Result> =>
    api!.invoke('matrix:route-all', input) as Promise<Result>,
  refresh: (): Promise<Result> => api!.invoke('matrix:refresh') as Promise<Result>,
  getState: () => api!.invoke('matrix:get-state') as Promise<MatrixFullState>,
  setAlias: (isInput: boolean, idx1: number, value: string): Promise<Result> =>
    api!.invoke('matrix:set-alias', isInput, idx1, value) as Promise<Result>,
  setHost: (host: string, port: number): Promise<Result> =>
    api!.invoke('matrix:set-host', host, port) as Promise<Result>,
  setAutoConnect: (on: boolean): Promise<Result> =>
    api!.invoke('matrix:set-auto-connect', on) as Promise<Result>,

  onState: (cb: (state: MatrixFullState) => void) => api?.on('matrix:state', cb as any),
  onLog: (cb: (entry: MatrixLogEntry) => void) => api?.on('matrix:log', cb as any),
  offAll: () => {
    api?.removeAllListeners('matrix:state');
    api?.removeAllListeners('matrix:log');
  },
};
```

#### 3.3.3 `types/matrix.ts` (new)

```typescript
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
export type LogDirection = 'tx' | 'rx' | 'info' | 'error';
export interface MatrixLogEntry { ts: number; dir: LogDirection; text: string; }
export interface MatrixAliases { input: string[]; output: string[]; }
export interface MatrixFullState {
  state: ConnectionState;
  host: string;
  port: number;
  routes: { [output: number]: number };
  aliases: MatrixAliases;
  autoConnect: boolean;
}
```

### 3.4 M4 — Settings Schema

#### 3.4.1 `electron/db/seed.ts` (modify)

```typescript
const DEFAULT_SETTINGS: Array<[string, unknown]> = [
  // ... existing ...
  // Design Ref: matrix-control §3.4 — PN-8080 control defaults
  ['matrix.host', '192.168.10.199'],
  ['matrix.port', 8000],
  ['matrix.autoConnect', false],
  ['matrix.aliases', {
    input: ['1', '2', '3', '4', '5', '6', '7', '8'],
    output: ['1', '2', '3', '4', '5', '6', '7', '8'],
  }],
];
```

> 운영 옵션 패널 registry에는 추가하지 않음 — host/port/aliases는 MatrixControlPanel 자체 UI에서 편집. autoConnect는 MatrixControlPanel 하단 체크박스로 노출.

### 3.5 M5 — Store + Hook

#### 3.5.1 `store/useMatrixStore.ts` (new)

Zustand store, server-mirror 패턴 (other stores와 일관):

```typescript
import { create } from 'zustand';
import { matrixApi } from '@/lib/api/matrix';
import type { MatrixFullState, MatrixLogEntry, ConnectionState, MatrixAliases } from '@/types/matrix';

const MAX_LOG = 200;
const DEFAULT_ALIASES: MatrixAliases = {
  input: ['1','2','3','4','5','6','7','8'],
  output: ['1','2','3','4','5','6','7','8'],
};

interface MatrixStoreState {
  state: ConnectionState;
  host: string;
  port: number;
  autoConnect: boolean;
  routes: { [output: number]: number };
  aliases: MatrixAliases;
  log: MatrixLogEntry[];
  selectedInput: number | null;
  error: string | null;

  hydrate: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  route: (output: number) => Promise<void>;       // uses selectedInput
  refresh: () => Promise<void>;
  setHost: (host: string, port: number) => Promise<void>;
  setAlias: (isInput: boolean, idx1: number, value: string) => Promise<void>;
  setAutoConnect: (on: boolean) => Promise<void>;
  setSelectedInput: (n: number | null) => void;
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
  aliases: { ...DEFAULT_ALIASES },
  log: [],
  selectedInput: null,
  error: null,

  hydrate: async () => {
    if (!matrixApi.available()) return;
    const s = await matrixApi.getState();
    set({ ...s });
  },

  connect: async () => {
    const { host, port } = get();
    set({ error: null });
    const r = await matrixApi.connect(host, port);
    if (!r.ok) set({ error: r.error });
  },

  disconnect: async () => {
    await matrixApi.disconnect();
    set({ selectedInput: null });
  },

  route: async (output) => {
    const input = get().selectedInput;
    if (!input) return;
    set({ error: null });
    const r = await matrixApi.route(input, output);
    if (!r.ok) set({ error: r.error });
    // selectedInput 유지 (참고 프로젝트: 라우팅 후에도 유지하여 추가 라우팅 빠르게)
  },

  refresh: async () => {
    const r = await matrixApi.refresh();
    if (!r.ok) set({ error: r.error });
  },

  setHost: async (host, port) => {
    set({ host, port });
    await matrixApi.setHost(host, port);
  },

  setAlias: async (isInput, idx1, value) => {
    const r = await matrixApi.setAlias(isInput, idx1, value);
    if (!r.ok) set({ error: r.error });
    // state push로 aliases 갱신됨 (matrixManager가 emit)
  },

  setAutoConnect: async (on) => {
    set({ autoConnect: on });
    await matrixApi.setAutoConnect(on);
  },

  setSelectedInput: (n) => set({ selectedInput: n }),

  applyStatePush: (s) => set({
    state: s.state, host: s.host, port: s.port, routes: s.routes,
    aliases: s.aliases ?? get().aliases,
    autoConnect: s.autoConnect ?? get().autoConnect,
  }),

  applyLogPush: (entry) => set((p) => ({
    log: [...p.log.slice(-(MAX_LOG - 1)), entry],
  })),

  clearError: () => set({ error: null }),
}));
```

#### 3.5.2 `hooks/useMatrix.ts` (new)

Thin convenience hook that wires up IPC subscriptions on mount:

```typescript
import { useEffect } from 'react';
import { matrixApi } from '@/lib/api/matrix';
import { useMatrixStore } from '@/store/useMatrixStore';

export function useMatrix() {
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
```

### 3.6 M6 — MatrixControlPanel

#### 3.6.1 `components/MatrixControlPanel.tsx` (new)

```typescript
'use client';
import { useState } from 'react';
import { useMatrixStore } from '@/store/useMatrixStore';
import MatrixAliasCell from './MatrixAliasCell';
import styles from './MatrixControlPanel.module.css';

export default function MatrixControlPanel() {
  const {
    state, host, port, autoConnect, routes, aliases,
    selectedInput, error, setSelectedInput,
    connect, disconnect, route, setHost, setAutoConnect, clearError,
  } = useMatrixStore();

  const [hostDraft, setHostDraft] = useState(host);
  const [portDraft, setPortDraft] = useState(port);

  // Sync drafts when store value changes (e.g. hydrate)
  useEffect(() => { setHostDraft(host); setPortDraft(port); }, [host, port]);

  const isConnected = state === 'connected';
  const isConnecting = state === 'connecting' || state === 'reconnecting';

  const onConnectClick = async () => {
    await setHost(hostDraft, portDraft);
    await connect();
  };

  const onInputClick = (i: number) => {
    setSelectedInput(selectedInput === i ? null : i);
  };

  const onOutputClick = (o: number) => {
    if (!selectedInput || !isConnected) return;
    route(o);
  };

  return (
    <section className={styles.panel} aria-label="메트릭스 제어">
      <h3 className={styles.heading}>메트릭스 제어</h3>

      <div className={styles.header}>
        <label>IP <input value={hostDraft} disabled={isConnected || isConnecting}
                          onChange={(e) => setHostDraft(e.target.value)} /></label>
        <label>포트 <input type="number" min={1} max={65535} value={portDraft}
                            disabled={isConnected || isConnecting}
                            onChange={(e) => setPortDraft(Number(e.target.value))} /></label>
        {isConnected || isConnecting ? (
          <button onClick={disconnect} disabled={isConnecting}>연결 해제</button>
        ) : (
          <button onClick={onConnectClick}>연결</button>
        )}
        <span className={`${styles.statusDot} ${styles[state]}`} />
        <span className={styles.statusLabel}>
          {state === 'connected' ? '연결됨' :
           state === 'connecting' ? '연결 중' :
           state === 'reconnecting' ? '재연결 중' : '끊김'}
        </span>
      </div>

      <div className={styles.grid}>
        <div className={styles.rowLabel}>입력</div>
        {[1,2,3,4,5,6,7,8].map((i) => (
          <MatrixAliasCell key={`in-${i}`} isInput index={i}
                          value={aliases.input[i - 1] ?? String(i)}
                          selected={selectedInput === i}
                          disabled={!isConnected}
                          onClick={() => onInputClick(i)} />
        ))}

        <div className={styles.rowLabel}>No.</div>
        {[1,2,3,4,5,6,7,8].map((i) => (
          <div key={`no-${i}`} className={styles.numberCell}>{i}</div>
        ))}

        <div className={styles.rowLabel}>연결</div>
        {[1,2,3,4,5,6,7,8].map((o) => {
          const inp = routes[o];
          const text = inp ? (aliases.input[inp - 1] ?? String(inp)) : '';
          return <div key={`conn-${o}`} className={styles.connectCell}>{text}</div>;
        })}

        <div className={styles.rowLabel}>출력</div>
        {[1,2,3,4,5,6,7,8].map((o) => (
          <MatrixAliasCell key={`out-${o}`} isInput={false} index={o}
                          value={aliases.output[o - 1] ?? String(o)}
                          pending={routes[o] === selectedInput}
                          disabled={!isConnected}
                          onClick={() => onOutputClick(o)} />
        ))}
      </div>

      <label className={styles.autoConnect}>
        <input type="checkbox" checked={autoConnect}
               onChange={(e) => setAutoConnect(e.target.checked)} />
        앱 시작 시 자동 연결
      </label>

      {error && (
        <div className={styles.errorBanner}>
          ⚠ {error}
          <button onClick={clearError}>×</button>
        </div>
      )}
    </section>
  );
}
```

#### 3.6.2 `components/MatrixControlPanel.module.css` (new)

핵심 CSS (640px RightPanel fit):
- `.grid`: CSS Grid `grid-template-columns: 60px repeat(8, 1fr)` — 라벨 60 + 셀 8개. 셀 폭 (640-60-padding) / 8 ≈ 65px
- 셀 높이 30px
- 상태 컬러: connected 녹색, connecting 황색, reconnecting 황색 깜박, disconnected 회색
- selected (입력) 파란 배경, output 라우팅됨 녹색, pending(이번 클릭) 주황

### 3.7 M7 — MatrixAliasCell

#### 3.7.1 `components/MatrixAliasCell.tsx` (new)

inline-edit overlay 패턴 (참고 C# `AliasMatrixControl` overlay):

```typescript
'use client';
import { useState, useRef, useEffect } from 'react';
import { useMatrixStore } from '@/store/useMatrixStore';
import styles from './MatrixAliasCell.module.css';

interface Props {
  isInput: boolean;
  index: number;        // 1..8
  value: string;
  selected?: boolean;   // input cell only
  pending?: boolean;    // output cell only
  disabled?: boolean;
  onClick?: () => void;
}

export default function MatrixAliasCell(props: Props) {
  const { isInput, index, value, selected, pending, disabled, onClick } = props;
  const setAlias = useMatrixStore((s) => s.setAlias);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) ref.current?.select(); }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== value) setAlias(isInput, index, draft);
  };
  const cancel = () => { setDraft(value); setEditing(false); };

  let cls = styles.cell;
  if (selected) cls += ' ' + styles.selected;
  if (pending) cls += ' ' + styles.pending;
  if (disabled) cls += ' ' + styles.disabled;

  if (editing) {
    return (
      <input
        ref={ref}
        className={styles.editInput}
        maxLength={10}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        }}
      />
    );
  }
  return (
    <div className={cls}
         onClick={disabled ? undefined : onClick}
         onDoubleClick={() => setEditing(true)}>
      {value || String(index)}
    </div>
  );
}
```

### 3.8 M8 — RightPanel Integration

#### 3.8.1 `components/RightPanel.tsx` (modify)

```tsx
import { useEffect, useState } from 'react';
import Preview from './Preview';
import PlaybackControls from './PlaybackControls';
import OperationOptionsPanel from './OperationOptionsPanel';
import MatrixControlPanel from './MatrixControlPanel';
import { useMatrix } from '@/hooks/useMatrix';
import styles from './RightPanel.module.css';

export default function RightPanel() {
  // Subscribes to matrix IPC events; no-op outside Electron.
  useMatrix();
  const [isElectron, setIsElectron] = useState(false);
  useEffect(() => {
    setIsElectron(typeof window !== 'undefined' && !!window.electronAPI);
  }, []);

  return (
    <aside className={styles.right} aria-label="사이니지 운영">
      <Preview />
      <PlaybackControls />
      <OperationOptionsPanel />
      {isElectron && <MatrixControlPanel />}
    </aside>
  );
}
```

### 3.9 M9 — Lifecycle

#### 3.9.1 `electron/main.ts` (modify)

```typescript
// After editor BrowserWindow created:
import { initMatrix, disposeMatrix } from './services/matrixManager';
// ...
initMatrix(editorWin);

// Before app quit:
app.on('before-quit', async () => {
  isQuitting = true;
  try { await disposeMatrix(); } catch {}
  // ... rest
});
```

---

## 4. Data Flow Sequences

### 4.1 Boot

```
1. Electron whenReady → bootstrap DB → init Express → create editor + signage windows
2. editorWin created → initMatrix(editorWin)
   ├ new Pn8080MatrixService()
   ├ Wire 'state' and 'log' events → safeSend to editorWin
   ├ registerIpc() — 9 IPC handlers
   └ if matrix.autoConnect && matrix.host: service.connect(...).catch(log)
3. editor renderer mounts RightPanel
4. useMatrix() → matrixApi.getState() → useMatrixStore.hydrate
5. matrixApi.onState / onLog 구독
6. MatrixControlPanel 렌더 — host/port/aliases 즉시 표시
```

### 4.2 사용자 "연결" 클릭

```
User edits IP/port → hostDraft, portDraft
Click "연결":
  → setHost(hostDraft, portDraft) → IPC matrix:set-host → settings 저장
  → connect() → IPC matrix:connect(host, port)
     → service.connect()
        → setState('connecting') → emit 'state'
        → openSocket() with 2s timeout
        → success: setState('connected') → emit 'state'
        → service.refresh() — initial route sync
           → sendCommand('r av out 0!') → response → parseRoutes → emit 'state'
     → IPC return { ok: true }
Editor renderer:
  → onState 콜백 ×N → store.applyStatePush → MatrixControlPanel re-render
  → 상태 인디케이터 '연결됨' + routes 그리드에 표시
```

### 4.3 사용자 입력 → 출력 클릭 (Auto-Take)

```
User clicks 입력 셀 N:
  → setSelectedInput(N) (or toggle off)
  → 입력 셀 selected 스타일 적용
User clicks 출력 셀 M (with selectedInput=N):
  → matrixApi.route(N, M)
  → IPC matrix:route handler → service.route(N, M)
     → sendCommand('s in N av out M!')
     → response parse → applyResponseOrFallback → routes[M] = N
     → emit 'state'
  → store applyStatePush → 연결상태 셀 갱신
  → selectedInput 유지 (참고 프로젝트와 동일 — 추가 라우팅 빠르게)
```

### 4.4 자동 재연결 (소켓 끊김)

```
Watchdog tick (2s):
  → service detects socket closed/destroyed
  → setState('reconnecting') → emit 'state'
  → tryReconnect():
     for delay in [500, 1000, 2000, 5000, 5000]:
        wait(delay)
        if user requested disconnect: abort
        attempt openSocket()
        success → setState('connected') + refresh() → emit 'state' → return
     all attempts failed → setState('disconnected') → emit 'state'
```

### 4.5 별칭 더블클릭 편집

```
User double-clicks alias cell (input or output):
  → editing=true → render <input maxLength=10>
  → User types → Enter
  → commit():
     setAlias(isInput, index, draft)
     → IPC matrix:set-alias → settings 저장
     → matrixManager.safeSend('matrix:state', {...routes, aliases})
  → store.applyStatePush → 셀 텍스트 갱신 + 연결상태 셀의 aliased input name도 갱신
```

---

## 5. Acceptance / Test Plan

| Plan SC | Test |
|---------|------|
| SC-1 패널 표시 (호스트) | RightPanel 하단에 "메트릭스 제어" 영역 표시 |
| SC-2 연결 | IP+port 입력 → 연결 클릭 → 1초 안에 "연결됨" (실기기 또는 에뮬레이터) |
| SC-3 라우팅 | 입력 셀 클릭 → 출력 셀 클릭 → 연결상태 셀 즉시 갱신 |
| SC-4 별칭 편집 | 셀 더블클릭 → 입력 → Enter → 텍스트 갱신 + DB 영속 |
| SC-5 재연결 | 매트릭스 전원 OFF/ON → 자동 재연결 동작 |
| SC-6 에러 처리 | 잘못된 입력(E01) → UI error banner |
| SC-7 영속 | 재시작 후 host/port/aliases 복원, autoConnect 시 자동 연결 |
| SC-8 원격 비표시 | 원격 LAN PC 브라우저 → 메트릭스 영역 미표시 |
| SC-9 v1.4 무회귀 | 사이니지 모드/슬라이드 CRUD/IME 정상 |

---

## 6. Risks & Mitigations

| ID | Risk | Mitigation |
|----|------|------------|
| R-1 | TCP 통신 코드가 main process 크래시 → 사이니지 앱 전체 종료 | 모든 IPC handler + service 함수 try/catch. uncaughtException은 이미 electron/logger.ts에서 잡아 fatal dialog. |
| R-2 | 응답 파싱 실패 (펌웨어 차이) | parseRoutes 빈 결과 시 applyResponseOrFallback이 요청한 라우팅 캐시 반영 (참고 C#) |
| R-3 | 자동 재연결 무한 폭주 | RECONNECT_BACKOFFS_MS 5회 후 setState('disconnected'). 사용자가 명시적으로 connect 다시 호출해야 재시도. |
| R-4 | host/port 변경 시 기존 연결 처리 | host/port input은 연결 중에는 disabled. 변경하려면 "연결 해제" 먼저 — UX 명확. |
| R-5 | Renderer ↔ main 상태 desync | service는 단일 진실. 모든 상태 변경 시 emit 'state' → editorWin webContents.send. 초기 hydrate는 getState(). |
| R-6 | 그리드가 RightPanel 폭 초과 | 셀 폭 (640-60-padding) / 8 ≈ 65px. 폰트 12-13px. 별칭 ellipsis. |
| R-7 | autoConnect로 매트릭스 없는 환경 부팅 시 timeout 대기 | autoConnect default false. 사용자가 명시 활성화. 연결 실패는 background catch — 부팅 차단 안 함. |
| R-8 | 별칭 충돌 (같은 별칭 여러 번) | 사용 안 막음 — 운영자 책임. UI에는 그대로 표시. |
| R-9 | 매트릭스 비밀번호 인증 | PN-8080은 단순 TCP/8000 (참고 C# 코드에 인증 로직 없음). 펌웨어가 인증 요구하면 별도 Plan. |
| R-10 | dev/prod 환경 차이 | net 모듈은 Node.js 기본 — Electron dev/prod 모두 동일 동작. better-sqlite3처럼 native rebuild 불필요. |

---

## 7. Performance Notes

- 명령 응답 < 500ms (LAN). Single-flight 큐로 한 번에 한 명령.
- 응답 한 번에 8 line (`r av out 0!`) → 정규식 한 번 매칭 후 routes map 일괄 갱신.
- IPC `matrix:state` push는 변경 시점에만 (`emit('state')` 트리거된 commit 시). 빈번 변경 시 (refresh) 한 번에 합쳐서 emit.
- log 배열은 최대 200 항목 유지. UI에 노출 안 함 (디버그용).

---

## 8. Security

- PN-8080 인증 없음 — 네트워크 격리 가정 (LAN-only).
- TCP raw 통신 → 외부 노출 안 됨 (사이니지 앱은 호스트 PC에서만).
- IPC 채널은 preload 화이트리스트로 제한.
- main process가 sole authority — 원격 PC는 매트릭스 패널 자체 미렌더.

---

## 9. Migration Notes

- 신규 settings 키 4개. 마이그레이션 ALTER 불필요 (settings 테이블은 KV).
- seed가 idempotent (기존 키 있으면 skip).
- BREAKING CHANGE 없음.

---

## 10. Open Questions

(Plan에서 모두 해소)

---

## 11. Implementation Guide

### 11.1 Implementation Order

| Step | Action | Files |
|------|--------|-------|
| 1 | `types/matrix.ts` (공통 타입) | (new) |
| 2 | `electron/services/Pn8080MatrixService.ts` (TCP service) | (new) |
| 3 | `electron/services/matrixManager.ts` (singleton + IPC) | (new) |
| 4 | `electron/preload.ts` (matrix:* 화이트리스트) | preload.ts |
| 5 | `electron/db/seed.ts` (4 default settings) | seed.ts |
| 6 | `electron/main.ts` (initMatrix + before-quit dispose) | main.ts |
| 7 | `lib/api/matrix.ts` (typed wrapper) | (new) |
| 8 | `store/useMatrixStore.ts` (Zustand) | (new) |
| 9 | `hooks/useMatrix.ts` (IPC bridge mount) | (new) |
| 10 | `components/MatrixAliasCell.{tsx,module.css}` | (new) |
| 11 | `components/MatrixControlPanel.{tsx,module.css}` | (new) |
| 12 | `components/RightPanel.tsx` (Electron 가드 마운트) | RightPanel.tsx |
| 13 | tsc + dev 시각 검증 | — |
| 14 | 실기기 또는 에뮬레이터로 연결/라우팅 검증 | — |

### 11.2 Dependency Install

신규 npm 패키지 0. `net` 모듈은 Node.js 기본 (electron-rebuild 영향 없음).

### 11.3 Session Guide

#### Module Map

| Scope | Module | LOC est. |
|-------|--------|----------|
| `module-1` | M1 Pn8080 TCP Service | ~300 |
| `module-2` | M2 Matrix Manager + IPC | ~200 |
| `module-3` | M3 Renderer API + Preload + types | ~70 |
| `module-4` | M4 Settings seed | ~10 |
| `module-5` | M5 Store + Hook | ~120 |
| `module-6` | M6 MatrixControlPanel | ~150 |
| `module-7` | M7 MatrixAliasCell | ~70 |
| `module-8` | M8 RightPanel integration | ~10 |
| `module-9` | M9 Lifecycle wiring | ~10 |

#### Recommended Session Plan

| Session | Scope | Rationale |
|---------|-------|-----------|
| **Session 1** | `module-1,module-2,module-9` | Main process TCP service + manager + lifecycle. 헤드리스 테스트 가능 (IPC stub) |
| **Session 2** | `module-3,module-4,module-5` | IPC bridge + types + store. 렌더러 통신 인프라 완성 |
| **Session 3** | `module-6,module-7,module-8` | UI 전체 + RightPanel 통합. E2E dev 시각 검증 |

#### Run Commands

```bash
/pdca do matrix-control                                                # 전체 (~940 LOC)
/pdca do matrix-control --scope module-1,module-2,module-9             # main TCP + manager + lifecycle
/pdca do matrix-control --scope module-3,module-4,module-5             # IPC + types + store
/pdca do matrix-control --scope module-6,module-7,module-8             # UI + 통합
```

---

## 12. Next Phase

`/pdca do matrix-control` — Checkpoint 4 (Implementation Approval) 후 구현 시작.
