# Smart Signage v1.2.0

관공서/기관 LAN 환경을 위한 Electron + Next.js 기반 디지털 사이니지 솔루션.

- **호스트 PC** (NVIDIA Surround 환경): 사이니지 출력 + 편집기
- **원격 LAN PC**: 브라우저로 접속하여 슬라이드 편집/임포트/제어

## ⚡ 빠른 시작

### 운영자 (호스트 PC)

1. `release/Smart Signage-1.2.0-x64.exe` 실행 → 설치
2. NVIDIA 제어판에서 보조 모니터 3대를 5760×1080 Surround로 묶기
3. 단축키로 앱 실행 → "사이니지에 표시" 클릭 → 확장 모니터에 출력 시작
4. (선택) PowerShell 관리자: `New-NetFirewallRule -DisplayName "Smart Signage HTTP" -Direction Inbound -Protocol TCP -LocalPort 7321 -Action Allow -Profile Private`

### 원격 편집자

1. 호스트 PC의 IP 확인 (예: `192.168.1.10`)
2. 브라우저에서 `http://192.168.1.10:7321/` 접속
3. 슬라이드 추가/편집/임포트, 호스트 사이니지 제어 가능

## 🛠 개발자 빌드

```bash
npm install
npm run dev                # Next.js dev (port 3000)
npm run electron:dev       # Electron + Next.js dev 동시 실행

# 운영 인스톨러
npm run rebuild-native     # better-sqlite3을 Electron ABI로 (자동 포함됨)
npm run dist:win           # NSIS 인스톨러 + ZIP 빌드 → release/
```

## 📋 문제 해결

### 앱이 안 뜨거나 에러 발생 시

1. Toolbar의 **📋 로그** 버튼 클릭 → Explorer로 로그 폴더 오픈
2. `%APPDATA%\signage-app\logs\main.log` 파일 첨부하여 보고
3. 부팅 실패 시 자동으로 에러 다이얼로그가 stack trace + 로그 경로 표시

### 자주 묻는 질문

| 질문 | 답 |
|------|-----|
| 사이니지 창이 잘못된 모니터에 떠요 | NVIDIA 제어판에서 Surround 재구성. 로그의 `displays detected:` 라인으로 인식된 모니터 확인 |
| 원격 PC에서 자기 화면에 사이니지가 떠요 | 의도된 동작 아님. v1.2부터 원격 PC에는 절대 안 뜸 (호스트 화면만) |
| 한글 입력이 두 번씩 들어가요 | v1.2에서 IME composition 가드로 해결됨 |
| "재생/일시정지" 버튼이 사라졌어요 | 의도된 변경. 미리보기 하단의 컨트롤바를 사용 |

## 📚 추가 문서

- `docs/DEPLOY.md` — 운영 배포 상세 가이드
- `docs/01-plan/features/smart-signage-v1.1.plan.md` — v1.1 핵심 기능 명세
- `docs/01-plan/features/smart-signage-v1.2.plan.md` — v1.2 증분 (배포·단순화·진단)
- `docs/04-report/smart-signage-v1.2.report.md` — 완료 보고서

## 🏗 아키텍처

```
[Host PC (Electron)]
  ├─ Editor BrowserWindow      (편집 UI)
  ├─ Signage BrowserWindow     (Surround 출력, hidden→show 토글)
  └─ Express :7321
      ├─ /api/*  (REST + SSE: 슬라이드 CRUD, 재생 컨트롤, 디바이스, HWPX 임포트)
      └─ /*      (Next.js export — 호스트 + 원격 모두 같은 URL 사용)

[Remote LAN PC (브라우저)]
  └─ http://<host-ip>:7321/
      └─ 편집 가능. 사이니지 표시는 호스트 화면에만.
```

## 📦 주요 의존성

- Electron 30.5.1 (Node 20.16, Chromium 124)
- Next.js 14.2 (App Router, static export)
- better-sqlite3 12 (SQLite + WAL)
- Express 5
- TipTap 3 (WYSIWYG 에디터)
- electron-log 5 (진단)
- electron-builder 26 (NSIS 패키징)

## 📝 라이선스

Internal — 관공서/기관 운영 전용.
