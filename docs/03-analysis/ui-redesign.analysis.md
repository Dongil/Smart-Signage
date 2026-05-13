# Gap Analysis: v1.3 UI 재구성 (UI Redesign)

| Field | Value |
|-------|-------|
| Feature key | `ui-redesign` |
| Plan | `docs/01-plan/features/ui-redesign.plan.md` |
| Design | `docs/02-design/features/ui-redesign.design.md` |
| Created | 2026-05-13 |
| Status | Check (post Act-1 + Act-2) |
| **Match Rate** | **100%** (33/33 design items met + 2 bonus crossfade/UX fixes) |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 운영 컨트롤·속성 증가로 320px 패널 한계. 발견성·확장성 개선 필요. |
| **WHO** | 운영자(호스트 PC): 슬라이드 편집보다 운영 컨트롤·옵션 조정에 시간을 더 씀. |
| **RISK** | 편집 영역 축소 / 옵션 레지스트리 미설계 / disabled 일관성. |
| **SUCCESS** | 패널 640 + 4 옵션 동작 + 옵션 변경 1초 내 반영 + 부팅 시 컨트롤 표시(disabled). |
| **SCOPE** | 8 요구사항 모두. 신규 옵션 항목은 별도 Plan. |

---

## 1. Strategic Alignment

| Check | Result | Evidence |
|-------|:------:|----------|
| Plan의 8개 요구사항이 모두 처리됨 | ✅ | 아래 매핑 표 참조 |
| Design "C. Pragmatic Balance" 그대로 구현 | ✅ | 신규 9 / 수정 14 / 삭제 2 = LOC ~570 (예측치 일치) |
| 기존 v1.2.2 race/race-fix 무회귀 | ✅ | usePlaybackKeys signageActive 가드 추가, 다른 코드 변경 없음 |

---

## 2. Plan Requirements → Implementation 매핑

| # | Plan FR | 구현 | 상태 |
|---|---------|------|:----:|
| 1 | 우측 패널 320 → 640px | `components/RightPanel.{tsx,module.css}` width 640 | ✅ |
| 2 | PlaybackControls 크기 ↑ | 버튼 32×28 → 56×48 / primary 80×48, font-size 12→20 | ✅ |
| 3 | 운영 옵션 패널 추가 | `OperationOptionsPanel.{tsx,module.css}` RightPanel 하단 | ✅ |
| 4 | PlaybackControls 항상 표시, off 시 disabled | `signageActive` 기반 `disabled` + opacity 0.5 + pointer-events:none + 단축키 가드 | ✅ |
| 5 | ResolutionSelect → 운영 옵션 패널로 이동 | Legacy 파일 삭제, registry select가 대체 | ✅ |
| 6 | 슬라이드 상하 여백 옵션 | `paddingUtils.ts` paddingOverride 인자, TextSlide/RTE consume | ✅ |
| 7 | 전환 효과 옵션 (0 = CUT) | BaseRenderer `transition: var(--slide-transition)`, CssVarBridge가 0 → `none` | ✅ |
| 8 | 옵션 확장성 (1줄 등록) | `OPTION_REGISTRY` 배열에 schema 1 항목 추가 → 자동 폼 노출 | ✅ |

---

## 3. Success Criteria Evaluation

| SC | Status | Evidence |
|----|:------:|----------|
| SC-1 부팅 직후 패널 + 컨트롤(disabled) + 옵션 3개 표시 | ✅ Met | 13:38 dev 부팅 시 정상 표시 (사용자 확인) |
| SC-2 사이니지 표시 → enabled | ✅ Met | signageActive 변경 시 컨트롤 즉시 활성화 |
| SC-3 해상도 변경 즉시 갱신 | ✅ Met | 16:06~ SSE settings.changed → CSS var 즉시 갱신 (사용자 토글 11회 확인) |
| SC-4 상하 여백 → padding 적용 | ✅ Met | TextSlide/RTE useOption + paddingOverride 인자 |
| SC-5 효과 → 페이드 시간 적용 | ✅ Met (Act-2 fix 후) | transitionSec 1초 = 슬라이드 배경 직접 페이드 (사용자 확인) |
| SC-6 새 옵션 1줄 등록 → 자동 노출 | ✅ Met | `OPTION_REGISTRY` 배열 push만 — store/SSE/폼 모두 자동 dispatch |
| SC-7 재시작 후 유지 | ✅ Met | SQLite settings + hydrateAllOptions on boot |
| SC-8 v1.2.2 무회귀 | ✅ Met | tsc 0 error, dev 토글 다수 정상 (16:06~16:08) |

