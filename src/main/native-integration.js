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
// meaningful once packaged (an unpackaged `npm start` dev run would
// register the Electron binary itself, which isn't useful), but it's safe
// to call either way -- setLoginItemSettings just no-ops sensibly in dev.
function applyLoginItemSetting() {
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
