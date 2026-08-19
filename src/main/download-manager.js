const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { webContents: webContentsModule, shell, app, dialog, BrowserWindow } = require('electron');
const storage = require('./storage');

const events = new EventEmitter();

const RISKY_EXTENSIONS = new Set([
  'exe', 'msi', 'msix', 'bat', 'cmd', 'com', 'scr', 'pif', 'vbs', 'vbe',
  'js', 'jse', 'wsf', 'wsh', 'jar', 'apk', 'sh', 'ps1', 'reg', 'gadget', 'hta'
]);

function getDownloadSafety() {
  return { malwareCheck: true, massDownloadLimit: 5, ...(storage.get('downloadSafety') || {}) };
}

let recentStarts = [];
let massWarningCooldownUntil = 0;
const MASS_WINDOW_MS = 8000;

function uniqueSavePath(filename) {
  const customDir = storage.get('downloadsFolder');
  const dir = (customDir && fs.existsSync(customDir)) ? customDir : app.getPath('downloads');
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);

  let candidate = path.join(dir, filename);
  let n = 1;
  while (fs.existsSync(candidate)) {
    n += 1;
    candidate = path.join(dir, `${base} (${n})${ext}`);
  }
  return candidate;
}

const MAX_DOWNLOADS = 500;

const activeItems = new Map(); // id -> Electron DownloadItem, for pause/resume/cancel while in-flight
let idCounter = 0;

function getAll() {
  return storage.get('downloads') || [];
}

function save(list) {
  if (list.length > MAX_DOWNLOADS) list.length = MAX_DOWNLOADS;
  storage.set('downloads', list);
}

function broadcast() {
  webContentsModule.getAllWebContents().forEach((wc) => {
    if (!wc.isDestroyed()) wc.send('downloads-changed');
  });
  events.emit('changed');
}

function addRecord(record) {
  const list = getAll();
  list.unshift(record);
  save(list);
  broadcast();
}

function updateRecord(id, patch) {
  const list = getAll();
  const index = list.findIndex((d) => d.id === id);
  if (index === -1) return;
  list[index] = { ...list[index], ...patch };
  save(list);
  broadcast();
}

function clear() {
  activeItems.clear();
  storage.set('downloads', []);
  broadcast();
}

function deleteEntry(id) {
  activeItems.delete(id);
  save(getAll().filter((d) => d.id !== id));
}

function setupSession(targetSession, ownerWindow) {
  targetSession.on('will-download', (event, item) => {
    idCounter += 1;
    const id = `dl-${Date.now()}-${idCounter}`;
    const filename = item.getFilename();
    const ext = path.extname(filename).slice(1).toLowerCase();
    const savePath = uniqueSavePath(filename);
    item.setSavePath(savePath);

    addRecord({
      id,
      filename,
      url: item.getURL(),
      savePath,
      totalBytes: item.getTotalBytes(),
      receivedBytes: 0,
      state: 'progressing',
      paused: false,
      startTime: Date.now()
    });

    activeItems.set(id, item);
    let settled = false;

    (async () => {
      const safety = getDownloadSafety();
      const win = ownerWindow && !ownerWindow.isDestroyed() ? ownerWindow : BrowserWindow.getFocusedWindow();

      if (safety.malwareCheck && RISKY_EXTENSIONS.has(ext)) {
        item.pause();
        const { response } = await dialog.showMessageBox(win, {
          type: 'warning',
          buttons: ['Discard file', 'Keep downloading'],
          defaultId: 0,
          cancelId: 0,
          title: 'This file type can be risky',
          message: `"${filename}" is a ${ext.toUpperCase()} file`,
          detail: 'Files like this can run code on your computer. Mi Browser only checks the file type, not its actual contents, so only keep it if you trust where it came from.'
        });
        if (response === 0) {
          item.cancel();
          return;
        }
        if (item.canResume()) item.resume();
      }

      const now = Date.now();
      recentStarts = recentStarts.filter((t) => now - t < MASS_WINDOW_MS);
      recentStarts.push(now);

      if (safety.massDownloadLimit > 0 && recentStarts.length > safety.massDownloadLimit && now > massWarningCooldownUntil) {
        massWarningCooldownUntil = now + MASS_WINDOW_MS;
        item.pause();
        const { response } = await dialog.showMessageBox(win, {
          type: 'warning',
          buttons: ['Cancel this download', 'Let it through'],
          defaultId: 0,
          cancelId: 0,
          title: 'Lots of downloads at once',
          message: `More than ${safety.massDownloadLimit} downloads started within a few seconds`,
          detail: 'That can happen with a site trying to dump lots of files on you at once. This is your one warning for the next few seconds -- further downloads in that window won\'t ask again.'
        });
        if (response === 0) {
          item.cancel();
          return;
        }
        if (item.canResume()) item.resume();
      }
    })();

    function settle(state) {
      if (settled) return;
      settled = true;
      updateRecord(id, {
        state,
        receivedBytes: item.getReceivedBytes(),
        savePath: item.getSavePath() || null
      });
      activeItems.delete(id);
    }

    item.on('updated', (e, state) => {
      updateRecord(id, {
        state: state === 'interrupted' ? 'interrupted' : 'progressing',
        paused: item.isPaused(),
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
        savePath: item.getSavePath() || null
      });

      const total = item.getTotalBytes();
      if (total > 0 && item.getReceivedBytes() >= total) {
        setTimeout(() => {
          const current = item.getState();
          if (current !== 'progressing') settle(current);
        }, 300);
      }
    });

    item.once('done', (e, state) => settle(state));

    const currentState = item.getState();
    if (currentState !== 'progressing') settle(currentState);
  });
}

function pause(id) {
  const item = activeItems.get(id);
  if (item) item.pause();
}

function resumeItem(id) {
  const item = activeItems.get(id);
  if (item && item.canResume()) item.resume();
}

function cancel(id) {
  const item = activeItems.get(id);
  if (item) item.cancel();
}

function openFile(id) {
  const entry = getAll().find((d) => d.id === id);
  if (entry && entry.savePath) shell.openPath(entry.savePath);
}

function showInFolder(id) {
  const entry = getAll().find((d) => d.id === id);
  if (entry && entry.savePath) shell.showItemInFolder(entry.savePath);
}

module.exports = { getAll, setupSession, clear, deleteEntry, pause, resumeItem, cancel, openFile, showInFolder, events };
