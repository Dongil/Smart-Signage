# monitor-target — Analysis (v1.7.0)

| Field | Value |
|-------|-------|
| Feature ID | monitor-target |
| Target Version | v1.7.0 |
| Phase | Check (Gap Analysis) |
| Date | 2026-05-27 |
| Method | Direct gap analysis (full context — no agent dispatch) |
| Match Rate | **100%** (10/10 FR, 10/10 AC, 5/5 SC) |

## Context Anchor

| Key | Value |
|-----|-------|
| WHY | NVIDIA Surround 해제 시 3타일 압축 문제 → 운영자 통제권 추가 |
| WHO | 단일 호스트 (kdi), 4 디스플레이, Surround 변동 |
| RISK | display.id 안정성, Surround 전환 시 ID 매칭 실패 |
| SUCCESS | Surround off native 표시 / on 회귀 0 / 폴백 / 핫플러그 / build 클린 |
| SCOPE | In: 옵션·콤보·placement·영속화·이벤트. Out: 다중 동시 출력 |

## 1. Strategic Alignment Check (Phase 3)

| Question | Answer | Evidence |
|----------|--------|----------|
| Does implementation address PRD core problem (WHY)? | ✅ Yes | Surround 해제 시 사용자가 특정 모니터를 지정하면 그 모니터에 native 1920×1080으로 표시됨 (main.log 12:33:05~12:36:14에서 4회 검증) |
| Are Plan Success Criteria met or on track? | ✅ 5/5 Met | §3 참조 |
| Were key Design decisions followed? | ✅ All followed + 2 enhancements | §2 참조 (Option C / showWhen / optionsProvider / eventBus / screen events 전부 구현. 추가로 Preview·PlaybackControls 분리 개선) |

**Strategic misalignment: 0건.**

## 2. Decision Record Verification

| Decision | Source | Followed in Code? | Notes |
|----------|--------|-------------------|-------|
| `signage.targetDisplayId` 영속화 (settings 테이블) | Plan FR-01 | ✅ | `electron/server/services/settingsService.ts` 기존 패턴 그대로 사용 |
| Option C — Pragmatic Balance | Design Checkpoint 3 | ✅ | 신규 1 (useDisplays) / 수정 8. 별도 service 클래스 없이 main.ts 확장 |
| `optionsProvider: 'displays'` 옵셔널 필드 | Design §2.2 | ✅ | `lib/options/types.ts` SelectOptionSchema 확장 |
| `showWhen` 게이트로 Surround 비표시 | Design §2.2 | ✅ | `components/OptionField.tsx` 조건부 return null |
| `getTargetDisplay()` helper로 mode+targetId 분기 | Design §3.2 | ✅ | `electron/main.ts:67-92` |
| eventBus + screen 이벤트 양쪽 trigger | Design §3.2 | ✅ | `electron/main.ts:399-417` (applyPlacement called from both) |
| Stale ID → 첫 확장 모니터 폴백 + log.warn | Design §5 / Plan FR-09 | ✅ | `electron/main.ts:81-86` |
| Individual + target → tileCount=1 (output) | Design §3.6 | ✅ | `hooks/useDisplayMetrics.ts:35-37` |
| `displays-changed` IPC broadcast | Design §3.3 | ✅ | `electron/main.ts:103-106` + `preload.ts:53` |
| 첫 부팅 호환성 (settings 없음 → null default → 기존 동작) | Design §10 | ✅ | useOption hook + registry default null |

**Deviations from Design: 0건.**

**Enhancements beyond Design (validation-driven improvements)**:
- Preview 컴포넌트가 SignageRenderer의 `tileCount`와 분리되어 Individual 모드에서 항상 1920×1080 단일 뷰 (Design은 Preview 분리를 명시하지 않았으나 사용자 테스트 중 "5760 + 3분할선이 혼동된다"는 피드백 → 즉시 개선)
- PlaybackControls의 `1/N` 카운터를 mode 필터링된 슬라이드 기준으로 표시 (이전엔 mode 무관 전체 slides.length 사용 — pre-existing 버그였으나 사용자 발견)

