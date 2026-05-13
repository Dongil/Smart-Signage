# Design: v1.3 UI 재구성 (UI Redesign)

| Field | Value |
|-------|-------|
| Feature key | `ui-redesign` |
| Plan | `docs/01-plan/features/ui-redesign.plan.md` |
| Architecture | **C. Pragmatic Balance** (Schema Registry + 기존 store/SSE 재사용) |
| Created | 2026-05-13 |
| Target version | v1.3.0 |
| Status | Design (Checkpoint 3 confirmed) |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 운영 컨트롤·속성이 늘어남에 따라 320px 패널 한계. 발견성·확장성 모두 개선 필요. |
| **WHO** | 운영자(호스트 PC): 슬라이드 편집보다 운영 컨트롤·옵션 조정에 시간을 더 씀. |
| **RISK** | 편집 영역 축소 / 옵션 레지스트리 미설계 / disabled 일관성. |
| **SUCCESS** | 우측 패널 640px + 4개 옵션 동작. 옵션 변경 1초 내 편집/프리뷰/출력 반영. 부팅 직후 컨트롤 표시 + disabled. |
| **SCOPE** | 8개 요구사항. 신규 옵션 항목은 별도 Plan. |

---

## 1. Overview

### 1.1 핵심 아키텍처

```
┌────────────────────────────────────────────────────────────────────────┐
│  SQLite settings table (key/value, JSON)                               │
│                            │                                           │
│              boot ← GET    │     PUT /api/settings/:key                │
│                            ▼                                           │
│  ┌────────────────────────────────────────────────────────────┐        │
│  │  useSignageStore.options: Record<string, unknown>           │       │
│  │  + setOption(key, value)                                    │       │
│  │  + hydrateAllOptions()  ← from OPTION_REGISTRY keys         │       │
│  └────────────────────────────────────────────────────────────┘        │
│                            │                                           │
│       ┌────────────────────┼──────────────────────┐                    │
│       ▼                    ▼                      ▼                    │
│  useOption(key)      DisplayCssVarBridge    OperationOptionsPanel      │
│  (typed accessor)    (CSS vars for         (renders OPTION_REGISTRY)   │
│                       --canvas-*, --slide-*)                           │
│                                                                        │
│  Schema source: lib/options/registry.ts                                │
│  Type source:   lib/options/types.ts                                   │
│                                                                        │
│  Consumers:                                                            │
│   ├ paddingUtils ── reads slide.padding                                │
│   ├ TextSlide ──── reads slide.padding                                 │
│   ├ RichTextEditor ─ reads slide.padding (for editor preview)          │
│   ├ BaseRenderer ── reads --slide-transition (CSS var)                 │
│   ├ Canvas dims ── reads --canvas-w/h/aspect (from signage.resolution) │
│   └ ResolutionSelect ─ deleted; replaced by registry-driven select     │
└────────────────────────────────────────────────────────────────────────┘
```

**핵심 원칙**:
1. **단일 진실 출처**: SQLite settings (key별로 JSON)
2. **OPTION_REGISTRY가 폼 + 타입 + 기본값의 단일 소스**
3. **TS 소비**: `useOption<T>(key)` 훅 (store 구독)
4. **CSS 소비**: `--slide-padding-y`, `--slide-transition` CSS vars (DisplayCssVarBridge 확장)
5. **변경 전파**: setOption → settings API → SSE settings.changed → 전 클라이언트 갱신

### 1.2 Plan FR 매핑

| Plan FR | Design 모듈 |
|---------|------------|
| FR-1 레이아웃 640px | M3 RightPanel + page.module.css |
| FR-2 RightPanel 구성 | M3 RightPanel.tsx |
| FR-3,4 PlaybackControls 항상 표시 + disabled + 확대 | M4 |
| FR-5 OperationOptionsPanel registry 기반 | M1+M2 |
| FR-6 4개 옵션 | M1 registry |
| FR-7 SSE 동기 | 기존 SseBridge 재사용 |
| FR-8 slide.padding 적용 | M5 paddingUtils + TextSlide + RichTextEditor |
| FR-9 slide.transitionSec 적용 | M5 BaseRenderer CSS var |
| FR-10 ResolutionSelect 제거 | M6 |
| FR-11 v1.2.2 무회귀 | 회귀 체크리스트 |

