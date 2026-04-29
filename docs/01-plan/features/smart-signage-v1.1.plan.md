# Plan: Smart Signage v1.1 — 운영 배포 보완 (DB 일관성 + 권한 분리 + 네비게이션 + HWPX 불러오기)

> Created: 2026-04-27
> Feature: smart-signage-v1.1
> Level: Dynamic
> Status: **Completed (Match Rate 100%)**
> Predecessor: smart-signage v1.0 (MVP 완료)
> Successor: **smart-signage-v1.2** (배포·단순화·진단 — `docs/01-plan/features/smart-signage-v1.2.plan.md` 참조)
>
> **v1.1 → v1.2 변경 요약**: 실 배포 테스트 후 (a) device-id 등록 UI 제거 + 자동 보조 모니터 감지로 단순화, (b) 사이니지 popup → Electron BrowserWindow 단일 모델, (c) /signage 가드를 페이지 레벨로 이동(server middleware 폐기), (d) 자동 재생 + "재생/일시정지" 버튼 제거. 자세한 내역은 v1.2 plan과 v1.2 report 참조.

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| Feature | Smart Signage v1.1 — 운영 배포 보완 |
| 시작일 | 2026-04-27 |
| 예상 기간 | 4~6 세션 |
| 베이스 | v1.0 MVP (4종 템플릿 + 편집/출력 완료) |

### Results Summary

| 지표 | 값 |
|------|-----|
| 총 기능 모듈 | 5개 |
| 신규 파일 | ~12개 |
| 수정 파일 | ~10개 |
| 예상 코드량 | ~2,000 lines |

### Value Delivered (4-Perspective)

| 관점 | 내용 |
|------|------|
| **Problem** | localStorage 기반이라 세션 간 데이터 동기화 불완전, 원격 편집 불가, 슬라이드쇼 수동 제어 부재, 외부 문서(HWPX) 수작업 입력 부담 |
| **Solution** | SQLite 영구 저장 + HTTP API + 장치 ID 기반 권한 분리 + 슬라이드쇼 컨트롤바/단축키 + HWPX 자동 분할 임포트 |
| **Function UX Effect** | 원격 PC에서 슬라이드 미리 준비, 현장 장치는 출력 전담, PowerPoint 동일 조작감, 한글 문서 끌어오면 자동 슬라이드화 |
| **Core Value** | 관공서/기관의 실제 운영 환경(다중 작업자 + 한글 문서 + 원격 준비)에 맞춘 배포 가능한 사이니지 솔루션 |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | v1.0은 단일 PC 데모 수준. 운영 환경(관공서/기관)에서는 ① 데이터 일관성 ② 원격 준비 ③ 출력 제어 ④ 한글 문서 입력이 필수 |
| **WHO** | 사이니지 운영자(현장 장치 + 사무실 원격 PC), 관공서/기관 콘텐츠 제작자 (.hwpx 사용) |
| **RISK** | rhwp 라이브러리 Node 연동 방식 미확정, SQLite-Electron-원격 동시성 충돌, 장치 ID 위변조 |
| **SUCCESS** | 원격 PC에서 편집한 슬라이드가 현장 장치에 즉시 반영, 사이니지 출력은 현장 장치에서만 가능, .hwpx 한 번에 임포트 후 슬라이드 자동 생성 |
| **SCOPE** | DB 영구 저장, HTTP API, 권한 분리, 슬라이드쇼 네비게이션, HWPX 임포트 — 클라우드 동기화/관리자 인증/3패널 독립 모드는 제외 |

---

## 1. Background & Problem

### 1.1 v1.0 (MVP) 현재 상태

