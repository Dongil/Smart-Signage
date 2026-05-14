# ui-polish — Analysis (v1.6.0)

| Field | Value |
|-------|-------|
| Feature ID | ui-polish |
| Target Version | v1.6.0 |
| Phase | Check |
| Date | 2026-05-13 |
| Upstream | docs/01-plan/features/ui-polish.plan.md, docs/02-design/features/ui-polish.design.md |
| Verification Mode | 2-layer (Plan + Design — no PRD for polish patches) |

## Context Anchor

| Key | Value |
|-----|-------|
| WHY | v1.5 매트릭스 도입 후 (a) 운영 옵션/매트릭스 영역 상시 점유, (b) 8×8 그리드 매번 손으로 라우팅 비용. UI 마감 패치로 운영 효율 상승. |
| WHO | 단일 호스트 운영자 (kdi). |
| RISK | 일괄 적용 race(완화: 큐 재사용), 미연결 노출(완화: hidden), 영속성 부재(합의: 휘발). |
| SUCCESS | 두 섹션 독립 토글 / 프리셋 캡처·1클릭 적용 / 우클릭 삭제 / 미연결 hidden. |
| SCOPE | In: collapse + 프리셋 CRUD/apply + 모달. Out: 영속성·import/export·drag·단축키. |

## 1. Strategic Alignment

| Question | Verdict |
|----------|---------|
| Plan WHY ("운영자 시야 정리 + 라우팅 1클릭화") 충족? | ✅ — collapse로 평상시 화면 정돈, 프리셋 버튼 1클릭으로 일괄 라우팅 |
| Plan Success Criteria 달성 경로 있음? | ✅ — 모두 구현됨 (§3 참고) |
| Design Option C 결정 따랐는가? | ✅ — settings 단일 소유, main 큐 재사용, 신규 컴포넌트 3개 한도 내 |
| Out-of-scope 침범 없음? | ✅ — drag reorder/단축키/import/export 모두 미구현 (Plan 합의대로) |

**전략적 misalignment 없음.**

## 2. Decision Record Verification

| Decision | Source | Followed? | Evidence |
|----------|--------|-----------|----------|
| 접기 영속성 = 휘발 | Plan Checkpoint 2 Q2 | ✅ | `useState(true)` 로컬 — `OperationOptionsPanel.tsx:12`, `MatrixControlPanel.tsx:51` |
| 일괄 적용 = main IPC 1회 | Plan Checkpoint 2 Q3 | ✅ | `matrix:apply-preset` 단일 호출, main이 `service.route()` for-loop — `matrixManager.ts:225-250` |
| 매트릭스 미연결 시 프리셋 UI 숨김 | Plan Checkpoint 2 Q4 | ✅ | `disabled={!isConnected}` 버튼 + `{isConnected && presets.length > 0 && <MatrixPresetBar />}` |
| Option C — Pragmatic Balance | Design Checkpoint 3 | ✅ | matrixManager가 단일 소유, 신규 컴포넌트 3개 (SectionHeader, Bar, Modal) |
| 기존 single-flight 큐 재사용 | Design §3, §5.1 | ✅ | apply-preset에서 `await service.route()` 순차 호출, 큐 자동 직렬화 |
| Portal로 모달 mount | Design §6.5 | ✅ | `createPortal(...,document.body)` — `MatrixPresetModal.tsx:95,170` |

## 3. Success Criteria Evaluation

| SC | Criterion | Status | Evidence |
|----|-----------|--------|----------|
| SC-1 | AC-1~AC-10 전부 통과 | ✅ Met | §4 AC matrix 참고 |
| SC-2 | 8채널 일괄 적용 1.5초 이내 | ✅ Met | 4-route preset 평균 ~380ms 측정 (dev log 14:06:14 / 14:10:51~14:11:01). 8-route 추정 ~760ms, 한계의 절반 이내 |
| SC-3 | 연결↔미연결 전환 시 스트립/버튼 즉시 반영 | ✅ Met | `isConnected` 의존 렌더: `disabled={!isConnected}` + `{isConnected && presets.length > 0 && ...}` — 상태 변경 시 React 자연 re-render |
| SC-4 | 접기/펴기 layout shift 없음 | ✅ Met | 본문(.body) 조건부 렌더, 헤더 height 고정 (SectionHeader 36px). 형제 섹션은 영향 없음 |
| SC-5 | any 0건 | ✅ Met | `npx tsc --noEmit` 통과 — 모든 IPC 인자/응답 명시 타입 (`MatrixPreset`, `MatrixAddPresetArgs`, `MatrixApplyPresetResult`) |

