'use client';

import { useEffect } from 'react';
import { useSignageStore } from '@/store/useSignageStore';
import Toolbar from '@/components/Toolbar';
import SlideList from '@/components/SlideList';
import SlideEditor from '@/components/SlideEditor';
import Preview from '@/components/Preview';
import styles from './page.module.css';

export default function EditorPage() {
  const loadFromFile = useSignageStore((state) => state.loadFromFile);

  useEffect(() => {
    loadFromFile();
  }, [loadFromFile]);

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
      <Toolbar />
      <div className={styles.body}>
        <SlideList />
        <SlideEditor />
        <Preview />
      </div>
    </div>
  );
}
