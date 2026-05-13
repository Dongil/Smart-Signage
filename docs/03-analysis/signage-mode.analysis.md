# Gap Analysis: v1.4.0 사이니지 모드 (Signage Mode)

| Field | Value |
|-------|-------|
| Feature key | `signage-mode` |
| Plan | `docs/01-plan/features/signage-mode.plan.md` |
| Design | `docs/02-design/features/signage-mode.design.md` |
| Created | 2026-05-13 |
| Status | Check (post Act-1) |
| **Match Rate** | **100%** (18/18 design items met + Act-1 migration fix) |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 매트릭스가 외부 영상으로 모니터 일부 점유 시 5760 슬라이드 잘림 → 모든 모니터에 동일 1920 콘텐츠. |
| **WHO** | 운영자(호스트 PC). |
| **RISK** | slides.mode 컬럼 + 마이그레이션 / 캔버스 폭 동적 / Individual 비디오 3 인스턴스 메모리. |
| **SUCCESS** | 모드 라디오 + SlideList 필터 + 캔버스 1920 전환 + 3 타일링 + 영속 저장. |
| **SCOPE** | 2모드만 (HWPX는 Surround 전용). |

---

## 1. Strategic Alignment

| Check | Result | Evidence |
|-------|:------:|----------|
| Plan의 8개 요구사항이 모두 처리됨 | ✅ | 아래 매핑 표 참조 |
| Architecture C — Pragmatic Balance 그대로 구현 | ✅ | useDisplayMetrics 확장 + 3 React 인스턴스 + CSS grid. 신규 파일 0, 수정 16 |
| 기존 v1.3 무회귀 | ✅ | 사용자 실측 — 17:46:29 boot, 17:47:00 mode toggle, 17:48:30 signage toggle 모두 정상 |

---

## 2. Plan Requirements → Implementation 매핑

| # | Plan FR | 구현 | 상태 |
|---|---------|------|:----:|
| 1 | 운영 옵션 패널에 라디오 표시 | `lib/options/registry.ts` signage.mode schema (해상도 바로 아래) | ✅ |
| 2 | mode 변경 SSE 영속 | 기존 settings 인프라 재사용 | ✅ |
| 3 | slides.mode 컬럼 + 마이그레이션 | `electron/db/schema.sql` mode + `migrations.ts` v1→v2 addSlideModeColumn (idempotent) | ✅ |
| 4 | mode-aware API | `slideService.listSlides(mode?)`, `createSlide({mode})`, `reorder(mode, ids)`, `routes/slides.ts` ?mode= | ✅ |
| 5 | SlideList 필터 | `SlideList.tsx` visibleSlides + useEffect editingIndex clamp | ✅ |
| 6 | SlideEditor 캔버스 폭 동적 | `useDisplayMetrics` w=1920 in individual + CSS --canvas-w 자동 갱신 | ✅ |
| 7 | 새 슬라이드 mode 자동 | `store.addSlide` pickMode(options) auto-inject | ✅ |
| 8 | 사이니지 3 타일링 | `SignageRenderer.renderTiles()` — 첫 tile만 onVideoEnd | ✅ |
| 9 | Preview 3 타일링 | `Preview.renderTiles()` + .tileRow grid | ✅ |
| 10 | HWPX Surround 전용 | `SlideList importBtn disabled={mode==='individual'}` + tooltip | ✅ |
| 11 | 빈 모드 안내 | `SlideList .empty` 메시지 + "+ 추가" 강조 | ✅ |
| 12 | (mode, position) 정렬 | `slideService` MAX(position) WHERE mode=? + reorder 트랜잭션 mode 필터 | ✅ |
| 13 | reorder mode 경계 | `UPDATE ... WHERE id=? AND mode=?` server-side filter | ✅ |

---

## 3. Success Criteria Evaluation

| SC | Status | Evidence |
|----|:------:|----------|
| SC-1 운영 옵션 패널 모드 라디오 | ✅ Met | registry.ts에 추가, panel 자동 렌더링 |
| SC-2 SlideEditor 1920×h 전환 | ✅ Met | useDisplayMetrics + CSS var |
| SC-3 새 슬라이드 mode 자동 | ✅ Met | store.addSlide pickMode |
| SC-4 모드별 SlideList 필터 | ✅ Met | visibleSlides useMemo |
| SC-5 사이니지 3 타일 출력 | ✅ Met | 17:48:30 사용자 실측 (사이니지 토글 + 출력 확인) |
| SC-6 Preview 3 타일 썸네일 | ✅ Met | Preview.renderTiles + signage-aspect 5760폭 |
| SC-7 재시작 후 모드 + 모드별 slides 유지 | ✅ Met | SQLite settings + hydrateAllOptions |
| SC-8 v1.3 데이터 마이그레이션 무손실 | ✅ Met (Act-1 후) | bootstrap 정상, 기존 슬라이드 'surround' 자동 적재 |
| SC-9 HWPX 비활성 (Individual) | ✅ Met | importBtn disabled + tooltip |
| SC-10 v1.3 무회귀 | ✅ Met | 사용자 33초 만에 mode 토글 + signage 토글 모두 정상 |

**합계: 10/10 Fully Met** — 기준 ≥ 90% 초과.

---

## 4. Decision Record Verification

