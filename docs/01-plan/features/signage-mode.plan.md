# Plan: v1.4.0 사이니지 모드 옵션 (Signage Mode)

| Field | Value |
|-------|-------|
| Feature key | `signage-mode` |
| Title (KR) | v1.4 사이니지 모드: Surround / Individual |
| Author | dongil |
| Created | 2026-05-13 |
| Target version | v1.4.0 |
| Status | Plan (Checkpoint 2 confirmed) |
| Predecessor | v1.3.0 (`82b25dd`) |

---

## Executive Summary

| Perspective | Summary |
|-------------|---------|
| **Problem** | 현장 디스플레이 매트릭스가 외부 영상을 일부 모니터로 라우팅할 때, 5760×h 단일 Surround 슬라이드는 어느 모니터로 가도 잘려 보임. 사이니지가 보이는 모니터에 항상 동일한 단일 콘텐츠를 표시할 방법이 필요. |
| **Solution** | 운영 옵션에 "사이니지 모드" 라디오 추가: `surround`(현행) / `individual`(1920×h 슬라이드를 출력 시 가로 3번 반복). 슬라이드 데이터에 `mode` 컬럼 추가 → SlideList/SlideEditor가 현재 모드 슬라이드만 노출. 옵션 변경 즉시 편집 캔버스 폭과 사이니지 출력 방식이 전환. |
| **Function UX Effect** | Individual 모드 선택 시 SlideEditor 캔버스가 1920×h로 축소, SlideList는 개별 모드 슬라이드만 표시, 사이니지 창은 5760×h를 유지하되 1920 슬라이드를 3번 가로로 타일링. 우측 Preview 썸네일도 3번 타일로 실제 출력을 정확히 미리보기. 모드 전환 시 슬라이드 보존 (각 모드 컬렉션 독립). |
| **Core Value** | "어느 모니터가 사이니지로 잡혀도 사용자는 같은 콘텐츠를 본다" — 매트릭스 운영 시나리오의 콘텐츠 일관성. 모드 분리로 서라운드용/단독용 슬라이드를 모두 한 시스템에서 관리 가능. |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 디스플레이 매트릭스가 외부 영상으로 모니터 일부를 점유할 때 5760 단일 슬라이드가 잘려 보임 → 모든 모니터에 동일한 1920 콘텐츠를 표시할 모드가 필요. |
| **WHO** | 운영자(호스트 PC) — 모드 전환은 운영 옵션에서, 슬라이드는 모드별로 따로 작성/편집. |
| **RISK** | (1) 데이터 모델 변경 (slides.mode 컬럼 + 마이그레이션). (2) 캔버스 폭이 모드에 따라 달라 useDisplayMetrics/CSS var 분기 추가. (3) Individual 출력 시 슬라이드 3번 그리기 — 비디오/이미지 메모리 부담. |
| **SUCCESS** | 모드 라디오 동작 + SlideList 필터 + 편집 캔버스 1920 전환 + Individual 사이니지 출력 3 타일링 + 옵션 영속 저장. |
| **SCOPE** | 2개 모드만 (다른 폭/구성은 별도 Plan). HWPX 임포트는 Surround 전용. |

---

## 1. Overview / Problem

### 1.1 현재 상태 (v1.3.0)

- `signage.resolution` 옵션: `{w: 5760, h: 1080 | 1200}`
- 모든 슬라이드는 5760×h 캔버스 가정
- 사이니지 출력: 5760×h 단일 슬라이드 한 번 렌더
- 슬라이드 데이터에 mode 구분 없음

### 1.2 문제

- NV Surround로 묶인 3대 모니터 중 일부를 디스플레이 매트릭스가 외부 영상(예: CCTV/방송)으로 점유 → 남은 모니터에 5760 단일 슬라이드 → 콘텐츠 잘림 또는 부분 표시
- 운영자가 매번 매트릭스 라우팅 상태에 맞춰 슬라이드 폭을 조정할 수 없음
- 어느 모니터로 신호가 가도 항상 같은 콘텐츠가 보이는 모드가 필요

### 1.3 해결 방향

**Individual 모드 도입**:
- 슬라이드 콘텐츠는 1920×h로 작성 (height는 signage.resolution.h 그대로 1080 또는 1200)
- 사이니지 창은 5760×h 그대로 (NV Surround 전체)
- 출력 시 1920 슬라이드를 가로 3번 반복 → 3대 모니터에 동일 콘텐츠
- 매트릭스가 어느 모니터를 사이니지로 라우팅하든 동일한 1920 콘텐츠 표시