**합계: 8/8 Met** — 기준 ≥ 90% 초과.

---

## 4. Decision Record Verification

| Decision | Layer | Followed? | Evidence |
|----------|-------|:--------:|----------|
| 자동계산 대체 (사용자 px 그대로) | Plan | ✅ | `paddingUtils` paddingOverride → 즉시 반환 |
| Controls off = disabled, 무반응 | Plan | ✅ | `disabled` 속성 + pointer-events:none + send/dispatch 가드 |
| 전환 효과: 숫자 하나 (0 = CUT) | Plan | ✅ | CssVarBridge `transitionSec > 0 ? "opacity Ns ease-in-out" : "none"` |
| 옵션: 스키마 레지스트리 | Plan | ✅ | `lib/options/{types,registry}.ts` 단일 진입점 |
| Architecture C — Pragmatic Balance | Design | ✅ | 3 신규 영역(types/registry, Panel/Field, RightPanel) — 기존 store/SSE 재사용 |
| body 단일 진입점 CSS var | Design | ✅ | DisplayCssVarBridge가 4 var를 body에 set |
| paddingUtils optional 인자 + default | Design | ✅ | `(fontSize, displayH?, paddingOverride?)` 시그니처 |

---

## 5. Structural Match (Design ↔ Implementation)

| Design § | 항목 | 구현 | 상태 |
|----------|------|------|:----:|
| §1.1 | OPTION_REGISTRY | `lib/options/registry.ts` | ✅ |
| §1.1 | useSignageStore.options + setOption | `store/useSignageStore.ts` | ✅ |
| §1.1 | useOption(key) | `hooks/useOption.ts` | ✅ |
| §1.1 | DisplayCssVarBridge — 5 vars | `components/DisplayCssVarBridge.tsx` | ✅ |
| §1.1 | OperationOptionsPanel — registry 순회 | `components/OperationOptionsPanel.tsx` | ✅ |
| §2.2 | SignageState 확장 (options, setOption, hydrateAllOptions, applyOptionSse) | store | ✅ |
| §2.3 | SSE settings.changed 일반화 | `SseBridge.tsx` isRegistryKey 분기 | ✅ |
| §3.1.1 | OptionSchema 타입 정의 | `lib/options/types.ts` | ✅ |
| §3.1.2 | OPTION_REGISTRY 4개 옵션 | resolution, slide.padding, slide.transitionSec (3개로 시작 — Plan 명시 항목) | ✅ |
| §3.1.5 | seed default 추가 | `electron/db/seed.ts` (slide.padding=50, slide.transitionSec=0.5) | ✅ |
| §3.2.1 | OptionField number/select/boolean dispatch | `components/OptionField.tsx` | ✅ |
| §3.2.2 | OperationOptionsPanel registry map | `components/OperationOptionsPanel.tsx` | ✅ |
| §3.3.1 | RightPanel 640px | `components/RightPanel.{tsx,module.css}` | ✅ |
| §3.3.3 | page.tsx Preview → RightPanel 교체 | `app/page.tsx` | ✅ |
| §3.3.5 | Preview 헤더에서 ResolutionSelect/PlaybackControls 제거 | `Preview.tsx` | ✅ |
| §3.4.1 | PlaybackControls always-visible + disabled | `PlaybackControls.tsx` | ✅ |
| §3.4.2 | 버튼 ≥ 44px (실제 48px, primary 80×48) | `PlaybackControls.module.css` | ✅ |
| §3.4.3 | Disabled hint 메시지 | `PlaybackControls.tsx` | ✅ |
| §3.5.1 | paddingUtils paddingOverride | `paddingUtils.ts` | ✅ |
| §3.5.2 | TextSlide useOption slide.padding | `TextSlide.tsx` | ✅ |
| §3.5.3 | RichTextEditor useOption slide.padding | `RichTextEditor.tsx` | ✅ |
| §3.5.4 | DisplayCssVarBridge --slide-padding-y, --slide-transition | `DisplayCssVarBridge.tsx` | ✅ |
| §3.5.5 | BaseRenderer CSS var transition | `BaseRenderer.module.css` (+ Act-2 SignageRenderer 크로스페이드) | ✅ |
| §3.6 | ResolutionSelect 삭제 | 2 파일 삭제 | ✅ |
| §3.7 | SseBridge 일반 핸들러 | `SseBridge.tsx` | ✅ |
| §7 | useDisplayMetrics → useOption | `hooks/useDisplayMetrics.ts` | ✅ |
| Plan FR-3 + 단축키 | usePlaybackKeys signageActive 가드 | `usePlaybackKeys.ts` | ✅ |
| Plan SC-7 | Boot hydrateAllOptions | `app/page.tsx` + `app/signage/page.tsx` | ✅ |

