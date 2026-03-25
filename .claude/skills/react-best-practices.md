---
name: react-best-practices
description: React/Next.js best practices for Electron + Zustand digital signage app. Covers component patterns, performance, state management, and TypeScript conventions.
user_invocable: true
triggers:
  - react best practices
  - 리액트 베스트 프랙티스
  - react patterns
  - component best practices
  - react performance
  - react conventions
---

# React Best Practices — Digital Signage App

You are a React/Next.js expert assistant. When this skill is invoked, review the current code or task against the following best practices and provide actionable guidance.

## 1. Component Architecture

### File & Naming Conventions
- **Components**: PascalCase (`SlideEditor.tsx`, `SignageRenderer.tsx`)
- **Hooks**: camelCase with `use` prefix (`useSignageStore.ts`, `useDisplayDetect.ts`)
- **Utils/helpers**: camelCase (`formatDuration.ts`)
- Place components in `/components`, pages in `/app`
- One component per file. Co-locate sub-components only if tightly coupled.

### Component Design
- Prefer **functional components** with hooks — no class components.
- Keep components **small and focused** (under ~150 lines). Extract when logic grows.
- Use **composition over prop drilling** — pass children or use Zustand for shared state.
- Separate **presentational** (UI-only) vs **container** (data/logic) components.

```tsx
// Good: Small, focused presentational component
interface SlideCardProps {
  title: string;
  backgroundColor: string;
  isActive: boolean;
  onClick: () => void;
}

const SlideCard = ({ title, backgroundColor, isActive, onClick }: SlideCardProps) => (
  <div
    className={`slide-card ${isActive ? 'active' : ''}`}
    style={{ backgroundColor }}
    onClick={onClick}
  >
    <h3>{title}</h3>
  </div>
);
```

## 2. TypeScript Conventions

- **No `any` type** — use proper interfaces/types.
- Define **shared types** in a `/types` folder or co-locate with relevant store/component.
- Use `interface` for object shapes, `type` for unions/intersections.
- Export types that are used across multiple files.

```tsx
// types/slide.ts
export interface Slide {
  id: string;
  title: string;
  content: string;
  backgroundColor: string;
  duration: number; // seconds
}

export type SlideAction = 'add' | 'update' | 'delete' | 'reorder';
```

## 3. State Management (Zustand)

- Keep **one store per domain** (`useSignageStore` for slides).
- Use **selectors** to avoid unnecessary re-renders.
- Keep store **actions inside the store**, not in components.
- Use `immer` middleware for complex nested state updates.

```tsx
// Good: Selective subscription
const currentSlide = useSignageStore((state) => state.slides[state.currentSlideIndex]);

// Bad: Subscribes to entire store
const store = useSignageStore();
```

## 4. Performance Optimization

### Memoization
- Use `React.memo()` for components that receive **stable props** but re-render due to parent.
- Use `useMemo` for **expensive computations** only — not for simple values.
- Use `useCallback` for **callbacks passed to memoized children** or used in dependency arrays.
- Do NOT over-memoize — profile first with React DevTools.

### Signage Renderer (Critical Path)
- The signage output window runs fullscreen on Surround display — **performance matters**.
- Use `will-change: transform` for slide transition animations.
- Prefer CSS animations/transitions over JS-driven animation.
- Use `requestAnimationFrame` for any custom animation logic.
- Avoid layout thrashing — batch DOM reads and writes.

```tsx
// Good: CSS-based fade transition for signage
const SlideTransition = ({ slide, isVisible }: { slide: Slide; isVisible: boolean }) => (
  <div
    style={{
      opacity: isVisible ? 1 : 0,
      transition: 'opacity 0.5s ease-in-out',
      backgroundColor: slide.backgroundColor,
    }}
  >
    <h1>{slide.title}</h1>
    <p>{slide.content}</p>
  </div>
);
```

## 5. Electron IPC Integration

- **Never use `ipcRenderer` directly in components** — use the preload bridge (`window.electronAPI`).
- Wrap IPC calls in **custom hooks** for reusability and testability.
- Use **kebab-case** for IPC channel names (`show-on-signage`, `toggle-fullscreen`).
- Clean up IPC listeners in `useEffect` cleanup.

```tsx
// hooks/useElectronIPC.ts
export const useSignageIPC = () => {
  const sendToSignage = useCallback((slideData: Slide) => {
    window.electronAPI?.send('show-on-signage', slideData);
  }, []);

  const toggleFullscreen = useCallback(() => {
    window.electronAPI?.send('toggle-fullscreen');
  }, []);

  return { sendToSignage, toggleFullscreen };
};
```

## 6. Event Handling & Effects

- Use `useEffect` sparingly — prefer event handlers for user actions.
- Always include a **cleanup function** for subscriptions, timers, and listeners.
- Keep **dependency arrays accurate** — never suppress ESLint warnings.

```tsx
// Good: Timer with proper cleanup for auto-slideshow
useEffect(() => {
  if (!isPlaying) return;

  const timer = setInterval(() => {
    nextSlide();
  }, currentSlide.duration * 1000);

  return () => clearInterval(timer);
}, [isPlaying, currentSlide.duration, nextSlide]);
```

## 7. Styling

- Use **CSS Modules** or **Tailwind CSS** — avoid inline styles except for dynamic values (e.g., `backgroundColor` from data).
- For the signage renderer, use **viewport-relative units** (`vw`, `vh`) for Surround layout (5760x1080 or 3840x1080).
- Use CSS Grid for the 3-panel Surround layout.

```css
/* Surround 3-panel layout */
.signage-container {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  width: 100vw;
  height: 100vh;
}
```

## 8. Error Handling

- Use **Error Boundaries** for component-level error isolation (especially signage renderer).
- Handle IPC communication failures gracefully.
- Show user-friendly error states, not raw error messages.

## 9. Code Review Checklist

When reviewing React code in this project, check for:

- [ ] No `any` types
- [ ] Components under 150 lines
- [ ] Zustand selectors used (not full store subscription)
- [ ] IPC via preload bridge, not direct `ipcRenderer`
- [ ] Effects have proper cleanup
- [ ] IPC channels use kebab-case
- [ ] Signage renderer uses CSS transitions (not JS animation)
- [ ] Proper TypeScript interfaces for all props
