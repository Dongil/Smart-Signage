import { useCallback, useEffect, useRef } from 'react';
import { Slide } from '@/types/slide';

const SIGNAGE_STORAGE_KEY = 'signage-output';
const SIGNAGE_WINDOW_NAME = 'signage-output';

interface SignagePayload {
  slides: Slide[];
  startIndex: number;
}

export function useSignageIPC() {
  const signageWinRef = useRef<Window | null>(null);

  const sendToSignage = useCallback((slides: Slide[], startIndex: number) => {
    if (window.electronAPI) {
      window.electronAPI.send('show-on-signage', { slides, startIndex });
    } else {
      // Browser fallback: localStorage + popup on secondary display
      const payload: SignagePayload = { slides, startIndex };
      localStorage.setItem(SIGNAGE_STORAGE_KEY, JSON.stringify(payload));

      // Reuse existing window
      if (signageWinRef.current && !signageWinRef.current.closed) {
        signageWinRef.current.focus();
        return;
      }

      openSignageWindow().then((popup) => {
        if (popup) signageWinRef.current = popup;
      });
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (window.electronAPI) {
      window.electronAPI.send('toggle-fullscreen');
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        document.documentElement.requestFullscreen();
      }
    }
  }, []);

  const getDisplays = useCallback(async () => {
    return window.electronAPI?.invoke('get-displays');
  }, []);

  return { sendToSignage, toggleFullscreen, getDisplays };
}

interface ScreenInfo {
  left: number;
  top: number;
  width: number;
  height: number;
}

async function getSecondaryScreen(): Promise<ScreenInfo> {
  // Default: position right of primary monitor
  const fallback: ScreenInfo = {
    left: window.screen.width,
    top: 0,
    width: 5760,
    height: 1080,
  };

  try {
    if ('getScreenDetails' in window) {
      // @ts-expect-error — experimental Multi-Screen API (Chrome 100+)
      const screenDetails = await window.getScreenDetails();
      const screens = screenDetails.screens as Array<{
        left: number; top: number; width: number; height: number;
        availLeft: number; availTop: number; availWidth: number; availHeight: number;
        isPrimary: boolean;
      }>;
      const secondary = screens.find((s) => !s.isPrimary);
      if (secondary) {
        return {
          left: secondary.availLeft,
          top: secondary.availTop,
          width: secondary.availWidth,
          height: secondary.availHeight,
        };
      }
    }
  } catch {
    // Permission denied or API not available
  }

  return fallback;
}

async function openSignageWindow(): Promise<Window | null> {
  const screen = await getSecondaryScreen();

  // Open popup sized exactly to secondary display — looks like fullscreen
  const popup = window.open(
    '/signage',
    SIGNAGE_WINDOW_NAME,
    [
      'popup=true',
      `width=${screen.width}`,
      `height=${screen.height}`,
      `left=${screen.left}`,
      `top=${screen.top}`,
      'menubar=no',
      'toolbar=no',
      'location=no',
      'status=no',
      'scrollbars=no',
    ].join(',')
  );

  if (popup) {
    // Ensure exact position/size after open
    popup.moveTo(screen.left, screen.top);
    popup.resizeTo(screen.width, screen.height);

    // Try fullscreen with screen targeting (Chrome 119+)
    popup.addEventListener('load', () => {
      try {
        // @ts-expect-error — experimental: requestFullscreen with screen option
        popup.document.documentElement.requestFullscreen({ screen })
          .catch(() => {
            // Fallback: already sized to fill screen, so it looks fullscreen
          });
      } catch {
        // Not supported — window is already screen-sized
      }
    });
  }

  return popup;
}

export function useSignageListener(
  callback: (slides: Slide[], startIndex: number) => void
) {
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.on('render-slide', (data) => {
        const payload = data as SignagePayload;
        callback(payload.slides, payload.startIndex);
      });
      return () => {
        window.electronAPI?.removeAllListeners('render-slide');
      };
    } else {
      // Browser fallback: poll localStorage for slide updates
      let lastData = '';
      const checkStorage = () => {
        const raw = localStorage.getItem(SIGNAGE_STORAGE_KEY);
        if (raw && raw !== lastData) {
          lastData = raw;
          const payload = JSON.parse(raw) as SignagePayload;
          callback(payload.slides, payload.startIndex);
        }
      };
      checkStorage();
      const interval = setInterval(checkStorage, 500);
      return () => clearInterval(interval);
    }
  }, [callback]);
}
