// Design Ref: §2.6 (Option α) — Self-contained .hwpx text extractor.
// We unzip the package with JSZip, then walk Contents/section*.xml using
// fast-xml-parser's preserved-array shape to pull paragraph text + the few
// style hints we propagate (bold/italic/align/fontSize).
//
// HWPX/OWPML structure (relevant subset):
//   <hp:p paraPrIDRef="…">
//     <hp:run charPrIDRef="…">
//       <hp:t>본문 텍스트</hp:t>
//     </hp:run>
//   </hp:p>
//
// charPr / paraPr definitions live in Contents/header.xml referenced by ID.
// For v1.1 we resolve them best-effort and fall back gracefully when missing
// so a partial style map never blocks the import.

import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import type { ParsedBlock, ParsedHwpx } from '../types';

const PARA_TAG = 'hp:p';
const RUN_TAG = 'hp:run';
const TEXT_TAG = 'hp:t';

const HWP_POINT_TO_PX = 96 / 72; // 1pt = 1.333px @ 96dpi
const HWPUNIT_PER_PT = 100; // HWP point = 1/100 pt — multiply HWPUNIT to get pt

interface CharStyle {
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
}

interface ParaStyle {
  align?: 'left' | 'center' | 'right';
}

type CharPrMap = Map<string, CharStyle>;
type ParaPrMap = Map<string, ParaStyle>;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  preserveOrder: true,
  trimValues: false,
});

