// Design Ref: §2.M6 — HWPX parsing public types.

export interface ParsedBlock {
  text: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
}

export interface ParsedHwpx {
  blocks: ParsedBlock[];
  totalLines: number;
}