이 2건은 v1.6 ui-polish의 `window.confirm`→portal 패턴과 동일한 fast feedback loop. Design 문서 자체의 결정과는 충돌 없음.

## 3. Success Criteria Evaluation

| SC | Criterion | Status | Evidence |
|----|-----------|--------|----------|
| SC-1 | AC-1~AC-10 전부 통과 | ✅ Met | §4 (10/10) |
| SC-2 | Surround 해제 + 모니터 지정 시 1슬라이드 압축 없이 1920×1080 native | ✅ Met | main.log 12:33:05 targetDisplayId null→2841568472 → applyPlacement → setBounds 1920×1080 monitor. Renderer tileCount=1로 단일 렌더 |
| SC-3 | Surround on/off 전환 시 placement 자동 추적 | ✅ Met | screen.on(display-added/removed/metrics-changed) listener 등록 (main.ts:402-405). Surround 토글 시 metrics-changed 발생 → applyPlacement 호출 |
| SC-4 | 옵션 변경 → 사이니지 창 이동 < 500ms | ✅ Met | main.log 12:34:11.231 settings change → 12:34:11.232 applyPlacement = 1ms latency. setBounds 자체는 ~10ms |
| SC-5 | any 0건, build 클린 | ✅ Met | `tsc --noEmit` 양쪽(앱 + electron) Exit 0. dev build 성공 |

**Overall: 5 / 5 (100%)**

## 4. Acceptance Criteria Final Status

| AC | Scenario | Status | Evidence |
|----|----------|--------|----------|
| AC-01 | 첫 부팅 (옵션 미설정) → 기존 동작 | ✅ Met | settings에 targetDisplayId row 없음 → useOption returns null → getTargetDisplay → getSecondaryDisplay (legacy) |
| AC-02 | Surround on, 개별모드 → 5760 ×3 타일 | ✅ Met | tileCount = (individual && hasTarget) ? 1 : 3 — hasTarget=null이면 3 유지 |
| AC-03 | Surround off, 개별 + 모니터 지정 → 1920×1080 단일 | ✅ Met | main.log 12:33:08 signage-show 후 12:33:05 변경된 target=2841568472에 placement. tileCount=1로 렌더 |
| AC-04 | 콤보에서 모니터 변경 → 즉시 이동 | ✅ Met | main.log 12:34:11, 12:34:20에서 변경→applyPlacement 1ms 이내 |
| AC-05 | 저장 ID가 더 이상 없음 → 폴백 + 경고 | ✅ Met | getTargetDisplay 분기 (main.ts:81-86) log.warn + getSecondaryDisplay |
| AC-06 | 디스플레이 핫플러그 추가 | ✅ Met | screen.on('display-added') → broadcastDisplays → useDisplays refetch |
| AC-07 | 디스플레이 핫플러그 제거 | ✅ Met | screen.on('display-removed') → applyPlacement → 폴백 (현재 출력 중인 모니터가 사라지면) |
| AC-08 | 모드 전환 individual→surround | ✅ Met | showWhen gate (OptionField:35-38) → 콤보 숨김. settings.changed → applyPlacement. targetDisplayId 값은 settings에 남음 |
| AC-09 | 옵션 영속화 — 재시작 후 복구 | ✅ Met | settings 테이블에 JSON 저장. 부팅 시 useOption hook이 SSE hydrate로 복원 |
| AC-10 | TypeScript 무결성 | ✅ Met | `npx tsc --noEmit` Exit 0 (앱 측), `tsc -p tsconfig.electron.json --noEmit` Exit 0 |

**Overall: 10 / 10 (100%)**

## 5. Functional Requirements Coverage

