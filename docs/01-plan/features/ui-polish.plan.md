# ui-polish — Plan (v1.6.0)

| Field | Value |
|-------|-------|
| Feature ID | ui-polish |
| Target Version | v1.6.0 |
| Created | 2026-05-13 |
| Owner | kdi@xenoglobal.co.kr |
| Phase | Plan |
| Predecessor | v1.5.0 matrix-control |

## Executive Summary

| Perspective | Summary |
|-------------|---------|
| Problem | 우측 패널 8개 섹션 중 운영 옵션/매트릭스 제어는 평상시 점유 면적이 큼. 또한 매트릭스 라우팅을 빈번히 바꾸는 운영 시나리오에서 8×8 그리드를 매번 수동 클릭하는 비용이 크다. |
| Solution | (1) 운영 옵션·매트릭스 제어 헤더에 독립 접기/펴기 토글, (2) 매트릭스 헤더 우측에 "프리셋 추가" 버튼 + 출력 채널 선택 모달, (3) 매트릭스 그리드 위 가로 프리셋 버튼 스트립(클릭=적용 / 우클릭=삭제 확인). |
| Function UX Effect | 사용 빈도 낮은 영역을 즉시 접어 화면 정리. 자주 쓰는 라우팅 조합을 1클릭으로 일괄 적용. 우클릭→확인→자동 재정렬로 관리 부담 최소화. |
| Core Value | "운영자 시야 정리 + 라우팅 1클릭화" — 매트릭스가 동작하는 현장 운영 흐름에 직접적인 시간/실수 감소 효과. |

## Context Anchor

| Key | Value |
|-----|-------|
| WHY | v1.5에서 매트릭스 제어를 도입했으나 운영 중 (a) 운영 옵션/매트릭스 영역이 늘 펼쳐져 공간을 점유하고 (b) 매번 8×8 그리드를 손으로 라우팅해야 하는 비용이 남았다. UI 마감 패치로 운영 효율을 끌어올리는 것이 이번 사이클의 목적. |
| WHO | 단일 호스트 운영자 (kdi). 매트릭스를 일상적으로 조작하며 한 화면에서 슬라이드/플레이백/매트릭스를 동시에 다룬다. |
| RISK | • 접기 상태 영속화 부재 → 재시작마다 기본 접힘 동작이 사용자 기대에 맞아야 함 (요구사항대로 휘발 유지). • 프리셋 일괄 적용 중 race/오류 처리. • 매트릭스 미연결 시 프리셋 영역이 노출되어 혼동을 줄 위험. |
| SUCCESS | (1) 두 섹션이 각각 ▼/▶ 클릭 한 번으로 즉시 접/펴짐. (2) 프리셋 추가 모달이 현재 라우팅을 정확히 캡처. (3) 프리셋 버튼 1클릭 → 매트릭스가 저장된 라우팅대로 변경. (4) 우클릭 → 확인 → 삭제 + 재정렬. (5) 매트릭스 미연결 시 프리셋 UI 숨김. |
| SCOPE | In: 우측 패널 두 섹션 collapse, 매트릭스 프리셋 CRUD/apply, 모달 UI, 우클릭 confirm. Out: 프리셋 영속성 옵션화, 다중 호스트 동기화, 프리셋 import/export, drag-reorder, 단축키. |

## 1. Overview

v1.6.0 사이클은 **마감 패치(polish)** 성격이다. 새로운 도메인 모델(슬라이드, 모드, 매트릭스)을 추가하지 않고, v1.5에서 확립한 매트릭스 제어 채널 위에 다음 3개의 UX 개선을 얹는다.

1. **Right-panel section collapse** — `OperationOptionsPanel`, `MatrixControlPanel` 각각의 헤더에 chevron 토글 추가. 클릭 시 본문(body) 영역만 숨기고 헤더는 유지한다. 상태는 컴포넌트 로컬 React state로만 유지(휘발).
2. **Matrix preset add** — 매트릭스 헤더의 상태 표시(●연결됨) 우측에 "프리셋 +" 버튼. 클릭 시 모달이 떠 출력 채널 1~8 체크박스 + 이름 입력 + 저장 버튼을 제공한다. 저장 시 현재 라우팅 스냅샷에서 선택된 출력 채널의 (input,output) 페어만 추출해 settings에 저장.
3. **Matrix preset bar + apply/delete** — 매트릭스 그리드 위 가로 스트립에 저장된 프리셋이 버튼으로 나열. 클릭 시 `matrix:apply-preset` IPC로 main이 순차 라우팅 명령 전송. 우클릭 시 `window.confirm`으로 삭제 확인 후 settings에서 제거하고 스트립을 재정렬.

