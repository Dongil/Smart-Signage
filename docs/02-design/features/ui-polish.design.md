# ui-polish — Design (v1.6.0)

| Field | Value |
|-------|-------|
| Feature ID | ui-polish |
| Target Version | v1.6.0 |
| Created | 2026-05-13 |
| Owner | kdi@xenoglobal.co.kr |
| Phase | Design |
| Selected Architecture | Option C — Pragmatic Balance |
| Predecessor Plan | docs/01-plan/features/ui-polish.plan.md |

## Context Anchor

| Key | Value |
|-----|-------|
| WHY | v1.5 매트릭스 도입 후 (a) 운영 옵션/매트릭스 영역 상시 점유, (b) 8×8 그리드 매번 손으로 라우팅 비용. UI 마감 패치로 운영 효율 상승. |
| WHO | 단일 호스트 운영자 (kdi). 매트릭스를 일상적으로 조작, 한 화면에서 슬라이드/플레이백/매트릭스 동시 운용. |
| RISK | 접기 영속화 부재 (휘발 유지 합의), 일괄 적용 race/오류, 미연결 시 프리셋 노출 혼동. |
| SUCCESS | 두 섹션 독립 토글 / 프리셋 모달이 현재 라우팅 캡처 / 1클릭 일괄 적용 / 우클릭 → 확인 → 재정렬 / 미연결 시 프리셋 UI 숨김. |
| SCOPE | In: collapse, 프리셋 CRUD+apply, 모달, 우클릭 confirm. Out: 영속성 옵션화, 다중 호스트, import/export, drag reorder, 단축키. |

## 1. Overview

본 설계는 **Option C (Pragmatic Balance)** 를 기반으로 한다:

- **Collapse**: 각 패널 내부 React state로 휘발 관리. `SectionHeader` 공용 컴포넌트 1개를 신설해 두 패널 모두 동일 토글 UX 제공.
- **프리셋 저장소**: `settingsService` 의 `matrix.presets` 키 (JSON 배열). `matrixManager` 가 단일 소유.
- **프리셋 적용**: 단일 IPC `matrix:apply-preset(id)`. main이 이미 가진 `Pn8080MatrixService.queue` (single-flight) 위에 routes를 차례로 enqueue. 사용자 직접 클릭과 자연스럽게 직렬화된다.
- **상태 동기화**: `matrix:state` 페이로드에 `presets` 필드 추가. 기존 onState 구독으로 renderer가 즉시 반영.

신규 컴포넌트 3개(`SectionHeader`, `MatrixPresetBar`, `MatrixPresetModal`), 신규 IPC 3개(`matrix:add-preset`, `matrix:delete-preset`, `matrix:apply-preset`), 신규 타입 3개(`MatrixPreset`, `MatrixAddPresetArgs`, `MatrixFullState.presets`).

## 2. Goals / Non-Goals

### Goals
- 운영 옵션·매트릭스 제어 각각 ▼/▶ 토글로 즉시 접/펴짐 (기본 접힘)
- 매트릭스 헤더에 "프리셋 +" 버튼 (미연결 시 disabled)
- 프리셋 추가 모달: 출력 채널 체크박스, 이름, 저장/취소
- 매트릭스 그리드 위 가로 프리셋 버튼 스트립
- 1클릭 적용 / 우클릭 confirm 삭제 + 재정렬
- 미연결 시 프리셋 UI 자동 숨김

### Non-Goals
- 접힘 상태 영속화 (휘발만)
- 프리셋 이름 인라인 편집 (삭제 후 재등록 only)
- drag reorder, 단축키, import/export
- Preview/PlaybackControls collapse

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          RightPanel (renderer)                            │
│                                                                          │
│  ┌──────────────────┐  ┌─────────────────────────────────────────────┐ │
│  │ OperationOptions │  │  MatrixControlPanel                          │ │
│  │  ─ SectionHeader │  │  ─ SectionHeader (제목 + ▼)                   │ │
│  │  ─ (body if !c)  │  │  ─ Header row (IP/Port/연결/●상태/[프리셋+])  │ │
│  │                  │  │  ─ (body if !collapsed)                       │ │
│  │                  │  │     ─ MatrixPresetBar (state==connected)      │ │
│  │                  │  │     ─ 4×8 Grid                                 │ │
│  │                  │  │     ─ Footer                                   │ │
│  └──────────────────┘  └─────────────────────────────────────────────┘ │
│           ▲                            ▲                                  │
│           │                            │                                  │
│         useState                useMatrixStore (presets[])                │
│                                       ▲                                   │
│                                       │ matrix:state push                 │
└───────────────────────────────────────┼───────────────────────────────────┘
                                        │
                                        │ IPC
