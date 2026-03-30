// Design Ref: §8 — Template type selector modal
'use client';

import { SlideType } from '@/types/slide';
import { templateRegistry } from './templates/templateRegistry';
import styles from './TemplateSelector.module.css';

interface Props {
  onSelect: (type: SlideType) => void;
  onClose: () => void;
}

export default function TemplateSelector({ onSelect, onClose }: Props) {
  const templates = templateRegistry.getAll();

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.title}>슬라이드 타입 선택</h3>
        <div className={styles.grid}>
          {templates.map((t) => (
            <button
              key={t.type}
              className={styles.option}
              onClick={() => { onSelect(t.type); onClose(); }}
            >
              <span className={styles.icon}>{t.icon}</span>
              <span className={styles.label}>{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
