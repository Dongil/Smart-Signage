// Design Ref: ui-redesign §3.1.4 — typed accessor for option values.
// Reads from useSignageStore.options, falling back to the registry default
// while the store hydrates (boot) or if a key is unknown to the server.

import { useSignageStore } from '@/store/useSignageStore';
import { getOptionDefault } from '@/lib/options/registry';

export function useOption<T>(key: string): T {
  const stored = useSignageStore((s) => s.options[key]) as T | undefined;
  if (stored !== undefined) return stored;
  return getOptionDefault<T>(key) as T;
}
