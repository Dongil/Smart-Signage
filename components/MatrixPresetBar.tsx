// Design Ref: ui-polish §6.4 — horizontal strip of preset buttons above the
// 4×8 matrix grid. Left click applies, right click opens an in-app confirm
// (NOT window.confirm — Electron's native dialog leaves the BrowserWindow in
// a stale focus state and breaks the next modal's input). Plan SC-3 — strip
// is hidden when matrix is not connected (parent guards).

'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useMatrixStore } from '@/store/useMatrixStore';
import type { MatrixPreset } from '@/types/matrix';
import styles from './MatrixPresetBar.module.css';

interface Props {
  presets: MatrixPreset[];
}

function summarize(p: MatrixPreset): string {
  return p.routes.map((r) => `in${r.input}→out${r.output}`).join(', ');
}

export default function MatrixPresetBar({ presets }: Props) {
  const applyPreset = useMatrixStore((s) => s.applyPreset);
  const deletePreset = useMatrixStore((s) => s.deletePreset);

  const [confirmFor, setConfirmFor] = useState<MatrixPreset | null>(null);

  return (
    <>
      <div className={styles.bar} role="toolbar" aria-label="프리셋">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            className={styles.btn}
            title={`${p.name} — ${summarize(p)}`}
            onClick={() => void applyPreset(p.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setConfirmFor(p);
            }}
          >
            {p.name}
          </button>
        ))}
      </div>

      {confirmFor && typeof document !== 'undefined' && createPortal(
        <div
          className={styles.confirmOverlay}
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmFor(null);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className={styles.confirmCard}>
            <p className={styles.confirmText}>
              <strong>&ldquo;{confirmFor.name}&rdquo;</strong> 프리셋을 삭제하시겠습니까?
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.confirmCancel}
                onClick={() => setConfirmFor(null)}
              >
                취소
              </button>
              <button
                type="button"
                className={styles.confirmOk}
                onClick={() => {
                  const id = confirmFor.id;
                  setConfirmFor(null);
                  void deletePreset(id);
                }}
                autoFocus
              >
                삭제
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