---

## 2. Modules

| Module | Files | Purpose |
|--------|-------|---------|
| **M1: Options Registry + Store** | `lib/options/types.ts`, `lib/options/registry.ts`, `store/useSignageStore.ts`, `hooks/useOption.ts`, `electron/db/seed.ts` | 스키마/타입 + store options 맵 + 훅 + 시드 |
| **M2: OperationOptionsPanel** | `components/OperationOptionsPanel.tsx` (+ .module.css), `components/OptionField.tsx` | registry 순회 → 자동 폼 |
| **M3: RightPanel Layout** | `components/RightPanel.tsx` (+ .module.css), `app/page.tsx`, `app/page.module.css`, `components/Preview.{tsx,module.css}` | 640px 영역 + Preview 슬림화 |
| **M4: PlaybackControls 확대 + 항상 표시** | `components/PlaybackControls.{tsx,module.css}` | always-visible + disabled prop + 사이즈 ↑ |
| **M5: 옵션 소비처** | `components/editors/paddingUtils.ts`, `components/renderers/TextSlide.tsx`, `components/editors/RichTextEditor.tsx`, `components/renderers/BaseRenderer.module.css`, `components/DisplayCssVarBridge.tsx` | slide.padding 적용 + transition CSS var |
| **M6: ResolutionSelect 제거** | `components/ResolutionSelect.tsx` (삭제), `components/Preview.tsx` (헤더에서 제거) | registry 기반 select로 대체 |

---

## 3. Module Details

### 3.1 M1 — Options Registry + Store + Hook

#### 3.1.1 `lib/options/types.ts` (new)

```typescript
// Design Ref: ui-redesign §3.1 — option schema definitions

export type OptionType = 'number' | 'select' | 'boolean';

interface BaseSchema {
  /** Settings key (matches SQLite settings.key + SSE event.key) */
  key: string;
  /** Human-readable label shown in OperationOptionsPanel */
  label: string;
  /** Optional helper text below the field */
  hint?: string;
}

export interface NumberOptionSchema extends BaseSchema {
  type: 'number';
  default: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}

export interface SelectOptionSchema<T = unknown> extends BaseSchema {
  type: 'select';
  default: T;
  options: Array<{ label: string; value: T }>;
}

export interface BooleanOptionSchema extends BaseSchema {
  type: 'boolean';
  default: boolean;
}

export type OptionSchema =
  | NumberOptionSchema
  | SelectOptionSchema<unknown>
  | BooleanOptionSchema;
```

#### 3.1.2 `lib/options/registry.ts` (new)

```typescript
// Design Ref: ui-redesign §3.1.2 — single source of truth for runtime options.
// To add a new operational option: append one entry here. UI auto-renders.

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
```

#### 3.1.3 `store/useSignageStore.ts` (modify)

Add `options` field + actions. Keep existing `resolution` field temporarily as a thin computed value over `options['signage.resolution']` for backward-compat (DisplayCssVarBridge/useDisplayMetrics).

```typescript
// add to SignageState
options: Record<string, unknown>;
getOption: <T>(key: string) => T | undefined;
setOption: (key: string, value: unknown) => Promise<void>;
hydrateAllOptions: () => Promise<void>;
applyOptionSse: (key: string) => Promise<void>;

// Backward-compat: resolution becomes derived
// readonly: resolution = (options['signage.resolution'] as SignageResolution) ?? DEFAULT_RESOLUTION
```

`hydrateAllOptions`:
```typescript
hydrateAllOptions: async () => {
  const next: Record<string, unknown> = {};
  for (const schema of OPTION_REGISTRY) {
    try {
      const { value } = await settingsApi.get<unknown>(schema.key);
      next[schema.key] = value;
    } catch {
      next[schema.key] = schema.default;
    }
  }
  set({ options: next });
},
```

