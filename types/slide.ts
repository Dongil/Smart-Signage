export interface Slide {
  id: string;
  title: string;
  content: string;
  backgroundColor: string;
  duration: number;
}

export type SlideAction = 'add' | 'update' | 'delete' | 'reorder';
