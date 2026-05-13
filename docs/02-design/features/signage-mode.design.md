# Design: v1.4.0 사이니지 모드 (Signage Mode)

| Field | Value |
|-------|-------|
| Feature key | `signage-mode` |
| Plan | `docs/01-plan/features/signage-mode.plan.md` |
| Architecture | **C. Pragmatic Balance** (useDisplayMetrics 확장 + 3 React 인스턴스 + slides.mode 컬럼) |
| Created | 2026-05-13 |
| Target version | v1.4.0 |
| Status | Design (Checkpoint 3 confirmed) |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 매트릭스가 외부 영상으로 모니터 일부 점유 시 5760 슬라이드 잘림 → 모든 모니터에 동일 1920 콘텐츠. |
| **WHO** | 운영자(호스트 PC). |
| **RISK** | slides.mode 컬럼 + 마이그레이션 / 캔버스 폭 동적 / Individual 비디오 3 인스턴스 메모리. |
| **SUCCESS** | 모드 라디오 + SlideList 필터 + 캔버스 1920 전환 + 3 타일링 + 영속 저장. |
| **SCOPE** | 2모드만 (HWPX는 Surround 전용). |

---

## 1. Overview

### 1.1 핵심 아키텍처

```
┌────────────────────────────────────────────────────────────────────────┐
│  Option Registry: signage.mode (radio: 'surround' | 'individual')      │
│                            │                                           │
│                            ▼                                           │
│  useSignageStore.options['signage.mode']                               │
│                            │                                           │
│       ┌────────────────────┼──────────────────────┐                    │
│       ▼                    ▼                      ▼                    │
│  useDisplayMetrics()  Slide filtering         SlideList                │
│  { w, h, aspect,      (controlService +       (frontend filter)        │
│    tileCount, mode }  client store)                                    │
│       │                                                                │
│       ├ effectiveW = mode==='individual' ? 1920 : 5760                 │
│       └ tileCount   = mode==='individual' ? 3 : 1                      │
│                                                                        │
│  Consumers:                                                            │
│   ├ SignageRenderer: tileCount 따라 RendererFactory를 grid로 N번 렌더 │
│   ├ Preview:         동일하게 N tile thumbnail                         │
│   ├ RichTextEditor:  effectiveW로 캔버스 폭 결정 (CSS var 자동 반영)   │
│   ├ HwpxPreviewSlide: effectiveW 따라 (Surround만 사용되긴 함)         │
│   └ DisplayCssVarBridge: --canvas-w를 effectiveW로 set                │
│                                                                        │
│  Data Model:                                                           │
│   slides.mode TEXT NOT NULL DEFAULT 'surround'                         │
│   INDEX (mode, position)                                               │
│   listSlides(mode?) — 선택 필터                                        │
│   controlService.refreshFromSlides() — 현재 모드 settings 읽어 필터    │
└────────────────────────────────────────────────────────────────────────┘
```

**핵심 원칙**:
1. **단일 진실 출처**: `signage.mode` 옵션 (settings 테이블)
2. **단일 useDisplayMetrics 확장**: w/h/tileCount/mode를 한 곳에서 derive
3. **server-side mode awareness**: controlService.refreshFromSlides가 현재 모드 settings를 읽어 listSlides(mode)로 필터링 → currentIndex의 의미가 "현재 모드 슬라이드 안에서의 인덱스"가 됨
4. **client filter mirror**: SlideList도 동일 모드로 필터 표시
5. **3 React 인스턴스 + CSS grid**: SignageRenderer/Preview 둘 다 동일 패턴

### 1.2 Plan FR 매핑

