// Copies non-TS assets the Electron main needs at runtime (e.g. schema.sql)
// from `electron/` into the compiled output `dist/electron/` so __dirname
// resolution works identically in dev and packaged builds.

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'electron');
const outDir = path.join(root, 'dist', 'electron');

const ASSET_EXTENSIONS = new Set(['.sql']);

function copyAssets(src, dest) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true });
      copyAssets(srcPath, destPath);
    } else if (ASSET_EXTENSIONS.has(path.extname(entry.name))) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}
copyAssets(srcDir, outDir);
console.log('[copy-electron-assets] copied .sql files to dist/electron/');
