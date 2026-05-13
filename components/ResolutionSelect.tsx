// Design Ref: signage-resolution §3.5.1 — operational signage resolution combo.
// Plan FR-1, FR-8 — fixed 2-option select with inflight guard.

'use client';

import { useState } from 'react';
import { useSignageStore, ALLOWED_HEIGHTS, type AllowedHeight } from '@/store/useSignageStore';
import styles from './ResolutionSelect.module.css';

const OPTIONS: Array<{ label: string; h: AllowedHeight }> = [
  { label: '5760×1080', h: 1080 },
  { label: '5760×1200', h: 1200 },
];

export default function ResolutionSelect() {
  const resolution = useSignageStore((s) => s.resolution);
  const setResolution = useSignageStore((s) => s.setResolution);
  const [busy, setBusy] = useState(false);

  const onChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const h = parseInt(e.target.value, 10);
    if (busy || h === resolution.h) return;
    if (!(ALLOWED_HEIGHTS as readonly number[]).includes(h)) return;
    setBusy(true);
    try {
      await setResolution(h as AllowedHeight);
    } catch {
      // Error already captured into store; combo will reflect rolled-back value.
    } finally {
      setBusy(false);
    }
  };

  return (
    <select
      className={styles.select}
      value={resolution.h}
      onChange={onChange}
      disabled={busy}
      aria-label="사이니지 해상도"
      title="운영 사이니지 해상도"
    >
      {OPTIONS.map((opt) => (
        <option key={opt.h} value={opt.h}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
