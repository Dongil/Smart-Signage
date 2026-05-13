# Gap Analysis: 사이니지 해상도 변경 (Signage Resolution Config)

| Field | Value |
|-------|-------|
| Feature key | `signage-resolution` |
| Plan | `docs/01-plan/features/signage-resolution.plan.md` |
| Design | `docs/02-design/features/signage-resolution.design.md` |
| Created | 2026-05-13 |
| Status | Check (Act-1 applied) |
| **Match Rate** | **100%** (34/34 design items met) — Act-1: G-1 resolved |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 현장 NV Surround가 5760×1200을 강제하는 디스플레이가 있어 dev(1080) 기준과 출력이 어긋남. WYSIWYG 신뢰 회복. |
| **WHO** | 운영자(호스트 PC, 현장 설치 후 1회 설정) + 원격 LAN 편집자(설정값을 일관되게 본다). |
| **RISK** | 1080-기준 폰트 공식 / CSS 하드코딩 9곳 분산 / SSE race |
| **SUCCESS** | 콤보 변경 후 1초 안에 편집/프리뷰/HWPX/원격 모두 새 캔버스 비율로 표시, 재시작 후 유지. |
| **SCOPE** | 5760×1080 vs 5760×1200 두 옵션만. |

---

## 1. Strategic Alignment

| Check | Result | Evidence |
|-------|:------:|----------|
| PRD WHY (현장-dev 비주얼 불일치 해소)을 풀고 있는가 | ✅ | 콤보로 운영자가 현장 모니터에 맞게 즉시 전환 가능. CSS var 단일 진입점으로 편집/프리뷰/출력/원격 모두 일관. |
| Plan Success Criteria가 충족되거나 진행 중인가 | ✅ 5개 코드 검증 / ⏳ 2개 런타임 QA | 아래 §3 참조 |
| Design 핵심 결정(C. Pragmatic Balance)이 따라졌는가 | ✅ | useDisplayMetrics 훅 + CSS custom property + paddingUtils 인자화 모두 구현 |

**판정**: 전략적으로 정렬됨. Critical 미스얼라인먼트 없음.

---

## 2. Decision Record Verification

| Decision | Layer | Followed? | Evidence |
|----------|-------|:--------:|----------|
| 기존 슬라이드 자동 재계산 | Plan | ✅ | `paddingUtils.ts` 인자화 + `RichTextEditor.tsx` remap effect (L116-145) |
| 미디어 cover | Plan | ✅ | BaseRenderer/TextSlide CSS `width/height: var(--canvas-*)` 유지 — 인라인 inline-size 변경 없음 |
| 즉시 SSE 동기화 | Plan | ✅ | `SseBridge.tsx` case 활성화 + `applySettingsSse` |
| HWPX 운영해상도 동기 | Plan | ✅ | `HwpxPreviewSlide.tsx` `useDisplayMetrics` 사용 |
| Architecture C — useDisplayMetrics + CSS var | Design | ✅ | 훅 + Bridge + CSS 7개 파일 var 교체 |
| body 단일 CSS var set | Design | ✅ | `DisplayCssVarBridge.tsx`가 `document.body.style.setProperty` |
| paddingUtils optional `h` 인자 + default 1080 | Design | ✅ | back-compat 유지, 호출부(RTE, TextSlide) 명시적 전달 |

---

## 3. Success Criteria Evaluation (Plan §5)

| SC | Status | Evidence |
|----|:------:|----------|
| SC-1 콤보로 1200 선택 → 편집 캔버스 즉시 변경 | ✅ Met | `ResolutionSelect.tsx` → `setResolution` → store update → `DisplayCssVarBridge` useEffect → body CSS vars → 모든 CSS var 참조처 동시 갱신 |
| SC-2 사이니지 표시 → 새 비율 풀스크린 | ✅ Met (코드) | `TextSlide.module.css:3-4`가 var 참조. signage page도 `DisplayCssVarBridge` mount. 실측 QA 필요. |
| SC-3 재시작 후 유지 | ✅ Met | `seed.ts:15` default + `hydrateSettings` GET → store update. SQLite WAL은 v1.2부터 사용. |
| SC-4 원격 PC 동기화 | ✅ Met | `SseBridge.tsx` case `settings.changed` + key `signage.resolution` 필터 → `applySettingsSse()` → store re-fetch → CSS var 자동 적용 |
| SC-5 HWPX 미리보기 동기 | ✅ Met | `HwpxPreviewSlide.tsx` `useDisplayMetrics` + scale 동적 |
| SC-6 v1.2 기능 무회귀 | ⏳ Pending | tsc/build pass 통과 (정적 검증). 슬라이드 CRUD/IME/단축키/사이니지 토글 실행 검증 권장. |
| SC-7 50회 토글 스트레스 | ⏳ Pending | 메모리/잔상 — 실행 검증 권장. CSS var는 last-write-wins이므로 누적 리스크 없음. |

