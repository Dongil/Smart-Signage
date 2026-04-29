# Analysis: Smart Signage v1.2 — Final Gap Detection

> Created: 2026-04-29
> Feature: smart-signage-v1.2
> Phase: Check (final)
> Match Rate: **100% (33/33)**
> Verification: 실 인스톨러 배포 + 로그 첨부 분석 (debug2.png + main.log)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | v1.1 dev 검증 후 실 배포 테스트에서 ABI 에러·UX 복잡성·진단 불가 3가지가 운영 차단 이슈로 드러남 |
| **WHO** | 호스트 PC 운영자, 원격 LAN 편집자, IT 지원 담당자 |
| **RISK** | 네이티브 모듈 ABI mismatch 재발 가능, Windows MessageBox 의존 |
| **SUCCESS** | Cold install → 클릭 → 출력까지 1회 행동, 에러 시 5분 안에 원격 진단 |
| **SCOPE** | 배포 인프라 + UX 단순화 + 진단 시스템 |

---

## 1. Strategic Alignment

| 층위 | 검증 | 결과 |
|------|------|:---:|
| Plan WHY | 실 배포 운영 가능 상태 | ✅ 인스톨러로 배포·실행·운영 검증됨 |
| Plan SCOPE | UX 단순화 + 배포 + 진단 3축 | ✅ 9개 SC 모두 달성 |
| User feedback closure | 사용자 보고 5+α 버그 | ✅ 모두 수정 |

---

## 2. Success Criteria Evaluation

| # | 기준 | 결과 | 증거 |
|---|------|:---:|------|
| SC-12-1 | "사이니지에 표시" 1회 클릭 = 출력+재생 | ✅ | main.log 13:11:52: 클릭 → 28ms 후 ok:true |
| SC-12-2 | device-id 등록 절차 없음 | ✅ | Toolbar.tsx에 등록 버튼 부재, 자동 보조 모니터 감지 |
| SC-12-3 | 보조 모니터 없을 때 명확 메시지 | ✅ | `displayCount: N개` 포함된 에러 배너 (Toolbar.tsx) |
| SC-12-4 | 원격 PC 자기 화면 popup 없음 | ✅ | useSignageRemoteHandler가 `window.electronAPI` 부재 시 short-circuit |
| SC-12-5 | 사이니지 창 토글 5회 무에러 | ✅ | main.log: 12회 toggle 모두 ok:true |
| SC-12-6 | 부팅 실패 5분 내 진단 가능 | ✅ | debug2.png — fatal dialog가 stack + 로그 경로 표시 |
| SC-12-7 | 인스톨러 1회 실행으로 운영 시작 | ✅ | NSIS perMachine=false, 단축키 자동 생성 |
| SC-12-8 | ABI mismatch 재발 방지 | ✅ | dist:win 스크립트가 `rebuild-native -f` 선행 |
| SC-12-9 | 정상 종료 cleanup | ✅ | main.log: editor closed → before-quit → server closed → database closed (4단계 모두 기록) |

**전체: 9/9 ✅ = 100%**

---

## 3. Architecture Decisions Verification

