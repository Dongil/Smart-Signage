// Design Ref: §10.2, §2.M4 — SlideList wired to API-backed store.
// signage-mode §3.5.4 — filters visible slides by current signage mode so
// each mode acts as an independent collection. Resets editingIndex when the
// mode flips and shows a guided empty state for the new mode.
//
// v1.1 note: Image/Video/Webpage editors are scaffolded but not feature-
// complete; the TemplateSelector dialog is therefore bypassed and "+ 추가"
// always creates a text slide. Restore the selector once the other types
// are production-ready.

'use client';

import { useEffect, useMemo, useState } from 'react';
import { SlideType, type SignageMode } from '@/types/slide';
import { useSignageStore } from '@/store/useSignageStore';
import { useOption } from '@/hooks/useOption';
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
  const mode = useOption<SignageMode>('signage.mode');

  const [showImport, setShowImport] = useState(false);
  const hwpxDisabled = mode === 'individual';

  // signage-mode §3.5.4 — `slides` holds rows for every mode. We surface
  // only the current mode's rows so the user can act on them by relative
  // index. The store's editingIndex is reused as "index within the current
  // mode" — it is reset to 0 below whenever the mode flips.
  const visibleSlides = useMemo(
    () => slides.filter((s) => s.mode === mode),
    [slides, mode]
  );

  useEffect(() => {
    if (editingIndex >= visibleSlides.length) {
      setEditingIndex(Math.max(0, visibleSlides.length - 1));
    }
  }, [mode, visibleSlides.length, editingIndex, setEditingIndex]);

  const handleAddSlide = async (type: SlideType) => {
    const template = templateRegistry.get(type);
    if (!template) return;
    // Store.addSlide auto-fills `mode` from the current option, so the new
    // slide always lands in the same collection the user is viewing.
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
    // reorder happens within visibleSlides only; the store rebuilds the
    // global slides[] preserving the other-mode order on its own.
    const next = [...visibleSlides];
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
            title="텍스트 슬라이드를 추가합니다"
          >
            + 추가
          </button>
          <button
            className={styles.importBtn}
            onClick={() => setShowImport(true)}
            disabled={hwpxDisabled}
            title={
              hwpxDisabled
                ? 'HWPX 임포트는 서라운드 모드에서만 사용 가능합니다'
                : '.hwpx 문서를 슬라이드로 자동 분할하여 불러옵니다'
            }
          >
            불러오기
          </button>
        </div>
      </div>
      {visibleSlides.length === 0 ? (
        <div className={styles.empty}>
          <p>이 모드에 슬라이드가 없습니다.</p>
          <p className={styles.emptyHint}>"+ 추가"를 눌러 시작하세요.</p>
        </div>
      ) : (
        <ul className={styles.list}>
          {visibleSlides.map((slide, index) => {
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
      )}
      {showImport && !hwpxDisabled && (
        <HwpxImportModal onClose={() => setShowImport(false)} />
      )}
    </aside>
  );
}