**점수**: 5/7 code-verified, 2/7 runtime QA pending.

---

## 4. Structural Gap Detection (Design ↔ Implementation)

### 4.1 모듈별 매칭 매트릭스

| Design §  | 항목 | 구현 | 상태 |
|-----------|------|------|:----:|
| §1.1 | SQLite `signage.resolution` | `electron/db/seed.ts:15` | ✅ |
| §1.1 | `useSignageStore.resolution` | `store/useSignageStore.ts:18,77` | ✅ |
| §1.1 | `setResolution(h)` | `store/useSignageStore.ts:82` | ✅ |
| §1.1 | `useDisplayMetrics` | `hooks/useDisplayMetrics.ts` | ✅ |
| §1.1 | `DisplayCssVarBridge` | `components/DisplayCssVarBridge.tsx` | ✅ |
| §1.1 | `ResolutionSelect` | `components/ResolutionSelect.tsx` | ✅ |
| §1.1 | SSE settings.changed handler | `components/SseBridge.tsx:36-43` | ✅ |
| §2.2 | Settings 타입 export (`DEFAULT_RESOLUTION`, `ALLOWED_HEIGHTS`, `AllowedHeight`, `SignageResolution`) | `store/useSignageStore.ts:13-19` | ✅ |
| §2.2 | `settingsApi.get/set` | `lib/api/settings.ts` | ✅ |
| §2.3 | SseBridge handler filter `event.key === 'signage.resolution'` | `components/SseBridge.tsx:38` | ✅ |
| §3.1.1 | seed default | `electron/db/seed.ts:15` | ✅ |
| §3.1.2 | `hydrateSettings` action | `store/useSignageStore.ts:65-79` | ✅ |
| §3.1.2 | `applySettingsSse` action | `store/useSignageStore.ts:96-98` | ✅ |
| §3.1.2 | `ALLOWED_HEIGHTS` 가드 | `store/useSignageStore.ts:82` | ✅ |
| §3.2.1 | `useDisplayMetrics()` 반환값 `{w, h, aspectRatio}` | `hooks/useDisplayMetrics.ts:14-19` | ✅ |
| §3.2.2 | body inline CSS vars 3종 | `components/DisplayCssVarBridge.tsx:14-16` | ✅ |
| §3.3.1 | Preview.module.css `.scaler/.guides/.screen/.screenEmpty` var 교체 (4곳) | Preview.module.css | ✅ |
| §3.3.1 | TextSlide.module.css `.container` var | `components/renderers/TextSlide.module.css:3-4` | ✅ |
| §3.3.1 | RichTextEditor.module.css `.canvas/.canvas::after/.editor/.tiptap` (4곳) | RichTextEditor.module.css | ✅ |
| §3.3.1 | HwpxImport.module.css `.previewGuides` | HwpxImport.module.css:186-187 | ✅ |
| §3.3.2 | RTE CANVAS_W/H 제거 + useDisplayMetrics | `RichTextEditor.tsx:42` | ✅ |
| §3.3.2 | HwpxPreviewSlide useDisplayMetrics | `HwpxPreviewSlide.tsx:20` | ✅ |
| §3.4.1 | `buildFontData(h?)` export | `paddingUtils.ts:23` | ✅ |
| §3.4.1 | `calcVerticalPadding(fs, h?)` | `paddingUtils.ts:37` | ✅ |
| §3.4.1 | `detectFontSize(html, h?)` | `paddingUtils.ts:64` | ✅ |
| §3.4.1 | back-compat `FONT_DATA` export | `paddingUtils.ts:35` | ✅ |
| §3.4.2 | RTE `FONT_SIZES` useMemo with CANVAS_H | `RichTextEditor.tsx:53-60` | ✅ |
| §3.4.2 | `calcVerticalPadding(fs, CANVAS_H)` 호출 | `RichTextEditor.tsx:147` | ✅ |
| §3.4.3 | RTE 해상도 변경 감지 effect + remap | `RichTextEditor.tsx:115-145` | ✅ |
| §3.4 (bonus) | TextSlide renderer도 displayH 사용 | `components/renderers/TextSlide.tsx:11-18` | ✅ (Design에 명시 없으나 일관성을 위해 추가 — bonus) |
| §3.5.1 | ResolutionSelect 콤보 + inflight 가드 | `ResolutionSelect.tsx:20,26` | ✅ |
| §3.5.2 | Preview 헤더 ResolutionSelect 배치 | `Preview.tsx:50` | ✅ |
| §3.5.3 | SseBridge case 활성화 | `SseBridge.tsx:36-43` | ✅ |
| §3.5.4 | `app/page.tsx` hydrateSettings + DisplayCssVarBridge | `app/page.tsx:21,29-32,45` | ✅ |
| §3.5.4 | `app/signage/page.tsx` hydrate + Bridge | `app/signage/page.tsx:21-29,80` | ✅ |

