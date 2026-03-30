// Design Ref: §4.1 — Common editor fields (title, backgroundColor, duration)
'use client';

import { Slide } from '@/types/slide';
import styles from './BaseEditor.module.css';

interface BaseEditorProps {
  slide: Slide;
  onUpdate: (updates: Partial<Slide>) => void;
  children?: React.ReactNode;
}

export default function BaseEditor({ slide, onUpdate, children }: BaseEditorProps) {
  return (
    <div className={styles.editor}>
      <div className={styles.field}>
        <label htmlFor="slide-title">제목</label>
        <input
          id="slide-title"
          type="text"
          value={slide.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
        />
      </div>
      {children}
      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="slide-bg">배경색</label>
          <div className={styles.colorInput}>
            <input
              id="slide-bg"
              type="color"
              value={slide.backgroundColor}
              onChange={(e) => onUpdate({ backgroundColor: e.target.value })}
            />
            <span>{slide.backgroundColor}</span>
          </div>
        </div>
        <div className={styles.field}>
          <label htmlFor="slide-duration">표시 시간 (초)</label>
          <input
            id="slide-duration"
            type="number"
            min={1}
            max={300}
            value={slide.duration}
            onChange={(e) => onUpdate({ duration: Number(e.target.value) })}
          />
        </div>
      </div>
    </div>
  );
}
