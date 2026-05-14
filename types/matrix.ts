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
}

export interface MatrixIpcOk {
  ok: true;
}

export interface MatrixIpcErr {
  ok: false;
  error: string;
}

export type MatrixIpcResult = MatrixIpcOk | MatrixIpcErr;
