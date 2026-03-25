# 디지털 사이니지 앱 프로젝트 가이드
## (Electron + Next.js + Claude Code CLI)

---

## 1. 사전 준비

### 필수 설치 목록

| 도구 | 버전 | 설치 확인 |
|------|------|-----------|
| Node.js | 18 이상 | `node --version` |
| Git | 최신 | `git --version` |
| Claude Code | 최신 | `claude --version` |

### Claude Code 설치 (Windows)

```powershell
# Windows PowerShell (관리자 권한 권장)
# 공식 설치 페이지: https://claude.ai/install.sh

# 설치 후 인증
claude
# → 브라우저 열림 → Claude 계정 로그인 (Pro 이상 구독 필요)
```

> **구독 선택 가이드**  
> - **Pro ($20/월)**: 개인 학습 및 소규모 프로젝트 → 시작 추천  
> - **Max**: 대규모 리팩토링, 1M 토큰 컨텍스트 필요 시  

---

## 2. 기술 스택 요약

```
┌─────────────────────────────────────────────┐
│              Electron (앱 Shell)             │
│                                             │
│  ┌──────────────┐    ┌────────────────────┐ │
│  │  편집 창     │    │   사이니지 출력 창  │ │
│  │  (1번 모니터) │    │  (Surround 2+3+4)  │ │
│  │              │    │                    │ │
│  │  Next.js UI  │◄──►│  React 렌더러      │ │
│  │  편집/네비게이션│   │  풀스크린 프레젠테이션│ │
│  └──────────────┘    └────────────────────┘ │
│            Electron IPC 통신                 │
└─────────────────────────────────────────────┘
```

| 레이어 | 기술 | 역할 |
|--------|------|------|
| 앱 Shell | Electron | 멀티 윈도우, OS 제어, 풀스크린 |
| 편집 UI | Next.js + React | 슬라이드 편집, 네비게이션 |
| 상태 관리 | Zustand | 편집↔출력 데이터 동기화 |
| 사이니지 렌더링 | React + CSS | 프레젠테이션 출력 화면 |
| 프로세스 통신 | Electron IPC | 창 간 이벤트/데이터 전달 |
| 데이터 저장 | JSON 파일 | 슬라이드 콘텐츠 저장 |

---

## 3. 프로젝트 생성 (Claude Code CLI)

### Step 1: 프로젝트 폴더 생성 및 Claude Code 시작

```powershell
mkdir signage-app
cd signage-app
claude
```

### Step 2: CLAUDE.md 생성 (프로젝트 컨텍스트 파일)

Claude Code가 매 세션 시작 시 자동으로 읽는 설정 파일입니다.  
아래 내용으로 `CLAUDE.md` 파일을 프로젝트 루트에 만드세요.

```markdown
# Signage App - Claude Code 컨텍스트

## 프로젝트 개요
디지털 사이니지 앱. Electron + Next.js 기반.
- 1번 모니터: 편집 UI (BrowserWindow A)
- 2+3+4번 모니터: NVIDIA Surround로 묶인 단일 디스플레이 → 사이니지 출력 (BrowserWindow B)

## 기술 스택
- Electron (멀티 윈도우, IPC, 풀스크린 제어)
- Next.js 14 + React (UI)
- Zustand (상태 관리)
- TypeScript

## 주요 규칙
- TypeScript 사용, any 타입 금지
- 컴포넌트는 /components 폴더에 분리
- IPC 채널명은 kebab-case (예: show-on-signage)
- 슬라이드 데이터는 JSON으로 /data 폴더에 저장

## 실행 명령어
- 개발: `npm run dev`
- 빌드: `npm run build`
- Electron 실행: `npm run electron`
```

### Step 3: Claude Code에 프로젝트 구조 생성 요청

Claude Code CLI 세션에서 아래 프롬프트를 순서대로 입력하세요.

---

**[프롬프트 1] 프로젝트 초기화**
```
Electron + Next.js 14 + TypeScript + Zustand 조합으로 디지털 사이니지 앱 프로젝트를 초기화해줘.

요구사항:
- package.json 생성 (electron, next, react, zustand, typescript 의존성 포함)
- tsconfig.json 설정
- 폴더 구조: /app (Next.js), /electron (main process), /components, /store, /data
- .gitignore 생성
```

---

**[프롬프트 2] Electron 메인 프로세스**
```
electron/main.ts 파일을 만들어줘.

요구사항:
1. BrowserWindow를 2개 생성
   - editorWin: 주 모니터(primary display)에 표시, 편집 UI 로드
   - signageWin: secondary display에 표시, frame:false, 사이니지 렌더러 로드
2. screen.getAllDisplays()로 모니터 자동 감지
3. IPC 이벤트:
   - 'toggle-fullscreen': signageWin 풀스크린 토글 (F11 연동)
   - 'show-on-signage': 슬라이드 데이터를 signageWin으로 전달
   - 'get-displays': 연결된 디스플레이 목록 반환
```

---

