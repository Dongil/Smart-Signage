export interface ElectronAPI {
  send: (channel: string, data?: unknown) => void;
  invoke: (channel: string, data?: unknown) => Promise<unknown>;
  on: (channel: string, callback: (...args: unknown[]) => void) => void;
  removeAllListeners: (channel: string) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
