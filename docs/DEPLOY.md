# Smart Signage v1.1 — 배포 가이드

> Last updated: 2026-04-28
> Target: 관공서/기관 LAN 환경 (호스트 PC + Surround 모니터 + 원격 편집 PC)

---

## 1. 배포 아키텍처 개요

```
[Host PC (Windows)]
  ├─ Smart Signage 설치본 (Electron app)
  │   ├─ Express HTTP server (port 7321)
  │   │   ├─ /api/*    REST + SSE
  │   │   └─ /*        Next.js static export (편집 UI + /signage)
  │   ├─ Editor BrowserWindow  → http://localhost:7321/
  │   ├─ Signage BrowserWindow → http://localhost:7321/signage (Surround 모니터)
  │   └─ SQLite (userData/signage.db)
  └─ NVIDIA Surround 5760×1080 구성

[원격 편집 PC (LAN 내부)]
  └─ 브라우저 → http://<host-ip>:7321/  (편집만 가능; /signage는 차단됨)
```

**핵심 결정**:
- 정적 페이지(편집 UI, /signage)는 **Express가 호스팅** → 호스트와 원격이 같은 URL 사용
- 호스트 Electron의 두 BrowserWindow도 `http://localhost:7321`로 로드 → file:// 의 쿠키/CORS 문제 회피
- 데이터는 SQLite (userData) → OS 사용자 단위 격리, 자동 백업 가능

---

## 2. 사전 준비

### 2.1 빌드 머신 (개발자 PC)
- Node.js **20.x LTS** (네이티브 모듈 호환성 위해 권장)
- npm 또는 pnpm
- Git
- (Windows 빌드 시) Visual Studio Build Tools or `windows-build-tools` (better-sqlite3 컴파일용)
- (선택) 코드 서명 인증서 — NSIS 인스톨러 디지털 서명 필요 시

### 2.2 호스트 PC (운영 환경)
- Windows 10/11 (x64)
- NVIDIA Surround 활성화하여 보조 모니터 3대를 5760×1080 단일 디스플레이로 묶음
- LAN 내부에서 다른 PC가 접속 가능한 IP (방화벽 7321 인바운드 허용 필요)

### 2.3 원격 편집 PC
- 모던 브라우저 (Chrome/Edge 100+)
- 호스트 PC와 같은 LAN 네트워크

---

## 3. 빌드 절차

### 3.1 개발자 PC에서 production 패키지 만들기

```bash
# 1. 의존성 설치
npm install

# 2. 네이티브 모듈을 Electron ABI에 맞춰 재빌드
npm run rebuild-native

# 3. Next.js 정적 빌드 + Electron 코드 컴파일
npm run build

# 4. 인스톨러 패키징 (Windows NSIS + ZIP 둘 다 출력)
npm run dist:win
```

산출물:
- `release/Smart Signage-1.1.0-x64.exe` — NSIS 인스톨러
- `release/Smart Signage-1.1.0-x64.zip` — 포터블 ZIP
- `release/win-unpacked/` — 압축 해제된 폴더 (디버깅용)

### 3.2 빠른 검증 (패키징 없이)

```bash
# 패키징 없이 unpacked 디렉토리만 만들고 실행 가능 상태 확인
npm run dist:dir

# 그 후 release/win-unpacked/Smart Signage.exe 실행
```

### 3.3 production-like 미리보기 (Electron 없이)

```bash
# Next.js 빌드 + Express만 실행 (브라우저로 단일 포트 접속)
npm run build:next
npm run build:electron
node scripts/standalone-server.js

# 브라우저에서 http://localhost:7321 접속 (단일 포트 모드)
```

---

## 4. 호스트 PC 설치

### 4.1 인스톨러 실행
1. `Smart Signage-1.1.0-x64.exe` 실행
2. 설치 경로 선택 (기본: `C:\Program Files\Smart Signage`)
3. 데스크톱/시작 메뉴 단축키 생성 옵션 체크
4. 설치 완료