**모드 라이프사이클**:
- 옵션 패널에서 라디오로 즉시 전환
- 각 모드는 독립 슬라이드 컬렉션
- 모드 전환 시 SlideList 즉시 필터링
- 새 슬라이드 추가 시 현재 모드로 자동 분류

---

## 2. Scope

### 2.1 In Scope

| # | Item | 결정 |
|---|------|------|
| 1 | `signage.mode` 옵션 추가 (radio: surround / individual) | 운영 옵션 패널, 사이니지 해상도 바로 아래 |
| 2 | `slides.mode` 컬럼 추가 + 마이그레이션 | 기존 슬라이드 모두 'surround' default |
| 3 | SlideList 모드 필터 | 즉시 필터링, 다른 모드 슬라이드 숨김 |
| 4 | SlideEditor 캔버스 폭 동적 | Individual 모드 = 1920×h |
| 5 | 새 슬라이드 추가 시 현재 모드 자동 부여 | createSlide payload에 mode 추가 |
| 6 | 사이니지 출력 Individual 타일링 | 1920 슬라이드를 가로 3번 반복 (5760×h 채움) |
| 7 | Preview thumbnail Individual 타일링 | 동일하게 3번 반복 |
| 8 | useDisplayMetrics에 mode 반영 | effective canvas = mode === 'individual' ? {w:1920, h} : {w:5760, h} |

### 2.2 Out of Scope

- 폭 1920 외 다른 단독 모드 폭 (예: 3840×h dual mode) — 별도 Plan
- HWPX 임포트의 Individual 지원 — Surround 전용. Individual 모드에서 import 버튼 비활성
- 슬라이드 마이그레이션 도구 (surround ↔ individual 변환) — 수동 새로 작성
- 모드별 다른 transition / 효과 — 공통 적용

---

## 3. Functional Requirements

| ID | Requirement | Acceptance |
|----|-------------|------------|
| FR-1 | 운영 옵션 패널에 "사이니지 모드" radio 표시 (사이니지 해상도 바로 아래) | UI 가시성 |
| FR-2 | 모드 변경 즉시 SQLite settings 저장 + SSE broadcast | 기존 옵션과 동일 흐름 |
| FR-3 | `slides` 테이블에 `mode TEXT NOT NULL DEFAULT 'surround'` 컬럼 추가 (마이그레이션) | 기존 슬라이드 모두 'surround'로 적재 |
| FR-4 | 슬라이드 API list/create/update/reorder가 mode-aware | listSlides(mode), createSlide({...,mode}), reorder(mode, ids) |
| FR-5 | SlideList는 현재 옵션 모드 슬라이드만 표시 | useOption('signage.mode')로 필터 |
| FR-6 | SlideEditor 캔버스: Surround=5760, Individual=1920 (h는 공통) | useDisplayMetrics가 mode 반영 |
| FR-7 | 새 슬라이드 추가 시 현재 모드 자동 부여 | addSlide payload에 mode 자동 주입 |
| FR-8 | 사이니지 출력 Individual 모드: 1920 슬라이드를 가로 3번 반복 (5760 채움) | SignageRenderer가 mode 따라 분기 |
| FR-9 | Preview 우측 thumbnail Individual 모드: 동일하게 3 타일 | Preview 컴포넌트가 mode 따라 분기 |
| FR-10 | HWPX 임포트는 Surround 모드에서만 가능 | Toolbar import 버튼 disabled + tooltip |
| FR-11 | 모드 전환 시 SlideList 빈 상태일 때 안내 메시지 | "이 모드에 슬라이드가 없습니다. 추가하세요." |
| FR-12 | position은 (mode, position) 모드별 독립 정렬 | SQL `WHERE mode=? ORDER BY position` |
| FR-13 | reorder API가 단일 모드 내에서만 작동 | 다른 모드 슬라이드는 영향 없음 |

---

