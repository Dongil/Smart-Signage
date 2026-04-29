# Design: Smart Signage v1.1 — Pragmatic Balance Architecture

> Created: 2026-04-27
> Feature: smart-signage-v1.1
> Architecture: Option C — Pragmatic Balance (Zustand + Server-Authoritative)
> Plan: docs/01-plan/features/smart-signage-v1.1.plan.md
> Status: **Completed**, evolved into v1.2 (see notes below)
>
> **v1.2 Evolution Notes**:
> - §2.M2 — `signageGuardMiddleware` 폐기 (페이지 레벨 검증으로 대체, `app/signage/page.tsx`)
> - §2.M3 — device-id 등록 UI 제거. 권한은 보조 모니터 유무로 자동 결정
> - §2.M5 — Toolbar의 "재생/일시정지" 버튼 제거 (PlaybackControls 컨트롤바로 충분)
> - §5 — Signage BrowserWindow가 hidden 시작, IPC `signage-show`/`signage-hide`로 토글. browser popup(window.open) 폐기
> - 신규: `electron/logger.ts`, `lib/logger.ts` (electron-log + safeLog fallback)
> - 신규: production에서 Express가 Next.js export(`/out`) 정적 호스팅
> - 자세한 내역: `docs/01-plan/features/smart-signage-v1.2.plan.md` + `docs/04-report/smart-signage-v1.2.report.md`

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

## 1. Overview

### 1.1 Architectural Decision

**Selected: Option C — Pragmatic Balance**

핵심 원칙:
1. **서버(SQLite)가 단일 진실 소스 (Single Source of Truth)** — 모든 PC가 같은 슬라이드를 본다
2. **Zustand는 클라이언트 캐시 미러** — 기존 컴포넌트 코드 보존
3. **SSE(Server-Sent Events) 푸시로 실시간 동기화** — 폴링 제거
4. **백엔드는 Service + Repository 계층** — HWPX/권한/제어 로직 격리

### 1.2 High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                  Electron Main Process                           │
│ ┌────────────────────────────────────────────────────────────┐   │
│ │  HTTP Server (Express, port 7321)                          │   │
│ │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │   │
│ │  │ /api/slides  │ │ /api/control │ │ /api/import  │ ...    │   │
│ │  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘        │   │
│ │         ▼                ▼                ▼                │   │
│ │  ┌──────────────────────────────────────────────────┐      │   │
│ │  │ Service Layer                                    │      │   │
│ │  │ SlideService │ DeviceService │ ImportService │   │      │   │
│ │  │ ControlService │ EventBus (SSE)               │      │   │
│ │  └────────┬─────────────────────────────────────────┘      │   │
│ │           ▼                                                │   │
│ │  ┌──────────────────────────────────────────────────┐      │   │
│ │  │ Repository (better-sqlite3)                      │      │   │
│ │  │ slides │ settings │ devices │ app_meta           │      │   │
│ │  └──────────────────────────────────────────────────┘      │   │
│ │           ▼                                                │   │
│ │  ┌──────────────────────────────────────────────────┐      │   │
│ │  │ SQLite (userData/signage.db)                     │      │   │
│ │  └──────────────────────────────────────────────────┘      │   │
│ │                                                            │   │
│ │  Static: Next.js export (호스팅) — LAN 원격 접속 진입점     │   │
│ └────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
        │ HTTP (REST)        │ SSE (events)
        ▼                    ▼
┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ 편집 윈도우     │  │ 사이니지 윈도우  │  │ 원격 PC          │
│ (Electron)     │  │ (Electron)       │  │ (LAN 브라우저)   │
│                │  │ /signage         │  │                  │
│ ApiClient      │  │ ApiClient        │  │ ApiClient        │
│ + Zustand      │  │ + Zustand        │  │ + Zustand        │
│ + SSE Listener │  │ + SSE Listener   │  │ + SSE Listener   │
│ + 키보드 훅    │  │ + 키보드 훅      │  │                  │
│ - 출력 버튼 ✓ │  │ - 편집 X         │  │ - 출력 버튼 X    │
│ - 편집 ✓      │  │ - 출력 ✓        │  │ - 편집 ✓        │
└─────────────────┘  └──────────────────┘  └──────────────────┘
```

### 1.3 Data Flow

**편집 흐름 (저장 시)**:
```
UI(편집) → Zustand 옵티미스틱 업데이트 → ApiClient.put('/api/slides/:id')
        → Express → SlideService → Repository → SQLite
        → EventBus.emit('slide.changed', payload)
        → SSE 모든 connected clients 푸시
        → 다른 클라이언트의 SSE listener → store.hydrate(payload)
        → 모든 화면 자동 갱신