**[프롬프트 3] 상태 관리 스토어**
```
store/useSignageStore.ts 를 Zustand로 만들어줘.

슬라이드 타입 정의:
- id: string
- title: string
- content: string
- backgroundColor: string
- duration: number (초)

스토어 기능:
- slides 배열 CRUD (추가/수정/삭제/순서변경)
- currentSlideIndex 관리
- isFullscreen 상태
- JSON 파일로 저장/불러오기 액션
```

---

**[프롬프트 4] 편집 UI**
```
app/page.tsx (편집 메인 화면)을 만들어줘.

구성:
- 왼쪽 사이드바: 슬라이드 목록 (드래그로 순서 변경)
- 가운데: 현재 슬라이드 편집 폼 (제목, 내용, 배경색, 표시 시간)
- 오른쪽: 미리보기
- 상단 툴바: [저장] [사이니지에 표시] [F11 전체화면] 버튼

IPC 연동:
- "사이니지에 표시" 버튼 → ipcRenderer.send('show-on-signage', currentSlide)
- F11 키 → ipcRenderer.send('toggle-fullscreen')
```

---

**[프롬프트 5] 사이니지 출력 화면**
```
app/signage/page.tsx 를 만들어줘.

요구사항:
- 검은 배경 전체 화면
- IPC로 받은 슬라이드 데이터를 크게 표시
- 슬라이드 전환 시 페이드 인/아웃 애니메이션
- 자동 슬라이드쇼 지원 (duration 기반 타이머)
- 3840x1080 (FHD Surround) 기준 레이아웃 대응
  → 3개 패널로 나눠서 각각 다른 콘텐츠 표시 가능하도록 설계
```

---

## 4. 폴더 구조 (완성 목표)

```
signage-app/
├── CLAUDE.md                  ← Claude Code 컨텍스트
├── package.json
├── tsconfig.json
├── .gitignore
│
├── electron/
│   ├── main.ts               ← Electron 메인 프로세스
│   └── preload.ts            ← IPC 브리지 (보안)
│
├── app/                      ← Next.js App Router
│   ├── page.tsx              ← 편집 UI (1번 모니터)
│   ├── signage/
│   │   └── page.tsx          ← 사이니지 출력 (Surround)
│   └── layout.tsx
│
├── components/
│   ├── SlideEditor.tsx
│   ├── SlideList.tsx
│   ├── SignageRenderer.tsx
│   └── Preview.tsx
│
├── store/
│   └── useSignageStore.ts    ← Zustand 스토어
│
└── data/
    └── slides.json           ← 슬라이드 데이터 저장소
```

---

## 5. 핵심 개발 흐름 이해

```
사용자가 편집 UI에서 슬라이드 수정
        ↓
Zustand 스토어 업데이트
        ↓
"사이니지에 표시" 버튼 클릭
        ↓
ipcRenderer.send('show-on-signage', slideData)
        ↓
Electron Main Process 수신
        ↓
signageWin.webContents.send('render-slide', slideData)
        ↓
사이니지 출력 창에서 렌더링
```

---

## 6. NVIDIA Surround 설정 (앱 개발 전 먼저 완료)

1. 바탕화면 우클릭 → **NVIDIA 제어판** 열기
2. 좌측 `3D 설정` → **Surround, PhysX 구성** 클릭
3. **"Span displays with Surround"** 체크
4. 모니터 2, 3, 4 선택 → 물리적 배치 순서대로 드래그 정렬
5. 해상도 확인: FHD×3 = **5760×1080** (또는 4K×3)
6. 적용 후 Windows에서 디스플레이 2개로 인식되는지 확인
   - 디스플레이 1: 주 모니터 (1번)
   - 디스플레이 2: Surround 가상 모니터 (2+3+4)

> **Surround 설정 후 Electron 코드에서 자동으로 감지됩니다.**  
> `screen.getAllDisplays()` → 2개 반환 확인

---

## 7. 유용한 Claude Code CLI 명령어

| 명령어 | 설명 |
|--------|------|
| `claude` | 현재 폴더에서 세션 시작 |
| `/plan` | 복잡한 기능 구현 전 계획 수립 |
| `/compact` | 긴 세션에서 컨텍스트 압축 |
| `/model` | 사용 모델 변경 (Sonnet ↔ Opus) |
| `claude -n "편집UI 작업"` | 세션 이름 지정해서 시작 |

> **모델 선택 팁**  
> - **Sonnet 4.6**: 일반 코딩, 버그 수정, 컴포넌트 작성 (80% 작업)  
> - **Opus 4.6**: 아키텍처 설계, 대규모 리팩토링 (20% 작업)

---

## 8. 다음 단계 (확장 아이디어)

- [ ] 슬라이드 템플릿 시스템 (이미지, 동영상, 텍스트)
- [ ] 스케줄링 기능 (시간대별 자동 전환)
- [ ] 원격 제어 (웹 대시보드에서 사이니지 제어)
- [ ] 3개 패널 독립 콘텐츠 (Surround 영역 분할)
- [ ] 실시간 데이터 연동 (날씨, 시간, RSS 등)
