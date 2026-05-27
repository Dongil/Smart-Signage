# monitor-target — Completion Report (v1.7.0)

| Field | Value |
|-------|-------|
| Feature ID | monitor-target |
| Target Version | v1.7.0 |
| Phase | Report |
| Date Completed | 2026-05-27 |
| Match Rate | 100% |
| Iteration Count | 0 (no /pdca iterate needed) |
| PDCA Documents | Plan, Design, Analysis, Report (no PRD — operational stability patch) |

## Executive Summary

| Perspective | Summary |
|-------------|---------|
| Problem | NVIDIA Surround가 운영 중 종종 해제되면 OS가 3개의 1920×1080 모니터를 따로 보고, 기존 자동 선택은 그중 한 장에 3타일을 압축 표시해 사용 불능 상태가 됐다. |
| Solution | `signage.targetDisplayId` 옵션 + 동적 "출력 모니터" 콤보(Individual 모드 전용). Main process가 mode+target을 보고 placement를 분기하고, eventBus + screen 이벤트 양쪽이 즉시 재배치를 트리거. Renderer는 target 지정 시 타일링을 끈다. |
| Function UX Effect | Surround 해제 환경에서도 운영자가 지정한 1920×1080 모니터에 native로 슬라이드 단독 표시. Surround 활성 환경 회귀 0건. 디스플레이 핫플러그 자동 추적. |
| Core Value | "Surround 가용성에 의존하지 않는 출력 보장" — OS/드라이버 상태와 무관하게 운영자가 어느 모니터에 출력할지를 직접 통제. |

### 1.3 Value Delivered (실측 vs 계획)

| Dimension | Planned | Delivered | Status |
|-----------|---------|-----------|--------|
| 옵션 변경 → 창 이동 latency | < 500ms | **1ms** (settings.changed → applyPlacement, main.log 12:34:11) | ✅ |
| Surround off + target 표시 | 1920×1080 native, 압축 없음 | 실측 확인 (12:33~12:36에서 4회 모니터 전환) | ✅ |
| Surround 활성 환경 회귀 | 0건 | 0건 (showWhen 게이트로 콤보 숨김, 기존 코드 경로 보존) | ✅ |
| 신규 컴포넌트/Hook | 1개 (useDisplays) | 1개 | ✅ |
| 신규 옵션 키 | 1개 (signage.targetDisplayId) | 1개 | ✅ |
| TypeScript any | 0건 | 0건 (tsc --noEmit 양쪽 통과) | ✅ |
| Match Rate | ≥ 90% | **100%** | ✅ |

## Context Anchor

| Key | Value |
|-----|-------|
| WHY | Surround on 가정이 깨졌을 때 사용 불능 → 사용자 통제권 추가. |
| WHO | 단일 호스트 운영자 (kdi), 4 디스플레이, Surround 상태 변동. |
| RISK | display.id 안정성, Surround 전환 시 ID 매칭 실패, 모드 전환 시 layout. |
| SUCCESS | 5/5 Success Criteria 달성 (100%). |
| SCOPE | In: 옵션·콤보·placement·영속화·이벤트. Out: 다중 동시 출력, 모니터별 다른 슬라이드. |

## 2. Key Decisions & Outcomes

| Decision | Source | Followed? | Outcome |
|----------|--------|-----------|---------|
| 옵션 영속화 = settings 테이블 | Plan Checkpoint 2 Q4 | ✅ | 기존 key/value 패턴 그대로 활용. 마이그레이션 불필요. |
| 폴백 = 첫 확장 모니터 + log.warn | Plan Checkpoint 2 Q3 | ✅ | getTargetDisplay 분기로 stale ID 무중단 처리. UI 변화 없이 동작 보장. |
| Surround 모드에서 콤보 숨김 (개별 전용) | Plan Checkpoint 2 Q2 | ✅ | showWhen 게이트로 OptionField가 조건부 null 반환. 회귀 0. |
| 선택 모니터에 1슬라이드 단독 표시 | Plan Checkpoint 2 Q1 | ✅ | useDisplayMetrics에서 mode='individual' + hasTarget → tileCount=1. |
| Option C — Pragmatic Balance | Design Checkpoint 3 | ✅ | 별도 service 없이 main.ts 확장 + useDisplays hook 1개. Plan v1.6 ui-polish 패턴과 일관. |
| eventBus + screen 이벤트 양쪽 trigger | Design §3.2 | ✅ | applyPlacement는 idempotent. 두 이벤트가 동일 함수 호출해도 안전. |
| optionsProvider 옵셔널 필드 | Design §2.2 | ✅ | SelectOptionSchema에 optional 추가 — 기존 4개 옵션 회귀 0. |
| Preview ↔ SignageRenderer tileCount 분리 | (없음 — 사용자 피드백) | ➕ Improved | "5760 + 3분할선 혼동" 피드백 즉시 반영. Preview만 1920×1080 단일 뷰. |
| PlaybackControls mode-scoped 카운터 | (없음 — 사용자 피드백) | ➕ Improved | Pre-existing 일관성 버그 발견 → 같은 사이클 안에서 동시 해소. |

