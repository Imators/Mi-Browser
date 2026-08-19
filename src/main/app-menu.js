const { Menu, app, shell } = require('electron');

function send(mainWindow, channel) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel);
}

function buildMenu(mainWindow) {
  const isMac = process.platform === 'darwin';

  const appMenu = isMac ? [{
    label: app.name,
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { label: 'Settings…', accelerator: 'Cmd+,', click: () => send(mainWindow, 'menu-settings') },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' }
    ]
  }] : [];

  const fileMenu = {
    label: 'File',
    submenu: [
      { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => send(mainWindow, 'menu-new-tab') },
      { label: 'New Private Tab', accelerator: 'CmdOrCtrl+Shift+N', click: () => send(mainWindow, 'menu-new-private-tab') },
      { label: 'Reopen Closed Tab', accelerator: 'CmdOrCtrl+Shift+T', click: () => send(mainWindow, 'menu-reopen-tab') },
      { type: 'separator' },
      { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => send(mainWindow, 'menu-close-tab') },
      { type: 'separator' },
      isMac ? { role: 'close' } : { label: 'Exit', role: 'quit' }
    ]
  };

  const editMenu = {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
      { type: 'separator' },
      { label: 'Find in Page', accelerator: 'CmdOrCtrl+F', click: () => send(mainWindow, 'menu-find-in-page') }
    ]
  };

  const viewMenu = {
    label: 'View',
    submenu: [
      { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => send(mainWindow, 'menu-reload') },
      { type: 'separator' },
      { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: () => send(mainWindow, 'menu-zoom-reset') },
      { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', click: () => send(mainWindow, 'menu-zoom-in') },
      { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => send(mainWindow, 'menu-zoom-out') },
      { type: 'separator' },
      { role: 'togglefullscreen' },
      { type: 'separator' },
      { label: 'Toggle DevTools for Page', accelerator: 'CmdOrCtrl+Alt+I', click: () => send(mainWindow, 'menu-toggle-devtools') }
    ]
  };

  const historyMenu = {
    label: 'History',
    submenu: [
      { label: 'Back', accelerator: 'CmdOrCtrl+[', click: () => send(mainWindow, 'menu-back') },
      { label: 'Forward', accelerator: 'CmdOrCtrl+]', click: () => send(mainWindow, 'menu-forward') },
      { type: 'separator' },
      { label: 'Show Full History', accelerator: 'CmdOrCtrl+H', click: () => send(mainWindow, 'menu-history') },
      { label: 'Downloads', accelerator: 'CmdOrCtrl+J', click: () => send(mainWindow, 'menu-downloads') }
    ]
  };

  const windowMenu = {
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      { role: isMac ? 'zoom' : 'maximize' },
      ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [])
    ]
  };

  const helpMenu = {
    label: 'Help',
    submenu: [
      { label: 'Why Mi Browser', click: () => send(mainWindow, 'menu-why') },
      { label: 'Keyboard Shortcuts', click: () => send(mainWindow, 'menu-shortcuts') },
      { type: 'separator' },
      { label: 'Report an Issue', click: () => shell.openExternal('https://mibrowser.imators.com') },
      ...(!isMac ? [{ type: 'separator' }, { label: 'About Mi Browser', click: () => send(mainWindow, 'menu-about') }] : [])
    ]
  };

  return Menu.buildFromTemplate([...appMenu, fileMenu, editMenu, viewMenu, historyMenu, windowMenu, helpMenu]);
}

function setup(mainWindow) {
  if (process.platform === 'darwin') {
    app.setAboutPanelOptions({
      applicationName: 'Mi Browser',
      applicationVersion: app.getVersion(),
      copyright: 'Imators LLC'
    });
  }
  Menu.setApplicationMenu(buildMenu(mainWindow));
}

module.exports = { setup };
