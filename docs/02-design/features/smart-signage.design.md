# Design: Smart Signage - 멀티 디스플레이 사이니지 제어 앱

> Created: 2026-03-25
> Feature: smart-signage
> Level: Dynamic
> Status: Design
> Architecture: Option B — Clean Architecture (Factory + Registry)

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

## 1. Overview

### 1.1 설계 목적
Plan 문서의 6개 모듈(M1~M6)을 Clean Architecture(Option B)로 구현하기 위한 상세 설계.
Factory + Registry 패턴을 적용하여 새로운 슬라이드 타입 추가 시 기존 코드 수정 없이 파일 추가만으로 확장 가능하도록 설계한다.

### 1.2 아키텍처 선택 근거
- **확장성 우선**: 향후 `clock`, `weather`, `rss`, `html` 등 타입 추가 예상
- **관심사 분리**: 편집(Editor) / 렌더링(Renderer) / 등록(Registry) 완전 분리
- **테스트 용이성**: 각 Editor/Renderer를 독립 단위로 테스트 가능

---

## 2. Data Model

### 2.1 Slide 타입 확장

```typescript
// types/slide.ts

export type SlideType = 'text' | 'image' | 'video' | 'webpage';

export interface MediaOptions {
  objectFit?: 'cover' | 'contain' | 'fill';
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
}

export interface Slide {
  id: string;
  type: SlideType;
  title: string;
  content: string;           // text: 본문, image/video: 설명, webpage: URL
  backgroundColor: string;
  duration: number;           // seconds
  mediaPath?: string;         // /data/media/ 내 파일 경로
  mediaOptions?: MediaOptions;
}

export type SlideAction = 'add' | 'update' | 'delete' | 'reorder';
```

### 2.2 하위 호환성
- `type` 필드가 없는 기존 슬라이드 데이터 → `'text'`로 자동 마이그레이션
- `loadFromFile` 시 `type` 없으면 기본값 `'text'` 할당

```typescript
// store 내 마이그레이션 로직
const migrateSlide = (slide: Partial<Slide>): Slide => ({
  ...slide,
  type: slide.type ?? 'text',
  mediaPath: slide.mediaPath ?? undefined,
  mediaOptions: slide.mediaOptions ?? undefined,
} as Slide);
```

---

## 3. Architecture — Template Registry Pattern

### 3.1 전체 구조

```
┌──────────────────────────────────────────────────────┐
│                  Template Registry                     │
│  ┌──────────────────────────────────────────────────┐ │
│  │ templateRegistry.ts                               │ │
│  │  register('text',   { editor, renderer, icon })   │ │
│  │  register('image',  { editor, renderer, icon })   │ │
│  │  register('video',  { editor, renderer, icon })   │ │
│  │  register('webpage',{ editor, renderer, icon })   │ │
│  └──────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────┤
│         Editor Side                Renderer Side       │
│  ┌──────────────────┐     ┌──────────────────────┐   │
│  │  EditorFactory    │     │  RendererFactory      │   │
│  │  registry.get(    │     │  registry.get(        │   │
│  │    slide.type     │     │    slide.type         │   │
│  │  ).editor         │     │  ).renderer           │   │
│  └──────────────────┘     └──────────────────────┘   │
│         ↓                          ↓                   │
│  ┌──────────────────┐     ┌──────────────────────┐   │
│  │ TextEditor        │     │ TextSlide             │   │
│  │ ImageEditor       │     │ ImageSlide            │   │
│  │ VideoEditor       │     │ VideoSlide            │   │
│  │ WebpageEditor     │     │ WebpageSlide          │   │
│  └──────────────────┘     └──────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

### 3.2 Registry 인터페이스

```typescript
// components/templates/templateRegistry.ts

import { ComponentType } from 'react';
import { SlideType, Slide } from '@/types/slide';

export interface EditorProps {
  slide: Slide;
  onUpdate: (updates: Partial<Slide>) => void;
}

export interface RendererProps {
  slide: Slide;
  onVideoEnd?: () => void;
}

export interface TemplateDefinition {
  type: SlideType;
  label: string;           // UI 표시명
  icon: string;            // 아이콘 문자 (emoji 또는 텍스트)
  editor: ComponentType<EditorProps>;
  renderer: ComponentType<RendererProps>;
  defaultSlide: Partial<Slide>;  // 신규 생성 시 기본값
}

