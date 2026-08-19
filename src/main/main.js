const { app, BrowserWindow, ipcMain, protocol, session, net, shell, Notification } = require('electron');
const path = require('path');
const windowManager = require('./window-manager');
const ipcHandlers = require('./ipc-handlers');
const cookieManager = require('./cookie-manager');
const permissionManager = require('./permission-manager');
const downloadManager = require('./download-manager');
const appMenu = require('./app-menu');
const nativeIntegration = require('./native-integration');
const securityManager = require('./security-manager');
const updateManager = require('./update-manager');

securityManager.applyDnsSettings();
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

function registerMiProtocol(targetSession) {
  targetSession.protocol.handle('mi', (request) => {
    const url = new URL(request.url);
    const host = url.hostname;
    const subPath = decodeURIComponent(url.pathname).replace(/^\/+/, '');

    const filePath = host === 'static'
      ? path.join(SRC_DIR, subPath)
      : (() => {
        const pageFile = MI_PAGES[host] || MI_PAGES[404];
        return subPath ? path.join(path.dirname(pageFile), subPath) : pageFile;
      })();

    return net.fetch(`file://${filePath}`);
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
  securityManager.setupRequestInterception(session.defaultSession, openGoogleSignInExternally);
  securityManager.setupRequestInterception(privateSession, openGoogleSignInExternally);

  mainWindow = windowManager.createMainWindow();
  ipcHandlers.register(mainWindow);
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

  function openGoogleSignInExternally(targetUrl) {
    shell.openExternal(targetUrl);
    if (Notification.isSupported()) {
      new Notification({
        title: 'Opened in your default browser',
        body: 'Google blocks sign-in inside embedded browsers like Mi Browser, so this opened in your system browser instead.'
      }).show();
    }
  }

  mainWindow.webContents.on('did-attach-webview', (event, guestContents) => {
    guestContents.on('will-navigate', (navEvent, targetUrl) => {
      if (securityManager.isGoogleSignInUrl(targetUrl)) {
        navEvent.preventDefault();
        openGoogleSignInExternally(targetUrl);
        return;
      }
      let protocol;
      try { protocol = new URL(targetUrl).protocol; } catch (err) { navEvent.preventDefault(); return; }
      if (!ALLOWED_PROTOCOLS.has(protocol)) navEvent.preventDefault();
    });

    guestContents.setWindowOpenHandler(({ url }) => {
      if (securityManager.isGoogleSignInUrl(url)) {
        openGoogleSignInExternally(url);
        return { action: 'deny' };
      }
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