```

**제어 흐름 (재생/일시정지/이동)**:
```
편집 윈도우 키 입력 또는 컨트롤바 클릭
  → ApiClient.post('/api/control', { action: 'next' })
  → ControlService 상태 갱신 + EventBus.emit('control.changed')
  → 사이니지 윈도우 SSE 수신 → 로컬 playback store 갱신 → 슬라이드 전환
```

---

## 2. Module Breakdown

### Module 1: DB Layer (`electron/db/`)

| 파일 | 책임 |
|------|------|
| `schema.sql` | 테이블 정의 (slides, settings, devices, app_meta) |
| `database.ts` | better-sqlite3 인스턴스 싱글턴, prepared statement 캐시 |
| `migrations.ts` | schema_version 기반 단계별 마이그레이션 (v0 → v1) + localStorage 임포트 |
| `seed.ts` | 첫 실행 시 빈 DB 초기화 (시드 DB는 빌드 시 `data/signage.seed.db` 생성) |
| `data/signage.seed.db` | 배포에 동봉되는 빈 시드 DB (electron-builder `extraResources`) |

**핵심 결정**:
- `better-sqlite3` 동기 API → 단순한 컨트롤 흐름, Electron 메인 프로세스 적합
- WAL 모드 활성화 (`PRAGMA journal_mode=WAL`) → 다중 reader, 1 writer 동시성
- `PRAGMA foreign_keys=ON`

### Module 2: HTTP API Server (`electron/server/`)

| 파일 | 책임 |
|------|------|
| `index.ts` | Express 앱 빌더, 포트 바인딩, 미들웨어 체인 |
| `middleware/cors.ts` | LAN 내부 CORS 허용 (`http://192.168.*`, `http://10.*`, localhost) |
| `middleware/deviceContext.ts` | 요청마다 `req.device = { id, isSignageOutput }` 부착 |
| `middleware/signageGuard.ts` | `/signage` HTML 라우트에서 출력 장치 검증 (302 → `/signage/blocked`). API 라우트는 Plan FR-03-5에 따라 모든 클라이언트 허용이므로 가드하지 않는다 |
| `routes/slides.ts` | CRUD + reorder |
| `routes/settings.ts` | key-value 설정 |
| `routes/devices.ts` | `/me`, `/me/register-signage`, `/list` |
| `routes/control.ts` | 재생/일시정지/이전/다음/처음/맨뒤/duration 변경 |
| `routes/import.ts` | `.hwpx` 업로드 → 파싱 결과 반환 |
| `routes/events.ts` | SSE 핸들러 |
| `services/slideService.ts` | 비즈니스 로직 + EventBus emit |
| `services/deviceService.ts` | device-id 발급/검증 |
| `services/controlService.ts` | 슬라이드쇼 상태 머신 (in-memory, 출력 장치 기준) |
| `services/importService.ts` | HWPX 파싱 (단락=줄 단위 ParsedBlock 반환). N-슬라이드 분할은 클라이언트(`lib/hwpx/splitByLines.ts`)에서 수행 |
| `services/eventBus.ts` | EventEmitter, 채널: slide / control / settings / device |
| `sse/manager.ts` | 클라이언트 연결 풀, heartbeat (15s ping), graceful close |

**API 설계 (요약)**:

| Method | Path | 용도 |
|--------|------|------|
| GET | `/api/slides` | 전체 조회 (정렬: position) |
| POST | `/api/slides` | 신규 추가 (position = MAX+1) |
| PUT | `/api/slides/:id` | 수정 (LWW: updated_at) |
| DELETE | `/api/slides/:id` | 삭제 |
| POST | `/api/slides/reorder` | `{ orderedIds: string[] }` |
| GET | `/api/settings` | 전체 |
| PUT | `/api/settings/:key` | 단일 |
| GET | `/api/devices/me` | `{ id, isSignageOutput, name }` |
| POST | `/api/devices/me/register-signage` | 이 장치를 출력 장치로 등록 (Electron only) |
| GET | `/api/control` | 현재 재생 상태 |
| POST | `/api/control` | `{ action: 'play'|'pause'|'next'|'prev'|'first'|'last'|'goto', payload? }` |
| POST | `/api/import/hwpx` | raw `application/octet-stream` (file body) → `{ blocks: ParsedBlock[], totalLines }` — multipart는 v1.2에서 검토 |
| GET | `/api/events` | SSE 스트림 |

**SSE 이벤트 스키마**:
```typescript
type ServerEvent =
  | { type: 'slide.changed'; op: 'create'|'update'|'delete'|'reorder'; ids: string[] }
  | { type: 'control.changed'; state: PlaybackState }
  | { type: 'settings.changed'; key: string }
  | { type: 'device.changed'; deviceId: string };
```

### Module 3: 권한 분리