class TemplateRegistry {
  private templates = new Map<SlideType, TemplateDefinition>();

  register(definition: TemplateDefinition): void {
    this.templates.set(definition.type, definition);
  }

  get(type: SlideType): TemplateDefinition | undefined {
    return this.templates.get(type);
  }

  getAll(): TemplateDefinition[] {
    return Array.from(this.templates.values());
  }

  getTypes(): SlideType[] {
    return Array.from(this.templates.keys());
  }
}

export const templateRegistry = new TemplateRegistry();
```

### 3.3 Factory 컴포넌트

```typescript
// components/editors/EditorFactory.tsx
import { templateRegistry, EditorProps } from '../templates/templateRegistry';
import { Slide } from '@/types/slide';

interface Props {
  slide: Slide;
  onUpdate: (updates: Partial<Slide>) => void;
}

export default function EditorFactory({ slide, onUpdate }: Props) {
  const template = templateRegistry.get(slide.type);
  if (!template) {
    return <p>알 수 없는 슬라이드 타입: {slide.type}</p>;
  }
  const Editor = template.editor;
  return <Editor slide={slide} onUpdate={onUpdate} />;
}
```

```typescript
// components/renderers/RendererFactory.tsx
import { templateRegistry, RendererProps } from '../templates/templateRegistry';
import { Slide } from '@/types/slide';

interface Props {
  slide: Slide;
  onVideoEnd?: () => void;
}

export default function RendererFactory({ slide, onVideoEnd }: Props) {
  const template = templateRegistry.get(slide.type);
  if (!template) return null;
  const Renderer = template.renderer;
  return <Renderer slide={slide} onVideoEnd={onVideoEnd} />;
}
```

---

## 4. Editor Components

### 4.1 BaseEditor (공통 필드)

```typescript
// components/editors/BaseEditor.tsx
// 공통 필드: title, backgroundColor, duration
// 각 타입 에디터에서 import하여 조합

interface BaseEditorProps {
  slide: Slide;
  onUpdate: (updates: Partial<Slide>) => void;
  children?: React.ReactNode;  // 타입별 추가 필드
}
```

### 4.2 타입별 에디터

| 파일 | 역할 | 주요 UI |
|------|------|---------|
| `TextEditor.tsx` | 텍스트 편집 | BaseEditor + textarea (content) |
| `ImageEditor.tsx` | 이미지 편집 | BaseEditor + 파일선택 버튼 + 이미지 미리보기 + objectFit 선택 |
| `VideoEditor.tsx` | 동영상 편집 | BaseEditor + 파일선택 + 비디오 미리보기 + autoplay/loop/muted 토글 |
| `WebpageEditor.tsx` | 웹페이지 편집 | BaseEditor + URL 입력 + iframe 미리보기 |

### 4.3 ImageEditor 상세

```typescript
// components/editors/ImageEditor.tsx
export default function ImageEditor({ slide, onUpdate }: EditorProps) {
  const handleSelectFile = async () => {
    const result = await window.electronAPI?.invoke('select-media-file', {
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
    });
    if (result) {
      const copied = await window.electronAPI?.invoke('copy-media-file', {
        sourcePath: result,
      });
      onUpdate({ mediaPath: copied as string });
    }
  };

  return (
    <BaseEditor slide={slide} onUpdate={onUpdate}>
      {/* 파일 선택 */}
      <button onClick={handleSelectFile}>이미지 선택</button>
      {/* 이미지 미리보기 */}
      {slide.mediaPath && <img src={`media://${slide.mediaPath}`} />}
      {/* objectFit 선택 */}
      <select
        value={slide.mediaOptions?.objectFit ?? 'cover'}
        onChange={(e) => onUpdate({
          mediaOptions: { ...slide.mediaOptions, objectFit: e.target.value as 'cover' | 'contain' | 'fill' }
        })}
      >
        <option value="cover">채우기 (Cover)</option>
        <option value="contain">맞추기 (Contain)</option>
        <option value="fill">늘리기 (Fill)</option>
      </select>
    </BaseEditor>
  );
}
```

### 4.4 VideoEditor 상세

```typescript
// components/editors/VideoEditor.tsx
// ImageEditor와 유사한 구조
// 추가 필드: autoplay, loop, muted 토글 스위치
// 비디오 미리보기: <video> 태그 (컨트롤 표시)
// 파일 필터: ['mp4', 'webm', 'ogg']
```

### 4.5 WebpageEditor 상세

```typescript
// components/editors/WebpageEditor.tsx
// URL 입력 필드 (content 필드에 저장)
// iframe 미리보기 (sandbox 적용)
// 로드 상태 표시 (loading/error/loaded)
```

---

## 5. Renderer Components

### 5.1 BaseRenderer (공통 패널 래퍼)

```typescript
// components/renderers/BaseRenderer.tsx
// 3패널 통합 모드 래퍼
// will-change: opacity + CSS transition 적용
// 각 Slide 렌더러를 children으로 받아 3번 복제