- ✅ 4종 슬라이드 템플릿 (text/image/video/webpage)
- ✅ TipTap WYSIWYG 에디터 (5760×1080 캔버스, 폰트 크기 10단계)
- ✅ Multi-Screen API 기반 확장 모니터 자동 감지
- ✅ localStorage 기반 슬라이드 저장 + heartbeat 라이브 상태
- ✅ 자동 슬라이드쇼 (duration 타이머 + 영상 onEnded 자동 전환)
- ✅ 3-모니터 가이드라인 (편집기·미리보기), 사이니지 출력에서는 제거

### 1.2 v1.1에서 해결해야 할 문제

1. **데이터 일관성 부재**
   - localStorage는 origin 단위로 격리 → 다른 브라우저/PC에서 같은 슬라이드 못 봄
   - heartbeat 동기화 방식이 한 PC 안에서만 동작
2. **원격 편집 불가**
   - 사무실 PC에서 미리 슬라이드를 만들어 둘 수 없음
   - 매번 현장 장치에서 작업해야 함
3. **출력 환경 검증 없음**
   - 서라운드 미설정 PC에서 /signage 열면 화면 깨짐
   - 누구나 출력 시도 가능 → 운영 혼란
4. **슬라이드쇼 수동 조작 부재**
   - duration만으로 진행 → 일시정지/이전 슬라이드/처음으로 이동 불가
   - 발표 중 키보드 컨트롤 (PowerPoint 사용자 익숙) 없음
5. **외부 문서 수작업**
   - 관공서·기관에서 만든 .hwpx 문서를 일일이 복사·붙여넣기
   - 줄 수에 따라 슬라이드 수동 분할

---

## 2. Requirements

### 2.1 Functional Requirements

#### FR-01: SQLite 영구 저장소
| ID | 요구사항 | 우선순위 |
|----|---------|---------|
| FR-01-1 | better-sqlite3 기반 로컬 SQLite DB (slides, settings, devices, app_meta 테이블) | P0 |
| FR-01-2 | DB 파일은 `app.getPath('userData')/signage.db` 위치에 저장 | P0 |
| FR-01-3 | 배포 시 시드 DB(`/data/signage.seed.db`) 포함, 첫 실행 시 userData로 복사 | P0 |
| FR-01-4 | v1.0 localStorage 슬라이드 자동 마이그레이션 후 키 정리 | P0 |
| FR-01-5 | 마이그레이션 실패 시 백업 (.json 덤프) 후 사용자 알림 | P1 |

#### FR-02: HTTP API 서버 (세션 일관성)
| ID | 요구사항 | 우선순위 |
|----|---------|---------|
| FR-02-1 | Electron 메인 프로세스에서 Express(또는 fastify) 로컬 HTTP 서버 기동 (기본 포트 7321) | P0 |
| FR-02-2 | REST API: `GET/POST/PUT/DELETE /api/slides`, `/api/slides/:id`, `/api/settings`, `/api/devices/me` | P0 |
| FR-02-3 | 모든 클라이언트 세션은 API를 통해서만 데이터 접근 (localStorage 의존 제거) | P0 |
| FR-02-4 | 변경 알림: SSE(`/api/events`) 또는 WebSocket으로 슬라이드 변경 브로드캐스트 | P0 |
| FR-02-5 | 모든 세션이 변경 이벤트 수신 시 자동 갱신 (편집기·미리보기·사이니지) | P0 |
| FR-02-6 | 정적 페이지(Next.js) 도 동일 서버에서 호스팅하여 LAN 내 다른 PC에서 접속 가능 | P0 |

#### FR-03: 권한 분리 (장치 ID 기반)
| ID | 요구사항 | 우선순위 |
|----|---------|---------|
| FR-03-1 | 첫 실행 시 고유 device-id 생성하여 DB(devices 테이블)에 저장 | P0 |
| FR-03-2 | "이 장치를 사이니지 출력 장치로 등록" 토글 (관리자 1회 설정) | P0 |
| FR-03-3 | `/signage` 라우트 접속 시 해당 장치가 등록 장치인지 검증 (cookie 또는 헤더로 device-id 전달) | P0 |
| FR-03-4 | 등록 장치 외에는 `/signage` 접속 시 차단 화면 ("이 장치는 사이니지 출력 권한이 없습니다") | P0 |
| FR-03-5 | 편집(`/`), API 조회/수정은 모든 클라이언트 허용 | P0 |
| FR-03-6 | 다중 클라이언트 동시 편집 시 충돌 처리 (마지막 쓰기 우선 + 변경 이벤트로 자동 새로고침) | P1 |

