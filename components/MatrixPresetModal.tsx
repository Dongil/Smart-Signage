// Design Ref: ui-polish §6.5 — preset-add modal.
// Portaled to document.body so RightPanel scrolling doesn't clip it.
// Save is disabled until name is non-empty + at least one output is selected
// + preset count is below MAX_PRESETS (20). Plan FR-4, FR-10, NFR-4.
//
// Focus is held by autoFocus + a delayed .focus() retry. The retry catches
// cases where the modal mounts immediately after a transient focus disruption
// (e.g., another portal closing) and the initial autoFocus silently no-ops.

'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMatrixStore } from '@/store/useMatrixStore';
import styles from './MatrixPresetModal.module.css';

const OUTPUTS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const MAX_PRESETS = 20;
const MAX_NAME = 20;

interface Props {
  existingCount: number;
  onClose: () => void;
}

function describeError(code: string): string {
  switch (code) {
    case 'name-required': return '이름을 입력해주세요.';
    case 'outputs-required': return '출력 채널을 하나 이상 선택해주세요.';
    case 'limit-reached': return '프리셋은 최대 20개까지 등록할 수 있습니다.';
    case 'not-connected': return '메트릭스가 연결되지 않았습니다.';
    case 'no-active-routes': return '선택한 출력 채널 중 라우팅된 채널이 없습니다.';
    default: return code;
  }
}

export default function MatrixPresetModal({ existingCount, onClose }: Props) {
  const addPreset = useMatrixStore((s) => s.addPreset);

  const [name, setName] = useState('');
  const [outputs, setOutputs] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // ESC closes the modal regardless of focus location.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Delayed focus retry — kicks in only when autoFocus didn't take.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const el = inputRef.current;
      if (el && document.activeElement !== el) {
        el.focus();
        el.select();
      }
    }, 50);
    return () => window.clearTimeout(t);
  }, []);

  // SSR-safe portal: bail until document exists. 'use client' guarantees this
  // for the initial render in Next 14, but guard defensively.
  if (typeof document === 'undefined') return null;

  const atLimit = existingCount >= MAX_PRESETS;
  const canSave =
    !atLimit && !submitting && name.trim().length > 0 && outputs.size > 0;

  const toggleOutput = (o: number) => {
    setOutputs((prev) => {
      const next = new Set(prev);
      if (next.has(o)) next.delete(o);
      else next.add(o);
      return next;
    });
  };

  const onSave = async () => {
    if (!canSave) return;
    setSubmitting(true);
    setError(null);
    const list = [...outputs].sort((a, b) => a - b);
    const r = await addPreset(name.trim(), list);
    setSubmitting(false);
    if (r.ok) onClose();
    else setError(describeError(r.error));
  };

  return createPortal(
    <div
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="프리셋 추가"
    >
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.title}>프리셋 추가</h3>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        <div className={styles.body}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>이름</span>
            <input
              ref={inputRef}
              autoFocus
              type="text"
              className={styles.input}
              value={name}
              maxLength={MAX_NAME}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 메인 장면"
            />
          </label>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>출력 채널 선택</span>
            <div className={styles.checkboxGrid}>
              {OUTPUTS.map((o) => (
                <label key={o} className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={outputs.has(o)}
                    onChange={() => toggleOutput(o)}
                  />
                  <span>{o}</span>
                </label>
              ))}
            </div>
          </div>

          {atLimit && (
            <div className={styles.warning}>⚠ 프리셋은 최대 {MAX_PRESETS}개까지 등록할 수 있습니다.</div>
          )}
          {error && <div className={styles.error}>{error}</div>}
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={!canSave}
            onClick={() => void onSave()}
          >
            {submitting ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
