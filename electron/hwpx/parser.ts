// Design Ref: §2.M6 — Public façade so callers can stay strategy-agnostic.
// Today we have one strategy (jszipXml). A future Rust/WASM strategy can be
// swapped in here without touching the route or service.

import { parseHwpxBuffer } from './strategy/jszipXml';
import type { ParsedHwpx } from './types';

export async function parseHwpx(buffer: Buffer): Promise<ParsedHwpx> {
  return parseHwpxBuffer(buffer);
}

export type { ParsedBlock, ParsedHwpx } from './types';
