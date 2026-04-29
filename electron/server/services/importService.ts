// Design Ref: §2.M6 — Real HWPX import service backed by the JSZip strategy.

import { parseHwpx as runParser, type ParsedBlock, type ParsedHwpx } from '../../hwpx/parser';

export type { ParsedBlock, ParsedHwpx };

const MIN_VALID_BYTES = 100;

export async function parseHwpx(buffer: Buffer): Promise<ParsedHwpx> {
  if (!buffer || buffer.length < MIN_VALID_BYTES) {
    throw new Error('hwpx-empty-or-invalid');
  }
  return runParser(buffer);
}
