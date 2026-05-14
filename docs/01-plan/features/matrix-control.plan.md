# Plan: v1.5.0 PN-8080 메트릭스 제어 (Matrix Control)

| Field | Value |
|-------|-------|
| Feature key | `matrix-control` |
| Title (KR) | v1.5 PN-8080 메트릭스 제어 패널 |
| Author | dongil |
| Created | 2026-05-13 |
| Target version | v1.5.0 |
| Status | Plan (Checkpoint 2 confirmed) |
| Predecessor | v1.4.0 (`208b2be`) |

---

## Executive Summary

| Perspective | Summary |
|-------------|---------|
| **Problem** | 운영 중 디스플레이 매트릭스(PN-8080) 입출력 라우팅을 변경하려면 별도 컨트롤 앱을 띄우거나 매트릭스 본체 패널을 조작해야 함. 사이니지 운영자가 한 화면에서 슬라이드와 매트릭스를 동시 제어할 수 없음. |
| **Solution** | RightPanel 하단(운영 옵션 아래)에 메트릭스 제어 영역 추가 — IP/포트 입력, 연결/연결해제 버튼, 4행 그리드(입력 별칭 / No. / 연결상태 / 출력 별칭). 입력 셀 클릭 후 출력 셀 클릭 즉시 `s in N av out M!` 명령 전송(Auto-Take). 별칭은 셀 더블클릭 편집(10자, SQLite settings 영속). |
| **Function UX Effect** | Electron main이 TCP/8000 raw 소켓으로 PN-8080과 Persistent 연결 유지 + 자동 재연결(500/1000/2000/5000ms 5회 백오프) + socket 끊김 watchdog. 라우팅 상태는 `r av out 0!` 응답 파싱으로 동기화. IPC로 renderer에 push, 호스트 전용 패널(원격 PC는 비표시). 별칭은 모드와 무관하게 운영자가 자유롭게 명명. |
| **Core Value** | "사이니지 컨트롤과 매트릭스 컨트롤이 한 화면에" — 운영자가 두 앱을 오가지 않음. 향후 다른 매트릭스(Videohub, Atlona 등)를 추가하더라도 동일한 ServiceBase 패턴 + 옵션 레지스트리 확장만으로 대응 가능. |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 운영 중 매트릭스 라우팅 변경을 별도 앱 없이 사이니지 앱 한 화면에서 처리. |
| **WHO** | 운영자(호스트 PC) 전용 — 원격 LAN PC는 매트릭스 패널 비표시 (안전성). |
| **RISK** | (1) Electron main TCP 통신 안정성 / 자동 재연결 (2) PN-8080 응답 파싱 / 에러 코드 처리 (3) Renderer ↔ main IPC 상태 동기화 (4) 다른 옵션과의 레이아웃 충돌(좁아진 RightPanel). |
| **SUCCESS** | 연결 후 입력→출력 클릭으로 매트릭스 라우팅 즉시 반영 + 별칭 영속 저장 + 재시작 후 자동 연결 옵션 동작. |
| **SCOPE** | 단일 PN-8080(8×8 고정) + Auto-Take 고정 + Persistent+AutoReconnect 고정. 멀티 매트릭스/다른 모델은 별도 Plan. |

---

## 1. Overview / Problem

### 1.1 현재 상태 (v1.4)

