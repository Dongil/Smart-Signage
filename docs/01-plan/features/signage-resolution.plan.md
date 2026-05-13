# Plan: 사이니지 해상도 변경 (Signage Resolution Config)

| Field | Value |
|-------|-------|
| Feature key | `signage-resolution` |
| Title (KR) | 사이니지 해상도 변경 |
| Author | dongil |
| Created | 2026-05-13 |
| Status | Plan (Checkpoint 2 confirmed) |
| Predecessor | smart-signage v1.2.0 (e711fd7) |

---

## Executive Summary

| Perspective | Summary |
|-------------|---------|
| **Problem** | 운영 사이니지 해상도가 5760×1080으로 코드 전체에 하드코딩되어, 현장 모니터가 1200 높이로 잡히는 환경에서 편집/프리뷰/실출력 비율이 어긋남. |
| **Solution** | 운영 해상도(높이 1080 또는 1200)를 SQLite settings에 저장하고, 모든 캔버스 상수·CSS·폰트 계산이 store 값을 구독하도록 일원화. UI는 Preview 패널 상단의 콤보로 전환. |
| **Function UX Effect** | 우측 사이니지 패널 상단에 `5760×1080 / 5760×1200` 드롭다운 → 즉시 편집 캔버스·프리뷰 스케일러·HWPX 미리보기·텍스트 폰트 패딩이 새 해상도로 재계산. 원격 LAN 편집자에게도 SSE로 즉시 전파. |
| **Core Value** | 현장 셋업과 dev 환경의 비주얼 일관성 확보 — "내가 편집기에서 본 그대로가 사이니지에 뜬다"는 신뢰. 향후 4K 해상도 추가 시 옵션만 늘리면 됨. |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 현장 NV Surround가 5760×1200을 강제하는 디스플레이가 있어 dev(1080) 기준과 출력이 어긋남. WYSIWYG 신뢰 회복. |
| **WHO** | 운영자(호스트 PC, 현장 설치 후 1회 설정) + 원격 LAN 편집자(설정값을 일관되게 본다). |
| **RISK** | (1) 기존 슬라이드 폰트가 1080 기준이라 1200 전환 시 패딩 어색할 수 있음 — `paddingUtils` 동적화로 해소. (2) `aspect-ratio: 16/3` CSS 하드코딩 다수 — 동적 inline style로 교체. (3) HWPX 임포트 캔버스도 동시 변경 필요. |
| **SUCCESS** | 콤보 변경 후 1초 안에 편집/프리뷰/HWPX 미리보기/원격 클라이언트 모두 새 캔버스 비율로 표시되고, 앱 재시작 후에도 선택값 유지. |
| **SCOPE** | 5760×1080 vs 5760×1200 두 옵션만. 폭(5760) 변경, 4K, 임의 해상도 입력은 별도 Plan. |

---

## 1. Overview / Problem

### 1.1 현재 동작

`grep 5760` 결과 — 다음 9개 지점이 하드코딩:

| File | 위치 | 종류 |
|------|------|------|
| `components/editors/RichTextEditor.tsx` | L13-14 `CANVAS_W=5760, CANVAS_H=1080` | TS 상수 |
| `components/editors/RichTextEditor.module.css` | L90/104/117/126 `width: 5760px; height: 1080px` | CSS |
| `components/editors/paddingUtils.ts` | L10 `DISPLAY_H = 1080`, L5-7 폰트 공식 | TS 상수 |
| `components/Preview.module.css` | L40 `aspect-ratio: 16/3`, L52/53/67/68 5760×1080 | CSS |
| `components/renderers/TextSlide.module.css` | L2-3 width/height | CSS |
| `components/import/HwpxPreviewSlide.tsx` | L15-16 `CANVAS_W/H` | TS 상수 |
| `components/import/HwpxImport.module.css` | L185-186 | CSS |
| `electron/main.ts` | signage `BrowserWindow` 크기는 display.bounds 사용 (변경 불필요) | — |
| 문서 (`README.md`, `signage-project-guide.md`, `react-best-practices.md`) | 텍스트만 갱신 | — |

### 1.2 문제

- 현장 모니터가 ASUS/삼성 등 NV Surround에서 1080p 패널 3개로 5760×1200 (베젤 보정/모드 차이) 잡히면 편집 1080 캔버스가 출력 1200에서 위/아래 띠 또는 잘림
- `paddingUtils`가 1080을 가정해 폰트 크기 계산 → 1200에선 텍스트가 화면 중앙에 적게 차지
- 코드 다수 지점 분산으로 한 곳만 바꿔도 부분 적용되는 사고 가능

### 1.3 해결 방향

