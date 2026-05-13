# Design: 사이니지 해상도 변경 (Signage Resolution Config)

| Field | Value |
|-------|-------|
| Feature key | `signage-resolution` |
| Plan | `docs/01-plan/features/signage-resolution.plan.md` |
| Architecture | **C. Pragmatic Balance** (useDisplayMetrics hook + CSS custom properties) |
| Created | 2026-05-13 |
| Status | Design (Checkpoint 3 confirmed) |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 현장 NV Surround가 5760×1200을 강제하는 디스플레이가 있어 dev(1080) 기준과 출력이 어긋남. WYSIWYG 신뢰 회복. |
| **WHO** | 운영자(호스트 PC, 현장 설치 후 1회 설정) + 원격 LAN 편집자(설정값을 일관되게 본다). |
| **RISK** | (1) 1080 기준 폰트가 1200 전환 시 어색 → paddingUtils 동적화. (2) CSS 하드코딩 9곳 분산 → CSS var 통일. (3) HWPX 임포트 캔버스 동시 변경 필요. |
| **SUCCESS** | 콤보 변경 후 1초 안에 편집/프리뷰/HWPX 미리보기/원격 클라이언트 모두 새 캔버스 비율로 표시되고, 앱 재시작 후에도 선택값 유지. |
| **SCOPE** | 5760×1080 vs 5760×1200 두 옵션만. 폭(5760) 변경, 4K, 임의 해상도 입력은 별도 Plan. |

---

## 1. Overview

### 1.1 핵심 아키텍처

```
┌────────────────────────────────────────────────────────────────────┐
│  SQLite settings.signage.resolution = {w: 5760, h: 1080 | 1200}    │
│                            │                                       │
│              boot          │          PUT /api/settings/:key       │
│                            ▼                                       │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │  useSignageStore.resolution: {w, h}                       │     │
│  │  + setResolution(h)                                       │     │
│  └──────────────────────────────────────────────────────────┘      │
│                            │                                       │
│        ┌───────────────────┼─────────────────────┐                 │
│        ▼                   ▼                     ▼                 │
│  useDisplayMetrics()  DisplayCssVarBridge   ResolutionSelect (UI)  │
│        │              (sets body --canvas-*)                       │
│        ▼                   │                                       │
│  TS hardcoded              ▼                                       │
│  (CANVAS_W/H,         CSS var-based                                │
│   paddingUtils)       (.scaler, .screen, …)                        │
│                                                                    │
│  SSE: settings.changed → SseBridge → store update → CSS vars       │
└────────────────────────────────────────────────────────────────────┘
```

**핵심 원칙**:
1. **단일 진실 출처**: SQLite `signage.resolution` (default 1080)
2. **TS 코드**: `useDisplayMetrics()` 훅으로 `{w, h, aspectRatio}` 구독
3. **CSS 코드**: `--canvas-w`, `--canvas-h`, `--canvas-aspect` 변수만 참조
4. **변경 전파**: store update → useEffect → `document.body.style.setProperty(--canvas-w, ...)`
5. **원격 동기**: 기존 SSE `settings.changed` 이벤트 hook을 활성화

### 1.2 Plan과의 매핑

| Plan FR | Design 모듈 | 비고 |
|---------|------------|------|
| FR-1 (콤보 UI) | M5 ResolutionSelect | Preview 패널 헤더 |
| FR-2 (즉시 갱신) | M2 DisplayCssVarBridge | body CSS var 일괄 update |
| FR-3 (폰트 자동 재계산) | M4 paddingUtils 동적화 + RTE rerender | 함수 인자 추가, RTE setStoredMarks 재실행 |
| FR-4 (미디어 cover) | (별도 변경 불필요) | BaseRenderer 100%/100% 유지 |
| FR-5 (영속 저장) | M1 schema + seed + settingsService 재사용 | 신규 API 없음 |
| FR-6 (SSE 동기화) | M5 SseBridge.settings.changed 핸들러 | 기존 case 활성화 |
| FR-7 (부팅 복원) | M1 store.hydrateSettings + Bootstrapper | useEffect on mount |
| FR-8 (콤보 비활성/UX) | M5 inflight 가드 | 200ms debounce |

---

## 2. Modules

