function applyTheme(themeName) {
  document.body.className = `m-0 p-0 min-h-screen theme-${themeName}`;
}

function formatDate(timestamp) {
  if (!timestamp) return null;
  return new Date(timestamp).toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

async function loadState() {
  const theme = await window.electron.store.get('theme') || 'light';
  applyTheme(theme);
  document.querySelector(`input[name="theme"][value="${theme}"]`).checked = true;

  const features = await window.electron.store.get('features') || { ads: true, trackers: true, eatCookies: true };
  document.querySelector('.feature-toggle[data-feature="ads"]').checked = !!features.ads;
  document.querySelector('.feature-toggle[data-feature="trackers"]').checked = !!features.trackers;
  document.querySelector('.feature-toggle[data-feature="eat-cookies"]').checked = !!features.eatCookies;
  document.querySelector('.feature-toggle[data-feature="google-suggest"]').checked = !!features.googleSuggest;

  const searchEngine = (await window.electron.store.get('search-engine')) || 'google';
  document.getElementById('search-engine-select').value = searchEngine;

  const restoreSession = await window.electron.store.get('restore-session');
  const startupMode = restoreSession === false ? 'newtab' : 'restore';
  document.querySelector(`input[name="startup-mode"][value="${startupMode}"]`).checked = true;

  const language = (await window.electron.store.get('language')) || 'en-GB';
  document.getElementById('language-select').value = language;

  const downloadSafety = { malwareCheck: true, massDownloadLimit: 5, ...(await window.electron.store.get('downloadSafety') || {}) };
  document.getElementById('malware-check-toggle').checked = !!downloadSafety.malwareCheck;
  document.getElementById('mass-download-limit').value = downloadSafety.massDownloadLimit;

  document.getElementById('launch-at-login-toggle').checked = !!(await window.electron.store.get('launchAtLogin'));
  document.getElementById('auto-hide-toolbar-toggle').checked = !!(await window.electron.store.get('autoHideToolbar'));

  const downloadsFolder = await window.electron.store.get('downloadsFolder');
  document.getElementById('downloads-folder-path').textContent = downloadsFolder || 'Default (OS Downloads folder)';

  document.getElementById('spellcheck-toggle').checked = (await window.electron.store.get('spellcheckEnabled')) !== false;

  const custom = (await window.electron.store.get('customization')) || {};
  document.getElementById('homepage-input').value = custom.homepage || '';
  document.getElementById('accent-color-input').value = custom.accentColor || '#3b82f6';
  const zoomPercent = Math.round((custom.uiZoom || 1) * 100);
  document.getElementById('ui-zoom-slider').value = zoomPercent;
  document.getElementById('ui-zoom-value').textContent = `${zoomPercent}%`;
  document.querySelectorAll('.custom-toggle').forEach((toggle) => {
    toggle.checked = toggle.dataset.default === 'on' ? custom[toggle.dataset.custom] !== false : !!custom[toggle.dataset.custom];
  });
  renderCustomEngines(custom.customSearchEngines || []);
  populateSearchEngineOptions(custom.customSearchEngines || [], searchEngine);

  document.getElementById('toolbar-icon-size-select').value = custom.toolbarIconSize || 'comfortable';
  document.getElementById('ui-font-style-select').value = custom.uiFontStyle || 'system';
  document.getElementById('new-tab-bg-tint-input').value = custom.newTabBackgroundTint || '#ffffff';
  document.getElementById('new-tab-bg-opacity-slider').value = custom.newTabBackgroundOpacity || 15;
  renderNewTabBgMediaStatus(custom.newTabBackgroundMedia || null);
  document.getElementById('new-tab-destination-select').value = custom.newTabDestination || 'newtab';
  document.getElementById('new-tab-destination-url-input').value = custom.newTabDestinationUrl || '';
  document.getElementById('new-tab-destination-url-input').classList.toggle('hidden', (custom.newTabDestination || 'newtab') !== 'custom');

  populateAirTabKeyOptions();
  document.getElementById('air-tab-key-select').value = custom.airTabKey || 'Control';
  document.getElementById('air-tab-hold-select').value = String(custom.airTabHoldMs || 350);
  document.getElementById('air-tab-layout-select').value = custom.airTabLayout || 'grid';
  document.getElementById('air-tab-size-select').value = custom.airTabTileSize || 'comfortable';

  await loadStats();
  await loadPasswords();
  await loadDefaultBrowserStatus();
  await loadSecurityStatus();
  await loadUpdateStatus();
}

const DNS_PROVIDER_LABELS = { cloudflare: 'Cloudflare', google: 'Google', quad9: 'Quad9', off: 'Off' };

async function loadSecurityStatus() {
  const security = await window.electron.security.get();

  const dnsSelect = document.getElementById('dns-provider-select');
  dnsSelect.value = security.dnsProvider;
  const dnsBadge = document.getElementById('dns-badge');
  if (security.activeDnsProvider === 'off' || security.activeDnsProvider == null) {
    dnsBadge.textContent = security.activeDnsProvider === 'off' ? 'Off' : 'Active';
    dnsBadge.className = security.activeDnsProvider === 'off' ? 'security-badge security-badge-off' : 'security-badge security-badge-on';
  } else {
    dnsBadge.textContent = 'Active';
    dnsBadge.className = 'security-badge security-badge-on';
  }

  const restartBanner = document.getElementById('dns-restart-banner');
  const restartText = document.getElementById('dns-restart-text');
  if (security.activeDnsProvider != null && security.activeDnsProvider !== security.dnsProvider) {
    restartBanner.classList.remove('hidden');
    restartText.textContent = `${DNS_PROVIDER_LABELS[security.dnsProvider] || security.dnsProvider} is saved, but Mi Browser is still running with ${DNS_PROVIDER_LABELS[security.activeDnsProvider] || security.activeDnsProvider}.`;
  } else {
    restartBanner.classList.add('hidden');
  }

  document.getElementById('https-only-toggle').checked = security.httpsOnly;
  document.getElementById('get-out-toggle').checked = security.getOutEnabled;
  document.querySelectorAll('.get-out-category-toggle').forEach((toggle) => {
    toggle.checked = security.getOutCategories ? security.getOutCategories[toggle.dataset.category] !== false : true;
  });
  loadGetOutPanel();

  const downloadSafety = { malwareCheck: true, ...(await window.electron.store.get('downloadSafety') || {}) };
  const malwareBadge = document.getElementById('malware-check-badge');
  malwareBadge.textContent = downloadSafety.malwareCheck ? 'Active' : 'Off';
  malwareBadge.className = downloadSafety.malwareCheck ? 'security-badge security-badge-on' : 'security-badge security-badge-off';
}

function renderUpdateStatus(result) {
  const upToDateEl = document.getElementById('update-uptodate-state');
  const availableEl = document.getElementById('update-available-state');
  const errorEl = document.getElementById('update-error-state');
  upToDateEl.classList.add('hidden');
  availableEl.classList.add('hidden');
  errorEl.classList.add('hidden');

  if (!result) {
    document.getElementById('update-current-version').textContent = 'Checking…';
    upToDateEl.classList.remove('hidden');
    return;
  }

  if (!result.ok) {
    document.getElementById('update-error-message').textContent = result.error || 'Unknown error.';
    errorEl.classList.remove('hidden');
    return;
  }

  if (result.updateAvailable) {
    document.getElementById('update-latest-version').textContent = result.latestVersion;
    const meta = [result.releaseDate, result.releaseTime].filter(Boolean).join(' at ');
    document.getElementById('update-release-meta').textContent = meta ? `Released ${meta}` : '';
    const list = document.getElementById('update-changelog');
    list.innerHTML = '';
    (result.changelog || []).forEach((line) => {
      const li = document.createElement('li');
      li.textContent = line;
      list.appendChild(li);
    });
    document.getElementById('update-download-btn').classList.toggle('hidden', !result.downloadUrl);
    availableEl.classList.remove('hidden');
  } else {
    document.getElementById('update-current-version').textContent = `Version ${result.currentVersion} — you're up to date.`;
    upToDateEl.classList.remove('hidden');
  }
}

async function loadUpdateStatus() {
  const cached = await window.electron.updates.getCached();
  renderUpdateStatus(cached);
}

function populateSearchEngineOptions(customEngines, selectedValue) {
  const select = document.getElementById('search-engine-select');
  select.querySelectorAll('option[data-custom-engine]').forEach((opt) => opt.remove());
  customEngines.forEach((engine) => {
    const opt = document.createElement('option');
    opt.value = engine.key;
    opt.textContent = engine.name;
    opt.dataset.customEngine = 'true';
    select.appendChild(opt);
  });
  select.value = selectedValue;
}

let customizationSaveChain = Promise.resolve();

function saveCustomization(patch) {
  customizationSaveChain = customizationSaveChain.then(async () => {
    const current = (await window.electron.store.get('customization')) || {};
    const updated = { ...current, ...patch };
    await window.electron.store.set('customization', updated);
    return updated;
  });
  return customizationSaveChain;
}

function renderCustomEngines(engines) {
  const list = document.getElementById('custom-engines-list');
  list.innerHTML = '';
  if (!engines.length) {
    list.innerHTML = '<p class="text-sm opacity-60">No custom search engines added yet.</p>';
    return;
  }
  engines.forEach((engine) => {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between gap-3 p-3 rounded-lg border-2';
    row.innerHTML = `
      <div class="min-w-0">
        <p class="font-semibold text-sm truncate">${escapeHtml(engine.name)}</p>
        <p class="text-xs opacity-60 truncate">${escapeHtml(engine.urlPrefix)}</p>
      </div>
      <button class="remove-engine-btn shrink-0 px-3 py-1.5 rounded text-sm font-semibold border-2 danger-btn">Remove</button>
    `;
    row.querySelector('.remove-engine-btn').addEventListener('click', async () => {
      const custom = (await window.electron.store.get('customization')) || {};
      const remaining = (custom.customSearchEngines || []).filter((e) => e.key !== engine.key);
      const updated = await saveCustomization({ customSearchEngines: remaining });
      renderCustomEngines(remaining);
      populateSearchEngineOptions(remaining, document.getElementById('search-engine-select').value);
    });
    list.appendChild(row);
  });
}

async function loadDefaultBrowserStatus() {
  const { isDefault } = await window.electron.defaultBrowser.getStatus();
  const statusEl = document.getElementById('default-browser-status');
  const btn = document.getElementById('set-default-browser-btn');
  if (isDefault) {
    statusEl.textContent = 'Mi Browser is currently your default browser.';
    btn.classList.add('hidden');
  } else {
    statusEl.textContent = "Mi Browser isn't your default browser yet.";
    btn.classList.remove('hidden');
  }
}

async function loadStats() {
  const stats = await window.electron.stats.get();
  document.getElementById('stat-history').textContent = stats.historyCount;
  document.getElementById('stat-bookmarks').textContent = stats.bookmarksCount;
  document.getElementById('stat-passwords').textContent = stats.passwordsCount;
  document.getElementById('stat-cookies').textContent = stats.cookiesClearedRuns;

  const lastClear = formatDate(stats.lastCookieClear);
  document.getElementById('eat-cookies-status').textContent = lastClear
    ? `Last swept ${lastClear} (${stats.cookiesClearedRuns} total)`
    : 'Not swept yet — runs automatically once enabled';
}

async function loadPasswords() {
  const passwords = await window.electron.passwords.getAll();
  const list = document.getElementById('passwords-list');
  const empty = document.getElementById('passwords-empty');
  list.innerHTML = '';

  empty.classList.toggle('hidden', passwords.length > 0);

  passwords.forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'password-row flex items-center gap-4 p-4 rounded-lg border-2';
    row.innerHTML = `
      <div class="flex-1 min-w-0">
        <p class="font-semibold truncate">${escapeHtml(entry.origin)}</p>
        <p class="text-sm opacity-70 truncate">${escapeHtml(entry.username)}</p>
      </div>
      <span class="password-value text-sm font-mono opacity-70">&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;</span>
      <button class="reveal-btn px-3 py-1.5 rounded text-sm font-semibold border-2 hover:opacity-80">Reveal</button>
      <button class="delete-btn px-3 py-1.5 rounded text-sm font-semibold border-2 danger-btn">Delete</button>
    `;

    const valueEl = row.querySelector('.password-value');
    const revealBtn = row.querySelector('.reveal-btn');

    revealBtn.addEventListener('click', async () => {
      if (revealBtn.textContent === 'Hide') {
        valueEl.textContent = '••••••••';
        revealBtn.textContent = 'Reveal';
        return;
      }
      const plaintext = await window.electron.passwords.reveal(entry.id);
      valueEl.textContent = plaintext || '(could not decrypt)';
      revealBtn.textContent = 'Hide';
    });

    row.querySelector('.delete-btn').addEventListener('click', async () => {
      await window.electron.passwords.delete(entry.id);
      loadPasswords();
      loadStats();
    });

    list.appendChild(row);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

document.querySelectorAll('input[name="theme"]').forEach((radio) => {
  radio.addEventListener('change', (e) => {
    applyTheme(e.target.value);
    window.electron.store.set('theme', e.target.value);
  });
});

document.querySelectorAll('.feature-toggle').forEach((toggle) => {
  toggle.addEventListener('change', async () => {
    const features = await window.electron.store.get('features') || { ads: true, trackers: true, eatCookies: true };
    const feature = toggle.dataset.feature;
    if (feature === 'ads') features.ads = toggle.checked;
    if (feature === 'trackers') features.trackers = toggle.checked;
    if (feature === 'eat-cookies') features.eatCookies = toggle.checked;
    if (feature === 'google-suggest') features.googleSuggest = toggle.checked;
    window.electron.store.set('features', features);
  });
});

document.getElementById('search-engine-select').addEventListener('change', (e) => {
  window.electron.store.set('search-engine', e.target.value);
});

document.querySelectorAll('input[name="startup-mode"]').forEach((radio) => {
  radio.addEventListener('change', (e) => {
    window.electron.store.set('restore-session', e.target.value === 'restore');
  });
});

const clearDataBtn = document.getElementById('clear-data-btn');
const clearDataStatus = document.getElementById('clear-data-status');

clearDataBtn.addEventListener('click', async () => {
  clearDataBtn.disabled = true;
  clearDataStatus.textContent = 'Clearing…';
  await window.electron.app.clearBrowsingData();
  clearDataStatus.textContent = 'Done — browsing data cleared.';
  clearDataBtn.disabled = false;
  setTimeout(() => { clearDataStatus.textContent = ''; }, 4000);
});

const detectBtn = document.getElementById('detect-browsers-btn');
const browsersDetected = document.getElementById('browsers-detected');
const importConfirmBtn = document.getElementById('import-confirm-btn');
const importStatus = document.getElementById('import-status');

detectBtn.addEventListener('click', async () => {
  detectBtn.disabled = true;
  detectBtn.textContent = 'Detecting…';

  const detected = await window.electron.import.detectBrowsers();
  browsersDetected.innerHTML = '';

  Object.entries(detected).forEach(([browserName, data]) => {
    if (data.bookmarks > 0 || data.history > 0 || data.passwords > 0) {
      const div = document.createElement('div');
      div.className = 'p-4 rounded-lg border-2 card browser-item';
      div.innerHTML = `
        <label class="flex items-start cursor-pointer">
          <input type="checkbox" class="browser-checkbox w-5 h-5 mt-1" data-browser="${browserName}" checked>
          <div class="ml-4 flex-1">
            <p class="font-semibold capitalize">${browserName}</p>
            <p class="text-sm opacity-75">${data.bookmarks} bookmarks &middot; ${data.history} history entries &middot; ${data.passwords} passwords</p>
            <div class="mt-2 space-y-1 text-xs">
              <label class="flex items-center">
                <input type="checkbox" class="browser-data w-4 h-4" data-browser="${browserName}" data-type="bookmarks" checked>
                <span class="ml-2">Bookmarks</span>
              </label>
              <label class="flex items-center">
                <input type="checkbox" class="browser-data w-4 h-4" data-browser="${browserName}" data-type="history" checked>
                <span class="ml-2">History</span>
              </label>
              <label class="flex items-center">
                <input type="checkbox" class="browser-data w-4 h-4" data-browser="${browserName}" data-type="passwords" ${data.passwords > 0 ? 'checked' : 'disabled'}>
                <span class="ml-2">Passwords${data.passwords === 0 ? ' (none found)' : ''}</span>
              </label>
            </div>
          </div>
        </label>
      `;
      browsersDetected.appendChild(div);
    }
  });

  detectBtn.disabled = false;
  detectBtn.textContent = 'Detect installed browsers';

  if (browsersDetected.children.length === 0) {
    browsersDetected.innerHTML = '<p class="text-sm opacity-75">No other browsers with bookmarks, history or passwords were found on this machine.</p>';
    importConfirmBtn.classList.add('hidden');
  } else {
    importConfirmBtn.classList.remove('hidden');
  }
});

importConfirmBtn.addEventListener('click', async () => {
  const checkboxes = document.querySelectorAll('.browser-data:checked');
  const selections = {};

  checkboxes.forEach((checkbox) => {
    const browser = checkbox.dataset.browser;
    const type = checkbox.dataset.type;
    if (!selections[browser]) selections[browser] = { bookmarks: false, history: false, passwords: false };
    selections[browser][type] = true;
  });

  importConfirmBtn.disabled = true;
  importStatus.textContent = 'Importing…';

  let totals = { historyAdded: 0, bookmarksAdded: 0, passwordsAdded: 0 };
  let passwordsUnsupported = false;

  for (const [browser, sel] of Object.entries(selections)) {
    const result = await window.electron.import.importData(browser, sel);
    if (result) {
      totals.historyAdded += result.historyAdded || 0;
      totals.bookmarksAdded += result.bookmarksAdded || 0;
      totals.passwordsAdded += result.passwordsAdded || 0;
      if (sel.passwords && !result.passwordsSupported) passwordsUnsupported = true;
    }
  }

  const parts = [];
  if (totals.historyAdded) parts.push(`${totals.historyAdded} history entries`);
  if (totals.bookmarksAdded) parts.push(`${totals.bookmarksAdded} bookmarks`);
  if (totals.passwordsAdded) parts.push(`${totals.passwordsAdded} passwords`);

  importStatus.textContent = parts.length > 0
    ? `Done — imported ${parts.join(', ')}.`
    : (passwordsUnsupported ? 'Password import isn\'t supported on this platform yet.' : 'Nothing new to import.');

  importConfirmBtn.disabled = false;
  setTimeout(() => { importStatus.textContent = ''; }, 6000);

  loadStats();
  loadPasswords();
});

const resetOverlay = document.getElementById('reset-confirm-overlay');

document.getElementById('reset-btn').addEventListener('click', () => {
  resetOverlay.classList.remove('hidden');
  resetOverlay.classList.add('flex');
});

document.getElementById('reset-cancel-btn').addEventListener('click', () => {
  resetOverlay.classList.add('hidden');
  resetOverlay.classList.remove('flex');
});

document.getElementById('reset-confirm-btn').addEventListener('click', () => {
  window.electron.app.reset();
});

document.getElementById('language-select').addEventListener('change', (e) => {
  window.electron.store.set('language', e.target.value);
});

document.getElementById('open-private-tab-btn').addEventListener('click', () => {
  window.electron.app.openPrivateTab();
});

document.getElementById('set-default-browser-btn').addEventListener('click', async () => {
  await window.electron.defaultBrowser.set();
  loadDefaultBrowserStatus();
});

async function saveDownloadSafety(patch) {
  const current = { malwareCheck: true, massDownloadLimit: 5, ...(await window.electron.store.get('downloadSafety') || {}) };
  window.electron.store.set('downloadSafety', { ...current, ...patch });
}

document.getElementById('malware-check-toggle').addEventListener('change', (e) => {
  saveDownloadSafety({ malwareCheck: e.target.checked });
});

document.getElementById('mass-download-limit').addEventListener('change', (e) => {
  const value = Math.max(0, parseInt(e.target.value, 10) || 0);
  e.target.value = value;
  saveDownloadSafety({ massDownloadLimit: value });
});

const addPasswordOverlay = document.getElementById('add-password-overlay');
const addPasswordForm = document.getElementById('add-password-form');

function openAddPasswordModal() {
  addPasswordForm.reset();
  document.getElementById('add-password-status').textContent = '';
  addPasswordOverlay.classList.remove('hidden');
  addPasswordOverlay.classList.add('flex');
  document.getElementById('add-password-origin').focus();
}

function closeAddPasswordModal() {
  addPasswordOverlay.classList.add('hidden');
  addPasswordOverlay.classList.remove('flex');
}

document.getElementById('add-password-open-btn').addEventListener('click', openAddPasswordModal);
document.getElementById('add-password-cancel-btn').addEventListener('click', closeAddPasswordModal);
addPasswordOverlay.addEventListener('click', (e) => {
  if (e.target === addPasswordOverlay) closeAddPasswordModal();
});

addPasswordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const origin = document.getElementById('add-password-origin').value.trim();
  const username = document.getElementById('add-password-username').value.trim();
  const password = document.getElementById('add-password-value').value;
  const status = document.getElementById('add-password-status');

  const result = await window.electron.passwords.addManual(origin, username, password);
  if (result && result.success) {
    status.textContent = 'Saved.';
    loadPasswords();
    loadStats();
    setTimeout(closeAddPasswordModal, 600);
  } else {
    status.textContent = (result && result.error) || 'Could not save that password.';
  }
});