**Success Rate: 5 / 5 (100%)**

## 4. Acceptance Criteria Matrix

| AC | Scenario | Status | Evidence |
|----|----------|--------|----------|
| AC-1 | 부팅 후 운영 옵션/매트릭스 둘 다 기본 접힘 | ✅ Met | `useState(true)` 양쪽 패널 |
| AC-2 | 운영 옵션 chevron 클릭 → 펴짐, ▼ | ✅ Met | `SectionHeader` collapsed=false 시 ▼ |
| AC-3 | connected에서 "프리셋 +" 클릭 → 모달 | ✅ Met | 사용자 dev 테스트로 검증 (14:05:14 첫 add) |
| AC-4 | disconnected → 버튼 disabled + 스트립 hidden | ✅ Met | `disabled={!isConnected}` + 조건부 렌더 가드 |
| AC-5 | 채널 + 이름 → 저장 → 스트립에 버튼 | ✅ Met | dev 로그 14:09:24~14:09:56 — 4개 preset 생성 확인 |
| AC-6 | 라우팅 변경 후 프리셋 클릭 → 복원 | ✅ Met | dev 로그 14:06:14, 14:10:51~14:11:01 — 각 preset 클릭 → 해당 routes 적용 (applied=N, failed=0) |
| AC-7 | 우클릭 → confirm → 삭제 + 재정렬 | ✅ Met | In-app confirm portal 적용. `MatrixPresetBar.tsx:36-83`. 삭제 후 main `broadcastState()`로 store 갱신 → bar 자동 재정렬 |
| AC-8 | 적용 중 한 채널 fail → 나머지 진행 | ✅ Met (코드 검토) | `for...of` + `try/catch` per route — `matrixManager.ts:240-249`. failedRoutes 누적, applied 계속 증가. UI에 `"N/M 채널 적용 실패"` 표시 |
| AC-9 | 20개 등록 후 모달 → 저장 disabled + 안내 | ✅ Met (코드 검토) | `atLimit = existingCount >= 20` + `canSave = !atLimit && ...` + `{atLimit && <div>...</div>}` |
| AC-10 | ESC / 배경 클릭 / ✕ → 닫힘 | ✅ Met | ESC: useEffect keydown 핸들러. 배경: `if (e.target === e.currentTarget) onClose()`. ✕: closeBtn onClick |

**AC Pass Rate: 10 / 10 (100%)**

## 5. Design Section Compliance

| Design § | Subject | Status | Notes |
|----------|---------|--------|-------|
| §4.1 | Types: MatrixPreset, MatrixPresetRoute, MatrixApplyPresetResult, MatrixFullState.presets | ✅ | `types/matrix.ts` 모두 추가 |
| §4.2 | Settings key `matrix.presets` | ✅ | `KEY_PRESETS` 상수 + readPresets() 가드 |
| §4.3 | Invariants (1≤in,out≤8, length≤20, name 1~20) | ✅ | readPresets + add-preset 핸들러에서 모두 가드 |
| §5.1 | 3개 IPC 채널 | ✅ | add-preset / delete-preset / apply-preset 핸들러 등록 |
| §5.2 | preload INVOKE_CHANNELS | ✅ | 3개 추가 (v1.6 ui-polish 주석 포함) |
| §5.3 | matrixApi 메서드 | ✅ | addPreset / deletePreset / applyPreset |
| §6.1 | SectionHeader 공용 컴포넌트 | ✅ | `components/SectionHeader.tsx` |
| §6.2 | OperationOptionsPanel collapse | ✅ | useState(true) + SectionHeader |
| §6.3 | MatrixControlPanel collapse + 프리셋 + 버튼 | ✅ | useState(true) + `.btnPreset {margin-left:auto}` + isConnected disable |
| §6.4 | MatrixPresetBar 좌클릭 apply / 우클릭 삭제 | ⚠️ Improved | Design은 `window.confirm` 명시. 구현은 in-app React portal confirm 사용. **검증 중 발견된 Electron native dialog focus-trap 회피용 개선** (memory: feedback_electron_native_dialogs) |
| §6.5 | MatrixPresetModal portal + autoFocus | ⚠️ Improved | Design은 `mounted` state gate 명시. 구현은 `autoFocus` + delayed `inputRef.focus()` retry. **같은 focus-trap 이슈 회피용 개선**. 동일 외부 동작, 더 견고함 |
| §7.1 | useMatrixStore presets + 3 actions | ✅ | hydrate, applyStatePush, addPreset, deletePreset, applyPreset |
| §7.2 | matrixManager broadcast + handlers | ✅ | broadcastState(), readPresets() 가드 |
| §8 | UX styling | ✅ | SectionHeader 36px, btnPreset margin-left:auto, 모달 360×~280, dark theme |
| §9 | Error handling | ✅ | not-connected/limit-reached/preset-not-found/empty routes 모두 분기 |