#### FR-04: 슬라이드쇼 네비게이션 강화
| ID | 요구사항 | 우선순위 |
|----|---------|---------|
| FR-04-1 | 사이니지 미리보기 하단에 컨트롤바 추가 (재생/일시정지, 이전, 다음, 처음, 맨뒤, 진행 표시 N/M) | P0 |
| FR-04-2 | 컨트롤바에 전환 시간 슬라이더 (1~60초, 현재 슬라이드의 duration 즉시 변경) | P0 |
| FR-04-3 | 사이니지 출력 윈도우도 동일 명령 수신 (API 또는 SSE 통해 제어) | P0 |
| FR-04-4 | PowerPoint 호환 키보드 단축키 | P0 |
| FR-04-5 | 일시정지 상태에서 수동 이동 가능, 자동 슬라이드쇼는 멈춰 있음 | P0 |

**키 매핑 (PowerPoint 기준)**:
| 동작 | 키 |
|------|-----|
| 다음 슬라이드 | `Space`, `→`, `↓`, `Enter`, `PageDown`, `N` |
| 이전 슬라이드 | `Backspace`, `←`, `↑`, `PageUp`, `P` |
| 처음 슬라이드 | `Home` |
| 마지막 슬라이드 | `End` |
| 재생/일시정지 | `S` (PowerPoint와 동일) |
| 종료 (출력 윈도우) | `Esc` |

#### FR-05: HWPX 문서 불러오기
| ID | 요구사항 | 우선순위 |
|----|---------|---------|
| FR-05-1 | 슬라이드 목록 상단 "+추가" 옆에 "불러오기" 버튼 추가 | P0 |
| FR-05-2 | 파일 선택 다이얼로그(.hwpx) → 별도 모달 윈도우 오픈 | P0 |
| FR-05-3 | rhwp 라이브러리(또는 동등 .hwpx 파서) 통해 텍스트 + 폰트/스타일 정보 추출 | P0 |
| FR-05-4 | 줄 수 N(기본 5) 단위로 슬라이드 자동 분할 미리보기 | P0 |
| FR-05-5 | 줄 수 조정 (3/4/5/6/7/8 등) 시 미리보기 즉시 갱신 | P0 |
| FR-05-6 | 폰트 크기/굵기/정렬 등 원본 스타일 일부 반영 (TipTap HTML로 변환) | P1 |
| FR-05-7 | "불러오기" 확정 시 분할된 슬라이드들이 현재 슬라이드 목록 끝에 일괄 추가 | P0 |
| FR-05-8 | 빈 줄·이미지 처리 정책 명시 (이미지는 v1.1 텍스트만, v1.2에서 이미지 추출) | P1 |

### 2.2 Non-Functional Requirements

| ID | 요구사항 | 기준 |
|----|---------|------|
| NFR-01 | API 응답 시간 (LAN) | < 200ms |
| NFR-02 | 변경 이벤트 → UI 반영 지연 | < 1초 |
| NFR-03 | DB 동시 접근 (편집 + 출력 + 원격 1대) | 충돌 0건 |
| NFR-04 | 장치 ID 위변조 방지 | 첫 생성 후 변경 불가 (DB readonly + crypto sign) |
| NFR-05 | HWPX 50페이지 파싱 시간 | < 5초 |
| NFR-06 | 키보드 단축키 응답 | < 50ms |
| NFR-07 | 마이그레이션 v1.0 데이터 보존율 | 100% |

---

## 3. Success Criteria

