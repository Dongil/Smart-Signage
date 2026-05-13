# Plan: v1.3 UI 재구성 (UI Redesign)

| Field | Value |
|-------|-------|
| Feature key | `ui-redesign` |
| Title (KR) | v1.3 사이니지 패널 확대 + 운영 옵션 도입 |
| Author | dongil |
| Created | 2026-05-13 |
| Target version | v1.3.0 |
| Status | Plan (Checkpoint 2 confirmed) |
| Predecessor | v1.2.2 (`bd5a54a`) |

---

## Executive Summary

| Perspective | Summary |
|-------------|---------|
| **Problem** | 우측 사이니지 패널 320px가 좁아 추가 컨트롤/옵션이 들어갈 자리가 없음. PlaybackControls가 signage off 상태에서 숨어있어 발견성 ↓. 슬라이드 여백/전환효과 등 운영자가 조정하고 싶은 값들이 코드 하드코딩됨. 향후 운영 옵션 추가 시마다 UI 수정 부담. |
| **Solution** | 우측 패널을 320 → 640px로 확대하고 편집 영역 축소. PlaybackControls를 항상 표시(off 시 disabled). 패널 하단에 스키마 레지스트리 기반 **운영 옵션 패널** 신설 — 해상도, 상하 여백, 전환 효과 등을 한 곳에서 관리. 새 옵션은 레지스트리에 1줄 추가만으로 UI 자동 노출. |
| **Function UX Effect** | 운영자가 한 화면에서 슬라이드 편집 + 재생 컨트롤 + 운영 옵션을 모두 조작. PlaybackControls 버튼이 커져서 클릭 정확도 ↑. 옵션 변경(여백/효과) 즉시 미리보기·출력에 반영. 해상도 콤보는 Preview 헤더에서 운영 옵션 패널로 이동해 한 곳에 통합. |
| **Core Value** | "운영자가 봐야 할 모든 것이 우측 패널 안에 있다" — 작업 흐름 단축. 옵션 추가가 1줄 레지스트리 등록 작업이라 향후 요구사항(자동시작, 셔플, 시계 등) 대응 속도 ↑. |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 운영 컨트롤·속성이 늘어남에 따라 320px 패널 한계. 사용자 발견성·확장성 모두 개선 필요. |
| **WHO** | 운영자(호스트 PC): 슬라이드 편집보다 운영 컨트롤·옵션 조정에 시간을 더 씀. |
| **RISK** | (1) 편집 영역 축소로 RichTextEditor 가독성/스케일 영향. (2) 옵션 레지스트리 미설계 시 변경 시 코드 산재. (3) PlaybackControls disabled 표시 일관성. |
| **SUCCESS** | 우측 패널 640px + 4개 옵션(해상도/여백/효과 + 1 예비) 동작. 옵션 변경 1초 내 편집/프리뷰/출력 반영. 부팅 직후 컨트롤 표시 + disabled. |
| **SCOPE** | 8개 요구사항(레이아웃, 컨트롤 확대, 옵션 패널, disabled 상태, 해상도 이동, 여백, 효과, 확장성). 새 옵션 항목(자동시작·셔플 등)은 다음 Plan. |

---

## 1. Overview / Problem

### 1.1 현재 상태

- `app/page.module.css` flex 레이아웃: `SlideList | SlideEditor | Preview(320px)`
- `Preview.module.css` `.preview { width: 320px }`
- PlaybackControls: 32×28 버튼 + 슬라이더 1개, signage off 시 `!signageActive`로 비표시
- BaseRenderer fade: `transition: opacity 0.5s ease-in-out` 하드코딩
- paddingUtils: `calcVerticalPadding(fs, h)` 자동계산 (MAX_PAD=180 ~ MIN_PAD=64)
- ResolutionSelect: Preview 헤더 중간에 위치

### 1.2 문제

- 컨트롤이 좁아 8개 버튼 + 슬라이더 + 시간입력 + 단축키 안내가 모두 들어가니 빽빽
- 미리보기 켜기 전엔 컨트롤 자체가 안 보여 운영자가 "어디서 슬라이드 넘기지?" 혼란
- 슬라이드 여백·전환 속도가 운영 환경마다 다르게 보이는데(긴 본문/짧은 제목) 코드 변경 외 조정 불가
- 해상도 콤보가 Preview 헤더의 상태배지와 같은 줄에 있어 시각 노이즈

### 1.3 해결 방향

- **레이아웃**: 우측 패널 320 → 640px. SlideList(고정 240) + SlideEditor(나머지) + RightPanel(640)
- **RightPanel 구성** (위→아래):
  - PreviewMiniature (slide thumbnail, 16:3/24:5 aspect-ratio)
  - PlaybackControls (always-visible, scaled up)
  - OperationOptionsPanel (schema-driven)