매트릭스 미연결 상태에서는 (a) "프리셋 +" 버튼 disabled, (b) 프리셋 버튼 스트립 자체를 숨긴다. 연결 시점에 다시 노출.

## 2. Requirements

### 2.1 Functional

| ID | Requirement |
|----|-------------|
| FR-1 | 운영 옵션 헤더 우측에 ▼/▶ chevron 버튼. 클릭 시 본문 토글. 기본 접힘. |
| FR-2 | 매트릭스 제어 헤더 우측에 ▼/▶ chevron 버튼. 클릭 시 본문 토글(헤더의 IP/포트/연결/상태/프리셋추가 행은 유지). 기본 접힘. |
| FR-3 | 매트릭스 헤더 ●상태 라벨 우측에 "프리셋 +" 버튼. 미연결 시 disabled. |
| FR-4 | "프리셋 +" 클릭 시 모달 표시: 출력 채널 1~8 체크박스 + 이름 입력(maxLength 20) + 저장 + 취소. |
| FR-5 | 저장 클릭 시 main에 IPC. main은 현재 routeMap에서 선택된 output별 input을 추출해 `{id, name, routes:[{input,output}], createdAt}` 형태로 settings `matrix.presets` 배열에 push. |
| FR-6 | 저장 후 매트릭스 그리드 위 스트립에 해당 이름의 버튼 생성. 등록 순서대로 좌→우 정렬. |
| FR-7 | 프리셋 버튼 좌클릭 시 `matrix:apply-preset(id)` IPC. main이 routes 배열을 순차로 PN-8080에 전송. |
| FR-8 | 프리셋 버튼 우클릭 시 `window.confirm('"name" 프리셋을 삭제하시겠습니까?')` 표시. OK 시 settings에서 제거 후 스트립 재정렬. |
| FR-9 | 매트릭스 미연결 상태(state ≠ connected)에서는 "프리셋 +" disabled + 프리셋 스트립 hidden. |
| FR-10 | 모달은 ESC 키, 배경 클릭, 취소 버튼으로 닫힘. 이름 비었거나 선택 채널 0개면 저장 disabled. |

### 2.2 Non-Functional

| ID | Requirement |
|----|-------------|
| NFR-1 | 접기 토글 응답성: 50ms 내 시각 변화. |
| NFR-2 | 프리셋 일괄 적용 응답성: 8채널 전체 적용 1.5초 이내(채널당 ~150ms × 8 + 여유). |
| NFR-3 | 프리셋 일괄 적용 중 한 채널이 실패해도 다음 채널 계속 시도(best-effort). 실패 로그는 onLog로 흘림. |
| NFR-4 | 프리셋 개수 상한 20개(스트립 가로 공간 한계). 초과 시 모달 저장 disabled + 안내. |
| NFR-5 | TypeScript any 금지. IPC 인자는 `MatrixPreset`, `MatrixAddPresetArgs` 등 명시 타입. |

### 2.3 Out of Scope

- 프리셋 영속화 옵션화(현재는 항상 settings 저장; 휘발 옵션은 미제공)
- 프리셋 이름 편집 인라인 UI (v1.6에서는 삭제 후 재등록만 지원)
- 프리셋 drag reorder
- 프리셋 단축키(F1~F8)
- 매트릭스 외 다른 패널(Preview, PlaybackControls) collapse
- 다중 호스트 동기화 (이전 사이클과 동일하게 host-only)

## 3. Acceptance Criteria

