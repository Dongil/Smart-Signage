# Plan: Smart Signage - 멀티 디스플레이 사이니지 제어 앱

> Created: 2026-03-25
> Feature: smart-signage
> Level: Dynamic
> Status: Plan

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| Feature | Smart Signage - 멀티 디스플레이 사이니지 제어 앱 |
| 시작일 | 2026-03-25 |
| 예상 기간 | 5~7 세션 |

### Results Summary

| 지표 | 값 |
|------|-----|
| 총 기능 모듈 | 6개 |
| 신규 파일 | ~15개 |
| 수정 파일 | ~8개 |
| 예상 코드량 | ~2,500 lines |

### Value Delivered (4-Perspective)

| 관점 | 내용 |
|------|------|
| **Problem** | 텍스트만 지원하는 사이니지에 이미지/동영상/웹 콘텐츠를 표시할 수 없고, 편집 UI의 완성도가 낮아 실제 운영에 부적합 |
| **Solution** | 4종 템플릿 시스템(텍스트/이미지/동영상/웹페이지) + 편집 UI 고도화 + 사이니지 렌더러 완성 |
| **Function UX Effect** | 드래그&드롭으로 다양한 미디어를 배치하고, 실시간 미리보기로 즉시 확인 가능 |
| **Core Value** | 비개발자도 직관적으로 멀티 디스플레이 사이니지 콘텐츠를 제작/운영할 수 있는 올인원 앱 |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 현재 텍스트 전용 사이니지를 다양한 미디어를 지원하는 완성된 제어 앱으로 발전시켜야 함 |
| **WHO** | 사이니지 운영자 (비개발자 포함), 매장/사무실 디지털 디스플레이 관리자 |
| **RISK** | 동영상 렌더링 성능 (Surround 5760x1080), Electron IPC 대용량 데이터 전달, 파일 관리 복잡도 |
| **SUCCESS** | 4종 템플릿 모두 사이니지에 정상 출력, 편집→출력 흐름 3초 이내, 슬라이드쇼 무중단 운영 |
| **SCOPE** | 핵심 기능 (템플릿 시스템, 편집 UI 고도화, 렌더러 완성, 자동 슬라이드쇼 개선) — 원격 제어/실시간 데이터 연동은 제외 |

---

## 1. Background & Problem

### 1.1 현재 상태
- 기본 프로젝트 스캐폴드 완성 (Electron + Next.js + Zustand)
- 편집 UI: SlideList, SlideEditor, Preview, Toolbar 구현됨
- 사이니지 렌더러: 3패널 CSS Grid + 페이드 애니메이션 구현됨
- IPC 통신: preload 보안 브리지 적용됨
- 데이터: JSON 파일 저장/불러오기 구현됨

### 1.2 해결해야 할 문제
1. **콘텐츠 단일성**: 텍스트만 지원 → 이미지/동영상/웹페이지 미지원
2. **편집 UI 미완성**: 기본 폼만 존재, 미디어 업로드/미리보기 없음
3. **렌더러 제한**: 텍스트만 표시 가능, 미디어 렌더링 미지원
4. **슬라이드쇼 기초 수준**: 단순 타이머만 존재, 전환 효과 단일
5. **파일 관리 부재**: 미디어 파일 저장/참조 체계 없음

---

## 2. Requirements

### 2.1 Functional Requirements

#### FR-01: 슬라이드 템플릿 시스템
| ID | 요구사항 | 우선순위 |
|----|---------|---------|
| FR-01-1 | 텍스트 템플릿: 제목 + 본문 + 배경색 (현재 방식 유지/개선) | P0 |
| FR-01-2 | 이미지 템플릿: 로컬 이미지 파일 업로드 및 배경/전면 표시 | P0 |
| FR-01-3 | 동영상 템플릿: MP4/WebM 파일 재생 (자동재생, 루프, 음소거 옵션) | P1 |
| FR-01-4 | 웹페이지 템플릿: 외부 URL을 iframe으로 로드하여 표시 | P1 |
| FR-01-5 | 각 슬라이드에 템플릿 타입(type) 필드 추가 | P0 |

