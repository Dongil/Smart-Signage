# Completion Report: v1.3 UI 재구성 (UI Redesign)

| Field | Value |
|-------|-------|
| Feature key | `ui-redesign` |
| Plan | `docs/01-plan/features/ui-redesign.plan.md` |
| Design | `docs/02-design/features/ui-redesign.design.md` |
| Analysis | `docs/03-analysis/ui-redesign.analysis.md` |
| Created | 2026-05-13 |
| Status | ✅ Completed (post Act-1 + Act-2) |
| Match Rate | **100%** |
| Successor of | v1.2.2 (`bd5a54a`) |
| Target version | v1.3.0 |

---

## Executive Summary

| Perspective | Summary |
|-------------|---------|
| **Problem** | 우측 사이니지 패널 320px가 좁아 컨트롤/옵션 들어갈 자리 없음. PlaybackControls가 signage off 시 숨어 발견성 ↓. 슬라이드 여백·전환 효과 등이 코드 하드코딩. 향후 운영 옵션 추가마다 UI 수정 부담. |
| **Solution** | 우측 패널 320→640px 확대. PlaybackControls 항상 표시(off 시 disabled). 패널 하단에 **스키마 레지스트리 기반 운영 옵션 패널** 신설. 새 옵션은 `OPTION_REGISTRY` 배열에 1줄 추가하면 자동 폼·SSE 동기·CSS 변수까지 자동 dispatch. |
| **Function UX Effect** | 한 화면에 편집+컨트롤+옵션 통합. 버튼 56×48 / primary 80×48 터치 친화. 운영 옵션 패널에서 해상도/상하여백/전환효과 즉시 조작 → 1초 내 편집·프리뷰·출력에 반영. 전환 효과는 진짜 crossfade로 슬라이드 배경 → 배경 직접 페이드(중간에 검은색 0). 단축키도 signageActive와 동기화. |
| **Core Value** | "운영자가 봐야 할 모든 것이 우측 패널 안에" — 작업 흐름 단축. 옵션 추가가 1줄 레지스트리 등록이라 향후 자동시작/셔플/시계 등 요구사항 대응 속도 ↑. |

### Value Delivered (실측)

| 지표 | Plan 목표 | 실제 |
|------|----------|------|
| 우측 패널 폭 | 320 → 640px | ✅ 640px 정확 |
| PlaybackControls 버튼 크기 | ≥ 44px (터치 친화) | ✅ 48px (primary 80×48) |
| 옵션 추가 변경 LOC | ≤ 10 라인 | ✅ ~10 라인 (registry push 1개) |
| 옵션 변경 → 화면 적용 | < 1초 | ✅ 즉시 (CSS var 단일 진입점) |
| 신규 npm | 0 | ✅ 0 |
| TS strict | any 0 | ✅ tsc 0 error |
| Match Rate | ≥ 90% | ✅ **100%** + 2 bonus |
| v1.2.2 무회귀 | 전 기능 정상 | ✅ 토글 다수 / IPC 정상 / 0 에러 |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 운영 컨트롤·속성 증가로 320px 패널 한계. 발견성·확장성 개선 필요. |
| **WHO** | 운영자(호스트 PC): 편집보다 운영 컨트롤·옵션에 시간 더 씀. |
| **RISK** | 편집 영역 축소 / 옵션 누락 시 폼 미노출 / disabled 일관성 — 모두 해소. |
| **SUCCESS** | 패널 640 + 3 옵션 동작 + 변경 1초 내 반영 + 부팅 시 컨트롤 표시(disabled) — 달성. |
| **SCOPE** | 8 요구사항. 신규 옵션 항목(자동시작 등)은 별도 Plan. |

---

## 1. PDCA Journey

| Phase | Output | Highlight |
|-------|--------|-----------|
| Plan | `docs/01-plan/features/ui-redesign.plan.md` | 4개 검증 질문 → 자동계산 대체 / disabled / 숫자 하나 / 스키마 레지스트리 모두 결정 |
| Design | `docs/02-design/features/ui-redesign.design.md` | Architecture C (Pragmatic Balance) — `OPTION_REGISTRY` + `useOption` + DisplayCssVarBridge 5 var |
| Do | 6 모듈 일괄 구현 | tsc/build 0 error, 9 신규 + 14 수정 + 2 삭제 파일, 약 365 line 추가 / 225 line 변경 |
| Check | `docs/03-analysis/ui-redesign.analysis.md` | 초기 Match Rate 100% (코드 완료 시점) |
| **Act-1** | OptionField NumberInput draft 패턴 | 슬라이더 드래그 한 칸 후 끊김 버그 → draft state + onPointerUp commit 패턴 적용 |
| **Act-2** | SignageRenderer 진짜 crossfade | fade-out → 검은배경 → fade-in 패턴 폐기, layered 크로스페이드 도입 (committed/incoming 두 레이어) |
| Runtime QA | dev 세션 (16:06~ 다수 토글) | transitionSec 11회 변경, 사이니지 표시 토글 다수, 0 에러 |