> Note (v1.1 implementation): 별도 `electron/auth/` 폴더 대신, auth 관심사를 다음 위치에 응집한다 — host device-id 발급은 `electron/db/deviceBootstrap.ts`(DB와 함께 부팅), launch-time secret 관리는 `electron/server/security.ts`. 기능적으로는 동치이며, DB 부팅과 device-id 등록이 같은 시점에 일어나야 하므로 같은 모듈에 두는 편이 응집도가 높다.

| 파일 | 책임 |
|------|------|
| `electron/db/deviceBootstrap.ts` | 첫 실행 시 UUID v4 생성(`crypto.randomUUID`) → DB devices 테이블 + `userData/device-id` 텍스트 파일에 영구 저장 |
| `electron/server/security.ts` | Launch-time secret 발급/조회. `register-signage` 호출 시 `X-Signage-Internal` 헤더 비교 |
| `electron/server/routes/devices.ts` | `POST /me/register-signage` (secret 검증 후 `is_signage_output=1`) |
| `electron/server/middleware/signageGuard.ts` | `/signage` HTML 라우트 진입 시 device-id 쿠키의 `isSignageOutput` 검증 → 미등록 시 `/signage/blocked` 302. API 라우트는 가드하지 않음 (Plan FR-03-5) |
| `components/SignageGuard.tsx` | 클라이언트 측 추가 검증 (`/api/devices/me` 조회 후 isSignageOutput=false면 차단 화면) |
| `app/signage/blocked/page.tsx` | "이 장치는 사이니지 출력 권한이 없습니다" 독립 차단 페이지 |

**device-id 저장 전략**:
- Electron 본체: 메인 프로세스에서 `app.getPath('userData')/device-id` 텍스트 파일 + DB 동시 저장
- 브라우저(원격): HTTP 쿠키 `signage-device-id` (`HttpOnly`, `SameSite=Lax`) → 서버가 첫 요청 시 발급
- 출력 권한은 device-id 단위로 DB의 `is_signage_output=1`인 경우만 허용

### Module 4: Data Client (`lib/api/` + `store/`)

| 파일 | 책임 |
|------|------|
| `lib/api/client.ts` | fetch 래퍼 (base URL 자동 검출, 에러 처리, JSON) |
| `lib/api/slides.ts` | slides CRUD 호출 |
| `lib/api/control.ts` | control 호출 |
| `lib/api/devices.ts` | devices/me |
| `lib/api/import.ts` | hwpx 업로드 |
| `lib/api/sse.ts` | EventSource 구독 + 자동 재연결 (백오프) |
| `store/useSignageStore.ts` (수정) | localStorage 제거. 액션이 ApiClient를 호출하고, SSE 수신 시 hydrate. 옵티미스틱 업데이트 + 실패 시 롤백 |
| `store/usePlaybackStore.ts` (신규) | 클라이언트 측 재생 상태 캐시 (서버 ControlService 미러) |
| `store/useDeviceStore.ts` (신규) | `{ id, isSignageOutput }` 캐시 |

**Zustand → API 액션 패턴 예시**:
```typescript
// store/useSignageStore.ts (개념)
addSlide: async (slide) => {
  const tempId = `temp-${Date.now()}`;
  set((s) => ({ slides: [...s.slides, { ...slide, id: tempId }] }));
  try {
    const created = await api.slides.create(slide);
    set((s) => ({
      slides: s.slides.map((sl) => (sl.id === tempId ? created : sl))
    }));
  } catch (e) {
    set((s) => ({ slides: s.slides.filter((sl) => sl.id !== tempId) }));
    throw e;
  }
},
hydrateFromServer: async () => {
  const slides = await api.slides.list();
  set({ slides });
}
```

### Module 5: Playback Controls (`components/PlaybackControls.tsx` + `hooks/`)

| 파일 | 책임 |
|------|------|
| `components/PlaybackControls.tsx` | 미리보기 하단 컨트롤바 (재생/일시정지/이전/다음/처음/맨뒤, duration 슬라이더, N/M 표시) |
| `hooks/usePlaybackKeys.ts` | PowerPoint 호환 키 매핑 + 입력 요소 활성 시 비활성화 |
| ~~`hooks/usePlaybackSync.ts`~~ | (제거됨) `components/SseBridge.tsx`가 SSE 단일 fan-out으로 모든 store(slide/control/device)에 분배 — 별도 hook 불필요 |
| `components/SseBridge.tsx` | 단일 SSE 구독 → `useSignageStore.applySseHydrate` / `usePlaybackStore.applyServerState` / `useDeviceStore.applyEvent` fan-out |
| `components/Preview.tsx` (수정) | 컨트롤바 포함, heartbeat 폴링 제거 (SSE 기반) |
| `components/SignageRenderer.tsx` (수정) | 자동 타이머 → ControlService 명령 기반 (단, 출력 장치는 자체 타이머 유지하고 명령 시 override) |