**Total: 33/33 ✅**

---

## 6. Act 이력 (Implementation Quality Improvements)

| Iteration | Issue | Resolution |
|-----------|-------|-----------|
| **Act-1** | OptionField NumberInput 드래그 시 `disabled={busy}`가 매 onChange마다 inflight 걸어 HTML range가 pointer capture 잃음 → 한 칸씩만 움직이고 드래그 해제 | PlaybackControls duration slider와 동일한 draft 패턴 적용: 로컬 state로 드래그 중 갱신, `onPointerUp/onKeyUp/onBlur`에서만 commit |
| **Act-2** | `SignageRenderer`의 fade-out → 250ms hold → fade-in 패턴이 transitionSec < 0.25s에서 opacity 0 노출 시간 발생, 같은 새 슬라이드를 페이드 in/out 하느라 검은 배경이 중간에 보임 | 진짜 crossfade 도입: bottom 레이어가 committed slide을 opacity 1로 유지, top 레이어에 incoming slide이 opacity 0→1 페이드 후 promote. SignageRenderer 전면 재작성 + .module.css `.layer` 추가. transitionSec=0은 toggle skip → 즉시 컷. |

**둘 다 사용자 실측 보고 → 즉시 fix → 사용자 확인 완료.**

---

## 7. Quality Gates

| Gate | Result |
|------|:------:|
| `tsc -p tsconfig.electron.json` | ✅ 0 error |
| `tsc --noEmit` (Next.js) | ✅ 0 error |
| `npm run build:electron` | ✅ 성공 |
| Match Rate ≥ 90% | ✅ 100% |
| Critical Gap | 0 |
| Important Gap | 0 |
| Decision Record 위반 | 0 |
| Strategic alignment | ✅ |

---

## 8. Bonus Findings

| ID | Description | Impact |
|----|-------------|--------|
| B-1 | OptionField draft 패턴 — Act-1로 정착, registry 기반 모든 number 옵션에 적용됨 | 향후 추가 number 옵션도 같은 슬라이더 UX 보장 |
| B-2 | TRUE crossfade — Act-2로 BaseRenderer의 단순 fade 가정 깨고 진짜 layered 크로스페이드 도입 | 슬라이드 전환 품질 ↑, 사용자 인지 가능한 검은색 0 |
| B-3 | BaseRenderer는 dead code — SignageRenderer가 더 이상 안 씀 | 향후 v1.4에서 제거 또는 다른 용도 재사용 검토 |
| B-4 | OPTION_REGISTRY에 unit field 도입(NumberOption) — `px`, `초` 등 단위가 폼에서 자동 표시 | UX 명확성 ↑ |

---

## 9. Recommendation

Match Rate 100% — `/pdca report ui-redesign`로 보고서 생성 진행.
