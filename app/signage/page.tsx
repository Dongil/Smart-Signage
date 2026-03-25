'use client';

import ErrorBoundary from '@/components/ErrorBoundary';
import SignageRenderer from '@/components/SignageRenderer';

export default function SignagePage() {
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