**키 매핑 구현 정책**:
- 키 훅은 `document.activeElement`가 `INPUT`/`TEXTAREA`/`[contenteditable]`이면 무시
- Preview 패널 또는 사이니지 윈도우 포커스 시 활성
- 키 입력 → `api.control.post(action)` → 서버 → SSE → 모든 클라이언트 동기화

### Module 6: HWPX Importer (`electron/hwpx/` + `components/import/`)

| 파일 | 책임 |
|------|------|
| `electron/hwpx/types.ts` | 공유 타입(`ParsedBlock`, `ParsedHwpx`) — 전략과 façade가 공통 사용 |
| `electron/hwpx/parser.ts` | 전략 façade — `.hwpx` 파일 파싱 → `ParsedBlock[]` 반환. 내부적으로 §2.6에서 선택된 전략 호출 |
| `electron/hwpx/strategy/jszipXml.ts` | 선택된 전략 (Option α): JSZip + fast-xml-parser로 OWPML 파싱 |
| ~~`electron/hwpx/lineSplitter.ts`~~ | (제거됨) 단락=논리적 줄 단위 모델 채택. paragraph 1개 = `ParsedBlock` 1개 = 1 line. 폰트/너비 기반 가시-줄 재계산은 v1.1 범위 밖 |
| `electron/server/routes/import.ts` | raw `application/octet-stream` 파일 수신 (50MB 한도, multer 의존성 회피) → ImportService → `{ blocks, totalLines }` |
| `lib/hwpx/splitByLines.ts` | 클라이언트 측: `ParsedBlock[]`을 N블록/슬라이드로 분할하고 TipTap-호환 HTML 생성 |
| `components/import/HwpxImportModal.tsx` | 모달 윈도우 (파일 선택 → 미리보기 → 줄 수 조정 → 확정) |
| `components/import/HwpxPreviewSlide.tsx` | 모달 내 슬라이드 1장 미리보기 (TextSlide 재사용) |
| `components/import/LineCountControl.tsx` | 3/4/5/6/7/8 라디오 |
| `components/SlideList.tsx` (수정) | "+추가" 옆 "불러오기" 버튼 추가 |

**ParsedBlock 데이터 모델**:
```typescript
interface ParsedBlock {
  text: string;
  fontSize?: number;     // px
  bold?: boolean;
  italic?: boolean;
  align?: 'left'|'center'|'right';
  // v1.2: imageRef, color
}
```

#### 2.6 HWPX 파싱 전략 — Design 단계 결정

**Option α — 자체 XML 파싱 (JSZip + fast-xml-parser)** ⭐ **선택**
- `.hwpx`는 ZIP 내부에 `Contents/section0.xml` 등 OWPML XML 파일
- `<hp:t>` (텍스트), `<hp:run>`(스타일), `<hp:p>` (단락) 위주만 추출
- 외부 의존성 없이 Node로 동작 → Electron 빌드 단순
- 복잡한 표/그림은 v1.1 범위 밖 (텍스트만)

**Option β — rhwp Rust CLI + child_process**
- rhwp 빌드 후 바이너리를 동봉 → `execFile`로 호출
- 장점: 정확도 높음 / 단점: 플랫폼별 바이너리 동봉, 빌드 복잡

**Option γ — rhwp WASM**
- WASM으로 빌드하여 Node에서 실행
- rhwp가 WASM 빌드 공식 지원해야 가능. 현재 미확정

**결정 근거**:
- v1.1은 운영 보완이 핵심이고 .hwpx 텍스트 추출이면 충분
- α 안의 외부 의존성/빌드 단순함이 결정적
- v1.2 이상에서 표/이미지 필요 시 β로 격상 검토 (Strategy 패턴으로 교체 가능)

---

## 3. Data Model

### 3.1 SQLite Schema (정식)

```sql
-- app_meta: 마이그레이션·메타
CREATE TABLE app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- 초기값: schema_version=1, app_version=1.1.0, created_at=epoch

-- devices: 장치 등록
CREATE TABLE devices (
  id TEXT PRIMARY KEY,                  -- UUID v4
  name TEXT NOT NULL DEFAULT '',
  is_signage_output INTEGER NOT NULL DEFAULT 0,  -- 0|1
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX idx_devices_signage ON devices(is_signage_output);

-- slides: 슬라이드
CREATE TABLE slides (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('text','image','video','webpage')),
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  background_color TEXT NOT NULL DEFAULT '#1a1a2e',
  duration INTEGER NOT NULL DEFAULT 5,
  media_path TEXT,
  media_options TEXT,              -- JSON
  position INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_slides_position ON slides(position);

-- settings: key-value
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,             -- JSON
  updated_at INTEGER NOT NULL
);
-- 초기 settings: ui.theme, playback.defaultDuration 등
```

### 3.2 Migration v0 → v1 (localStorage → SQLite)

