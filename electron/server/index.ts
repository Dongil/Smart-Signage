// Design Ref: §1.2, §2.M2 — Express HTTP server + SSE.
// Mounted by electron/main.ts AFTER the DB has been initialized.

import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import { corsMiddleware } from './middleware/cors';
import { deviceContextMiddleware } from './middleware/deviceContext';
import { slidesRouter } from './routes/slides';
import { settingsRouter } from './routes/settings';
import { devicesRouter } from './routes/devices';
import { controlRouter } from './routes/control';
import { importRouter } from './routes/import';
import { eventsRouter } from './routes/events';
import { buildAdminRouter } from './routes/admin';
import { initInternalSecret, getInternalSecret } from './security';
import { initControl } from './services/controlService';
import { closeAllSseClients } from './sse/manager';

export interface ServerStartOptions {
  port: number;
  userDataDir: string;
  /** Optional Next.js static export root (e.g. <appPath>/out). When set,
   *  the server will host the editor/signage HTML so remote LAN browsers
   *  can connect to the same port. Omitted in dev (Next.js dev server
   *  serves the pages on :3000). */
  staticDir?: string;
}

export interface RunningServer {
  app: Express;
  httpServer: http.Server;
  port: number;
  internalSecret: string;
  close: () => Promise<void>;
}

export function buildApp(userDataDir: string, staticDir?: string): Express {
  const app = express();

  app.use(corsMiddleware);
  app.use(cookieParser());
  app.use(express.json({ limit: '5mb' }));
  app.use(deviceContextMiddleware);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  app.use('/api/slides', slidesRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/devices', devicesRouter);
  app.use('/api/control', controlRouter);
  app.use('/api/import', importRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api/admin', buildAdminRouter(userDataDir));

  // Static hosting (production). Next.js `output: 'export'` produces an /out
  // folder with `.html` files (e.g. signage.html, signage/blocked.html).
  // We serve those plus a small SPA-fallback shim so deep-links work.
  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir, { extensions: ['html'], index: 'index.html' }));

    // Catch-all: map any non-/api GET to an .html file in the export when
    // present, otherwise fall back to index.html.
    app.get(/^(?!\/api\/)(?!\/_next\/).*/, (req, res) => {
      const stripQ = req.path.replace(/\/$/, '');
      const candidate = stripQ === '' ? 'index.html' : `${stripQ.replace(/^\//, '')}.html`;
      const candidatePath = path.join(staticDir, candidate);
      if (fs.existsSync(candidatePath)) {
        res.sendFile(candidatePath);
      } else {
        res.sendFile(path.join(staticDir, 'index.html'));
      }
    });
  }

  return app;
}

export async function startServer(opts: ServerStartOptions): Promise<RunningServer> {
  const internalSecret = initInternalSecret();
  const app = buildApp(opts.userDataDir, opts.staticDir);

  initControl();

  const httpServer = http.createServer(app);

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(opts.port, () => {
      httpServer.off('error', reject);
      resolve();
    });
  });

  const close = (): Promise<void> =>
    new Promise((resolve) => {
      closeAllSseClients();
      httpServer.close(() => resolve());
    });

  return {
    app,
    httpServer,
    port: opts.port,
    internalSecret,
    close,
  };
}

export { getInternalSecret };
