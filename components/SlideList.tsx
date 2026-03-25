'use client';

import { useSignageStore } from '@/store/useSignageStore';
import styles from './SlideList.module.css';

export default function SlideList() {
  const slides = useSignageStore((state) => state.slides);
  const currentSlideIndex = useSignageStore((state) => state.currentSlideIndex);
  const setCurrentSlideIndex = useSignageStore((state) => state.setCurrentSlideIndex);
  const addSlide = useSignageStore((state) => state.addSlide);
  const deleteSlide = useSignageStore((state) => state.deleteSlide);
  const reorderSlides = useSignageStore((state) => state.reorderSlides);

  const handleAdd = () => {
    addSlide({
      id: crypto.randomUUID(),
      title: `슬라이드 ${slides.length + 1}`,
      content: '',
      backgroundColor: '#1a1a2e',
      duration: 5,
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
        <button className={styles.addBtn} onClick={handleAdd}>+ 추가</button>
      </div>
      <ul className={styles.list}>
        {slides.map((slide, index) => (
          <li
            key={slide.id}
            className={`${styles.item} ${index === currentSlideIndex ? styles.active : ''}`}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onDragOver={handleDragOver}
            onClick={() => setCurrentSlideIndex(index)}
          >
            <span
              className={styles.colorDot}
              style={{ backgroundColor: slide.backgroundColor }}
            />
            <span className={styles.title}>{slide.title}</span>
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
        ))}
      </ul>
    </aside>
  );
}