| Plan FR | Design 모듈 |
|---------|------------|
| FR-1 라디오 UI | M3 (registry signage.mode) |
| FR-2 SSE 영속 | 기존 옵션 인프라 재사용 |
| FR-3 mode 컬럼 + 마이그레이션 | M1 |
| FR-4 mode-aware API | M2 |
| FR-5 SlideList 필터 | M5 |
| FR-6 캔버스 폭 동적 | M4 (useDisplayMetrics) |
| FR-7 새 슬라이드 mode 자동 | M5 (store.addSlide) |
| FR-8 사이니지 3 타일링 | M6 (SignageRenderer) |
| FR-9 Preview 3 타일링 | M6 (Preview) |
| FR-10 HWPX Surround 전용 | M7 (Toolbar disable) |
| FR-11 빈 모드 안내 | M5 (SlideList empty state) |
| FR-12 (mode, position) 정렬 | M2 |
| FR-13 reorder mode 경계 | M2 |

---

## 2. Modules

| Module | Files | Purpose |
|--------|-------|---------|
| **M1: Schema + Migration** | `electron/db/schema.sql`, `electron/db/migrations.ts` | slides.mode 컬럼 + 인덱스 + idempotent migration |
| **M2: Backend mode-aware** | `electron/db/slideMapper.ts`, `electron/server/services/slideService.ts`, `electron/server/services/controlService.ts`, `electron/server/routes/slides.ts` | listSlides(mode?), createSlide({mode}), reorder(mode), controlService current-mode 필터 |
| **M3: Options Registry** | `lib/options/registry.ts`, `electron/db/seed.ts` | signage.mode schema + default seed |
| **M4: useDisplayMetrics 확장** | `hooks/useDisplayMetrics.ts`, `components/DisplayCssVarBridge.tsx` | mode/tileCount 필드 + CSS var 갱신 |
| **M5: 클라이언트 필터 + UX** | `types/slide.ts`, `lib/api/slides.ts`, `store/useSignageStore.ts`, `components/SlideList.tsx` | mode 필드 + slide filter + 빈 상태 + addSlide 자동 mode |
| **M6: Tile Rendering** | `components/SignageRenderer.{tsx,module.css}`, `components/Preview.{tsx,module.css}` | CSS grid + N개 RendererFactory 인스턴스 |
| **M7: Toolbar HWPX 가드** | `components/Toolbar.tsx` (or HwpxImport entry) | Individual 모드일 때 import 버튼 disabled + tooltip |

---

## 3. Module Details

### 3.1 M1 — Schema + Migration

#### 3.1.1 `electron/db/schema.sql` (modify)

```sql
CREATE TABLE IF NOT EXISTS slides (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('text', 'image', 'video', 'webpage')),
  -- ui-redesign §3.1 (v1.3)
  mode TEXT NOT NULL DEFAULT 'surround' CHECK(mode IN ('surround', 'individual')),
  title TEXT NOT NULL DEFAULT '',
  ...
);

CREATE INDEX IF NOT EXISTS idx_slides_position ON slides(position);
CREATE INDEX IF NOT EXISTS idx_slides_mode_position ON slides(mode, position);
```

> **Note**: schema.sql은 fresh-install에서만 실행 (`CREATE TABLE IF NOT EXISTS`). 기존 사용자에게는 migrations.ts의 ALTER TABLE을 통해 적용.

#### 3.1.2 `electron/db/migrations.ts` (modify)

```typescript
export const CURRENT_SCHEMA_VERSION = 2;

export function runMigrations(db: Database.Database): void {
  const current = getSchemaVersion(db);

  if (current === 0) {
    // fresh install — schema.sql already created the new column
    setSchemaVersion(db, CURRENT_SCHEMA_VERSION);
    // existing app_meta seed ...
    return;
  }

  if (current < 2) {
    // Design Ref: signage-mode §3.1 — add slides.mode column for v1.4
    addSlideModeColumn(db);
    setSchemaVersion(db, 2);
  }
}

function addSlideModeColumn(db: Database.Database): void {
  // Idempotent: check if column already exists before ALTER.
  const cols = db.prepare("PRAGMA table_info(slides)").all() as { name: string }[];
  const hasMode = cols.some((c) => c.name === 'mode');
  if (!hasMode) {
    db.exec("ALTER TABLE slides ADD COLUMN mode TEXT NOT NULL DEFAULT 'surround'");
  }
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_slides_mode_position ON slides(mode, position)"
  );
}
```

