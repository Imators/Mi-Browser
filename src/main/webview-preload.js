const { contextBridge, ipcRenderer } = require('electron');

if (location.protocol === 'mi:') {
  contextBridge.exposeInMainWorld('electron', {
    store: {
      get: (key) => ipcRenderer.invoke('store-get', key),
      set: (key, value) => ipcRenderer.invoke('store-set', key, value),
      onChange: (callback) => ipcRenderer.on('store-changed', (event, key, value) => callback(key, value))
    },
    app: {
      reset: () => ipcRenderer.invoke('app-reset'),
      clearBrowsingData: () => ipcRenderer.invoke('clear-browsing-data'),
      openPrivateTab: () => ipcRenderer.invoke('open-private-tab')
    },
    defaultBrowser: {
      getStatus: () => ipcRenderer.invoke('default-browser-status'),
      set: () => ipcRenderer.invoke('default-browser-set')
    },
    system: {
      chooseDownloadsFolder: () => ipcRenderer.invoke('choose-downloads-folder'),
      setSpellcheckEnabled: (enabled) => ipcRenderer.invoke('set-spellcheck-enabled', enabled)
    },
    import: {
      detectBrowsers: () => ipcRenderer.invoke('detect-browsers'),
      importData: (browserName, selections) => ipcRenderer.invoke('import-data', browserName, selections)
    },
    history: {
      getAll: () => ipcRenderer.invoke('history-get'),
      clear: () => ipcRenderer.invoke('history-clear'),
      delete: (index) => ipcRenderer.invoke('history-delete', index)
    },
    bookmarks: {
      getAll: () => ipcRenderer.invoke('bookmarks-get'),
      clear: () => ipcRenderer.invoke('bookmarks-clear'),
      delete: (index) => ipcRenderer.invoke('bookmarks-delete', index)
    },
    passwords: {
      getAll: () => ipcRenderer.invoke('passwords-get'),
      reveal: (id) => ipcRenderer.invoke('passwords-reveal', id),
      delete: (id) => ipcRenderer.invoke('passwords-delete', id),
      clear: () => ipcRenderer.invoke('passwords-clear'),
      addManual: (origin, username, password) => ipcRenderer.invoke('passwords-add-manual', origin, username, password)
    },
    stats: {
      get: () => ipcRenderer.invoke('stats-get')
    },
    downloads: {
      getAll: () => ipcRenderer.invoke('downloads-get'),
      clear: () => ipcRenderer.invoke('downloads-clear'),
      delete: (id) => ipcRenderer.invoke('downloads-delete', id),
      pause: (id) => ipcRenderer.invoke('downloads-pause', id),
      resume: (id) => ipcRenderer.invoke('downloads-resume', id),
      cancel: (id) => ipcRenderer.invoke('downloads-cancel', id),
      open: (id) => ipcRenderer.invoke('downloads-open', id),
      showInFolder: (id) => ipcRenderer.invoke('downloads-show-in-folder', id),
      onChange: (callback) => ipcRenderer.on('downloads-changed', () => callback())
    }
  });
}

// Password-autofill suggestion content script. Runs on every page (unlike
// the block above), but never gets direct access to the vault: it can only
// ask the host "any saved logins for this page?" and "fill in entry X",
// mediated over ipcRenderer.sendToHost/webview.send. The host (browser/
// script.js, which does have window.electron.passwords) verifies the real
// page URL itself rather than trusting anything the guest reports.
(function () {
  if (location.protocol === 'mi:') return;

  let activeField = null;
  let dropdown = null;

  function setNativeValue(el, value) {
    const proto = Object.getPrototypeOf(el);
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor && descriptor.set) descriptor.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function removeDropdown() {
    if (dropdown) {
      dropdown.remove();
      dropdown = null;
    }
  }

  function showDropdown(field, matches) {
    removeDropdown();
    if (!matches || matches.length === 0) return;

    const rect = field.getBoundingClientRect();
    dropdown = document.createElement('div');
    dropdown.style.cssText = `
      position: fixed; top: ${rect.bottom + 4}px; left: ${rect.left}px;
      min-width: ${Math.max(rect.width, 220)}px; background: #1c1c1c; color: #f5f5f5;
      border-radius: 10px; box-shadow: 0 10px 28px rgba(0,0,0,0.35); z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 13px; overflow: hidden;
      border: 1px solid rgba(255,255,255,0.08);
    `;

    const header = document.createElement('div');
    header.textContent = 'Mi Browser — saved password';
    header.style.cssText = 'padding: 8px 12px; opacity: 0.55; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em;';
    dropdown.appendChild(header);

    matches.forEach((m) => {
      const row = document.createElement('div');
      row.textContent = m.username;
      row.style.cssText = 'padding: 10px 12px; cursor: pointer;';
      row.addEventListener('mouseenter', () => { row.style.background = 'rgba(255,255,255,0.12)'; });
      row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });
      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        ipcRenderer.sendToHost('mi-password-fill-request', m.id);
      });
      dropdown.appendChild(row);
    });

    document.body.appendChild(dropdown);
  }

  document.addEventListener('focusin', (e) => {
    if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'password') {
      activeField = e.target;
      ipcRenderer.sendToHost('mi-password-lookup');
    }
  }, true);

  document.addEventListener('focusout', () => {
    setTimeout(removeDropdown, 150);
  }, true);

  ipcRenderer.on('mi-password-lookup-result', (event, matches) => {
    if (activeField) showDropdown(activeField, matches);
  });

  ipcRenderer.on('mi-password-fill-value', (event, value) => {
    if (activeField && value) setNativeValue(activeField, value);
    removeDropdown();
  });
})();