`setOption`:
```typescript
setOption: async (key, value) => {
  const prev = get().options;
  set({ options: { ...prev, [key]: value } });
  try {
    await settingsApi.set(key, value);
  } catch (e) {
    set({ options: prev, error: e instanceof Error ? e.message : 'set-option-failed' });
    throw e;
  }
},
```

`applyOptionSse(key)` re-fetches that single key.

Remove legacy `setResolution` API (replace with `setOption('signage.resolution', value)`).

#### 3.1.4 `hooks/useOption.ts` (new)

```typescript
import { useSignageStore } from '@/store/useSignageStore';
import { getOptionDefault } from '@/lib/options/registry';

export function useOption<T>(key: string): T {
  const stored = useSignageStore((s) => s.options[key]) as T | undefined;
  if (stored !== undefined) return stored;
  const def = getOptionDefault<T>(key);
  // Default must exist in registry; throwing at runtime would be too harsh.
  return def as T;
}
```

#### 3.1.5 `electron/db/seed.ts` (modify)

Seed all 3 option defaults (resolution already seeded — keep idempotent):
```typescript
const DEFAULT_SETTINGS: Array<[string, unknown]> = [
  ['playback.defaultDuration', 5],
  ['ui.theme', 'dark'],
  ['signage.resolution', { w: 5760, h: 1080 }],
  // ui-redesign §3.1.5 — new options
  ['slide.padding', 50],
  ['slide.transitionSec', 0.5],
];
```

### 3.2 M2 — OperationOptionsPanel + OptionField

#### 3.2.1 `components/OptionField.tsx` (new)

```typescript
'use client';
import { useState } from 'react';
import { useSignageStore } from '@/store/useSignageStore';
import { useOption } from '@/hooks/useOption';
import type { OptionSchema } from '@/lib/options/types';
import styles from './OptionField.module.css';

interface Props {
  schema: OptionSchema;
}

export default function OptionField({ schema }: Props) {
  const setOption = useSignageStore((s) => s.setOption);
  const value = useOption<unknown>(schema.key);
  const [busy, setBusy] = useState(false);

  const change = async (next: unknown) => {
    if (busy) return;
    setBusy(true);
    try {
      await setOption(schema.key, next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <label className={styles.row}>
      <span className={styles.label}>{schema.label}</span>
      <span className={styles.input}>
        {renderInput(schema, value, change, busy)}
      </span>
      {schema.hint && <span className={styles.hint}>{schema.hint}</span>}
    </label>
  );
}

function renderInput(schema, value, change, busy) {
  switch (schema.type) {
    case 'number':
      return (
        <>
          <input type="number" value={value as number} min={schema.min}
                 max={schema.max} step={schema.step ?? 1} disabled={busy}
                 onChange={(e) => change(Number(e.target.value))} />
          {schema.unit && <span className={styles.unit}>{schema.unit}</span>}
        </>
      );
    case 'select': {
      const selectedIdx = schema.options.findIndex(
        (o) => JSON.stringify(o.value) === JSON.stringify(value)
      );
      return (
        <select disabled={busy} value={selectedIdx}
                onChange={(e) => change(schema.options[Number(e.target.value)].value)}>
          {schema.options.map((o, i) => (
            <option key={i} value={i}>{o.label}</option>
          ))}
        </select>
      );
    }
    case 'boolean':
      return (
        <input type="checkbox" checked={value as boolean} disabled={busy}
               onChange={(e) => change(e.target.checked)} />
      );
  }
}
```

#### 3.2.2 `components/OperationOptionsPanel.tsx` (new)

```typescript
'use client';
import { OPTION_REGISTRY } from '@/lib/options/registry';
import OptionField from './OptionField';
import styles from './OperationOptionsPanel.module.css';

export default function OperationOptionsPanel() {
  return (
    <section className={styles.panel} aria-label="운영 옵션">
      <h3 className={styles.heading}>운영 옵션</h3>
      <div className={styles.fields}>
        {OPTION_REGISTRY.map((schema) => (
          <OptionField key={schema.key} schema={schema} />
        ))}
      </div>
    </section>
  );
}
```