## 4. Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | TS any 금지 | tsc strict pass |
| NFR-2 | 마이그레이션 idempotent + 데이터 손실 0 | ALTER TABLE ADD COLUMN ... DEFAULT 'surround' |
| NFR-3 | 모드 전환 latency | < 1초 (SSE + store + CSS var) |
| NFR-4 | Individual 출력 시 비디오 3 인스턴스 메모리 부담 | 단일 비디오 element + CSS clone (또는 background-image) — 메모리 1× |
| NFR-5 | 옵션 영속 + 재시작 후 복원 | settings 테이블 (registry 기반 자동) |
| NFR-6 | mode 컬럼 인덱스 | `CREATE INDEX idx_slides_mode_position ON slides(mode, position)` |

---

## 5. Success Criteria

| ID | Criteria | Verification |
|----|----------|--------------|
| SC-1 | 운영 옵션 패널 사이니지 해상도 아래에 모드 라디오 표시 | 수동 |
| SC-2 | Surround → Individual 전환 → SlideEditor 캔버스가 1920×h로 축소 | 수동 |
| SC-3 | Individual 모드에서 슬라이드 추가 → mode='individual'로 DB 저장 | DB 검사 |
| SC-4 | Surround 모드로 복귀 → SlideList가 이전 Surround 슬라이드만 표시 | 수동 |
| SC-5 | Individual 모드 사이니지 출력 → 1920 슬라이드가 3 모니터에 동일 표시 | NV Surround 5760×h 모니터 실측 |
| SC-6 | Preview 썸네일 Individual: 3 타일로 정확히 표시 | 수동 |
| SC-7 | 재시작 후 마지막 모드 + 모드별 슬라이드 유지 | 수동 |
| SC-8 | 기존 v1.3 슬라이드가 자동으로 'surround' 모드에 적재 | 마이그레이션 검증 |
| SC-9 | HWPX 임포트 버튼이 Individual 모드에서 비활성 + tooltip | 수동 |
| SC-10 | tsc 0 error + v1.3 기능 무회귀 | 회귀 |

---

## 6. Risks & Mitigations

| ID | Risk | L | Mitigation |
|----|------|:-:|------------|
| R-1 | 데이터 마이그레이션 실패 → 기존 슬라이드 사라짐 | M | `ALTER TABLE ADD COLUMN ... DEFAULT 'surround' NOT NULL` — SQLite는 기본값 backfill. 마이그레이션은 트랜잭션 + idempotent guard. |
| R-2 | Individual 모드에서 비디오 3 인스턴스로 메모리 폭증 | M | 비디오는 단일 element + CSS `repeat` 패턴 검토. 단순 이미지/텍스트는 React로 3 clone OK. 비디오/웹페이지는 별도 처리 또는 첫 버전에선 단일 렌더 후 v1.5에서 최적화. |
| R-3 | 모드 전환 시 SlideList 비어있어 운영자 혼란 | L | 빈 상태 안내 메시지 + "+ 슬라이드 추가" 버튼 강조 (FR-11). |
| R-4 | 슬라이드 reorder 시 mode 경계 침범 | L | reorder API가 mode 필터링 — 같은 모드 내에서만 position 재계산. tsc로 enforce. |
| R-5 | useDisplayMetrics에 mode 반영 시 기존 호출자 회귀 | M | 인터페이스(`{w, h, aspectRatio}`) 유지. w만 모드에 따라 다른 값. CSS var도 자동 갱신. |
| R-6 | Surround 슬라이드를 Individual 모드로 보고 싶을 때 | L | 본 Plan 범위 외. 사용자가 Individual 슬라이드를 새로 작성 (또는 v1.5에서 변환 도구). |
| R-7 | currentIndex가 mode 전환 시 다른 모드 슬라이드를 가리킴 | M | mode 전환 시 currentIndex=0 reset (또는 mode별 currentIndex 분리 — Design에서 결정). |

---

## 7. Open Questions (Resolved)

| ID | Question | Decision |
|----|----------|----------|
| Q-1 | SlideEditor 캔버스 폭 (Individual) | **1920×h 실제 폭** — 단일 콘텐츠 편집 직관성 |
| Q-2 | Preview thumbnail (Individual) | **3번 반복 타일링** — 실제 사이니지 출력과 1:1 미리보기 |
| Q-3 | HWPX 임포트 | **Surround 전용** — 단기 리스크 없음 |
| Q-4 | 빈 모드 처리 | **빈 상태 안내 + 새 슬라이드 자동 mode 부여** |
| Q-5 (baked) | 데이터 모델 | slides 테이블에 mode 컬럼, 단일 테이블 + 필터 |
| Q-6 (baked) | position 정렬 | (mode, position) 모드별 독립 |
| Q-7 (baked) | signage.resolution 옵션 | {w, h} 유지, w는 mode에 따라 effective canvas로 계산 |
| Q-8 (baked) | 기존 슬라이드 마이그레이션 | 모두 'surround' default |