#### FR-02: 편집 UI 고도화
| ID | 요구사항 | 우선순위 |
|----|---------|---------|
| FR-02-1 | 슬라이드 추가 시 템플릿 타입 선택 UI | P0 |
| FR-02-2 | 이미지 슬라이드: 파일 선택 다이얼로그 + 이미지 미리보기 | P0 |
| FR-02-3 | 동영상 슬라이드: 파일 선택 + 비디오 미리보기 + 재생 옵션 | P1 |
| FR-02-4 | 웹페이지 슬라이드: URL 입력 필드 + 로드 상태 표시 | P1 |
| FR-02-5 | 드래그&드롭 파일 업로드 지원 | P1 |
| FR-02-6 | Preview 컴포넌트에서 모든 템플릿 타입 미리보기 | P0 |

#### FR-03: 사이니지 렌더러 완성
| ID | 요구사항 | 우선순위 |
|----|---------|---------|
| FR-03-1 | 텍스트 슬라이드 렌더링 (현재 방식 개선: 폰트 크기 최적화) | P0 |
| FR-03-2 | 이미지 슬라이드 렌더링 (object-fit 옵션: cover/contain/fill) | P0 |
| FR-03-3 | 동영상 슬라이드 렌더링 (자동재생, 루프, 음소거) | P1 |
| FR-03-4 | 웹페이지 슬라이드 렌더링 (iframe, 보안 sandbox) | P1 |
| FR-03-5 | 3패널 통합 모드 유지 (동일 콘텐츠 3패널 복제) | P0 |
| FR-03-6 | FHD Surround (5760x1080) 최적화 | P0 |

#### FR-04: 슬라이드쇼 개선
| ID | 요구사항 | 우선순위 |
|----|---------|---------|
| FR-04-1 | duration 기반 자동 전환 (현재 방식 유지) | P0 |
| FR-04-2 | 동영상 슬라이드: 영상 종료 시 자동 전환 옵션 | P1 |
| FR-04-3 | 전환 애니메이션 다양화 (fade, slide, none) | P2 |
| FR-04-4 | 슬라이드쇼 재생/일시정지/처음으로 제어 | P1 |

#### FR-05: 파일 관리
| ID | 요구사항 | 우선순위 |
|----|---------|---------|
| FR-05-1 | 미디어 파일을 /data/media/ 폴더에 복사/저장 | P0 |
| FR-05-2 | 슬라이드 데이터에 파일 경로 참조 저장 | P0 |
| FR-05-3 | Electron dialog.showOpenDialog로 파일 선택 | P0 |
| FR-05-4 | 미사용 미디어 파일 정리 기능 | P2 |

#### FR-06: 디스플레이 관리
| ID | 요구사항 | 우선순위 |
|----|---------|---------|
| FR-06-1 | 연결된 디스플레이 목록 표시 (현재 IPC 구현됨) | P0 |
| FR-06-2 | 사이니지 출력 대상 디스플레이 선택 UI | P1 |
| FR-06-3 | 풀스크린 토글 (F11) 유지 | P0 |

### 2.2 Non-Functional Requirements

| ID | 요구사항 | 기준 |
|----|---------|------|
| NFR-01 | 편집→사이니지 전송 지연 | < 3초 |
| NFR-02 | 슬라이드 전환 프레임 드롭 | 없음 (60fps) |
| NFR-03 | 동영상 재생 해상도 | FHD (1920x1080) per panel |
| NFR-04 | 앱 메모리 사용량 | < 500MB |
| NFR-05 | 타입 안전성 | any 타입 0개 |
| NFR-06 | 대상 해상도 | 5760x1080 (FHD Surround) |

---

## 3. Success Criteria

| # | 기준 | 측정 방법 |
|---|------|----------|
| SC-1 | 4종 템플릿(텍스트/이미지/동영상/웹) 모두 편집 가능 | 각 타입 슬라이드 생성→편집→저장 성공 |
| SC-2 | 4종 템플릿 모두 사이니지에 정상 출력 | 각 타입 "사이니지에 표시" 후 렌더링 확인 |
| SC-3 | 편집→출력 흐름 3초 이내 | 버튼 클릭~사이니지 표시 시간 측정 |
| SC-4 | 자동 슬라이드쇼 혼합 타입 재생 | 텍스트→이미지→동영상 순서 자동 전환 확인 |
| SC-5 | FHD Surround (5760x1080) 정상 레이아웃 | 3패널 비율/잘림 없음 확인 |
| SC-6 | any 타입 0개, TypeScript strict 통과 | tsc --noEmit 에러 0 |

