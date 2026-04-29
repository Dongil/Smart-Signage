// Centralized logger for the Electron main process.
//
// Why this exists: in a deployed app the user only sees the UI. When the
// editor window doesn't appear or a button "doesn't do anything", there's
// no built-in way to find out why. This module:
//   - Writes a rotating log file to userData/logs/main.log
//   - Forwards renderer-side log lines through IPC into the same file
//   - Catches uncaughtException / unhandledRejection so a crash in main
//     leaves a paper trail instead of silently disappearing
//
// Read the log with `notepad <userData>/logs/main.log` or via the in-app
// "📋 로그" button (see openLogsFolder).
//
// Defensive design: every electron-log call is wrapped in try/catch and
// falls back to direct fs.appendFile so a logger bug never silently
// kills the boot sequence (which is exactly how earlier diagnostics work
// went wrong — log.initialize({preload:true}) threw before whenReady).

import log from 'electron-log/main';
import { app, dialog, shell, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let initialized = false;
let resolvedLogPath: string | null = null;

export interface LogPayload {
  level: 'debug' | 'info' | 'warn' | 'error';
  scope?: string;
  message: string;
  details?: unknown;
}

function fallbackWrite(level: string, line: string): void {
  if (!resolvedLogPath) {
    try {
      const dir = path.join(app.getPath('userData'), 'logs');
      fs.mkdirSync(dir, { recursive: true });
      resolvedLogPath = path.join(dir, 'main.log');
    } catch {
      return;
    }
  }
  try {
    const stamp = new Date().toISOString();
    fs.appendFileSync(resolvedLogPath, `[${stamp}] [${level}] ${line}\n`, 'utf-8');
  } catch {
    // give up — at this point disk write is impossible
  }
}

function safeLog(level: 'debug' | 'info' | 'warn' | 'error', ...parts: unknown[]): void {
  const line = parts
    .map((p) => (p instanceof Error ? p.stack || p.message : typeof p === 'string' ? p : JSON.stringify(p)))
    .join(' ');
  try {
    log[level](line);
  } catch {
    // electron-log itself failed — fall back so we still capture the message.
    fallbackWrite(level, line);
  }
}

export function initLogger(): void {
  if (initialized) return;
  initialized = true;

  // Resolve userData/logs directory upfront and create it so file transport
  // never has to fall back. This works even before app.whenReady fires.
  try {
    const userData = app.getPath('userData');
    const logsDir = path.join(userData, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    resolvedLogPath = path.join(logsDir, 'main.log');
  } catch (e) {
    // We'll still try electron-log defaults below.
    // eslint-disable-next-line no-console
    console.error('initLogger: cannot prepare logs dir', e);
  }

  try {
    log.transports.file.level = 'debug';
    log.transports.console.level = 'debug';
    log.transports.file.maxSize = 5 * 1024 * 1024;
    log.transports.file.format =
      '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {scope}{text}';
    if (resolvedLogPath) {
      const finalPath = resolvedLogPath;
      log.transports.file.resolvePathFn = () => finalPath;
    }
    // Note: NOT calling log.initialize({preload: true}) — it can throw on
    // some Electron / electron-log version combos before app.whenReady,
    // and we don't need it because our own IPC bridge below already
    // routes renderer logs into the same file.
  } catch (e) {
    fallbackWrite('error', 'electron-log setup failed: ' + (e instanceof Error ? e.stack : String(e)));
  }

  safeLog('info', '--- main process boot ---');
  safeLog('info', 'app version:', app.getVersion());
  safeLog('info', 'electron version:', process.versions.electron);
  safeLog('info', 'node version:', process.versions.node);
  safeLog('info', 'platform:', process.platform, process.arch);
  safeLog('info', 'userData:', app.getPath('userData'));
  safeLog('info', 'appPath:', app.getAppPath());
  safeLog('info', 'isPackaged:', app.isPackaged);
  safeLog('info', 'resourcesPath:', process.resourcesPath || '(none)');
  safeLog('info', 'log file:', resolvedLogPath || '(electron-log default)');

  process.on('uncaughtException', (err) => {
    safeLog('error', 'uncaughtException:', err);
    showFatalDialog('Uncaught Exception', err);
  });
  process.on('unhandledRejection', (reason) => {
    safeLog('error', 'unhandledRejection:', reason);
  });

  // Renderer → main log bridge.
  ipcMain.handle('log', (_event, payload: LogPayload) => {
    if (!payload || typeof payload.message !== 'string') return;
    const scope = payload.scope ? `[${payload.scope}] ` : '';
    const text = `${scope}${payload.message}` +
      (payload.details !== undefined ? ` ${JSON.stringify(payload.details)}` : '');
    safeLog(payload.level || 'info', text);
  });

  ipcMain.handle('open-logs-folder', () => openLogsFolder());
  ipcMain.handle('get-log-path', () => logFilePath());
}

export function getLogger() {
  return {
    debug: (...args: unknown[]) => safeLog('debug', ...args),
    info: (...args: unknown[]) => safeLog('info', ...args),
    warn: (...args: unknown[]) => safeLog('warn', ...args),
    error: (...args: unknown[]) => safeLog('error', ...args),
  };
}

export function logFilePath(): string {
  if (resolvedLogPath) return resolvedLogPath;
  try {
    return log.transports.file.getFile().path;
  } catch {
    return path.join(app.getPath('userData'), 'logs', 'main.log');
  }
}

export function openLogsFolder(): string {
  const file = logFilePath();
  try {
    shell.showItemInFolder(file);
  } catch {
    // ignore
  }
  return file;
}

/**
 * Last-resort dialog when something goes wrong before any window exists.
 * Always displays the log file path so the user can attach it to a bug
 * report — that is THE escape hatch when "the app just doesn't open".
 */
export function showFatalDialog(title: string, err: unknown): void {
  const message =
    err instanceof Error ? err.stack || err.message : String(err);
  let logPath = '';
  try {
    logPath = logFilePath();
  } catch {
    // ignore
  }
  try {
    dialog.showErrorBox(
      `Smart Signage - ${title}`,
      `${message}\n\n` +
        (logPath ? `로그 파일:\n${logPath}\n\n` : '') +
        `이 메시지를 캡처하거나 위 로그 파일을 첨부하여 문제를 보고해주세요.`
    );
  } catch {
    // dialog can fail too; nothing we can do beyond what's already logged.
  }
}
