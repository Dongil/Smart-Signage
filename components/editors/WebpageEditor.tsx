// Design Ref: §4.5 — Webpage editor with URL input
'use client';

import { EditorProps } from '../templates/templateRegistry';
import BaseEditor from './BaseEditor';
import styles from './BaseEditor.module.css';

export default function WebpageEditor({ slide, onUpdate }: EditorProps) {
  return (
    <BaseEditor slide={slide} onUpdate={onUpdate}>
      <div className={styles.field}>
        <label htmlFor="webpage-url">URL</label>
        <input
          id="webpage-url"
          type="url"
          placeholder="https://example.com"
          value={slide.content}
          onChange={(e) => onUpdate({ content: e.target.value })}
        />
      </div>
      {slide.content && slide.content.startsWith('https://') && (
        <div style={{ borderRadius: 6, overflow: 'hidden', border: '1px solid #333' }}>
          <iframe
            src={slide.content}
            sandbox="allow-scripts allow-same-origin"
            referrerPolicy="no-referrer"
            title="웹페이지 미리보기"
            style={{ width: '100%', height: 200, border: 'none' }}
          />
        </div>
      )}
    </BaseEditor>
  );
}
