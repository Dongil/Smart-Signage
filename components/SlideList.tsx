// Design Ref: §10.2, §2.M4 — SlideList wired to API-backed store.
//
// v1.1 note: Image/Video/Webpage editors are scaffolded but not feature-
// complete; the TemplateSelector dialog is therefore bypassed and "+ 추가"
// always creates a text slide. Restore the selector once the other types
// are production-ready.

'use client';

import { useState } from 'react';
import { SlideType } from '@/types/slide';
import { useSignageStore } from '@/store/useSignageStore';
import { templateRegistry } from './templates/templateRegistry';
import HwpxImportModal from './import/HwpxImportModal';
import styles from './SlideList.module.css';

export default function SlideList() {
  const slides = useSignageStore((s) => s.slides);
  const editingIndex = useSignageStore((s) => s.editingIndex);
  const setEditingIndex = useSignageStore((s) => s.setEditingIndex);
  const addSlide = useSignageStore((s) => s.addSlide);
  const deleteSlide = useSignageStore((s) => s.deleteSlide);
  const reorderSlides = useSignageStore((s) => s.reorderSlides);

  const [showImport, setShowImport] = useState(false);

  const handleAddSlide = async (type: SlideType) => {
    const template = templateRegistry.get(type);
    if (!template) return;
    await addSlide({
      type,
      title: template.defaultSlide.title ?? `새 ${template.label} 슬라이드`,
      content: template.defaultSlide.content ?? '',
      backgroundColor: template.defaultSlide.backgroundColor ?? '#1a1a2e',
      duration: template.defaultSlide.duration ?? 5,
      mediaPath: template.defaultSlide.mediaPath,
      mediaOptions: template.defaultSlide.mediaOptions,
    });
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDrop = async (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    const fromIndex = Number(e.dataTransfer.getData('text/plain'));
    if (fromIndex === toIndex) return;
    const next = [...slides];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    await reorderSlides(next.map((s) => s.id));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <h2>슬라이드</h2>
        <div className={styles.headerActions}>
          <button
            className={styles.addBtn}
            onClick={() => handleAddSlide('text')}
            title="텍스트 슬라이드를 추가합니다 (이미지/동영상/웹은 v1.2 예정)"
          >
            + 추가
          </button>
          <button
            className={styles.importBtn}
            onClick={() => setShowImport(true)}
            title=".hwpx 문서를 슬라이드로 자동 분할하여 불러옵니다"
          >
            불러오기
          </button>
        </div>
      </div>
      <ul className={styles.list}>
        {slides.map((slide, index) => {
          const template = templateRegistry.get(slide.type);
          return (
            <li
              key={slide.id}
              className={`${styles.item} ${index === editingIndex ? styles.active : ''}`}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragOver={handleDragOver}
              onClick={() => setEditingIndex(index)}
            >
              <span className={styles.typeIcon}>{template?.icon ?? '?'}</span>
              <span
                className={styles.colorDot}
                style={{ backgroundColor: slide.backgroundColor }}
              />
              <span className={styles.title}>{slide.title || template?.label}</span>
              <button
                className={styles.deleteBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSlide(slide.id);
                }}
              >
                x
              </button>
            </li>
          );
        })}
      </ul>
      {showImport && <HwpxImportModal onClose={() => setShowImport(false)} />}
    </aside>
  );
}