**핵심 학습**: Surround 의존 코드가 한 곳(`getSecondaryDisplay`)이 아니라 여러 곳(Preview, SignageRenderer, useDisplayMetrics, main process)에 분산되어 있어, "출력 모니터 선택" 한 줄을 추가해도 visual layer까지 일관성을 맞추려면 분기 지점 4곳을 동시 손봐야 했다. Plan은 main+output 라인만 다뤘으나, 검증 단계에서 visual layer (Preview / Counter)도 발견·수정. 향후 모드 의존 변경은 visual layer를 처음부터 스캔 대상에 포함.

## 3. Success Criteria Final Status

| SC | Criterion | Status | Evidence |
|----|-----------|--------|----------|
| SC-1 | AC-1~AC-10 전부 통과 | ✅ Met | Analysis §4 (10/10) |
| SC-2 | Surround off + target 시 1슬라이드 1920×1080 native | ✅ Met | main.log 12:33:05 targetDisplayId 변경 → applyPlacement → setBounds. Renderer tileCount=1 단일 렌더 |
| SC-3 | Surround on/off 전환 시 placement 자동 추적 | ✅ Met | screen.on(display-added/removed/metrics-changed) 등록 (main.ts:402-405) |
| SC-4 | 옵션 변경 → 창 이동 < 500ms | ✅ Met | 실측 1ms (12:34:11.231→12:34:11.232) |
| SC-5 | any 0건, build 클린 | ✅ Met | tsc --noEmit Exit 0 (app + electron 양쪽) |

**Overall Success Rate: 5 / 5 (100%)**

## 4. Phase Journey

| Phase | Duration (approx) | Artifact | Notes |
|-------|-------------------|----------|-------|
| Plan | ~10분 | docs/01-plan/features/monitor-target.plan.md | Checkpoint 2 4질문 빠른 수렴 (모두 Recommended 선택) |
| Design | ~8분 | docs/02-design/features/monitor-target.design.md | Option C 선택. 7-module map 의존성 정렬 명확 |
| Do | ~30분 | 8개 파일 touched (1 신규 + 8 수정) + 2 추가 개선 | Single session, M1→M2→M3→M6→M4→M5→M7 |
| Test (자가) | ~3분 | tsc + electron tsc + dev boot | 양쪽 빌드 클린 통과 |
| Test (사용자) | ~10분 | dev log (12:32~12:36) + 2 UX 피드백 | 4회 모니터 전환 모두 즉시 반영 |
| 사용자 피드백 수정 | ~12분 | Preview.tsx + PlaybackControls.tsx | 5760 + 3분할선 분리, mode-scoped 카운터 |
| Check | ~5분 | docs/03-analysis/monitor-target.analysis.md | Match 100% — gap-detector 호출 없이 직접 (full context) |
| Report | ~5분 | docs/04-report/monitor-target.report.md | (현 문서) |

### 4.1 Validation-Driven Improvements

Plan/Design은 main process placement 라인만 다뤘으나, 사용자 테스트 중 visual layer 2건 추가 발견·수정:

1. **Preview** (사용자: "5760+3분할선이 Surround와 동일해 혼돈됨") — Preview는 SignageRenderer의 tileCount를 그대로 사용하고 있어 mode='individual' + target null이면 여전히 5760 표시. Preview만 별도 분기로 항상 1920×1080 단일 뷰. CSS의 baked-in scale(0.1056)을 인라인 동적 scale로 교체.
2. **PlaybackControls 카운터** (사용자: "1/4가 모드 합산으로 표시됨") — Preview·SignageRenderer는 이미 mode 필터를 쓰지만 PlaybackControls는 `slides.length` 전체를 사용. Pre-existing 버그였으나 v1.7 검증 중 발견. `visibleSlides = filter(mode)` 패턴으로 통일.

