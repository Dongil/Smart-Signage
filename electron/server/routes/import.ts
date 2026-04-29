// Design Ref: §4.4 — POST /api/import/hwpx
// Accepts the raw .hwpx bytes (application/octet-stream) up to 50MB.
// We avoid multipart to keep dependencies minimal.

import { Router, type Request } from 'express';
import express from 'express';
import { parseHwpx } from '../services/importService';

export const importRouter = Router();

// 50MB limit (Plan FR-05-2 / NFR HWPX 50page < 5s).
const rawBody = express.raw({ type: '*/*', limit: '50mb' });

importRouter.post('/hwpx', rawBody, async (req: Request, res) => {
  try {
    const buf = req.body as Buffer | undefined;
    if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) {
      return res.status(400).json({ error: 'empty-body' });
    }
    const result = await parseHwpx(buf);
    res.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'parse-failed';
    res.status(400).json({ error: msg });
  }
});
