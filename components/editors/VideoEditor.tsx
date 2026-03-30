// Design Ref: §4.4 — Video editor with playback options
'use client';

import { EditorProps } from '../templates/templateRegistry';
import BaseEditor from './BaseEditor';
import styles from './BaseEditor.module.css';

export default function VideoEditor({ slide, onUpdate }: EditorProps) {
  const handleSelectFile = async () => {
    const result = await window.electronAPI?.invoke('select-media-file', {
      filters: [{ name: 'Videos', extensions: ['mp4', 'webm', 'ogg'] }],
    });
    if (result) {
      const copied = await window.electronAPI?.invoke('copy-media-file', {
        sourcePath: result as string,
      });
      onUpdate({ mediaPath: copied as string });
    }
  };

  const toggleOption = (key: 'autoplay' | 'loop' | 'muted') => {
    onUpdate({
      mediaOptions: { ...slide.mediaOptions, [key]: !(slide.mediaOptions?.[key] ?? (key === 'muted')) },
    });
  };

  return (
    <BaseEditor slide={slide} onUpdate={onUpdate}>
      <div className={styles.field}>
        <label>동영상</label>
        <button
          onClick={handleSelectFile}
          style={{
            background: '#0f3460', color: '#eee', border: 'none',
            padding: '10px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
          }}
        >
          동영상 선택
        </button>
        {slide.mediaPath && (
          <video
            src={`media://${slide.mediaPath}`}
            controls
            muted
            style={{ maxHeight: 180, borderRadius: 6, marginTop: 8 }}
          />
        )}
      </div>
      <div className={styles.row}>
        <label style={{ fontSize: 13, color: '#aaa', display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={slide.mediaOptions?.autoplay ?? true} onChange={() => toggleOption('autoplay')} />
          자동재생
        </label>
        <label style={{ fontSize: 13, color: '#aaa', display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={slide.mediaOptions?.loop ?? false} onChange={() => toggleOption('loop')} />
          반복
        </label>
        <label style={{ fontSize: 13, color: '#aaa', display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={slide.mediaOptions?.muted ?? true} onChange={() => toggleOption('muted')} />
          음소거
        </label>
      </div>
      <div className={styles.field}>
        <label htmlFor="video-fit">영상 맞춤</label>
        <select
          id="video-fit"
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