document.getElementById('launch-at-login-toggle').addEventListener('change', (e) => {
  window.electron.store.set('launchAtLogin', e.target.checked);
});

document.getElementById('auto-hide-toolbar-toggle').addEventListener('change', (e) => {
  window.electron.store.set('autoHideToolbar', e.target.checked);
});

document.getElementById('spellcheck-toggle').addEventListener('change', (e) => {
  window.electron.store.set('spellcheckEnabled', e.target.checked);
  window.electron.system.setSpellcheckEnabled(e.target.checked);
});

document.getElementById('choose-downloads-folder-btn').addEventListener('click', async () => {
  const folder = await window.electron.system.chooseDownloadsFolder();
  if (folder) document.getElementById('downloads-folder-path').textContent = folder;
});

document.getElementById('homepage-input').addEventListener('change', (e) => {
  saveCustomization({ homepage: e.target.value.trim() });
});

document.getElementById('accent-color-input').addEventListener('input', (e) => {
  saveCustomization({ accentColor: e.target.value });
});

document.getElementById('accent-color-reset-btn').addEventListener('click', () => {
  document.getElementById('accent-color-input').value = '#3b82f6';
  saveCustomization({ accentColor: '' });
});

document.getElementById('ui-zoom-slider').addEventListener('input', (e) => {
  const percent = parseInt(e.target.value, 10);
  document.getElementById('ui-zoom-value').textContent = `${percent}%`;
  saveCustomization({ uiZoom: percent / 100 });
});