┌───────────────────────────────────────┼───────────────────────────────────┐
│  electron main                        │                                   │
│                                       ▼                                   │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ matrixManager                                                    │    │
│  │  ─ existing IPC (connect/route/...)                              │    │
│  │  ─ NEW IPC: matrix:add-preset / delete-preset / apply-preset     │    │
│  │  ─ settings: matrix.presets (JSON array)                         │    │
│  │  ─ presets included in matrix:state push                         │    │
│  │           │                              │                       │    │
│  │           ▼ snapshot routes              ▼ enqueue routes        │    │
│  │  ┌──────────────────────────────────────────────────────────┐  │    │
│  │  │ Pn8080MatrixService                                       │  │    │
│  │  │  ─ getState().routes (snapshot for save)                  │  │    │
│  │  │  ─ route(in,out) via single-flight queue (reused)         │  │    │
│  │  └──────────────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
```

### Key flow: Add preset
```
[user] click "프리셋 +"
  → [renderer] modal opens
  → [user] check outputs [2,3,5], name "메인", click 저장
  → [renderer] matrixApi.addPreset("메인", [2,3,5])
  → [main] readPresets() from settings
         + service.getState().routes → snapshot {2:1, 3:1, 5:4}
         + filter to selected outputs → routes = [{in:1,out:2},{in:1,out:3},{in:4,out:5}]
         + presets.push({id, name, routes, createdAt}) → setSetting
         + emit state → safeSend('matrix:state', {...,presets})
  → [renderer] applyStatePush → MatrixPresetBar renders new button
```

### Key flow: Apply preset
```
[user] click 프리셋 버튼 "메인"
  → [renderer] matrixApi.applyPreset(id)
  → [main] readPresets() → find by id
         + for each route in preset.routes:
             await service.route(input, output)   // each enters single-flight queue
         + collect failures; return { ok:true, applied:[...], failed:[...] }
         + onLog for each step
```

### Key flow: Delete preset
```
[user] right-click 프리셋 버튼
  → [renderer] e.preventDefault(); if (confirm(`"name" 삭제?`)) matrixApi.deletePreset(id)
  → [main] presets.filter(p=>p.id!==id) → setSetting → emit state
  → [renderer] applyStatePush → bar re-renders (자동 재정렬)
```

## 4. Data Model

### 4.1 Type additions — `types/matrix.ts`

```ts
export interface MatrixPresetRoute {
  input: number;    // 1..8
  output: number;   // 1..8
}

export interface MatrixPreset {
  id: string;            // nanoid(10)
  name: string;          // <=20 chars, non-empty
  routes: MatrixPresetRoute[];
  createdAt: number;     // Date.now()
}

export interface MatrixAddPresetArgs {
  name: string;
  outputs: number[];     // selected output channels 1..8
}

export interface MatrixApplyPresetResult {
  ok: boolean;
  appliedCount: number;
  failedRoutes: Array<{ route: MatrixPresetRoute; error: string }>;
  error?: string;        // only when ok=false (e.g. preset-not-found)
}

