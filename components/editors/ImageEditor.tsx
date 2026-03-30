// Design Ref: §4.3 — Image editor with file selection and objectFit
'use client';

import { EditorProps } from '../templates/templateRegistry';
import BaseEditor from './BaseEditor';
import styles from './BaseEditor.module.css';

export default function ImageEditor({ slide, onUpdate }: EditorProps) {
  const handleSelectFile = async () => {
    const result = await window.electronAPI?.invoke('select-media-file', {
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
    });
    if (result) {
      const copied = await window.electronAPI?.invoke('copy-media-file', {
        sourcePath: result as string,
      });
      onUpdate({ mediaPath: copied as string });
    }
  };

  return (
    <BaseEditor slide={slide} onUpdate={onUpdate}>
      <div className={styles.field}>
        <label>이미지</label>
        <button
          onClick={handleSelectFile}
          style={{
            background: '#0f3460', color: '#eee', border: 'none',
            padding: '10px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
          }}
        >
          이미지 선택
        </button>
        {slide.mediaPath && (
          <img
            src={`media://${slide.mediaPath}`}
            alt="미리보기"
            style={{ maxHeight: 200, borderRadius: 6, marginTop: 8, objectFit: 'contain' }}
          />
        )}
      </div>
      <div className={styles.field}>
        <label htmlFor="image-fit">이미지 맞춤</label>
        <select
          id="image-fit"
          value={slide.mediaOptions?.objectFit ?? 'cover'}
          onChange={(e) => onUpdate({
            mediaOptions: { ...slide.mediaOptions, objectFit: e.target.value as 'cover' | 'contain' | 'fill' },
          })}
        >
          <option value="cover">채우기 (Cover)</option>
          <option value="contain">맞추기 (Contain)</option>
          <option value="fill">늘리기 (Fill)</option>
        </select>
      </div>
    </BaseEditor>
  );
}