### 3.3 M3 — RightPanel + Layout

#### 3.3.1 `components/RightPanel.tsx` (new)

```typescript
'use client';
import Preview from './Preview';
import PlaybackControls from './PlaybackControls';
import OperationOptionsPanel from './OperationOptionsPanel';
import styles from './RightPanel.module.css';

export default function RightPanel() {
  return (
    <aside className={styles.right}>
      <Preview />
      <PlaybackControls />
      <OperationOptionsPanel />
    </aside>
  );
}
```

#### 3.3.2 `components/RightPanel.module.css` (new)

```css
.right {
  width: 640px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid #333;
  overflow-y: auto;
}
```

#### 3.3.3 `app/page.tsx` (modify)

```tsx
<div className={styles.body}>
  <SlideList />
  <SlideEditor />
  <RightPanel />        {/* ← was <Preview /> */}
</div>
```

#### 3.3.4 `app/page.module.css` (modify)

Body grid stays flex but the new right panel takes 640px. Editor's SlideEditor will naturally shrink because Preview was 320px → now panel is 640.

No structural change needed in page.module.css if SlideEditor uses `flex: 1`. Confirm via grep.

#### 3.3.5 `components/Preview.{tsx,module.css}` (modify)

Strip down to just the preview thumbnail block:
- Remove ResolutionSelect import + usage
- Remove PlaybackControls import + usage (now in RightPanel directly)
- Keep `signage` label + status badge + scaler + guides + meta row
- Width changes from 320 → 100% (fills RightPanel)
- Internal scaler still uses CSS vars (no change)

### 3.4 M4 — PlaybackControls 항상 표시 + Disabled + 확대

#### 3.4.1 `components/PlaybackControls.tsx` (modify)

```tsx
'use client';
import { useEffect, useState } from 'react';
import { usePlaybackStore } from '@/store/usePlaybackStore';
import { useSignageStore } from '@/store/useSignageStore';
import styles from './PlaybackControls.module.css';

export default function PlaybackControls() {
  const slides = useSignageStore((s) => s.slides);
  const signageActive = usePlaybackStore((s) => s.signageActive);
  // ... other state ...

  const disabled = !signageActive || slides.length === 0;
  // Internal helper: all interactive elements receive disabled={disabled}
  // ...
}
```

Move existing logic that was gated by parent (`signageActive ? <PlaybackControls /> : null`) into this component. Render `<div className={`${styles.controls} ${disabled ? styles.disabled : ''}`}>`.

#### 3.4.2 `components/PlaybackControls.module.css` (modify)

```css
.controls {
  display: flex;
  flex-direction: column;
  gap: 12px;        /* was 8 */
  padding: 16px;    /* was 10 */
  background: #0f1525;
  border-top: 1px solid #2a2f45;
  border-bottom: 1px solid #2a2f45;
}

.disabled {
  opacity: 0.5;
  pointer-events: none;       /* prevents accidental clicks; disabled prop handles native focus too */
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.btn {
  width: 56px;        /* was 32 */
  height: 44px;       /* was 28 */
  font-size: 18px;    /* was 12 */
  /* ... */
}

.primary {
  width: 72px;        /* was 40 */
}

.label {
  font-size: 14px;    /* was 11 */
  width: 90px;
}

.slider { flex: 1; }
.numberInput { width: 72px; font-size: 14px; }
.counter { font-size: 13px; }
```

#### 3.4.3 Disabled hint

When disabled, show a one-liner under the button row:
```tsx
{disabled && !slides.length && (
  <span className={styles.disabledHint}>슬라이드를 추가하세요</span>
)}
{disabled && slides.length > 0 && !signageActive && (
  <span className={styles.disabledHint}>"사이니지에 표시"를 누르세요</span>
)}
```

### 3.5 M5 — Option Consumers

#### 3.5.1 `components/editors/paddingUtils.ts` (modify)

