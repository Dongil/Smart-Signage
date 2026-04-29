// Design Ref: §2.M4 — In v1.1 the renderer talks to the local HTTP API
// instead of going through Electron IPC, so most of the v1.0 helpers are
// gone. The remaining hook is kept because it's the only thing the
// editor still uses Electron's IPC for: media file dialogs (handled
// elsewhere) and the simple "focus the signage window" trigger.
//
// New code should import from `@/lib/api/*` and `@/store/*` instead.

export {};