- 트랜잭션 안에서 실행 권장 (db.transaction)
- ALTER TABLE은 SQLite가 NOT NULL + DEFAULT 조합을 받음 → 기존 행은 DEFAULT 'surround'로 backfill
- idempotent: 이미 컬럼 있으면 skip

### 3.2 M2 — Backend mode-aware

#### 3.2.1 `electron/db/slideMapper.ts` (modify)

추가 매핑: `mode` 컬럼 ↔ TS `Slide.mode`

```typescript
export type SignageMode = 'surround' | 'individual';

export function rowToSlide(row: SlideRow): Slide {
  return {
    id: row.id,
    type: row.type,
    mode: row.mode as SignageMode,  // ← 추가
    title: row.title,
    ...
  };
}

export function slidePayloadToRow(payload, position): SlideRow {
  return {
    ...,
    mode: payload.mode ?? 'surround',  // ← default
  };
}
```

#### 3.2.2 `electron/server/services/slideService.ts` (modify)

```typescript
export function listSlides(mode?: SignageMode): Slide[] {
  if (mode) {
    return db
      .prepare('SELECT * FROM slides WHERE mode = ? ORDER BY position ASC')
      .all(mode)
      .map(rowToSlide);
  }
  // mode 인자 없으면 전체 (admin/debug용 — 일반적으로는 mode 지정)
  return db
    .prepare('SELECT * FROM slides ORDER BY mode ASC, position ASC')
    .all()
    .map(rowToSlide);
}

export function createSlide(payload: CreateSlidePayload): Slide {
  const mode = payload.mode ?? 'surround';
  // position: 현재 모드 안에서 max+1
  const maxRow = db
    .prepare('SELECT MAX(position) as max FROM slides WHERE mode = ?')
    .get(mode) as { max: number | null };
  const position = (maxRow.max ?? -1) + 1;
  // ... insert with mode + position
}

export function reorderSlides(mode: SignageMode, orderedIds: string[]): Slide[] {
  // Validate all ids belong to this mode; update positions atomically.
  const tx = db.transaction((ids: string[]) => {
    const upd = db.prepare('UPDATE slides SET position = ?, updated_at = ? WHERE id = ? AND mode = ?');
    ids.forEach((id, idx) => upd.run(idx, now(), id, mode));
  });
  tx(orderedIds);
  return listSlides(mode);
}
```

#### 3.2.3 `electron/server/services/controlService.ts` (modify)

`refreshFromSlides`가 현재 모드를 settings에서 읽어 필터:

```typescript
function refreshFromSlides(): void {
  const mode = getSetting<SignageMode>('signage.mode') ?? 'surround';
  const slides = listSlides(mode);
  state.totalSlides = slides.length;
  if (state.currentIndex >= slides.length) {
    state.currentIndex = Math.max(0, slides.length - 1);
  }
  const slide = slides[state.currentIndex];
  state.duration = slide?.duration ?? state.duration;
}
```

**Mode change SSE handler**: settings.changed 이벤트로 mode가 변경되면 currentIndex가 새 모드 범위 밖일 수 있음. eventBus 리스너 등록:

```typescript
eventBus.on((event) => {
  if (event.type === 'settings.changed' && event.key === 'signage.mode') {
    state.currentIndex = 0;
    state.isPlaying = false;
    commit();
  }
});
```

#### 3.2.4 `electron/server/routes/slides.ts` (modify)