---

## 8. Dependencies & Affected Files

### 8.1 새 파일 (예상 1~2개)
- `electron/db/migrations/002-slide-mode.ts` (or inline migration helper) — schema bump + ALTER TABLE
- (선택) `lib/options/values.ts` — SignageMode 타입 export

### 8.2 수정 파일
- `electron/db/schema.sql` — slides.mode 컬럼 + 인덱스
- `electron/db/migrations.ts` — ALTER TABLE 마이그레이션
- `electron/server/services/slideService.ts` — mode 인자 + WHERE 필터
- `electron/server/services/slideMapper.ts` — mode 필드 매핑
- `electron/server/routes/slides.ts` — list/create/reorder의 mode 처리
- `lib/api/slides.ts` — 클라이언트 타입에 mode 추가
- `lib/options/registry.ts` — `signage.mode` schema 추가
- `electron/db/seed.ts` — signage.mode default 'surround' seed
- `types/slide.ts` — Slide 인터페이스에 mode 추가
- `store/useSignageStore.ts` — slides 필터 (모드별), createSlide 시 mode 자동 주입
- `hooks/useDisplayMetrics.ts` — mode → effective width 분기
- `components/SignageRenderer.tsx` — Individual 모드 3 타일링 렌더
- `components/Preview.tsx` — Individual 모드 3 타일 썸네일
- `components/SlideList.tsx` — 빈 모드 안내 메시지
- `components/Toolbar.tsx` — HWPX 버튼 Individual 모드 비활성

### 8.3 외부 의존성
- 신규 npm 패키지 0
- 기존 SQLite + SSE + options 인프라 그대로

---

## 9. Migration Plan

```sql
-- electron/db/migrations/002-slide-mode.sql (conceptual)
ALTER TABLE slides ADD COLUMN mode TEXT NOT NULL DEFAULT 'surround';
CREATE INDEX IF NOT EXISTS idx_slides_mode_position ON slides(mode, position);
-- Existing rows are backfilled to 'surround' by the DEFAULT clause.
```

- Migration runs once on app boot via `runPendingMigrations()` (schema version bumped).
- Old `idx_slides_position`는 그대로 유지 (mode 필터 없는 쿼리는 v1.4에서 없음 — 향후 정리).
- 마이그레이션 idempotent: `ADD COLUMN`이 이미 있으면 try/catch로 무시.

---

## 10. Layout / UX Sketch

```
운영 옵션 패널 (변경 후):

┌────────────────────────────────────────────────────┐
│ 사이니지 해상도        [5760×1080 ▼]                │
│   현장 모니터 구성에 맞춰 선택                       │
├────────────────────────────────────────────────────┤
│ 사이니지 모드          ( ) 서라운드  (●) 개별        │  ← 신규
│   서라운드: 5760×h 한 캔버스 / 개별: 1920×h × 3 반복 │
├────────────────────────────────────────────────────┤
│ 슬라이드 상하 여백     [━━━●━━━] 50px               │
├────────────────────────────────────────────────────┤
│ 효과                  [━━●━━━━] 0.5초               │
└────────────────────────────────────────────────────┘

Individual 모드 SlideEditor:

┌──── SlideEditor 영역 ────┐
│                          │
│  ┌──────────────────┐    │   1920×h 캔버스 (편집)
│  │ slide content    │    │
│  │ (1920 × 1080)    │    │
│  └──────────────────┘    │
│                          │
└──────────────────────────┘

Individual 모드 사이니지 출력 (5760×h 창):
┌──────────┬──────────┬──────────┐
│  1920    │  1920    │  1920    │   ← 같은 슬라이드 3번
│  같은     │  같은     │  같은     │
│  내용     │  내용     │  내용     │
└──────────┴──────────┴──────────┘
```

---

## 11. Next Phase

`/pdca design signage-mode` — 아키텍처 3안 비교 후 결정. 핵심 결정:
- mode 인자 전파 방식 (props vs hook)
- SignageRenderer 3 타일링 구현 (React 3 instance vs CSS pattern vs grid)
- mode 전환 시 currentIndex / store 처리
- 마이그레이션 안전 패턴
