const { app, BrowserWindow, ipcMain, protocol, session, net, shell } = require('electron');
const path = require('path');
const { execFile } = require('child_process');
const windowManager = require('./window-manager');
const ipcHandlers = require('./ipc-handlers');
const cookieManager = require('./cookie-manager');
const permissionManager = require('./permission-manager');
const downloadManager = require('./download-manager');
const appMenu = require('./app-menu');
const nativeIntegration = require('./native-integration');
const securityManager = require('./security-manager');
const updateManager = require('./update-manager');

securityManager.applyUserAgentClientHints();

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'mi',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

let mainWindow;

function openUrlInNewTab(url) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
  mainWindow.webContents.send('open-external-url', url);
}

function extractUrlFromArgv(argv) {
  return argv.find((arg) => arg.startsWith('http://') || arg.startsWith('https://'));
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    const url = extractUrlFromArgv(argv);
    if (url) openUrlInNewTab(url);
    else if (mainWindow) { mainWindow.focus(); }
  });
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  openUrlInNewTab(url);
});

function registerAsBrowserCandidate() {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('http', process.execPath, [path.resolve(process.argv[1])]);
      app.setAsDefaultProtocolClient('https', process.execPath, [path.resolve(process.argv[1])]);
    }
  } else {
    app.setAsDefaultProtocolClient('http');
    app.setAsDefaultProtocolClient('https');
  }
}

const PRIVATE_SESSION_PARTITION = 'mi-private';

const RENDERER_DIR = path.join(__dirname, '../renderer');
const SRC_DIR = path.join(__dirname, '..');

const MI_PAGES = {
  newtab: path.join(RENDERER_DIR, 'browser/newtab.html'),
  private: path.join(RENDERER_DIR, 'browser/private.html'),
  settings: path.join(RENDERER_DIR, 'settings/index.html'),
  history: path.join(RENDERER_DIR, 'history/index.html'),
  downloads: path.join(RENDERER_DIR, 'downloads/index.html'),
  404: path.join(RENDERER_DIR, 'errors/404.html'),
  500: path.join(RENDERER_DIR, 'errors/500.html'),
  offline: path.join(RENDERER_DIR, 'errors/offline.html')
};

const NEWTAB_BG_DIR = path.join(app.getPath('userData'), 'newtab-background');
const PARTNER_THEMES_DIR = path.join(app.getPath('userData'), 'partner-themes');

// Chromium's own file:// mime sniffing doesn't always land on the right
// type for every extension (webp in particular), so pin the ones we serve
// through mi:// explicitly rather than trust the guess.
const MI_MIME_TYPES = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4'
};

function registerMiProtocol(targetSession) {
  targetSession.protocol.handle('mi', async (request) => {
    const url = new URL(request.url);
    const host = url.hostname;
    const subPath = decodeURIComponent(url.pathname).replace(/^\/+/, '');

    const filePath = host === 'static'
      ? path.join(SRC_DIR, subPath)
      : host === 'background'
        ? path.join(NEWTAB_BG_DIR, subPath)
        : host === 'partner-theme'
          ? path.join(PARTNER_THEMES_DIR, subPath)
          : (() => {
            const pageFile = MI_PAGES[host] || MI_PAGES[404];
            return subPath ? path.join(path.dirname(pageFile), subPath) : pageFile;
          })();

    const response = await net.fetch(`file://${filePath}`);
    const mime = MI_MIME_TYPES[path.extname(filePath).toLowerCase()];
    if (mime && response.ok && response.headers.get('content-type') !== mime) {
      const buffer = await response.arrayBuffer();
      return new Response(buffer, { status: response.status, headers: { 'Content-Type': mime } });
    }
    return response;
  });
}

function registerMiCsp(targetSession) {
  targetSession.webRequest.onHeadersReceived((details, callback) => {
    if (!details.url.startsWith('mi://')) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self' mi: data: blob: 'unsafe-inline' 'unsafe-eval';"]
      }
    });
  });
}

