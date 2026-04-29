// Design Ref: §3.3, §13 — Internal-only admin endpoints.
import { apiFetch } from './client';
import type { Slide } from '@/types/slide';

export interface MigrateResult {
  imported: number;
  reason?: string;
}

export const adminApi = {
  migrateLocalStorage: async (slides: Partial<Slide>[]): Promise<MigrateResult> =>
    apiFetch<MigrateResult>('/api/admin/migrate-from-localstorage', {
      method: 'POST',
      internal: true,
      body: { slides },
    }),
};
