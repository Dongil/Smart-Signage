// Design Ref: matrix-control §3.3.3 — shared types between main and renderer.

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

export type LogDirection = 'tx' | 'rx' | 'info' | 'error';

export interface MatrixLogEntry {
  ts: number;
  dir: LogDirection;
  text: string;
}

export interface MatrixAliases {
  input: string[];
  output: string[];
}

/** Routing map: output (1..8) → input (1..8). 0 / missing key = unknown/unrouted. */
export interface RouteMap {
  [output: number]: number;
}

export interface MatrixSnapshot {
  state: ConnectionState;
  host: string;
  port: number;
  routes: RouteMap;
}

export interface MatrixFullState extends MatrixSnapshot {
  aliases: MatrixAliases;
  autoConnect: boolean;
  /** ui-polish §4.1 — persisted preset list, snapshot of routing combos. */
  presets: MatrixPreset[];
}

export interface MatrixIpcOk {
  ok: true;
}

export interface MatrixIpcErr {
  ok: false;
  error: string;
}

export type MatrixIpcResult = MatrixIpcOk | MatrixIpcErr;

// ui-polish §4.1 — Preset model. routes is a snapshot of current input→output
// mapping at save-time, replayed sequentially on apply.
export interface MatrixPresetRoute {
  input: number;   // 1..8
  output: number;  // 1..8
}

export interface MatrixPreset {
  id: string;
  name: string;
  routes: MatrixPresetRoute[];
  createdAt: number;
}

export interface MatrixApplyPresetResult {
  ok: boolean;
  appliedCount: number;
  failedRoutes: Array<{ route: MatrixPresetRoute; error: string }>;
  error?: string;
}
