const { BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const storage = require('./storage');

// Runtime window icon (dock/taskbar while running unpackaged via `npm
// start`). Packaged builds use electron-builder's "icon" config in
// package.json instead -- this only covers dev. Both point at the same
// single source file, so dropping one icon.png in here later covers both.
// Silently has no effect until that file actually exists (Electron just
// falls back to its default icon), so this is safe to ship ahead of time.
const APP_ICON_PATH = path.join(__dirname, '../assets/icons/icon.png');

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    frame: false,
    icon: fs.existsSync(APP_ICON_PATH) ? APP_ICON_PATH : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
      webSecurity: true
    }
  });

  const setupComplete = storage.get('setup-complete');
  let startPath;

  if (setupComplete) {
    startPath = path.join(__dirname, '../renderer/browser/index.html');
  } else {
    startPath = path.join(__dirname, '../renderer/setup/index.html');
  }

  const startUrl = `file://${startPath}`;
  win.loadURL(startUrl);

  return win;
}

module.exports = {
  createMainWindow
};