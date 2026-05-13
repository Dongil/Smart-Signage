// Design Ref: §2 — SlideType 확장 with Clean Architecture (Option B)
// signage-mode §3.5.1 — `mode` partitions slides into independent collections
// for surround (5760×h) and individual (1920×h, tiled) output.

export type SlideType = 'text' | 'image' | 'video' | 'webpage';

export type SignageMode = 'surround' | 'individual';

export interface MediaOptions {
  objectFit?: 'cover' | 'contain' | 'fill';
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
}

export interface Slide {
  id: string;
  type: SlideType;
  mode: SignageMode;
  title: string;
  content: string;
  backgroundColor: string;
  duration: number;
  mediaPath?: string;
  mediaOptions?: MediaOptions;
}

export type SlideAction = 'add' | 'update' | 'delete' | 'reorder';