### 2.1 Module Map

| Module | Files | Purpose |
|--------|-------|---------|
| **M1: Settings + Store** | `electron/db/seed.ts`, `lib/api/settings.ts` (new), `store/useSignageStore.ts` | 부팅 시 settings → store hydrate. setResolution 액션. |
| **M2: Display Metrics** | `hooks/useDisplayMetrics.ts` (new), `components/DisplayCssVarBridge.tsx` (new) | 훅 + body CSS 변수 자동 설정 |
| **M3: Canvas Dimension Replacement** | `RichTextEditor.{tsx,module.css}`, `Preview.module.css`, `TextSlide.module.css`, `HwpxPreviewSlide.tsx`, `HwpxImport.module.css` | 5760×1080 하드코딩을 var/훅으로 교체 |
| **M4: Padding Utils Dynamic** | `components/editors/paddingUtils.ts`, `RichTextEditor.tsx` (호출부) | `(fs, h?)` 인자 추가. RTE는 해상도 변경 감지 시 setStoredMarks 재실행. |
| **M5: UI + SSE Sync** | `components/ResolutionSelect.tsx` (new), `components/Preview.tsx`, `components/SseBridge.tsx`, `app/page.tsx`, `app/signage/page.tsx` | 콤보 UI + SSE 핸들러 활성화 |

### 2.2 데이터 모델

```typescript
// store/useSignageStore.ts (추가)
interface SignageState {
  // ... 기존 ...
  resolution: { w: number; h: number };
  hydrateSettings: () => Promise<void>;
  setResolution: (h: number) => Promise<void>;  // w는 5760 고정
  applySettingsSse: () => Promise<void>;        // SSE handler
}
```

```typescript
// lib/api/settings.ts (new — 가벼운 클라이언트 wrapper)
export const settingsApi = {
  get: <T>(key: string) => apiFetch<{ key: string; value: T }>(`/api/settings/${key}`),
  set: (key: string, value: unknown) =>
    apiFetch<{ key: string; value: unknown }>(`/api/settings/${key}`, {
      method: 'PUT',
      body: { value },
    }),
};
```

```typescript
// Settings 키
'signage.resolution': { w: number; h: number }
// 허용 값: { w: 5760, h: 1080 }, { w: 5760, h: 1200 }
// Default (seed): { w: 5760, h: 1080 }
```

### 2.3 SSE Event

기존 `settings.changed` 이벤트 그대로 사용 (`eventBus.emit({ type: 'settings.changed', key })`).
SseBridge에서 case 본문만 작성:

```typescript
case 'settings.changed':
  if (event.key === 'signage.resolution') {
    applySettingsSse();  // store.hydrateSettings()와 동일 동작
  }
  break;
```

---

## 3. Module Details

### 3.1 M1 — Settings + Store

#### 3.1.1 seed.ts 변경

```typescript
const DEFAULT_SETTINGS: Array<[string, unknown]> = [
  ['playback.defaultDuration', 5],
  ['ui.theme', 'dark'],
  ['signage.resolution', { w: 5760, h: 1080 }],  // ← 추가
];
```

#### 3.1.2 store 변경

```typescript
// store/useSignageStore.ts
const DEFAULT_RESOLUTION = { w: 5760, h: 1080 };
const ALLOWED_HEIGHTS = [1080, 1200] as const;
type Height = (typeof ALLOWED_HEIGHTS)[number];

// state 추가
resolution: { w: number; h: number };

// 초기값
resolution: DEFAULT_RESOLUTION,

hydrateSettings: async () => {
  try {
    const { value } = await settingsApi.get<{ w: number; h: number }>('signage.resolution');
    if (value && typeof value.w === 'number' && typeof value.h === 'number') {
      set({ resolution: value });
    }
  } catch {
    // 404 등 — default 유지
  }
},

setResolution: async (h: number) => {
  if (!ALLOWED_HEIGHTS.includes(h as Height)) return;
  const value = { w: 5760, h };
  // optimistic
  const prev = get().resolution;
  set({ resolution: value });
  try {
    await settingsApi.set('signage.resolution', value);
  } catch (e) {
    set({ resolution: prev, error: e instanceof Error ? e.message : 'set-resolution-failed' });
    throw e;
  }
},

applySettingsSse: async () => {
  // SSE re-fetch — server is source of truth
  await get().hydrateSettings();
},
```

