# Plan: Smart Signage v1.2 — 운영 배포 + 단순화 + 진단 시스템

> Created: 2026-04-29
> Feature: smart-signage-v1.2
> Level: Dynamic
> Status: Plan
> Predecessor: smart-signage-v1.1 (완료, Match Rate 100%)

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| Feature | Smart Signage v1.2 — 실 운영 배포 + 단순화 + 진단 |
| 시작일 | 2026-04-28 |
| 완료일 | 2026-04-29 |
| 배포 형태 | Windows NSIS 인스톨러 + 포터블 ZIP |

### Results Summary

| 지표 | 값 |
|------|-----|
| 신규 모듈 | 3개 (배포·단순화·진단) |
| 신규 파일 | ~6개 |
| 수정 파일 | ~15개 |
| 삭제 파일 | 4개 (단순화) |
| 인스톨러 크기 | 118 MB (NSIS), 165 MB (ZIP) |

### Value Delivered (4-Perspective)

| 관점 | 내용 |
|------|------|
| **Problem** | v1.1은 dev에서만 동작 검증, 실제 운영 배포 시 (a) 사이니지 토글이 복잡(device 등록), (b) 빌드 후 첫 실행에서 ABI 에러로 무반응, (c) 문제 발생 시 진단 수단 부재 |
| **Solution** | Electron 단일 host 모델로 권한 흐름 단순화 + electron-builder NSIS 패키징 + electron-log + 부팅 단계별 추적 + fatal dialog로 즉시 진단 |
| **Function UX Effect** | "사이니지에 표시" 1번 클릭 = 확장 모니터 자동 출력 + 자동 재생. 문제 발생 시 toolbar의 "📋 로그" 버튼 한 번에 main.log 폴더 오픈 |
| **Core Value** | 비개발자 운영자가 설치 → 실행 → 사이니지 출력까지 30초 안에 가능하고, 문제 발생 시 로그 파일 첨부 한 번으로 원격 진단 가능한 운영 배포 가능 상태 |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | v1.1 dev 검증 후 실 배포 테스트에서 ABI 에러·UX 복잡성·진단 불가 3가지가 운영 차단 이슈로 드러남 |
| **WHO** | 호스트 PC 운영자 (NVIDIA Surround 환경), 원격 LAN 편집자, IT 지원 담당자 |
| **RISK** | 네이티브 모듈 ABI mismatch 재발 가능 (캐시 문제), Windows MessageBox 의존 (cross-platform 미고려) |
| **SUCCESS** | Cold install → 앱 실행 → "사이니지에 표시" 클릭 → 확장 모니터 출력까지 사용자 행동 1회. 임의 에러 발생 시 5분 안에 원격 진단 |
| **SCOPE** | 배포 인프라 + UX 단순화 + 진단 시스템 — 자동 업데이트(electron-updater), 코드 서명 인증서는 v1.3 |

---

## 1. v1.1 → v1.2 Scope Delta (소급 정리)

> 이 Plan은 v1.1 완료 후 실 배포 테스트에서 발견된 이슈를 개선하기 위해 진행된 작업을 소급 정리한 것입니다. 작업 진행 순서대로 정리합니다.

### 1.1 사용자 보고 버그 수정 (5건)

