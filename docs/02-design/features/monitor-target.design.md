# monitor-target — Design (v1.7.0)

| Field | Value |
|-------|-------|
| Feature ID | monitor-target |
| Target Version | v1.7.0 |
| Created | 2026-05-27 |
| Phase | Design |
| Selected Architecture | **Option C — Pragmatic Balance** |
| Predecessor | v1.6.0 ui-polish |

## Context Anchor

| Key | Value |
|-----|-------|
| WHY | NVIDIA Surround가 운영 중 종종 해제되어 OS가 3개의 1920×1080 모니터를 따로 보고, 현재 자동 선택은 그중 한 장에 3타일을 압축 표시한다. v1.7은 "운영자가 출력 모니터를 명시 지정"하는 통제권을 추가한다. |
| WHO | 단일 호스트 운영자 (kdi). 4 디스플레이 환경, Surround 상태가 임의로 변동. |
| RISK | `display.id` 안정성, Surround on↔off 시 ID 매칭 실패, 모드 전환 시 layout. |
| SUCCESS | Surround off 1920×1080 native 표시 / on 회귀 0 / 폴백 / 핫플러그 추적 / build 클린. |
| SCOPE | In: 옵션 추가, 동적 콤보, placement 분기, 영속화, display 이벤트. Out: 다중 동시 출력, 모니터별 다른 슬라이드. |

## 1. Overview

신규 옵션 `signage.targetDisplayId` (number | null)을 추가하고, **Individual 모드에서만** 운영 옵션 패널에 "출력 모니터" 콤보를 노출한다. 콤보의 항목은 정적 OPTION_REGISTRY가 아닌 런타임의 `screen.getAllDisplays()`에서 채우기 위해 `SelectOptionSchema`에 `optionsProvider?: 'displays'` 옵션 필드를 추가한다.

핵심 데이터 흐름:

```
[user]
  ↓ click combo
[OperationOptionsPanel] -- useDisplays() ----> get-displays IPC --> main: screen API
                       \-- setOption('signage.targetDisplayId', id)
                              ↓
                        [express settings API] → setSetting() → SQLite
                              ↓ eventBus
                              ↓ SSE 'settings.changed'
[useOption hook] <----------- SSE -----------/
       ↓
[useDisplayMetrics] -- mode + target --> tileCount / w / h
       ↓
[SignageRenderer] -- renders 1 or 3 tiles

[main process]
  on eventBus 'settings.changed' (signage.mode OR signage.targetDisplayId)
    → applyPlacement()
  on screen events (display-added/removed/metrics-changed)
    → broadcast 'displays-changed' IPC to editor
    → applyPlacement() if signage visible
```

## 2. Data Model

### 2.1 New settings key

| Key | Type | Default | Persistence |
|-----|------|---------|-------------|
| `signage.targetDisplayId` | `number \| null` | `null` | SQLite `settings` 테이블 (기존 key/value 패턴 그대로) |

마이그레이션 불필요 — 새 row는 첫 저장 시 INSERT.

### 2.2 OptionSchema 확장

`lib/options/types.ts`:

```ts
export interface SelectOptionSchema<T = unknown> extends BaseSchema {
  type: 'select';
  default: T;
  options: Array<{ label: string; value: T }>;
  /** Dynamic runtime options. When set, `options` is treated as a placeholder
   *  and the panel renders entries from the named provider instead. */
  optionsProvider?: 'displays';
  /** If true, the field is rendered only when the gated option's value matches. */
  showWhen?: { key: string; equals: unknown };
}
```

두 신규 필드는 모두 optional → 기존 OPTION_REGISTRY entry는 영향 없음.

### 2.3 OPTION_REGISTRY 신규 entry

```ts
{
  key: 'signage.targetDisplayId',
  type: 'select',
  label: '출력 모니터',
  hint: '개별모드일 때 출력할 모니터를 지정',
  default: null,
  options: [
    { label: '자동 — 첫 확장 모니터', value: null },
  ],
  optionsProvider: 'displays',
  showWhen: { key: 'signage.mode', equals: 'individual' },
}
```

