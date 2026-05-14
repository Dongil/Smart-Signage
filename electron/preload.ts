// Design Ref: §6.2, §7.2 — Preload bridge.
// v1.1 simplified signage flow: signage-show is invoke (returns result),
// signage-hide is fire-and-forget. The legacy "show-on-signage" channel
// is kept as an alias for backwards compatibility with cached pages.
// v1.5 matrix-control §3.3.1 — adds matrix:* channels (invoke + push).

import { contextBridge, ipcRenderer } from 'electron';

const SEND_CHANNELS = [
  'toggle-fullscreen',
  'signage-hide',
];

const INVOKE_CHANNELS = [
  // legacy (v1.0)
  'get-displays',
  'save-file',
  'load-file',
  'select-media-file',
  'copy-media-file',
  'get-media-path',
  // v1.1
  'get-host-device-id',
  'get-internal-secret',
  'get-server-info',
  'migrate-legacy-slides',
  // v1.1 simplified signage
  'signage-show',
  'signage-is-visible',
  // v1.2 diagnostics
  'log',
  'open-logs-folder',
  'get-log-path',
  // v1.5 matrix-control
  'matrix:connect',
  'matrix:disconnect',
  'matrix:route',
  'matrix:route-all',
  'matrix:refresh',
  'matrix:get-state',
  'matrix:set-alias',
  'matrix:set-host',
  'matrix:set-auto-connect',
  // v1.6 ui-polish — preset CRUD + apply
  'matrix:add-preset',
  'matrix:delete-preset',
  'matrix:apply-preset',
];

const ON_CHANNELS = [
  'render-slide',
  'signage-visibility',
  // v1.5 matrix-control
  'matrix:state',
  'matrix:log',
];

contextBridge.exposeInMainWorld('electronAPI', {
  send: (channel: string, data?: unknown) => {
    if (SEND_CHANNELS.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  // v1.5 matrix-control §3.3.1 — support variadic args (some channels pass
  // multiple parameters, e.g. matrix:route(input, output)).
  invoke: (channel: string, ...args: unknown[]) => {
    if (INVOKE_CHANNELS.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    return Promise.reject(new Error(`Channel ${channel} not allowed`));
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    if (ON_CHANNELS.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },
  removeAllListeners: (channel: string) => {
    if (ON_CHANNELS.includes(channel)) {
      ipcRenderer.removeAllListeners(channel);
    }
  },
});
