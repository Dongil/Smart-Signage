'use client';

import { useEffect } from 'react';
import '@/components/templates/registerAll';
import ErrorBoundary from '@/components/ErrorBoundary';
import SignageRenderer from '@/components/SignageRenderer';

export default function SignagePage() {
  useEffect(() => {
    // Try auto-fullscreen immediately (works if opened via window.open with user gesture)
    document.documentElement.requestFullscreen().catch(() => {
      // Blocked — add click listener as fallback
    });

    // Fallback: fullscreen on first user interaction
    const handleInteraction = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    };
    document.addEventListener('click', handleInteraction, { once: true });
    document.addEventListener('keydown', handleInteraction, { once: true });

    // Hide cursor after 3 seconds of no movement
    let cursorTimer: ReturnType<typeof setTimeout>;
    const hideCursor = () => {
      document.body.style.cursor = 'none';
    };
    const showCursor = () => {
      document.body.style.cursor = 'default';
      clearTimeout(cursorTimer);
      cursorTimer = setTimeout(hideCursor, 3000);
    };
    document.addEventListener('mousemove', showCursor);
    cursorTimer = setTimeout(hideCursor, 3000);

    // ESC to exit fullscreen is handled by browser natively
    return () => {
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
      document.removeEventListener('mousemove', showCursor);
      clearTimeout(cursorTimer);
    };
  }, []);

  return (
    <ErrorBoundary
      fallback={
        <div style={{
          width: '100vw',
          height: '100vh',
          background: '#000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#666',
        }}>
          사이니지 렌더링 오류
        </div>
      }
    >
      <SignageRenderer />
    </ErrorBoundary>
  );
}
