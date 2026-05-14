// Design Ref: matrix-control §3.1 — concrete PN-8080 TCP service.
// Faithful TS port of the C# reference (Xeno.Framework.Matrix.Services.Pn8080MatrixService):
// ASCII protocol on TCP/8000, commands terminated by '!', Persistent connection with
// single-flight command queue, AutoReconnect with fixed backoff schedule, and a watchdog
// that detects dead sockets. The renderer never talks to this directly — matrixManager
// owns the singleton and exposes it through IPC.

import { EventEmitter } from 'events';
import { connect as netConnect, Socket } from 'net';
import type {
  ConnectionState,
  LogDirection,
  MatrixLogEntry,
  MatrixSnapshot,
  RouteMap,
} from '../../types/matrix';

const CONNECT_TIMEOUT_MS = 2000;
const OVERALL_TIMEOUT_MS = 2000;
const QUIET_PERIOD_MS = 100;
const WATCHDOG_TICK_MS = 2000;
const RECONNECT_BACKOFFS_MS = [500, 1000, 2000, 5000, 5000];

const ROUTE_LINE = /input\s+([0-8])\s*->\s*output\s+([1-8])/gi;
const ERROR_CODE = /\bE0[0-2]\b/i;

interface PendingCommand {
  cmd: string;
  resolve: (response: string) => void;
  reject: (err: Error) => void;
}

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
  private rxResolve: ((response: string) => void) | null = null;
  private rxFirstAt = 0;
  private rxLastAt = 0;
  private rxQuietTimer: NodeJS.Timeout | null = null;
  private rxOverallTimer: NodeJS.Timeout | null = null;

  private watchdogTimer: NodeJS.Timeout | null = null;
  private reconnectAbort = false;
  private isReconnectLoop = false;
  private userRequestedDisconnect = false;
  private disposed = false;

  // --------------- Public API ---------------

  /** Snapshot for IPC handlers / store hydrate. */
  getState(): MatrixSnapshot {
    return {
      state: this.state,
      host: this.host,
      port: this.port,
      routes: { ...this.routes },
    };
  }

  async connect(host: string, port: number): Promise<void> {
    if (this.disposed) throw new Error('service-disposed');
    this.userRequestedDisconnect = false;
    this.host = host;
    this.port = port;
    if (this.state === 'connecting' || this.state === 'connected') {
      // Reconnect cleanly with the new host/port.
      await this.closeSocket('reconnect');
    }
    this.setState('connecting');
    try {
      await this.openSocket();
      this.setState('connected');
      this.startWatchdog();
      // Initial route sync — best-effort, do not fail connect if it errors.
      try {
        await this.refresh();
      } catch (e) {
        this.log('error', 'initial refresh failed: ' + describeError(e));
      }
    } catch (e) {
      this.setState('disconnected', describeError(e));
      throw e;
    }
  }

  async disconnect(): Promise<void> {
    this.userRequestedDisconnect = true;
    this.reconnectAbort = true;
    this.stopWatchdog();
    await this.closeSocket('user');
    this.setState('disconnected');
  }

  async route(input: number, output: number): Promise<void> {
    this.validateInput(input);
    this.validateOutput(output);
    const cmd = `s in ${input} av out ${output}!`;
    const response = await this.sendCommand(cmd);
    this.applyResponseOrFallback(response, input, output);
  }

  async routeAll(input: number): Promise<void> {
    this.validateInput(input);
    const cmd = `s in ${input} av out 0!`;
    const response = await this.sendCommand(cmd);
    this.applyResponseOrFallback(response, input, 0);
  }

  async refresh(): Promise<void> {
    const response = await this.sendCommand('r av out 0!');
    const parsed = this.parseRoutes(response);
    if (Object.keys(parsed).length > 0) {
      this.routes = { ...this.routes, ...parsed };
      this.emitState();
    } else {
      this.log('info', 'refresh: response had no route lines');
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.reconnectAbort = true;
    this.stopWatchdog();
    void this.closeSocket('dispose');
    this.queue.splice(0).forEach((p) =>
      p.reject(new Error('service-disposed'))
    );
  }

  // --------------- Internals ---------------

  private openSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const sock = netConnect({ host: this.host, port: this.port });
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { sock.destroy(); } catch { /* noop */ }
        reject(new Error(`connect timeout to ${this.host}:${this.port}`));
      }, CONNECT_TIMEOUT_MS);

      sock.once('connect', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.attachSocket(sock);
        this.log('info', `socket connected to ${this.host}:${this.port}`);
        resolve();
      });

      sock.once('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { sock.destroy(); } catch { /* noop */ }
        reject(err);
      });
    });
  }

  private attachSocket(sock: Socket): void {
    sock.setKeepAlive(true, 5000);
    sock.setNoDelay(true);
    sock.on('data', (buf) => this.onSocketData(buf));
    sock.on('close', () => this.onSocketClosed('close'));
    sock.on('error', (err) => this.log('error', 'socket error: ' + describeError(err)));
    this.socket = sock;
  }

  private async closeSocket(reason: string): Promise<void> {
    const sock = this.socket;
    this.socket = null;
    this.failPending(new Error('socket-closed: ' + reason));
    if (sock) {
      try { sock.removeAllListeners(); } catch { /* noop */ }
      try { sock.destroy(); } catch { /* noop */ }
    }
  }

  private onSocketClosed(reason: string): void {
    if (this.userRequestedDisconnect) return;
    if (this.state === 'disconnected') return;
    this.log('info', 'socket closed: ' + reason);
    this.failPending(new Error('socket-closed-mid-flight'));
    this.socket = null;
    if (!this.disposed) {
      void this.tryReconnect();
    }
  }

  private onSocketData(buf: Buffer): void {
    const text = buf.toString('ascii');
    if (!this.rxResolve) return; // unsolicited data — ignore
    if (!this.rxFirstAt) this.rxFirstAt = Date.now();
    this.rxLastAt = Date.now();
    this.rxBuffer += text;

    // Restart quiet timer.
    if (this.rxQuietTimer) clearTimeout(this.rxQuietTimer);
    this.rxQuietTimer = setTimeout(() => this.finalizeRx(), QUIET_PERIOD_MS);
  }

  private finalizeRx(): void {
    if (!this.rxResolve) return;
    const resolve = this.rxResolve;
    const payload = this.rxBuffer.replace(/\r\n/g, '\n').trim();
    this.rxResolve = null;
    this.rxBuffer = '';
    this.rxFirstAt = 0;
    this.rxLastAt = 0;
    if (this.rxQuietTimer) { clearTimeout(this.rxQuietTimer); this.rxQuietTimer = null; }
    if (this.rxOverallTimer) { clearTimeout(this.rxOverallTimer); this.rxOverallTimer = null; }
    if (payload.length > 0) this.log('rx', payload);
    resolve(payload);
  }

  private sendCommand(cmd: string): Promise<string> {
    if (this.disposed) return Promise.reject(new Error('service-disposed'));
    if (!this.socket || this.state !== 'connected') {
      return Promise.reject(new Error('not-connected'));
    }
    return new Promise((resolve, reject) => {
      this.queue.push({ cmd, resolve, reject });
      this.pumpQueue();
    });
  }

  private pumpQueue(): void {
    if (this.inFlight) return;
    const next = this.queue.shift();
    if (!next) return;
    this.inFlight = true;
    this.startCommand(next);
  }

  private startCommand(p: PendingCommand): void {
    const sock = this.socket;
    if (!sock || this.state !== 'connected') {
      this.inFlight = false;
      p.reject(new Error('not-connected'));
      this.pumpQueue();
      return;
    }
    this.rxBuffer = '';
    this.rxFirstAt = 0;
    this.rxLastAt = 0;
    this.rxResolve = (response) => {
      this.inFlight = false;
      p.resolve(response);
      this.pumpQueue();
    };

    // Overall timeout safety net.
    this.rxOverallTimer = setTimeout(() => {
      if (!this.rxResolve) return;
      // If we have any data, deliver it; otherwise resolve with empty.
      this.finalizeRx();
    }, OVERALL_TIMEOUT_MS);

    try {
      this.log('tx', p.cmd);
      sock.write(Buffer.from(p.cmd, 'ascii'));
    } catch (e) {
      const fail = this.rxResolve;
      this.rxResolve = null;
      if (this.rxOverallTimer) { clearTimeout(this.rxOverallTimer); this.rxOverallTimer = null; }
      this.inFlight = false;
      this.log('error', 'write failed: ' + describeError(e));
      // Re-route through reject path
      p.reject(e instanceof Error ? e : new Error(String(e)));
      // Caller's pumpQueue continues via the .reject path
      void fail; // discard
      this.pumpQueue();
    }
  }

  private failPending(err: Error): void {
    const resolveRx = this.rxResolve;
    this.rxResolve = null;
    if (this.rxQuietTimer) { clearTimeout(this.rxQuietTimer); this.rxQuietTimer = null; }
    if (this.rxOverallTimer) { clearTimeout(this.rxOverallTimer); this.rxOverallTimer = null; }
    if (resolveRx) {
      // Convert outstanding RX into an error by failing the queue head.
      const flushed = this.queue.splice(0);
      this.inFlight = false;
      flushed.forEach((p) => p.reject(err));
    } else {
      const flushed = this.queue.splice(0);
      flushed.forEach((p) => p.reject(err));
    }
  }

  private startWatchdog(): void {
    this.stopWatchdog();
    this.watchdogTimer = setInterval(() => this.tickWatchdog(), WATCHDOG_TICK_MS);
    if (typeof this.watchdogTimer.unref === 'function') this.watchdogTimer.unref();
  }

  private stopWatchdog(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  private tickWatchdog(): void {
    if (this.state !== 'connected') return;
    const sock = this.socket;
    if (!sock || sock.destroyed || !sock.writable) {
      this.log('info', 'watchdog: socket appears dead');
      this.socket = null;
      void this.tryReconnect();
    }
  }

  private async tryReconnect(): Promise<void> {
    if (this.disposed || this.userRequestedDisconnect) return;
    if (this.isReconnectLoop) return;
    this.isReconnectLoop = true;
    this.reconnectAbort = false;
    this.setState('reconnecting');
    try {
      for (let i = 0; i < RECONNECT_BACKOFFS_MS.length; i++) {
        if (this.reconnectAbort || this.userRequestedDisconnect) return;
        const delay = RECONNECT_BACKOFFS_MS[i];
        this.log('info', `reconnect attempt ${i + 1}/${RECONNECT_BACKOFFS_MS.length} in ${delay}ms`);
        await sleep(delay);
        if (this.reconnectAbort || this.userRequestedDisconnect) return;
        try {
          await this.openSocket();
          this.setState('connected');
          this.startWatchdog();
          // Re-sync routes on the new connection.
          try { await this.refresh(); }
          catch (e) { this.log('error', 'post-reconnect refresh failed: ' + describeError(e)); }
          this.log('info', 'reconnect succeeded');
          return;
        } catch (e) {
          this.log('error', 'reconnect attempt failed: ' + describeError(e));
        }
      }
      this.log('error', 'reconnect attempts exhausted');
      this.setState('disconnected', 'reconnect exhausted');
    } finally {
      this.isReconnectLoop = false;
    }
  }

  // --------------- Response handling ---------------

  private parseRoutes(response: string): RouteMap {
    const out: RouteMap = {};
    if (!response) return out;
    let m: RegExpExecArray | null;
    ROUTE_LINE.lastIndex = 0;
    while ((m = ROUTE_LINE.exec(response)) !== null) {
      const input = parseInt(m[1], 10);
      const output = parseInt(m[2], 10);
      if (input >= 0 && input <= 8 && output >= 1 && output <= 8) {
        out[output] = input;
      }
    }
    return out;
  }

  private applyResponseOrFallback(response: string, input: number, output: number): void {
    if (response && ERROR_CODE.test(response)) {
      const code = ERROR_CODE.exec(response)?.[0] ?? 'E??';
      this.log('error', `device error ${code.toUpperCase()}`);
      return;
    }
    const parsed = this.parseRoutes(response);
    if (Object.keys(parsed).length > 0) {
      this.routes = { ...this.routes, ...parsed };
      this.emitState();
      return;
    }
    // Fallback: response gave no usable parse — assume the requested mapping took.
    if (output === 0) {
      const all: RouteMap = {};
      for (let o = 1; o <= Pn8080MatrixService.Outputs; o++) all[o] = input;
      this.routes = { ...this.routes, ...all };
    } else {
      this.routes = { ...this.routes, [output]: input };
    }
    this.emitState();
  }

  // --------------- State / log ---------------

  private setState(next: ConnectionState, reason?: string): void {
    if (this.state === next) {
      if (reason) this.log('info', `state ${next} (${reason})`);
      return;
    }
    this.state = next;
    this.log('info', reason ? `state → ${next} (${reason})` : `state → ${next}`);
    this.emit('connected', next === 'connected');
    this.emitState();
  }

  private emitState(): void {
    const snapshot = this.getState();
    this.emit('state', snapshot);
  }

  private log(dir: LogDirection, text: string): void {
    const entry: MatrixLogEntry = { ts: Date.now(), dir, text };
    this.emit('log', entry);
  }

  private validateInput(input: number): void {
    if (input < 1 || input > Pn8080MatrixService.Inputs) {
      throw new Error(`input out of range (1..${Pn8080MatrixService.Inputs}): ${input}`);
    }
  }
  private validateOutput(output: number): void {
    if (output < 1 || output > Pn8080MatrixService.Outputs) {
      throw new Error(`output out of range (1..${Pn8080MatrixService.Outputs}): ${output}`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  try { return String(e); } catch { return 'unknown'; }
}
