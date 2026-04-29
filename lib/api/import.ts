// Design Ref: §4.4, §2.M6 — Client wrapper for /api/import/hwpx.
// Sends the .hwpx file as raw bytes (no multipart).

import { getApiBaseUrl, ApiError } from './client';

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

export const importApi = {
  hwpx: async (file: File): Promise<ParsedHwpx> => {
    const base = await getApiBaseUrl();
    const res = await fetch(`${base}/api/import/hwpx`, {
      method: 'POST',
      body: file,
      headers: { 'Content-Type': 'application/octet-stream' },
      credentials: 'include',
    });

    const text = await res.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    if (!res.ok) {
      const message =
        (parsed && typeof parsed === 'object' && 'error' in parsed
          ? String((parsed as { error: unknown }).error)
          : res.statusText) || `HTTP ${res.status}`;
      throw new ApiError(message, res.status, parsed);
    }
    return parsed as ParsedHwpx;
  },
};
