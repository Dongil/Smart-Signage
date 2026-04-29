// Design Ref: §2.M3 (simplified) — Toolbar wired to API + Electron IPC.
//
// One primary action: "사이니지에 표시" / "사이니지 표시 종료".
// Auto-plays on show and pauses on hide. Manual play/pause/seek lives in
// the PlaybackControls bar under the preview, so the toolbar stays focused
// on the on/off action.
//
//   - Host (Electron): IPC `signage-show` / `signage-hide`. Returns
//     ok=false when no secondary monitor is attached; we surface that as
//     a banner.
//   - Remote (browser): POST /api/control/signage-request. The host's
//     editor renderer receives the SSE signal and runs the IPC. The remote
//     browser never opens any signage window of its own.

'use client';

import { useEffect, useState } from 'react';
import { useSignageStore } from '@/store/useSignageStore';
import { usePlaybackStore } from '@/store/usePlaybackStore';
import { controlApi } from '@/lib/api/control';
import { logger, openLogsFolder } from '@/lib/logger';
import styles from './Toolbar.module.css';

interface SignageShowResult {
  ok: boolean;
  reason?: 'no-secondary-display' | 'window-missing';
  displayCount?: number;
}

export default function Toolbar() {
  const slides = useSignageStore((s) => s.slides);
  const editingIndex = useSignageStore((s) => s.editingIndex);
  const signageActive = usePlaybackStore((s) => s.signageActive);
  const dispatch = usePlaybackStore((s) => s.dispatch);

  const [isElectron, setIsElectron] = useState(false);
  const [displayCount, setDisplayCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const inElectron = typeof window !== 'undefined' && !!window.electronAPI;
    setIsElectron(inElectron);
    if (inElectron && window.electronAPI) {
      window.electronAPI
        .invoke('get-displays')
        .then((d) => {
          if (Array.isArray(d)) setDisplayCount(d.length);
        })
        .catch(() => undefined);
    }
  }, []);

  const currentSlide = slides[editingIndex];

  const handleShowOnSignage = async () => {
    setError(null);
    setBusy(true);
    try {
      if (signageActive) {
        logger.info('toolbar', 'signage toggle: hide');
        await dispatch({ action: 'pause' });
        if (isElectron && window.electronAPI) {
          window.electronAPI.send('signage-hide');
        } else {
          await controlApi.requestSignage('hide');
        }
        return;
      }

      if (slides.length === 0) return;

      logger.info('toolbar', 'signage toggle: show', { editingIndex });
      await dispatch({ action: 'goto', payload: { index: editingIndex } });

      if (isElectron && window.electronAPI) {
        const result = (await window.electronAPI.invoke(
          'signage-show'
        )) as SignageShowResult;
        logger.info('toolbar', 'signage-show IPC result', result);
        if (!result.ok) {
          if (result.reason === 'no-secondary-display') {
            setError(
              `확장 모니터가 감지되지 않았습니다 (감지된 모니터: ${result.displayCount ?? '?'}개). ` +
                `보조 모니터를 연결한 후 다시 시도하세요.`
            );
          } else {
            setError('사이니지 창을 표시할 수 없습니다.');
          }
          return;
        }
        await dispatch({ action: 'play' });
      } else {
        await controlApi.requestSignage('show');
      }
    } catch (e) {
      logger.error('toolbar', 'handleShowOnSignage failed', {
        message: e instanceof Error ? e.message : String(e),
      });
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
    } finally {
      setBusy(false);
    }
  };

  const showLabel = isElectron
    ? signageActive ? '사이니지 표시 종료' : '사이니지에 표시'
    : signageActive ? '원격 사이니지 종료' : '원격 사이니지에 표시';

  return (
    <header className={styles.toolbar}>
      <h1 className={styles.logo}>Signage Editor</h1>
      <div className={styles.actions}>
        <button
          className={`${styles.btn} ${styles.primary}`}
          onClick={handleShowOnSignage}
          disabled={busy || (!signageActive && !currentSlide)}
          title={
            signageActive
              ? '사이니지 출력을 종료합니다'
              : isElectron
                ? '확장 모니터에 사이니지 창을 엽니다'
                : '호스트 PC의 사이니지 창을 엽니다'
          }
        >
          {showLabel}
        </button>
        {isElectron && (
          <button
            className={styles.btn}
            onClick={() => openLogsFolder()}
            title="문제 발생 시 첨부할 로그 파일이 있는 폴더를 엽니다"
          >
            📋 로그
          </button>
        )}
        <span className={styles.deviceInfo}>
          {isElectron
            ? `🖥 호스트${displayCount !== null ? ` · 모니터 ${displayCount}` : ''}`
            : '🌐 원격'}
        </span>
      </div>
      {error && (
        <div className={styles.errorBanner}>
          ⚠ {error}
          <button className={styles.errorClose} onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}
    </header>
  );
}
