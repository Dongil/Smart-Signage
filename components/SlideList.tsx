// Design Ref: §10.2 — SlideList with TemplateSelector integration
'use client';

import { useState } from 'react';
import { SlideType } from '@/types/slide';
import { useSignageStore } from '@/store/useSignageStore';
import { templateRegistry } from './templates/templateRegistry';
import TemplateSelector from './TemplateSelector';
import styles from './SlideList.module.css';

export default function SlideList() {
  const slides = useSignageStore((state) => state.slides);
  const currentSlideIndex = useSignageStore((state) => state.currentSlideIndex);
  const setCurrentSlideIndex = useSignageStore((state) => state.setCurrentSlideIndex);
  const addSlide = useSignageStore((state) => state.addSlide);
  const deleteSlide = useSignageStore((state) => state.deleteSlide);
  const reorderSlides = useSignageStore((state) => state.reorderSlides);

  const [showSelector, setShowSelector] = useState(false);

  const handleAddSlide = (type: SlideType) => {
    const template = templateRegistry.get(type);
    if (!template) return;
    addSlide({
      id: crypto.randomUUID(),
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

  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    const fromIndex = Number(e.dataTransfer.getData('text/plain'));
    if (fromIndex !== toIndex) {
      reorderSlides(fromIndex, toIndex);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <h2>슬라이드</h2>
        <button className={styles.addBtn} onClick={() => setShowSelector(true)}>+ 추가</button>
      </div>
      <ul className={styles.list}>
        {slides.map((slide, index) => {
          const template = templateRegistry.get(slide.type);
          return (
            <li
              key={slide.id}
              className={`${styles.item} ${index === currentSlideIndex ? styles.active : ''}`}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragOver={handleDragOver}
              onClick={() => setCurrentSlideIndex(index)}
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
      {showSelector && (
        <TemplateSelector
          onSelect={handleAddSlide}
          onClose={() => setShowSelector(false)}
        />
      )}
    </aside>
  );
}