```typescript
slidesRouter.get('/', (req, res) => {
  const mode = req.query.mode as SignageMode | undefined;
  res.json({ slides: listSlides(mode) });
});

slidesRouter.post('/', (req, res) => {
  // body 에 mode 포함 (옵션, default 'surround')
  // ...
});

slidesRouter.post('/reorder', (req, res) => {
  const { mode, ids } = req.body;
  res.json({ slides: reorderSlides(mode, ids) });
});
```

### 3.3 M3 — Options Registry

#### 3.3.1 `lib/options/registry.ts` (modify)

```typescript
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
  // signage-mode §3.3 — 신규 옵션 (해상도 바로 다음 순서)
  {
    key: 'signage.mode',
    type: 'select',
    label: '사이니지 모드',
    hint: '서라운드: 5760 전체 슬라이드 / 개별: 1920 슬라이드 3번 반복',
    default: 'surround',
    options: [
      { label: '서라운드', value: 'surround' },
      { label: '개별', value: 'individual' },
    ],
  },
  // slide.padding, slide.transitionSec ...
];
```

> **Note**: OptionSchema는 현재 type: 'select' | 'number' | 'boolean'. radio 별도 타입을 만들지 않고 select으로 처리 (2 옵션이므로 select UX도 적절). 향후 radio variant이 필요하면 schema에 `variant: 'radio'` 추가.

#### 3.3.2 `electron/db/seed.ts` (modify)

```typescript
const DEFAULT_SETTINGS: Array<[string, unknown]> = [
  // ... existing ...
  ['signage.mode', 'surround'],
];
```

### 3.4 M4 — useDisplayMetrics 확장

#### 3.4.1 `hooks/useDisplayMetrics.ts` (modify)

```typescript
import { useOption } from './useOption';

export type SignageMode = 'surround' | 'individual';

export interface DisplayMetrics {
  /** Effective single-tile canvas width (5760 surround / 1920 individual). */
  w: number;
  /** Canvas height (option signage.resolution.h). */
  h: number;
  aspectRatio: string;
  /** How many copies of the slide fit horizontally on the signage window. */
  tileCount: number;
  mode: SignageMode;
}

export function useDisplayMetrics(): DisplayMetrics {
  const res = useOption<{ w: number; h: number }>('signage.resolution');
  const mode = useOption<SignageMode>('signage.mode');
  const tileCount = mode === 'individual' ? 3 : 1;
  const effectiveW = mode === 'individual' ? 1920 : res.w;
  return {
    w: effectiveW,
    h: res.h,
    aspectRatio: `${effectiveW} / ${res.h}`,
    tileCount,
    mode,
  };
}
```

#### 3.4.2 `components/DisplayCssVarBridge.tsx` (modify)

CSS vars are derived from useDisplayMetrics (`w` is already effectiveW). No code change needed — `--canvas-w` will automatically reflect 1920 in Individual mode. Add `--tile-count` for any tile-aware CSS:

```typescript
body.style.setProperty('--canvas-w', `${w}px`);
body.style.setProperty('--canvas-h', `${h}px`);
body.style.setProperty('--canvas-aspect', aspectRatio);
body.style.setProperty('--tile-count', `${tileCount}`);   // ← 추가
body.style.setProperty('--slide-padding-y', `${slidePadding}px`);
body.style.setProperty('--slide-transition', ...);
```

> 결과: RichTextEditor canvas, Preview scaler, TextSlide container 모두 자동으로 1920 폭 적용 (기존 `var(--canvas-w)` 참조하므로).

### 3.5 M5 — 클라이언트 필터 + UX

#### 3.5.1 `types/slide.ts` (modify)

```typescript
export type SignageMode = 'surround' | 'individual';

export interface Slide {
  id: string;
  type: SlideType;
  mode: SignageMode;   // ← 추가
  title: string;
  content: string;
  ...
}
```

#### 3.5.2 `lib/api/slides.ts` (modify)