### 3.2 M2 — Display Metrics

#### 3.2.1 `hooks/useDisplayMetrics.ts` (new)

```typescript
import { useSignageStore } from '@/store/useSignageStore';

export interface DisplayMetrics {
  w: number;
  h: number;
  aspectRatio: string;       // e.g. "16/3", "24/5"
}

export function useDisplayMetrics(): DisplayMetrics {
  const res = useSignageStore((s) => s.resolution);
  return {
    w: res.w,
    h: res.h,
    aspectRatio: `${res.w} / ${res.h}`,
  };
}
```

#### 3.2.2 `components/DisplayCssVarBridge.tsx` (new)

```typescript
'use client';
import { useEffect } from 'react';
import { useDisplayMetrics } from '@/hooks/useDisplayMetrics';

/**
 * Mounts at the root of every page. Mirrors store resolution into body CSS vars
 * so any stylesheet can read `var(--canvas-w/h/aspect)`.
 */
export default function DisplayCssVarBridge() {
  const { w, h, aspectRatio } = useDisplayMetrics();
  useEffect(() => {
    const body = document.body;
    body.style.setProperty('--canvas-w', `${w}px`);
    body.style.setProperty('--canvas-h', `${h}px`);
    body.style.setProperty('--canvas-aspect', aspectRatio);
  }, [w, h, aspectRatio]);
  return null;
}
```

### 3.3 M3 — Canvas Dimension Replacement

#### 3.3.1 CSS 교체 매핑

| File | 변경 전 | 변경 후 |
|------|---------|--------|
| `Preview.module.css` `.scaler` | `width: 5760px; height: 1080px;` | `width: var(--canvas-w); height: var(--canvas-h);` |
| `Preview.module.css` `.guides` | `width: 5760px; height: 1080px;` | `width: var(--canvas-w); height: var(--canvas-h);` |
| `Preview.module.css` `.screen` | `aspect-ratio: 16 / 3;` | `aspect-ratio: var(--canvas-aspect);` |
| `Preview.module.css` `.screenEmpty` | `aspect-ratio: 16 / 3;` | `aspect-ratio: var(--canvas-aspect);` |
| `TextSlide.module.css` | `width: 5760px; height: 1080px;` | `width: var(--canvas-w); height: var(--canvas-h);` |
| `RichTextEditor.module.css` (4곳) | `width: 5760px; height: 1080px;` | `width: var(--canvas-w); height: var(--canvas-h);` |
| `HwpxImport.module.css` | `width: 5760px; height: 1080px;` | `width: var(--canvas-w); height: var(--canvas-h);` |

#### 3.3.2 TS 상수 교체

```typescript
// RichTextEditor.tsx
// 제거: const CANVAS_W = 5760; const CANVAS_H = 1080;
import { useDisplayMetrics } from '@/hooks/useDisplayMetrics';

// component 내부:
const { w: CANVAS_W, h: CANVAS_H } = useDisplayMetrics();

// scale 계산 (L113-114) — 그대로 작동 (CANVAS_W가 동적)
```

```typescript
// HwpxPreviewSlide.tsx
// 제거: const CANVAS_W = 5760; const CANVAS_H = 1080;
import { useDisplayMetrics } from '@/hooks/useDisplayMetrics';

export default function HwpxPreviewSlide(...) {
  const { w: CANVAS_W, h: CANVAS_H } = useDisplayMetrics();
  // ... 기존 사용처 그대로
}
```

### 3.4 M4 — Padding Utils Dynamic

#### 3.4.1 paddingUtils.ts 변경