| # | 기준 | 측정 방법 |
|---|------|----------|
| SC-1 | SQLite DB로 슬라이드 저장/불러오기 동작 | 앱 재시작 후 슬라이드 유지, DB 파일 존재 확인 |
| SC-2 | 원격 PC에서 편집 → 현장 장치 사이니지 자동 갱신 | 다른 PC 브라우저로 접속하여 편집 후 5초 내 출력 반영 |
| SC-3 | 미등록 장치에서 /signage 접속 차단 | 차단 메시지 표시, 출력 윈도우 미오픈 |
| SC-4 | 모든 PowerPoint 호환 키 동작 + 일시정지/재시작 | 각 키 입력 시 의도 동작, 자동 슬라이드쇼 멈춤·재개 |
| SC-5 | .hwpx 임포트 → N줄 분할 미리보기 → 슬라이드 추가 성공 | 샘플 .hwpx (5페이지 분량) 임포트 후 슬라이드 생성 확인 |
| SC-6 | v1.0 localStorage 슬라이드 자동 마이그레이션 무손실 | 마이그레이션 전·후 슬라이드 개수/내용 동일 |
| SC-7 | TypeScript strict 통과, any 0개 | tsc --noEmit 에러 0 |

---

## 4. Scope

### 4.1 In Scope (v1.1)

- SQLite 영구 저장 + 시드 DB 배포 + 마이그레이션
- 로컬 HTTP API 서버 (Express/fastify) + SSE 변경 알림
- 장치 ID 기반 권한 분리 (출력 장치 등록·검증)
- 슬라이드쇼 컨트롤바 + PowerPoint 호환 키보드 단축키
- HWPX 파일 임포트 + 줄 수 분할 미리보기 모달

### 4.2 Out of Scope → Phase 3 이동 (v1.0 계획에서 미구현 항목)

- 전환 애니메이션 다양화 (slide, none)
- 미사용 미디어 정리
- 드래그&드롭 파일 업로드
- 디스플레이 수동 선택 UI

### 4.3 Out of Scope (v1.1 이후 별도)

- 사용자 인증/권한 그룹 (관리자/편집자/뷰어)
- 클라우드 동기화
- 3패널 독립 모드
- 요일/시간 스케줄링
- HWPX 이미지 추출
- 원격 제어 웹 대시보드 (전용)

---

## 5. Technical Approach

### 5.1 데이터 모델 변경

**SQLite 스키마 (요약)**

```sql
CREATE TABLE slides (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,                  -- text/image/video/webpage
  title TEXT,
  content TEXT,                         -- HTML or URL
  background_color TEXT,
  duration INTEGER NOT NULL,
  media_path TEXT,
  media_options TEXT,                   -- JSON
  position INTEGER NOT NULL,            -- 정렬 순서
  updated_at INTEGER NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL                   -- JSON
);

CREATE TABLE devices (
  id TEXT PRIMARY KEY,                  -- device-id (uuid v4)
  name TEXT,
  is_signage_output INTEGER DEFAULT 0,  -- 출력 장치 등록 여부
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER
);

CREATE TABLE app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL                   -- schema_version 등
);
```

### 5.2 아키텍처 변경 개요