// existing:
export interface MatrixFullState extends MatrixSnapshot {
  aliases: MatrixAliases;
  autoConnect: boolean;
  presets: MatrixPreset[];   // ← NEW
}
```

### 4.2 Settings key

| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `matrix.presets` | `MatrixPreset[]` | `[]` | Persisted preset list |

No SQLite migration required — settings table is key/value JSON, lazy-init on read.

### 4.3 Invariants

- `preset.routes[i].input` ∈ [1,8] and `output` ∈ [1,8]
- `presets` length ≤ 20 (NFR-4)
- `preset.name` length: 1~20 chars after trim
- routes never include `input=0` (filtered at add-time per Plan FR-9 interpretation: 미연결 시 추가 자체 불가)

## 5. IPC Design

### 5.1 New channels

| Channel | Args | Return | Notes |
|---------|------|--------|-------|
| `matrix:add-preset` | `(name: string, outputs: number[])` | `MatrixIpcResult` | Validates name/outputs, snapshots current routes, persists |
| `matrix:delete-preset` | `(id: string)` | `MatrixIpcResult` | Removes by id, no-op if not found |
| `matrix:apply-preset` | `(id: string)` | `MatrixApplyPresetResult` | Sequential route() via service queue |

All three add-preset/delete-preset emit `matrix:state` after persist, so the renderer's existing `onState` updates `presets` automatically.

### 5.2 preload.ts additions

```ts
const INVOKE_CHANNELS = [
  ...existing,
  'matrix:add-preset',
  'matrix:delete-preset',
  'matrix:apply-preset',
];
// ON_CHANNELS unchanged (presets ride matrix:state)
```

### 5.3 lib/api/matrix.ts additions

```ts
export const matrixApi = {
  ...existing,
  addPreset: (name: string, outputs: number[]) =>
    invokeResult('matrix:add-preset', name, outputs),
  deletePreset: (id: string) =>
    invokeResult('matrix:delete-preset', id),
  applyPreset: async (id: string): Promise<MatrixApplyPresetResult> => {
    const api = getApi();
    if (!api) return { ok: false, appliedCount: 0, failedRoutes: [], error: 'not-electron' };
    try {
      return (await api.invoke('matrix:apply-preset', id)) as MatrixApplyPresetResult;
    } catch (e) {
      return { ok: false, appliedCount: 0, failedRoutes: [], error: describeError(e) };
    }
  },
};
```

## 6. Component Design

### 6.1 `<SectionHeader>` (NEW, shared)

```
File: components/SectionHeader.tsx
Props:
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  rightSlot?: React.ReactNode;   // for matrix's IP/포트/연결 row inline
```

Renders: `<header><h3>{title}</h3><div>{rightSlot}</div><button onClick>▼/▶</button></header>`. ARIA: `aria-expanded`, `aria-controls`.

Decision: rightSlot is **not used** in v1.6 — matrix's header IP/Port/연결/상태/프리셋+ row stays inside the panel body as a sibling under SectionHeader. SectionHeader only owns title + chevron. This keeps SectionHeader generic (also reusable for OperationOptions).

### 6.2 `OperationOptionsPanel` (modified)

```tsx
const [collapsed, setCollapsed] = useState(true);   // default 접힘
return (
  <section className={styles.panel}>
    <SectionHeader title="운영 옵션" collapsed={collapsed} onToggle={() => setCollapsed(c=>!c)} />
    {!collapsed && <div className={styles.fields}>...</div>}
  </section>
);
```

Heading 삭제 → SectionHeader 대체.

### 6.3 `MatrixControlPanel` (modified)

```tsx
const [collapsed, setCollapsed] = useState(true);
const presets = useMatrixStore((s) => s.presets);
const [modalOpen, setModalOpen] = useState(false);