```typescript
const LINE_HEIGHT = 1.4;
const DEFAULT_DISPLAY_H = 1080;
const MAX_PAD = 180;
const MIN_PAD = 64;

export interface FontEntry { n: number; fs: number; pad: number; }

/** 동적: displayH 기준으로 FONT_DATA 빌드 */
export function buildFontData(displayH: number = DEFAULT_DISPLAY_H): FontEntry[] {
  const data: FontEntry[] = [];
  for (let n = 1; n <= 10; n++) {
    const pad = Math.round(MAX_PAD - (MAX_PAD - MIN_PAD) * (n - 1) / 9);
    const fs = Math.round((displayH - 2 * pad) / (n * LINE_HEIGHT));
    data.push({ n, fs, pad });
  }
  return data;
}

/** Back-compat: 기존 import 보존 (1080 기준) */
export const FONT_DATA = buildFontData();

export function calcVerticalPadding(fontSize: number, displayH: number = DEFAULT_DISPLAY_H): number {
  const fontData = buildFontData(displayH);
  const exact = fontData.find((d) => d.fs === fontSize);
  if (exact) return exact.pad;

  const sorted = [...fontData].sort((a, b) => a.fs - b.fs);
  if (fontSize <= sorted[0].fs) return sorted[0].pad;
  if (fontSize >= sorted[sorted.length - 1].fs) return sorted[sorted.length - 1].pad;

  for (let i = 0; i < sorted.length - 1; i++) {
    if (fontSize >= sorted[i].fs && fontSize <= sorted[i + 1].fs) {
      const ratio = (fontSize - sorted[i].fs) / (sorted[i + 1].fs - sorted[i].fs);
      return Math.round(sorted[i].pad + (sorted[i + 1].pad - sorted[i].pad) * ratio);
    }
  }
  return Math.round((displayH - fontSize * LINE_HEIGHT) / 2);
}

export function detectFontSize(html: string, displayH: number = DEFAULT_DISPLAY_H): number {
  const match = html.match(/font-size:\s*(\d+)px/);
  if (match) return parseInt(match[1], 10);
  const fontData = buildFontData(displayH);
  return fontData[fontData.length - 1].fs;
}
```

#### 3.4.2 RichTextEditor 변경

```typescript
const { h: CANVAS_H } = useDisplayMetrics();

// FONT_SIZES와 paddingUtils 호출 시 CANVAS_H 전달
const FONT_SIZES = useMemo(
  () => buildFontData(CANVAS_H).map(({ n, fs }) => ({
    value: `${fs}px`,
    label: `${fs}px (${n} Line${n > 1 ? 's' : ''})`,
  })),
  [CANVAS_H]
);

// calcVerticalPadding(fs, CANVAS_H)
// detectFontSize(html, CANVAS_H)
```

#### 3.4.3 RTE 해상도 변경 감지

해상도 변경 시 prev/new fontSize 매핑 + setContent로 재적용:

```typescript
const prevCanvasHRef = useRef(CANVAS_H);
useEffect(() => {
  if (prevCanvasHRef.current !== CANVAS_H && editor) {
    // Same Line number → new fontSize 매핑
    const prevFonts = buildFontData(prevCanvasHRef.current);
    const currentSize = detectFontSize(content, prevCanvasHRef.current);
    const lineMatch = prevFonts.find((f) => f.fs === currentSize);
    if (lineMatch) {
      const newFonts = buildFontData(CANVAS_H);
      const newSize = newFonts.find((f) => f.n === lineMatch.n)?.fs;
      if (newSize) {
        // Apply via setStoredMarks (same pattern as font size button)
        editor.chain().focus().selectAll().setMark('textStyle', { fontSize: `${newSize}px` }).run();
      }
    }
    prevCanvasHRef.current = CANVAS_H;
    setRenderTick((n) => n + 1);
  }
}, [CANVAS_H, editor, content]);
```

> **트레이드오프 노트**: 데이터 자체는 안 건드림(Plan Q-1 결정). 위 코드는 *현재 편집 중*인 슬라이드의 visual만 새 해상도에 맞춤. 다른 슬라이드는 다음에 클릭할 때 자동 재계산되는 자연스러운 흐름.

### 3.5 M5 — UI + SSE Sync

#### 3.5.1 `components/ResolutionSelect.tsx` (new)