Add optional `paddingOverride`:
```typescript
export function calcVerticalPadding(
  fontSize: number,
  displayH: number = DEFAULT_DISPLAY_H,
  paddingOverride?: number
): number {
  if (typeof paddingOverride === 'number') return paddingOverride;
  // existing logic with displayH ...
}

export function buildFontData(
  displayH: number = DEFAULT_DISPLAY_H,
  paddingOverride?: number
): FontEntry[] {
  if (typeof paddingOverride === 'number') {
    const data: FontEntry[] = [];
    for (let n = 1; n <= 10; n++) {
      const fs = Math.round((displayH - 2 * paddingOverride) / (n * LINE_HEIGHT));
      data.push({ n, fs, pad: paddingOverride });
    }
    return data;
  }
  // existing dynamic logic ...
}
```

#### 3.5.2 `components/renderers/TextSlide.tsx` (modify)

```tsx
const { h: displayH } = useDisplayMetrics();
const slidePadding = useOption<number>('slide.padding');
const verticalPadding = calcVerticalPadding(fontSize, displayH, slidePadding);
```

#### 3.5.3 `components/editors/RichTextEditor.tsx` (modify)

```tsx
const slidePadding = useOption<number>('slide.padding');
const FONT_SIZES = useMemo(
  () => buildFontData(CANVAS_H, slidePadding).map(...),
  [CANVAS_H, slidePadding]
);
const verticalPadding = calcVerticalPadding(currentFontSize, CANVAS_H, slidePadding);
```

#### 3.5.4 `components/DisplayCssVarBridge.tsx` (modify)

Read additional options + write CSS vars:
```typescript
const transitionSec = useOption<number>('slide.transitionSec');
const slidePadding = useOption<number>('slide.padding');

useEffect(() => {
  body.style.setProperty('--canvas-w', `${w}px`);
  body.style.setProperty('--canvas-h', `${h}px`);
  body.style.setProperty('--canvas-aspect', aspectRatio);
  body.style.setProperty('--slide-padding-y', `${slidePadding}px`);
  body.style.setProperty(
    '--slide-transition',
    transitionSec > 0 ? `opacity ${transitionSec}s ease-in-out` : 'none'
  );
}, [w, h, aspectRatio, slidePadding, transitionSec]);
```

#### 3.5.5 `components/renderers/BaseRenderer.module.css` (modify)

```css
.fullscreen {
  width: 100vw;
  height: 100vh;
  /* ... */
  transition: var(--slide-transition, opacity 0.5s ease-in-out);
}
```

### 3.6 M6 — ResolutionSelect 제거

- Delete `components/ResolutionSelect.tsx` + `.module.css`
- Remove from `components/Preview.tsx` import/usage
- The schema-driven select inside OperationOptionsPanel now handles resolution toggling

### 3.7 SseBridge handler (modify)

```typescript
case 'settings.changed':
  // ui-redesign §3.7 — generic option dispatch
  if (OPTION_REGISTRY.some((s) => s.key === event.key)) {
    applyOptionSse(event.key).catch(() => undefined);
  }
  break;
```

Where `applyOptionSse` is `useSignageStore.applyOptionSse(key)` — re-fetches just that key.

---

## 4. Boot / Change Sequences

### 4.1 Boot

```
1. Electron whenReady → bootstrapDatabase (seed 5 defaults)
2. Express + signage window load
3. Editor renderer mounts:
   - useEffect: hydrateSlides + hydratePlayback + hydrateAllOptions
   - hydrateAllOptions: GET each OPTION_REGISTRY key → store.options
   - DisplayCssVarBridge: useOption(...) → body CSS vars set
   - RightPanel: Preview + PlaybackControls(disabled) + OperationOptionsPanel(fields)
4. signage renderer (hidden):
   - Same hydration. signageActive=false.
```

### 4.2 Option change

```
User adjusts slider in OperationOptionsPanel
  → OptionField.onChange(next)
  → store.setOption(key, next)
    a) optimistic: set(options[key] = next)
    b) PUT /api/settings/:key {value:next}
  → server setSetting → SQLite UPSERT + log + eventBus.emit settings.changed
  → SSE broadcasts to all clients
  → editor + signage SseBridge case 'settings.changed':
      if key in registry → applyOptionSse(key) → re-fetch → set(options[key]=server)
  → DisplayCssVarBridge useOption changes → body CSS vars re-set
  → TextSlide/RichTextEditor re-render with new padding
  → BaseRenderer CSS transition re-applied
```

