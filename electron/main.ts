// Design Ref: §6 — Electron main with media file management + custom protocol
// v1.1 §2.M1 — DB bootstrap (SQLite + migrations + host device row)
// v1.1 simplified signage flow + comprehensive logging.
//
// Every step of the boot sequence is logged through electron-log so that
// when a deployed user reports "앱이 안 뜨는데 프로세스에는 있다" we can
// open `%APPDATA%\Smart Signage\logs\main.log` and see exactly which
// step failed. Fatal errors also pop a dialog with the log path.

import { app, BrowserWindow, screen, ipcMain, protocol, Menu, type Display } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { selectMediaFile, copyMediaFile, getMediaAbsolutePath } from './fileManager';
import { openDatabase, closeDatabase } from './db/database';
import { runMigrations, importLegacySlides, isSlideTableEmpty, type LegacySlidePayload } from './db/migrations';
import { seedDefaultSettings } from './db/seed';
import { ensureHostDevice } from './db/deviceBootstrap';
import { startServer, type RunningServer } from './server';
import { initLogger, getLogger, openLogsFolder, showFatalDialog, logFilePath } from './logger';
// Design Ref: matrix-control §3.9 — main lifecycle for PN-8080 matrix control
import { initMatrix, disposeMatrix } from './services/matrixManager';

const HTTP_PORT = 7321;

let editorWin: BrowserWindow | null = null;
let signageWin: BrowserWindow | null = null;
let hostDeviceId: string | null = null;
let runningServer: RunningServer | null = null;
let isQuitting = false;

interface ShowSignageResult {
  ok: boolean;
  reason?: 'no-secondary-display' | 'window-missing';
  displayCount?: number;
}

// Initialize logger ASAP — before any other code that might throw.
initLogger();
const log = getLogger();

// Single-instance lock: if the user double-clicks the shortcut while the
// app is already running, focus the existing editor window instead of
// failing with EADDRINUSE on port 7321.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  log.warn('another instance is running — exiting');
  app.quit();
} else {
  app.on('second-instance', () => {
    log.info('second-instance event — focusing editor');
    if (editorWin) {
      if (editorWin.isMinimized()) editorWin.restore();
      editorWin.show();
      editorWin.focus();
    }
  });
}

function getSecondaryDisplay(): Display | null {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  return displays.find((d) => d.id !== primary.id) ?? null;
}

function placeSignageOnSecondary(): boolean {
  if (!signageWin || signageWin.isDestroyed()) return false;
  const secondary = getSecondaryDisplay();
  if (!secondary) return false;
  const { x, y, width, height } = secondary.bounds;
  signageWin.setBounds({ x, y, width, height });
  signageWin.setFullScreen(true);
  return true;
}

function buildAppMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '파일',
      submenu: [{ role: 'quit', label: '종료' }],
    },
    {
      label: '편집',
      submenu: [
        { role: 'undo', label: '실행 취소' },
        { role: 'redo', label: '다시 실행' },
        { type: 'separator' },
        { role: 'cut', label: '잘라내기' },
        { role: 'copy', label: '복사' },
        { role: 'paste', label: '붙여넣기' },
        { role: 'selectAll', label: '전체 선택' },
      ],
    },
    {
      label: '도움말',
      submenu: [
        {
          label: '로그 폴더 열기',
          click: () => openLogsFolder(),
        },
        {
          label: '개발자 도구 (편집기)',
          accelerator: 'Ctrl+Shift+I',
          click: () => editorWin?.webContents.openDevTools({ mode: 'detach' }),
        },
        {
          label: '개발자 도구 (사이니지)',
          click: () => signageWin?.webContents.openDevTools({ mode: 'detach' }),
        },
        { type: 'separator' },
        {
          label: '앱 정보',
          click: () => {
            const { dialog } = require('electron') as typeof import('electron');
            dialog.showMessageBox({
              type: 'info',
              title: 'Smart Signage',
              message: 'Smart Signage v' + app.getVersion(),
              detail:
                `Electron: ${process.versions.electron}\n` +
                `Node: ${process.versions.node}\n` +
                `로그: ${logFilePath()}`,
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindows() {
  log.info('createWindows: enter');
  const primaryDisplay = screen.getPrimaryDisplay();
  const allDisplays = screen.getAllDisplays();
  log.info('displays detected:', allDisplays.length, 'primary id:', primaryDisplay.id);
  for (const d of allDisplays) {
    log.info('  display', d.id, 'label:', d.label, 'bounds:', d.bounds);
  }

  editorWin = new BrowserWindow({
    x: primaryDisplay.bounds.x + 60,
    y: primaryDisplay.bounds.y + 60,
    width: 1280,
    height: 800,
    title: 'Smart Signage',
    backgroundColor: '#0a0a1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  log.info('editorWin created');

  // matrix-control §3.9 — wire singleton matrix manager + IPC handlers.
  try {
    initMatrix(editorWin);
    log.info('matrix manager initialized');
  } catch (e) {
    log.warn('matrix manager init failed:', e);
  }

  editorWin.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log.error('editor did-fail-load:', code, desc, 'url:', url);
    showFatalDialog(
      '편집기 페이지 로드 실패',
      new Error(`(${code}) ${desc}\nURL: ${url}`)
    );
  });
  editorWin.webContents.on('did-finish-load', () => {
    log.info('editor did-finish-load');
  });
  editorWin.webContents.on(
    'render-process-gone',
    (_e, details: Electron.RenderProcessGoneDetails) => {
      log.error('editor render-process-gone:', details.reason, details.exitCode);
    }
  );

  // Pre-position signage on the secondary monitor (if any) so first show is instant.
  const secondary = getSecondaryDisplay();
  const initialBounds = secondary?.bounds ?? primaryDisplay.bounds;

  signageWin = new BrowserWindow({
    x: initialBounds.x,
    y: initialBounds.y,
    width: initialBounds.width,
    height: initialBounds.height,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  log.info('signageWin created (hidden)');

  signageWin.webContents.on('did-fail-load', (_e, code, desc, url) => {
    log.error('signage did-fail-load:', code, desc, 'url:', url);
  });
  signageWin.webContents.on(
    'render-process-gone',
    (_e, details: Electron.RenderProcessGoneDetails) => {
      log.error('signage render-process-gone:', details.reason, details.exitCode);
    }
  );

  signageWin.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    log.info('signage close blocked → hide');
    signageWin?.hide();
  });

  signageWin.on('show', () => {
    log.info('signage show');
    signageWin?.webContents.send('signage-visibility', true);
  });
  signageWin.on('hide', () => {
    log.info('signage hide');
    signageWin?.webContents.send('signage-visibility', false);
  });

  editorWin.on('closed', () => {
    log.info('editor window closed');
    editorWin = null;
    if (!isQuitting) app.quit();
  });

  const isDev = !app.isPackaged;
  const baseUrl = isDev ? 'http://localhost:3000' : `http://localhost:${HTTP_PORT}`;
  log.info('loading URLs (isDev=' + isDev + ', baseUrl=' + baseUrl + ')');
  editorWin.loadURL(`${baseUrl}/`);
  signageWin.loadURL(`${baseUrl}/signage`);
  log.info('createWindows: exit');
}

ipcMain.on('toggle-fullscreen', () => {
  if (signageWin) signageWin.setFullScreen(!signageWin.isFullScreen());
});

ipcMain.handle('signage-show', async (): Promise<ShowSignageResult> => {
  log.info('IPC signage-show: invoked');
  if (!signageWin || signageWin.isDestroyed()) {
    log.warn('IPC signage-show: window missing');
    return { ok: false, reason: 'window-missing' };
  }
  if (!placeSignageOnSecondary()) {
    const count = screen.getAllDisplays().length;
    log.warn('IPC signage-show: no secondary display (count=' + count + ')');
    return { ok: false, reason: 'no-secondary-display', displayCount: count };
  }
  signageWin.show();
  signageWin.focus();
  log.info('IPC signage-show: shown on secondary monitor');
  return { ok: true };
});

ipcMain.on('signage-hide', () => {
  if (signageWin && !signageWin.isDestroyed() && signageWin.isVisible()) {
    log.info('IPC signage-hide');
    signageWin.hide();
  }
});

ipcMain.handle('signage-is-visible', () => {
  return signageWin ? signageWin.isVisible() && !signageWin.isDestroyed() : false;
});

ipcMain.handle('get-displays', () => {
  return screen.getAllDisplays().map((d) => ({
    id: d.id,
    label: d.label,
    bounds: d.bounds,
    isPrimary: d.id === screen.getPrimaryDisplay().id,
  }));
});

ipcMain.handle('save-file', (_event, { path: filePath, data }: { path: string; data: string }) => {
  const fullPath = path.join(app.getAppPath(), filePath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, data, 'utf-8');
});

ipcMain.handle('load-file', (_event, { path: filePath }: { path: string }) => {
  const fullPath = path.join(app.getAppPath(), filePath);
  if (fs.existsSync(fullPath)) return fs.readFileSync(fullPath, 'utf-8');
  return null;
});

ipcMain.handle('select-media-file', async (_event, { filters }: { filters: Electron.FileFilter[] }) => {
  return selectMediaFile(filters);
});

ipcMain.handle('copy-media-file', (_event, { sourcePath }: { sourcePath: string }) => {
  return copyMediaFile(sourcePath);
});

ipcMain.handle('get-media-path', (_event, { fileName }: { fileName: string }) => {
  return getMediaAbsolutePath(fileName);
});

function bootstrapDatabase(): string {
  log.info('bootstrapDatabase: enter');
  const userDataDir = app.getPath('userData');
  const dbPath = path.join(userDataDir, 'signage.db');
  const schemaPath = path.join(__dirname, 'db', 'schema.sql');
  log.info('  dbPath:', dbPath);
  log.info('  schemaPath:', schemaPath, 'exists:', fs.existsSync(schemaPath));

  const packagedSeed = path.join(process.resourcesPath || '', 'signage.seed.db');
  const repoSeed = path.join(app.getAppPath(), 'data', 'signage.seed.db');
  const seedDbPath = fs.existsSync(packagedSeed)
    ? packagedSeed
    : fs.existsSync(repoSeed)
      ? repoSeed
      : undefined;
  log.info('  seedDbPath:', seedDbPath ?? '(none)');

  const db = openDatabase({ filePath: dbPath, schemaPath, seedDbPath });
  runMigrations(db);
  seedDefaultSettings(db);
  const id = ensureHostDevice(db, userDataDir);
  log.info('bootstrapDatabase: exit, host device-id=', id);
  return id;
}

ipcMain.handle('migrate-legacy-slides', (_event, payload: LegacySlidePayload[]) => {
  const db = openDatabase({
    filePath: path.join(app.getPath('userData'), 'signage.db'),
    schemaPath: path.join(__dirname, 'db', 'schema.sql'),
  });
  if (!isSlideTableEmpty(db)) return { imported: 0, reason: 'db-not-empty' };
  const backupDir = path.join(app.getPath('userData'), 'backups');
  const imported = importLegacySlides(db, payload, backupDir);
  log.info('migrate-legacy-slides: imported', imported);
  return { imported };
});

ipcMain.handle('get-host-device-id', () => hostDeviceId);
ipcMain.handle('get-internal-secret', () => runningServer?.internalSecret ?? null);
ipcMain.handle('get-server-info', () => ({
  port: runningServer?.port ?? null,
  baseUrl: runningServer ? `http://127.0.0.1:${runningServer.port}` : null,
}));

app.whenReady().then(async () => {
  log.info('app whenReady fired');

  try {
    protocol.registerFileProtocol('media', (request, callback) => {
      const fileName = decodeURIComponent(request.url.replace('media://', ''));
      const filePath = getMediaAbsolutePath(fileName);
      callback({ path: filePath });
    });
    log.info('media:// protocol registered');

    hostDeviceId = bootstrapDatabase();

    const isDev = !app.isPackaged;
    const candidateStatic = [
      path.join(process.resourcesPath || '', 'out'),
      path.join(app.getAppPath(), 'out'),
    ];
    const staticDir = isDev ? undefined : candidateStatic.find((p) => fs.existsSync(p));
    log.info('staticDir:', staticDir ?? '(dev / not found)');
    if (!isDev && !staticDir) {
      log.warn('No static dir found! Tried:', candidateStatic);
    }

    log.info('starting HTTP server on port', HTTP_PORT);
    runningServer = await startServer({
      port: HTTP_PORT,
      userDataDir: app.getPath('userData'),
      staticDir,
    });
    log.info('HTTP server ready at http://localhost:' + runningServer.port);

    buildAppMenu();
    createWindows();
    log.info('boot complete');
  } catch (err) {
    log.error('boot failed:', err);
    showFatalDialog('앱 시작 실패', err);
    app.exit(1);
  }
}).catch((err) => {
  // whenReady itself rejecting is rare but possible — last line of defense.
  log.error('whenReady promise rejected:', err);
  showFatalDialog('Electron 초기화 실패', err);
  app.exit(1);
});

app.on('before-quit', async () => {
  log.info('before-quit');
  isQuitting = true;
  try {
    await disposeMatrix();
    log.info('matrix disposed');
  } catch (e) {
    log.warn('matrix dispose error:', e);
  }
  if (runningServer) {
    try {
      await runningServer.close();
      log.info('HTTP server closed');
    } catch (e) {
      log.warn('HTTP server close error:', e);
    }
    runningServer = null;
  }
  try {
    closeDatabase();
    log.info('database closed');
  } catch (e) {
    log.warn('database close error:', e);
  }
});

app.on('window-all-closed', () => {
  log.info('window-all-closed → quit');
  app.quit();
});