런타임에 OptionField가 `optionsProvider === 'displays'`인 경우 `[{ label: '자동...', value: null }, ...displays.map(d => ({ label, value: d.id }))]` 로 옵션을 합성.

## 3. Module Map

### 3.1 Module 1 — Schema & Types (Renderer)

**Files**:
- `lib/options/types.ts` (M) — `optionsProvider`, `showWhen` 옵셔널 필드 추가
- `lib/options/registry.ts` (M) — `signage.targetDisplayId` entry 추가

**Acceptance**: 기존 옵션 4개 동작 회귀 0. tsc 통과.

### 3.2 Module 2 — Main Process (Placement)

**Files**:
- `electron/main.ts` (M):
  - 새 helper `function getTargetDisplay(): Display | null` — settings에서 mode+targetId 읽고 분기. mode='surround' or targetId=null → 기존 `getSecondaryDisplay()` 호출. mode='individual' + targetId valid → 해당 디스플레이. stale → 폴백 + warn.
  - `placeSignageOnSecondary()` 내부에서 `getSecondaryDisplay()` 대신 `getTargetDisplay()` 사용.
  - `applyPlacement()` — 외부에서 호출 가능한 trigger 함수. signage visible이면 즉시 이동, 아니면 다음 show까지 대기.
  - `screen.on('display-added' | 'display-removed' | 'display-metrics-changed', () => { broadcastDisplays(); applyPlacement(); })`
  - `eventBus.on(...)` subscribe (settings.changed 이벤트, key가 mode/targetDisplayId일 때만 `applyPlacement()`)
  - `broadcastDisplays()` — editor webContents에 `displays-changed` 이벤트 전송

**Settings 읽기**: 기존 `settingsService.getSetting()` 사용 (DB direct). main.ts에서 import.

**Acceptance**:
- AC-01, AC-02 (Surround on/off 기존 동작) 회귀 없음
- AC-03 (개별 + target) 동작
- AC-05 (stale ID) 폴백 + 로그
- AC-06, AC-07 (핫플러그) 자동 반응

### 3.3 Module 3 — IPC & Events (Bridge)

**Files**:
- `electron/preload.ts` (M):
  - LISTEN_CHANNELS에 `'displays-changed'` 추가
- (선택) `electron/main.ts`의 `get-displays` 핸들러는 현행 유지 (이미 id/label/bounds/isPrimary 반환 중)

**Acceptance**: preload contextBridge로 `onDisplaysChanged(cb)` 노출, leak 없는 unsubscribe 패턴 유지.

### 3.4 Module 4 — Renderer Hook (useDisplays)

**Files**:
- `hooks/useDisplays.ts` (C) — 신규
  - 초기 `get-displays` IPC 호출
  - `onDisplaysChanged` 이벤트 구독 → 재조회
  - 반환: `{ displays: DisplayInfo[], isPrimary: (id) => boolean }`
- `types/display.ts` (C, 작음) 또는 `hooks/useDisplays.ts` 내부 타입:
  - `interface DisplayInfo { id: number; label: string; bounds: {x,y,width,height}; isPrimary: boolean; }`

**Acceptance**: 디스플레이 추가/제거 시 hook의 displays가 1초 이내 갱신.

### 3.5 Module 5 — OptionField 확장

**Files**:
- `components/OptionField.tsx` (M):
  - `SelectInput`에 schema의 `optionsProvider`/`showWhen` 처리 분기
  - `optionsProvider === 'displays'` → `useDisplays()` 호출, schema.options와 합성
  - `showWhen` 조건이 false면 OptionField 자체가 null 반환 (조건부 렌더)
- `hooks/useOption.ts` 변경 불필요 (이미 generic)

