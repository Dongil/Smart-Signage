// Design Ref: §4.3 — /api/devices.
// `me/register-signage` is gated by the launch-time secret header so only
// the host Electron renderer (which knows the secret) can flip the flag.

import { Router } from 'express';
import {
  listDevices,
  getDevice,
  setSignageOutput,
} from '../services/deviceService';
import { getInternalSecret } from '../security';

export const devicesRouter = Router();

devicesRouter.get('/me', (req, res) => {
  if (!req.device) return res.status(500).json({ error: 'device-context missing' });
  res.json({ device: req.device });
});

devicesRouter.get('/', (_req, res) => {
  res.json({ devices: listDevices() });
});

devicesRouter.post('/me/register-signage', (req, res) => {
  const expected = getInternalSecret();
  const provided = req.header('X-Signage-Internal');
  if (!expected || provided !== expected) {
    return res.status(403).json({ error: 'forbidden' });
  }
  if (!req.device) return res.status(500).json({ error: 'device-context missing' });
  const updated = setSignageOutput(req.device.id, true);
  res.json({ device: updated });
});

devicesRouter.post('/me/unregister-signage', (req, res) => {
  const expected = getInternalSecret();
  const provided = req.header('X-Signage-Internal');
  if (!expected || provided !== expected) {
    return res.status(403).json({ error: 'forbidden' });
  }
  if (!req.device) return res.status(500).json({ error: 'device-context missing' });
  const updated = setSignageOutput(req.device.id, false);
  res.json({ device: updated });
});

// Used by the renderer to know which device id is currently active.
devicesRouter.get('/by-id/:id', (req, res) => {
  const device = getDevice(req.params.id);
  if (!device) return res.status(404).json({ error: 'not-found' });
  res.json({ device });
});