interface BaseRendererProps {
  slide: Slide;
  isVisible: boolean;
  children: React.ReactNode;
}

export default function BaseRenderer({ slide, isVisible, children }: BaseRendererProps) {
  return (
    <div className={styles.panels}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={styles.panel}
          style={{
            backgroundColor: slide.backgroundColor,
            opacity: isVisible ? 1 : 0,
          }}
        >
          {children}
        </div>
      ))}
    </div>
  );
}
```

### 5.2 타입별 렌더러

| 파일 | 렌더링 방식 | 핵심 구현 |
|------|------------|----------|
| `TextSlide.tsx` | `<h1>` + `<p>` | clamp 폰트 크기, 5760x1080 최적화 |
| `ImageSlide.tsx` | `<img>` | object-fit 동적 적용, lazy loading |
| `VideoSlide.tsx` | `<video>` | autoplay/loop/muted, `onEnded` → `onVideoEnd` 콜백 |
| `WebpageSlide.tsx` | `<iframe>` | sandbox="allow-scripts allow-same-origin", CSP |

### 5.3 ImageSlide 상세

```typescript
// components/renderers/ImageSlide.tsx
export default function ImageSlide({ slide }: RendererProps) {
  const mediaUrl = slide.mediaPath
    ? `media://${slide.mediaPath}`
    : '';

  return (
    <div className={styles.imageContainer}>
      {mediaUrl && (
        <img
          src={mediaUrl}
          alt={slide.title}
          style={{ objectFit: slide.mediaOptions?.objectFit ?? 'cover' }}
          className={styles.image}
        />
      )}
      {slide.title && <h1 className={styles.overlay}>{slide.title}</h1>}
    </div>
  );
}
```

### 5.4 VideoSlide 상세

```typescript
// components/renderers/VideoSlide.tsx
export default function VideoSlide({ slide, onVideoEnd }: RendererProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <video
      ref={videoRef}
      src={`media://${slide.mediaPath}`}
      autoPlay={slide.mediaOptions?.autoplay ?? true}
      loop={slide.mediaOptions?.loop ?? false}
      muted={slide.mediaOptions?.muted ?? true}
      onEnded={onVideoEnd}
      style={{ objectFit: slide.mediaOptions?.objectFit ?? 'cover' }}
      className={styles.video}
    />
  );
}
```

### 5.5 WebpageSlide 상세

```typescript
// components/renderers/WebpageSlide.tsx
export default function WebpageSlide({ slide }: RendererProps) {
  return (
    <iframe
      src={slide.content}
      sandbox="allow-scripts allow-same-origin"
      className={styles.iframe}
      title={slide.title}
    />
  );
}
```

---

## 6. File Management (Electron Main)

### 6.1 fileManager.ts

```typescript
// electron/fileManager.ts
import { app, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const MEDIA_DIR = path.join(app.getPath('userData'), 'data', 'media');

export function ensureMediaDir(): void {
  if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
  }
}

export async function selectMediaFile(
  filters: Electron.FileFilter[]
): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters,
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
}

export function copyMediaFile(sourcePath: string): string {
  ensureMediaDir();
  const ext = path.extname(sourcePath);
  const hash = crypto.randomUUID();
  const destName = `${hash}${ext}`;
  const destPath = path.join(MEDIA_DIR, destName);
  fs.copyFileSync(sourcePath, destPath);
  return destName; // 상대 파일명만 반환
}

