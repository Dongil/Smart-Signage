// Design Ref: §6 — File management for media assets
import { app, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const MEDIA_DIR = path.join(app.getPath('userData'), 'data', 'media');

export function ensureMediaDir(): void {
  if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
  }
}

export async function selectMediaFile(
  filters: Electron.FileFilter[]
): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters,
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
}

export function copyMediaFile(sourcePath: string): string {
  ensureMediaDir();
  const ext = path.extname(sourcePath);
  const hash = crypto.randomUUID();
  const destName = `${hash}${ext}`;
  const destPath = path.join(MEDIA_DIR, destName);
  fs.copyFileSync(sourcePath, destPath);
  return destName;
}

export function getMediaAbsolutePath(fileName: string): string {
  return path.join(MEDIA_DIR, fileName);
}

export function getMediaDir(): string {
  return MEDIA_DIR;
}
