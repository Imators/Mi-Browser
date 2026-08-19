const { app, net, webContents: webContentsModule, shell } = require('electron');
const storage = require('./storage');

let mainWindowRef = null;

const VERSION_URL = 'https://imators.systems/mi-browser/version-operating/version.json';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

// Plain numeric semver compare (no pre-release/build metadata handling --
// version.json is ours to control, so it only ever needs to carry plain
// "major.minor.patch" strings). Returns >0 if a is newer than b.
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

function broadcast(result) {
  webContentsModule.getAllWebContents().forEach((wc) => {
    if (!wc.isDestroyed()) wc.send('update-status-changed', result);
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
  broadcast(result);
  return result;
}

function getCached() {
  return storage.get('lastUpdateCheck') || null;
}

// Genuinely downloads the installer straight into the user's Downloads
// folder (through the same will-download pipeline downloadManager already
// tracks, progress bar and all) rather than just opening a browser tab --
// as automatic as this can honestly be made without a code-signed,
// platform-specific auto-update channel (Squirrel.Mac / NSIS differential
// updates), which needs signing certificates this project doesn't have.
// Running the finished installer is still a deliberate step the user takes.
function downloadUpdate(url) {
  if (!url) return false;
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.downloadURL(url);
    return true;
  }
  shell.openExternal(url);
  return false;
}

function setup(mainWindow) {
  mainWindowRef = mainWindow;
  // Check shortly after launch (not instantly -- no need to compete with
  // startup work) and then on a steady interval for as long as the app runs.
  setTimeout(checkForUpdate, 5000);
  setInterval(checkForUpdate, CHECK_INTERVAL_MS);
}

module.exports = { setup, checkForUpdate, getCached, downloadUpdate, compareVersions };
