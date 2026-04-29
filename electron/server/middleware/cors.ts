// Design Ref: §7.2 — CORS restricted to localhost + private LAN ranges.
// External Internet exposure is out of scope for v1.1.

import cors from 'cors';
import type { CorsOptions } from 'cors';

const PRIVATE_HOST_PATTERNS: RegExp[] = [
  /^https?:\/\/localhost(?::\d+)?$/,
  /^https?:\/\/127\.\d+\.\d+\.\d+(?::\d+)?$/,
  /^https?:\/\/10\.\d+\.\d+\.\d+(?::\d+)?$/,
  /^https?:\/\/192\.168\.\d+\.\d+(?::\d+)?$/,
  /^https?:\/\/172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+(?::\d+)?$/,
];

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Same-origin / Electron loaded via file:// → no Origin header → allow.
    if (!origin) return callback(null, true);
    const ok = PRIVATE_HOST_PATTERNS.some((rx) => rx.test(origin));
    callback(ok ? null : new Error('Origin not permitted'), ok);
  },
  credentials: true,
};

export const corsMiddleware = cors(corsOptions);