- **OperationOptionsPanel**: `lib/options/registry.ts` — schema 배열 정의 후 자동 폼 생성
- **호환**: 모든 옵션은 SQLite `settings` 테이블에 영구 저장, SSE로 즉시 동기화 (기존 인프라 재사용)

---

## 2. Scope

### 2.1 In Scope

| # | Item | 매핑 (사용자 요구사항) |
|---|------|----------------------|
| 1 | 우측 패널 320 → 640px, 편집 영역 축소 | 요구 1 |
| 2 | PlaybackControls 크기 ↑ (버튼 ~48px, 슬라이더 폭 ↑) | 요구 2 |
| 3 | 운영 옵션 패널 신설 (RightPanel 하단) | 요구 3 |
| 4 | PlaybackControls 상시 표시, off 시 disabled | 요구 4 |
| 5 | ResolutionSelect를 Preview 헤더 → 운영 옵션 패널로 이동 | 요구 5 |
| 6 | "슬라이드 상하 여백" 옵션 추가, 기존 `calcVerticalPadding` 대체 | 요구 6 |
| 7 | "전환 효과(초)" 옵션 추가, 0=CUT, BaseRenderer CSS 변수화 | 요구 7 |
| 8 | 옵션 스키마 레지스트리 패턴 도입 | 요구 8 |

### 2.2 Out of Scope

- 새로운 옵션 항목(자동시작·셔플·시계 등) — 별도 Plan으로 옵션 1줄씩 추가
- SlideList 너비 조정 — 현재값 유지
- 모바일/반응형 — 데스크탑 고정 1920+ 폭 가정
- 옵션 카테고리/검색 — 단일 리스트로 시작

---

## 3. Functional Requirements

| ID | Requirement | Acceptance |
|----|-------------|------------|
| FR-1 | Editor body grid: SlideList 240px + SlideEditor flex + RightPanel 640px | 시각 확인 |
| FR-2 | RightPanel: 위 PreviewMiniature → 중 PlaybackControls → 하 OperationOptionsPanel 순 | 시각 확인 |
| FR-3 | PlaybackControls 항상 렌더링; `signageActive=false`면 모든 버튼·슬라이더·입력 `disabled`, opacity 0.5 | 클릭 시 무반응 |
| FR-4 | PlaybackControls 버튼 ≥ 44px (터치 친화), 슬라이더 행 한 줄 차지 | 시각 확인 |
| FR-5 | OperationOptionsPanel은 `lib/options/registry.ts`의 schema를 읽어 자동 폼 생성 | 새 옵션 1줄 추가 → 자동 노출 검증 |
| FR-6 | 옵션 항목: `signage.resolution`(select), `slide.padding`(number 0-300), `slide.transitionSec`(number 0-3) | 4개 |
| FR-7 | 모든 옵션 변경은 `settings` 테이블 영속 + SSE `settings.changed` broadcast | 원격 PC 동기 |
| FR-8 | `slide.padding` 값이 `TextSlide`/`RichTextEditor`의 calcVerticalPadding을 대체 | 텍스트 위/아래 위치 변경 시각 확인 |
| FR-9 | `slide.transitionSec` 값이 BaseRenderer의 fade duration 결정. 0 = `transition: none` | 5760×1080 모니터 시각 확인 |
| FR-10 | ResolutionSelect는 Preview 헤더에서 제거, OperationOptionsPanel에 표시 | 코드 grep 확인 |
| FR-11 | RightPanel 폭 640px 시 기존 v1.2.2 기능(슬라이드 CRUD, IME, 단축키) 무회귀 | 회귀 체크리스트 |

---

## 4. Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | TypeScript any 금지 | tsc strict pass |
| NFR-2 | 신규 옵션 1개 추가 시 코드 변경 라인 | 스키마 등록 ≤ 10 line, 소비처(if 필요) ≤ 5 line |
| NFR-3 | 옵션 변경 → 화면 반영 latency | < 1초 (로컬), < 2초 (원격 SSE) |
| NFR-4 | 옵션 영구 저장 (재시작 후 복원) | settings 테이블 검증 |
| NFR-5 | OperationOptionsPanel 폼 컴포넌트 단위 테스트 가능 구조 | schema → input 매핑 분리 |
| NFR-6 | RightPanel 640px 폭에서 PlaybackControls 가독성 | 버튼·라벨 ≥ 14px |

---

## 5. Success Criteria