- **단일 source of truth**: SQLite `settings` 테이블 `signage.resolution = {w: 5760, h: 1080|1200}` (1개 키)
- **store 미러**: `useSignageStore`에 `resolution: {w, h}` 추가, 부팅 시 settings → store 적재, 변경 시 store → setSetting + SSE broadcast
- **CSS 하드코딩 제거**: `width/height/aspect-ratio` 모두 인라인 style 또는 CSS custom property(`--canvas-w`, `--canvas-h`)로 전환

---

## 2. Scope

### 2.1 In Scope

- SQLite `settings.signage.resolution` 키 + 마이그레이션(기본값 1080)
- `useSignageStore` 확장: `resolution` 상태 + `setResolution()` 액션
- Preview 패널 상단에 콤보 UI (5760×1080 / 5760×1200)
- 다음 컴포넌트의 캔버스 의존성 store화:
  - `RichTextEditor` (canvas + CSS)
  - `Preview` (scaler + guides + aspect-ratio)
  - `TextSlide` 렌더러
  - `paddingUtils` (함수 시그니처 `(fontSize, displayH)` 또는 store hook 기반)
  - `HwpxPreviewSlide` + `HwpxImport.module.css`
- Express `settings` 라우트는 이미 일반화되어 있어 변경 없음 (`PUT /api/settings/signage.resolution`)
- SSE `settings.changed` 이벤트 + 클라이언트 핸들러 (이미 인프라 존재)
- 영구 저장 + 앱 재시작 후 복원

### 2.2 Out of Scope

- 폭(5760) 변경 — Surround 구성이 폭을 결정하므로 운영 중 변경 불가
- 임의 해상도 입력 (자유 입력 폼)
- 4K 해상도 추가 (5760×2160 등) — 향후 옵션 확장
- 텍스트 슬라이드 데이터 자체의 폰트 크기 마이그레이션 — 렌더링 단계에서 동적 재계산
- 사이니지 BrowserWindow 크기 변경 — display.bounds 사용(이미 자동)

---

## 3. Functional Requirements

| ID | Requirement | Acceptance |
|----|-------------|------------|
| FR-1 | Preview 패널 상단(헤더 아래)에 콤보 박스 표시: `5760×1080`, `5760×1200` 두 옵션 | UI 가시성 |
| FR-2 | 콤보 변경 시 즉시 편집 캔버스/프리뷰 스케일러/가이드/텍스트 렌더러/HWPX 미리보기 캔버스가 새 비율로 갱신 | 시각 회귀 테스트 (스크린샷) |
| FR-3 | 텍스트 슬라이드의 폰트 크기/세로 패딩이 새 `DISPLAY_H` 기준으로 자동 재계산 | `paddingUtils.calcVerticalPadding(fs, h)` 단위 검증 |
| FR-4 | 미디어(이미지/비디오/웹) 슬라이드는 새 캔버스 비율을 cover로 채움 | BaseRenderer 100%/100% 유지 확인 |
| FR-5 | 선택값은 SQLite `settings.signage.resolution`에 영속 저장. 앱 재시작 후 자동 복원 | DB 검사 + 재기동 검증 |
| FR-6 | 호스트에서 변경 시 SSE `settings.changed` 이벤트가 broadcast되어 원격 LAN 브라우저도 1초 이내 동기 반영 | SseBridge 핸들러 + 원격 PC 확인 |
| FR-7 | 부팅 시 settings → useSignageStore.resolution으로 미러링 (없으면 default 1080) | store 초기화 로그 |
| FR-8 | 콤보 변경 시 비활성화 상태(중복 클릭/네트워크 지연) 짧게 표시 후 성공 시 정상 복귀 | UX |

---

## 4. Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | 콤보 변경 → 화면 적용 latency | < 1초 (로컬), < 2초 (원격 SSE) |
| NFR-2 | TypeScript any 금지 (CLAUDE.md 규칙) | tsc strict pass |
| NFR-3 | 기존 슬라이드 데이터 무손실 (DB 마이그레이션 불필요) | slides 테이블 unchanged |
| NFR-4 | 가이드 라인(가운데/오른쪽 모니터 구분선)이 새 캔버스 폭/높이에서도 정확히 1920px 간격 유지 | 시각 확인 |
| NFR-5 | 1080↔1200 토글 50회 시 메모리 누수/렌더 잔상 없음 | 수동 QA |
| NFR-6 | 로깅: 해상도 변경 IPC/SSE 흐름이 main.log에 기록 | `[settings] resolution changed: 1080→1200` 라인 |

---

## 5. Success Criteria