**렌더 합성 규칙**:
- Base: `schema.options` (보통 `[{ label: '자동', value: null }]`)
- Append: `displays.filter(d => !d.isPrimary).map(d => ({ label: formatDisplayLabel(d), value: d.id }))`
- formatDisplayLabel: `"${d.label || 'Display'} (${d.bounds.width}×${d.bounds.height})"` — 사용자 식별 용이성 우선

**Acceptance**:
- mode='surround'일 때 콤보 비표시 (showWhen 작동)
- mode='individual'일 때 콤보 표시 + 동적 항목 갱신
- 선택 → setOption 호출 → SSE round-trip 후 값 반영

### 3.6 Module 6 — Display Metrics

**Files**:
- `hooks/useDisplayMetrics.ts` (M):
  - mode + targetDisplayId 둘 다 useOption
  - mode='individual' + targetId !== null → `tileCount = 1`, `w = 1920` (또는 res.w를 그대로 두되 tile=1 적용)
  - mode='individual' + targetId === null → 현재 동작 유지 (tileCount=3, w=1920)
  - mode='surround' → 변경 없음 (tileCount=1, w=5760)

**Acceptance**: SignageRenderer는 변경 없이 분기 결과만 받아 적절히 렌더 (line 162 `tileCount <= 1` 기존 분기 사용).

### 3.7 Module 7 — Manual & Version Bump

**Files**:
- `package.json` (M) — version 1.6.0 → 1.7.0
- `docs/manuals/quick-start.html` (M) — "출력 모니터" 옵션 항목 1줄 추가
- `docs/manuals/detailed.html` (M) — Individual 모드 + 모니터 지정 절차 추가 (선택)

**Acceptance**: PDF는 do 단계 후 재생성 (do의 별도 step).

## 4. Sequence Diagrams

### 4.1 옵션 변경 → placement 이동

```
User           OperationOptionsPanel    Express(settings)    SQLite    eventBus    main.ts        signageWin
 │ select combo │                       │                     │         │           │              │
 │─────────────►│                       │                     │         │           │              │
 │              │ setOption('targetId', 2)                    │         │           │              │
 │              │──────PUT /settings/key/value────────────────►         │           │              │
 │              │                       │ setSetting()         │         │           │              │
 │              │                       │─────────────────────►UPDATE   │           │              │
 │              │                       │                     │ emit    │           │              │
 │              │                       │                     │────────►│           │              │
 │              │                       │                     │         │ on('settings.changed')   │
 │              │                       │                     │         │──────────►│              │
 │              │                       │                     │         │           │ applyPlacement()
 │              │                       │                     │         │           │──setBounds──►│
 │              │ SSE 'settings.changed'│                     │         │           │              │
 │              │◄──────────────────────│                     │         │           │              │
 │              │ hydrate option        │                     │         │           │              │
 │ UI updates   │                       │                     │         │           │              │
```

### 4.2 디스플레이 핫플러그

```
OS              main.ts                            preload          OperationOptionsPanel   useDisplays
 │ unplug HDMI   │                                  │                │                       │
 │──────────────►│                                  │                │                       │
 │               │ screen.on('display-removed')     │                │                       │
 │               │  ├─ broadcast 'displays-changed' ►                │                       │
 │               │  │                                │ event          │                       │
 │               │  │                                │───────────────►│                       │
 │               │  │                                │                │ trigger refetch       │
 │               │  │                                │                │──────────────────────►│
 │               │  │                                │                │                       │ get-displays IPC
 │               │◄──────────────────────────────────────────────────────────────────────────│
 │               │  └─ applyPlacement()              │                │                       │
 │               │     ├─ getSetting(targetId)       │                │                       │
 │               │     ├─ if stale → log.warn        │                │                       │
 │               │     └─ setBounds(fallback)        │                │                       │
```

### 4.3 placement 결정 분기

