const { session, dialog } = require('electron');
const storage = require('./storage');

const PROMPTED_PERMISSIONS = ['geolocation', 'media', 'camera', 'microphone'];

const PERMISSION_LABELS = {
  geolocation: 'know your location',
  media: 'use your camera and microphone',
  camera: 'use your camera',
  microphone: 'use your microphone'
};

function getDecisions() {
  return storage.get('permissionDecisions') || {};
}

function setDecision(origin, permission, allowed) {
  const decisions = getDecisions();
  decisions[origin] = { ...(decisions[origin] || {}), [permission]: allowed };
  storage.set('permissionDecisions', decisions);
}

function setup(mainWindow, targetSession) {
  (targetSession || session.defaultSession).setPermissionRequestHandler(async (webContents, permission, callback, details) => {
    if (permission === 'notifications') {
      callback(true);
      return;
    }

    if (!PROMPTED_PERMISSIONS.includes(permission)) {
      callback(false);
      return;
    }

    let origin;
    try {
      origin = new URL(details.requestingUrl).origin;
    } catch (err) {
      callback(false);
      return;
    }

    const decisions = getDecisions();
    if (decisions[origin] && permission in decisions[origin]) {
      callback(decisions[origin][permission]);
      return;
    }

    const hostname = new URL(origin).hostname;
    const label = PERMISSION_LABELS[permission] || permission;

    const { response, checkboxChecked } = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Block', 'Allow'],
      defaultId: 0,
      cancelId: 0,
      title: 'Permission request',
      message: `${hostname} wants to ${label}`,
      checkboxLabel: 'Remember for this site',
      checkboxChecked: true
    });

    const allowed = response === 1;
    if (checkboxChecked) setDecision(origin, permission, allowed);
    callback(allowed);
  });
}

module.exports = { setup };