```typescript
// electron/db/migrations.ts (개념)
export async function migrate(db: Database) {
  const cur = db.prepare('SELECT value FROM app_meta WHERE key=?').get('schema_version');
  if (!cur) {
    db.exec(SCHEMA_SQL);
    db.prepare('INSERT INTO app_meta VALUES (?, ?)').run('schema_version', '1');
  }
  // localStorage 마이그레이션은 클라이언트가 첫 접속 시 호출하는
  // POST /api/admin/migrate-from-localstorage 1회성 엔드포인트로 처리
}
```

### 3.3 Migration v1.0 데이터 가져오기 절차

1. 첫 실행 시 편집 윈도우의 `MigrationGuard` 컴포넌트가
   - `localStorage.getItem('signage-slides')` 존재 + `GET /api/slides` empty → 마이그레이션 후보
2. `POST /api/admin/migrate-from-localstorage` (body: localStorage 페이로드, Electron 전용 라우트)
3. 서버: 백업 파일 `userData/backups/migrate-{timestamp}.json` 기록 후 일괄 INSERT
4. 응답 OK → 클라이언트가 `localStorage.removeItem('signage-slides')`
5. 화면에 "v1.0 슬라이드 N개를 불러왔습니다" 알림

---

## 4. API Specification (상세)

### 4.1 Slides

```
GET /api/slides
  → 200 { slides: Slide[] }

POST /api/slides
  body: { type, title?, content, backgroundColor, duration, mediaPath?, mediaOptions? }
  → 201 { slide: Slide }
  emits: slide.changed { op: 'create', ids: [id] }

PUT /api/slides/:id
  body: Partial<Slide>
  → 200 { slide: Slide }
  emits: slide.changed { op: 'update', ids: [id] }

DELETE /api/slides/:id
  → 204
  emits: slide.changed { op: 'delete', ids: [id] }

POST /api/slides/reorder
  body: { orderedIds: string[] }
  → 200 { slides: Slide[] }
  emits: slide.changed { op: 'reorder', ids: orderedIds }
```

### 4.2 Control

```
GET /api/control
  → 200 { state: PlaybackState }

POST /api/control
  body: { action, payload? }
  actions:
    - play, pause
    - next, prev, first, last
    - goto (payload: { index })
    - setDuration (payload: { duration: number })  // 현재 슬라이드 즉시 적용
  → 200 { state: PlaybackState }
  emits: control.changed { state }
```

```typescript
interface PlaybackState {
  isPlaying: boolean;
  currentIndex: number;
  totalSlides: number;
  duration: number;
  updatedAt: number;
}
```

### 4.3 Devices

```
GET /api/devices/me
  → 200 { id, name, isSignageOutput }
  Set-Cookie: signage-device-id=<id> (없으면 신규 발급)

POST /api/devices/me/register-signage
  → 200 { id, isSignageOutput: true }
  허용: Electron 메인이 발급한 secret 헤더 보유 시에만
       (X-Signage-Internal: <random per launch>)
```

### 4.4 Import

```
POST /api/import/hwpx
  Content-Type: application/octet-stream      ← raw .hwpx bytes (50MB 한도)
  body: <binary file contents>
  → 200 { blocks: ParsedBlock[], totalLines: number }
  → 400 { error: 'empty-body' | 'hwpx-empty-or-invalid' | 'parse-failed' }
  Note: multipart 대신 raw upload — multer 의존성을 회피하기 위한 의도적 결정.
        v1.2에서 외부 cURL 사용성/추가 필드 필요 시 multer로 격상 검토.
```

### 4.5 SSE

```
GET /api/events
  Content-Type: text/event-stream
  
  event: slide.changed
  data: {"op":"update","ids":["s1"]}
  
  event: control.changed
  data: {"state":{...}}
  
  : ping (15s, comment lines)
```

---

## 5. Component Tree (수정 후)

