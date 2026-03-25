import { useCallback, useEffect } from 'react';
import { Slide } from '@/types/slide';

export function useSignageIPC() {
  const sendToSignage = useCallback((slideData: Slide) => {
    window.electronAPI?.send('show-on-signage', slideData);
  }, []);

  const toggleFullscreen = useCallback(() => {
    window.electronAPI?.send('toggle-fullscreen');
  }, []);

  const getDisplays = useCallback(async () => {
    return window.electronAPI?.invoke('get-displays');
  }, []);

  return { sendToSignage, toggleFullscreen, getDisplays };
}

export function useSignageListener(callback: (slideData: Slide) => void) {
  useEffect(() => {
    window.electronAPI?.on('render-slide', (data) => {
      callback(data as Slide);
    });

    return () => {
      window.electronAPI?.removeAllListeners('render-slide');
    };
  }, [callback]);
}