document.getElementById('toolbar-icon-size-select').addEventListener('change', (e) => {
  saveCustomization({ toolbarIconSize: e.target.value });
});

document.getElementById('ui-font-style-select').addEventListener('change', (e) => {
  saveCustomization({ uiFontStyle: e.target.value });
});

document.getElementById('new-tab-bg-tint-input').addEventListener('input', (e) => {
  saveCustomization({ newTabBackgroundTint: e.target.value });
});

function renderNewTabBgMediaStatus(media) {
  const status = document.getElementById('new-tab-bg-media-status');
  const clearBtn = document.getElementById('new-tab-bg-clear-btn');
  if (media && media.filename) {
    status.textContent = media.type === 'video' ? 'A video is set as the background.' : 'An image is set as the background.';
    clearBtn.classList.remove('hidden');
  } else {
    status.textContent = 'No image or video set.';
    clearBtn.classList.add('hidden');
  }
}

document.getElementById('new-tab-bg-choose-btn').addEventListener('click', async () => {
  const btn = document.getElementById('new-tab-bg-choose-btn');
  btn.disabled = true;
  const result = await window.electron.newtabBg.choose();
  btn.disabled = false;
  if (result) renderNewTabBgMediaStatus(result);
});

document.getElementById('new-tab-bg-clear-btn').addEventListener('click', async () => {
  await window.electron.newtabBg.clear();
  renderNewTabBgMediaStatus(null);
});

