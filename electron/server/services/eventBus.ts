// Design Ref: §2.M2, §6 — Single in-process EventEmitter that decouples
// service mutations from the SSE manager. Services call eventBus.emit(...);
// the SSE manager subscribes once and fans out to connected clients.

import { EventEmitter } from 'events';
import type { ServerEvent } from '../events';

class EventBus {
  private readonly emitter = new EventEmitter();
  private static readonly CHANNEL = 'server-event';

  emit(event: ServerEvent): void {
    this.emitter.emit(EventBus.CHANNEL, event);
  }

  on(listener: (event: ServerEvent) => void): () => void {
    this.emitter.on(EventBus.CHANNEL, listener);
    return () => this.emitter.off(EventBus.CHANNEL, listener);
  }
}

export const eventBus = new EventBus();