```typescript
'use client';
import { useState } from 'react';
import { useSignageStore } from '@/store/useSignageStore';
import styles from './ResolutionSelect.module.css';

const OPTIONS = [
  { label: '5760×1080', h: 1080 },
  { label: '5760×1200', h: 1200 },
];

export default function ResolutionSelect() {
  const resolution = useSignageStore((s) => s.resolution);
  const setResolution = useSignageStore((s) => s.setResolution);
  const [busy, setBusy] = useState(false);

  const onChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const h = parseInt(e.target.value, 10);
    if (busy || h === resolution.h) return;
    setBusy(true);
    try {
      await setResolution(h);
    } finally {
      setBusy(false);
    }
  };

  return (
    <select
      className={styles.select}
      value={resolution.h}
      onChange={onChange}
      disabled={busy}
      aria-label="사이니지 해상도"
    >
      {OPTIONS.map((opt) => (
        <option key={opt.h} value={opt.h}>{opt.label}</option>
      ))}
    </select>
  );
}
```

#### 3.5.2 Preview.tsx 헤더 변경

```tsx
<div className={styles.header}>
  <h3 className={styles.heading}>사이니지</h3>
  <ResolutionSelect />               {/* ← 추가 */}
  <span className={`${styles.status} ${liveClass}`}>{liveLabel}</span>
</div>
```

> Preview 패널 320px 폭이라 헤더 3-column flex 레이아웃: 제목 | 콤보 | 상태배지. CSS 미세 조정 필요.

#### 3.5.3 SseBridge.tsx 활성화

```typescript
const applySettingsSse = useSignageStore((s) => s.applySettingsSse);

case 'settings.changed':
  if (event.key === 'signage.resolution') {
    applySettingsSse().catch(() => undefined);
  }
  break;
```

#### 3.5.4 page 부팅 hydrate

```typescript
// app/page.tsx + app/signage/page.tsx
const hydrateSettings = useSignageStore((s) => s.hydrateSettings);

useEffect(() => {
  installRendererLogger();
  hydrateSlides();
  hydratePlayback();
  hydrateSettings();          // ← 추가
}, [hydrateSlides, hydratePlayback, hydrateSettings]);

return (
  <div className={styles.layout}>
    <DisplayCssVarBridge />     {/* ← 추가 (page 직속) */}
    <SseBridge />
    ...
  </div>
);
```

---

## 4. API & Data Flow

### 4.1 부팅 시퀀스

```
1. Electron whenReady
   → bootstrapDatabase (schema + seed → signage.resolution = {w:5760, h:1080} 시드)
   → HTTP server start

2. Renderer mount
   → app/page.tsx mount
   → useEffect: hydrateSlides() + hydratePlayback() + hydrateSettings()
   → hydrateSettings: GET /api/settings/signage.resolution → store.resolution 갱신
   → DisplayCssVarBridge: useEffect → body.style.setProperty(--canvas-w/h/aspect)
   → 모든 CSS var-based 스타일이 즉시 반영
```

### 4.2 콤보 변경 시퀀스

```
1. User selects 5760×1200
   → ResolutionSelect.onChange(1200)
   → useSignageStore.setResolution(1200):
     a) optimistic: set({ resolution: {w:5760, h:1200} })
     b) PUT /api/settings/signage.resolution { value: {w:5760, h:1200} }

2. Server (Express)
   → setSetting('signage.resolution', {w:5760, h:1200})
   → SQLite UPSERT
   → eventBus.emit({ type:'settings.changed', key:'signage.resolution' })
   → SSE broadcast to all connected clients

3. All clients (host + remote browsers)
   → SseBridge handler: case 'settings.changed' + key match
   → store.applySettingsSse() → re-fetch GET /api/settings/signage.resolution
   → store.resolution updated (idempotent — same value already set on initiator)
   → DisplayCssVarBridge useEffect fires (w/h changed)
   → body CSS vars updated → all CSS reads new value
   → RichTextEditor useDisplayMetrics() returns new h
     → useEffect detects CANVAS_H change → fontSize remap via setStoredMarks
     → setRenderTick → toolbar refresh
```

### 4.3 에러 경로

| 시나리오 | 결과 |
|---------|------|
| settings.get 404 (첫 부팅, 시드 누락) | hydrateSettings catch → default 1080 유지. seed가 정상 동작했는지 main.log로 확인. |
| PUT 실패 (네트워크) | setResolution catch → optimistic 롤백 + error state |
| SSE 끊김 | 재연결 시 hydrateSettings 자동 재호출 (useSseSubscribe 패턴 활용 — onReconnect callback 또는 page mount 시점) |

