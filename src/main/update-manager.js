const { app, net, webContents: webContentsModule } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const storage = require('./storage');

let mainWindowRef = null;

const TRUSTED_UPDATE_HOST = 'imators.systems';
const EXPECTED_TEAM_ID = 'PP84FD7UBN';

const VERSION_URL = 'https://imators.systems/mi-browser/version-operating/version.json';
const FEED_URL = 'https://imators.systems/mi-browser/version-operating/';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

// Belt-and-suspenders check independent of the checksum in latest-mac.yml:
// if the CURRENTLY RUNNING app isn't signed with our own Team ID, refuse to
// auto-update at all. A server compromise alone can't produce a payload
// that passes this plus the OS-level Squirrel.Mac identity check below,
// since that would additionally require our actual signing certificate.
let signatureVerified = false;
let signatureCheckDone = false;

function verifyRunningAppSignature() {
  return new Promise((resolve) => {
    if (process.platform !== 'darwin' || !app.isPackaged) {
      signatureCheckDone = true;
      signatureVerified = !app.isPackaged; // dev builds aren't signed; not a trust decision, just skip the gate
      resolve(signatureVerified);
      return;
    }

    // process.execPath is .../Mi Browser.app/Contents/MacOS/Mi Browser
    const bundlePath = path.resolve(path.dirname(process.execPath), '../..');
    execFile('codesign', ['-dvvv', bundlePath], (err, stdout, stderr) => {
      signatureCheckDone = true;
      const output = `${stdout}${stderr}`;
      const match = output.match(/TeamIdentifier=([A-Z0-9]+)/);
      signatureVerified = !err && !!match && match[1] === EXPECTED_TEAM_ID;
      if (!signatureVerified) {
        console.error('Mi Browser: running app signature check failed, disabling auto-update', err ? err.message : output);
      }
      resolve(signatureVerified);
    });
  });
}

function isTrustedUpdateUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === TRUSTED_UPDATE_HOST;
  } catch (err) {
    return false;
  }
}

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

    if (!data || typeof data.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(data.version)) {
      throw new Error('Malformed version.json');
    }

    const rawDownloadUrl = (data.downloads && data.downloads[platformKey()]) || null;

    result = {
      checkedAt: Date.now(),
      ok: true,
      currentVersion,
      latestVersion: data.version,
      updateAvailable: compareVersions(data.version, currentVersion) > 0,
      releaseDate: data.releaseDate || null,
      releaseTime: data.releaseTime || null,
      changelog: Array.isArray(data.changelog) ? data.changelog.filter((line) => typeof line === 'string') : [],
      // Reject anything not served from our own trusted host, even though
      // nothing currently opens this URL directly — future-proofing against
      // a compromised or misconfigured version.json response.
      downloadUrl: isTrustedUpdateUrl(rawDownloadUrl) ? rawDownloadUrl : null
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

  if (!signatureCheckDone) await verifyRunningAppSignature();
  if (!signatureVerified) {
    installState = 'error';
    broadcast('update-install-progress', { state: 'error', message: "This copy of Mi Browser isn't signed the way we expect, so auto-update has been disabled as a precaution. Please reinstall from an official source." });
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
  verifyRunningAppSignature();
  setTimeout(checkForUpdate, 5000);
  setInterval(checkForUpdate, CHECK_INTERVAL_MS);
}

module.exports = { setup, checkForUpdate, getCached, startAutoUpdate, getInstallState, compareVersions };