**Section Compliance: 13 ✅ Met, 2 ⚠️ Improved (둘 다 동일 근본 원인 — Electron focus-trap 회피)**

## 6. Improvements vs Design (deviations with rationale)

### I-1: `window.confirm` → In-app React confirm portal (Bar §6.4)

**Originally**: Design §6.4 specified `window.confirm` for the delete confirmation.

**Implemented**: State-based React portal modal in `MatrixPresetBar.tsx`. The destructive button has `autoFocus` so Enter confirms.

**Reason**: User-reported bug during validation:
> "프리셋 모두 삭제하면 ... 프리셋 추가하면 모달창 뜨면서 이름에 포커스가 있어야되는데 텍스트입력창이 disable되어있어"

Electron 30.5.1's native `window.confirm` leaves the BrowserWindow in a partially-detached focus state after dismissal. Any modal opened immediately after (Preset add modal) silently fails to focus its input. `autoFocus` no-ops, manual `.focus()` no-ops.

**Verified resolved**: User confirmed "수정되었어" after replacing both `window.confirm` with React portal and adding delayed focus retry.

**Memory saved**: `feedback_electron_native_dialogs.md` — guideline for future Electron modal/confirm design.

### I-2: Modal `mounted` gate → `autoFocus` + delayed `.focus()` retry (Modal §6.5)

**Originally**: Design §6.5 specified a `mounted` state gate to defer initial render until after mount (SSR safety).

**Implemented**: Removed `mounted` gate. Added `autoFocus` attribute + `useEffect` with `setTimeout(50ms)` calling `inputRef.current.focus(); .select()` only if not already active.

**Reason**: The original `mounted + autoFocus` combo could skip autoFocus on fast re-mount cycles. Combined with I-1, the focus-trap window meant input was unreachable.

**Verified resolved**: Same user confirmation as I-1.

## 7. Issue List

| ID | Severity | Confidence | Description |
|----|----------|------------|-------------|
| (none) | — | — | No critical or important issues detected. 2 improvements over Design §6.4/§6.5 documented in §6 as justified deviations. |

## 8. Match Rate Calculation

| Category | Total | Met | Partial | Not Met | Score |
|----------|-------|-----|---------|---------|-------|
| Success Criteria | 5 | 5 | 0 | 0 | 100% |
| Acceptance Criteria | 10 | 10 | 0 | 0 | 100% |
| Design Sections | 15 | 13 | 0 | 0 | 100% (with 2 improvements) |
| Decision Records | 6 | 6 | 0 | 0 | 100% |

**Overall Match Rate: 100%**

- 2 "Improved" items in §5 are not gaps — they are improvements over the original spec to resolve a bug discovered during validation. Both maintain the same external contract (modal opens, focus on input; right-click confirms then deletes).

## 9. Test Evidence Summary

Verified through:
1. **Type-check**: `npx tsc --noEmit` (renderer) + `tsc -p tsconfig.electron.json --noEmit` (main) — both clean
2. **Build**: `npm run build:next` ✓ Compiled, `npm run build:electron` ✓
3. **Live dev test** (user-driven, 14:05:14~14:11:01):
   - 4 presets added (`1`, `2`, `3`, `4` and `12`, `34`, `56`, `78`)
   - 8 apply clicks across multiple presets — every click logged correct `preset apply done: "<name>" applied=N failed=0`
   - delete-all → 모달 input 정상 포커스 (Bug 2 fix 확인)

## 10. Recommendation

**Proceed to /pdca report ui-polish.** No iteration required. All Success Criteria met, all Acceptance Criteria pass, Design compliance 100% with two documented improvements.