```
applyPlacement():
  if signageWin not visible → record desired, return
  mode = getSetting('signage.mode') ?? 'surround'
  if mode === 'surround':
      target = getSecondaryDisplay()
  else:  // individual
      targetId = getSetting('signage.targetDisplayId')
      if targetId == null:
          target = getSecondaryDisplay()
      else:
          target = displays.find(d => d.id === targetId)
          if !target or target.isPrimary:
              log.warn('targetDisplayId stale, fallback')
              target = getSecondaryDisplay()
  if !target → return false (no secondary)
  setBounds + fullscreen
```

## 5. Error Handling

| Scenario | Handling | UX |
|----------|----------|-----|
| target ID stale (Surround 토글 등) | 폴백 + log.warn | 시나이지 자동 이동, UI 변화 없음 (다음 선택까지 같은 ID 유지) |
| primary밖에 없음 | 기존 'no-secondary-display' 리턴 | toolbar에 표시 (현행 동작) |
| `get-displays` IPC 실패 | useDisplays catch + 빈 배열 | 콤보 "자동..."만 표시 (선택 가능, 동작 보존) |
| `display-added` 이벤트 누수 | dispose 시 unsubscribe | 메모리 누수 0 |
| setOption 실패 (DB write 오류) | store rollback (기존 패턴) | 콤보 값이 이전 값으로 복원 |

## 6. Security & Performance

- **Security**: 새 IPC 채널은 read-only(`displays-changed` listen). write 권한 추가 없음. settings는 기존 인증 경로 그대로.
- **Performance**:
  - `get-displays`는 cold-call. `displays-changed`는 OS 이벤트 trigger only — polling 없음.
  - `applyPlacement()` 호출 빈도: 옵션 변경 시 1회, display 이벤트 시 1회. setBounds는 ~10ms.
  - Renderer 측 `useDisplays` 재조회는 이벤트 trigger 시점만.
- **Stability**: 기존 `signage.mode` 전환 동작에 변화 없음. 새 코드 경로는 `mode === 'individual' && targetId !== null` 에서만 활성.

## 7. Testing Strategy

자가 검증 항목 (수동):

| Step | Scenario | Expect |
|------|----------|--------|
| 1 | 첫 부팅 | targetDisplayId=null. 콤보는 individual로 전환해야 보임 |
| 2 | mode=surround → 사이니지 표시 | 5760×1080 가상 모니터에 ×3 타일 (Surround on 환경) |
| 3 | mode=individual, targetId=null | 첫 확장 모니터에 ×3 타일 (기존 동작) |
| 4 | mode=individual, targetId=2번 모니터 | 2번 1920×1080에 ×1 (압축 없음) |
| 5 | 표시 중 콤보로 3번 선택 | 즉시 3번 모니터로 이동 |
| 6 | mode을 individual→surround | 콤보 비표시, 5760×1080 가상 모니터로 이동 |
| 7 | 앱 재시작 | 저장된 targetId 복구, 매칭되면 그 모니터로 |
| 8 | 외부에서 모니터 분리 | log.warn + 첫 확장 모니터로 폴백 |
| 9 | tsc --noEmit | 0 errors |
| 10 | npm run dist (dry) | 빌드 클린 |

자동화 테스트는 도입하지 않음 (현 프로젝트 정책).

## 8. Open Decisions Resolved

| Plan Open Q | Resolution |
|-------------|-----------|
| OPTION_REGISTRY에 dynamic 옵션 표현 | `optionsProvider?: 'displays'` 옵셔널 필드. enum 형태로 미래 확장 가능. |
| 콤보 항목 label 형식 | `"${d.label \|\| 'Display'} (${w}×${h})"` |
| 즉시 적용 vs 다음 show | **즉시 적용** (signage visible 시). hidden일 때는 다음 show에 자연 반영. |

