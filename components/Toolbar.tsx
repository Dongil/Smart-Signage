'use client';

import { useState } from 'react';
import { useSignageStore } from '@/store/useSignageStore';
import { useSignageIPC } from '@/hooks/useElectronIPC';
import styles from './Toolbar.module.css';

export default function Toolbar() {
  const slides = useSignageStore((state) => state.slides);
  const currentSlideIndex = useSignageStore((state) => state.currentSlideIndex);
  const saveToFile = useSignageStore((state) => state.saveToFile);
  const { sendToSignage, toggleFullscreen } = useSignageIPC();
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const currentSlide = slides[currentSlideIndex];

  const handleSave = async () => {
    await saveToFile();
    setSaveStatus('저장됨');
    setTimeout(() => setSaveStatus(null), 2000);
  };

  const handleShowOnSignage = () => {
    if (slides.length > 0) {
      sendToSignage(slides, currentSlideIndex);
    }
  };

  return (
    <header className={styles.toolbar}>
      <h1 className={styles.logo}>Signage Editor</h1>
      <div className={styles.actions}>
        <button className={styles.btn} onClick={handleSave}>
          {saveStatus ?? '저장'}
        </button>
        <button
          className={`${styles.btn} ${styles.primary}`}
          onClick={handleShowOnSignage}
          disabled={!currentSlide}
        >
          사이니지에 표시
        </button>
        <button className={styles.btn} onClick={toggleFullscreen}>
          F11 전체화면
        </button>
      </div>
    </header>
  );
}