---

## 5. Acceptance / Test Plan

### 5.1 기능 검증 (Plan SC 매핑)

| Plan SC | Test |
|---------|------|
| SC-1 콤보로 1200 선택 → 편집 캔버스 즉시 변경 | 콤보 클릭 1초 내 RichTextEditor 높이/폰트 변경. F12로 `--canvas-h: 1200px` 확인. |
| SC-2 사이니지 표시 → 새 비율로 풀스크린 | 콤보 1200 → "사이니지에 표시" → 확장 모니터에 1200 비율 출력. |
| SC-3 재시작 후 유지 | 1200 선택 → quit → relaunch → 콤보가 1200으로 시작. |
| SC-4 원격 PC 동기화 | 호스트에서 변경 → LAN PC 브라우저 1초 내 새 비율 반영. |
| SC-5 HWPX 미리보기 동기화 | 1200 상태에서 HWPX 임포트 → 미리보기 캔버스 1200 비율. |
| SC-6 v1.2 기능 무회귀 | 슬라이드 CRUD, 한글 IME, 키보드 단축키, 사이니지 토글 정상. |
| SC-7 스트레스 | 1080↔1200 50회 토글 → 메모리/잔상 없음. |

### 5.2 단위 검증

- `buildFontData(1080)[0].fs === 514` (기존 동작 보존)
- `buildFontData(1200)[0].fs === 600` (1200 기준 새 계산값)
- `calcVerticalPadding(300, 1200) > calcVerticalPadding(300, 1080)` (1200이 더 큰 padding)

### 5.3 시각 회귀 체크리스트

- [ ] Preview 가이드 라인이 1920px / 3840px 위치에 정확히 표시 (1080 모드)
- [ ] Preview 가이드 라인이 1920px / 3840px 위치에 정확히 표시 (1200 모드)
- [ ] 1 Line 모드 텍스트가 캔버스 중앙 (1080 / 1200 둘 다)
- [ ] 10 Lines 모드 텍스트가 캔버스 채움 (1080 / 1200 둘 다)
- [ ] 이미지 슬라이드 cover로 전체 채움
- [ ] 비디오 슬라이드 cover로 전체 채움

---

## 6. Risks & Mitigations

| ID | Risk | Mitigation |
|----|------|------------|
| R-1 | useDisplayMetrics를 import 안 한 컴포넌트가 남아있으면 부분 적용 | grep `5760\|1080`으로 잔존 하드코딩 0개 확인. 분석 단계(`/pdca analyze`)에서 gap-detector가 자동 검출. |
| R-2 | CSS var가 body에 못 도달 (e.g. portal/iframe) | DisplayCssVarBridge가 `body`에 set. portal은 body에 marshal되므로 자연스럽게 상속. iframe은 사용 안 함. |
| R-3 | 콤보 빠른 토글로 PUT race | setResolution에 inflight 가드 + ResolutionSelect `disabled={busy}` |
| R-4 | RTE 폰트 remap이 IME composition 중 동작 → 한글 입력 깨짐 | composition state 체크 후 보류 (v1.2에서 적용된 패턴 재사용) |
| R-5 | seed가 기존 DB(이미 부팅된 환경)에 적용 안 됨 | seed는 idempotent — 키 없을 때만 INSERT. 기존 DB도 안전. |

---

## 7. Performance Notes

- 콤보 변경 시 발생하는 DOM 작업: body inline style 1회, RTE re-render 1회 (50 entries 미만), Preview re-scale 1회 → 16ms 이내
- SSE 페이로드 크기 변화 없음 (`{type:'settings.changed', key:'signage.resolution'}` ≈ 60 bytes)
- 50회 토글 시 누적 리스너 누수 없음 (useEffect cleanup 불필요 — CSS var는 last-write-wins)

---

## 8. Security

- 신규 attack surface 없음 (기존 settings API 재사용)
- 원격 클라이언트가 PUT 가능 → v1.2와 동일한 신뢰 모델 (LAN 내부 신뢰)
- ALLOWED_HEIGHTS 검증으로 잘못된 값 차단

---

## 9. Rollback Plan

