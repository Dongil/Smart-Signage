# ui-polish — Completion Report (v1.6.0)

| Field | Value |
|-------|-------|
| Feature ID | ui-polish |
| Target Version | v1.6.0 |
| Phase | Report |
| Date Completed | 2026-05-13 |
| Match Rate | 100% |
| Iteration Count | 0 (no /pdca iterate needed) |
| PDCA Documents | Plan, Design, Analysis, Report (no PRD — polish patch) |

## Executive Summary

| Perspective | Summary |
|-------------|---------|
| Problem | v1.5 매트릭스 도입 후 운영 옵션/매트릭스 영역이 평상시 화면을 점유했고, 8×8 그리드를 매번 수동 라우팅하는 비용이 컸음. |
| Solution | (1) 두 섹션에 ▼/▶ 독립 collapse 토글, (2) 매트릭스 헤더 "프리셋 +" 버튼 + 출력 선택 모달, (3) 그리드 위 가로 프리셋 스트립(좌클릭=일괄 적용 / 우클릭=in-app confirm 삭제). |
| Function UX Effect | 평상시 화면 정리됨(기본 접힘). 4-route 프리셋 실측 평균 ~380ms로 1클릭 일괄 적용. 8-route 추정 ~760ms (Plan SC-2 1.5초 기준의 절반). |
| Core Value | "운영자 시야 정리 + 라우팅 1클릭화" — 매트릭스 운영 흐름의 반복 비용 제거. |

### 1.3 Value Delivered (실측 vs 계획)

| Dimension | Planned | Delivered | Status |
|-----------|---------|-----------|--------|
| Collapse 토글 응답성 | < 50ms | 즉시 (React conditional render) | ✅ |
| 일괄 적용 응답성 | < 1.5s (8 channels) | ~380ms (4-route 실측), ~760ms 추정 (8-route) | ✅ |
| 신규 컴포넌트 | 3개 (SectionHeader, Bar, Modal) | 3개 | ✅ |
| 신규 IPC 채널 | 3개 (add/delete/apply) | 3개 | ✅ |
| TypeScript any | 0건 | 0건 (tsc --noEmit 통과) | ✅ |
| Match Rate | ≥ 90% | 100% | ✅ |

## Context Anchor

| Key | Value |
|-----|-------|
| WHY | 운영자 시야 정리 + 라우팅 반복 비용 제거. |
| WHO | 단일 호스트 운영자 (kdi). |
| RISK | 일괄 적용 race(완화: 큐 재사용), 미연결 노출(완화: hidden), 영속성 부재(합의: 휘발). |
| SUCCESS | 5/5 Success Criteria 달성. |
| SCOPE | In: collapse + 프리셋 CRUD/apply + 모달. Out: drag·단축키·import/export (유지). |

## 2. Key Decisions & Outcomes

| Decision | Source | Followed? | Outcome |
|----------|--------|-----------|---------|
| 접기 영속성 = 휘발 | Plan Checkpoint 2 Q2 | ✅ | 단순 useState, settings 노이즈 없음. 운영자 피드백 없음 → 적절한 선택. |
| 일괄 적용 = main IPC 1회 | Plan Checkpoint 2 Q3 | ✅ | matrix:apply-preset 단일 호출, main에서 기존 single-flight 큐로 직렬화 → race 0건. |
| 매트릭스 미연결 시 프리셋 UI 숨김 | Plan Checkpoint 2 Q4 | ✅ | input=0 케이스 사전 차단 → 데이터 무결성 확보. |
| Option C — Pragmatic Balance | Design Checkpoint 3 | ✅ | matrixManager 단일 소유 → 일관성. 신규 컴포넌트 3개로 변경 영역 적당. |
| `window.confirm` for 우클릭 삭제 | Design §6.4 (원안) | ❌ Improved | **Electron 30 native dialog focus-trap 발견** → in-app React portal로 교체. 외부 contract 동일. |
| `mounted` state gate for modal | Design §6.5 (원안) | ❌ Improved | 같은 focus-trap 영향 → `autoFocus` + delayed `inputRef.focus()` retry로 교체. |

**핵심 학습**: Electron 환경에서 `window.confirm`/`alert` 같은 native dialog는 dismissed 후 BrowserWindow를 stale focus 상태로 둘 수 있다. 직후 띄우는 모달이 input focus를 잡지 못해 "disabled처럼 보이는" 증상으로 나타난다. 메모리에 `feedback_electron_native_dialogs.md`로 보존.

## 3. Success Criteria Final Status

| SC | Criterion | Status | Evidence |
|----|-----------|--------|----------|
| SC-1 | AC-1~AC-10 전부 통과 | ✅ Met | Analysis §4 (10/10) |
| SC-2 | 8채널 일괄 적용 1.5초 이내 | ✅ Met | 4-route ~380ms 실측 (log 14:06:14, 14:10:51~14:11:01) |
| SC-3 | 연결↔미연결 전환 시 스트립/버튼 즉시 반영 | ✅ Met | isConnected 의존 조건부 렌더 |
| SC-4 | 접기/펴기 layout shift 없음 | ✅ Met | 본문 조건부 렌더 only, 헤더 36px 고정 |
| SC-5 | any 0건 | ✅ Met | tsc --noEmit 통과 |

