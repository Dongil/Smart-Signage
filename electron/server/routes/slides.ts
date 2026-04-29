// Design Ref: §4.1 — /api/slides routes (CRUD + reorder).

import { Router } from 'express';
import {
  listSlides,
  getSlide,
  createSlide,
  updateSlide,
  deleteSlide,
  reorderSlides,
  type CreateSlideInput,
  type UpdateSlideInput,
} from '../services/slideService';

export const slidesRouter = Router();

slidesRouter.get('/', (_req, res) => {
  res.json({ slides: listSlides() });
});

slidesRouter.post('/', (req, res) => {
  const body = req.body as CreateSlideInput | undefined;
  if (!body || !body.type) {
    return res.status(400).json({ error: 'type is required' });
  }
  const slide = createSlide(body);
  res.status(201).json({ slide });
});

slidesRouter.post('/reorder', (req, res) => {
  const body = req.body as { orderedIds?: string[] } | undefined;
  if (!body || !Array.isArray(body.orderedIds)) {
    return res.status(400).json({ error: 'orderedIds[] is required' });
  }
  const slides = reorderSlides(body.orderedIds);
  res.json({ slides });
});

slidesRouter.get('/:id', (req, res) => {
  const slide = getSlide(req.params.id);
  if (!slide) return res.status(404).json({ error: 'not-found' });
  res.json({ slide });
});

slidesRouter.put('/:id', (req, res) => {
  const patch = req.body as UpdateSlideInput | undefined;
  if (!patch) return res.status(400).json({ error: 'body required' });
  const slide = updateSlide(req.params.id, patch);
  if (!slide) return res.status(404).json({ error: 'not-found' });
  res.json({ slide });
});

slidesRouter.delete('/:id', (req, res) => {
  const ok = deleteSlide(req.params.id);
  if (!ok) return res.status(404).json({ error: 'not-found' });
  res.status(204).end();
});
