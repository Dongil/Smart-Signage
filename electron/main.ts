// Design Ref: §6 — Electron main with media file management + custom protocol
import { app, BrowserWindow, screen, ipcMain, protocol } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { selectMediaFile, copyMediaFile, getMediaAbsolutePath } from './fileManager';

let editorWin: BrowserWindow | null = null;
let signageWin: BrowserWindow | null = null;

function createWindows() {
  const displays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();
  const secondaryDisplay = displays.find((d) => d.id !== primaryDisplay.id);

  // 편집 창 (주 모니터)
  editorWin = new BrowserWindow({
    x: primaryDisplay.bounds.x,
    y: primaryDisplay.bounds.y,
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 사이니지 출력 창 (보조 모니터)
  const signageBounds = secondaryDisplay
    ? secondaryDisplay.bounds
    : { x: 0, y: 0, width: 1920, height: 1080 };

  signageWin = new BrowserWindow({
    x: signageBounds.x,
    y: signageBounds.y,
    width: signageBounds.width,
    height: signageBounds.height,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const isDev = !app.isPackaged;
  const baseUrl = isDev ? 'http://localhost:3000' : `file://${path.join(__dirname, '../out')}`;

  editorWin.loadURL(`${baseUrl}/`);
  signageWin.loadURL(`${baseUrl}/signage`);

  if (secondaryDisplay) {
    signageWin.setFullScreen(true);
  }
}

// IPC 핸들러
ipcMain.on('toggle-fullscreen', () => {
  if (signageWin) {
    signageWin.setFullScreen(!signageWin.isFullScreen());
  }
});

ipcMain.on('show-on-signage', (_event, payload) => {
  if (signageWin) {
    signageWin.webContents.send('render-slide', payload);
    signageWin.setFullScreen(true);
    signageWin.focus();
  }
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
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(fullPath, data, 'utf-8');
});

ipcMain.handle('load-file', (_event, { path: filePath }: { path: string }) => {
  const fullPath = path.join(app.getAppPath(), filePath);
  if (fs.existsSync(fullPath)) {
    return fs.readFileSync(fullPath, 'utf-8');
  }
  return null;
});

// Design Ref: §6.2 — Media file IPC handlers
ipcMain.handle('select-media-file', async (_event, { filters }: { filters: Electron.FileFilter[] }) => {
  return selectMediaFile(filters);
});

ipcMain.handle('copy-media-file', (_event, { sourcePath }: { sourcePath: string }) => {
  return copyMediaFile(sourcePath);
});

ipcMain.handle('get-media-path', (_event, { fileName }: { fileName: string }) => {
  return getMediaAbsolutePath(fileName);
});

app.whenReady().then(() => {
  // Design Ref: §6.3 — Custom protocol for secure media loading
  protocol.registerFileProtocol('media', (request, callback) => {
    const fileName = decodeURIComponent(request.url.replace('media://', ''));
    const filePath = getMediaAbsolutePath(fileName);
    callback({ path: filePath });
  });

  createWindows();
});

app.on('window-all-closed', () => {
  app.quit();
});
