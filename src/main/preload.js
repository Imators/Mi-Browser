const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  store: {
    get: (key) => ipcRenderer.invoke('store-get', key),
    set: (key, value) => ipcRenderer.invoke('store-set', key, value),
    onChange: (callback) => ipcRenderer.on('store-changed', (event, key, value) => callback(key, value))
  },
  browser: {
    navigate: (url) => ipcRenderer.invoke('browser-navigate', url),
    back: () => ipcRenderer.send('browser-back'),
    forward: () => ipcRenderer.send('browser-forward'),
    reload: () => ipcRenderer.send('browser-reload')
  },
  window: {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close')
  },
  import: {
    detectBrowsers: () => ipcRenderer.invoke('detect-browsers'),
    importData: (browserName, selections) => ipcRenderer.invoke('import-data', browserName, selections)
  },
  app: {
    reset: () => ipcRenderer.invoke('app-reset'),
    onOpenPrivateTab: (callback) => ipcRenderer.on('open-private-tab', () => callback()),
    onOpenExternalUrl: (callback) => ipcRenderer.on('open-external-url', (event, url) => callback(url)),
    onMenuEvent: (callback) => {
      const channels = [
        'menu-new-tab', 'menu-new-private-tab', 'menu-reopen-tab', 'menu-close-tab',
        'menu-reload', 'menu-back', 'menu-forward', 'menu-history', 'menu-downloads',
        'menu-settings', 'menu-shortcuts', 'menu-why', 'menu-about',
        'menu-find-in-page', 'menu-zoom-in', 'menu-zoom-out', 'menu-zoom-reset', 'menu-toggle-devtools'
      ];
      channels.forEach((channel) => ipcRenderer.on(channel, () => callback(channel)));
    }
  },
  defaultBrowser: {
    getStatus: () => ipcRenderer.invoke('default-browser-status'),
    set: () => ipcRenderer.invoke('default-browser-set')
  },
  contextMenu: {
    show: (items) => ipcRenderer.invoke('show-context-menu', items)
  },
  clipboard: {
    writeText: (text) => ipcRenderer.invoke('clipboard-write-text', text)
  },
  history: {
    add: (entry) => ipcRenderer.invoke('history-add', entry),
    getAll: () => ipcRenderer.invoke('history-get')
  },
  bookmarks: {
    getAll: () => ipcRenderer.invoke('bookmarks-get'),
    add: (entry) => ipcRenderer.invoke('bookmarks-add', entry),
    delete: (index) => ipcRenderer.invoke('bookmarks-delete', index),
    onChange: (callback) => ipcRenderer.on('bookmarks-changed', () => callback())
  },
  passwords: {
    findForOrigin: (hostname) => ipcRenderer.invoke('passwords-find-for-origin', hostname),
    reveal: (id) => ipcRenderer.invoke('passwords-reveal', id)
  },
  cookieExceptions: {
    isExcepted: (hostname) => ipcRenderer.invoke('cookie-exceptions-is-excepted', hostname),
    setExcepted: (hostname, excepted) => ipcRenderer.invoke('cookie-exceptions-set', hostname, excepted),
    clearForSite: (hostname) => ipcRenderer.invoke('cookies-clear-for-site', hostname),
    countForSite: (hostname) => ipcRenderer.invoke('cookies-count-for-site', hostname)
  },
  downloads: {
    getAll: () => ipcRenderer.invoke('downloads-get'),
    onChange: (callback) => ipcRenderer.on('downloads-changed', () => callback())
  },
  search: {
    googleSuggest: (query) => ipcRenderer.invoke('search-suggest-google', query)
  }
});