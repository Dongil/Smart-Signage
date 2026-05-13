// Design Ref: ui-redesign §3.3.1 — right-side operator panel.
// Stacks the preview thumbnail, playback controls, and operation options
// in a single 640px-wide column. Replaces the v1.2 Preview-only sidebar.

'use client';

import Preview from './Preview';
import PlaybackControls from './PlaybackControls';
import OperationOptionsPanel from './OperationOptionsPanel';
import styles from './RightPanel.module.css';

export default function RightPanel() {
  return (
    <aside className={styles.right} aria-label="사이니지 운영">
      <Preview />
      <PlaybackControls />
      <OperationOptionsPanel />
    </aside>
  );
}