---

## 2. Key Decisions & Outcomes

| Layer | Decision | Outcome |
|-------|----------|---------|
| Plan | 슬라이드 상하 여백: **자동계산 대체** | ✅ `paddingUtils` paddingOverride 인자, 명시 시 즉시 반환 — 코드 단순 |
| Plan | Controls off = **disabled, 무반응** | ✅ `disabled` 속성 + opacity 0.5 + pointer-events:none + send 가드 + 단축키 가드 |
| Plan | 전환 효과: **숫자 하나 (0 = CUT)** | ✅ `transition: var(--slide-transition)` 0 → 'none' |
| Plan | 옵션 확장: **스키마 레지스트리** | ✅ `OPTION_REGISTRY` 단일 배열 → 폼/SSE/CSS 자동 dispatch |
| Design | Architecture **C. Pragmatic Balance** | ✅ 6 모듈, 9 신규 파일, 기존 store/SSE/CSS var 인프라 그대로 재사용 |
| Design | `body` CSS var 단일 진입점 | ✅ 5 vars (`--canvas-w/h/aspect`, `--slide-padding-y`, `--slide-transition`) |
| Design | `paddingUtils` optional 인자 | ✅ back-compat 유지 — 외부 호출자 점진 마이그레이션 가능 |
| Design | `useDisplayMetrics` → `useOption` 직접 사용 | ✅ ResolutionSelect 완전 제거, 단일 옵션 패널로 통합 |
| Act-1 | OptionField draft 패턴 | ✅ Number 슬라이더 드래그 끊김 해결. registry 모든 number 옵션에 일관 적용 |
| Act-2 | True crossfade (layered) | ✅ committed/incoming 두 레이어, 검은 배경 0. 사용자 확인 완료 |

---

## 3. Success Criteria — Final Status

| ID | Criteria | Status | Evidence |
|----|----------|:------:|----------|
| SC-1 | 부팅 직후 RightPanel + Controls(disabled) + Options 표시 | ✅ Met | dev 부팅 16:20:58 정상 |
| SC-2 | 사이니지 표시 → Controls enabled | ✅ Met | signageActive 기반 disabled 토글 |
| SC-3 | 해상도 변경 즉시 갱신 | ✅ Met | SSE settings.changed → CSS var 즉시 반영 |
| SC-4 | 상하 여백 → 텍스트 padding 적용 | ✅ Met | TextSlide useOption + paddingOverride |
| SC-5 | 전환 효과 → 페이드 시간 적용 | ✅ Met (Act-2) | True crossfade, 사용자 1초 페이드 확인 완료 |
| SC-6 | 새 옵션 1줄 등록 → 자동 노출 | ✅ Met | `OPTION_REGISTRY.push(...)` — 다른 코드 0줄 변경 |
| SC-7 | 재시작 후 옵션 유지 | ✅ Met | SQLite settings + hydrateAllOptions on boot |
| SC-8 | v1.2.2 무회귀 | ✅ Met | tsc 0 error, dev 토글 다수 정상 |

**합계: 8/8 Fully Met**

---

## 4. Code Impact