export function getMediaAbsolutePath(fileName: string): string {
  return path.join(MEDIA_DIR, fileName);
}

export function getMediaDir(): string {
  return MEDIA_DIR;
}
```

### 6.2 IPC 핸들러 추가

```typescript
// electron/main.ts에 추가
import { selectMediaFile, copyMediaFile, getMediaAbsolutePath, getMediaDir } from './fileManager';

ipcMain.handle('select-media-file', async (_event, { filters }) => {
  return selectMediaFile(filters);
});

ipcMain.handle('copy-media-file', (_event, { sourcePath }) => {
  return copyMediaFile(sourcePath);
});

ipcMain.handle('get-media-path', (_event, { fileName }) => {
  return getMediaAbsolutePath(fileName);
});
```

### 6.3 Custom Protocol (미디어 로드)

```typescript
// electron/main.ts — app.whenReady() 내부
import { protocol } from 'electron';

protocol.registerFileProtocol('media', (request, callback) => {
  const fileName = request.url.replace('media://', '');
  const filePath = getMediaAbsolutePath(fileName);
  callback({ path: filePath });
});
```

### 6.4 Preload 채널 추가

```typescript
// electron/preload.ts — allowedChannels 확장
// invoke: ['get-displays', 'save-file', 'load-file', 'select-media-file', 'copy-media-file', 'get-media-path']
```

---

## 7. Template Registration

### 7.1 등록 엔트리 파일

```typescript
// components/templates/registerAll.ts
import { templateRegistry } from './templateRegistry';

// Editors
import TextEditor from '../editors/TextEditor';
import ImageEditor from '../editors/ImageEditor';
import VideoEditor from '../editors/VideoEditor';
import WebpageEditor from '../editors/WebpageEditor';

// Renderers
import TextSlide from '../renderers/TextSlide';
import ImageSlide from '../renderers/ImageSlide';
import VideoSlide from '../renderers/VideoSlide';
import WebpageSlide from '../renderers/WebpageSlide';

templateRegistry.register({
  type: 'text',
  label: '텍스트',
  icon: 'T',
  editor: TextEditor,
  renderer: TextSlide,
  defaultSlide: {
    type: 'text',
    title: '새 텍스트 슬라이드',
    content: '',
    backgroundColor: '#1a1a2e',
    duration: 5,
  },
});

templateRegistry.register({
  type: 'image',
  label: '이미지',
  icon: 'I',
  editor: ImageEditor,
  renderer: ImageSlide,
  defaultSlide: {
    type: 'image',
    title: '',
    content: '',
    backgroundColor: '#000000',
    duration: 5,
    mediaOptions: { objectFit: 'cover' },
  },
});

templateRegistry.register({
  type: 'video',
  label: '동영상',
  icon: 'V',
  editor: VideoEditor,
  renderer: VideoSlide,
  defaultSlide: {
    type: 'video',
    title: '',
    content: '',
    backgroundColor: '#000000',
    duration: 30,
    mediaOptions: { autoplay: true, loop: false, muted: true, objectFit: 'cover' },
  },
});

templateRegistry.register({
  type: 'webpage',
  label: '웹페이지',
  icon: 'W',
  editor: WebpageEditor,
  renderer: WebpageSlide,
  defaultSlide: {
    type: 'webpage',
    title: '웹페이지',
    content: 'https://',
    backgroundColor: '#ffffff',
    duration: 30,
  },
});
```

### 7.2 초기화 위치

```typescript
// app/layout.tsx 에서 import
import '@/components/templates/registerAll';
```

---

## 8. Template Selector UI

### 8.1 TemplateSelector 컴포넌트

```typescript
// components/TemplateSelector.tsx
// SlideList의 "+ 추가" 버튼 클릭 시 표시되는 모달/드롭다운
// templateRegistry.getAll()로 등록된 모든 타입 표시
// 선택 시 defaultSlide 기반으로 새 슬라이드 생성

interface Props {
  onSelect: (type: SlideType) => void;
  onClose: () => void;
}