1. `git revert <commit>` — 단일 feature commit으로 묶을 예정
2. SQLite `signage.resolution` 키는 그대로 남아도 무해 (코드가 안 읽으면 무시)
3. 마이그레이션 없음 → 데이터 손실 없음

---

## 10. Open Questions

(Plan 단계에서 모두 해소)

---

## 11. Implementation Guide

### 11.1 Implementation Order

| Step | Action | Files |
|------|--------|-------|
| 1 | seed에 `signage.resolution` default 추가 + 빌드 후 새 DB로 재실행 확인 | `electron/db/seed.ts` |
| 2 | `lib/api/settings.ts` wrapper 작성 | `lib/api/settings.ts` |
| 3 | `useSignageStore`에 resolution + 액션 추가 | `store/useSignageStore.ts` |
| 4 | `useDisplayMetrics` 훅 + `DisplayCssVarBridge` 작성 | `hooks/`, `components/` |
| 5 | `app/page.tsx` + `app/signage/page.tsx`에 hydrate + Bridge mount | `app/*` |
| 6 | CSS 7개 파일의 5760/1080/aspect-ratio를 var로 교체 | `*.module.css` |
| 7 | RichTextEditor.tsx CANVAS_W/H 제거 + useDisplayMetrics | `components/editors/RichTextEditor.tsx` |
| 8 | paddingUtils.ts `(fs, h?)` 인자 추가 + 호출부 갱신 | `components/editors/paddingUtils.ts` |
| 9 | RTE 해상도 변경 감지 effect 추가 | `components/editors/RichTextEditor.tsx` |
| 10 | HwpxPreviewSlide.tsx CANVAS_W/H 동적화 | `components/import/HwpxPreviewSlide.tsx` |
| 11 | `ResolutionSelect` 작성 + Preview 헤더에 배치 + CSS 미세 조정 | `components/ResolutionSelect.{tsx,module.css}`, `Preview.{tsx,module.css}` |
| 12 | SseBridge `settings.changed` 활성화 | `components/SseBridge.tsx` |
| 13 | 수동 QA: 1080↔1200 토글, 재시작, 원격 PC, HWPX 임포트 | — |
| 14 | 문서 갱신 (`README.md`, `signage-project-guide.md`) | — |

### 11.2 Dependency Install

신규 npm 패키지 없음.

### 11.3 Session Guide

#### Module Map

| Scope key | Module | Files (대표) | LOC est. |
|-----------|--------|--------------|----------|
| `module-1` | M1 Settings + Store | `seed.ts`, `useSignageStore.ts`, `lib/api/settings.ts` | ~70 |
| `module-2` | M2 Display Metrics | `useDisplayMetrics.ts`, `DisplayCssVarBridge.tsx` | ~40 |
| `module-3` | M3 Canvas Replacement | 7개 CSS + `RichTextEditor.tsx`, `HwpxPreviewSlide.tsx` | ~80 |
| `module-4` | M4 Padding Utils + RTE Effect | `paddingUtils.ts`, `RichTextEditor.tsx` | ~60 |
| `module-5` | M5 UI + SSE | `ResolutionSelect.{tsx,module.css}`, `Preview.tsx`, `SseBridge.tsx`, `app/page.tsx`, `app/signage/page.tsx` | ~80 |

#### Recommended Session Plan

| Session | Scope | Rationale |
|---------|-------|-----------|
| **Session 1** | `module-1,module-2` | DB seed + store + 훅 인프라 — 다른 모듈의 기초 |
| **Session 2** | `module-3` | CSS + TS 캔버스 차원 일괄 교체 — 시각 검증 가능 |
| **Session 3** | `module-4` | paddingUtils 동적화 + RTE remap — 폰트 검증 가능 |
| **Session 4** | `module-5` | UI 콤보 + SSE — End-to-end 통합 |

#### Run Commands

```bash
# Full scope
/pdca do signage-resolution

# Or incremental
/pdca do signage-resolution --scope module-1,module-2
/pdca do signage-resolution --scope module-3
/pdca do signage-resolution --scope module-4
/pdca do signage-resolution --scope module-5
```

---

## 12. Next Phase

`/pdca do signage-resolution` — Checkpoint 4 (Implementation Approval) 후 구현 시작.