## 9. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| `screen.getAllDisplays()` 호출 비용 | OS-level cached 데이터, 매 호출 미미. |
| settings DB read in main process | better-sqlite3는 동기 + 빠름(~1ms). placement 경로에서 매번 읽어도 무해. |
| mode + targetId 옵션 SSE 순서 보장 | 둘 다 settings.changed 단일 이벤트로 처리, 각각 독립적으로 applyPlacement 트리거. 두 번 호출돼도 idempotent. |
| OptionField의 showWhen 평가 | useOption(gate.key)로 reactive 읽기. mode 변경 시 자동 리렌더. |

## 10. Compatibility

| Direction | Behavior |
|-----------|----------|
| v1.6 → v1.7 첫 부팅 | settings에 새 key 없음 → null default → 기존 동작 |
| v1.7 → v1.6 다운그레이드 | settings에 잉여 row 남지만 영향 없음 |
| 기존 DB schema | 변경 없음 (key/value 패턴 그대로) |

## 11. Implementation Guide

### 11.1 Sequence (Recommended)

1. **Module 1** (Schema & Types) — types.ts + registry.ts (5분)
2. **Module 2** (Main Process) — main.ts 분기 + screen 이벤트 (15분)
3. **Module 3** (IPC) — preload.ts 채널 화이트리스트 (3분)
4. **Module 4** (Hook) — useDisplays.ts 신규 (10분)
5. **Module 5** (OptionField) — dynamic select + showWhen (10분)
6. **Module 6** (Metrics) — useDisplayMetrics 분기 (5분)
7. **Module 7** (Manual + version bump) — 최종 단계 (5분)

총 예상: ~55분

### 11.2 Dependency Order

```
Module 1 (types/registry)
   ↓
Module 2 (main process) ──── Module 3 (preload IPC)
   ↓                              ↓
Module 6 (metrics)            Module 4 (useDisplays hook)
                                  ↓
                              Module 5 (OptionField)
                                  ↓
                            Module 7 (manual+version)
```

### 11.3 Session Guide

| Scope key | Modules | Estimated | Note |
|-----------|---------|-----------|------|
| `schema` | 1 | 5분 | 타입/레지스트리만 |
| `main` | 2, 3 | 18분 | 메인 프로세스 + IPC |
| `renderer` | 4, 5, 6 | 25분 | hook + UI + metrics |
| `wrap` | 7 | 5분 | 매뉴얼/버전 |

기본 (no `--scope`)은 전체. 분할 추천: `schema,main` → `renderer` → `wrap`.

### 11.4 Code Comment Convention

| Location | Comment |
|----------|---------|
| `lib/options/types.ts` 새 필드 | `// Design Ref: monitor-target §2.2 — dynamic options & showWhen gate` |
| `lib/options/registry.ts` 새 entry | `// Design Ref: monitor-target §2.3 — targetDisplayId entry` |
| `electron/main.ts` getTargetDisplay | `// Design Ref: monitor-target §3.2 — mode+targetId branching` |
| `electron/main.ts` screen.on listeners | `// Design Ref: monitor-target §3.2 — hot-plug reactive placement` |
| `hooks/useDisplays.ts` | `// Design Ref: monitor-target §3.4 — runtime display enumeration` |
| `components/OptionField.tsx` dynamic select | `// Design Ref: monitor-target §3.5 — provider-driven options` |
| `hooks/useDisplayMetrics.ts` 분기 | `// Design Ref: monitor-target §3.6 — tile=1 when targetId set` |

## 12. File Changes Summary

| File | Change | Module |
|------|--------|--------|
| `lib/options/types.ts` | M | 1 |
| `lib/options/registry.ts` | M | 1 |
| `electron/main.ts` | M | 2 |
| `electron/preload.ts` | M | 3 |
| `hooks/useDisplays.ts` | C | 4 |
| `components/OptionField.tsx` | M | 5 |
| `hooks/useDisplayMetrics.ts` | M | 6 |
| `package.json` | M | 7 |
| `docs/manuals/*.html` | M | 7 |

신규 1, 수정 8. ~260 LOC.

---

**다음 단계**: `/pdca do monitor-target`
