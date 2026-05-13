'use client';

import { useEffect, useState } from 'react';
import '@/components/templates/registerAll';
import ErrorBoundary from '@/components/ErrorBoundary';
import SseBridge from '@/components/SseBridge';
import SignageRenderer from '@/components/SignageRenderer';
import DisplayCssVarBridge from '@/components/DisplayCssVarBridge';
import { usePlaybackKeys } from '@/hooks/usePlaybackKeys';
import { installRendererLogger } from '@/lib/logger';
import { useSignageStore } from '@/store/useSignageStore';

// /signage is reachable both from the Electron host BrowserWindow (real
// signage output) and from any LAN browser that types the URL directly.
// We never want a remote browser to display slides — only the host's
// physical secondary monitor can. The simplest reliable check: did the
// preload bridge inject `window.electronAPI`? If not, this is a browser
// and we render an explanatory message instead.

export default function SignagePage() {
  const [isElectron, setIsElectron] = useState<boolean | null>(null);
  const hydrateSlides = useSignageStore((s) => s.hydrate);
  const hydrateSettings = useSignageStore((s) => s.hydrateSettings);

  usePlaybackKeys();

  useEffect(() => {
    installRendererLogger();
    setIsElectron(typeof window !== 'undefined' && !!window.electronAPI);
    // Design Ref: signage-resolution §3.5.4 — signage page also needs slides + resolution
    hydrateSlides();
    hydrateSettings();
  }, [hydrateSlides, hydrateSettings]);

  useEffect(() => {
    if (isElectron !== true) return;

    document.documentElement.requestFullscreen().catch(() => undefined);
    const onceFs = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => undefined);
      }
    };
    document.addEventListener('click', onceFs, { once: true });
    document.addEventListener('keydown', onceFs, { once: true });

    let cursorTimer: ReturnType<typeof setTimeout>;
    const hide = () => { document.body.style.cursor = 'none'; };
    const show = () => {
      document.body.style.cursor = 'default';
      clearTimeout(cursorTimer);
      cursorTimer = setTimeout(hide, 3000);
    };
    document.addEventListener('mousemove', show);
    cursorTimer = setTimeout(hide, 3000);

    return () => {
      document.removeEventListener('click', onceFs);
      document.removeEventListener('keydown', onceFs);
      document.removeEventListener('mousemove', show);
      clearTimeout(cursorTimer);
    };
  }, [isElectron]);

  if (isElectron === null) {
    return <FullScreenMessage>로딩 중...</FullScreenMessage>;
  }

  if (!isElectron) {
    return (
      <FullScreenMessage>
        <strong style={{ fontSize: 22, color: '#ff6b6b', marginBottom: 12 }}>
          이 페이지는 호스트 앱에서만 표시됩니다
        </strong>
        <span style={{ opacity: 0.7, lineHeight: 1.6 }}>
          원격 PC에서는 사이니지 출력을 직접 띄울 수 없습니다.<br />
          편집은 메인 페이지(/)에서 가능합니다.
        </span>
      </FullScreenMessage>
    );
  }

  return (
    <ErrorBoundary
      fallback={<FullScreenMessage>사이니지 렌더링 오류</FullScreenMessage>}
    >
      <DisplayCssVarBridge />
      <SseBridge />
      <SignageRenderer />
    </ErrorBoundary>
  );
}

function FullScreenMessage({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: '#000',
        color: '#888',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: 24,
        fontFamily: 'sans-serif',
      }}
    >
      {children}
    </div>
  );
}
