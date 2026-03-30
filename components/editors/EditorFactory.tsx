// Design Ref: §3.3 — Factory dispatches to type-specific editor via Registry
'use client';

import { templateRegistry } from '../templates/templateRegistry';
import { Slide } from '@/types/slide';

interface Props {
  slide: Slide;
  onUpdate: (updates: Partial<Slide>) => void;
}

export default function EditorFactory({ slide, onUpdate }: Props) {
  const template = templateRegistry.get(slide.type);
  if (!template) {
    return <p>알 수 없는 슬라이드 타입: {slide.type}</p>;
  }
  const Editor = template.editor;
  return <Editor slide={slide} onUpdate={onUpdate} />;
}