---

## 4. Scope

### 4.1 In Scope
- 슬라이드 템플릿 시스템 (텍스트/이미지/동영상/웹페이지)
- 편집 UI 고도화 (타입별 편집 폼, 미리보기, 파일 업로드)
- 사이니지 렌더러 완성 (4종 미디어 렌더링)
- 자동 슬라이드쇼 개선
- 미디어 파일 관리 (로컬 저장)
- 디스플레이 선택 UI

### 4.2 Out of Scope
- 원격 제어 (웹 대시보드) — 향후 확장
- 실시간 데이터 연동 (날씨, RSS) — 향후 확장
- 3패널 독립 모드 (각 패널 다른 콘텐츠) — 향후 확장
- 요일/시간대 복합 스케줄링 — 향후 확장
- 클라우드 동기화 — 향후 확장

---

## 5. Technical Approach

### 5.1 데이터 모델 변경

```typescript
// types/slide.ts (확장)
type SlideType = 'text' | 'image' | 'video' | 'webpage';

interface Slide {
  id: string;
  type: SlideType;           // NEW
  title: string;
  content: string;           // text content or URL
  backgroundColor: string;
  duration: number;
  // Media fields (NEW)
  mediaPath?: string;        // /data/media/ 내 파일 경로
  mediaOptions?: {
    objectFit?: 'cover' | 'contain' | 'fill';
    autoplay?: boolean;
    loop?: boolean;
    muted?: boolean;
  };
}
```

### 5.2 아키텍처 변경 개요

