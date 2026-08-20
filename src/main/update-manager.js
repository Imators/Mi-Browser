const { app, net, webContents: webContentsModule } = require('electron');
const { autoUpdater } = require('electron-updater');
const storage = require('./storage');

let mainWindowRef = null;

const VERSION_URL = 'https://imators.systems/mi-browser/version-operating/version.json';
const FEED_URL = 'https://imators.systems/mi-browser/version-operating/';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.setFeedURL({ provider: 'generic', url: FEED_URL });

function compareVersions(a, b) {
  const partsA = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const partsB = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const diff = (partsA[i] || 0) - (partsB[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function platformKey() {
  if (process.platform === 'darwin') return 'mac';
  if (process.platform === 'win32') return 'win';
  return 'linux';
}

function broadcast(channel, payload) {
  webContentsModule.getAllWebContents().forEach((wc) => {
    if (!wc.isDestroyed()) wc.send(channel, payload);
  });
}

async function checkForUpdate() {
  const currentVersion = app.getVersion();
  let result;

  try {
    const response = await net.fetch(VERSION_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    if (!data || typeof data.version !== 'string') throw new Error('Malformed version.json');

    result = {
      checkedAt: Date.now(),
      ok: true,
      currentVersion,
      latestVersion: data.version,
      updateAvailable: compareVersions(data.version, currentVersion) > 0,
      releaseDate: data.releaseDate || null,
      releaseTime: data.releaseTime || null,
      changelog: Array.isArray(data.changelog) ? data.changelog : [],
      downloadUrl: (data.downloads && data.downloads[platformKey()]) || null
    };
  } catch (err) {
    result = {
      checkedAt: Date.now(),
      ok: false,
      error: err.message,
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      changelog: [],
      downloadUrl: null
    };
  }

  storage.set('lastUpdateCheck', result);
  broadcast('update-status-changed', result);
  return result;
}

function getCached() {
  return storage.get('lastUpdateCheck') || null;
}

let installState = 'idle';

function getInstallState() {
  return installState;
}

async function startAutoUpdate() {
  if (!app.isPackaged) {
    installState = 'error';
    broadcast('update-install-progress', { state: 'error', message: 'Auto-update only runs in a packaged build, not this development copy.' });
    return;
  }

  installState = 'checking';
  broadcast('update-install-progress', { state: 'checking' });

  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    installState = 'error';
    broadcast('update-install-progress', { state: 'error', message: err.message });
  }
}

autoUpdater.on('update-available', () => {
  installState = 'downloading';
  broadcast('update-install-progress', { state: 'downloading', percent: 0 });
  autoUpdater.downloadUpdate().catch((err) => {
    installState = 'error';
    broadcast('update-install-progress', { state: 'error', message: err.message });
  });
});

autoUpdater.on('update-not-available', () => {
  installState = 'idle';
  broadcast('update-install-progress', { state: 'not-available' });
});

autoUpdater.on('download-progress', (progress) => {
  installState = 'downloading';
  broadcast('update-install-progress', { state: 'downloading', percent: Math.round(progress.percent) });
});

autoUpdater.on('update-downloaded', () => {
  installState = 'installing';
  broadcast('update-install-progress', { state: 'installing' });
  setTimeout(() => {
    autoUpdater.quitAndInstall(true, true);
  }, 1500);
});

autoUpdater.on('error', (err) => {
  installState = 'error';
  broadcast('update-install-progress', { state: 'error', message: err.message });
});

function setup(mainWindow) {
  mainWindowRef = mainWindow;
  setTimeout(checkForUpdate, 5000);
  setInterval(checkForUpdate, CHECK_INTERVAL_MS);
}

module.exports = { setup, checkForUpdate, getCached, startAutoUpdate, getInstallState, compareVersions };