document.getElementById('new-tab-bg-opacity-slider').addEventListener('input', (e) => {
  saveCustomization({ newTabBackgroundOpacity: parseInt(e.target.value, 10) });
});

document.getElementById('new-tab-destination-select').addEventListener('change', (e) => {
  document.getElementById('new-tab-destination-url-input').classList.toggle('hidden', e.target.value !== 'custom');
  saveCustomization({ newTabDestination: e.target.value });
});

document.getElementById('new-tab-destination-url-input').addEventListener('change', (e) => {
  saveCustomization({ newTabDestinationUrl: e.target.value.trim() });
});

const AIR_TAB_KEY_OPTIONS = [
  { id: 'Control', label: 'Control' },
  { id: 'Alt', label: navigator.userAgent.includes('Mac') ? 'Option' : 'Alt' },
  { id: 'Shift', label: 'Shift' },
  { id: 'CapsLock', label: 'Caps Lock' },
  ...(!navigator.userAgent.includes('Mac') ? [
    { id: 'ContextMenu', label: 'Menu key' },
    { id: 'ScrollLock', label: 'Scroll Lock' },
    { id: 'Pause', label: 'Pause / Break' }
  ] : [])
];

function populateAirTabKeyOptions() {
  const select = document.getElementById('air-tab-key-select');
  if (select.children.length) return;
  AIR_TAB_KEY_OPTIONS.forEach((opt) => {
    const option = document.createElement('option');
    option.value = opt.id;
    option.textContent = opt.label;
    select.appendChild(option);
  });
}