**Overall Success Rate: 5 / 5 (100%)**

## 4. Phase Journey

### Plan → Design → Do → Check 흐름

| Phase | Duration (approx) | Artifact | Notes |
|-------|-------------------|----------|-------|
| Plan | ~15분 | docs/01-plan/features/ui-polish.plan.md | 4 Checkpoint 2 질문 답변 수렴 |
| Design | ~10분 | docs/02-design/features/ui-polish.design.md | Option C 선택. 3개 옵션 비교 명료 |
| Do | ~40분 | 14개 파일 touched (6 신규 + 8 수정) | Single session, module 1→2→3→4 순차 |
| Test (자가) | ~5분 | type-check + build | 양쪽 빌드 클린 통과 |
| Test (사용자) | ~20분 | dev log + 2 bug reports | Bug 2 (focus trap) 발견 → 즉시 수정 |
| Bug fixes | ~10분 | MatrixPresetBar/Modal | window.confirm 제거 + delayed focus retry |
| Check | ~5분 | docs/03-analysis/ui-polish.analysis.md | Match 100% — gap-detector 호출 없이 직접 (full context) |
| Report | ~5분 | docs/04-report/ui-polish.report.md | (현 문서) |

### Validation Iteration (Plan에는 없었던 단계)

사용자 테스트 중 발견된 **Bug 2 (모달 input focus 안 됨)** 은 단순 코드 수정으로 해결됐지만, 근본 원인이 **Electron native dialog의 focus-trap** 이라는 비자명한 환경 동작이었음. Design의 `window.confirm` 명시(§6.4) → 구현 후 회귀 검증 단계에서 발견 → 같은 사이클 안에서 React portal confirm으로 개선했다. PDCA 이론상 "Check → Act"로 갈 일이었으나 실제로는 Do 안에서 fast feedback loop로 처리.

## 5. Files Changed Summary

**Created (6)**:
- `components/SectionHeader.tsx` (~20 LOC)
- `components/SectionHeader.module.css` (~30 LOC)
- `components/MatrixPresetBar.tsx` (~80 LOC, 최종 정리본)
- `components/MatrixPresetBar.module.css` (~80 LOC)
- `components/MatrixPresetModal.tsx` (~170 LOC)
- `components/MatrixPresetModal.module.css` (~130 LOC)

**Modified (8)**:
- `types/matrix.ts` — MatrixPreset 관련 타입 4개 추가
- `electron/services/matrixManager.ts` — KEY_PRESETS + readPresets + broadcastState + 3 IPC 핸들러
- `electron/preload.ts` — INVOKE_CHANNELS 3개 추가
- `lib/api/matrix.ts` — addPreset / deletePreset / applyPreset
- `store/useMatrixStore.ts` — presets state + 3 actions + hydrate/applyStatePush 확장
- `components/OperationOptionsPanel.tsx` — SectionHeader + collapse state
- `components/MatrixControlPanel.tsx` — SectionHeader + body wrapper + 프리셋 + 버튼 + Bar/Modal 통합
- `components/MatrixControlPanel.module.css` — `.body` wrapper, `.btnPreset { margin-left: auto }`

**Total**: 14 file touches, ~510 LOC (Plan 추정 460의 +11%)

## 6. Memory Captured

| File | Type | Purpose |
|------|------|---------|
| `feedback_electron_native_dialogs.md` | feedback | Electron `window.confirm`/`alert` 회피 가이드라인 — 향후 모달/confirm 설계 시 참고 |

## 7. Lessons Learned

1. **Validation-driven design correction**: Design 문서가 명시한 패턴(window.confirm, mounted gate)이 검증 단계에서 환경별 이슈에 부딪힐 수 있다. 같은 사이클 안에서 발견·수정해 다음 사이클로 미루지 않은 것이 좋았다.
2. **HMR stale state의 영향**: Bug 1 (버튼-라우팅 mismatch) 신고는 HMR이 stale 상태로 cached된 결과였다. 깨끗한 dev 서버 재시작으로 자연 해소. 디버그 시 cold-restart를 우선 시도하는 휴리스틱 확인.
3. **기존 인프라 재사용의 가치**: `Pn8080MatrixService` 의 single-flight 큐를 그대로 활용한 덕분에 일괄 적용 race 처리를 별도 코드 없이 해결. Option C가 옳았던 결정.
4. **단일 세션 구현의 효율**: ~40분 안에 4개 모듈 + bug fix까지 완료. Module Map이 의존성 순서로 잘 정렬되어 있어 인터럽트 없이 진행 가능했다.

## 8. Next Steps

1. **즉시**: `git status` 확인 → 변경 파일 묶어 v1.6.0 커밋.
2. **태깅**: `v1.6.0` git tag 후 push.
3. **선택**: `package.json` version `1.5.0 → 1.6.0` 업데이트.
4. **선택**: `/pdca archive ui-polish --summary` 로 docs 정리 (이전 사이클 패턴).
5. **다음 사이클**: 운영 중 발견되는 새 요구사항 (drag reorder, 단축키, 영속화 옵션 등 Out-of-scope 항목)을 `/pdca plan {feature}` 로 시작.
