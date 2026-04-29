// Design Ref: §6.2, §7.2 — Per-launch secret used to gate Electron-only IPC
// (specifically /api/devices/me/register-signage). The renderer learns the
// secret via window.electronAPI; remote browsers never see it.

import { randomBytes } from 'crypto';

let secret: string | null = null;

export function initInternalSecret(): string {
  secret = randomBytes(24).toString('hex');
  return secret;
}

export function getInternalSecret(): string | null {
  return secret;
}