### 4.3 "사이니지에 표시" click

(Same as v1.2.2, no architectural change. PlaybackControls just flips from disabled to enabled when signageActive becomes true via SSE.)

---

## 5. Acceptance / Test Plan

| Plan SC | Test |
|---------|------|
| SC-1 부팅 직후 패널 구성 | RightPanel 표시 + Preview thumbnail + Controls(disabled, 흐림) + OperationOptionsPanel 3개 필드 |
| SC-2 사이니지 표시 → enabled | "사이니지에 표시" 클릭 → Controls opacity 1, 클릭 가능 |
| SC-3 해상도 변경 | OperationOptionsPanel select 1080↔1200 → 캔버스 갱신 |
| SC-4 상하 여백 | number input 50→100 → TextSlide padding 즉시 변경 |
| SC-5 효과 | number input 0→1초 → BaseRenderer 1초 페이드. 0 = 즉시 컷 |
| SC-6 새 옵션 추가 | OPTION_REGISTRY에 1줄 추가 → 자동 노출 (수동 데모) |
| SC-7 재시작 후 유지 | 옵션 변경 → quit → relaunch → 마지막 값 유지 |
| SC-8 v1.2.2 무회귀 | 슬라이드 CRUD, IME, 단축키, 사이니지 토글 정상 |

---

## 6. Risks & Mitigations

| ID | Risk | Mitigation |
|----|------|------------|
| R-1 | RightPanel 640 차지로 SlideEditor 좁아짐 → RTE scale 작음 | RTE scale은 wrapperRef.clientWidth 기반 자동. 시각 검증. 최소 폭 가드 필요 시 SlideEditor min-width 추가. |
| R-2 | OPTION_REGISTRY 변경 시 store hydrate 안 됨 | hydrateAllOptions가 OPTION_REGISTRY를 순회하므로 새 항목 자동 처리. |
| R-3 | 옵션 값 타입 불일치 (DB JSON parse) | OptionField가 schema.type에 맞춰 변환. 디스플레이는 default fallback. |
| R-4 | PlaybackControls disabled가 키보드 단축키도 막아야 하는지 | usePlaybackKeys는 store.signageActive 체크 추가 → off 시 단축키 무효. |
| R-5 | slide.transitionSec=0이 'transition: none'으로 가는지 확인 | DisplayCssVarBridge에서 `transition: none` 분기 명시. |
| R-6 | 기존 ResolutionSelect 사용처 잔존 | grep 삭제 + tsc 강제 검증. |
| R-7 | resolution이 두 곳(`store.resolution` deprecated, `options['signage.resolution']`)에 있어 혼란 | `resolution` getter는 단순히 options[]에서 derive하거나 완전 제거. 후자가 깔끔. useDisplayMetrics를 직접 useOption으로 교체. |

---

## 7. Migration Notes

- **`useSignageStore.resolution` 제거**: useDisplayMetrics가 `useOption<{w,h}>('signage.resolution')`을 직접 호출하도록 변경. 기존 `setResolution` 호출자(ResolutionSelect) 제거.
- **paddingUtils 기본 동작 유지**: paddingOverride 인자가 없으면 v1.2 로직 그대로 → 외부 사용자 없음 (call site는 모두 우리 코드).

---

## 8. Performance

- 옵션 변경 시 발생: settings PUT → SSE → 1 store update → CSS vars 갱신 (4 properties) → consumers re-render (~5 컴포넌트). 총 < 20ms.
- 새 옵션 추가의 성능 코스트: registry 1줄 + 자동 폼 1줄. 런타임 영향 무.

---

## 9. Security

- 신규 attack surface 없음. 모든 옵션이 기존 PUT /api/settings/:key 경유. 옵션 키 화이트리스트는 registry로 enforced (서버는 generic이라 새 키도 받아주지만, 클라이언트는 registry에 없으면 폼에 표시하지 않음).