| ID | Criteria | Verification |
|----|----------|--------------|
| SC-1 | 부팅 직후 RightPanel에 PreviewMiniature + Controls(disabled) + Options 모두 표시 | 수동 |
| SC-2 | "사이니지에 표시" 클릭 → 1초 내 Controls 모두 enabled | 수동 |
| SC-3 | 운영 옵션 패널에서 해상도 1080 ↔ 1200 변경 → 캔버스 즉시 갱신 | 수동 (v1.2.1 회귀 확인) |
| SC-4 | 상하 여백 슬라이더 50 → 100 변경 → 텍스트 슬라이드 padding 즉시 적용 | 수동 |
| SC-5 | 전환 효과 0 → 1초 변경 → 슬라이드 전환이 1초 fade로 보임 | 수동 (5760 모니터) |
| SC-6 | 새 옵션 1개를 registry에 1줄 추가 → 코드 다른 곳 수정 없이 UI에 노출 | 데모 |
| SC-7 | 앱 재시작 후 모든 옵션 마지막 값 유지 | 수동 |
| SC-8 | v1.2.2 기능(슬라이드 CRUD, IME, 단축키, 사이니지 토글, race fix) 무회귀 | 회귀 |

---

## 6. Risks & Mitigations

| ID | Risk | Likelihood | Mitigation |
|----|------|:----------:|------------|
| R-1 | 편집 영역 축소로 RichTextEditor scale이 너무 작아져 가독성 ↓ | M | wrapperRef.clientWidth 기반 scale은 자동 적응. 편집 캔버스 폭 grep 후 시각 검증. 필요 시 minimum scale guard. |
| R-2 | OperationOptionsPanel schema 설계가 향후 요구사항 못 따라감 | M | type='select|number|boolean' 3종 + (label, default, min/max/step/options) 필드만 우선. 복잡해지면 확장. |
| R-3 | `slide.padding` 도입 후 기존 슬라이드의 폰트가 너무 크거나 작아 보임 | M | default 값을 기존 평균(예: 80)으로 설정. 시각 회귀 시 사용자가 즉시 조정. |
| R-4 | `slide.transitionSec` 0이면 시청자에게 "딱딱한 컷"이 부자연스러울 수 있음 | L | default 0.5초 유지. 0은 명시 선택 시만. |
| R-5 | 컨트롤 항상 표시로 부팅 직후 disabled 상태가 "고장난 화면"으로 오해 | L | "사이니지에 표시" 버튼이 명확히 보이고, disabled 컨트롤 위 안내 텍스트("사이니지 표시 후 사용 가능") 부착. |
| R-6 | 향후 옵션 누적 시 패널이 길어져 스크롤 부담 | L | 우선 단일 리스트 + max-height + overflow-y:auto. 추후 섹션 분리 옵션. |
| R-7 | 새 schema 옵션이 SSE 동기화에서 누락 | L | 모든 옵션이 setSetting 경유 → 기존 settings.changed 이벤트로 일괄 처리. |

---

## 7. Open Questions (Resolved)

| ID | Question | Decision |
|----|----------|----------|
| Q-1 | 상하 여백 옵션 동작 | **자동계산 대체** — calcVerticalPadding 무시, 사용자 px 그대로 |
| Q-2 | PlaybackControls off 상태 | **disabled, 무반응** — opacity 0.5, click no-op |
| Q-3 | 전환 효과 형태 | **숫자 하나 (초)** — 0=CUT, >0=fade duration |
| Q-4 | 옵션 확장 패턴 | **스키마 레지스트리** — 1줄 등록 → 자동 폼 |

---

## 8. Dependencies & Affected Files

### 8.1 새 파일 (예상 5개)
- `lib/options/registry.ts` — schema 정의 + helper
- `lib/options/types.ts` — OptionSchema 타입
- `components/OperationOptionsPanel.tsx` + `.module.css`
- `components/PreviewMiniature.tsx` (기존 Preview의 상단 부분 분리) — 또는 Preview.tsx 내 통합 유지

### 8.2 수정 파일 (예상)
- `app/page.module.css` — body grid 비율
- `components/Preview.{tsx,module.css}` — 320 → 640, ResolutionSelect 제거, header 정리
- `components/PlaybackControls.{tsx,module.css}` — 버튼 크기 확대, always-visible + disabled prop
- `components/Toolbar.tsx` — 동작 변경 없음 (검토 필요)
- `components/editors/paddingUtils.ts` — `slide.padding` 옵션이 있으면 그 값을 그대로 반환하도록 변경
- `components/renderers/BaseRenderer.{tsx,module.css}` — fade duration을 CSS var(`--slide-transition`)로
- `components/DisplayCssVarBridge.tsx` — `--slide-transition`, `--slide-padding-y` 추가 set
- `store/useSignageStore.ts` 또는 새 store — 옵션 상태 추가 + setter
- `electron/db/seed.ts` — 새 옵션 키 default seed
- `components/renderers/TextSlide.tsx` — slide.padding 적용 분기
- `components/editors/RichTextEditor.tsx` — 동일

### 8.3 외부 의존성
- 신규 npm 패키지 0
- 기존 SQLite settings API + SSE 인프라 재사용

---

## 9. Next Phase

`/pdca design ui-redesign` — 아키텍처 3안 비교 + 옵션 레지스트리 형태 결정 + 모듈 분할
