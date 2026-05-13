// Design Ref: ui-redesign §3.1.2 — single source of truth for runtime options.
//
// To add a new operational option: append one entry here and the
// OperationOptionsPanel will render it automatically. The store and SSE
// handlers iterate this registry, so no other wiring is required unless the
// option needs special consumer behavior (CSS variable, computed effect, ...).

import type { OptionSchema } from './types';

export const OPTION_REGISTRY: OptionSchema[] = [
  {
    key: 'signage.resolution',
    type: 'select',
    label: '사이니지 해상도',
    hint: '현장 모니터 구성에 맞춰 선택',
    default: { w: 5760, h: 1080 },
    options: [
      { label: '5760×1080', value: { w: 5760, h: 1080 } },
      { label: '5760×1200', value: { w: 5760, h: 1200 } },
    ],
  },
  {
    key: 'slide.padding',
    type: 'number',
    label: '슬라이드 상하 여백',
    default: 50,
    min: 0,
    max: 300,
    step: 1,
    unit: 'px',
  },
  {
    key: 'slide.transitionSec',
    type: 'number',
    label: '효과',
    hint: '0 = CUT (페이드 없음)',
    default: 0.5,
    min: 0,
    max: 3,
    step: 0.1,
    unit: '초',
  },
];

export function getOptionDefault<T = unknown>(key: string): T | undefined {
  const schema = OPTION_REGISTRY.find((s) => s.key === key);
  return schema?.default as T | undefined;
}

export function getOptionSchema(key: string): OptionSchema | undefined {
  return OPTION_REGISTRY.find((s) => s.key === key);
}

export function isRegistryKey(key: string): boolean {
  return OPTION_REGISTRY.some((s) => s.key === key);
}