// Auto-hide toolbar (Settings > Appearance): the host chrome can only ever
// see mouse movement over its own elements, never over this guest page --
// which, once the toolbar's collapsed, covers almost the whole window. So
// "hover near the top to bring the toolbar back" has to be noticed here and
// reported to the host, not detected host-side.
(function () {
  if (location.protocol === 'mi:') return;

  let wasNearTop = false;
  document.addEventListener('mousemove', (e) => {
    const nearTop = e.clientY <= 36;
    if (nearTop !== wasNearTop) {
      wasNearTop = nearTop;
      ipcRenderer.sendToHost('mi-near-top', nearTop);
    }
  }, true);

  document.addEventListener('mouseleave', () => {
    if (wasNearTop) {
      wasNearTop = false;
      ipcRenderer.sendToHost('mi-near-top', false);
    }
  });
})();

// Mini player (Picture-in-Picture). Confirmed the hard way: Chromium's
// Document Picture-in-Picture API ("requestWindow()", which is what would
// let us build a fully custom-skinned floating window) explicitly refuses
// to run in anything but a top-level browsing context -- and an Electron
// <webview> guest is *never* top-level, no matter what it looks like to us.
// Calling it doesn't just reject the promise, it trips a Mojo IPC validation
// check and Chromium kills the whole renderer process outright ("Only
// top-most frames can open picture-in-picture windows" / "Terminating
// renderer for bad IPC message"). That's the actual cause of the tab going
// blank -- not a bug in the retry/restore logic, a hard platform wall. So a
// fully custom-styled PiP window is not achievable from inside a <webview>,
// full stop -- only native video.requestPictureInPicture() is safe here,
// which never touches the page's DOM and never crosses that top-level-frame
// restriction. Branding is limited to what MediaSession can add to Chromium's
// own native overlay (title text, a couple of extra action buttons).
(function () {
  if (location.protocol === 'mi:') return;

  // Strict on purpose: only a video that is genuinely playing right now
  // counts. A paused video (e.g. a thumbnail preview, an ad that hasn't
  // started) never qualifies, even as a fallback.
  function findPlayingVideo() {
    const playing = Array.from(document.querySelectorAll('video'))
      .filter((v) => !v.paused && !v.ended && v.readyState > 2 && v.videoWidth > 0);
    if (!playing.length) return null;
    return playing.reduce((best, v) => {
      const area = v.getBoundingClientRect().width * v.getBoundingClientRect().height;
      const bestArea = best ? best.getBoundingClientRect().width * best.getBoundingClientRect().height : 0;
      return area > bestArea ? v : best;
    }, null);
  }

  function reportVideoPresence() {
    ipcRenderer.sendToHost('mi-pip-availability', !!findPlayingVideo());
  }

  document.addEventListener('play', reportVideoPresence, true);
  document.addEventListener('pause', reportVideoPresence, true);
  document.addEventListener('ended', reportVideoPresence, true);
  document.addEventListener('loadedmetadata', reportVideoPresence, true);
  setInterval(reportVideoPresence, 2000);

  // Visible feedback in the page itself -- without this, a failed PiP
  // attempt looks identical to "the button did nothing".
  let toastEl = null;
  function showToast(message, isError) {
    if (toastEl) toastEl.remove();
    toastEl = document.createElement('div');
    toastEl.textContent = message;
    toastEl.style.cssText = `
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
      background: ${isError ? '#3f1220' : '#141414'}; color: #fff; padding: 10px 18px;
      border-radius: 10px; font: 13px -apple-system, BlinkMacSystemFont, sans-serif;
      z-index: 2147483647; box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      border: 1px solid ${isError ? '#e11d48' : '#7c3aed'};
      pointer-events: none;
    `;
    document.body.appendChild(toastEl);
    setTimeout(() => { if (toastEl) { toastEl.remove(); toastEl = null; } }, 3500);
  }

  async function enterPip() {
    if (document.pictureInPictureElement) {
      showToast('Mini player is already open.', false);
      return;
    }

    const video = findPlayingVideo();
    if (!video) {
      showToast("Mi Browser couldn't find a video actually playing on this page.", true);
      return;
    }

    if (!document.pictureInPictureEnabled) {
      showToast('Picture-in-Picture is disabled in this window.', true);
      return;
    }
    if (video.disablePictureInPicture) {
      showToast('This page blocks Picture-in-Picture on this video.', true);
      return;
    }

    try {
      // The floating window's chrome itself is entirely OS-owned from here
      // -- this is the only branding lever left that doesn't risk the
      // renderer (see the note above the IIFE for why).
      if ('mediaSession' in navigator) {
        try {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: video.title || document.title || 'Playing in Mi Browser',
            artist: 'Mi Browser mini player'
          });
        } catch (err) { /* metadata is a nice-to-have, never fatal */ }
      }

      await video.requestPictureInPicture();
      showToast('Mini player opened.', false);
    } catch (err) {
      console.error('[Mi Browser] mini player failed:', err);
      showToast('Mini player unavailable here: ' + (err && err.message ? err.message : 'unknown error'), true);
    }
  }

  // With contextIsolation on, a plain "window.__miEnterPip = ..." here would
  // only exist in this preload's isolated world -- invisible to
  // webview.executeJavaScript(), which runs in the page's own main world.
  // contextBridge is what actually publishes it there.
  contextBridge.exposeInMainWorld('__miEnterPip', enterPip);
})();