→ PDCA Check가 "현 사이클 외" 버그 발견 채널 역할도 했다 (v1.6 ui-polish의 window.confirm 패턴과 동일 구조).

## 5. Files Changed Summary

**Created (1)**:
- `hooks/useDisplays.ts` (~60 LOC) — 디스플레이 enumeration hook (IPC + 이벤트 구독)

**Modified (8 required + 2 bonus = 10)**:
- `lib/options/types.ts` — SelectOptionSchema에 optionsProvider + showWhen 옵셔널 필드
- `lib/options/registry.ts` — signage.targetDisplayId entry 추가
- `electron/main.ts` — getTargetDisplay, applyPlacement, broadcastDisplays helper + screen.on 3종 + eventBus.on
- `electron/preload.ts` — `displays-changed` 채널 화이트리스트
- `components/OptionField.tsx` — DisplaySelectInput + showWhen 게이트
- `hooks/useDisplayMetrics.ts` — mode+target 분기 (tile=1)
- `package.json` — 1.6.0 → 1.7.0
- `docs/manuals/quick-start.html` — 출력 모니터 옵션 항목 추가
- ➕ `components/Preview.tsx` — previewTileCount + 인라인 scale (Individual 1920×1080)
- ➕ `components/PlaybackControls.tsx` — mode-scoped visibleSlides + 카운터

**Total**: 11 file touches, ~340 LOC (Design 추정 260의 +31% — visual layer 2건 포함 시)

## 6. Memory Captured

해당 사이클은 v1.6의 `feedback_electron_native_dialogs.md` 같은 환경 특이 이슈를 새로 발견하진 않았다. 그러나 다음 학습은 향후 mode-dependent 변경 시 유용:

| Pattern | Insight |
|---------|---------|
| Mode-dependent visual layer scan | "사이니지 모드"처럼 데이터 흐름 + UI 둘 다 영향 주는 옵션 변경 시, 검증 대상에 Preview/Counter 같은 visual layer까지 포함해야 한다. v1.7에서 처음에 누락됐다 사용자 피드백으로 회복됨. |
| eventBus + screen 이벤트 idempotent trigger | 두 채널이 동일 함수를 호출해도 setBounds는 idempotent. 단순 구조의 안정성 재확인. |

(별도 메모리 파일 생성 불필요 — 추후 모드 의존 기능 추가 시 이 보고서가 참조점.)

## 7. Lessons Learned

1. **Visual layer mismatch는 데이터 흐름 변경의 흔한 부산물**: v1.7은 placement 로직만 바꿨는데 Preview·Counter가 mode 필터를 일관 적용하지 않아 시각적 mismatch가 즉시 드러났다. 다음 mode 의존 변경 사이클은 Design 단계에서 visual layer를 "변경 없음으로 가정 가능한가" 명시적 검토 필요.
2. **Fast feedback loop의 효율**: 두 개선 사항이 새 PDCA 사이클을 돌리지 않고 같은 Do 안에서 발견·해소됐다 (~12분 추가). 이 패턴은 v1.6 `window.confirm`과 동일하며 PDCA의 자기 회복력을 다시 보여준다.
3. **Optional fields의 가치**: `optionsProvider?` + `showWhen?`를 SelectOptionSchema에 옵셔널로 추가한 결정 덕분에 기존 4개 옵션은 코드 한 줄도 안 바뀌었다. 회귀 0건의 기술적 기반.
4. **Idempotent trigger의 단순함**: applyPlacement가 idempotent해서 eventBus·screen 양쪽 이벤트가 동시 발화해도 race 보호 코드 불필요. 단순 구조가 비용 절감.

## 8. Next Steps

1. **즉시**: `git status` → 변경 파일 묶어 v1.7.0 커밋.
2. **태깅**: `v1.7.0` git tag 후 push.
3. **선택 wrap-up**:
   - `docs/manuals/detailed.html`에 출력 모니터 옵션 단락 추가
   - Chrome `--print-to-pdf`로 quick-start.pdf / detailed.pdf 재생성
   - electron-builder NSIS 인스톨러 빌드 + 이전 v1.6.0 release 정리
4. **다음 사이클**: 운영 중 발견되는 새 요구사항을 `/pdca plan {feature}` 로 시작. Out-of-scope 후보: 다중 모니터 동시 출력, 모니터별 다른 슬라이드, NVIDIA Surround 자동 감지 알림.

---

**완료**: 5/5 Success Criteria 충족, Match Rate 100%, Critical/Important Gap 0건.