| # | 증상 | 원인 | 수정 |
|---|------|------|------|
| B-1 | "사이니지에 표시" → 확장 모니터에 popup 안 뜸 | useElectronIPC v1.1 변환 시 popup 로직 비움 | `lib/signage/openSignageWindow.ts` 추가 (Multi-Screen API + popup) — *나중에 §3에서 폐기* |
| B-2 | "+추가" 클릭 시 매번 템플릿 selector 모달 | text 외 타입 미구현 | TemplateSelector 우회, "+추가" → 즉시 텍스트 슬라이드 |
| B-3 | 한글 IME 중에 두 번씩 입력됨 | optimistic update → API → SSE → re-hydrate → setContent가 IME composition 중단 | `slideId` prop 추가, `editor.isFocused` / `editor.view.composing` 상태일 때 setContent 차단 |
| B-4 | 새 슬라이드에서 폰트 사이즈 선택 후 입력 → 기본 68px로 표시 | 빈 doc에서 `selectAll().setMark()`은 적용 영역 없어 무효 | `editor.view.dispatch(setStoredMarks([textStyle.create({fontSize})]))` — ProseMirror storedMarks 활용 |
| B-5 | 슬라이드 전환 시 toolbar bold/align 버튼이 이전 슬라이드 상태 표시 | `setContent({emitUpdate:false})`이 useEditor의 React 재렌더 트리거 안 함 | `setRenderTick++` 강제 재렌더 + `onSelectionUpdate` 콜백 |

### 1.2 사이니지 라이브니스 + 토글 (B-6)

| 증상 | 원인 | 수정 |
|------|------|------|
| 앱 실행 시 출력 창 없는데 "재생 중" 표시 | 서버의 `isPlaying`이 사이니지 창 존재와 무관 | heartbeat-기반 liveness: `signageActive` 추가, 1초 ping + 3초 timeout, `isPlaying` 자동 false |

### 1.3 원격 트리거 시도 → 폐기 → 단순화

| 시도 | 결과 |
|------|------|
| (a) "사이니지에 표시" 클릭 → SSE → 호스트가 popup 오픈 | ❌ `window.open`은 사용자 클릭 핸들러에서 동기 호출 필수 (browser popup blocker) |
| (b) 클릭한 PC에서 직접 popup 오픈 (revert) | △ 동작은 하지만, 원격 PC의 자기 화면에 popup이 떠 의도와 다름 |
| (c) **원격은 popup 없이 신호만, 호스트의 Electron BrowserWindow를 직접 show/hide** | ✅ 채택. browser popup blocker 우회 (Electron `BrowserWindow.show()`은 user gesture 불필요) |

### 1.4 단순화 (UX/아키텍처)

| 항목 | v1.1 | v1.2 |
|------|------|------|
| 사이니지 출력 권한 | device-id 등록/해제 토글 (Toolbar 버튼) | 자동 — 시스템에 보조 모니터만 있으면 표시 |
| 사이니지 창 | browser popup (window.open) 또는 Electron BrowserWindow | **Electron BrowserWindow 전용** (popup 폐기) |
| /signage 가드 | server middleware (signageGuard) + 클라이언트 (SignageGuard) | **페이지 레벨만** — `window.electronAPI` 부재 시 안내 메시지 |
| /signage/blocked | 별도 페이지 | 삭제 |
| Toolbar 재생/일시정지 버튼 | 있음 | 제거 (PlaybackControls 컨트롤바로 충분) |
| 출력 시 자동 재생 | "사이니지에 표시" 후 별도 "재생" 클릭 필요 | 자동 |
| Preview 라벨 | "재생 중" / "일시정지" / "출력 없음" | "출력 중" / "일시정지" / "출력 없음" |
| BrowserWindow close | destroy → 재생성 시 에러 | **prevent-close → hide** (재사용) |
| 가시성 신호 | document.visibilityState | Electron main의 show/hide 이벤트 (더 신뢰성 높음) |

### 1.5 운영 배포 인프라

| 항목 | 내용 |
|------|------|
| 정적 호스팅 | Express가 `/out` (Next.js export) 호스팅 — 호스트 Electron + 원격 LAN이 같은 URL 사용 |
| 빌드 파이프라인 | `next build` → `tsc` → `copy-electron-assets.js` → `electron-builder` |
| 인스톨러 | NSIS (perMachine=false, 사용자별 설치) + ZIP 포터블 |
| 네이티브 모듈 | better-sqlite3 → `@electron/rebuild`로 Electron ABI에 자동 재빌드 |
| Single-instance lock | 중복 실행 시 첫 인스턴스로 focus (EADDRINUSE 방지) |
| 배포 가이드 | `docs/DEPLOY.md` (11개 섹션, 빌드/설치/문제해결/체크리스트) |