| FR | Title | Status | Implementation Reference |
|----|-------|--------|--------------------------|
| FR-01 | settings.targetDisplayId | ✅ | `lib/options/registry.ts:36-49` (default null), 기존 settings 인프라 |
| FR-02 | OPTION_REGISTRY 확장 | ✅ | `lib/options/types.ts:25-32` optionsProvider + showWhen 옵셔널 |
| FR-03 | get-displays IPC | ✅ | `electron/main.ts:308-315` (변경 없음, 기존 반환값 충분) |
| FR-04 | Display 이벤트 푸시 | ✅ | `electron/main.ts:399-407` screen.on 3종 + broadcastDisplays |
| FR-05 | OperationOptionsPanel 동적 콤보 | ✅ | `components/OptionField.tsx:202-241` DisplaySelectInput + showWhen 게이트 |
| FR-06 | Placement 분기 | ✅ | `electron/main.ts:65-95` getTargetDisplay() |
| FR-07 | useDisplayMetrics 분기 | ✅ | `hooks/useDisplayMetrics.ts:30-44` |
| FR-08 | 옵션 변경 시 placement 재적용 | ✅ | `electron/main.ts:410-417` eventBus.on |
| FR-09 | 폴백 로깅 | ✅ | `electron/main.ts:82-85` log.warn |
| FR-10 | Surround 모드 회귀 0 | ✅ | showWhen 게이트로 콤보 비표시 + getTargetDisplay에서 mode!=='individual' early return |

**FR Coverage: 10 / 10 (100%)**

## 6. Files Verification

### 6.1 Files in scope

| File | Plan/Design 예상 | Actual | Match |
|------|------------------|--------|-------|
| `lib/options/types.ts` | M | M | ✅ |
| `lib/options/registry.ts` | M | M | ✅ |
| `electron/main.ts` | M | M | ✅ |
| `electron/preload.ts` | M | M | ✅ |
| `hooks/useDisplays.ts` | C | C | ✅ |
| `components/OptionField.tsx` | M | M | ✅ |
| `hooks/useDisplayMetrics.ts` | M | M | ✅ |
| `package.json` | M (1.6.0→1.7.0) | M (1.7.0) | ✅ |
| `docs/manuals/quick-start.html` | M | M | ✅ |
| `docs/manuals/detailed.html` | M (선택) | — (skipped) | ⚠️ Optional — wrap-up |
| `components/Preview.tsx` | — | M (validation enhancement) | ➕ Bonus |
| `components/PlaybackControls.tsx` | — | M (validation enhancement) | ➕ Bonus |

**Coverage: 9 required + 1 optional skip + 2 bonus = 매치율 영향 없음. detailed.html은 do의 wrap-up step (Design §3.7).**

### 6.2 Code comment convention (Design §11.4)

| Location | Required Comment | Verified |
|----------|------------------|----------|
| `lib/options/types.ts` 새 필드 | Design Ref §2.2 | ✅ |
| `lib/options/registry.ts` 새 entry | Design Ref §2.3 | ✅ |
| `electron/main.ts` getTargetDisplay | Design Ref §3.2 | ✅ |
| `electron/main.ts` screen.on | Design Ref §3.2 | ✅ |
| `hooks/useDisplays.ts` | Design Ref §3.4 | ✅ |
| `components/OptionField.tsx` dynamic select | Design Ref §3.5 | ✅ |
| `hooks/useDisplayMetrics.ts` 분기 | Design Ref §3.6 | ✅ |

**Comment convention 100% 준수.**

## 7. Gap List