```
app/
  layout.tsx
  page.tsx                       ← 편집 화면 (Toolbar + SlideList + SlideEditor + Preview)
  signage/
    page.tsx                     ← Guard 통과 후 SignageRenderer
    blocked/page.tsx             ← 출력 권한 없음 안내

components/
  Toolbar.tsx                    (수정: 출력 장치 등록 토글, device 표시)
  SlideList.tsx                  (수정: "+추가" + "불러오기" 버튼)
  SlideEditor.tsx
  Preview.tsx                    (수정: heartbeat 제거, SSE 기반 + 컨트롤바 영역)
  PlaybackControls.tsx           ★ 신규
  SignageRenderer.tsx            (수정: ControlService 명령 수신, 자동 타이머는 출력 장치만)
  SseBridge.tsx                  ★ 신규  (단일 SSE → 모든 store fan-out)
  SignageGuard.tsx               ★ 신규  (클라이언트 출력 권한 가드)
  LegacyMigrationGuard.tsx       ★ 신규  (v1.0 localStorage 자동 마이그레이션 트리거)
  
  editors/                       (변경 없음)
  renderers/                     (변경 없음)
  templates/                     (변경 없음)
  
  import/                        ★ 신규
    HwpxImportModal.tsx
    HwpxPreviewSlide.tsx
    LineCountControl.tsx

hooks/
  useElectronIPC.ts              (대부분 비움 — v1.1는 HTTP API로 통신)
  usePlaybackKeys.ts             ★ 신규
  ~~usePlaybackSync.ts~~         (제거: SseBridge가 통합 fan-out 담당)
  useSseSubscribe.ts             ★ 신규

lib/
  api/                           ★ 신규
    client.ts
    slides.ts, control.ts, devices.ts, import.ts
    sse.ts
  hwpx/                          ★ 신규
    splitByLines.ts

store/
  useSignageStore.ts             (수정: localStorage 제거, API 액션)
  usePlaybackStore.ts            ★ 신규
  useDeviceStore.ts              ★ 신규

electron/
  main.ts                        (수정: HTTP 서버 부팅, DB bootstrap)
  preload.ts                     (수정: v1.1 IPC 화이트리스트 — get-server-info, get-internal-secret, migrate-legacy-slides)
  fileManager.ts                 (변경 없음)
  db/                            ★ 신규
    schema.sql, database.ts, migrations.ts, seed.ts, deviceBootstrap.ts (host device-id)
  server/                        ★ 신규
    index.ts, security.ts, events.ts (SSE 타입)
    middleware/{cors,deviceContext,signageGuard}.ts
    routes/{slides,settings,devices,control,import,events,admin}.ts
    services/{slideService,settingsService,deviceService,controlService,importService,eventBus,slideMapper}.ts
    sse/manager.ts
  hwpx/                          ★ 신규
    types.ts, parser.ts (façade), strategy/jszipXml.ts
    (lineSplitter.ts 미생성 — paragraph=block 모델로 대체)

data/
  (signage.seed.db는 v1.1에서 미생성. schema.sql 적용 경로로 첫-실행 초기화 → v1.2에서 build-time 시드 DB 생성 검토)
```

> **Auth 모듈 위치**: 별도 `electron/auth/` 폴더 대신 — host device-id는 `db/deviceBootstrap.ts`(DB와 함께 부팅), launch-time secret은 `server/security.ts`에 응집. 기능 동치 + 응집도 향상.

---

## 6. Sequence Diagrams

### 6.1 원격 PC에서 슬라이드 편집 → 현장 장치 반영

```
[원격 PC]                 [Electron HTTP API]            [현장 장치]
   │ PUT /api/slides/s1      │                              │
   │ body: { content: "..."} │                              │
   │ ─────────────────────▶ │                              │
   │                         │ Repository.update            │
   │                         │ EventBus.emit(slide.changed) │
   │                         │ SSE → 모든 connected         │
   │                         │ ─────────────────────────▶  │
   │ ◀─── 200 OK             │                              │
   │ store.hydrate           │                              │ store.hydrate
   │ UI 갱신                 │                              │ Preview/Signage 갱신
```

### 6.2 출력 장치 등록 (Electron 내부 1회)

```
[Electron Renderer]      [Electron Main]            [HTTP API]
   │ "이 장치를 출력 장치로 │                         │
   │  등록" 버튼 클릭        │                         │
   │ window.electronAPI.    │                         │
   │   registerSignage()    │                         │
   │ ─────────────────────▶│                         │
   │                        │ secret = randomUUID()   │
   │                        │ POST /api/devices/me/   │
   │                        │   register-signage      │
   │                        │ X-Signage-Internal:secret
   │                        │ ──────────────────────▶ │
   │                        │                         │ secret 검증
   │                        │                         │ devices.is_signage_output=1
   │                        │ ◀─── 200 OK              │
   │ ◀── 200 OK              │                         │
   │ Toolbar 상태 갱신       │                         │
```

### 6.3 키보드 단축키로 다음 슬라이드

```
[Preview 영역 포커스]       [HTTP API]              [사이니지 윈도우]
   │ Space 키 입력             │                         │
   │ usePlaybackKeys 훅 동작   │                         │
   │ POST /api/control         │                         │
   │ body:{action:'next'}      │                         │
   │ ──────────────────────▶ │                         │
   │                          │ ControlService.next     │
   │                          │ EventBus.emit            │
   │                          │ SSE control.changed     │
   │                          │ ──────────────────────▶│
   │                          │                         │ playback store 갱신
   │ ◀─── 200 OK              │                         │ 다음 슬라이드 전환
```

### 6.4 HWPX 임포트

