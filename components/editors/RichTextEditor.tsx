'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { Color } from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import Underline from '@tiptap/extension-underline';
import { FontSizeTextStyle } from './fontSizeExtension';
import styles from './RichTextEditor.module.css';

const CANVAS_W = 5760;
const CANVAS_H = 1080;

const FONT_FAMILIES = [
  { label: '기본', value: 'sans-serif' },
  { label: '고딕', value: '"Malgun Gothic", "맑은 고딕", sans-serif' },
  { label: '명조', value: '"Batang", "바탕", serif' },
  { label: '모노', value: '"Consolas", monospace' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
];

import { FONT_DATA, calcVerticalPadding, detectFontSize as detectFontFromHTML } from './paddingUtils';

const FONT_SIZES = FONT_DATA.map(({ n, fs }) => ({
  value: `${fs}px`,
  label: `${fs}px (${n} Line${n > 1 ? 's' : ''})`,
}));

const COLORS = [
  '#ffffff', '#000000', '#ff0000', '#ff6600', '#ffcc00',
  '#00cc00', '#0066ff', '#9933ff', '#ff66cc', '#cccccc',
];

interface Props {
  /** Stable identifier for the active slide. Different slideId ⇒ force-load
   *  new content, even if the user is currently typing/composing. */
  slideId: string;
  content: string;
  backgroundColor?: string;
  onChange: (html: string) => void;
}

export default function RichTextEditor({ slideId, content, backgroundColor, onChange }: Props) {
  const prevContentRef = useRef(content);
  const prevSlideIdRef = useRef(slideId);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.15);
  // Forces re-render after setContent so the toolbar's editor.isActive(...)
  // / getAttributes(...) reads reflect the new slide's marks.
  const [, setRenderTick] = useState(0);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      FontSizeTextStyle,
      Color,
      FontFamily,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content,
    onUpdate: ({ editor: e }) => {
      const html = e.getHTML();
      prevContentRef.current = html;
      onChange(html);
    },
    onSelectionUpdate: () => {
      // Toolbar's button states depend on selection — re-render on every move.
      setRenderTick((n) => n + 1);
    },
  });

  // Sync editor content from props.
  //
  //   - Slide switch (slideId changed): always swap content even if focused —
  //     the user is no longer editing the previous slide.
  //   - Same slide, content drifted (SSE echo from another client) AND editor
  //     not focused / not composing: sync silently.
  //   - Same slide while user is editing: ignore prop changes. This is the
  //     fix for the Korean IME double-input bug — without it, the round-trip
  //     PUT → SSE → re-hydrate → setContent would interrupt composition.
  useEffect(() => {
    if (!editor) return;
    const slideChanged = slideId !== prevSlideIdRef.current;
    const contentDiff = content !== prevContentRef.current;

    if (slideChanged) {
      editor.commands.setContent(content, { emitUpdate: false });
      prevSlideIdRef.current = slideId;
      prevContentRef.current = content;
      setRenderTick((n) => n + 1); // refresh toolbar state for the new slide
      return;
    }
    if (!contentDiff) return;

    const composing = (editor.view as unknown as { composing?: boolean }).composing === true;
    if (editor.isFocused || composing) return;

    editor.commands.setContent(content, { emitUpdate: false });
    prevContentRef.current = content;
    setRenderTick((n) => n + 1);
  }, [slideId, content, editor]);

  // Calculate scale based on container width
  const updateScale = useCallback(() => {
    if (wrapperRef.current) {
      // Use parent's width (editor section) to avoid overflow measurement issues
      const parent = wrapperRef.current.parentElement;
      const containerWidth = parent ? parent.clientWidth : wrapperRef.current.clientWidth;
      setScale(containerWidth / CANVAS_W);
    }
  }, []);

  useEffect(() => {
    // Delay initial measurement to ensure layout is complete
    requestAnimationFrame(() => requestAnimationFrame(updateScale));
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [updateScale]);

  const currentFontSize = editor ? detectFontFromHTML(editor.getHTML()) : 68;
  const verticalPadding = calcVerticalPadding(currentFontSize);

  // Apply dynamic vertical padding to .tiptap element
  useEffect(() => {
    if (editor) {
      const el = editor.view.dom as HTMLElement;
      el.style.paddingTop = `${verticalPadding}px`;
      el.style.paddingBottom = `${verticalPadding}px`;
    }
  }, [editor, verticalPadding]);

  if (!editor) return null;

  const applyFontSize = (size: string) => {
    // 1) If user has a selection, apply the mark to that range.
    // 2) If no selection but the document already has text, select-all and apply.
    // 3) If the doc is empty, plain `setMark` doesn't paint anything; we have
    //    to seed `storedMarks` so the next typed character inherits the size.
    //    This fixes the "new slide ignores selected font, falls back to 68px"
    //    bug — without storedMarks, the empty selection drops the mark.
    const { from, to } = editor.state.selection;

    if (from !== to) {
      editor.chain().focus().setMark('textStyle', { fontSize: size }).run();
      return;
    }

    if (!editor.isEmpty) {
      editor.chain().focus().selectAll().setMark('textStyle', { fontSize: size }).run();
      // Restore caret to end so the next keystroke continues normally.
      editor.commands.focus('end');
    }

    // Seed storedMarks so future typing carries the chosen size.
    const view = editor.view;
    const textStyleType = view.state.schema.marks.textStyle;
    if (textStyleType) {
      const tr = view.state.tr.setStoredMarks([textStyleType.create({ fontSize: size })]);
      view.dispatch(tr);
    }
    editor.commands.focus();
  };

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <select
          className={styles.select}
          value={editor.getAttributes('textStyle').fontFamily ?? ''}
          onChange={(e) => {
            const { from, to } = editor.state.selection;
            const chain = from === to
              ? editor.chain().focus().selectAll()
              : editor.chain().focus();
            if (e.target.value) {
              chain.setFontFamily(e.target.value).run();
            } else {
              chain.unsetFontFamily().run();
            }
          }}
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>

        <select
          className={styles.select}
          value={editor.getAttributes('textStyle').fontSize ?? FONT_SIZES[FONT_SIZES.length - 1].value}
          onChange={(e) => applyFontSize(e.target.value)}
        >
          {FONT_SIZES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <div className={styles.divider} />

        <button
          className={`${styles.btn} ${editor.isActive('bold') ? styles.active : ''}`}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="굵게"
        >B</button>
        <button
          className={`${styles.btn} ${editor.isActive('italic') ? styles.active : ''}`}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="기울임"
          style={{ fontStyle: 'italic' }}
        >I</button>
        <button
          className={`${styles.btn} ${editor.isActive('underline') ? styles.active : ''}`}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="밑줄"
          style={{ textDecoration: 'underline' }}
        >U</button>
        <button
          className={`${styles.btn} ${editor.isActive('strike') ? styles.active : ''}`}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="취소선"
          style={{ textDecoration: 'line-through' }}
        >S</button>

        <div className={styles.divider} />

        <button
          className={`${styles.btn} ${editor.isActive({ textAlign: 'left' }) ? styles.active : ''}`}
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          title="왼쪽 정렬"
        >&equiv;</button>
        <button
          className={`${styles.btn} ${editor.isActive({ textAlign: 'center' }) ? styles.active : ''}`}
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          title="가운데 정렬"
        >&equiv;</button>
        <button
          className={`${styles.btn} ${editor.isActive({ textAlign: 'right' }) ? styles.active : ''}`}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          title="오른쪽 정렬"
        >&equiv;</button>

        <div className={styles.divider} />

        <div className={styles.colorGroup}>
          {COLORS.map((color) => (
            <button
              key={color}
              className={styles.colorBtn}
              style={{ backgroundColor: color }}
              onClick={() => editor.chain().focus().setColor(color).run()}
              title={color}
            />
          ))}
        </div>
      </div>

      {/* WYSIWYG Canvas — 5760x1080 scaled to editor panel width */}
      <div
        className={styles.canvasWrapper}
        style={{ height: CANVAS_H * scale, backgroundColor: backgroundColor ?? '#1a1a2e' }}
      >
        <div
          className={styles.canvas}
          style={{ transform: `scale(${scale})`, backgroundColor: backgroundColor ?? '#1a1a2e' }}
        >
          <EditorContent editor={editor} className={styles.editor} />
        </div>
      </div>
    </div>
  );
}