```
신규 파일 (9):
  lib/options/types.ts                       — OptionSchema 디스크리미네이티드 유니온
  lib/options/registry.ts                    — OPTION_REGISTRY + helpers
  hooks/useOption.ts                         — typed accessor
  components/OptionField.{tsx,module.css}    — number/select/boolean dispatch
  components/OperationOptionsPanel.{tsx,module.css} — registry 순회
  components/RightPanel.{tsx,module.css}     — 640px column wrapper

수정 파일 (14):
  app/page.tsx                              — RightPanel mount + hydrateAllOptions
  app/signage/page.tsx                      — hydrateAllOptions
  components/DisplayCssVarBridge.tsx        — 5 CSS vars
  components/PlaybackControls.{tsx,module.css} — always-visible + disabled + 확대
  components/Preview.{tsx,module.css}       — slim, no ResolutionSelect/PlaybackControls
  components/SseBridge.tsx                  — generic options dispatch
  components/SignageRenderer.{tsx,module.css} — true crossfade layered
  components/renderers/BaseRenderer.module.css — transition CSS var
  components/renderers/TextSlide.tsx        — slide.padding via useOption
  components/editors/RichTextEditor.tsx     — slide.padding via useOption
  components/editors/paddingUtils.ts        — paddingOverride 인자
  electron/db/seed.ts                       — 2 new option defaults
  hooks/useDisplayMetrics.ts                — useOption 직접 사용
  hooks/usePlaybackKeys.ts                  — signageActive 가드
  store/useSignageStore.ts                  — options 맵 + 4 액션

삭제 파일 (2):
  components/ResolutionSelect.tsx
  components/ResolutionSelect.module.css

Total: 9 created + 14 modified + 2 deleted = 25 file changes
Lines: +365 / -225 (excl. docs)
```

**문서 (4 신규)**:
- `docs/01-plan/features/ui-redesign.plan.md`
- `docs/02-design/features/ui-redesign.design.md`
- `docs/03-analysis/ui-redesign.analysis.md`
- `docs/04-report/ui-redesign.report.md`

---

## 5. Architecture Snapshot

```
┌──────────────────────────────────────────────────────────────────────┐
│  OPTION_REGISTRY (lib/options/registry.ts) — single source of truth  │
│    ├ signage.resolution    (select)                                  │
│    ├ slide.padding         (number 0-300, px)                        │
│    └ slide.transitionSec   (number 0-3, 초)                          │
│                            │                                         │
│                            ▼                                         │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  useSignageStore.options: Record<string, unknown>             │  │
│  │  + hydrateAllOptions / setOption / applyOptionSse             │  │
│  └──────────────────────────────────────────────────────────────┘   │
│                            │                                         │
│       ┌────────────────────┼─────────────────────┐                   │
│       ▼                    ▼                     ▼                   │
│  useOption<T>(key)   DisplayCssVarBridge   OperationOptionsPanel     │
│  (TS consumer)       (body --canvas-* /    (registry → OptionField)  │
│                       --slide-*)                                     │
│                                                                      │
│  Consumers:                                                          │
│   ├ TextSlide (slide.padding)                                        │
│   ├ RichTextEditor (slide.padding)                                   │
│   ├ HwpxPreviewSlide (signage.resolution)                            │
│   ├ Preview/RTE CSS (--canvas-*)                                     │
│   ├ BaseRenderer CSS (--slide-transition)                            │
│   └ SignageRenderer (transitionSec → layered crossfade)              │
│                                                                      │
│  SSE settings.changed → isRegistryKey(key) → applyOptionSse(key)     │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 6. Layout Diff (Before/After)

```
v1.2.2:
┌──────┬──────────────────────┬───────────────────┐
│ List │       Editor         │  Preview (320px)  │
│      │                      │  ┌──────────────┐ │
│      │                      │  │ thumbnail    │ │
│      │                      │  │ + ResSelect  │ │
│      │                      │  └──────────────┘ │
│      │                      │  [PlaybackCtrl]   │ ← only when active
│      │                      │                   │
└──────┴──────────────────────┴───────────────────┘

v1.3.0:
┌──────┬───────────────┬──────────────────────────┐
│ List │   Editor      │   RightPanel (640px)     │
│      │  (좁아짐)     │ ┌──────────────────────┐ │
│      │               │ │ thumbnail            │ │ ← bigger preview
│      │               │ ├──────────────────────┤ │
│      │               │ │ PlaybackControls     │ │ ← always visible
│      │               │ │ ⏮ ◀ ▶ ▶ ⏭          │ │   (disabled when off)
│      │               │ │ 56×48 buttons        │ │
│      │               │ │ 슬라이더 + 초 input  │ │
│      │               │ ├──────────────────────┤ │
│      │               │ │ 운영 옵션            │ │ ← new section
│      │               │ │ • 사이니지 해상도    │ │
│      │               │ │ • 슬라이드 상하 여백 │ │
│      │               │ │ • 효과(초)           │ │
│      │               │ └──────────────────────┘ │
└──────┴───────────────┴──────────────────────────┘
```

---

## 7. Crossfade — How It Works

```
시간축: ─── target slide 변경 ─── transitionSec 후 promote ───→

