// Design Ref: matrix-control §3.7 — alias cell with inline-edit overlay.
// Mirrors the C# AliasMatrixControl pattern: double-click to edit, Enter
// commits, Escape cancels, blur commits. The store handles the IPC round
// trip; the cell only flips between display and input states.

'use client';

import { useEffect, useRef, useState } from 'react';
import { useMatrixStore } from '@/store/useMatrixStore';
import styles from './MatrixAliasCell.module.css';

interface Props {
  isInput: boolean;
  index: number; // 1..8
  value: string;
  /** Input cell only: this cell is the currently-active source. */
  selected?: boolean;
  /** Output cell only: the cell currently feeds the selected input. */
  connected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

const MAX_ALIAS_LEN = 10;

export default function MatrixAliasCell(props: Props) {
  const { isInput, index, value, selected, connected, disabled, onClick } = props;
  const setAlias = useMatrixStore((s) => s.setAlias);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== value) {
      void setAlias(isInput, index, draft);
    }
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const onCellClick = () => {
    if (disabled) return;
    onClick?.();
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={styles.editInput}
        maxLength={MAX_ALIAS_LEN}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
      />
    );
  }

  const cls = [
    styles.cell,
    isInput ? styles.input : styles.output,
    selected ? styles.selected : '',
    connected ? styles.connected : '',
    disabled ? styles.disabled : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cls}
      onClick={onCellClick}
      onDoubleClick={() => setEditing(true)}
      title={disabled ? '연결되지 않음' : '클릭하여 선택, 더블클릭하여 이름 변경'}
    >
      {value || String(index)}
    </div>
  );
}