document.getElementById('air-tab-key-select').addEventListener('change', (e) => {
  saveCustomization({ airTabKey: e.target.value });
});

document.getElementById('air-tab-hold-select').addEventListener('change', (e) => {
  saveCustomization({ airTabHoldMs: parseInt(e.target.value, 10) });
});

document.getElementById('air-tab-layout-select').addEventListener('change', (e) => {
  saveCustomization({ airTabLayout: e.target.value });
});

document.getElementById('air-tab-size-select').addEventListener('change', (e) => {
  saveCustomization({ airTabTileSize: e.target.value });
});

document.querySelectorAll('.custom-toggle').forEach((toggle) => {
  toggle.addEventListener('change', () => {
    saveCustomization({ [toggle.dataset.custom]: toggle.checked });
  });
});

document.getElementById('add-search-engine-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('add-engine-name').value.trim();
  const urlPrefix = document.getElementById('add-engine-url').value.trim();
  if (!name || !urlPrefix) return;

  const key = 'custom-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);
  const custom = (await window.electron.store.get('customization')) || {};
  const engines = [...(custom.customSearchEngines || []), { key, name, urlPrefix }];
  await saveCustomization({ customSearchEngines: engines });
  renderCustomEngines(engines);
  populateSearchEngineOptions(engines, document.getElementById('search-engine-select').value);
  e.target.reset();
});

