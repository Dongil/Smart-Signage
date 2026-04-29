'use client';

import { EditorProps } from '../templates/templateRegistry';
import BaseEditor from './BaseEditor';
import RichTextEditor from './RichTextEditor';

export default function TextEditor({ slide, onUpdate }: EditorProps) {
  return (
    <BaseEditor slide={slide} onUpdate={onUpdate}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 13, color: '#aaa', fontWeight: 500 }}>내용</label>
        <RichTextEditor
          slideId={slide.id}
          content={slide.content}
          backgroundColor={slide.backgroundColor}
          onChange={(html) => onUpdate({ content: html })}
        />
      </div>
    </BaseEditor>
  );
}
