// Design Ref: §4.2 — /api/control.

import { Router } from 'express';
import {
  getControlState,
  dispatchControl,
  recordSignageHeartbeat,
  markSignageStopped,
  requestSignage,
  type ControlAction,
} from '../services/controlService';

export const controlRouter = Router();

controlRouter.get('/', (_req, res) => {
  res.json({ state: getControlState() });
});

controlRouter.post('/', (req, res) => {
  const body = req.body as ControlAction | undefined;
  if (!body || typeof body.action !== 'string') {
    return res.status(400).json({ error: 'action required' });
  }
  try {
    const state = dispatchControl(body);
    res.json({ state });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'invalid' });
  }
});

// Signage window liveness — see controlService for the timeout policy.
// Accept GET as well so navigator.sendBeacon (which only fires POST without
// custom headers, but we keep parity with curl-based testing) and simple
// fetch() bodies both work.
controlRouter.post('/signage-heartbeat', (_req, res) => {
  const state = recordSignageHeartbeat();
  res.json({ state });
});

controlRouter.post('/signage-stop', (_req, res) => {
  const state = markSignageStopped();
  res.json({ state });
});

// Remote-trigger: any client asks the host to show/hide its signage window.
// Browsers without an Electron host quietly ignore the resulting SSE event.
controlRouter.post('/signage-request', (req, res) => {
  const body = req.body as { action?: 'show' | 'hide' } | undefined;
  if (!body || (body.action !== 'show' && body.action !== 'hide')) {
    return res.status(400).json({ error: 'action must be "show" or "hide"' });
  }
  const state = requestSignage(body.action);
  res.json({ state });
});