### 4.2 NVIDIA Surround 사전 설정
1. NVIDIA 제어판 → **3D 설정** → **Surround 구성**
2. 보조 모니터 3대를 가로 배열로 5760×1080 단일 디스플레이로 묶음
3. Windows 디스플레이 설정에서 "확장 모드" 확인
4. 주 모니터(편집기 표시)는 별도

### 4.3 첫 실행
1. **Smart Signage** 실행 (관리자 권한 불필요)
2. 편집기 창이 주 모니터에, 사이니지 창은 비활성 상태로 보조 모니터 위치에 대기
3. 우측 상단 "이 장치 출력 등록" 클릭 → 이 PC가 사이니지 출력 가능 장치로 등록됨 (DB에 영구 저장, 재실행 시 유지)
4. 슬라이드 추가 → "사이니지에 표시" 클릭 → 보조 모니터 풀스크린 출력

### 4.4 방화벽 인바운드 규칙 (원격 접속 활성화)
PowerShell (관리자):
```powershell
New-NetFirewallRule -DisplayName "Smart Signage HTTP" -Direction Inbound -Protocol TCP -LocalPort 7321 -Action Allow -Profile Private
```

또는 Windows 방화벽 GUI: 인바운드 규칙 → 새 규칙 → 포트 7321/TCP 허용 (개인/도메인 프로필).

---

## 5. 원격 편집 PC 사용

1. 호스트 PC의 IP 확인 (예: `192.168.1.10`)
2. 브라우저에서 `http://192.168.1.10:7321/` 접속
3. 편집기 UI가 호스트와 동일하게 표시됨
4. 슬라이드 추가/수정 → 호스트의 사이니지 창에 SSE로 즉시 반영
5. `/signage` 직접 URL 입력 시 차단 페이지로 리다이렉트 (signageGuard 미들웨어)

### 원격에서 가능한 동작
| 동작 | 가능? |
|------|:----:|
| 슬라이드 추가/편집/삭제/순서 변경 | ✅ |
| .hwpx 문서 임포트 | ✅ |
| 재생/일시정지/이전/다음 컨트롤 (호스트 사이니지에 반영) | ✅ |
| PowerPoint 호환 키보드 단축키 | ✅ |
| 자기 PC에 사이니지 창 띄우기 | ⛔ (차단 페이지) |

---

## 6. 데이터 위치 및 백업

| 항목 | 위치 (Windows) |
|------|----------------|
| SQLite DB | `%APPDATA%\signage-app\signage.db` |
| 미디어 파일 | `%APPDATA%\signage-app\media\` |
| device-id | `%APPDATA%\signage-app\device-id` |
| 마이그레이션 백업 | `%APPDATA%\signage-app\backups\migrate-*.json` |

### 백업
앱 종료 후 `%APPDATA%\signage-app\` 폴더 전체를 복사하면 모든 운영 상태가 보존됩니다.

### 복원
앱 종료 → 백업 폴더를 같은 위치에 덮어쓰기 → 앱 재실행.

### 초기화
앱 종료 → `%APPDATA%\signage-app\` 폴더 삭제 → 앱 재실행 (빈 DB로 새로 시작).

---

## 7. 업그레이드 절차

### 7.1 동일 메이저 버전 (예: v1.1.0 → v1.1.1)
1. 신 버전 인스톨러 실행 → 기존 설치본 위에 덮어쓰기
2. SQLite 스키마 변경 없으므로 기존 데이터 그대로 유지
3. 앱 재실행

### 7.2 메이저 버전 (예: v1.1 → v1.2)
1. **백업 필수**: `%APPDATA%\signage-app\` 폴더 복사
2. 신 버전 인스톨러 실행
3. 첫 실행 시 `runMigrations()`이 schema_version 비교 → 필요한 ALTER TABLE 자동 적용
4. 마이그레이션 실패 시 백업에서 복원 후 v1.1로 롤백

---

## 8. 문제 해결

| 증상 | 원인 | 해결 |
|------|------|------|
| 앱 실행 시 콘솔에 `Cannot find module 'better-sqlite3'` | 네이티브 모듈 미빌드 | 빌드 시 `npm run rebuild-native` 실행 후 재패키징 |
| 원격 PC에서 `http://<host-ip>:7321` 무응답 | 방화벽 차단 | §4.4 방화벽 규칙 추가 |
| 원격 PC에서 `/signage` 접근 시 무한 redirect | device-id 쿠키 미발급 | 먼저 `/`(편집기)에 한 번 접속하여 쿠키 발급 받게 한 뒤 재시도 |
| 사이니지 창이 보조 모니터가 아닌 주 모니터에 뜸 | NVIDIA Surround 미설정 또는 보조 모니터 미감지 | NVIDIA 제어판에서 Surround 재구성, Windows 디스플레이 설정 확인 |
| 사이니지 출력 후 "재생 중"인데 슬라이드 안 넘어감 | 슬라이드 1장만 있거나 video loop 옵션 켜짐 | 슬라이드 추가, video 슬라이드의 loop 해제 |
| `재생`/`일시정지` 버튼이 비활성화 | 사이니지 창 미오픈 | 먼저 "사이니지에 표시" 클릭 |
| HWPX 임포트 시 텍스트가 비어있음 | OWPML 표/이미지만 있는 문서 (텍스트 없음) | v1.1은 텍스트만 추출 — 이미지/표는 v1.2 예정 |

