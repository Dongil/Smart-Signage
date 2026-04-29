// Renderer-side logger that mirrors lines into the main process's log file.
//
// The main file lives at `%APPDATA%\Smart Signage\logs\main.log`. Calling
// `installRendererLogger()` once at app boot also routes uncaught errors,
// unhandled promise rejections, and window.onerror through the bridge so
// renderer-side crashes are captured the same way as main-side ones.

type Level = 'debug' | 'info' | 'warn' | 'error';

const SCOPE_PREFIX = 'renderer';

function send(level: Level, scope: string, message: string, details?: unknown) {
  if (typeof window === 'undefined') return;
  const api = window.electronAPI;
  if (!api) return;
  // Fire-and-forget; never let logging itself throw and break the app.
  api
    .invoke('log', { level, scope: `${SCOPE_PREFIX}:${scope}`, message, details })
    .catch(() => undefined);
}

export const logger = {
  debug: (scope: string, message: string, details?: unknown) =>
    send('debug', scope, message, details),
  info: (scope: string, message: string, details?: unknown) =>
    send('info', scope, message, details),
  warn: (scope: string, message: string, details?: unknown) =>
    send('warn', scope, message, details),
  error: (scope: string, message: string, details?: unknown) =>
    send('error', scope, message, details),
};

let installed = false;

export function installRendererLogger() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  logger.info('boot', `pathname=${window.location.pathname} ua=${navigator.userAgent}`);

  window.addEventListener('error', (event) => {
    const err = event.error as Error | undefined;
    logger.error(
      'window.error',
      err?.message ?? String(event.message ?? 'unknown'),
      { stack: err?.stack, source: event.filename, line: event.lineno, col: event.colno }
    );
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error ? reason.message : String(reason ?? 'unknown');
    const stack = reason instanceof Error ? reason.stack : undefined;
    logger.error('unhandledrejection', message, { stack });
  });
}

export async function openLogsFolder(): Promise<void> {
  if (typeof window === 'undefined' || !window.electronAPI) return;
  await window.electronAPI.invoke('open-logs-folder');
}

export async function getLogPath(): Promise<string | null> {
  if (typeof window === 'undefined' || !window.electronAPI) return null;
  const p = await window.electronAPI.invoke('get-log-path');
  return typeof p === 'string' ? p : null;
}