```
┌────────────────────────────────────────────────────────────┐
│                  Electron Main Process                      │
│  ┌─────────────────┐ ┌──────────────┐ ┌────────────────┐  │
│  │ HTTP Server     │ │ SQLite (B-S) │ │ Device Registry│  │
│  │ (Express)       │ │ better-sqlite│ │ (device.id)    │  │
│  │ + SSE /events   │ │              │ │                │  │
│  └────────┬────────┘ └───────┬──────┘ └────────┬───────┘  │
│           │                  │                 │            │
│           └────────┬─────────┴─────────────────┘            │
│                    ▼                                         │
│           ┌──────────────────┐                              │
│           │ API Layer        │                              │
│           │ /api/slides      │                              │
│           │ /api/settings    │                              │
│           │ /api/devices/me  │                              │
│           │ /api/import/hwpx │                              │
│           │ /api/control     │ ← 슬라이드쇼 명령             │
│           │ /api/events SSE  │                              │
│           └──────────────────┘                              │
└──────┬──────────────────────────┬──────────────────┬───────┘
       │                          │                  │
       ▼                          ▼                  ▼
┌─────────────┐           ┌──────────────┐    ┌─────────────┐
│ 편집 윈도우  │           │ 사이니지     │    │ 원격 PC      │
│ (Electron   │           │ (BrowserWin │    │ (LAN 브라우저│
│  내 Next.js)│           │  /signage)   │    │  /)          │
│ - 편집 ✓    │           │ - 출력 only  │    │ - 편집 ✓    │
│ - 출력 X    │           │ - 키보드제어 │    │ - 출력 X    │
└─────────────┘           └──────────────┘    └─────────────┘
```

### 5.3 핵심 모듈 구성

| 모듈 | 신규 파일 | 수정 파일 | 설명 |
|------|----------|----------|------|
| **M1: DB 레이어** | `electron/db/schema.sql`, `electron/db/database.ts`, `electron/db/migrations.ts`, `data/signage.seed.db` | `electron/main.ts` | SQLite 초기화, 마이그레이션, 시드 DB 복사 |
| **M2: HTTP API** | `electron/server/index.ts`, `electron/server/routes/slides.ts`, `electron/server/routes/settings.ts`, `electron/server/routes/devices.ts`, `electron/server/routes/control.ts`, `electron/server/sse.ts` | `electron/main.ts` | Express 서버 + SSE + Next.js 정적 호스팅 |
| **M3: 권한 분리** | `electron/auth/deviceId.ts`, `app/signage/Guard.tsx` | `app/signage/page.tsx`, `electron/server/middleware.ts` | device-id 발급/검증, /signage 가드 |
| **M4: 데이터 클라이언트** | `lib/api/client.ts`, `lib/api/useSlidesQuery.ts`, `lib/api/useSSE.ts` | `store/useSignageStore.ts`, `hooks/useElectronIPC.ts` | API 클라이언트로 localStorage 대체, SSE 구독 |
| **M5: 슬라이드쇼 컨트롤** | `components/PlaybackControls.tsx`, `hooks/usePlaybackKeys.ts`, `lib/playback/playbackStore.ts` | `components/Preview.tsx`, `components/SignageRenderer.tsx` | 컨트롤바 UI + 키보드 훅 + 명령 동기화 |
| **M6: HWPX 임포터** | `electron/hwpx/parser.ts`, `electron/server/routes/import.ts`, `components/import/HwpxImportModal.tsx`, `components/import/HwpxPreviewSlide.tsx`, `lib/hwpx/splitByLines.ts` | `components/SlideList.tsx` | rhwp 연동 조사·파싱·분할·미리보기 모달 |

### 5.4 IPC/HTTP 채널 추가

| 종류 | 경로/채널 | 방향 | 용도 |
|------|----------|------|------|
| HTTP | `GET /api/slides` | Client → Server | 전체 슬라이드 조회 |
| HTTP | `POST /api/slides` | Client → Server | 슬라이드 추가 |
| HTTP | `PUT /api/slides/:id` | Client → Server | 슬라이드 수정 |
| HTTP | `DELETE /api/slides/:id` | Client → Server | 슬라이드 삭제 |
| HTTP | `POST /api/slides/reorder` | Client → Server | 순서 변경 |
| HTTP | `GET /api/settings`, `PUT /api/settings/:key` | Client → Server | 앱 설정 |
| HTTP | `GET /api/devices/me` | Client → Server | 현재 장치 정보·권한 |
| HTTP | `POST /api/devices/me/register-signage` | Local only | 이 장치를 출력 장치로 등록 |
| HTTP | `POST /api/control` | Client → Server | 재생/일시정지/이전/다음/처음/맨뒤 |
| HTTP | `POST /api/import/hwpx` | Client → Server | .hwpx 파싱 결과 반환 |
| SSE | `GET /api/events` | Server → Client | slide.changed, control.changed, settings.changed |
| IPC | `register-signage-device` | Renderer → Main | 출력 장치 등록 (Electron 내부에서만 호출) |
| IPC | `select-hwpx-file` | Renderer → Main | .hwpx 파일 선택 다이얼로그 |