export default function TemplateSelector({ onSelect, onClose }: Props) {
  const templates = templateRegistry.getAll();

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h3>슬라이드 타입 선택</h3>
        <div className={styles.grid}>
          {templates.map((t) => (
            <button key={t.type} onClick={() => { onSelect(t.type); onClose(); }}>
              <span className={styles.icon}>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

---

## 9. SignageRenderer 변경

### 9.1 RendererFactory 통합

```typescript
// components/SignageRenderer.tsx (변경)
// 기존: 인라인 <h1> + <p> 렌더링
// 변경: RendererFactory를 BaseRenderer로 감싸서 렌더링

export default function SignageRenderer() {
  // ... (기존 상태 관리 유지)

  return (
    <div className={styles.container}>
      <BaseRenderer slide={currentSlide} isVisible={isVisible}>
        <RendererFactory
          slide={currentSlide}
          onVideoEnd={handleVideoEnd}
        />
      </BaseRenderer>
    </div>
  );
}
```

### 9.2 동영상 종료 시 슬라이드 전환

```typescript
const handleVideoEnd = useCallback(() => {
  // 동영상 종료 → 다음 슬라이드로 자동 전환
  if (slides.length > 1) {
    setIsVisible(false);
    setTimeout(() => {
      setActiveIndex((prev) => (prev + 1) % slides.length);
      setIsVisible(true);
    }, 500);
  }
}, [slides.length]);
```

---

## 10. State Management Changes

### 10.1 Store 수정 사항

```typescript
// store/useSignageStore.ts 변경 사항

// addSlide: 기존과 동일, type 필드 포함된 Slide 객체 받음
// updateSlide: 기존과 동일
// loadFromFile: 마이그레이션 로직 추가 (type 없으면 'text')
// saveToFile: 기존과 동일 (type 포함하여 저장)
```

### 10.2 SlideList 변경

```typescript
// components/SlideList.tsx 변경
// handleAdd: TemplateSelector 모달 열기 → 타입 선택 → defaultSlide 기반 생성
// 슬라이드 항목에 타입 아이콘 표시
```

---

## 11. Implementation Guide

### 11.1 File Map

| # | 파일 경로 | 동작 | 모듈 |
|---|----------|------|------|
| 1 | `types/slide.ts` | 수정 | M1 |
| 2 | `store/useSignageStore.ts` | 수정 | M1 |
| 3 | `electron/fileManager.ts` | 신규 | M2 |
| 4 | `electron/main.ts` | 수정 | M2 |
| 5 | `electron/preload.ts` | 수정 | M2 |
| 6 | `components/templates/templateRegistry.ts` | 신규 | M3 |
| 7 | `components/templates/registerAll.ts` | 신규 | M3 |
| 8 | `components/editors/BaseEditor.tsx` | 신규 | M3 |
| 9 | `components/editors/BaseEditor.module.css` | 신규 | M3 |
| 10 | `components/editors/TextEditor.tsx` | 신규 | M3 |
| 11 | `components/editors/ImageEditor.tsx` | 신규 | M3 |
| 12 | `components/editors/VideoEditor.tsx` | 신규 | M3 |
| 13 | `components/editors/WebpageEditor.tsx` | 신규 | M3 |
| 14 | `components/editors/EditorFactory.tsx` | 신규 | M3 |
| 15 | `components/TemplateSelector.tsx` | 신규 | M3 |
| 16 | `components/TemplateSelector.module.css` | 신규 | M3 |
| 17 | `components/SlideEditor.tsx` | 수정 | M3 |
| 18 | `components/SlideList.tsx` | 수정 | M3 |
| 19 | `components/renderers/BaseRenderer.tsx` | 신규 | M5 |
| 20 | `components/renderers/TextSlide.tsx` | 신규 | M5 |
| 21 | `components/renderers/TextSlide.module.css` | 신규 | M5 |
| 22 | `components/renderers/ImageSlide.tsx` | 신규 | M5 |
| 23 | `components/renderers/ImageSlide.module.css` | 신규 | M5 |
| 24 | `components/renderers/VideoSlide.tsx` | 신규 | M5 |
| 25 | `components/renderers/VideoSlide.module.css` | 신규 | M5 |
| 26 | `components/renderers/WebpageSlide.tsx` | 신규 | M5 |
| 27 | `components/renderers/WebpageSlide.module.css` | 신규 | M5 |
| 28 | `components/renderers/RendererFactory.tsx` | 신규 | M5 |
| 29 | `components/SignageRenderer.tsx` | 수정 | M5/M6 |
| 30 | `components/Preview.tsx` | 수정 | M4 |
| 31 | `components/Toolbar.tsx` | 수정 | M6 |
| 32 | `app/layout.tsx` | 수정 | M3 |
| 33 | `types/electron.d.ts` | 수정 | M2 |

**합계**: 신규 21개 / 수정 12개 = 33개 파일

### 11.2 Implementation Order

```
Phase 1: Foundation
  1. types/slide.ts (타입 확장)
  2. store/useSignageStore.ts (마이그레이션 + type 지원)
  3. electron/fileManager.ts (파일 관리)
  4. electron/main.ts (IPC + protocol)
  5. electron/preload.ts (채널 추가)
  6. types/electron.d.ts (타입 업데이트)

Phase 2: Registry + Factory
  7. components/templates/templateRegistry.ts
  8. components/editors/BaseEditor.tsx + CSS
  9. components/editors/TextEditor.tsx
  10. components/editors/ImageEditor.tsx
  11. components/editors/VideoEditor.tsx
  12. components/editors/WebpageEditor.tsx
  13. components/editors/EditorFactory.tsx
  14. components/renderers/BaseRenderer.tsx
  15. components/renderers/TextSlide.tsx + CSS
  16. components/renderers/ImageSlide.tsx + CSS
  17. components/renderers/VideoSlide.tsx + CSS
  18. components/renderers/WebpageSlide.tsx + CSS
  19. components/renderers/RendererFactory.tsx
  20. components/templates/registerAll.ts

Phase 3: Integration
  21. components/TemplateSelector.tsx + CSS
  22. components/SlideEditor.tsx (EditorFactory 위임)
  23. components/SlideList.tsx (TemplateSelector 연동)
  24. components/Preview.tsx (RendererFactory 활용)
  25. components/SignageRenderer.tsx (RendererFactory + BaseRenderer)
  26. components/Toolbar.tsx (슬라이드쇼 제어)
  27. app/layout.tsx (registerAll import)
```

### 11.3 Session Guide

| Session | Scope Key | 모듈 | 파일 | 예상 규모 |
|---------|-----------|------|------|----------|
| S1 | `foundation` | M1 + M2 | #1~#6 | ~300 lines |
| S2 | `registry` | M3 (Registry + Factory + Base) | #7~#8, #13~#14, #19~#20 | ~400 lines |
| S3 | `editors` | M3 (4종 에디터) | #9~#12, #15~#16, #21~#22 | ~500 lines |
| S4 | `renderers` | M5 (4종 렌더러 + Base) | #14~#19 | ~400 lines |
| S5 | `integration` | M4 + M6 (미리보기 + 슬라이드쇼 + 연결) | #23~#27 | ~400 lines |

**사용법**: `/pdca do smart-signage --scope foundation`

---

## 12. Security Considerations

### 12.1 IPC 보안
- `preload.ts`의 채널 화이트리스트에만 새 채널 추가
- 파일 경로 검증: `fileManager.ts`에서 `MEDIA_DIR` 외부 접근 차단

### 12.2 iframe 보안 (WebpageSlide)
- `sandbox="allow-scripts allow-same-origin"` 필수 적용
- `allow-top-navigation` 제외 (부모 창 탈취 방지)
- `referrerPolicy="no-referrer"` 적용

### 12.3 파일 접근
- `protocol.registerFileProtocol('media', ...)` — `MEDIA_DIR` 내부만 허용
- 파일명을 UUID로 생성하여 경로 추측 방지

---

## 13. Performance Considerations

### 13.1 동영상 렌더링
- 3패널 × 1개 `<video>` 태그 = 3개 동시 재생
- `will-change: opacity` 로 GPU 가속 전환
- 동영상은 `muted` 기본 (자동재생 정책 준수)

### 13.2 이미지 최적화
- 패널 크기(1920x1080)보다 큰 이미지 → CSS `object-fit`으로 처리
- 프리로딩: 다음 슬라이드 이미지를 미리 `<link rel="preload">`

### 13.3 메모리 관리
- iframe: 슬라이드 전환 시 이전 iframe 완전 언마운트
- video: `src` 비우기 + `load()` 호출하여 버퍼 해제