```
[편집 UI]                 [HTTP API]             [HWPX Parser]
   │ "불러오기" 클릭         │                       │
   │ <input type=file>      │                       │
   │ POST /api/import/hwpx  │                       │
   │ multipart              │                       │
   │ ───────────────────▶  │                       │
   │                        │ jszip → XML 추출      │
   │                        │ ──────────────────▶  │
   │                        │ ◀── ParsedBlock[]    │
   │ ◀── { blocks }         │                       │
   │ HwpxImportModal:       │                       │
   │  splitByLines(blocks,5)│                       │
   │  미리보기 렌더링        │                       │
   │ 사용자가 6줄로 변경    │                       │
   │  splitByLines(blocks,6)│                       │
   │ "확정" 클릭            │                       │
   │ for each split:        │                       │
   │   POST /api/slides     │                       │
   │ ──────────────────▶   │                       │
```

---

## 7. Security Model

### 7.1 신뢰 모델
- **신뢰 영역**: LAN 내부 (사무실/매장 네트워크). 외부 인터넷 노출 금지.
- **위협 모델**: LAN 내부의 우발적 잘못된 접속 차단. 의도적 공격 방어는 v1.1 범위 밖.

### 7.2 접근 제어
- 모든 요청은 `signage-device-id` 쿠키 기반으로 식별 → 서버가 첫 접속 시 발급
- **`/signage` HTML 라우트**: `is_signage_output=1`인 장치만 진입 가능 (`signageGuard` 미들웨어 → 미등록 시 `/signage/blocked`로 302 redirect). v1.1 dev에서는 Next.js dev 서버가 직접 처리하므로 효력 없음, 프로덕션 정적 호스팅(Plan FR-02-6) 시 작동
- **`/api/*` 라우트**: Plan FR-03-5에 따라 모든 LAN 클라이언트가 슬라이드 편집·재생 제어 가능 (사무실 PC가 현장 사이니지를 원격 조작하는 핵심 시나리오 보장)
- **`/api/devices/me/register-signage`**: launch-time secret(`X-Signage-Internal`) 헤더 필수 → Electron 본체만 호출 가능
- **CORS**: 사설 IP 대역(`localhost`, `127.*`, `192.168.*`, `10.*`, `172.16-31.*`)만 허용
- **신뢰 모델**: LAN 내부 네트워크 신뢰. 외부 인터넷 노출 금지. 의도적 공격 방어는 v1.1 범위 밖 (예: SQLite 파일 직접 편집은 OS 레벨 보안에 위임)

### 7.3 입력 검증
- HWPX 업로드: 50MB 상한, MIME 검사, ZIP entry path traversal 방지
- 슬라이드 content (HTML): TipTap이 신뢰 가능한 sanitizer 보유, 추가로 서버 측 XSS 필터(allowed tags)
- iframe webpage: `sandbox="allow-scripts allow-same-origin"` 유지

---

## 8. Error Handling & Resilience

| 상황 | 처리 |
|------|------|
| SSE 연결 끊김 | EventSource 자동 재연결 + 지수 백오프 (1s → 30s) + 재연결 시 `GET /api/slides` re-hydrate |
| API 4xx/5xx | 옵티미스틱 변경 롤백 + Toolbar 토스트 알림 |
| DB 락 (writer 동시) | better-sqlite3 동기 + WAL → 자동 직렬화. busy_timeout=3000ms |
| 마이그레이션 실패 | 백업 파일 유지 + 사용자 알림. localStorage 키는 보존 (재시도 가능) |
| HWPX 파싱 실패 | 모달에 에러 메시지, 부분 추출된 텍스트 노출 |
| 출력 장치 미등록 상태에서 /signage 접근 | `/signage/blocked` 안내 + 등록 가이드 표시 |

---

## 9. Performance & Resource

| 항목 | 목표 |
|------|------|
| API p95 응답 (LAN) | < 200ms |
| SSE → UI 반영 | < 1s |
| HWPX 50페이지 파싱 | < 5s |
| SQLite WAL 사이즈 | < 50MB (자동 체크포인트) |
| 키 입력 → 화면 전환 | < 200ms (네트워크 RTT 포함) |
| 메모리 (Electron 메인) | < 150MB |

---

## 10. Testing Strategy

| 레벨 | 대상 | 도구 |
|------|------|------|
| 단위 | parser, lineSplitter, controlService | Vitest |
| 통합 | API 라우트 (slides/control/import) | Supertest + better-sqlite3 in-memory |
| E2E | 편집 → 사이니지 동기화, 다중 클라이언트 | Playwright (수동 + 자동) |
| 호환 | v1.0 localStorage 마이그레이션 | 샘플 페이로드 시드 후 검증 |

핵심 시나리오:
1. 원격 PC에서 슬라이드 편집 → 5초 내 사이니지 출력 반영
2. 미등록 PC에서 /signage 접근 시 차단 페이지
3. PowerPoint 호환 키 6종 모두 올바른 동작
4. .hwpx 샘플 파일 → N줄 분할 미리보기 → 슬라이드 자동 추가
5. v1.0 localStorage 데이터 → SQLite 마이그레이션 무손실