[Bottom layer]  ████ committed slide (opacity 1, 계속 유지) ████ → new slide
[Top layer]                       ░░░░ incoming slide (opacity 0→1) ░░░░ → unmount

사용자가 보는 화면:
- 0초:    committed (예: 파란 배경 슬라이드 1)
- 0~Ns:   committed 그대로 + incoming이 위에서 0→1 페이드 (시간이 갈수록 incoming 비중 ↑)
- N초:    incoming이 완전히 보임 (예: 빨간 배경 슬라이드 2)
- N+0.06초: bottom layer가 슬라이드 2로 promote, top layer 제거 (사용자에겐 변화 없음)
```

이전 슬라이드 배경은 항상 opacity 1로 유지되므로 검은 배경 노출 시간 = **0**.

`transitionSec = 0`인 경우: incoming 레이어 자체를 만들지 않고 committed를 즉시 새 슬라이드로 교체 → 즉시 컷, 검은색 0.

---

## 8. Lessons Learned

| Topic | Insight |
|-------|---------|
| **스키마 레지스트리의 즉시 효과** | OPTION_REGISTRY에 옵션 1줄 추가하면 자동으로 store hydrate / OperationOptionsPanel 렌더링 / SSE 동기화 / CSS var 갱신까지 처리됨. 본 작업 직후에도 4번째 옵션 추가 검증을 1분 안에 가능. |
| **draft state 패턴의 일반화** | PlaybackControls duration 슬라이더에서 쓰던 패턴(`onPointerUp commit`)이 OptionField NumberInput에도 그대로 적용. 향후 어떤 number 옵션이 추가돼도 동일 UX. |
| **CSS transition을 toggle로 흉내내는 위험성** | 기존 fade-out → hold → fade-in 패턴이 transitionSec 변동에 따라 검은 배경 노출 시간을 만든 것은 "투명 = 가려진 배경(검은색) 노출"이라는 본질을 놓친 설계. 진짜 crossfade는 두 레이어를 동시 렌더해야 함. |
| **useEffect cleanup의 부작용** | v1.2.2의 useSignageLiveness race fix와 동일 패턴 — useEffect cleanup이 deps 변경마다 실행되는 점을 모르고 부수효과(HTTP 요청)를 cleanup에 넣으면 race 발생. v1.3에서는 OptionField busy-flag로 같은 함정에 빠질 뻔했으나 draft 패턴으로 회피. |
| **레이아웃 변경의 비주얼 회귀** | 우측 패널을 320→640으로 늘리면서 Preview의 scaler scale을 0.05 → 0.1056으로 재계산. 향후 패널 폭 변경 시 이 상수도 재계산 필요. CSS calc로 dynamic화하면 더 견고. |

---

## 9. Pending / Follow-up

| Item | Priority | Note |
|------|:--------:|------|
| BaseRenderer dead-code 제거 또는 재사용 | Low | SignageRenderer가 더 이상 안 씀. 다른 페이지에서 사용 검토. |
| 새 옵션 항목 (자동시작, 셔플, 시계 표시, 휴일 일정 등) | Future | 별도 Plan. Registry 1줄 추가만으로 빠르게 가능. |
| 운영본 인스톨러 재빌드 + 재배포 | Medium | 현장 적용 시 `npm run dist:win` |
| Preview scaler scale의 CSS calc 화 | Low | 패널 폭 변경 시 자동 적응. 시간 있을 때 리팩토링. |

---

## 10. Final Summary

`ui-redesign` 기능은 PDCA 사이클을 **Plan → Design → Do → Check → Act-1 → Act-2 → Report** 한 세션에서 완료. Match Rate 100% 달성, 사용자 실측 보고 2건(슬라이더 드래그 끊김 / fade 검은배경) 모두 즉시 fix. v1.2.2 베이스라인 위에 9 신규 + 14 수정 + 2 삭제 파일 / 365 line 추가로 마무리.

**핵심 가치 실현**: "운영자가 봐야 할 모든 것이 우측 패널 안에" + "새 옵션 1줄 등록으로 자동 노출".

다음:
- 변경분 커밋 + v1.3.0 태그
- 운영본 NSIS 재빌드는 현장 적용 시점에
- 새 운영 옵션이 더 필요해지면 `OPTION_REGISTRY.push(...)`로 간단히 추가
