// Shared padding calculation for editor and renderer
// Display: 5760x1080, line-height: 1.4
//
// Strategy:
// - 1 Line: text = 2/3 of 1080 = 720px → fontSize = 720/1.4 = 514px, pad = 180px
// - 10 Lines: fontSize = 68px, pad = 64px (unchanged)
// - Middle: padding linearly interpolated, fontSize = (1080 - 2*pad) / (N*1.4)

const LINE_HEIGHT = 1.4;
const DISPLAY_H = 1080;
const MAX_PAD = 180; // 1 line
const MIN_PAD = 64;  // 10 lines

export interface FontEntry {
  n: number;
  fs: number;
  pad: number;
}

function buildFontData(): FontEntry[] {
  const data: FontEntry[] = [];
  for (let n = 1; n <= 10; n++) {
    const pad = Math.round(MAX_PAD - (MAX_PAD - MIN_PAD) * (n - 1) / 9);
    const fs = Math.round((DISPLAY_H - 2 * pad) / (n * LINE_HEIGHT));
    data.push({ n, fs, pad });
  }
  return data;
}

export const FONT_DATA = buildFontData();

export function calcVerticalPadding(fontSize: number): number {
  // Exact match
  const exact = FONT_DATA.find(d => d.fs === fontSize);
  if (exact) return exact.pad;

  // Interpolate between closest entries (sorted by fs ascending)
  const sorted = [...FONT_DATA].sort((a, b) => a.fs - b.fs);

  if (fontSize <= sorted[0].fs) return sorted[0].pad;
  if (fontSize >= sorted[sorted.length - 1].fs) return sorted[sorted.length - 1].pad;

  for (let i = 0; i < sorted.length - 1; i++) {
    if (fontSize >= sorted[i].fs && fontSize <= sorted[i + 1].fs) {
      const ratio = (fontSize - sorted[i].fs) / (sorted[i + 1].fs - sorted[i].fs);
      return Math.round(sorted[i].pad + (sorted[i + 1].pad - sorted[i].pad) * ratio);
    }
  }

  // Fallback
  return Math.round((DISPLAY_H - fontSize * LINE_HEIGHT) / 2);
}

export function detectFontSize(html: string): number {
  const match = html.match(/font-size:\s*(\d+)px/);
  return match ? parseInt(match[1], 10) : FONT_DATA[FONT_DATA.length - 1].fs;
}
