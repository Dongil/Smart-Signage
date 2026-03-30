// Design Ref: §3.3 — Factory dispatches to type-specific renderer via Registry
'use client';

import { templateRegistry } from '../templates/templateRegistry';
import { Slide } from '@/types/slide';

interface Props {
  slide: Slide;
  onVideoEnd?: () => void;
}

export default function RendererFactory({ slide, onVideoEnd }: Props) {
  const template = templateRegistry.get(slide.type);
  if (!template) return null;
  const Renderer = template.renderer;
  return <Renderer slide={slide} onVideoEnd={onVideoEnd} />;
}