| ID | Criteria | Verification |
|----|----------|--------------|
| SC-1 | 콤보로 1200 선택 → 편집 캔버스가 새 비율로 즉시 변경 (텍스트 폰트도 새 패딩으로) | 수동 |
| SC-2 | 새 비율 상태에서 사이니지 표시 → 확장 모니터 출력이 새 비율로 풀스크린 | 수동 (Surround 실측) |
| SC-3 | 앱 종료 후 재실행 → 마지막 선택값(1200) 유지 | 수동 |
| SC-4 | 원격 PC 브라우저 동시 접속 → 호스트에서 콤보 변경 시 원격 화면도 1초 이내 새 비율 | 수동 (LAN PC) |
| SC-5 | HWPX 파일 임포트 미리보기 캔버스가 운영 해상도와 동일 비율 | 수동 |
| SC-6 | tsc/lint clean + 기존 v1.2 기능(슬라이드 CRUD, 토글, IME, 키보드 단축키) 무회귀 | 회귀 체크리스트 |
| SC-7 | 1080 ↔ 1200 50회 토글 후에도 안정 | 스트레스 |

---

## 6. Risks & Mitigations

| ID | Risk | Likelihood | Mitigation |
|----|------|:----------:|------------|
| R-1 | `paddingUtils`를 인자 기반으로 바꾸면 호출자 다수 수정 → 회귀 | M | 모듈 시그니처 변경 시 컴파일 에러로 모두 강제 노출. 별도 hook `useDisplayMetrics()` 도입 검토. |
| R-2 | CSS 하드코딩이 너무 많아 누락 시 부분 적용 | M | grep 9 지점을 체크리스트화. CSS custom property 1개(`--canvas-h`)로 통일해 누락 시 시각 즉시 식별. |
| R-3 | SSE 이벤트 race condition (편집 중 해상도 바뀜) | L | 변경 시 editingIndex 유지하되 폰트 size는 새 패딩 기준으로 재계산하고 RTE setContent로 refresh. |
| R-4 | aspect-ratio 변경 시 Preview 패널 320px 폭에서 가이드 라인 좌표 오차 | L | guides의 `background-size`도 store 값 의존하도록 inline style 적용. |
| R-5 | 콤보가 빠르게 토글되어 SSE 큐 누적 | L | setSetting debounce 200ms 또는 inflight 가드. |

---

## 7. Open Questions (Resolved)

| ID | Question | Decision |
|----|----------|----------|
| Q-1 | 기존 슬라이드 폰트/패딩 처리 | **자동 재계산** — 렌더링 시 새 DISPLAY_H 기준 |
| Q-2 | 미디어 슬라이드 비율 처리 | **cover 전체 채움** — BaseRenderer 기본 동작 유지 |
| Q-3 | 원격 클라이언트 동기화 | **즉시 SSE 동기화** — settings.changed broadcast |
| Q-4 | HWPX 임포트 미리보기 캔버스 | **운영 해상도와 동일** — store 값 구독 |

---

## 8. Dependencies & Affected Files

### 8.1 새 파일 (예상)
- (선택) `hooks/useDisplayMetrics.ts` — store에서 `{w, h}` 구독해 반환하는 헬퍼

### 8.2 수정 파일
- `electron/db/seed.ts` — `signage.resolution` 기본값 시드
- `store/useSignageStore.ts` — `resolution` 상태 + 액션
- `components/Preview.tsx` — 콤보 UI 추가
- `components/Preview.module.css` — `.scaler`, `.guides` 인라인 style or CSS var
- `components/editors/RichTextEditor.tsx` — CANVAS_W/H 제거, store 구독
- `components/editors/RichTextEditor.module.css` — 인라인 style or CSS var
- `components/editors/paddingUtils.ts` — `(fs, h)` 인자 추가 (or 함수 팩토리)
- `components/renderers/TextSlide.module.css` — 인라인 style or CSS var
- `components/import/HwpxPreviewSlide.tsx` — CANVAS_W/H store 구독
- `components/import/HwpxImport.module.css` — width/height 동적
- `components/SseBridge.tsx` — `settings.changed` 핸들러에서 resolution 갱신 (이미 있으면 확인)

### 8.3 외부 의존성
- 신규 npm 패키지 없음
- 기존 SSE 인프라(`/api/events`), settings API(`PUT/GET /api/settings/:key`) 재사용

---

## 9. Next Phase

`/pdca design signage-resolution` — 아키텍처 3안(Minimal / Clean / Pragmatic Balance) 비교 후 선택.

권장 후보 아키텍처 키워드(Design 단계에서 결정):
- **A. Minimal**: `paddingUtils` 함수에 인자 추가, 컴포넌트마다 store 직접 import
- **B. Clean**: `useDisplayMetrics()` 훅 + CSS custom property + 단일 Provider
- **C. Pragmatic Balance**: store 직접 구독 + CSS variable 일부 적용 (간단하면서 누락 방지)
