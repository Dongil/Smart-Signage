// Design Ref: signage-resolution §3.4.1 — dynamic display height
// Shared padding calculation for editor and renderer.
// Originally assumed DISPLAY_H=1080; now parameterised so callers pass the
// operational canvas height (1080 or 1200). All exported APIs accept an
// optional `displayH` and default to 1080 for back-compat.
//
// Strategy:
// - 1 Line: text = 2/3 of H = 720px @ H=1080  → fontSize = 720/1.4 = 514px, pad = 180px
// - 10 Lines: fontSize = 68px @ H=1080, pad = 64px
// - Middle: padding linearly interpolated, fontSize = (H - 2*pad) / (N*1.4)

const LINE_HEIGHT = 1.4;
const DEFAULT_DISPLAY_H = 1080;
const MAX_PAD = 180; // 1 line
const MIN_PAD = 64;  // 10 lines

export interface FontEntry {
  n: number;
  fs: number;
  pad: number;
}

export function buildFontData(displayH: number = DEFAULT_DISPLAY_H): FontEntry[] {
  const data: FontEntry[] = [];
  for (let n = 1; n <= 10; n++) {
    const pad = Math.round(MAX_PAD - (MAX_PAD - MIN_PAD) * (n - 1) / 9);
    const fs = Math.round((displayH - 2 * pad) / (n * LINE_HEIGHT));
    data.push({ n, fs, pad });
  }
  return data;
}

/** Back-compat: built at module load with default 1080. New code should call
 *  `buildFontData(h)` whenever the current resolution is available. */
export const FONT_DATA = buildFontData();

export function calcVerticalPadding(
  fontSize: number,
  displayH: number = DEFAULT_DISPLAY_H
): number {
  const fontData = buildFontData(displayH);

  // Exact match
  const exact = fontData.find((d) => d.fs === fontSize);
  if (exact) return exact.pad;

  // Interpolate between closest entries (sorted by fs ascending)
  const sorted = [...fontData].sort((a, b) => a.fs - b.fs);

  if (fontSize <= sorted[0].fs) return sorted[0].pad;
  if (fontSize >= sorted[sorted.length - 1].fs) return sorted[sorted.length - 1].pad;

  for (let i = 0; i < sorted.length - 1; i++) {
    if (fontSize >= sorted[i].fs && fontSize <= sorted[i + 1].fs) {
      const ratio = (fontSize - sorted[i].fs) / (sorted[i + 1].fs - sorted[i].fs);
      return Math.round(sorted[i].pad + (sorted[i + 1].pad - sorted[i].pad) * ratio);
    }
  }

  // Fallback
  return Math.round((displayH - fontSize * LINE_HEIGHT) / 2);
}

export function detectFontSize(
  html: string,
  displayH: number = DEFAULT_DISPLAY_H
): number {
  const match = html.match(/font-size:\s*(\d+)px/);
  if (match) return parseInt(match[1], 10);
  const fontData = buildFontData(displayH);
  return fontData[fontData.length - 1].fs;
}
