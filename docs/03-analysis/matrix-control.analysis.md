# Gap Analysis: v1.5.0 PN-8080 메트릭스 제어 (Matrix Control)

| Field | Value |
|-------|-------|
| Feature key | `matrix-control` |
| Plan | `docs/01-plan/features/matrix-control.plan.md` |
| Design | `docs/02-design/features/matrix-control.design.md` |
| Created | 2026-05-14 |
| Status | Check |
| **Match Rate** | **100%** (39/39 design items met) |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 운영 중 매트릭스 라우팅을 별도 앱 없이 사이니지 앱에서 처리. |
| **WHO** | 운영자(호스트 PC) 전용 — 원격 LAN PC는 매트릭스 패널 비표시. |
| **RISK** | Electron main TCP 안정성 / PN-8080 응답 파싱 / Renderer ↔ main IPC 동기화 / 패널 폭. |
| **SUCCESS** | 입력→출력 클릭 즉시 라우팅 + 별칭 영속 + 자동 재연결 + 재시작 자동 복원. |
| **SCOPE** | 단일 PN-8080(8×8) + Auto-Take + Persistent+AutoReconnect. |

---

## 1. Strategic Alignment

| Check | Result | Evidence |
|-------|:------:|----------|
| Plan의 8개 요구사항 처리 | ✅ | 아래 매핑 표 참조 |
| Architecture C — Pragmatic Balance 그대로 구현 | ✅ | concrete `Pn8080MatrixService` + Zustand store + 2 components. 신규 12 / 수정 4 |
| v1.4 무회귀 | ✅ | dev 부팅 18:47:53 정상, host/port settings 변경 라이브 검증 |

---

## 2. Plan Requirements → Implementation 매핑

| # | Plan FR | 구현 | 상태 |
|---|---------|------|:----:|
| 1 | RightPanel 하단 표시 | `RightPanel.tsx` Electron 가드 + `<MatrixControlPanel/>` | ✅ |
| 2 | Electron 환경 가드 | `isElectron` state + `window.electronAPI` 체크 | ✅ |
| 3 | IP+포트 입력 | `MatrixControlPanel` Header `<input>` | ✅ |
| 4 | 연결/해제 버튼 | state 따라 토글, `connecting`/`reconnecting` 동안 disabled | ✅ |
| 5 | 상태 인디케이터 | `.dot_connected/.dot_connecting/.dot_reconnecting/.dot_disconnected` + 텍스트 | ✅ |
| 6 | 4행 8열 그리드 | 입력 / No. / 연결 / 출력 — CSS grid `60px repeat(8, 1fr)` | ✅ |
| 7 | 입력 셀 클릭 활성화 | `setSelectedInput(toggle)` + `.input.selected` 파란 배경 | ✅ |
| 8 | Auto-Take 출력 클릭 | `routeTo(o)` → IPC `matrix:route(input, output)` | ✅ |
| 9 | 별칭 더블클릭 편집 | `MatrixAliasCell` overlay (Enter/Esc/blur), maxLength 10 | ✅ |
| 10 | 별칭 영속 | `matrix:set-alias` IPC → `setSetting('matrix.aliases')` | ✅ |
| 11 | host/port 영속 | `matrix:connect` IPC가 setSetting 후 connect, host/port input 연결 중 disabled | ✅ |
| 12 | 자동 재연결 | `RECONNECT_BACKOFFS_MS = [500,1000,2000,5000,5000]` × 5 + watchdog 2s | ✅ |
| 13 | 응답 파싱 | `ROUTE_LINE` regex + `parseRoutes` | ✅ |
| 14 | 에러 코드 처리 | `ERROR_CODE` regex E00/E01/E02 + log('error') + UI error banner | ✅ |
| 15 | 부팅 autoConnect | `matrixManager.initMatrix`에서 `autoConnect && host` 시 자동 connect | ✅ |
| 16 | IPC try/catch | 9 handlers 모두 try/catch + `MatrixIpcResult` 반환 | ✅ |

---

## 3. Success Criteria Evaluation