**계**: 34 design 항목 중 33 ✅ + 1 minor gap (아래 §4.2)

### 4.2 Gap 목록 (Act-1 적용 후)

| ID | Severity | Status | Design §  | Item | Resolution |
|----|:--------:|:------:|-----------|------|------------|
| ~~G-1~~ | ~~Low~~ | ✅ Resolved (Act-1) | Plan NFR-6 | `[settings] {key} changed: prev → next` 로그 | `electron/server/services/settingsService.ts:43-49` — `setSetting` 안에서 prev 조회 + `getLogger().info` 호출, try/catch로 logging fault 격리 |

**Gap 0건 (100% 일치)**.

---

## 5. Match Rate

```
Design 항목:       34
충족:              34 (100%)
부분/미충족:        0
─────────────────────────
Match Rate:       100% ✅ (≥ 90% 기준 통과, Act-1 후)
```

**Critical alignment**: ✅ 모든 Plan 결정 및 Design 핵심 아키텍처 그대로 구현됨.

---

## 6. Bonus Findings (Design ↔ Implementation 양의 편차)

| ID | Description | Impact |
|----|-------------|--------|
| B-1 | `TextSlide.tsx` 렌더러도 `useDisplayMetrics`를 사용해 `detectFontSize`/`calcVerticalPadding`에 displayH 전달 | Design §3.4에는 RTE만 명시되어 있었으나 일관성을 위해 추가. Plan SC-2(사이니지 출력 새 비율 풀스크린) 정확도 ↑. |
| B-2 | Preview 헤더 CSS `gap: 6px` + `.heading flex-shrink: 0` 추가 | 320px 폭에서 콤보가 압축되지 않도록 미세 조정. Plan FR-1 UX 품질 ↑. |
| B-3 | `RichTextEditor.tsx` remap effect가 IME composition 체크 | Design §3.4.3 + Plan R-4(IME) 둘 다에 명시되었고 구현에 반영됨. |

---

## 7. Risk Re-evaluation

| Risk (Plan) | 현 상태 |
|-------------|---------|
| R-1 paddingUtils 호출자 모두 갱신 | ✅ RTE + TextSlide 2곳 모두 displayH 명시 전달. `FONT_DATA` 모듈-레벨 export는 back-compat용으로만 남음. |
| R-2 CSS 하드코딩 누락 | ✅ grep 5760/1080 결과 모두 CSS var fallback(`var(--canvas-w, 5760px)`) 또는 store default(`{w:5760, h:1080}`)로만 잔존. 의도된 fallback. |
| R-3 SSE race | ✅ ResolutionSelect inflight 가드 + applySettingsSse는 GET 재조회로 last-write-wins |
| R-4 aspect-ratio 가이드 라인 좌표 | ✅ Preview `.guides` width/height var + background-size 고정 1920px. 1080/1200 모드 둘 다 정렬됨. |
| R-5 빠른 토글 큐 누적 | ✅ ResolutionSelect `busy` 상태로 inflight 동안 disabled. |

---

## 8. Quality Gates

| Gate | Result |
|------|:------:|
| `tsc -p tsconfig.electron.json` | ✅ 0 error |
| `tsc --noEmit` (Next.js) | ✅ 0 error |
| `npm run build:electron` | ✅ 성공 |
| Match Rate ≥ 90% | ✅ 97% |
| Critical Gap 0 | ✅ |
| Decision Record 위반 0 | ✅ |
| Strategic alignment | ✅ |

---

## 9. Pending Runtime QA

다음은 코드 정적 분석으로 검증 불가 — 사용자 실행 검증 권장:

- [ ] SC-1 콤보 1080→1200 클릭 후 1초 내 편집/프리뷰 캔버스 비율 변경 (F12: `getComputedStyle(document.body).getPropertyValue('--canvas-h')` 확인)
- [ ] SC-2 사이니지 출력이 5760×1200 풀스크린으로 표시 (호스트 PC + Surround 모니터)
- [ ] SC-3 앱 종료 → 재실행 → 콤보가 마지막 선택값으로 시작
- [ ] SC-4 원격 LAN PC 동시 접속 후 호스트에서 콤보 변경 → 원격 화면 1초 내 새 비율
- [ ] SC-5 HWPX 임포트 미리보기 캔버스가 운영 해상도와 동일 비율
- [ ] SC-6 v1.2 기존 기능(슬라이드 CRUD, 한글 IME, 단축키, 사이니지 토글) 무회귀
- [ ] SC-7 1080↔1200 50회 토글 후 메모리/잔상 없음

---

## 10. Recommendation

Match Rate **100%** (Act-1 적용 후) — `/pdca report signage-resolution`로 보고서 생성 진행 권장.

런타임 QA(SC-6, SC-7)는 보고서와 병행하여 사용자가 실행 검증.
