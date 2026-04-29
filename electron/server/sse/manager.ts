// Design Ref: §2.M2, §4.5 — SSE connection pool with heartbeat ping.
// Clients connect via GET /api/events; we register a Response, send the
// initial comment to flush headers, then forward every eventBus event.

import type { Request, Response } from 'express';
import { eventBus } from '../services/eventBus';
import type { ServerEvent } from '../events';

interface SseClient {
  id: number;
  res: Response;
}

const HEARTBEAT_INTERVAL_MS = 15_000;
const clients = new Map<number, SseClient>();
let nextId = 1;
let heartbeatTimer: NodeJS.Timeout | null = null;
let unsubscribe: (() => void) | null = null;

function writeEvent(res: Response, event: ServerEvent): void {
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function startBackgroundTasks(): void {
  if (!unsubscribe) {
    unsubscribe = eventBus.on((event) => {
      for (const client of clients.values()) {
        try {
          writeEvent(client.res, event);
        } catch {
          // Will be cleaned up by the 'close' handler.
        }
      }
    });
  }
  if (!heartbeatTimer) {
    heartbeatTimer = setInterval(() => {
      for (const client of clients.values()) {
        try {
          client.res.write(': ping\n\n');
        } catch {
          // ignore — close handler will remove
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
  }
}

function stopBackgroundTasksIfIdle(): void {
  if (clients.size > 0) return;
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

export function attachSseClient(req: Request, res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  res.write(': connected\n\n');

  const id = nextId++;
  clients.set(id, { id, res });
  startBackgroundTasks();

  const cleanup = () => {
    if (clients.delete(id)) {
      stopBackgroundTasksIfIdle();
    }
  };
  req.on('close', cleanup);
  res.on('close', cleanup);
  res.on('error', cleanup);
}

/** For tests / shutdown. */
export function closeAllSseClients(): void {
  for (const client of clients.values()) {
    try {
      client.res.end();
    } catch {
      // ignore
    }
  }
  clients.clear();
  stopBackgroundTasksIfIdle();
}

export function getSseClientCount(): number {
  return clients.size;
}
