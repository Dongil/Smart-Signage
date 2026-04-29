// Design Ref: §4.5 — /api/events SSE stream.

import { Router } from 'express';
import { attachSseClient } from '../sse/manager';

export const eventsRouter = Router();

eventsRouter.get('/', (req, res) => {
  attachSseClient(req, res);
});

eventsRouter.get('/health', (_req, res) => {
  res.json({ ok: true });
});