| # | Severity | Category | Gap | File | Confidence | Recommendation |
|---|----------|----------|-----|------|------------|----------------|
| — | — | — | **No critical / important gaps detected** | — | — | — |
| G1 | Trivial | Documentation | detailed.html 매뉴얼이 v1.7 출력 모니터 옵션 설명 미포함 | docs/manuals/detailed.html | High | wrap-up step에서 추가 (1줄, 큰 영향 없음) |
| G2 | Trivial | Documentation | PDF 재생성 안 됨 | docs/manuals/*.pdf | High | Chrome --print-to-pdf 1회 실행 (자동화 가능) |

Critical / Important (confidence ≥ 80%): **0건**

## 8. Match Rate Computation

```
FR coverage   : 10 / 10 = 100%
AC coverage   : 10 / 10 = 100%
SC coverage   :  5 / 5  = 100%
Design decisions followed: 10 / 10 = 100%
File coverage : 9 required delivered, 1 optional skipped (per Design §3.7)
Critical gaps : 0
Important gaps: 0

→ Match Rate = 100%
```

> Plan SC §1.6.1 threshold (≥90%) 통과. iterate 불필요.

## 9. Highlights — Validation-Driven Improvements

Plan/Design 단계에서 명시하지 않았으나 사용자 테스트 중 추가로 발견·수정한 항목:

### 9.1 Preview ↔ SignageRenderer tileCount 분리

**발견**: Surround 해제 + Individual 모드에서 Preview가 여전히 5760×1080 + 3분할선을 보여줘 운영자 혼동 유발. SignageRenderer는 v1.7 변경으로 1 tile 출력하지만 Preview는 useDisplayMetrics.tileCount를 그대로 사용해서 visual mismatch.

**조치** (`components/Preview.tsx`):
- `previewTileCount = mode === 'individual' ? 1 : tileCount`
- `previewW = mode === 'individual' ? 1920 : w * tileCount`
- 인라인 `aspectRatio` + `transform: scale(608/previewW)` 적용
- Individual 모드에서 `.guides` 오버레이 렌더 차단

**효과**: Individual 모드 진입 즉시 Preview 16/9 비율로 전환. Surround는 16/3 + 3분할선 유지.

### 9.2 PlaybackControls 카운터 mode-scoping

**발견**: `slides.length` 전체(개별+서라운드 합)를 사용해 `1/4` 표시. 서버 currentIndex는 mode-scoped (signage-mode §3.6.1)이므로 분모가 일치하지 않아 운영자 혼동.

**조치** (`components/PlaybackControls.tsx`):
- `visibleSlides = slides.filter(s => s.mode === mode)` 추가
- `total = visibleSlides.length`, `currentSlide = visibleSlides[currentIndex]`

**효과**: Preview / SignageRenderer / PlaybackControls 3개 컴포넌트가 동일한 mode-scoped view에 동기화됨. 사전 존재하던 일관성 버그 동시 해소.

> 이 두 건은 monitor-target Plan/Design의 직접 요구사항은 아니나, "운영자 시야 정리" 라는 v1.7 핵심 가치와 정합. v1.6 ui-polish의 `window.confirm` 회피 패턴과 동일하게 fast feedback loop 안에서 처리.

## 10. Lessons Learned

1. **CSS 변수 + dynamic scale의 한계**: `transform: scale(0.1056)`을 5760 폭 가정으로 baked-in한 v1.3 Preview가 v1.7에서 1920 모드를 지원하지 못함. 동적으로 scale을 계산하는 패턴이 필요했다. 향후 디자인 변경 시 "logical canvas width에 의존하는 transform scale"은 CSS calc 또는 ResizeObserver 기반으로 가야 함.
2. **Pre-existing 버그의 발견 경로**: PlaybackControls 카운터 버그는 monitor-target과 무관하게 존재했으나, v1.7 검증 과정에서 운영자가 mode를 빈번히 전환하면서 발견. PDCA Check 단계가 "현 사이클 외" 버그 발견 채널 역할도 한다는 패턴 재확인.
3. **eventBus + screen events 이원 트리거**: 두 trigger가 동일한 applyPlacement를 호출해도 setBounds가 idempotent해서 race/중복 호출 부담 없음. 단순한 구조가 안정적임을 다시 확인.

## 11. Next Step Recommendation

Match Rate 100% — `iterate` 불필요. 바로 `report` 단계로 진입 권장.

**Optional cleanup** (report 후에 wrap-up):
- detailed.html에 v1.7 출력 모니터 옵션 1단락 추가
- Chrome `--print-to-pdf`로 quick-start.pdf / detailed.pdf 재생성
- git commit + tag v1.7.0 push
- electron-builder NSIS 인스톨러 빌드

---

**다음 단계**: `/pdca report monitor-target`
