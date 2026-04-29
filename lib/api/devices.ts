// Design Ref: §4.3 — Typed wrappers for /api/devices.
import { apiFetch } from './client';

export interface Device {
  id: string;
  name: string;
  isSignageOutput: boolean;
  createdAt: number;
  lastSeenAt: number;
}

export const devicesApi = {
  me: async (): Promise<Device> => {
    const res = await apiFetch<{ device: Device }>('/api/devices/me');
    return res.device;
  },

  list: async (): Promise<Device[]> => {
    const res = await apiFetch<{ devices: Device[] }>('/api/devices');
    return res.devices;
  },

  /** Electron-only — host renderer flips its own is_signage_output flag. */
  registerSelfAsSignage: async (): Promise<Device> => {
    const res = await apiFetch<{ device: Device }>(
      '/api/devices/me/register-signage',
      { method: 'POST', internal: true, body: {} }
    );
    return res.device;
  },

  unregisterSelfAsSignage: async (): Promise<Device> => {
    const res = await apiFetch<{ device: Device }>(
      '/api/devices/me/unregister-signage',
      { method: 'POST', internal: true, body: {} }
    );
    return res.device;
  },
};