document.getElementById('dns-provider-select').addEventListener('change', async (e) => {
  await window.electron.security.set({ dnsProvider: e.target.value });
  loadSecurityStatus();
});

document.getElementById('dns-restart-btn').addEventListener('click', () => {
  window.electron.app.restart();
});

document.getElementById('https-only-toggle').addEventListener('change', async (e) => {
  await window.electron.security.set({ httpsOnly: e.target.checked });
});

document.getElementById('get-out-toggle').addEventListener('change', async (e) => {
  await window.electron.security.set({ getOutEnabled: e.target.checked });
});

document.querySelectorAll('.get-out-category-toggle').forEach((toggle) => {
  toggle.addEventListener('change', async () => {
    const security = await window.electron.security.get();
    const categories = { ...(security.getOutCategories || {}), [toggle.dataset.category]: toggle.checked };
    await window.electron.security.set({ getOutCategories: categories });
  });
});

async function loadGetOutPanel() {
  const [stats, blocklistInfo, exceptions] = await Promise.all([
    window.electron.getOut.getStats(),
    window.electron.getOut.getBlocklistInfo(),
    window.electron.getOut.getExceptions()
  ]);

  document.getElementById('get-out-total-blocked').textContent = (stats.total || 0).toLocaleString();
  document.getElementById('get-out-blocklist-size').textContent = blocklistInfo.size.toLocaleString();
  document.getElementById('get-out-exceptions-count').textContent = exceptions.length;

  Object.entries(blocklistInfo.categorySizes || {}).forEach(([category, size]) => {
    const el = document.getElementById(`get-out-cat-size-${category}`);
    if (el) el.textContent = `${size} domains`;
  });

  const list = document.getElementById('get-out-exceptions-list');
  const empty = document.getElementById('get-out-exceptions-empty');
  list.innerHTML = '';
  empty.classList.toggle('hidden', exceptions.length > 0);

  exceptions.forEach((hostname) => {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between gap-4 p-3 rounded-lg border-2';
    row.innerHTML = `<span class="text-sm font-medium truncate"></span><button type="button" class="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border-2 hover:opacity-80 transition">Turn back on</button>`;
    row.querySelector('span').textContent = hostname;
    row.querySelector('button').addEventListener('click', async () => {
      await window.electron.getOut.setExcepted(hostname, false);
      loadGetOutPanel();
    });
    list.appendChild(row);
  });
}