### 로그 위치
- Electron 메인: `%APPDATA%\signage-app\logs\main.log` (electron-log 미사용 시 콘솔에만 출력)
- 렌더러: 편집기 창에서 `Ctrl+Shift+I` → DevTools 콘솔
- 사이니지: 사이니지 창에서 `F12` → DevTools 콘솔

---

## 9. CI/CD 파이프라인 (선택)

GitHub Actions 예시 (`.github/workflows/release.yml`):

```yaml
name: Release Build
on:
  push:
    tags: ['v*']

jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run rebuild-native
      - run: npm run dist:win
      - uses: softprops/action-gh-release@v2
        with:
          files: |
            release/*.exe
            release/*.zip
```

---

## 10. 보안 고려사항

| 영역 | 정책 |
|------|------|
| 네트워크 | LAN 내부 신뢰 모델. 외부 인터넷 노출 금지 |
| CORS | 사설 IP 대역(localhost, 10.*, 172.16-31.*, 192.168.*)만 허용 |
| `/signage` 접근 | device-id 쿠키 + DB의 `is_signage_output=1` 검증 (signageGuard 미들웨어) |
| `register-signage` API | launch-time secret 헤더 필수 (Electron 본체만 호출 가능) |
| 미디어 업로드 | 50MB 상한, ZIP path traversal 방지 |
| 슬라이드 HTML | TipTap 기본 sanitize + iframe sandbox 적용 |

운영 중 의심되는 접속 시도가 있으면 device-id 쿠키별로 DB의 `devices` 테이블에서 추적 가능 (created_at, last_seen_at).

---

## 11. 빌드/배포 체크리스트

- [ ] `npm install` 후 의존성 변경 없음 확인
- [ ] `npm run rebuild-native` 성공
- [ ] `npm run build` 성공 (Next.js + Electron 모두)
- [ ] `node scripts/standalone-server.js`로 production-like 미리보기 정상
- [ ] `npm run dist:win` 성공 → release/ 폴더 산출물 존재
- [ ] 호스트 PC에 인스톨러 실행 후 NVIDIA Surround 환경에서 사이니지 출력 정상
- [ ] 원격 PC 브라우저에서 LAN IP 접속 → 편집 가능, /signage는 차단 확인
- [ ] SSE 동기화 (편집·재생 컨트롤) 양방향 정상
- [ ] HWPX 샘플 파일 임포트 정상
- [ ] 앱 종료 → 재실행 시 슬라이드 데이터 유지 확인

이 모든 항목이 통과하면 운영 배포 가능 상태입니다.
