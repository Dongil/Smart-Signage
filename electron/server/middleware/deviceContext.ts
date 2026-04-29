// Design Ref: §2.M3, §7.2 — Device-id cookie issuance and request decoration.
// Module 2 handles bootstrap (cookie creation + DB row touch); Module 3
// adds the `signageGuard` on top of this for /signage and POST /api/control.

import type { Request, Response, NextFunction } from 'express';
import { issueDeviceId, touchDevice, type Device } from '../services/deviceService';

export const DEVICE_COOKIE = 'signage-device-id';
const COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

declare module 'express-serve-static-core' {
  interface Request {
    device?: Device;
  }
}

export function deviceContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
  let deviceId = cookies[DEVICE_COOKIE];

  if (!deviceId) {
    deviceId = issueDeviceId();
    res.cookie(DEVICE_COOKIE, deviceId, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE_MS,
    });
  }

  const ua = (req.headers['user-agent'] as string | undefined) ?? '';
  const fallbackName = ua.includes('Electron') ? 'Electron' : 'Remote Client';

  req.device = touchDevice(deviceId, fallbackName);
  next();
}