| 결정 | 상태 | 증거 |
|------|:---:|------|
| Electron BrowserWindow 단일 사이니지 모델 (popup 폐기) | ✅ | `lib/signage/openSignageWindow.ts` 삭제, electron/main.ts 직접 IPC |
| device-id 등록 UI 제거 | ✅ | Toolbar.tsx에 등록 버튼 부재 |
| 페이지-레벨 가드 (server middleware 폐기) | ✅ | signageGuard.ts 삭제, /signage 페이지가 `window.electronAPI` 검사 |
| Electron BrowserWindow prevent-close → hide | ✅ | electron/main.ts: `signageWin.on('close', e => e.preventDefault(); hide())` |
| Visibility signal (show/hide IPC) | ✅ | electron/main.ts: `signageWin.on('show'/'hide')` → preload `signage-visibility` 채널 |
| Express 정적 호스팅 (production) | ✅ | server/index.ts: `staticDir` 옵션 + SPA fallback |
| electron-builder NSIS | ✅ | package.json `build` 섹션 + release/*.exe |
| Single-instance lock | ✅ | electron/main.ts: `app.requestSingleInstanceLock()` |
| electron-log + safeLog fallback | ✅ | electron/logger.ts |
| Force rebuild for ABI | ✅ | package.json: `dist:win` → `rebuild-native && build && electron-builder` |

---

## 4. Numerical Match Rate

| 카테고리 | 검증 | 통과 |
|----------|:---:|:---:|
| 사용자 보고 버그 (B-1~B-5) | 5 | 5 |
| 라이브니스 + 토글 (B-6) | 1 | 1 |
| 단순화 항목 (8개) | 8 | 8 |
| 배포 인프라 (5개) | 5 | 5 |
| 진단 시스템 (8개) | 8 | 8 |
| Success Criteria (9개) | 9 | 9 |
| ABI hardening (1개) | 1 | 1 |
| **합계** | **33** | **33** |

**Match Rate: 33/33 = 100%** ✅

---

## 5. 실 운영 검증 (main.log 첨부 분석)

운영자가 인스톨러 설치 후 실측한 main.log 분석 결과:

| 메트릭 | 측정값 |
|--------|:------:|
| Cold boot 시간 | 140ms (목표 <500ms) |
| 사이니지 표시 IPC 왕복 | 28ms (목표 <100ms) |
| 사이니지 토글 사이클 | 12회 / 0 에러 |
| 부팅 실패 (1회 — ABI 에러) → 자동 dialog 표시 | ✅ |
| 부팅 성공 (3 세션) | ✅ |
| 정상 종료 (3 세션) | ✅ |
| device-id 영속성 | ✅ (재시작 시에도 동일 ID) |
| NV Surround 5760×1080 인식 | ✅ |
| renderer 에러 | 0건 |

---

## 6. Decision Record (PRD→Plan→Design→Implementation 체인)

| Decision | Origin | 구현 결과 |
|----------|--------|:--------:|
| 단일 PC 데모 → LAN 운영 솔루션 | v1.1 Plan | ✅ Express + 단일 포트 모드 |
| Architecture: Pragmatic Balance | v1.1 Design | ✅ Zustand + 서버 권위 + SSE 유지 |
| device-id 권한 → 자동 보조 모니터 감지 | v1.2 Plan (post-feedback) | ✅ Toolbar 단순화 |
| Browser popup → Electron BrowserWindow | v1.2 Plan (post-feedback) | ✅ popup 코드 폐기 |
| Heartbeat liveness → visibility signal | v1.2 Plan (Session G) | ✅ document.hidden 의존 제거 |
| `dist:win` force-rebuild | v1.2 Plan (Session I) | ✅ ABI mismatch 재발 방지 |
| 진단 시스템 (electron-log + dialog) | v1.2 Plan (Session H) | ✅ debug2.png 5분 진단 입증 |

모든 결정이 코드에 일관되게 반영됨.

---

## 7. Confidence Notes

- 정적 코드 분석 + 실 인스톨러 빌드 + 사용자 환경 main.log 첨부까지 3중 검증 → confidence ≥ 95%
- 미검증 영역: macOS / Linux 빌드 (v1.3에서 다룸), 5+ 다중 클라이언트 동시성 부하 (v1.3에서 다룸)
- 다중 사이니지 출력 장치 동시 운영은 v1.3 이후 검토 (v1.2 SCOPE 외)

---

## 8. Final Verdict

**v1.2.0이 운영 배포 가능 상태입니다.**

- ✅ Match Rate 100%
- ✅ 9/9 Success Criteria 달성
- ✅ 사용자 환경에서 실측 검증 완료 (main.log 첨부)
- ✅ 진단 시스템으로 향후 이슈 빠른 트리아지 가능

다음 단계로 `/pdca report v1.2`로 이동하여 완료 보고서 생성.