return (
  <section className={styles.panel}>
    <SectionHeader title="메트릭스 제어" collapsed={collapsed} onToggle={...} />
    {!collapsed && (
      <>
        <div className={styles.header}>
          {/* existing IP/포트/연결버튼/●상태 */}
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPreset}`}
            onClick={() => setModalOpen(true)}
            disabled={!isConnected}
            title={isConnected ? '프리셋 추가' : '메트릭스 미연결'}
          >
            프리셋 +
          </button>
        </div>

        {isConnected && presets.length > 0 && (
          <MatrixPresetBar presets={presets} />
        )}

        <div className={styles.grid}>...existing 4×8...</div>
        <div className={styles.footer}>...</div>
        {error && ...}
      </>
    )}

    {modalOpen && (
      <MatrixPresetModal
        existingCount={presets.length}
        onClose={() => setModalOpen(false)}
      />
    )}
  </section>
);
```

### 6.4 `<MatrixPresetBar>` (NEW)

```
File: components/MatrixPresetBar.tsx
Props: { presets: MatrixPreset[] }
Behavior:
  - horizontal flex with overflow-x: auto
  - each button: onClick → applyPreset, onContextMenu → confirm + deletePreset
  - hover tooltip: routes summary "in2→out3, in1→out5"
  - disabled while a routing operation is mid-flight? — no, queue handles it
```

```tsx
const apply = useMatrixStore((s) => s.applyPreset);
const remove = useMatrixStore((s) => s.deletePreset);

return (
  <div className={styles.presetBar} role="toolbar" aria-label="프리셋">
    {presets.map((p) => (
      <button
        key={p.id}
        type="button"
        className={styles.presetBtn}
        title={p.routes.map((r) => `in${r.input}→out${r.output}`).join(', ')}
        onClick={() => void apply(p.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          if (confirm(`"${p.name}" 프리셋을 삭제하시겠습니까?`)) {
            void remove(p.id);
          }
        }}
      >
        {p.name}
      </button>
    ))}
  </div>
);
```

### 6.5 `<MatrixPresetModal>` (NEW)

```
File: components/MatrixPresetModal.tsx
Props: { existingCount: number; onClose: () => void }
```

Layout:
```
┌─ 프리셋 추가 ─────────────────────── ✕ ┐
│                                        │
│  이름:  [_______________________]      │
│                                        │
│  출력 채널 선택:                        │
│   ☐ 1  ☐ 2  ☐ 3  ☐ 4                  │
│   ☐ 5  ☐ 6  ☐ 7  ☐ 8                  │
│                                        │
│  (existingCount >= 20 시:               │
│   ⚠ 프리셋은 최대 20개까지 등록 가능)   │
│                                        │
│           [취소]  [저장]                │
└────────────────────────────────────────┘
```

State:
```ts
const [name, setName] = useState('');
const [outputs, setOutputs] = useState<Set<number>>(new Set());
const [submitting, setSubmitting] = useState(false);
const [error, setError] = useState<string|null>(null);

const canSave = name.trim().length > 0
              && outputs.size > 0
              && existingCount < 20
              && !submitting;
```

Interactions:
- 배경(overlay) 클릭 → onClose
- ESC 키 → onClose (useEffect addEventListener)
- 저장: matrixApi.addPreset(name.trim(), [...outputs]) → if ok then onClose; else setError(r.error)

Portal: rendered via `ReactDOM.createPortal` to `document.body` to escape RightPanel scrolling.

## 7. State Management

### 7.1 `useMatrixStore` additions

```ts
interface MatrixStoreState {
  ...existing,
  presets: MatrixPreset[];                              // NEW
  addPreset: (name: string, outputs: number[]) => Promise<MatrixIpcResult>;   // NEW
  deletePreset: (id: string) => Promise<void>;          // NEW
  applyPreset: (id: string) => Promise<void>;           // NEW
}

// hydrate(): now also reads s.presets from matrix:get-state response
// applyStatePush(): now also sets presets: s.presets ?? get().presets
```

`addPreset` returns IpcResult so the modal can show its error inline; `deletePreset` and `applyPreset` only set `error` on failure.

### 7.2 main-side `matrixManager` additions

```ts
const KEY_PRESETS = 'matrix.presets';
const MAX_PRESETS = 20;
const MAX_NAME = 20;

function readPresets(): MatrixPreset[] {
  const v = getSetting<unknown>(KEY_PRESETS);
  if (!Array.isArray(v)) return [];
  return v.filter(isValidPreset);
}

function isValidPreset(p: unknown): p is MatrixPreset { /* shape guard */ }

function broadcastState(): void {
  const snap = service?.getState() ?? defaultSnap();
  safeSend('matrix:state', toFullState(snap));
}

// toFullState now adds: presets: readPresets()
```

IPC handlers:

```ts
ipcMain.handle('matrix:add-preset', async (_e, name: string, outputs: number[]) => {
  if (!service) return { ok:false, error:'service-not-initialized' };
  const cleanName = (name ?? '').trim().slice(0, MAX_NAME);
  if (!cleanName) return { ok:false, error:'name-required' };
  if (!Array.isArray(outputs) || outputs.length === 0)
    return { ok:false, error:'outputs-required' };
  if (service.getState().state !== 'connected')
    return { ok:false, error:'not-connected' };
  const presets = readPresets();
  if (presets.length >= MAX_PRESETS) return { ok:false, error:'limit-reached' };

  const routes = service.getState().routes;
  const snapshot: MatrixPresetRoute[] = outputs
    .filter((o) => Number.isInteger(o) && o >= 1 && o <= 8)
    .map((o) => ({ output: o, input: routes[o] ?? 0 }))
    .filter((r) => r.input >= 1);   // skip unrouted (defensive — connected state shouldn't have these)

  if (snapshot.length === 0) return { ok:false, error:'no-active-routes' };

  presets.push({ id: nanoid(10), name: cleanName, routes: snapshot, createdAt: Date.now() });
  setSetting(KEY_PRESETS, presets);
  broadcastState();
  return { ok: true };
});

ipcMain.handle('matrix:delete-preset', (_e, id: string) => {
  const presets = readPresets().filter((p) => p.id !== id);
  setSetting(KEY_PRESETS, presets);
  broadcastState();
  return { ok: true };
});

ipcMain.handle('matrix:apply-preset', async (_e, id: string): Promise<MatrixApplyPresetResult> => {
  if (!service) return { ok:false, appliedCount:0, failedRoutes:[], error:'service-not-initialized' };
  const preset = readPresets().find((p) => p.id === id);
  if (!preset) return { ok:false, appliedCount:0, failedRoutes:[], error:'preset-not-found' };
  if (service.getState().state !== 'connected')
    return { ok:false, appliedCount:0, failedRoutes:[], error:'not-connected' };

  let applied = 0;
  const failed: MatrixApplyPresetResult['failedRoutes'] = [];
  for (const r of preset.routes) {
    try {
      await service.route(r.input, r.output);
      applied++;
    } catch (e) {
      failed.push({ route: r, error: describeError(e) });
    }
  }
  return { ok: true, appliedCount: applied, failedRoutes: failed };
});
```

## 8. UX / Visual Details

### 8.1 SectionHeader styling

- Height: 36px
- Title left-aligned, chevron right-aligned (▼ expanded / ▶ collapsed)
- Cursor: pointer on entire row; click anywhere in header toggles
- Hover: subtle background tint

### 8.2 프리셋 + 버튼

- Place: matrix header row, **after** `statusLabel`, with `margin-left: auto` so it floats to right
- Color: neutral when enabled, dimmed when disabled (`!isConnected`)
- Label: "프리셋 +" (Korean + "+" sigil per mockup)

### 8.3 MatrixPresetBar styling

- Height: 32px row
- gap: 6px, padding: 6px 4px
- Buttons: pill-style, max-width 120px, ellipsis if name overflows
- overflow-x: auto, no horizontal scrollbar visible until needed
- Empty state: not rendered (per FR-9 hidden when no presets too)

### 8.4 MatrixPresetModal styling

- Overlay: `rgba(0,0,0,0.5)`, z-index 1000, fixed full-viewport
- Card: 360×~280px, centered, rounded 8px, dark theme matching app
- Checkbox grid: 4 cols × 2 rows
- Buttons: 저장 (primary), 취소 (secondary)
- ESC + overlay click + ✕ all close

## 9. Error Handling

| Scenario | Handling |
|----------|----------|
| `not-connected` at add time | Save button disabled in modal; if user bypasses, error toast in modal |
| `limit-reached` (20개 초과) | Save button disabled + 안내 라벨 |
| `not-connected` at apply time | applyPreset returns `ok:false`; store sets `error` for banner |
| `preset-not-found` | Renderer hydrates fresh state, banner shows error |
| Partial apply failure | Log each via existing onLog; banner shows summary if failedRoutes.length > 0: `"3/5 채널 적용 실패"` |
| Settings JSON corrupted | `readPresets()` returns `[]` (try/catch + filter) |

## 10. Testing Strategy

- **Unit (manual)**: `readPresets()` accepts valid, rejects malformed; `addPreset` validates name/outputs/limit.
- **Integration (manual on hardware)**:
  - AC-1~AC-10 from Plan
  - Hot path: 매트릭스 연결 → 일부 채널 라우팅 → 프리셋 저장 → 라우팅 변경 → 프리셋 적용으로 복원
  - Negative: 미연결 상태에서 프리셋 버튼/스트립 숨김 확인
  - Resilience: 적용 중 한 채널 fail 시 나머지 진행 (PN-8080 미연결 케이블 시뮬레이션)
- **Regression**:
  - 기존 single-click route 동작 (선택 input → 출력 클릭)
  - 별칭 inline 편집
  - autoConnect 토글
  - 매트릭스 재연결 시 routes 복원 (refresh 호출)
- **Type check**: `npm run build:electron` + `next build` 둘 다 통과

## 11. Implementation Guide

### 11.1 Order of Implementation

1. **Types** — `types/matrix.ts` 추가 (MatrixPreset, MatrixAddPresetArgs, MatrixApplyPresetResult, MatrixFullState.presets)
2. **Main** — `electron/services/matrixManager.ts` 에 KEY_PRESETS, readPresets, IPC 3개 핸들러, toFullState 확장, broadcastState 헬퍼
3. **Preload** — `electron/preload.ts` INVOKE_CHANNELS에 3개 추가
4. **API** — `lib/api/matrix.ts` addPreset/deletePreset/applyPreset 메서드
5. **Store** — `store/useMatrixStore.ts` presets state + 3 actions + hydrate/applyStatePush 확장
6. **SectionHeader** — 신규 컴포넌트 + CSS module
7. **OperationOptionsPanel** — collapse state + SectionHeader 적용
8. **MatrixPresetModal** — 신규 컴포넌트 + portal + ESC 핸들러
9. **MatrixPresetBar** — 신규 컴포넌트 + contextmenu handler
10. **MatrixControlPanel** — collapse + 프리셋+ 버튼 + bar/modal 통합
11. **CSS** — `MatrixControlPanel.module.css` btnPreset/presetBar/presetBtn, 신규 모듈 CSS 2개
12. **Manual QA** — AC-1~AC-10

### 11.2 Files Touched

**Create (5)**:
- `components/SectionHeader.tsx`
- `components/SectionHeader.module.css`
- `components/MatrixPresetBar.tsx`
- `components/MatrixPresetBar.module.css`
- `components/MatrixPresetModal.tsx`
- `components/MatrixPresetModal.module.css`

**Modify (8)**:
- `types/matrix.ts`
- `electron/services/matrixManager.ts`
- `electron/preload.ts`
- `lib/api/matrix.ts`
- `store/useMatrixStore.ts`
- `components/OperationOptionsPanel.tsx`
- `components/MatrixControlPanel.tsx`
- `components/MatrixControlPanel.module.css`

### 11.3 Session Guide

#### Module Map

| Module Key | Scope | Files | Est. LOC |
|-----------|-------|-------|----------|
| `module-1` | Types + main-side preset IPC | `types/matrix.ts`, `electron/services/matrixManager.ts`, `electron/preload.ts` | ~140 |
| `module-2` | Renderer plumbing (API + store) | `lib/api/matrix.ts`, `store/useMatrixStore.ts` | ~60 |
| `module-3` | SectionHeader + Collapse wiring | `components/SectionHeader.tsx`, `components/SectionHeader.module.css`, `components/OperationOptionsPanel.tsx`, `components/MatrixControlPanel.tsx` (header part) | ~80 |
| `module-4` | Preset UI (bar + modal) | `components/MatrixPresetBar.tsx`, `components/MatrixPresetBar.module.css`, `components/MatrixPresetModal.tsx`, `components/MatrixPresetModal.module.css`, `components/MatrixControlPanel.tsx` (integration), `components/MatrixControlPanel.module.css` (btnPreset) | ~180 |

**Total**: ~460 LOC across 13 file touches. (Plan estimate was 360; this expansion accounts for CSS modules and modal portal.)

#### Recommended Session Plan

| Session | Modules | Goal | Duration |
|---------|---------|------|----------|
| Single (recommended) | module-1 → module-2 → module-3 → module-4 | Full v1.6.0 in one session — order matters because module-4 depends on 1+2+3 | ~2.5h |
| Alt: 2 sessions | S1: module-1 + module-2 / S2: module-3 + module-4 | Useful if interrupted | 1h + 1.5h |

#### Dependency Chain

```
module-1 (main + types)
   ↓
module-2 (renderer plumbing) ──────────────────┐
   ↓                                            ↓
module-3 (collapse, no preset logic)    module-4 (preset UI)
   ↓                                            ↓
       └────── final integration in MatrixControlPanel
```

module-3 and module-4 can run in parallel after module-2, but in single-session it's simpler to do 3 then 4.