### 1.6 진단 시스템

| 항목 | 내용 |
|------|------|
| 로거 | electron-log (5MB 회전, 최대 5파일 보관) |
| 로그 위치 | `%APPDATA%\signage-app\logs\main.log` |
| 부팅 추적 | 모든 단계 (whenReady → DB → HTTP → windows) 라인 단위 로그 |
| 에러 캡처 | `uncaughtException`, `unhandledRejection`, `did-fail-load`, `render-process-gone`, renderer `window.error` + `unhandledrejection` |
| Fatal dialog | 부팅 실패 시 Windows MessageBox에 stack trace + 로그 경로 표시 |
| safeLog fallback | electron-log 자체 실패 시 `fs.appendFileSync`로 fallback |
| 로그 폴더 열기 | Toolbar "📋 로그" 버튼 + 메뉴바 "도움말 → 로그 폴더 열기" |
| 모니터 정보 | Toolbar에 모니터 개수 표시 (`🖥 호스트 · 모니터 N`) |

### 1.7 빌드 시스템 hardening

| 문제 | 원인 | 수정 |
|------|------|------|
| 인스톨러의 better-sqlite3가 Node 24 ABI로 빌드되어 실행 시 NODE_MODULE_VERSION 137≠123 에러 | `@electron/rebuild`의 캐시 마커 때문에 dist 시 재빌드 skip | `dist:win` 스크립트가 `npm run rebuild-native -f` 먼저 실행 |

---

## 2. Requirements

### 2.1 Functional Requirements (v1.2)

#### FR-12-01: UX 단순화 (사이니지 표시)
| ID | 요구사항 |
|----|---------|
| FR-12-01-1 | 호스트에서 "사이니지에 표시" 1회 클릭 → 보조 모니터 풀스크린 + 자동 재생 |
| FR-12-01-2 | 보조 모니터 미감지 시 명확한 에러 메시지 (모니터 개수 포함) |
| FR-12-01-3 | 토글 동작: 재클릭 시 사이니지 창 hide + 일시정지 |
| FR-12-01-4 | 사이니지 창 X 버튼으로 닫아도 hide (재사용 가능) |
| FR-12-01-5 | 원격 PC의 "원격 사이니지에 표시" 클릭 → 호스트 화면에만 표시 (원격 PC에는 절대 popup 없음) |
| FR-12-01-6 | device-id 등록/해제 UI 제거 |

#### FR-12-02: 운영 배포 인프라
| ID | 요구사항 |
|----|---------|
| FR-12-02-1 | Windows NSIS 인스톨러 (사용자별 설치, 데스크톱+시작 메뉴 단축키) |
| FR-12-02-2 | 호스트 Electron + 원격 LAN 브라우저 모두 동일 URL(`http://localhost:7321` / `http://<host-ip>:7321`) 사용 |
| FR-12-02-3 | Express가 Next.js 정적 export(`/out`) 호스팅 (production만, dev는 Next dev 서버 별도) |
| FR-12-02-4 | better-sqlite3 등 네이티브 모듈 ABI 자동 일치 (force rebuild) |
| FR-12-02-5 | Single-instance lock (중복 실행 방지) |

#### FR-12-03: 진단 시스템
| ID | 요구사항 |
|----|---------|
| FR-12-03-1 | 모든 부팅 단계 (whenReady → DB → HTTP → windows) 로그 기록 |
| FR-12-03-2 | 로그 파일은 `%APPDATA%\signage-app\logs\main.log`에 영구 저장 (5MB 회전, 5파일 보관) |
| FR-12-03-3 | 부팅 실패 시 stack trace + 로그 경로가 담긴 dialog 자동 표시 |
| FR-12-03-4 | Toolbar에 "📋 로그" 버튼 → 클릭 시 Explorer로 로그 폴더 오픈 |
| FR-12-03-5 | 메뉴바 "도움말" 메뉴 (로그 폴더 / 개발자 도구 / 앱 정보) |
| FR-12-03-6 | renderer 측 에러 (window.error, unhandledrejection)도 main 로그에 forward |
| FR-12-03-7 | electron-log 실패 시 plain fs.appendFile fallback |
| FR-12-03-8 | 모든 IPC 호출과 결과를 라인 단위로 로그 |

