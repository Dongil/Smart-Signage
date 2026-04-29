// Design Ref: §3.3, §13 — One-shot migration of v1.0 localStorage payloads
// into SQLite. Runs on the editor page before/parallel to first hydrate.

'use client';

import { useEffect, useRef } from 'react';
import { adminApi } from '@/lib/api/admin';
import { useSignageStore } from '@/store/useSignageStore';

const LEGACY_KEYS = ['signage-slides', 'signage-output', 'signage-state'];

export default function LegacyMigrationGuard() {
  const hydrate = useSignageStore((s) => s.hydrate);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      try {
        const raw = localStorage.getItem('signage-slides');
        if (!raw) return;

        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return;
        }
        const slides = Array.isArray(parsed) ? parsed : [];
        if (slides.length === 0) {
          LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
          return;
        }

        const result = await adminApi.migrateLocalStorage(slides);
        if (result.imported > 0) {
          LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
          await hydrate();
          // eslint-disable-next-line no-console
          console.info(`[migration] imported ${result.imported} slides from v1.0 localStorage`);
        } else if (result.reason === 'db-not-empty') {
          // DB already has data — clear stale localStorage to avoid re-prompting.
          LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
        }
      } catch {
        // Fail silently — user can retry by reloading once the server is up.
      }
    })();
  }, [hydrate]);

  return null;
}
