const { app } = require('electron');
const downloadManager = require('./download-manager');
const storage = require('./storage');

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

function applyLoginItemSetting() {
  if (!app.isPackaged) return;
  const enabled = !!storage.get('launchAtLogin');
  try {
    app.setLoginItemSettings({ openAtLogin: enabled });
  } catch (err) {
  }
}

function setup(mainWindow) {
  wireDownloadProgress(mainWindow);
  applyLoginItemSetting();
}

module.exports = { setup, applyLoginItemSetting };
