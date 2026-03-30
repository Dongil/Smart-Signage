import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  send: (channel: string, data?: unknown) => {
    const allowedChannels = ['toggle-fullscreen', 'show-on-signage'];
    if (allowedChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  invoke: (channel: string, data?: unknown) => {
    const allowedChannels = ['get-displays', 'save-file', 'load-file', 'select-media-file', 'copy-media-file', 'get-media-path'];
    if (allowedChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, data);
    }
    return Promise.reject(new Error(`Channel ${channel} not allowed`));
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const allowedChannels = ['render-slide'];
    if (allowedChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },
  removeAllListeners: (channel: string) => {
    const allowedChannels = ['render-slide'];
    if (allowedChannels.includes(channel)) {
      ipcRenderer.removeAllListeners(channel);
    }
  },
});