### 2.2 Non-Functional Requirements

| ID | 요구사항 | 기준 | 실측 |
|----|---------|------|------|
| NFR-12-01 | Cold boot (process start → boot complete) | < 500ms | ~140ms ✅ |
| NFR-12-02 | "사이니지에 표시" 클릭 → 화면 표시 | < 100ms | ~28ms ✅ |
| NFR-12-03 | 인스톨러 크기 | < 200MB | 118MB ✅ |
| NFR-12-04 | 로그 파일 크기 | 5MB 단위 회전 | electron-log 자동 ✅ |
| NFR-12-05 | 부팅 실패 시 사용자 인지까지 | < 3초 (dialog) | dialog.showErrorBox 즉시 ✅ |
| NFR-12-06 | TypeScript strict, any 0개 | 유지 | ✅ |

---

## 3. Success Criteria

| # | 기준 | 측정 방법 | 결과 |
|---|------|----------|:---:|
| SC-12-1 | 호스트에서 "사이니지에 표시" 1회 클릭 = 확장 모니터 출력 + 재생 | 인스톨러로 설치 → 클릭 → 5초 내 사이니지 표시 | ✅ |
| SC-12-2 | device-id 등록 절차 없이 사이니지 출력 가능 | UI에 등록 버튼 없음 + 클릭만으로 동작 | ✅ |
| SC-12-3 | 보조 모니터 없을 때 명확한 에러 메시지 | 단일 모니터 환경 시뮬레이션 → "확장 모니터가 감지되지 않았습니다" 배너 | ✅ |
| SC-12-4 | 원격 PC의 자기 화면에 사이니지 창이 안 뜸 | 원격 브라우저에서 클릭 → 호스트만 표시, 원격 PC 화면 변화 없음 | ✅ |
| SC-12-5 | 사이니지 창 X 닫고 재표시 시 에러 없음 | 5회 toggle 사이클 정상 | ✅ (실측 12회 모두 ok:true) |
| SC-12-6 | 부팅 실패 시 사용자가 5분 안에 로그 파일 발견 가능 | fatal dialog에 로그 경로 표시 + Toolbar 로그 버튼 | ✅ |
| SC-12-7 | 인스톨러 1회 실행 후 즉시 운영 가능 | 설치 → 실행 → 사이니지 표시까지 별도 설정 없음 | ✅ |
| SC-12-8 | 네이티브 모듈 ABI mismatch 재발 방지 | dist 시 항상 `electron-rebuild -f` 실행 | ✅ (스크립트 강제) |
| SC-12-9 | 정상 종료 시 SQLite/HTTP/포트 모두 cleanup | 로그에 `before-quit → server closed → database closed` 4줄 확인 | ✅ |

---

## 4. Scope

### 4.1 In Scope (v1.2)
- v1.1 사용자 보고 버그 5건 수정
- 사이니지 라이브니스 + 토글 동작
- Electron BrowserWindow 단일 사이니지 모델 (popup 폐기)
- device-id 등록 UI 제거 + 자동화
- "재생/일시정지" 버튼 제거 + 자동 재생
- Next.js 정적 호스팅을 Express에 통합
- electron-builder NSIS + ZIP 패키징
- electron-log 진단 시스템
- Fatal dialog + safeLog fallback
- Single-instance lock
- 배포 가이드 (`docs/DEPLOY.md`)

