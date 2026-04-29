// Design Ref: §2.M6, FR-05-5 — Lines-per-slide selector for the import modal.

'use client';

import styles from './HwpxImport.module.css';

const PRESETS = [3, 4, 5, 6, 7, 8];
const MIN = 1;
const MAX = 30;

interface Props {
  value: number;
  onChange: (next: number) => void;
}

export default function LineCountControl({ value, onChange }: Props) {
  return (
    <div className={styles.lineCount}>
      <label className={styles.lineCountLabel}>슬라이드당 줄 수</label>
      <div className={styles.presetRow}>
        {PRESETS.map((n) => (
          <button
            key={n}
            type="button"
            className={`${styles.presetBtn} ${value === n ? styles.presetActive : ''}`}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <input
        type="number"
        className={styles.numberInput}
        min={MIN}
        max={MAX}
        step={1}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isNaN(v)) return;
          onChange(Math.max(MIN, Math.min(MAX, Math.round(v))));
        }}
      />
    </div>
  );
}