document.getElementById('check-updates-btn').addEventListener('click', async () => {
  const btn = document.getElementById('check-updates-btn');
  const status = document.getElementById('update-check-status');
  btn.disabled = true;
  status.textContent = 'Checking…';
  const result = await window.electron.updates.check();
  renderUpdateStatus(result);
  status.textContent = result.ok ? '' : '';
  btn.disabled = false;
  setTimeout(() => { status.textContent = ''; }, 2000);
});

document.getElementById('update-download-btn').addEventListener('click', () => {
  const btn = document.getElementById('update-download-btn');
  btn.disabled = true;
  btn.textContent = 'Starting…';
  window.electron.updates.startAutoUpdate();
});

const UPDATE_INSTALL_MESSAGES = {
  checking: 'Checking for the update…',
  downloading: 'Downloading the update…',
  installing: 'Installing — Mi Browser will restart shortly.',
  'not-available': '',
  error: 'Something went wrong applying the update.'
};

if (window.electron.updates.onInstallProgress) {
  window.electron.updates.onInstallProgress((progress) => {
    const statusEl = document.getElementById('update-install-status');
    const btn = document.getElementById('update-download-btn');

    if (progress.state === 'downloading' && typeof progress.percent === 'number') {
      statusEl.textContent = `Downloading the update… ${progress.percent}%`;
    } else {
      statusEl.textContent = UPDATE_INSTALL_MESSAGES[progress.state] || '';
    }

    if (progress.state === 'error') {
      statusEl.textContent = progress.message ? `${UPDATE_INSTALL_MESSAGES.error} (${progress.message})` : UPDATE_INSTALL_MESSAGES.error;
      btn.disabled = false;
      btn.textContent = 'Update now';
    }
  });
}

if (window.electron.updates.onStatusChanged) {
  window.electron.updates.onStatusChanged(renderUpdateStatus);
}

loadState();