| ID | Given | When | Then |
|----|-------|------|------|
| AC-1 | 앱 부팅 후 우측 패널 표시 | — | 운영 옵션/매트릭스 제어 모두 기본 접힘 상태로 헤더만 노출 |
| AC-2 | 운영 옵션 헤더의 chevron 클릭 | — | 본문이 펼쳐지고 chevron이 ▼로 변경 |
| AC-3 | 매트릭스 connected 상태 | "프리셋 +" 클릭 | 모달이 열림. 출력 1~8 체크박스, 이름 입력, 저장(초기 disabled) 표시 |
| AC-4 | 매트릭스 disconnected | — | "프리셋 +" 버튼 disabled. 프리셋 스트립 hidden |
| AC-5 | 모달에서 채널 2,3,5 체크 + "메인" 입력 | 저장 클릭 | 모달 닫힘. 그리드 위 스트립에 "메인" 버튼 등장 |
| AC-6 | 저장 직전 routeMap: out2←in1, out3←in1, out5←in4 | 저장 클릭 후 다른 채널들 라우팅 변경 | "메인" 버튼 클릭 시 out2←in1, out3←in1, out5←in4로 복원 (out1,4,6,7,8은 불변) |
| AC-7 | "메인" 버튼 우클릭 | confirm OK | 스트립에서 "메인" 사라지고, 다른 프리셋이 있다면 좌측으로 재정렬 |
| AC-8 | 적용 중 매트릭스 응답이 E01(오류) | — | 해당 채널 onLog에 fail 기록, 나머지 채널 계속 진행 |
| AC-9 | 프리셋 20개 등록된 상태 | "프리셋 +" 클릭 | 모달의 저장 버튼이 항상 disabled + 안내 메시지 표시 |
| AC-10 | 모달 열린 상태 | ESC 키 누름 / 배경 클릭 | 모달 닫힘 |

## 4. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| 프리셋 적용 중 race (사용자가 그 사이 그리드 직접 클릭) | Low | Medium | matrixManager의 기존 single-flight 큐 재사용. preset 적용 명령은 매트릭스 ServiceQueue에 enqueue → 사용자 직접 클릭은 자연스럽게 그 뒤로 큐잉. |
| 응답 형식 변종으로 일부 채널만 적용 후 fail | Med | Med | `applyResponseOrFallback` 패턴 그대로 재사용. 실패해도 다음 채널로 진행. |
| settings JSON 손상(수동 편집 등) | Low | Low | 로드 시 try/catch → 빈 배열로 폴백. |
| 컴포넌트 collapse가 매트릭스 라이프사이클(autoConnect)에 영향 | Low | Med | collapse는 렌더링만 토글. useMatrix() 훅은 RightPanel 최상위에서 유지되므로 영향 없음. |
| 매트릭스 미연결 시 프리셋이 보여 혼동 | Med | Low | FR-9 기준: connected 아닐 때 스트립/추가 버튼 모두 hide+disable. |

## 5. Success Criteria

- SC-1: AC-1~AC-10 전부 통과
- SC-2: 8채널 일괄 적용 1.5초 이내(실측 로그로 확인)
- SC-3: 매트릭스 미연결 → 연결 전환 시 스트립이 즉시 노출, 미연결 복귀 시 즉시 숨김
- SC-4: 접기/펴기 토글이 다른 섹션의 레이아웃을 흔들지 않음(reflow만, layout shift 없음)
- SC-5: 모든 IPC 인자/응답이 `types/matrix.ts`에 타입 명시, any 0건

## 6. Dependencies

- v1.5.0 matrix-control (Pn8080MatrixService, matrixManager, MatrixControlPanel) — 그대로 활용
- nanoid (기존 dependency) — preset.id 생성
- settings 키 새로 추가: `matrix.presets` (default `[]`)

## 7. Open Questions

(없음 — 4개 Checkpoint 질문 모두 응답 수령. 본 사이클은 정의된 범위로 진행.)

## 8. Estimated Effort

| Phase | Estimated | Notes |
|-------|-----------|-------|
| Design | 30분 | 3안 비교 + 선택 |
| Do | 2.5시간 | 신규 컴포넌트 2개, IPC 3개, 서비스 메서드 1개, 타입/스토어/CSS |
| Check | 20분 | gap-detector + matchRate |
| Report | 15분 | report-generator |