```typescript
export interface CreateSlidePayload {
  type: SlideType;
  mode?: SignageMode;   // ← 옵션 (생략 시 서버가 'surround')
  title?: string;
  ...
}

export const slidesApi = {
  list: (mode?: SignageMode) =>
    apiFetch<{ slides: Slide[] }>(
      mode ? `/api/slides?mode=${mode}` : '/api/slides'
    ).then((r) => r.slides),
  // ...
  reorder: (mode: SignageMode, ids: string[]) =>
    apiFetch<{ slides: Slide[] }>('/api/slides/reorder', {
      method: 'POST',
      body: { mode, ids },
    }).then((r) => r.slides),
};
```

#### 3.5.3 `store/useSignageStore.ts` (modify)

```typescript
// hydrate now fetches all slides (client filters by mode)
// OR per current mode only — for simplicity, fetch ALL and filter client-side
// since SSE delivers ALL slides on slide.changed anyway

hydrate: async () => {
  const slides = await slidesApi.list();  // all modes
  set({ slides, ... });
},

// Derived: current mode slides
getCurrentModeSlides: () => {
  const mode = get().options['signage.mode'] as SignageMode | undefined;
  return get().slides.filter((s) => s.mode === (mode ?? 'surround'));
},

addSlide: async (payload) => {
  const mode = get().options['signage.mode'] as SignageMode | undefined;
  const created = await slidesApi.create({ ...payload, mode: mode ?? 'surround' });
  set((s) => ({ slides: [...s.slides, created] }));
  return created;
},

reorderSlides: async (orderedIds) => {
  const mode = get().options['signage.mode'] as SignageMode | undefined;
  // server expects only current-mode ids
  const updated = await slidesApi.reorder(mode ?? 'surround', orderedIds);
  // merge: replace current-mode slides with updated, keep other-mode untouched
  set((s) => ({
    slides: [
      ...s.slides.filter((sl) => sl.mode !== (mode ?? 'surround')),
      ...updated,
    ],
  }));
},
```

**SlideList useMemo**:
```typescript
const mode = useOption<SignageMode>('signage.mode');
const visibleSlides = useMemo(
  () => slides.filter((s) => s.mode === mode),
  [slides, mode]
);
```

#### 3.5.4 `components/SlideList.tsx` (modify)

```tsx
{visibleSlides.length === 0 ? (
  <div className={styles.empty}>
    <p>이 모드에 슬라이드가 없습니다.</p>
    <p>아래 "+ 추가" 버튼을 눌러 시작하세요.</p>
  </div>
) : (
  visibleSlides.map((slide, i) => (
    <SlideItem key={slide.id} slide={slide} index={i} />
  ))
)}
```

### 3.6 M6 — Tile Rendering

#### 3.6.1 `components/SignageRenderer.tsx` (modify)

```tsx
const { tileCount } = useDisplayMetrics();

return (
  <div className={styles.container}>
    <div
      className={styles.layer}
      style={{
        backgroundColor: committed.backgroundColor,
        opacity: 1,
        zIndex: 0,
        display: tileCount > 1 ? 'grid' : 'flex',
        gridTemplateColumns: tileCount > 1 ? `repeat(${tileCount}, 1fr)` : undefined,
      }}
    >
      {tileCount > 1 ? (
        Array.from({ length: tileCount }).map((_, i) => (
          <div key={i} className={styles.tile}>
            <RendererFactory slide={committed} onVideoEnd={i === 0 ? handleVideoEnd : undefined} />
          </div>
        ))
      ) : (
        <RendererFactory slide={committed} onVideoEnd={handleVideoEnd} />
      )}
    </div>
    {incoming && (
      <div className={styles.layer} style={{
        ... same tile logic for incoming ...
      }}>
        {/* tile rendering same as committed */}
      </div>
    )}
  </div>
);
```

**비디오 onVideoEnd**: 3 인스턴스 중 첫 번째만 콜백을 발사 (중복 next 방지).

#### 3.6.2 `components/SignageRenderer.module.css` (modify)

```css
.tile {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
```

#### 3.6.3 `components/Preview.tsx` (modify)

