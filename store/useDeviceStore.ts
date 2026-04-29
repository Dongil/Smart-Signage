// Design Ref: §2.M3 — Cached device identity for the current client.
// Drives signage-output guard (UI-side) and the Toolbar register button.

import { create } from 'zustand';
import { devicesApi, type Device } from '@/lib/api/devices';

interface DeviceStoreState {
  device: Device | null;
  loading: boolean;
  error: string | null;
  hydrate: () => Promise<Device | null>;
  registerSelfAsSignage: () => Promise<Device>;
  unregisterSelfAsSignage: () => Promise<Device>;
  applyEvent: (deviceId: string) => Promise<void>;
}

export const useDeviceStore = create<DeviceStoreState>((set, get) => ({
  device: null,
  loading: false,
  error: null,

  hydrate: async () => {
    set({ loading: true, error: null });
    try {
      const device = await devicesApi.me();
      set({ device, loading: false });
      return device;
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : 'fetch-failed' });
      return null;
    }
  },

  registerSelfAsSignage: async () => {
    const device = await devicesApi.registerSelfAsSignage();
    set({ device });
    return device;
  },

  unregisterSelfAsSignage: async () => {
    const device = await devicesApi.unregisterSelfAsSignage();
    set({ device });
    return device;
  },

  applyEvent: async (deviceId) => {
    const current = get().device;
    if (!current || current.id !== deviceId) return;
    const fresh = await devicesApi.me();
    set({ device: fresh });
  },
}));