app.on('ready', () => {
  securityManager.applyDnsSettings();
  registerAsBrowserCandidate();

  registerMiCsp(session.defaultSession);
  registerMiProtocol(session.defaultSession);

  const privateSession = session.fromPartition(PRIVATE_SESSION_PARTITION);
  registerMiCsp(privateSession);
  registerMiProtocol(privateSession);

  const spellcheckEnabled = require('./storage').get('spellcheckEnabled');
  const spellcheckOn = spellcheckEnabled === null ? true : !!spellcheckEnabled;
  session.defaultSession.setSpellCheckerEnabled(spellcheckOn);
  privateSession.setSpellCheckerEnabled(spellcheckOn);

  securityManager.applyRealisticUserAgent(session.defaultSession);
  securityManager.applyRealisticUserAgent(privateSession);
  securityManager.setupRequestInterception(session.defaultSession);
  securityManager.setupRequestInterception(privateSession);
  securityManager.setupGpcSignal(session.defaultSession);
  securityManager.setupGpcSignal(privateSession);
  mainWindow = windowManager.createMainWindow();
  securityManager.setupWebRtcProtection(mainWindow.webContents);
  ipcHandlers.register(mainWindow);

  let quittingConfirmed = false;
  mainWindow.on('close', (event) => {
    if (quittingConfirmed) return;
    event.preventDefault();
    mainWindow.webContents.send('request-app-quit');
  });
  ipcMain.on('quit-confirmed', () => {
    quittingConfirmed = true;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
  });
  cookieManager.start();
  permissionManager.setup(mainWindow);
  permissionManager.setup(mainWindow, privateSession);
  downloadManager.setupSession(session.defaultSession, mainWindow);
  downloadManager.setupSession(privateSession, mainWindow);
  appMenu.setup(mainWindow);
  nativeIntegration.setup(mainWindow);
  updateManager.setup(mainWindow);

  const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mi:', 'about:']);

  mainWindow.webContents.on('will-attach-webview', (event, webPreferences) => {
    webPreferences.preload = path.join(__dirname, 'webview-preload.js');
    webPreferences.contextIsolation = true;
    webPreferences.nodeIntegration = false;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    webPreferences.backgroundThrottling = false;
  });

  ipcMain.handle('open-in-other-browser', (event, targetUrl) => {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (err) {
      return;
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return;
    openInAnotherBrowser(parsed.href);
  });

  function openInAnotherBrowser(url) {
    if (process.platform === 'darwin') {
      execFile('open', ['-a', 'Safari', url], (err) => {
        if (err) shell.openExternal(url);
      });
    } else if (process.platform === 'win32') {
      execFile('cmd.exe', ['/c', 'start', '', 'microsoft-edge:' + url], (err) => {
        if (err) shell.openExternal(url);
      });
    } else {
      tryLinuxBrowsers(['firefox', 'google-chrome', 'chromium-browser', 'chromium'], url);
    }
  }

  function tryLinuxBrowsers(candidates, url) {
    if (candidates.length === 0) {
      shell.openExternal(url);
      return;
    }
    const [bin, ...rest] = candidates;
    execFile(bin, [url], (err) => {
      if (err) tryLinuxBrowsers(rest, url);
    });
  }

  mainWindow.webContents.on('did-attach-webview', (event, guestContents) => {
    securityManager.setupWebRtcProtection(guestContents);

    guestContents.on('will-navigate', (navEvent, targetUrl) => {
      let protocol;
      try { protocol = new URL(targetUrl).protocol; } catch (err) { navEvent.preventDefault(); return; }
      if (!ALLOWED_PROTOCOLS.has(protocol)) navEvent.preventDefault();
    });

    guestContents.setWindowOpenHandler(({ url }) => {
      mainWindow.webContents.send('guest-new-window', guestContents.id, url);
      return { action: 'deny' };
    });
  });
});

app.whenReady().then(() => {
  console.log(app.getPath('userData'))
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    mainWindow = windowManager.createMainWindow();
  }
});