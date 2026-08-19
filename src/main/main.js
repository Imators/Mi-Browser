const { app, BrowserWindow, ipcMain, protocol, session, net } = require('electron');
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

// Also must run before app is ready -- Chromium locks in DNS mode when its
// network service starts during startup, same as the scheme registration
// just below.
securityManager.applyDnsSettings();

// Must run before app is ready: without this, Chromium treats "mi:" as a
// non-standard scheme, and relative URLs (e.g. <script src="script.js">) on
// mi:// pages fail to resolve at all, even though absolute mi:// links work.
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

// Being the OS's chosen browser means it can hand us a URL at launch time
// (double-clicking a link when Mi Browser is the default handler) or while
// already running (second launch attempt) -- both need routing to an actual
// tab instead of being silently dropped. Windows/Linux deliver it via
// process.argv on a second instance; macOS uses the dedicated 'open-url' event.
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

// Registers Mi Browser as a candidate handler for http/https links with the
// OS, which is what makes it show up at all in macOS's "Default web browser"
// picker and Windows' "Choose default apps" -- without this the app is just
// an ordinary utility as far as the OS is concerned, however browser-like it
// looks. In dev (unpackaged), Electron needs the extra args so the OS is
// told to relaunch this exact script rather than a bare "Electron" binary.
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

// Private tabs get their own ephemeral (non-"persist:") session, which
// Electron wipes on relaunch automatically. It's a fixed name rather than
// random per launch since nothing about it survives a restart anyway --
// what matters is that it's never session.defaultSession.
const PRIVATE_SESSION_PARTITION = 'mi-private';

// Page routes are served as if their host is the document root ("mi://settings"
// has no path, so relative links like "style.css" resolve against it fine, but
// "../../assets/x.css" cannot know how deep the real file sits on disk). To keep
// sub-resource links working, every page's own folder is also its resolution root,
// and truly shared assets are referenced via the absolute "mi://static/..." host,
// which maps directly onto src/.
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

// protocol.registerFileProtocol (and the old top-level "protocol" module in
// general) only ever affects session.defaultSession -- it does NOT apply to
// other sessions, including partitioned ones. Private tabs use their own
// partition specifically so nothing about them touches the default session's
// storage, which means every mi:// page (settings, private, newtab...) would
// otherwise 404/fail silently the instant it's opened in a private tab. This
// has to be registered per-session, explicitly, for each session we use.
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

// Only our own mi:// pages need a permissive CSP (they're the ones using
// inline styles/scripts) -- everything else keeps whatever CSP the real
// site sent, instead of every website on the internet getting one
// overridden with 'unsafe-inline'/'unsafe-eval'/wide-open default-src.
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

  securityManager.setupHttpsUpgrade(session.defaultSession);
  securityManager.setupHttpsUpgrade(privateSession);
  securityManager.applyRealisticUserAgent(session.defaultSession);
  securityManager.applyRealisticUserAgent(privateSession);

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

  // Guest pages should only ever navigate to real web content or our own
  // internal pages -- never straight to a local file or a devtools-only
  // scheme, which would be a sandbox escape if a malicious page could
  // trigger it via window.open()/location.
  const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mi:', 'about:']);

  mainWindow.webContents.on('will-attach-webview', (event, webPreferences) => {
    webPreferences.preload = path.join(__dirname, 'webview-preload.js');
    webPreferences.contextIsolation = true;
    webPreferences.nodeIntegration = false;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    // Without this, Chromium throttles hidden tabs enough that switching
    // away can stall the moment right before a video hands off to the mini
    // player, and background audio can stutter too.
    webPreferences.backgroundThrottling = false;
  });

  mainWindow.webContents.on('did-attach-webview', (event, guestContents) => {
    guestContents.on('will-navigate', (navEvent, targetUrl) => {
      let protocol;
      try { protocol = new URL(targetUrl).protocol; } catch (err) { navEvent.preventDefault(); return; }
      if (!ALLOWED_PROTOCOLS.has(protocol)) navEvent.preventDefault();
    });

    // target="_blank" links and window.open() calls go through here, not
    // through a DOM event on the <webview> tag -- without an explicit
    // handler, Electron's default for a webview guest is to deny the
    // request outright, which is exactly "links never open on a normal
    // click" (right-click "open in new tab" works because that's a
    // completely different path: the app's own context menu building a
    // fresh tab directly from the link's href, never touching this at all).
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