### 5.5 v1.0 → v1.1 마이그레이션 전략

```
앱 시작
  ├─ DB 파일 존재 여부 확인 (userData/signage.db)
  │   ├─ 없음: 시드 DB 복사 → schema_version 기록
  │   └─ 있음: schema_version 비교 → 필요 시 SQL 마이그레이션
  ├─ localStorage('signage-slides') 존재 여부 확인
  │   ├─ 있음 + DB가 비어 있음:
  │   │   ├─ JSON 백업 파일 생성 (userData/backup-{date}.json)
  │   │   ├─ slides 테이블에 일괄 INSERT
  │   │   └─ localStorage 키 제거
  │   └─ 없음 또는 이미 마이그레이션 완료: skip
  └─ HTTP 서버 기동 → BrowserWindow 로드
```

---

## 6. Risk Analysis

| 리스크 | 영향도 | 발생 확률 | 대응 방안 |
|--------|--------|----------|----------|
| rhwp Node 바인딩 미존재 | 높음 | 중간 | Design 단계에서 (a) WASM (b) CLI 자식 프로세스 (c) 자체 XML 파서 3안 비교 후 결정 |
| better-sqlite3 Electron 빌드 이슈 | 중간 | 중간 | electron-rebuild 빌드 스크립트, 미리 빌드 바이너리(prebuild) 활용 |
| SSE 다중 클라이언트 연결 누수 | 중간 | 낮음 | heartbeat ping + 연결 ID 관리, 종료 시 cleanup |
| device-id 위변조 (직접 SQLite 편집) | 낮음 | 낮음 | 운영 보안 범위 밖. v1.1에서는 신뢰 모델 명시(LAN 내부) |
| 다중 클라이언트 동시 편집 충돌 | 중간 | 중간 | 마지막 쓰기 우선 + SSE 자동 새로고침 + 편집 중 알림 (v1.2에서 OT/CRDT 검토) |
| HWPX 복잡 스타일 손실 | 낮음 | 높음 | v1.1에서는 텍스트 + 폰트 크기/굵기/정렬만 보존, 명시적 한계 표기 |
| 키보드 단축키 충돌 (TipTap 에디터 내) | 중간 | 중간 | Preview 영역 포커스 시에만 활성화, 입력 요소 활성 시 비활성 |

---

## 7. Implementation Priority

### Phase 1 (P0 — v1.1 필수)
1. **M1**: DB 레이어 + 시드 DB + 마이그레이션
2. **M2**: HTTP API 서버 + SSE
3. **M4**: 데이터 클라이언트 (Zustand → API)
4. **M3**: 장치 ID 기반 권한 분리
5. **M5**: 슬라이드쇼 컨트롤바 + 키보드 단축키
6. **M6**: HWPX 임포터 (파서 + 미리보기 모달)

### Phase 2 (P1 — v1.1 후속 개선)
- HWPX 폰트/정렬 정보 반영
- 마이그레이션 실패 시 백업·알림
- 다중 클라이언트 동시 편집 충돌 알림 UX

### Phase 3 (v1.0 미구현 + v1.1 이후 진행) — **★ 본 계획 변경의 핵심 이동 항목**
- 전환 애니메이션 다양화 (slide, none)
- 미사용 미디어 정리
- 드래그&드롭 파일 업로드
- 디스플레이 수동 선택 UI