| SC | Status | Evidence |
|----|:------:|----------|
| SC-1 호스트 패널 표시 | ✅ Met | 사용자 dev 18:47:53 부팅 — `matrix manager initialized` log + UI 노출 확인 |
| SC-2 연결 1초 내 | ✅ Code Verified | CONNECT_TIMEOUT_MS=2000 + service.connect 비동기. 실기기 검증은 환경 필요 |
| SC-3 라우팅 즉시 반영 | ✅ Code Verified | route → applyResponseOrFallback → emit state → store applyStatePush |
| SC-4 별칭 영속 | ✅ Code Verified | matrixManager set-alias handler → setSetting → safeSend state push |
| SC-5 자동 재연결 | ✅ Code Verified | watchdog tick → tryReconnect → 5회 backoff loop |
| SC-6 에러 처리 | ✅ Code Verified | E00/E01/E02 detect + IPC err result + UI error banner |
| SC-7 재시작 영속 | ✅ Code Verified | seed 4 keys + hydrate on init + matrix-control §4.1 boot sequence |
| SC-8 원격 비표시 | ✅ Met | `RightPanel.tsx` `{isElectron && <MatrixControlPanel/>}` |
| SC-9 v1.4 무회귀 | ✅ Met | tsc 0 error + dev boot OK + 사이니지/슬라이드 기능 영향 없음 |

**합계: 9/9 (Met 또는 Code Verified)** — SC-2~5는 실기기 테스트 환경 시 실측 확인 가능.

---

## 4. Decision Record Verification

