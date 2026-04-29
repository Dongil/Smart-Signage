// Design Ref: §2.M6, FR-05 — Modal: pick file → adjust N → confirm import.
//
// Flow:
//  1. User picks .hwpx file → server parses → blocks[] returned.
//  2. Local splitIntoPreviewSlides(blocks, N) renders the slide list.
//  3. User adjusts N (3/4/5/6/7/8 or arbitrary number) and re-renders.
//  4. "불러오기" → for each preview slide, POST /api/slides; modal closes.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { importApi, type ParsedBlock } from '@/lib/api/import';
import { splitIntoPreviewSlides } from '@/lib/hwpx/splitByLines';
import { useSignageStore } from '@/store/useSignageStore';
import HwpxPreviewSlide from './HwpxPreviewSlide';
import LineCountControl from './LineCountControl';
import styles from './HwpxImport.module.css';

interface Props {
  onClose: () => void;
}

const DEFAULT_LINES_PER_SLIDE = 5;
const DEFAULT_DURATION_SECONDS = 8;

export default function HwpxImportModal({ onClose }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<ParsedBlock[]>([]);
  const [linesPerSlide, setLinesPerSlide] = useState(DEFAULT_LINES_PER_SLIDE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const addSlide = useSignageStore((s) => s.addSlide);

  const previewSlides = useMemo(
    () => splitIntoPreviewSlides(blocks, linesPerSlide),
    [blocks, linesPerSlide]
  );

  const handleFileSelect = useCallback(async (file: File) => {
    setError(null);
    setLoading(true);
    setBlocks([]);
    setFileName(file.name);
    try {
      const result = await importApi.hwpx(file);
      if (!result.blocks || result.blocks.length === 0) {
        setError('문서에서 텍스트를 찾을 수 없습니다.');
      } else {
        setBlocks(result.blocks);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '파싱 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFileSelect(f);
  };

  const handleImport = async () => {
    if (previewSlides.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      const baseTitle = (fileName ?? '문서').replace(/\.hwpx$/i, '');
      for (let i = 0; i < previewSlides.length; i += 1) {
        const ps = previewSlides[i];
        await addSlide({
          type: 'text',
          title: `${baseTitle} ${i + 1}`,
          content: ps.contentHtml,
          duration: DEFAULT_DURATION_SECONDS,
          backgroundColor: '#1a1a2e',
        });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패');
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const hasFile = blocks.length > 0;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <h3 className={styles.title}>한글 문서(.hwpx) 불러오기</h3>
          <button className={styles.closeBtn} onClick={onClose}>
            ×
          </button>
        </header>

        <section className={styles.controlsBar}>
          <button
            type="button"
            className={styles.fileBtn}
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || importing}
          >
            {fileName ? `다른 파일 선택` : `.hwpx 파일 선택`}
          </button>
          {fileName && (
            <span className={styles.fileMeta} title={fileName}>
              {fileName}
            </span>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".hwpx,application/octet-stream"
            style={{ display: 'none' }}
            onChange={onPick}
          />

          <div className={styles.spacer} />

          {hasFile && (
            <LineCountControl value={linesPerSlide} onChange={setLinesPerSlide} />
          )}
        </section>

        {error && <div className={styles.error}>{error}</div>}

        {loading && <div className={styles.status}>문서를 분석 중...</div>}

        {!loading && hasFile && (
          <section className={styles.summary}>
            전체 {blocks.length}줄 → 슬라이드 {previewSlides.length}장
          </section>
        )}

        <section className={styles.previewList}>
          {!loading && hasFile &&
            previewSlides.map((slide, idx) => (
              <HwpxPreviewSlide
                key={idx}
                index={idx}
                total={previewSlides.length}
                slide={slide}
              />
            ))}
          {!loading && !hasFile && !error && (
            <p className={styles.placeholder}>
              .hwpx 파일을 선택하면 미리보기가 여기에 나타납니다.
            </p>
          )}
        </section>

        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={onClose}
            disabled={importing}
          >
            취소
          </button>
          <button
            type="button"
            className={styles.confirmBtn}
            onClick={handleImport}
            disabled={!hasFile || importing}
          >
            {importing
              ? '불러오는 중...'
              : `슬라이드 ${previewSlides.length}장 추가`}
          </button>
        </footer>
      </div>
    </div>
  );
}
