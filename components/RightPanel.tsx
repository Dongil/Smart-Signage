// Design Ref: ui-redesign §3.3.1 — right-side operator panel.
// Stacks the preview thumbnail, playback controls, and operation options
// in a single 640px-wide column. Replaces the v1.2 Preview-only sidebar.
//
// matrix-control §3.8 — host-only MatrixControlPanel at the bottom. The
// useMatrix() hook wires IPC subscriptions; both no-op outside Electron.

'use client';

import { useEffect, useState } from 'react';
import Preview from './Preview';
import PlaybackControls from './PlaybackControls';
import OperationOptionsPanel from './OperationOptionsPanel';
import MatrixControlPanel from './MatrixControlPanel';
import { useMatrix } from '@/hooks/useMatrix';
import styles from './RightPanel.module.css';

export default function RightPanel() {
  // Subscribes to matrix IPC events. Safely no-ops in remote browsers.
  useMatrix();

  const [isElectron, setIsElectron] = useState(false);
  useEffect(() => {
    setIsElectron(typeof window !== 'undefined' && !!window.electronAPI);
  }, []);

  return (
    <aside className={styles.right} aria-label="사이니지 운영">
      <Preview />
      <PlaybackControls />
      <OperationOptionsPanel />
      {isElectron && <MatrixControlPanel />}
    </aside>
  );
}
