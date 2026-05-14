// Design Ref: ui-polish §6.1 — shared collapse header for right-panel sections.
// Owns only title + chevron; the panel keeps its own body / inline rows.

'use client';

import styles from './SectionHeader.module.css';

interface Props {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  controlsId?: string;
}

export default function SectionHeader({ title, collapsed, onToggle, controlsId }: Props) {
  return (
    <button
      type="button"
      className={styles.header}
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-controls={controlsId}
    >
      <span className={styles.title}>{title}</span>
      <span className={styles.chevron} aria-hidden>
        {collapsed ? '▶' : '▼'}
      </span>
    </button>
  );
}
