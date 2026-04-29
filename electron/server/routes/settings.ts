// Design Ref: §4 — /api/settings.

import { Router } from 'express';
import { listSettings, getSetting, setSetting } from '../services/settingsService';

export const settingsRouter = Router();

settingsRouter.get('/', (_req, res) => {
  res.json({ settings: listSettings() });
});

settingsRouter.get('/:key', (req, res) => {
  const value = getSetting(req.params.key);
  if (value === null) return res.status(404).json({ error: 'not-found' });
  res.json({ key: req.params.key, value });
});

settingsRouter.put('/:key', (req, res) => {
  const body = req.body as { value?: unknown } | undefined;
  if (!body || !('value' in body)) {
    return res.status(400).json({ error: 'value field required' });
  }
  setSetting(req.params.key, body.value);
  res.json({ key: req.params.key, value: body.value });
});
