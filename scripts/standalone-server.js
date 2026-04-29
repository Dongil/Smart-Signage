// Standalone HTTP API server for browser-based testing.
//
// In production v1.1 the Express server is launched from electron/main.ts.
// For dev-without-Electron, this script does the same DB bootstrap and
// starts the HTTP server on the same port (7321) so the Next.js dev UI on
// :3000 can talk to the same APIs.
//
// Note: signage display is driven by Electron now (BrowserWindow show/hide
// on the secondary monitor). When you run this script alone, the Toolbar
// detects "no electronAPI" and treats the browser as a remote — clicking
// "원격 사이니지에 표시" will set signage state via SSE but no actual window
// will open (no Electron host present). To exercise the real signage
// flow, run via `npm run electron:dev` instead.

const path = require('path');
const fs = require('fs');
const os = require('os');

const { openDatabase } = require('../dist/electron/db/database');
const { runMigrations } = require('../dist/electron/db/migrations');
const { seedDefaultSettings } = require('../dist/electron/db/seed');
const { ensureHostDevice } = require('../dist/electron/db/deviceBootstrap');
const { startServer } = require('../dist/electron/server');

const userDataDir = path.join(os.homedir(), '.signage-dev');
fs.mkdirSync(userDataDir, { recursive: true });

const dbPath = path.join(userDataDir, 'signage.db');
const schemaPath = path.join(__dirname, '..', 'dist', 'electron', 'db', 'schema.sql');

console.log('[standalone] userData:', userDataDir);
console.log('[standalone] db:', dbPath);

const db = openDatabase({ filePath: dbPath, schemaPath });
runMigrations(db);
seedDefaultSettings(db);
ensureHostDevice(db, userDataDir);

const repoOut = path.join(__dirname, '..', 'out');
const staticDir = fs.existsSync(repoOut) ? repoOut : undefined;

(async () => {
  const server = await startServer({ port: 7321, userDataDir, staticDir });
  console.log(`[standalone] Express API ready at http://localhost:${server.port}`);
  if (staticDir) {
    console.log(`[standalone] Hosting static export from ${staticDir}`);
    console.log(`[standalone] Open http://localhost:${server.port} (single-port prod-like mode)`);
  } else {
    console.log('[standalone] Open http://localhost:3000 (Next.js dev) in your browser');
  }
  console.log('[standalone] Press Ctrl+C to stop');

  process.on('SIGINT', async () => {
    console.log('\n[standalone] shutting down...');
    await server.close();
    process.exit(0);
  });
})().catch((e) => {
  console.error('[standalone] startup failed:', e);
  process.exit(1);
});