```tsx
const { tileCount } = useDisplayMetrics();
// ...

{tileCount > 1 ? (
  <div className={styles.scaler} style={{ display: 'grid', gridTemplateColumns: `repeat(${tileCount}, 1fr)` }}>
    {Array.from({ length: tileCount }).map((_, i) => (
      <div key={i} className={styles.tile}>
        <RendererFactory slide={currentSlide} />
      </div>
    ))}
  </div>
) : (
  <div className={styles.scaler}>
    <RendererFactory slide={currentSlide} />
  </div>
)}
```

> Preview의 scaler는 `width: var(--canvas-w)` 인데, individual 모드에서는 1920이 되어 3 타일이 들어가도 전체 5760으로 보이는 형태가 되어야 함. 해결: scaler를 항상 5760폭으로 고정 (tile count와 별개로). 또는 scaler 폭을 `1920 * tileCount`로 계산.

CSS 변경:
```css
.scaler {
  /* effective canvas may be 1920 but signage window is always 5760
     so the preview should reflect 5760 (=1920×3 in individual). */
  width: calc(var(--canvas-w) * var(--tile-count));
  height: var(--canvas-h);
  transform: scale(0.1056);
  ...
}
```

> Actually wait — `--canvas-w` is now `effectiveW` (1920 in individual). The preview should show full signage window width. Use `var(--canvas-w) * var(--tile-count)` = 1920 * 3 = 5760 ✓.

Same fix for `.guides` and `.canvas` in editor:
- Editor canvas should be just `var(--canvas-w)` (1920 for individual) — single tile editing
- Preview scaler should be `calc(var(--canvas-w) * var(--tile-count))` — full signage view

### 3.7 M7 — Toolbar HWPX 가드

```tsx
const mode = useOption<SignageMode>('signage.mode');
const hwpxDisabled = mode === 'individual';

<button
  disabled={hwpxDisabled}
  title={hwpxDisabled ? 'HWPX 임포트는 서라운드 모드에서만 사용 가능' : 'HWPX 파일 임포트'}
  ...
>
  📄 HWPX
</button>
```

---

## 4. Data Flow Sequences

### 4.1 Mode change

```
User selects '개별' in OperationOptionsPanel
  → OptionField.onChange → setOption('signage.mode', 'individual')
  → settingsApi.set → server setSetting
  → eventBus.emit settings.changed (key='signage.mode')
  → controlService listener: state.currentIndex=0, isPlaying=false, commit()
  → SSE control.changed + settings.changed broadcast

Editor receives:
  → SseBridge: applyOption('signage.mode') → store.options updated
  → useDisplayMetrics returns { w:1920, tileCount:3, mode:'individual' }
  → DisplayCssVarBridge updates body --canvas-w=1920, --tile-count=3
  → RichTextEditor canvas reflows to 1920 (CSS var-based)
  → Preview scaler reflows to 5760 (= 1920×3)
  → SignageRenderer (signage page) re-renders with 3 tiles
  → SlideList filters: useOption('signage.mode')='individual' → visibleSlides filtered
  → Toolbar HWPX button disabled
```

### 4.2 Add new slide

```
User clicks "+" while mode='individual'
  → SlideList.onAdd → store.addSlide({ type: 'text', mode: 'individual' (auto) })
  → POST /api/slides { mode: 'individual', type:'text', ... }
  → server createSlide: position = max(individual.position)+1, insert with mode='individual'
  → server commit + SSE slide.changed
  → Editor re-fetches slides → store updates → SlideList re-renders
```

### 4.3 Initial migration on existing v1.3 install

```
1. App starts. bootstrapDatabase opens DB.
2. runMigrations(db): current=1, target=2
3. addSlideModeColumn(db): ALTER TABLE slides ADD COLUMN mode TEXT NOT NULL DEFAULT 'surround'
4. setSchemaVersion(db, 2)
5. All existing slides now have mode='surround' (via DEFAULT).
6. Seed runs: signage.mode='surround' added if missing.
7. Boot continues normally — Surround mode is the default, so user sees no UI change initially.
```