### 향후 (Future)
- 사용자 인증/권한 그룹
- 클라우드 동기화
- 3패널 독립 모드
- 시간/요일 스케줄링
- HWPX 이미지 추출
- 전용 원격 관리 대시보드

---

## 8. Session Plan (Recommended)

| 세션 | 모듈 | 작업 내용 | 예상 규모 |
|------|------|----------|----------|
| Session 1 | M1 | SQLite 스키마·마이그레이션·시드 DB | ~400 lines |
| Session 2 | M2 | HTTP API + SSE + Next.js 정적 호스팅 | ~500 lines |
| Session 3 | M4 + M3 | 데이터 클라이언트 전환 + 장치 ID 권한 | ~450 lines |
| Session 4 | M5 | 컨트롤바 + 키보드 단축키 + 명령 동기화 | ~300 lines |
| Session 5 | M6 | HWPX 파서 조사·구현 + 임포트 모달 | ~500 lines |
| Session 6 | 통합 테스트 | 다중 클라이언트·마이그레이션·E2E | ~150 lines |

---

## 9. Dependencies

| 의존성 | 유형 | 버전 후보 | 용도 |
|--------|------|----------|------|
| `better-sqlite3` | 신규 npm | ^11.x | SQLite 동기 API (Electron 메인) |
| `express` (또는 `fastify`) | 신규 npm | ^4.x / ^4.x | 로컬 HTTP API |
| `cors` | 신규 npm | ^2.x | LAN 원격 클라이언트 CORS |
| `nanoid` 또는 `uuid` | 신규 npm | ^5.x / ^9.x | device-id 발급 |
| `electron-rebuild` (devDep) | 신규 npm | ^3.x | 네이티브 모듈 Electron 재빌드 |
| `jszip` + `fast-xml-parser` (대안) | 조건부 | latest | rhwp 미사용 시 .hwpx 직접 파싱 |
| `rhwp` (Rust) | 외부 | 조사중 | .hwpx 파싱 (WASM/CLI 연동 방식 Design 단계 결정) |

> rhwp 연동 방식은 Design 단계에서 (a) WASM, (b) Rust CLI + child_process, (c) JSZip 직접 파싱 3안을 비교하여 결정.

---

## 10. Glossary

| 용어 | 정의 |
|------|------|
| 시드 DB | 첫 설치 시 사용되는 기본 SQLite 파일 (배포 패키지에 동봉) |
| 출력 장치(Signage Device) | 서라운드 환경이 구성되어 사이니지 출력이 가능한 등록된 장치 |
| 원격 클라이언트 | 출력 장치가 아닌 LAN 내 다른 PC (편집 전용) |
| SSE | Server-Sent Events. HTTP 기반 단방향 서버→클라이언트 푸시 |
| device-id | 장치 첫 실행 시 생성되는 고유 식별자 (UUID v4) |
| .hwpx | 한컴오피스 한글 OWPML 표준 형식 (ZIP+XML 구조) |
| rhwp | Rust 기반 한글 .hwpx 뷰어/파서 라이브러리 |
| LWW | Last Write Wins. 동시 편집 시 마지막 저장이 우선 |

---

## 11. v1.0 → v1.1 변경 요약

| 영역 | v1.0 (MVP) | v1.1 |
|------|-----------|------|
| 데이터 저장 | localStorage | SQLite (better-sqlite3) |
| 데이터 동기화 | heartbeat (단일 PC) | HTTP API + SSE (LAN 다중 PC) |
| 출력 권한 | 누구나 /signage 접속 | 등록된 출력 장치만 가능 |
| 슬라이드쇼 제어 | duration 자동만 | 컨트롤바 + PowerPoint 단축키 |
| 외부 문서 입력 | 없음 | .hwpx 파일 임포트 + 자동 분할 |
| 배포 형태 | 단일 PC 데모 | LAN 운영 배포 (현장 + 원격) |
