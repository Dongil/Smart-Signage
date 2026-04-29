// Design Ref: §2.M6, FR-05-4..7 — Group ParsedBlocks into N-block slides
// and produce ready-to-create slide payloads (HTML content + style hints).
//
// Why "N blocks per slide" and not "N visible lines": HWPX paragraphs are the
// natural editorial unit — one paragraph = one logical line in the source
// document. Counting reflowed visible lines on a 5760×1080 banner adds noise
// (font ratio, weight, language) without improving editor UX. The user can
// still raise/lower N until the layout fits.

import type { ParsedBlock } from '@/lib/api/import';

const DEFAULT_FONT_SIZE = 68; // matches RichTextEditor min step
const DEFAULT_ALIGN = 'left';

export interface PreviewSlide {
  blocks: ParsedBlock[];
  /** TipTap-compatible HTML preserving inline styles. */
  contentHtml: string;
  /** First non-default font size encountered, used as the slide hint. */
  representativeFontSize: number;
}

export function chunkBlocks(blocks: ParsedBlock[], linesPerSlide: number): ParsedBlock[][] {
  const n = Math.max(1, Math.floor(linesPerSlide));
  const out: ParsedBlock[][] = [];
  for (let i = 0; i < blocks.length; i += n) {
    out.push(blocks.slice(i, i + n));
  }
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderBlockHtml(block: ParsedBlock): string {
  const align = block.align ?? DEFAULT_ALIGN;
  const fs = block.fontSize ?? DEFAULT_FONT_SIZE;

  const styles: string[] = [];
  styles.push(`text-align: ${align}`);
  // Inline font-size: matches the spans TipTap emits for size.
  let inner = `<span style="font-size: ${fs}px">${escapeHtml(block.text)}</span>`;
  if (block.bold) inner = `<strong>${inner}</strong>`;
  if (block.italic) inner = `<em>${inner}</em>`;

  return `<p style="${styles.join('; ')}">${inner}</p>`;
}

export function buildPreviewSlide(blocks: ParsedBlock[]): PreviewSlide {
  if (blocks.length === 0) {
    return { blocks: [], contentHtml: '<p></p>', representativeFontSize: DEFAULT_FONT_SIZE };
  }
  const contentHtml = blocks.map(renderBlockHtml).join('');
  const repFontSize =
    blocks.find((b) => typeof b.fontSize === 'number')?.fontSize ?? DEFAULT_FONT_SIZE;
  return { blocks, contentHtml, representativeFontSize: repFontSize };
}

export function splitIntoPreviewSlides(
  blocks: ParsedBlock[],
  linesPerSlide: number
): PreviewSlide[] {
  return chunkBlocks(blocks, linesPerSlide).map(buildPreviewSlide);
}