---

## 5. Acceptance / Test Plan

| Plan SC | Test |
|---------|------|
| SC-1 모드 라디오 표시 | 운영 옵션 패널에서 사이니지 해상도 아래에 select(라디오-스타일) 보임 |
| SC-2 SlideEditor 1920×h 전환 | mode='individual' 선택 시 RichTextEditor 캔버스가 1920 폭으로 축소 |
| SC-3 새 슬라이드 mode 자동 | individual 모드에서 추가 → DB SELECT * FROM slides WHERE id=... → mode='individual' |
| SC-4 모드별 SlideList 필터 | Surround 슬라이드 3개 + Individual 슬라이드 2개 → 각 모드에서 해당만 보임 |
| SC-5 사이니지 3 타일 | NV Surround 모니터에 1920 슬라이드가 가로 3번 동일 표시 |
| SC-6 Preview 3 타일 썸네일 | 우측 패널 thumbnail 영역에 3개 타일이 5760폭으로 표시 |
| SC-7 재시작 후 유지 | mode + 모드별 slides 모두 유지 |
| SC-8 v1.3 데이터 마이그레이션 | 기존 슬라이드 모두 'surround' 모드로 적재, 데이터 손실 0 |
| SC-9 HWPX 비활성 | mode='individual'일 때 HWPX 버튼 disabled |
| SC-10 v1.3 무회귀 | Surround 모드에서 v1.3 기능 정상 |

---

## 6. Risks & Mitigations

| ID | Risk | Mitigation |
|----|------|------------|
| R-1 | 마이그레이션 실패 | idempotent guard (PRAGMA table_info), DEFAULT 'surround' backfill, 트랜잭션 |
| R-2 | 비디오 3 인스턴스 메모리 | v1.4에선 3 인스턴스 수용. 비디오 슬라이드가 운영에 흔하지 않다면 수용 가능. v1.5에서 canvas 동기화 또는 단일 element + CSS clone 검토. |
| R-3 | 빈 모드 혼란 | SlideList 빈 상태 안내 (FR-11). + 추가 버튼 강조. |
| R-4 | reorder 모드 경계 침범 | server validate mode + filter — 다른 모드 id는 무시. |
| R-5 | useDisplayMetrics 변경 회귀 | 인터페이스 확장만(추가 필드), 기존 w/h/aspectRatio 보존. |
| R-6 | Preview scaler 폭 (var(--canvas-w) * var(--tile-count)) | CSS calc로 명확히. 0.1056 scale은 항상 5760 기준 유지. |
| R-7 | onVideoEnd 3번 발사 | 첫 번째 tile에만 콜백 전달. |
| R-8 | 모드 전환 시 currentIndex가 새 모드 범위 밖 | controlService eventBus 리스너가 0 reset (FR/§3.2.3). |

---

## 7. Migration Notes

- 마이그레이션은 idempotent. 두 번 실행해도 안전.
- 기존 user의 slides 테이블은 ALTER로 backfill — 추가 작업 없음.
- signage.mode 옵션은 seed에 default 'surround'. 기존 settings 테이블에 없으면 추가.
- v1.3 → v1.4 사이의 다운그레이드는 비공식 (slides.mode 컬럼 남아도 무해).

---

## 8. Performance

- 모드 전환: settings PUT → SSE → store → CSS var. <50ms.
- Individual 모드 사이니지 렌더: 텍스트/이미지 3 인스턴스는 가벼움 (<5ms additional). 비디오는 3 인스턴스 디코딩 — GPU 1080p×3 ≈ 부담 ↑ (현장 PC GPU 사양 따라 OK일 수도).
- DB: `(mode, position)` 인덱스로 listSlides(mode) 빠름.

---