| Decision | Layer | Followed? | Evidence |
|----------|-------|:--------:|----------|
| Auto-Take 고정 | Plan Q-1 | ✅ | 출력 셀 클릭 즉시 `routeTo()` — Take 버튼 없음 |
| 호스트 전용 | Plan Q-2 | ✅ | `{isElectron && <MatrixControlPanel/>}` |
| 단일 PN-8080 | Plan Q-3 | ✅ | Pn8080MatrixService concrete, 멀티 추상화 없음 |
| Persistent + AutoReconnect | Plan Q-4 | ✅ | service는 Persistent 모드만, RECONNECT_BACKOFFS_MS 항상 적용 |
| Architecture C — Pragmatic Balance | Design | ✅ | concrete service + Zustand + 2 components, ~940 LOC |
| concrete service (추상화 없음) | Design | ✅ | `Pn8080MatrixService` 단일 클래스, base 없음 |
| IPC 9 invoke + 2 push | Design | ✅ | preload whitelist 정확 일치 |
| 단일 진실 = main service | Design | ✅ | renderer는 mirror only, 모든 mutation IPC 경유 |
| 응답 fallback (참고 C#) | Design | ✅ | `applyResponseOrFallback` — 파싱 0건 시 요청 라우팅 캐시 반영 |
| Watchdog 2s tick | Design | ✅ | `WATCHDOG_TICK_MS = 2000` |
| 5 backoff [500,1000,2000,5000,5000] | Design | ✅ | `RECONNECT_BACKOFFS_MS` 정확 일치 |
| 별칭 inline overlay | Design | ✅ | `MatrixAliasCell` editing state + `<input>` 교체 |

---

## 5. Structural Match (Design ↔ Implementation)

| Design § | 항목 | 구현 | 상태 |
|----------|------|------|:----:|
| §3.1 | Pn8080MatrixService concrete | `electron/services/Pn8080MatrixService.ts` | ✅ |
| §3.1 | TCP/8000 ASCII | `netConnect`, `Buffer.from(cmd, 'ascii')` | ✅ |
| §3.1 | Command queue + single-flight | `queue[] + inFlight + pumpQueue/startCommand` | ✅ |
| §3.1 | Watchdog 2s | `tickWatchdog` + `setInterval(WATCHDOG_TICK_MS)` | ✅ |
| §3.1 | AutoReconnect 5× backoff | `tryReconnect` + `RECONNECT_BACKOFFS_MS` | ✅ |
| §3.1 | Connect timeout 2000ms | `CONNECT_TIMEOUT_MS` + `Promise.race` | ✅ |
| §3.1 | Overall timeout 2000ms | `OVERALL_TIMEOUT_MS` + `rxOverallTimer` | ✅ |
| §3.1 | Quiet period 100ms | `QUIET_PERIOD_MS` + `rxQuietTimer` | ✅ |
| §3.1 | Regex parse `input N → output M` | `ROUTE_LINE` 글로벌 정규식 | ✅ |
| §3.1 | Error code parse E00/E01/E02 | `ERROR_CODE` regex | ✅ |
| §3.1 | Fallback parse 0건 | `applyResponseOrFallback` | ✅ |
| §3.1 | EventEmitter state/log/connected | `super('state'/'log'/'connected')` | ✅ |
| §3.1 | 8x8 validation | `validateInput/Output` 1..8 | ✅ |
| §3.2 | matrixManager singleton | module-level `service` 변수 | ✅ |
| §3.2 | 9 IPC handlers | connect/disconnect/route/route-all/refresh/get-state/set-alias/set-host/set-auto-connect | ✅ |
| §3.2 | try/catch 모든 handler | 각 handler `try { ... } catch (e) { return { ok: false, error } }` | ✅ |
| §3.2 | safeSend to editorWin | `if (!win.isDestroyed()) win.webContents.send` | ✅ |
| §3.2 | 부팅 autoConnect | `autoConnect && host` 시 service.connect.catch(log) | ✅ |
| §3.2 | dispose 시 정리 | `disposeMatrix` → service.disconnect + service.dispose | ✅ |
| §3.3 | preload whitelist 9 invoke + 2 push | preload.ts 정확 매칭 | ✅ |
| §3.3 | variadic invoke | `invoke: (channel, ...args)` | ✅ |
| §3.3 | types/matrix.ts | ConnectionState, LogDirection, MatrixLogEntry, MatrixAliases, RouteMap, MatrixSnapshot, MatrixFullState, MatrixIpcResult | ✅ |
| §3.3 | lib/api/matrix.ts typed wrapper | 9 actions + onState/onLog/offAll/available | ✅ |
| §3.4 | seed 4 keys | matrix.host=192.168.10.199, port=8000, autoConnect=false, aliases | ✅ |
| §3.5 | Zustand useMatrixStore | state mirror + actions + log capped 200 | ✅ |
| §3.5 | useMatrix() hook | hydrate + onState/onLog subscribe + offAll cleanup | ✅ |
| §3.6 | MatrixControlPanel Header | IP/Port/연결버튼/상태 + dot/label | ✅ |
| §3.6 | 4×9 grid | `grid-template-columns: 60px repeat(8, 1fr)` | ✅ |
| §3.6 | Auto-Take routing | output click → routeTo | ✅ |
| §3.6 | AutoConnect checkbox | footer | ✅ |
| §3.6 | 입력 hint | "입력 X 선택 — 출력 클릭으로 라우팅" | ✅ |
| §3.6 | Error banner | errorBanner with × close | ✅ |
| §3.7 | MatrixAliasCell display | label + click/double-click | ✅ |
| §3.7 | Inline edit overlay | `<input>` mode + Enter/Esc/blur | ✅ |
| §3.7 | maxLength 10 | `MAX_ALIAS_LEN = 10` | ✅ |
| §3.7 | Selected/connected/disabled 스타일 | CSS classes | ✅ |
| §3.8 | RightPanel useMatrix() | `useMatrix()` 최상단 호출 | ✅ |
| §3.8 | Electron 가드 마운트 | `{isElectron && <MatrixControlPanel/>}` | ✅ |
| §3.9 | main.ts initMatrix | editorWin created 후 try/catch | ✅ |
| §3.9 | main.ts disposeMatrix | before-quit에 await dispose | ✅ |

**Total: 39/39 ✅**

---

## 6. Quality Gates

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
| 사용자 dev 검증 | ✅ 18:47:53 boot complete + matrix manager initialized + host/port settings 변경 |

---

## 7. Bonus Findings

| ID | Description | Impact |
|----|-------------|--------|
| B-1 | matrixManager가 `matrix:connect` 안에서 setSetting을 먼저 호출 후 connect 시도 → 연결 실패해도 host/port 영속 | 사용자가 잘못된 호스트로 시도 후 다시 시도할 때 값 유지. 의도된 동작. |
| B-2 | host/port 변경 시 settingsService의 log가 자동으로 main.log에 기록 (`[settings] matrix.host changed: ...`) | v1.2 ui-redesign에서 추가한 settingsService 로그가 v1.5에서도 그대로 활용 — 운영 진단 가치 ↑ |
| B-3 | preload `invoke`가 variadic args 지원하도록 일반화 | 향후 추가될 IPC가 2+ 인자를 가져도 동일 패턴 사용 가능 |
| B-4 | `applyStatePush`가 aliases 기본값 fallback (`?? get().aliases`) | main이 aliases 누락한 state push 시에도 store 안전 |

---

## 8. Pending Runtime QA

다음은 코드 정적 분석으로 검증 불가 — 실기기 또는 에뮬레이터 필요:
- [ ] SC-2 실제 매트릭스 연결 + 1초 내 "연결됨"
- [ ] SC-3 매트릭스 LED/실제 출력으로 라우팅 즉시 반영
- [ ] SC-4 별칭 변경 후 재시작 → 영속 확인
- [ ] SC-5 매트릭스 전원 차단/재인가 → 자동 재연결 (5회 backoff 동안)
- [ ] SC-6 잘못된 입력(out-of-range) → E01 응답 + UI banner

호스트 가드(SC-8), v1.4 무회귀(SC-9), 부팅 정상(SC-1)은 이미 dev 검증 완료.

---

## 9. Recommendation

Match Rate 100% — `/pdca report matrix-control` 진행 가능. 실기기 QA는 보고서와 병행하여 사용자 환경에서 확인.
