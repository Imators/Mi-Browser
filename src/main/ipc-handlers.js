const { ipcMain, app, webContents, session, Menu, BrowserWindow, clipboard, dialog, net, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const storage = require('./storage');
const importManager = require('./import-manager');
const historyManager = require('./history-manager');
const bookmarksManager = require('./bookmarks-manager');
const passwordManager = require('./password-manager');
const cookieManager = require('./cookie-manager');
const downloadManager = require('./download-manager');
const nativeIntegration = require('./native-integration');
const securityManager = require('./security-manager');
const updateManager = require('./update-manager');
const getOutManager = require('./get-out-manager');

function register(mainWindow) {
  ipcMain.handle('store-get', (event, key) => {
    return storage.get(key);
  });

  ipcMain.handle('store-set', (event, key, value) => {
    storage.set(key, value);
    webContents.getAllWebContents().forEach((wc) => {
      if (!wc.isDestroyed()) wc.send('store-changed', key, value);
    });
    if (key === 'features') cookieManager.runIfDue();
    if (key === 'launchAtLogin') nativeIntegration.applyLoginItemSetting();
  });

  ipcMain.handle('detect-browsers', async (event) => {
    return await importManager.detectBrowsers();
  });

  ipcMain.handle('import-data', async (event, browserName, selections) => {
    const result = await importManager.importData(browserName, selections);
    if (!result) return null;

    const historyAdded = historyManager.mergeImported(result.history);
    const bookmarksAdded = bookmarksManager.mergeImported(result.bookmarks);
    const passwordsAdded = passwordManager.mergeImported(result.passwords);
    if (bookmarksAdded > 0) broadcastBookmarksChanged();

    return {
      historyAdded,
      bookmarksAdded,
      passwordsAdded,
      passwordsSupported: result.passwordsSupported
    };
  });

  ipcMain.handle('history-get', () => historyManager.getAll());
  ipcMain.handle('history-add', (event, entry) => historyManager.add(entry));
  ipcMain.handle('history-clear', () => historyManager.clear());
  ipcMain.handle('history-delete', (event, index) => historyManager.deleteEntry(index));

  function broadcastBookmarksChanged() {
    webContents.getAllWebContents().forEach((wc) => {
      if (!wc.isDestroyed()) wc.send('bookmarks-changed');
    });
  }

  ipcMain.handle('bookmarks-get', () => bookmarksManager.getAll());
  ipcMain.handle('bookmarks-clear', () => { bookmarksManager.clear(); broadcastBookmarksChanged(); });
  ipcMain.handle('bookmarks-delete', (event, index) => { bookmarksManager.deleteEntry(index); broadcastBookmarksChanged(); });
  ipcMain.handle('bookmarks-add', (event, entry) => {
    const added = bookmarksManager.add(entry);
    if (added) broadcastBookmarksChanged();
    return added;
  });

  ipcMain.handle('passwords-get', () => passwordManager.getAll());
  ipcMain.handle('passwords-reveal', (event, id) => passwordManager.reveal(id));
  ipcMain.handle('passwords-delete', (event, id) => passwordManager.remove(id));
  ipcMain.handle('passwords-clear', () => passwordManager.clear());
  ipcMain.handle('passwords-find-for-origin', (event, hostname) => passwordManager.findForOrigin(hostname));
  ipcMain.handle('passwords-add-manual', (event, origin, username, password) => passwordManager.addManual(origin, username, password));

  ipcMain.handle('cookie-exceptions-is-excepted', (event, hostname) => cookieManager.isExcepted(hostname));
  ipcMain.handle('cookie-exceptions-set', (event, hostname, excepted) => cookieManager.setExcepted(hostname, excepted));

  ipcMain.handle('get-out-is-excepted', (event, hostname) => getOutManager.isExcepted(hostname));
  ipcMain.handle('get-out-set-excepted', (event, hostname, excepted) => getOutManager.setExcepted(hostname, excepted));
  ipcMain.handle('get-out-is-enabled', () => getOutManager.isGloballyEnabled());
  ipcMain.handle('get-out-get-exceptions', () => getOutManager.getExceptions());
  ipcMain.handle('get-out-get-stats', () => getOutManager.getStats());
  ipcMain.handle('get-out-get-blocklist-info', () => ({
    size: getOutManager.getBlocklistSize(),
    categorySizes: getOutManager.getCategorySizes(),
    enabledCategories: getOutManager.getEnabledCategories()
  }));
  ipcMain.handle('cookies-clear-for-site', (event, hostname) => cookieManager.sweepCookies({ onlyHostname: hostname }));
  ipcMain.handle('cookies-count-for-site', (event, hostname) => cookieManager.countForSite(hostname));

  ipcMain.handle('downloads-get', () => downloadManager.getAll());
  ipcMain.handle('downloads-clear', () => downloadManager.clear());
  ipcMain.handle('downloads-delete', (event, id) => downloadManager.deleteEntry(id));
  ipcMain.handle('downloads-pause', (event, id) => downloadManager.pause(id));
  ipcMain.handle('downloads-resume', (event, id) => downloadManager.resumeItem(id));
  ipcMain.handle('downloads-cancel', (event, id) => downloadManager.cancel(id));
  ipcMain.handle('downloads-open', (event, id) => downloadManager.openFile(id));
  ipcMain.handle('downloads-show-in-folder', (event, id) => downloadManager.showInFolder(id));

  ipcMain.handle('stats-get', () => {
    const stats = storage.get('stats') || {};
    return {
      historyCount: historyManager.getAll().length,
      bookmarksCount: bookmarksManager.getAll().length,
      passwordsCount: passwordManager.getAll().length,
      cookiesClearedRuns: stats.cookiesClearedRuns || 0,
      lastCookieClear: stats.lastCookieClear || null
    };
  });

  ipcMain.on('window-minimize', () => {
    mainWindow.minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.on('window-close', () => {
    mainWindow.close();
  });

  ipcMain.on('get-air-tab-key-sync', (event) => {
    const customization = storage.get('customization') || {};
    event.returnValue = customization.airTabKey || 'Control';
  });

  ipcMain.handle('app-reset', () => {
    storage.reset();
    app.relaunch();
    app.exit();
  });

  ipcMain.handle('clear-browsing-data', async () => {
    await session.defaultSession.clearStorageData();
    await session.defaultSession.clearCache();
    storage.set('session-tabs', []);
  });

  ipcMain.handle('show-context-menu', (event, items) => {
    return new Promise((resolve) => {
      let resolved = false;

      const template = items.map((item) => {
        if (item.type === 'separator') return { type: 'separator' };
        return {
          label: item.label,
          enabled: item.enabled !== false,
          click: () => {
            resolved = true;
            resolve(item.id);
          }
        };
      });

      const menu = Menu.buildFromTemplate(template);
      const win = BrowserWindow.fromWebContents(event.sender);

      menu.popup({
        window: win,
        callback: () => {
          if (!resolved) resolve(null);
        }
      });
    });
  });

  ipcMain.handle('clipboard-write-text', (event, text) => {
    clipboard.writeText(text);
  });

  ipcMain.handle('search-suggest-google', async (event, query) => {
    const features = storage.get('features') || {};
    if (!features.googleSuggest || !query || typeof query !== 'string') return [];

    try {
      const response = await net.fetch(`https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`);
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) && Array.isArray(data[1]) ? data[1].slice(0, 6) : [];
    } catch (err) {
      return [];
    }
  });

  ipcMain.handle('security-get', () => {
    const stored = storage.get('security') || {};
    return {
      dnsProvider: securityManager.getDnsProvider(),
      activeDnsProvider: securityManager.getActiveDnsProvider(),
      httpsOnly: stored.httpsOnly === true,
      getOutEnabled: stored.getOutEnabled !== false,
      getOutCategories: getOutManager.getEnabledCategories()
    };
  });

  ipcMain.handle('security-set', (event, patch) => {
    const current = storage.get('security') || {};
    storage.set('security', { ...current, ...patch });
  });

  ipcMain.handle('app-restart', () => {
    app.relaunch();
    app.exit();
  });

  ipcMain.handle('update-check', () => updateManager.checkForUpdate());
  ipcMain.handle('update-get-cached', () => updateManager.getCached());
  ipcMain.handle('update-start-auto', () => updateManager.startAutoUpdate());
  ipcMain.handle('update-get-install-state', () => updateManager.getInstallState());

  ipcMain.handle('capture-webview', async (event, webContentsId) => {
    const target = webContents.fromId(webContentsId);
    if (!target || target.isDestroyed()) return { success: false };

    const image = await target.capturePage();
    const savePath = downloadManager.uniqueSavePath('Mi Browser Screenshot.png');
    fs.writeFileSync(savePath, image.toPNG());
    shell.showItemInFolder(savePath);
    return { success: true, path: savePath };
  });

  ipcMain.handle('choose-downloads-folder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Choose a downloads folder',
      properties: ['openDirectory', 'createDirectory']
    });
    if (canceled || filePaths.length === 0) return null;
    storage.set('downloadsFolder', filePaths[0]);
    return filePaths[0];
  });

  ipcMain.handle('newtab-bg-choose', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Choose an image or video for the New Tab background',
      properties: ['openFile'],
      filters: [
        { name: 'Images and videos', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4'] },
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
        { name: 'Video', extensions: ['mp4'] }
      ]
    });
    if (canceled || filePaths.length === 0) return null;

    const sourcePath = filePaths[0];
    const ext = path.extname(sourcePath).toLowerCase();
    const type = ext === '.mp4' ? 'video' : 'image';

    const bgDir = path.join(app.getPath('userData'), 'newtab-background');
    if (!fs.existsSync(bgDir)) fs.mkdirSync(bgDir, { recursive: true });

    fs.readdirSync(bgDir).forEach((f) => fs.unlinkSync(path.join(bgDir, f)));
    const filename = `bg${ext}`;
    fs.copyFileSync(sourcePath, path.join(bgDir, filename));

    const current = storage.get('customization') || {};
    const updated = { ...current, newTabBackgroundMedia: { type, filename, addedAt: Date.now() } };
    storage.set('customization', updated);
    webContents.getAllWebContents().forEach((wc) => {
      if (!wc.isDestroyed()) wc.send('store-changed', 'customization', updated);
    });

    return { type, filename };
  });

  ipcMain.handle('newtab-bg-clear', () => {
    const bgDir = path.join(app.getPath('userData'), 'newtab-background');
    if (fs.existsSync(bgDir)) {
      fs.readdirSync(bgDir).forEach((f) => fs.unlinkSync(path.join(bgDir, f)));
    }
    const current = storage.get('customization') || {};
    const updated = { ...current, newTabBackgroundMedia: null };
    storage.set('customization', updated);
    webContents.getAllWebContents().forEach((wc) => {
      if (!wc.isDestroyed()) wc.send('store-changed', 'customization', updated);
    });
  });

  ipcMain.handle('set-spellcheck-enabled', (event, enabled) => {
    session.defaultSession.setSpellCheckerEnabled(!!enabled);
    session.fromPartition('mi-private').setSpellCheckerEnabled(!!enabled);
  });

  ipcMain.handle('open-private-tab', () => {
    mainWindow.webContents.send('open-private-tab');
  });

  ipcMain.handle('default-browser-status', () => {
    return { isDefault: app.isDefaultProtocolClient('https') };
  });

  ipcMain.handle('default-browser-set', () => {
    if (process.defaultApp && process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('http', process.execPath, [require('path').resolve(process.argv[1])]);
      app.setAsDefaultProtocolClient('https', process.execPath, [require('path').resolve(process.argv[1])]);
    } else {
      app.setAsDefaultProtocolClient('http');
      app.setAsDefaultProtocolClient('https');
    }
    return { isDefault: app.isDefaultProtocolClient('https') };
  });
}

module.exports = {
  register
};