---

## 11. Implementation Guide

### 11.1 구현 순서 (의존성 그래프)

```
M1 DB Layer
   ├──▶ M2 HTTP API
   │      ├──▶ M3 권한 분리
   │      ├──▶ M4 Data Client
   │      │      ├──▶ M5 Playback Controls
   │      │      └──▶ M6 HWPX Importer
   │      └──▶ (둘 다 M2 의존)
   └──▶ Migration 스크립트
```

### 11.2 핵심 결정 요약

| 결정 | 선택 | 근거 |
|------|------|------|
| DB 라이브러리 | better-sqlite3 | 동기 API, Electron 메인에 적합, 검증된 안정성 |
| HTTP 프레임워크 | Express | 학습 곡선 낮고 SSE 미들웨어 풍부 |
| 동기화 | SSE (EventSource) | WebSocket 과한 양방향 불필요, REST + SSE로 단순 |
| 상태 관리 | Zustand 유지 + 서버 단일 진실 | 기존 코드 보존 + 동시성 안전 |
| HWPX 파싱 | JSZip + fast-xml-parser | 외부 바이너리 없음, v1.1 범위 적합 |
| 권한 모델 | device-id 쿠키 + DB 플래그 | 단순, LAN 내부 신뢰 모델 충분 |

### 11.3 Session Guide

#### Module Map

| Scope Key | 모듈 | 신규 파일 | 수정 파일 | 예상 라인 |
|-----------|------|---------|---------|-----------|
| `module-1` | M1 DB Layer | 5 | 1 | ~400 |
| `module-2` | M2 HTTP API | 14 | 1 | ~600 |
| `module-3` | M3 권한 분리 | 4 | 2 | ~250 |
| `module-4` | M4 Data Client | 9 | 1 | ~450 |
| `module-5` | M5 Playback Controls | 4 | 3 | ~350 |
| `module-6` | M6 HWPX Importer | 8 | 1 | ~500 |

#### Recommended Session Plan

| 세션 | Scope | 작업 |
|------|-------|------|
| Session 1 | `module-1` | SQLite 스키마, better-sqlite3 통합, 시드 DB, 마이그레이션 v0→v1 |
| Session 2 | `module-2` | Express + 라우트 + Service + EventBus + SSE manager |
| Session 3 | `module-3,module-4` | 권한 가드 + device-id 발급/검증, ApiClient + Zustand 리팩토링 + SSE 구독 |
| Session 4 | `module-5` | 컨트롤바 UI + PowerPoint 키 훅 + Preview/SignageRenderer 적응 |
| Session 5 | `module-6` | HWPX JSZip 파서 + 라인 분할 + 임포트 모달 |
| Session 6 | (통합) | 멀티 클라이언트 E2E, 마이그레이션 검증, 빌드 패키징 |

`/pdca do smart-signage-v1.1 --scope module-N` 형식으로 세션별 진행 가능.

### 11.4 Code Conventions

- 모든 신규 파일 상단에 `// Design Ref: §{section} — {rationale}` 코멘트
- API 라우트: `routes/<resource>.ts` 한 파일 = 한 리소스 (express.Router())
- Service: 순수 함수 또는 클래스. EventBus는 인자로 주입(testability)
- Zustand 액션: 옵티미스틱 → API 호출 → 실패 시 롤백 패턴 일관 적용

---

## 12. Open Questions (Design 후 검토)

| # | 질문 | Design 단계 답변 |
|---|------|------------------|
| Q1 | rhwp Node 연동 미확정 | JSZip+fast-xml-parser로 자체 구현 (Strategy 패턴, 향후 rhwp 교체 가능) |
| Q2 | 다중 동시 편집 시 충돌? | LWW + SSE 자동 새로고침. 편집 중 알림은 v1.2 |
| Q3 | DB 백업/복원 UI? | v1.1: 자동 백업 파일만, 수동 복원 UI는 v1.2 |
| Q4 | 사이니지 복수 동시 운영? | v1.1: 단일 출력 장치 가정. 복수 출력은 v1.2 |
| Q5 | iframe webpage 보안 | 기존 sandbox 정책 유지 (Plan 외 변경 없음) |

---

## 13. Migration Plan from v1.0

1. v1.0 클라이언트가 v1.1 앱 첫 실행
2. SQLite 초기화 (시드 DB 복사)
3. 편집 윈도우 마운트 → MigrationGuard 컴포넌트 검사
4. localStorage('signage-slides') 발견 + 서버 슬라이드 0개 → 마이그레이션 안내 모달
5. 사용자 동의 → POST /api/admin/migrate-from-localstorage
6. 서버: 백업 → INSERT → SSE slide.changed 브로드캐스트
7. 클라이언트: localStorage 키 정리 + "v1.0 슬라이드 N개 가져왔습니다" 알림
8. 이후 정상 운영