```
┌─────────────────────────────────────────────────────────┐
│                    Electron Main                         │
│  ┌──────────────┐  ┌─────────────┐  ┌───────────────┐  │
│  │  IPC Handler  │  │ File Manager │  │ Display Mgr   │  │
│  │ (기존 + 확장)  │  │ (NEW)        │  │ (기존 + 확장)  │  │
│  └──────────────┘  └─────────────┘  └───────────────┘  │
├─────────────────────────────────────────────────────────┤
│              Editor Window (1번 모니터)                    │
│  ┌────────┐ ┌──────────────┐ ┌─────────┐ ┌──────────┐  │
│  │SlideList│ │TemplateEditor│ │ Preview  │ │ Toolbar  │  │
│  │        │ │ (NEW/확장)    │ │ (확장)   │ │ (확장)    │  │
│  └────────┘ └──────────────┘ └─────────┘ └──────────┘  │
├─────────────────────────────────────────────────────────┤
│          Signage Window (Surround 5760x1080)             │
│  ┌─────────────────────────────────────────────────────┐│
│  │              SignageRenderer (확장)                   ││
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          ││
│  │  │ Panel 1   │  │ Panel 2   │  │ Panel 3   │         ││
│  │  │ (unified) │  │ (unified) │  │ (unified) │         ││
│  │  └──────────┘  └──────────┘  └──────────┘          ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

### 5.3 IPC 채널 추가

| 채널명 | 방향 | 용도 |
|--------|------|------|
| `select-media-file` | Renderer → Main | 파일 선택 다이얼로그 |
| `copy-media-file` | Renderer → Main | 미디어 파일을 /data/media/에 복사 |
| `get-media-path` | Renderer → Main | 미디어 절대 경로 반환 |

### 5.4 모듈 구성

| 모듈 | 새 파일 | 수정 파일 | 설명 |
|------|---------|----------|------|
| M1: 데이터 모델 | `types/slide.ts` (수정) | `store/useSignageStore.ts` | SlideType 추가, 미디어 필드 |
| M2: 파일 관리 | `electron/fileManager.ts` | `electron/main.ts`, `electron/preload.ts` | 미디어 파일 복사/경로 관리 |
| M3: 편집 UI | `components/TemplateSelector.tsx`, `components/ImageEditor.tsx`, `components/VideoEditor.tsx`, `components/WebpageEditor.tsx` | `components/SlideEditor.tsx`, `app/page.tsx` | 타입별 편집 폼 |
| M4: 미리보기 | — | `components/Preview.tsx` | 4종 미디어 미리보기 |
| M5: 렌더러 | `components/renderers/TextSlide.tsx`, `components/renderers/ImageSlide.tsx`, `components/renderers/VideoSlide.tsx`, `components/renderers/WebpageSlide.tsx` | `components/SignageRenderer.tsx` | 타입별 렌더링 |
| M6: 슬라이드쇼 | — | `components/SignageRenderer.tsx`, `components/Toolbar.tsx` | 재생 제어, 동영상 연동 |

---

## 6. Risk Analysis

| 리스크 | 영향도 | 발생 확률 | 대응 방안 |
|--------|--------|----------|----------|
| 동영상 렌더링 성능 저하 (5760x1080) | 높음 | 중간 | 각 패널에서 독립 `<video>` 재생, hardware acceleration 활용 |
| 대용량 미디어 IPC 전달 지연 | 중간 | 낮음 | 파일 경로만 전달, 렌더러에서 직접 로드 |
| iframe 보안 이슈 (웹페이지 템플릿) | 높음 | 중간 | sandbox 속성 적용, CSP 헤더 설정 |
| Electron 파일 접근 권한 | 중간 | 낮음 | app.getPath('userData') 기반 안전한 경로 사용 |
| 슬라이드 데이터 구조 변경 시 하위 호환성 | 중간 | 높음 | type 필드 없으면 'text' 기본값, 마이그레이션 로직 |

---

## 7. Implementation Priority

### Phase 1 (P0 - 필수)
1. **M1**: Slide 타입 확장 + 스토어 수정
2. **M2**: 파일 관리자 (미디어 저장/경로)
3. **M3-text**: 텍스트 편집기 개선
4. **M3-image**: 이미지 편집기 + 파일 선택
5. **M5-text/image**: 텍스트/이미지 렌더러
6. **M4**: Preview 4종 미리보기

### Phase 2 (P1 - 중요)
7. **M3-video**: 동영상 편집기
8. **M3-webpage**: 웹페이지 편집기
9. **M5-video/webpage**: 동영상/웹페이지 렌더러
10. **M6**: 슬라이드쇼 재생 제어 + 동영상 연동
11. **FR-06-2**: 디스플레이 선택 UI

### Phase 3 (P2 - 선택)
12. 전환 애니메이션 다양화
13. 미사용 미디어 정리
14. 드래그&드롭 파일 업로드

---

## 8. Session Plan (Recommended)

| 세션 | 모듈 | 작업 내용 | 예상 규모 |
|------|------|----------|----------|
| Session 1 | M1 + M2 | 데이터 모델 확장 + 파일 관리자 + IPC 추가 | ~400 lines |
| Session 2 | M3 (text/image) | 텍스트/이미지 편집기 + 템플릿 선택 UI | ~500 lines |
| Session 3 | M5 (text/image) + M4 | 텍스트/이미지 렌더러 + Preview 업데이트 | ~400 lines |
| Session 4 | M3 (video/webpage) | 동영상/웹페이지 편집기 | ~400 lines |
| Session 5 | M5 (video/webpage) + M6 | 동영상/웹 렌더러 + 슬라이드쇼 개선 | ~500 lines |
| Session 6 | 통합 테스트 + 디스플레이 UI | 전체 흐름 테스트 + 디스플레이 선택 | ~300 lines |

---

## 9. Dependencies

| 의존성 | 유형 | 용도 |
|--------|------|------|
| Electron `dialog` API | 내장 | 파일 선택 다이얼로그 |
| Electron `fs` | 내장 | 파일 복사/관리 |
| Next.js `<Image>` 또는 native `<img>` | 내장 | 이미지 렌더링 |
| HTML5 `<video>` | 내장 | 동영상 재생 |
| HTML5 `<iframe>` | 내장 | 웹페이지 표시 |
| 추가 npm 패키지 | 없음 | 외부 의존성 최소화 |

> 외부 npm 패키지 추가 없이 Electron/브라우저 내장 API만으로 구현 가능

---

## 10. Glossary

| 용어 | 정의 |
|------|------|
| Surround | NVIDIA 기술로 여러 모니터를 하나의 가상 디스플레이로 합침 |
| 통합 모드 | 동일 슬라이드 콘텐츠를 3패널에 복제하여 표시하는 방식 |
| 템플릿 타입 | 슬라이드의 콘텐츠 유형 (text/image/video/webpage) |
| IPC | Inter-Process Communication, Electron의 프로세스 간 통신 |
| preload | Electron의 보안 브리지 스크립트 |
