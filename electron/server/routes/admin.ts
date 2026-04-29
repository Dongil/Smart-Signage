// Design Ref: §3.3, §13 — Internal-only routes for the v1.0 → v1.1 migration.
// Gated by the launch-time secret like other Electron-only endpoints.

import { Router } from 'express';
import path from 'path';
import { getDatabase } from '../../db/database';
import { importLegacySlides, isSlideTableEmpty, type LegacySlidePayload } from '../../db/migrations';
import { getInternalSecret } from '../security';
import { eventBus } from '../services/eventBus';
import { listSlides } from '../services/slideService';

export function buildAdminRouter(userDataDir: string) {
  const router = Router();

  router.post('/migrate-from-localstorage', (req, res) => {
    const expected = getInternalSecret();
    const provided = req.header('X-Signage-Internal');
    if (!expected || provided !== expected) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const body = req.body as { slides?: LegacySlidePayload[] } | undefined;
    if (!body || !Array.isArray(body.slides)) {
      return res.status(400).json({ error: 'slides[] required' });
    }
    const db = getDatabase();
    if (!isSlideTableEmpty(db)) {
      return res.json({ imported: 0, reason: 'db-not-empty' });
    }
    const imported = importLegacySlides(
      db,
      body.slides,
      path.join(userDataDir, 'backups')
    );
    if (imported > 0) {
      eventBus.emit({
        type: 'slide.changed',
        op: 'create',
        ids: listSlides().map((s) => s.id),
      });
    }
    return res.json({ imported });
  });

  return router;
}