---

## 10. Open Questions

(Plan에서 모두 해소)

---

## 11. Implementation Guide

### 11.1 Implementation Order

| Step | Action | Files |
|------|--------|-------|
| 1 | `lib/options/types.ts` + `registry.ts` 작성 | (new) |
| 2 | `store/useSignageStore.ts` options 필드 + 액션 + 기존 resolution 정리 | useSignageStore.ts |
| 3 | `hooks/useOption.ts` | (new) |
| 4 | `electron/db/seed.ts` 신규 옵션 default 추가 | seed.ts |
| 5 | `components/OptionField.{tsx,module.css}` | (new) |
| 6 | `components/OperationOptionsPanel.{tsx,module.css}` | (new) |
| 7 | `components/RightPanel.{tsx,module.css}` | (new) |
| 8 | `app/page.tsx` Preview → RightPanel 교체 | app/page.tsx |
| 9 | `components/Preview.tsx` ResolutionSelect 제거, PlaybackControls 분리 | Preview.tsx |
| 10 | `components/Preview.module.css` 320 → 100% | Preview.module.css |
| 11 | `components/PlaybackControls.tsx` always-visible + disabled prop 추가 + 단축키 가드 | PlaybackControls.tsx, usePlaybackKeys.ts |
| 12 | `components/PlaybackControls.module.css` 크기 확대 | PlaybackControls.module.css |
| 13 | `components/DisplayCssVarBridge.tsx` --slide-padding-y, --slide-transition 추가 | DisplayCssVarBridge.tsx |
| 14 | `components/renderers/BaseRenderer.module.css` transition CSS var | BaseRenderer.module.css |
| 15 | `components/editors/paddingUtils.ts` paddingOverride 인자 | paddingUtils.ts |
| 16 | `components/renderers/TextSlide.tsx` useOption slide.padding | TextSlide.tsx |
| 17 | `components/editors/RichTextEditor.tsx` useOption slide.padding | RichTextEditor.tsx |
| 18 | `components/SseBridge.tsx` 옵션 일반 핸들러 | SseBridge.tsx |
| 19 | `components/ResolutionSelect.{tsx,module.css}` 삭제 | (delete) |
| 20 | `hooks/useDisplayMetrics.ts` useOption 사용 | useDisplayMetrics.ts |
| 21 | tsc + 시각 회귀 검증 | — |

### 11.2 Dependency Install

신규 npm 패키지 없음.

### 11.3 Session Guide

#### Module Map

| Scope | Module | LOC est. |
|-------|--------|----------|
| `module-1` | Options Registry + Store + Hook + Seed | ~140 |
| `module-2` | OperationOptionsPanel + OptionField | ~150 |
| `module-3` | RightPanel + Layout | ~80 |
| `module-4` | PlaybackControls 확대 + Disabled | ~80 |
| `module-5` | Option Consumers (paddingUtils, renderers, CssVarBridge) | ~90 |
| `module-6` | ResolutionSelect 제거 + useDisplayMetrics refactor | ~30 |

#### Recommended Session Plan

| Session | Scope | Rationale |
|---------|-------|-----------|
| **Session 1** | `module-1,module-2` | Registry + Store + Panel — 기반 인프라 + UI |
| **Session 2** | `module-3,module-4` | 레이아웃 + Controls 확장 — 시각 변화 확인 가능 |
| **Session 3** | `module-5,module-6` | 옵션 소비처 연결 + 정리 — 모든 옵션 작동 검증 |

#### Run Commands

```bash
/pdca do ui-redesign                                       # 전체
/pdca do ui-redesign --scope module-1,module-2             # 인프라 + UI
/pdca do ui-redesign --scope module-3,module-4             # 레이아웃 + 컨트롤
/pdca do ui-redesign --scope module-5,module-6             # 소비처 + 정리
```

---

## 12. Next Phase

`/pdca do ui-redesign` — Checkpoint 4 (Implementation Approval) 후 구현 시작.