- 운영 옵션 패널에는 사이니지 해상도/모드, 슬라이드 여백/효과 4 옵션만 노출
- 매트릭스 제어 기능 없음 — 운영자가 PN-8080 컨트롤 앱(C#) 따로 띄워서 조작
- Electron main 프로세스에 TCP 통신 코드 없음 (HTTP/SSE만)

### 1.2 문제

- **컨텍스트 스위치 부담**: 사이니지 슬라이드 변경하면서 매트릭스 라우팅도 함께 바꾸는 운영 시나리오에서 두 앱 사이 alt-tab
- **단일 PC 단일 화면**: 호스트 PC 화면 하나에 모든 운영 컨트롤 통합 필요
- **별도 앱 유지보수**: C# Pn8080Controller 앱은 따로 빌드/배포 — 사이니지 앱과 동기 어려움

### 1.3 해결 방향 (참고: `C:\Users\Administrator\Desktop\PN-8080 Controller`)

참고 프로젝트의 검증된 컴포넌트:
- **`Pn8080MatrixService`** (TCP/8000 ASCII 프로토콜) — 그대로 TypeScript로 포팅
- **`AliasMatrixControl`** (4행 그리드 UX) — React 컴포넌트로 재구현, Auto-Take 고정
- **`AliasSettings`** (10자 별칭, 입력/출력 각 8개) — SQLite settings에 JSON으로 영속

핵심 아키텍처:
- **Electron main**: `Pn8080MatrixService` (TS) — net.Socket 기반 TCP/8000 연결, Persistent + AutoReconnect, command queue (semaphore), 응답 정규식 파싱
- **IPC bridge**: `matrix:connect`, `matrix:disconnect`, `matrix:route`, `matrix:route-all`, `matrix:refresh`, `matrix:state` (push), `matrix:log` (push)
- **Preload whitelist**: 위 채널 추가
- **Renderer**: `useMatrixStore` (Zustand) — 상태 미러, IPC 호출 wrapper. `useMatrix()` hook for components.
- **UI**: `MatrixControlPanel` 컴포넌트 — RightPanel 하단 (Electron 환경에서만 렌더). IP/포트 input + 연결/해제 버튼 + 4-row grid (입력 8 / No. 8 / 연결상태 8 / 출력 8).
- **Settings**: `matrix.host`, `matrix.port`, `matrix.aliases` (`{input:string[8], output:string[8]}`), `matrix.autoConnect` (bool, 부팅 시 자동 연결)

---

## 2. Scope

### 2.1 In Scope

| # | Item | 결정 |
|---|------|------|
| 1 | Electron main TCP service (`Pn8080MatrixService.ts`) | Persistent + AutoReconnect 고정, ASCII 프로토콜, 5회 백오프 |
| 2 | IPC 채널 6개 (connect/disconnect/route/route-all/refresh + state push + log push) | preload whitelist 확장 |
| 3 | settings 5개 키 (host/port/aliases/autoConnect/) | registry 패턴 사용 가능한 곳은 registry로, 복합 객체(aliases)는 별도 |
| 4 | Renderer matrix store (Zustand) + useMatrix() 훅 | 기존 패턴 따라 server-mirror |
| 5 | MatrixControlPanel UI | 4-row grid, Auto-Take, 별칭 더블클릭 편집 |
| 6 | RightPanel 통합 (Electron 환경에서만) | `window.electronAPI` 가드 |
| 7 | 연결/연결해제 버튼 + 상태 인디케이터 | 연결중/연결됨/끊김 색상 구분 |
| 8 | 별칭 영속 + 재시작 후 복원 | SQLite settings JSON |

### 2.2 Out of Scope

- 멀티 매트릭스 (Videohub, Atlona 등) — 별도 Plan
- 매트릭스 명령 로그 UI (디버그용 콘솔) — main.log에는 기록하되 UI에는 노출 안 함
- HTTP/SSE 통한 원격 매트릭스 제어 — 호스트 전용
- PN-8080 외 다른 명령 (영상 fade, OSD, etc.) — 사용자 요구 안에 포함되지 않음
- 라우팅 일괄 변경(batch) UI — Auto-Take이므로 사실상 단일 변경만
- PTP / Apply All 버튼 (참고 프로젝트 기능) — 단순 UX 위해 v1.5 제외

---

## 3. Functional Requirements

| ID | Requirement | Acceptance |
|----|-------------|------------|
| FR-1 | RightPanel 하단(OperationOptionsPanel 아래)에 메트릭스 제어 영역 표시 | 시각 확인 |
| FR-2 | 패널은 Electron 환경(`window.electronAPI` 존재)에서만 렌더 | 원격 브라우저에서 비표시 |
| FR-3 | IP 입력 (예: `192.168.10.199`) + 포트 입력 (default 8000) | text input + number input |
| FR-4 | 연결 / 연결해제 버튼 (상태에 따라 토글) | 연결 시 disabled until disconnect |
| FR-5 | 상태 인디케이터 (연결중/연결됨/끊김/재연결중) — 색상 + 텍스트 | 시각 |
| FR-6 | 4행 8열 그리드 — 입력별칭 / No.(1~8) / 연결상태 / 출력별칭 | 시각 |
| FR-7 | 입력 셀 클릭 → 활성화(파란색) | 다시 클릭 시 비활성 |
| FR-8 | 입력 활성 상태에서 출력 셀 클릭 → 즉시 `s in N av out M!` 전송 (Auto-Take) | 응답 파싱 후 연결상태 업데이트 |
| FR-9 | 별칭 셀 더블클릭 → 인라인 편집 (최대 10자, Enter/Tab 확정, ESC 취소) | 빈 값 = 채널 번호 |
| FR-10 | 별칭 변경 즉시 SQLite settings 저장 (`matrix.aliases`) | DB 검사 |
| FR-11 | host/port 변경 시 settings 저장 (`matrix.host`, `matrix.port`) — 연결 중이면 자동 재연결 또는 안내 | UX 결정 |
| FR-12 | 자동 재연결 동작 — socket 끊김 감지 후 500/1000/2000/5000ms 5회 백오프 | 로그 확인 |
| FR-13 | `r av out 0!` 응답 파싱 (`input N -> output M` regex)으로 라우팅 상태 동기 | 연결상태 셀 갱신 |
| FR-14 | 에러 코드 E00/E01/E02 응답 시 사용자 알림(토스트 또는 로그) | 로그 검증 |
| FR-15 | 부팅 시 `matrix.autoConnect=true`이고 host가 설정되어 있으면 자동 연결 시도 | 옵션 |
| FR-16 | 모든 IPC 핸들러 try/catch로 보호 — main process 크래시 방지 | 코드 검증 |

---

## 4. Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | TS strict (any 금지) | tsc strict pass |
| NFR-2 | 명령→응답 latency | < 500ms (LAN, OverallTimeoutMs 2000) |
| NFR-3 | TCP 명령 직렬화 | Semaphore (참고 프로젝트와 동일) |
| NFR-4 | 자동 재연결 backoff | 500/1000/2000/5000/5000ms 5회 (참고 프로젝트와 동일) |
| NFR-5 | Watchdog tick | 2초 |
| NFR-6 | 별칭 길이 제한 | 10자 (참고 프로젝트와 동일) |
| NFR-7 | 매트릭스 명령 로그 | main.log에 Tx/Rx 모두 기록 (electron-log 재사용) |
| NFR-8 | UI 폭 | RightPanel 640px에 fit (그리드 셀 ~60×30) |

---

## 5. Success Criteria

| ID | Criteria | Verification |
|----|----------|--------------|
| SC-1 | RightPanel 하단에 메트릭스 제어 영역 표시 (호스트 한정) | 수동 |
| SC-2 | IP+포트 입력 후 "연결" 클릭 → 1초 안에 "연결됨" 표시 | 수동 (실기기 또는 에뮬레이터) |
| SC-3 | 입력 셀 클릭 → 출력 셀 클릭 → 라우팅 즉시 변경 + 연결상태 셀 갱신 | 수동 |
| SC-4 | 별칭 셀 더블클릭 → 편집 → Enter → 저장 + 셀 텍스트 변경 + DB 영속 | 수동 + DB 검사 |
| SC-5 | 매트릭스 전원 차단 후 재인가 → 자동 재연결 + UI 상태 자동 복귀 | 수동 |
| SC-6 | 잘못된 입력(예: 9번) 시도 → 에러 응답(E01) → UI 알림 | 수동 |
| SC-7 | 앱 재시작 → 마지막 host/port/aliases 자동 복원 + autoConnect 시 자동 연결 | 수동 |
| SC-8 | 원격 LAN PC 브라우저 → 메트릭스 제어 영역 비표시 (호스트 전용) | 수동 |
| SC-9 | v1.4 기능 무회귀 (사이니지 모드 토글, 슬라이드 CRUD, IME 등) | 회귀 |

---

## 6. Risks & Mitigations

| ID | Risk | L | Mitigation |
|----|------|:-:|------------|
| R-1 | TCP 통신 코드 main process 크래시 → 사이니지 앱 전체 종료 | M | 모든 IPC 핸들러 try/catch, 통신 함수도 catch, electron-log로 stack trace 남김 |
| R-2 | 매트릭스 응답 파싱 실패 (펌웨어 버전 차이 등) | M | regex 매칭 실패 시 fallback (요청한 routing 직접 cache 업데이트). 참고 프로젝트의 `ApplyResponseOrFallback` 패턴 재사용 |
| R-3 | 자동 재연결 무한 반복으로 로그 폭주 | L | 5회 백오프 후 중단 — 사용자가 수동 재연결 |
| R-4 | host/port 변경 시 기존 연결 처리 | L | 변경 즉시 자동 재연결 안 함 — "연결해제" 후 "연결" 다시 누르도록 안내 (단순) |
| R-5 | Renderer ↔ main 상태 desync | M | main이 단일 진실, IPC `matrix:state` push로 renderer 갱신. renderer 명령은 항상 IPC 호출 + 응답 대기 |
| R-6 | RightPanel 좁아 그리드 안 들어감 | M | 셀 폭 60px × 9열(라벨+8) = 540px, 패딩 포함 ~600px → 640px 패널에 fit. 또는 셀 폭 줄여 50px ×9 = 450px. |
| R-7 | autoConnect로 부팅 시 매트릭스 없는 환경에서 timeout 대기 | L | autoConnect 옵션 default false. 사용자가 명시적으로 켜야 부팅 시 시도 |
| R-8 | v1.4 SQLite 마이그레이션과 같은 부팅 실패 패턴 | M | 새 settings 키는 registry로 추가 + seed default — 마이그레이션 없음 |
| R-9 | 통신 로그가 main.log 폭주 | L | electron-log rotation으로 자동 관리. 추가로 Tx/Rx만 info 레벨, 디테일은 debug |

---

## 7. Open Questions (Resolved)

| ID | Question | Decision |
|----|----------|----------|
| Q-1 | 명령 적용 UX | **Auto-Take 고정** — 입력→출력 클릭 즉시 전송, Take 버튼 없음 |
| Q-2 | 원격 LAN PC 제어 권한 | **호스트 전용** — 원격에는 패널 자체 비표시 |
| Q-3 | 매트릭스 개수 | **단일 PN-8080** — settings 키 몇 개로 처리, 멀티는 별도 Plan |
| Q-4 | 연결 모드 | **Persistent + AutoReconnect 고정** — 반응 빠름 + watchdog 안정 |

---

## 8. Dependencies & Affected Files

### 8.1 새 파일 (예상 ~7개)

- `electron/services/Pn8080MatrixService.ts` — TCP service (참고 프로젝트 TS 포팅)
- `electron/services/matrixManager.ts` — singleton wrapper + IPC handlers 등록
- `lib/api/matrix.ts` — 렌더러 IPC wrapper (typed)
- `store/useMatrixStore.ts` — Zustand store
- `hooks/useMatrix.ts` — 편의 hook
- `components/MatrixControlPanel.tsx` (+ `.module.css`) — UI
- `components/MatrixAliasCell.tsx` (별칭 셀 + 인라인 편집, 선택적 분리)

### 8.2 수정 파일

- `electron/main.ts` — matrixManager 초기화, app.quit 시 disconnect
- `electron/preload.ts` — IPC 채널 화이트리스트 확장 (`matrix:*`)
- `electron/db/seed.ts` — `matrix.host` (default 192.168.10.199), `matrix.port` (default 8000), `matrix.autoConnect` (default false), `matrix.aliases` (default {input:[1..8], output:[1..8]}) 시드
- `lib/options/registry.ts` — host/port/autoConnect는 운영 옵션 패널에 표시할 수도 있고 매트릭스 패널 안에 둘 수도 — Design에서 결정. 별칭은 너무 구조적이라 운영 옵션 패널과 안 어울려서 매트릭스 패널 내부.
- `components/RightPanel.tsx` — Electron 가드로 `<MatrixControlPanel/>` 마운트
- `types/` — `MatrixState`, `RouteMap`, `MatrixAliases` 타입 추가

### 8.3 외부 의존성

- 신규 npm 패키지 0 — `net` 모듈은 Node.js 기본
- electron-log 재사용

---

## 9. Protocol Cheat-sheet (PN-8080)

| Command | Send | Response | Notes |
|---------|------|----------|-------|
| Route single | `s in <I> av out <O>!` | `input I -> output O` | I=1..8, O=1..8 |
| Route all | `s in <I> av out 0!` | `input I -> output 1`...`output 8` (8 lines) | I→모든 출력 |
| Refresh | `r av out 0!` | `input N -> output M` × 8 | 전체 라우팅 조회 |
| Error 일반 | (any) | `E00` | 일반 오류 |
| Error 잘못 입력 | (any) | `E01` | input out of range |
| Error 잘못 출력 | (any) | `E02` | output out of range |

연결: TCP/8000, ASCII (Encoding.ASCII.GetBytes), 명령 종결 `!`. 응답은 `\r\n` 정규화 후 trim.

타이밍 권장값 (참고 프로젝트):
- ConnectTimeoutMs: 2000
- OverallTimeoutMs: 2000
- QuietPeriodMs: 100 (응답 첫 바이트 후 100ms 동안 추가 데이터 없으면 종료)
- Watchdog tick: 2000ms
- Reconnect backoff: [500, 1000, 2000, 5000, 5000] ms — 5회 시도

---

## 10. Layout Sketch

```
RightPanel (640px):

┌──────────────────────────────────────────────┐
│ Preview thumbnail (~114h)                    │
├──────────────────────────────────────────────┤
│ PlaybackControls (~120h)                     │
├──────────────────────────────────────────────┤
│ 운영 옵션                                     │
│   • 사이니지 해상도   [5760×1080 ▼]           │
│   • 사이니지 모드     (●) 서라운드 ( ) 개별   │
│   • 슬라이드 상하 여백 [━━━●━━━] 50px        │
│   • 효과              [━━●━━━━] 0.5초         │
├──────────────────────────────────────────────┤
│ 메트릭스 제어                              ── │ ← v1.5 신규
│   IP: [192.168.10.199]  포트: [8000]         │
│   [ 연결 ]      ● 연결됨                     │
│                                              │
│   ┌─────┬───┬───┬───┬───┬───┬───┬───┬───┐    │
│   │입력 │ 1 │ 2 │ 3 │ 4 │ 5 │ 6 │ 7 │ 8 │    │ ← 별칭 (클릭 = 입력 선택)
│   │ No.│ 1 │ 2 │ 3 │ 4 │ 5 │ 6 │ 7 │ 8 │    │
│   │ 연결│ 1 │ 2 │ 3 │ 4 │ 5 │ 6 │ 7 │ 8 │    │ ← 현재 input→output 매핑
│   │출력 │ 1 │ 2 │ 3 │ 4 │ 5 │ 6 │ 7 │ 8 │    │ ← 별칭 (클릭 = 출력 라우팅)
│   └─────┴───┴───┴───┴───┴───┴───┴───┴───┘    │
└──────────────────────────────────────────────┘
```

매트릭스 패널 폭 추정:
- 라벨 60 + 셀 60×8 + 패딩 = 60+480+24 = ~564px → 640px 패널에 여유 fit
- 호스트 전용이므로 원격 PC에서는 운영 옵션까지만 표시

---

## 11. Next Phase

`/pdca design matrix-control` — 아키텍처 3안 비교 후 결정. 핵심 결정:
- main process service singleton vs per-window
- IPC 채널 명명 + 직렬화 형식
- Renderer store 패턴 (Zustand vs Context) — 기존 v1.3 패턴 따라 Zustand
- 별칭 셀 인라인 편집 구현 (TextOverlay vs contentEditable vs input replacement)
- 자동 재연결 / watchdog 구조 (참고 프로젝트 그대로 vs 단순화)
