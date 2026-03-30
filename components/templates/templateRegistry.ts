// Design Ref: §3.2 — Template Registry pattern for extensible slide types
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
  label: string;
  icon: string;
  editor: ComponentType<EditorProps>;
  renderer: ComponentType<RendererProps>;
  defaultSlide: Partial<Slide>;
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
