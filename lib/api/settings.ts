// Design Ref: signage-resolution §2.2 — Settings REST wrapper

import { apiFetch } from './client';

export interface SettingsResponse<T> {
  key: string;
  value: T;
}

export const settingsApi = {
  get<T>(key: string): Promise<SettingsResponse<T>> {
    return apiFetch<SettingsResponse<T>>(`/api/settings/${encodeURIComponent(key)}`);
  },
  set<T>(key: string, value: T): Promise<SettingsResponse<T>> {
    return apiFetch<SettingsResponse<T>>(`/api/settings/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: { value },
    });
  },
};