## 9. Security

- 신규 attack surface 없음.
- mode 값 server-side enforcement: schema CHECK + service validation (`!['surround','individual'].includes(mode) → 400`).
- 다른 모드 슬라이드를 잘못 조작하는 클라이언트도 server WHERE mode=? 필터로 차단.

---

## 10. Open Questions

(Plan에서 모두 해소)

---

## 11. Implementation Guide

### 11.1 Implementation Order

| Step | Action | Files |
|------|--------|-------|
| 1 | schema.sql에 mode 컬럼 + 인덱스 추가 (fresh-install용) | schema.sql |
| 2 | migrations.ts에 CURRENT_SCHEMA_VERSION=2 + addSlideModeColumn() | migrations.ts |
| 3 | seed에 signage.mode='surround' default | seed.ts |
| 4 | slideMapper에 mode 매핑 | slideMapper.ts |
| 5 | slideService.listSlides(mode?), createSlide, reorder mode-aware | slideService.ts |
| 6 | controlService.refreshFromSlides 모드 필터 + settings.changed 리스너 | controlService.ts |
| 7 | routes/slides.ts 쿼리스트링 mode 파라미터 | routes/slides.ts |
| 8 | registry에 signage.mode schema 추가 | lib/options/registry.ts |
| 9 | useDisplayMetrics 확장 (mode/tileCount/effectiveW) | useDisplayMetrics.ts |
| 10 | DisplayCssVarBridge --tile-count 추가 | DisplayCssVarBridge.tsx |
| 11 | types/slide.ts에 mode 필드 | types/slide.ts |
| 12 | lib/api/slides.ts mode 파라미터 | lib/api/slides.ts |
| 13 | store.addSlide / reorderSlides mode 자동 주입 | store/useSignageStore.ts |
| 14 | SlideList visibleSlides 필터 + 빈 상태 메시지 | components/SlideList.tsx |
| 15 | SignageRenderer 3 타일 렌더 | components/SignageRenderer.{tsx,module.css} |
| 16 | Preview 3 타일 썸네일 + scaler 폭 calc | components/Preview.{tsx,module.css} |
| 17 | Toolbar HWPX 버튼 disabled (individual) | components/Toolbar.tsx |
| 18 | tsc + dev 시각 회귀 검증 | — |

### 11.2 Dependency Install

신규 npm 패키지 없음.

### 11.3 Session Guide

#### Module Map

| Scope | Module | LOC est. |
|-------|--------|----------|
| `module-1` | M1 Schema + Migration | ~60 |
| `module-2` | M2 Backend mode-aware | ~120 |
| `module-3` | M3 Options Registry | ~20 |
| `module-4` | M4 useDisplayMetrics 확장 | ~25 |
| `module-5` | M5 클라이언트 필터 + UX | ~80 |
| `module-6` | M6 Tile Rendering | ~80 |
| `module-7` | M7 Toolbar HWPX 가드 | ~15 |

#### Recommended Session Plan

| Session | Scope | Rationale |
|---------|-------|-----------|
| **Session 1** | `module-1,module-2,module-3` | DB + 백엔드 + 옵션 정의 — 인프라 기반 |
| **Session 2** | `module-4,module-5` | 메트릭스 + 클라이언트 필터 — 편집기 동작 확인 가능 |
| **Session 3** | `module-6,module-7` | 타일 렌더링 + Toolbar — 사이니지 출력 E2E 완성 |

#### Run Commands

```bash
/pdca do signage-mode                                         # 전체 (~400 LOC)
/pdca do signage-mode --scope module-1,module-2,module-3      # 인프라
/pdca do signage-mode --scope module-4,module-5               # 메트릭스 + UI 필터
/pdca do signage-mode --scope module-6,module-7               # 타일 + 마무리
```

---

## 12. Next Phase

`/pdca do signage-mode` — Checkpoint 4 (Implementation Approval) 후 구현 시작.
