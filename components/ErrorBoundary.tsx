'use client';

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            background: '#1a1a2e',
            color: '#e74c3c',
            flexDirection: 'column',
            gap: '12px',
          }}>
            <h2>오류가 발생했습니다</h2>
            <p style={{ color: '#aaa', fontSize: '14px' }}>
              {this.state.error?.message}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                marginTop: '12px',
                padding: '8px 20px',
                background: '#0f3460',
                color: '#eee',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              다시 시도
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