function buildCharPrMap(headerXml: string): CharPrMap {
  const map: CharPrMap = new Map();
  if (!headerXml) return map;

  // Each charPr is roughly:
  //   <hh:charPr id="0" textColor=…>
  //     <hh:height value="2400"/>            (HWPUNIT)
  //     <hh:bold/> <hh:italic/>
  //   </hh:charPr>
  const charPrRegex = /<hh:charPr\b([^>]*)>([\s\S]*?)<\/hh:charPr>/g;
  let match: RegExpExecArray | null;
  while ((match = charPrRegex.exec(headerXml)) !== null) {
    const attrBlock = match[1];
    const inner = match[2];
    const idMatch = /\bid\s*=\s*["']([^"']+)["']/.exec(attrBlock);
    if (!idMatch) continue;
    const id = idMatch[1];

    const heightMatch = /<hh:height[^>]*\bvalue\s*=\s*["'](\d+)["']/.exec(inner);
    let fontSize: number | undefined;
    if (heightMatch) {
      const hwpunits = Number(heightMatch[1]);
      const pt = hwpunits / HWPUNIT_PER_PT;
      fontSize = Math.max(8, Math.round(pt * HWP_POINT_TO_PX));
    }
    const bold = /<hh:bold\b/.test(inner);
    const italic = /<hh:italic\b/.test(inner);

    map.set(id, { fontSize, bold, italic });
  }
  return map;
}

function buildParaPrMap(headerXml: string): ParaPrMap {
  const map: ParaPrMap = new Map();
  if (!headerXml) return map;

  // <hh:paraPr id="0" align="left|center|right|justify">…</hh:paraPr>
  const paraPrRegex = /<hh:paraPr\b([^>]*)>/g;
  let match: RegExpExecArray | null;
  while ((match = paraPrRegex.exec(headerXml)) !== null) {
    const attrBlock = match[1];
    const idMatch = /\bid\s*=\s*["']([^"']+)["']/.exec(attrBlock);
    if (!idMatch) continue;
    const alignMatch = /\balign\s*=\s*["']([^"']+)["']/.exec(attrBlock);
    let align: ParaStyle['align'];
    if (alignMatch) {
      const a = alignMatch[1];
      if (a === 'left' || a === 'right' || a === 'center') align = a;
      else if (a === 'justify') align = 'left';
    }
    map.set(idMatch[1], { align });
  }
  return map;
}

interface FxpNode {
  [key: string]: unknown;
  ':@'?: Record<string, string>;
}

function getAttr(node: FxpNode, attr: string): string | undefined {
  const a = node[':@'];
  if (!a) return undefined;
  return a[`@_${attr}`];
}

function flattenText(nodes: FxpNode[] | undefined, textKey: string): string {
  if (!nodes) return '';
  let out = '';
  for (const node of nodes) {
    const value = node[textKey];
    if (typeof value === 'string') {
      out += value;
    } else if (Array.isArray(value)) {
      out += flattenText(value as FxpNode[], '#text');
    }
  }
  return out;
}

function extractParagraph(
  paraNode: FxpNode,
  charPrMap: CharPrMap,
  paraPrMap: ParaPrMap
): ParsedBlock | null {
  const children = paraNode[PARA_TAG] as FxpNode[] | undefined;
  if (!Array.isArray(children)) return null;

  const paraId = getAttr(paraNode, 'paraPrIDRef');
  const paraStyle = paraId ? paraPrMap.get(paraId) : undefined;

  let text = '';
  let charStyle: CharStyle | undefined;

  for (const child of children) {
    if (RUN_TAG in child) {
      const runNode = child as FxpNode;
      const charId = getAttr(runNode, 'charPrIDRef');
      const style = charId ? charPrMap.get(charId) : undefined;
      // Use the first encountered run's style as the paragraph default.
      if (!charStyle && style) charStyle = style;

      const runChildren = runNode[RUN_TAG] as FxpNode[] | undefined;
      if (Array.isArray(runChildren)) {
        for (const rc of runChildren) {
          if (TEXT_TAG in rc) {
            text += flattenText(rc[TEXT_TAG] as FxpNode[], '#text');
          }
        }
      }
    }
  }

  text = text.replace(/\s+/g, ' ').trim();
  if (!text) return null;

  const block: ParsedBlock = { text };
  if (charStyle?.fontSize !== undefined) block.fontSize = charStyle.fontSize;
  if (charStyle?.bold) block.bold = true;
  if (charStyle?.italic) block.italic = true;
  if (paraStyle?.align) block.align = paraStyle.align;
  return block;
}

function findParagraphs(tree: FxpNode[]): FxpNode[] {
  const out: FxpNode[] = [];
  const walk = (nodes: FxpNode[]) => {
    for (const node of nodes) {
      const keys = Object.keys(node).filter((k) => k !== ':@');
      const tag = keys[0];
      if (!tag) continue;
      if (tag === PARA_TAG) {
        out.push(node);
      } else {
        const child = node[tag];
        if (Array.isArray(child)) walk(child as FxpNode[]);
      }
    }
  };
  walk(tree);
  return out;
}

export async function parseHwpxBuffer(buffer: Buffer): Promise<ParsedHwpx> {
  const zip = await JSZip.loadAsync(buffer);

  // Header (Contents/header.xml) holds char/para style definitions.
  const headerFile = zip.file('Contents/header.xml');
  const headerXml = headerFile ? await headerFile.async('string') : '';
  const charPrMap = buildCharPrMap(headerXml);
  const paraPrMap = buildParaPrMap(headerXml);

  // Sections: Contents/section0.xml, section1.xml, …
  const sectionEntries = Object.keys(zip.files)
    .filter((p) => /^Contents\/section\d+\.xml$/.test(p))
    .sort();

  if (sectionEntries.length === 0) {
    throw new Error('hwpx-no-sections');
  }

  const blocks: ParsedBlock[] = [];
  for (const path of sectionEntries) {
    const file = zip.file(path);
    if (!file) continue;
    const xml = await file.async('string');
    const tree = xmlParser.parse(xml) as FxpNode[];
    const paragraphs = findParagraphs(tree);
    for (const p of paragraphs) {
      const block = extractParagraph(p, charPrMap, paraPrMap);
      if (block) blocks.push(block);
    }
  }

  return { blocks, totalLines: blocks.length };
}
