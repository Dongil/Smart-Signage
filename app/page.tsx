'use client';

import '@/components/templates/registerAll';
import { useEffect } from 'react';
import { useSignageStore } from '@/store/useSignageStore';
import { usePlaybackStore } from '@/store/usePlaybackStore';
import { usePlaybackKeys } from '@/hooks/usePlaybackKeys';
import { useSignageRemoteHandler } from '@/hooks/useSignageRemoteHandler';
import { installRendererLogger } from '@/lib/logger';
import Toolbar from '@/components/Toolbar';
import SlideList from '@/components/SlideList';
import SlideEditor from '@/components/SlideEditor';
import Preview from '@/components/Preview';
import SseBridge from '@/components/SseBridge';
import LegacyMigrationGuard from '@/components/LegacyMigrationGuard';
import styles from './page.module.css';

export default function EditorPage() {
  const hydrateSlides = useSignageStore((s) => s.hydrate);
  const hydratePlayback = usePlaybackStore((s) => s.hydrate);
  usePlaybackKeys();
  // Only Electron hosts will actually act on these events; remote browsers
  // mount this hook too but its handler short-circuits.
  useSignageRemoteHandler();

  useEffect(() => {
    installRendererLogger();
    hydrateSlides();
    hydratePlayback();
  }, [hydrateSlides, hydratePlayback]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        window.electronAPI?.send('toggle-fullscreen');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className={styles.layout}>
      <SseBridge />
      <LegacyMigrationGuard />
      <Toolbar />
      <div className={styles.body}>
        <SlideList />
        <SlideEditor />
        <Preview />
      </div>
    </div>
  );
}