| Decision | Layer | Followed? | Evidence |
|----------|-------|:--------:|----------|
| 편집 캔버스 1920×h 실제 폭 | Plan Q-1 | ✅ | useDisplayMetrics w=1920, CSS var-based |
| Preview 3번 반복 타일링 | Plan Q-2 | ✅ | Preview.renderTiles + tileRow grid |
| HWPX Surround 전용 | Plan Q-3 | ✅ | importBtn disabled + tooltip |
| 빈 모드 안내 + 자동 mode 부여 | Plan Q-4 | ✅ | SlideList .empty + store.addSlide pickMode |
| slides 단일 테이블 + mode 컬럼 | Plan (baked) | ✅ | schema.sql + migration |
| (mode, position) 모드별 독립 정렬 | Plan (baked) | ✅ | server-side filter + index |
| signage.resolution {w, h} 유지 | Plan (baked) | ✅ | registry 그대로, useDisplayMetrics에서 effectiveW 계산 |
| Architecture C — Pragmatic Balance | Design | ✅ | useDisplayMetrics 확장 + 3 React 인스턴스 (신규 파일 0) |
| server-side mode awareness | Design | ✅ | controlService.getCurrentMode + getSetting('signage.mode') |
| settings.changed → currentIndex reset | Design | ✅ | initControl에 eventBus 리스너 |
| onVideoEnd 첫 tile만 | Design | ✅ | `i === 0 ? handleVideoEnd : undefined` |

---

## 5. Structural Match (Design ↔ Implementation)

| Design § | 항목 | 구현 | 상태 |
|----------|------|------|:----:|
| §3.1.1 | slides.mode 컬럼 + CHECK | `schema.sql` | ✅ |
| §3.1.2 | CURRENT_SCHEMA_VERSION=2 + addSlideModeColumn idempotent | `migrations.ts` | ✅ |
| §3.2.1 | slideMapper mode 매핑 | `slideMapper.ts` rowToSlide | ✅ |
| §3.2.2 | listSlides(mode?), createSlide normalize, reorder(mode, ids), compactPositions(mode) | `slideService.ts` | ✅ |
| §3.2.3 | controlService refreshFromSlides + eventBus 리스너 | `controlService.ts` | ✅ |
| §3.2.4 | routes ?mode= 쿼리 + body.mode | `routes/slides.ts` | ✅ |
| §3.3.1 | registry signage.mode (해상도 바로 다음) | `registry.ts` | ✅ |
| §3.3.2 | seed default 'surround' | `seed.ts` | ✅ |
| §3.4.1 | useDisplayMetrics tileCount + mode | `useDisplayMetrics.ts` | ✅ |
| §3.4.2 | DisplayCssVarBridge --tile-count + --signage-w + --signage-aspect (확장) | `DisplayCssVarBridge.tsx` | ✅ |
| §3.5.1 | types/slide.ts SignageMode + Slide.mode | `types/slide.ts` | ✅ |
| §3.5.2 | lib/api/slides.ts mode 파라미터 | `lib/api/slides.ts` | ✅ |
| §3.5.3 | store.addSlide pickMode + reorder mode 분리 | `useSignageStore.ts` | ✅ |
| §3.5.4 | SlideList visibleSlides + empty state + HWPX disabled | `SlideList.tsx` | ✅ |
| §3.6.1 | SignageRenderer renderTiles + 첫 tile onVideoEnd | `SignageRenderer.tsx` | ✅ |
| §3.6.2 | SignageRenderer.module.css .tileRow + .tile | `SignageRenderer.module.css` | ✅ |
| §3.6.3 | Preview renderTiles + scaler signage-w + screen signage-aspect | `Preview.{tsx,module.css}` | ✅ |
| §3.7 (M7) | Toolbar HWPX 가드 | 실제로는 SlideList "불러오기" 버튼이라 SlideList에서 처리 | ✅ (Toolbar 변경 불필요) |

**Total: 18/18 ✅**

---

## 6. Act 이력

| Iteration | Issue | Resolution |
|-----------|-------|-----------|
| **Act-1** | `schema.sql`이 `CREATE INDEX idx_slides_mode_position ON slides(mode, position)`을 포함해 fresh-install이 아닌 기존 v1.3 DB에서 마이그레이션 전에 실행 → 컬럼 없는 상태에서 인덱스 생성 시도 → `SqliteError: no such column: mode` → boot failure | `schema.sql`에서 mode 인덱스 줄을 제거(주석으로 변경). 인덱스 생성은 `migrations.ts addSlideModeColumn()`이 ALTER 직후 실행하므로 컬럼 보장 후 안전. fresh-install은 CREATE TABLE에 mode 포함되므로 OK. |

사용자가 즉시 보고 → 1 line fix → 17:46:29 정상 부팅 + 17:47/17:48 토글 정상.

---

## 7. Bonus Findings (Design ↔ Implementation 양의 편차)

| ID | Description | Impact |
|----|-------------|--------|
| B-1 | DisplayCssVarBridge에 `--signage-w`, `--signage-aspect` CSS var 추가 | Design §3.4.2엔 --tile-count만 명시되었으나, Preview의 `aspect-ratio: calc(...)` 한계 회피 위해 별도 var 도입. Preview 5760폭 유지 확실. |
| B-2 | SlideList useEffect로 mode 전환 시 editingIndex 자동 clamp | Design엔 명시 없으나 visibleSlides 길이 변화로 인한 out-of-range 방어. UX 안정성 ↑. |
| B-3 | M7 Toolbar HWPX 가드 → 실제론 SlideList "불러오기" 버튼 처리 | Toolbar에 HWPX 버튼이 원래 없었음. SlideList에서 importBtn에 disabled 적용으로 동등 효과. |

---

## 8. Quality Gates

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
| 사용자 실측 (mode toggle + signage toggle) | ✅ 0 에러 |

---

## 9. Recommendation

Match Rate 100% — `/pdca report signage-mode`로 보고서 생성 진행.
