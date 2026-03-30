// Design Ref: §2 — SlideType 확장 with Clean Architecture (Option B)

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
  content: string;
  backgroundColor: string;
  duration: number;
  mediaPath?: string;
  mediaOptions?: MediaOptions;
}

export type SlideAction = 'add' | 'update' | 'delete' | 'reorder';
