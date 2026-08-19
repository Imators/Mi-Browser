const { app } = require('electron');
const downloadManager = require('./download-manager');
const storage = require('./storage');

// Downloads -> dock bounce (mac) / taskbar progress bar (Windows) -- both
// driven by the same win.setProgressBar() call, which is a no-op on Linux.
function wireDownloadProgress(mainWindow) {
  function update() {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    const downloads = downloadManager.getAll();
    const active = downloads.filter((d) => d.state === 'progressing' && !d.paused);

    if (!active.length) {
      mainWindow.setProgressBar(-1);
      return;
    }

    const totalBytes = active.reduce((sum, d) => sum + (d.totalBytes || 0), 0);
    const receivedBytes = active.reduce((sum, d) => sum + (d.receivedBytes || 0), 0);
    mainWindow.setProgressBar(totalBytes > 0 ? receivedBytes / totalBytes : 0.02);
  }

  downloadManager.events.on('changed', update);
}

// Applies the persisted "launch Mi Browser at login" preference. Only
// meaningful once packaged -- an unpackaged `npm start` dev run isn't
// "self-responsible" as far as macOS LaunchServices is concerned (it was
// exec'd from Terminal, not launched via Finder/the Dock), and asking to
// register a login item in that state doesn't just no-op, it logs a native
// "Unable to set login item: Operation not permitted" error straight from
// Chromium's own platform code -- which happens below the JS layer, so no
// try/catch here can suppress it. Skipping the call entirely when
// unpackaged is the only way to avoid it; it applies normally once built.
function applyLoginItemSetting() {
  if (!app.isPackaged) return;
  const enabled = !!storage.get('launchAtLogin');
  try {
    app.setLoginItemSettings({ openAtLogin: enabled });
  } catch (err) {
    // Some sandboxed/restricted environments refuse this outright -- not
    // worth crashing startup over a nice-to-have.
  }
}

function setup(mainWindow) {
  wireDownloadProgress(mainWindow);
  applyLoginItemSetting();
}

module.exports = { setup, applyLoginItemSetting };