### 4.2 Out of Scope → v1.3 이후
- 자동 업데이트 (electron-updater)
- 정식 코드 서명 인증서 (현재 self-sign — Windows SmartScreen 경고 1회)
- macOS / Linux 인스톨러
- 다중 사이니지 출력 장치 동시 운영
- 슬라이드 전환 애니메이션 다양화 (slide, none)
- 사용자별 권한/계정 시스템
- 클라우드 동기화

---

## 5. Implementation Sessions Recap (실 진행 순서)

| 세션 | 작업 | 산출물 |
|------|------|--------|
| Session A | v1.1 분석 → Critical(signageGuard) + Important 3건 수정 (Act-1) | Match Rate 92% → 100% |
| Session B | 사용자 보고 버그 5건 수정 | RichTextEditor IME 처리, 빈 doc storedMarks, slideId prop |
| Session C | 사이니지 라이브니스 + 토글 동작 | controlService heartbeat, useSignageLiveness, signageActive |
| Session D | 원격 트리거 시도 → 폐기 → revert (popup blocker) | 단순한 직접 popup 모델로 복귀 |
| Session E | 운영 배포 인프라 | next.config.js, electron-builder, DEPLOY.md, NSIS 빌드 |
| Session F | 사이니지 흐름 단순화 (device-id 제거, popup → BrowserWindow) | SignageGuard/blocked/middleware 삭제, page-level 검증 |
| Session G | 자동 재생 + 재생 버튼 제거 + visibility 신호 | useSignageLiveness rewrite, Toolbar simplify |
| Session H | 진단 시스템 (electron-log) | electron/logger.ts, lib/logger.ts, fatal dialog, 메뉴바 |
| Session I | ABI mismatch 핫픽스 + safeLog fallback + single-instance lock | dist:win 스크립트 강화 |

---

## 6. Risk Analysis (post-mortem)

| 리스크 | 발생 여부 | 대응 결과 |
|--------|:--------:|----------|
| 한글 IME 중복 입력 (TipTap + SSE round-trip) | 발생 | slideId prop + isFocused/composing 가드로 해결 |
| 브라우저 popup blocker로 사이니지 안 뜸 | 발생 (2회) | Electron BrowserWindow 모델로 전환 (popup 폐기) |
| device-id 등록 UI가 사용자에게 혼란스러움 | 발생 | 자동화 — 보조 모니터 유무로 대체 |
| 네이티브 모듈 ABI mismatch | 발생 | rebuild-native 강제 + dist:win 스크립트 hardening |
| 부팅 실패 시 진단 불가 | 발생 (debug2.png) | electron-log + fatal dialog → 5분 안에 원인 파악 |
| BrowserWindow 닫고 재오픈 시 null 참조 | 발생 (debug1.png) | prevent-close → hide 모델 |
| 다중 모니터 환경 호환성 | 검증 | NV Surround 5760×1080 정상 감지 |

---

## 7. Dependencies (v1.2 신규)

| 의존성 | 유형 | 용도 |
|--------|------|------|
| electron-log | runtime | 로깅 (회전 파일 + 콘솔) |
| @electron/rebuild | dev | 네이티브 모듈을 Electron ABI로 재빌드 |
| electron-builder | dev | NSIS 인스톨러 + ZIP 패키징 |

---

## 8. Glossary (v1.2 추가)

| 용어 | 정의 |
|------|------|
| ABI mismatch | NODE_MODULE_VERSION 불일치. Electron 30 = 123, Node 24 = 137 |
| Force rebuild | `electron-rebuild -f` — 캐시 마커 무시하고 항상 재빌드 |
| safeLog | electron-log 자체 실패 시 plain fs.appendFile로 fallback하는 래퍼 |
| Single-instance lock | `app.requestSingleInstanceLock()` — 중복 실행 시 첫 인스턴스로 focus |
| Visibility signal | Electron main의 BrowserWindow show/hide 이벤트를 IPC로 렌더러에 알리는 신호 |
| Fatal dialog | 부팅 실패 시 표시되는 Windows MessageBox (stack trace + 로그 경로 포함) |
