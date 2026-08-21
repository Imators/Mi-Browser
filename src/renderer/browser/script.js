let tabs = [];
let activeTabId = null;
let tabIdCounter = 0;
let closedTabsStack = [];
let splitLeftTabId = null;
let splitRightTabId = null;

const SEARCH_ENGINES = {
  google: 'https://www.google.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
  bing: 'https://www.bing.com/search?q=',
  ecosia: 'https://www.ecosia.org/search?q='
};

const state = {
  theme: 'light',
  toolbarEnabled: true,
  toolbarPosition: 'right',
  searchEngine: 'google',
  googleSuggestEnabled: false,
  homepage: '',
  accentColor: '',
  uiZoom: 1,
  confirmCloseMultiTab: false,
  openTabsInBackground: false,
  autoMuteBackgroundTabs: false,
  customSearchEngines: [],
  smoothScrolling: false,
  showClock: false,
  compactTabs: false,
  alwaysShowTabClose: false,
  autoHideToolbar: false,
  hideWhyButton: false,
  hideToolsButton: false,
  newTabGreeting: false,
  newTabBackgroundTint: '',
  toolbarIconSize: 'comfortable',
  boldActiveTab: false,
  alwaysShowBookmarksBar: false,
  newTabDestination: 'newtab',
  newTabDestinationUrl: '',
  underlineLinksOnHover: false,
  sharpCorners: false,
  addressBarHistorySuggestions: true,
  addressBarBookmarkSuggestions: true,
  selectAddressBarOnFocus: false,
  uiFontStyle: 'system',
  warnOnActiveDownloadsClose: false,
  autoOpenDownloadsFolder: false,
  pauseAutoplayVideos: false,
  reduceMotion: false,
  middleClickCloseTab: false,
  airTabKey: 'Control',
  airTabHoldMs: 350,
  airTabLayout: 'grid',
  airTabTileSize: 'comfortable',
  tabBarStyle: 'top',
  confirmBeforeQuit: false
};

function getHomepageUrl() {
  return state.homepage && state.homepage.trim() ? state.homepage.trim() : 'mi://newtab';
}

function getNewTabUrl() {
  if (state.newTabDestination === 'blank') return 'about:blank';
  if (state.newTabDestination === 'custom' && state.newTabDestinationUrl.trim()) return state.newTabDestinationUrl.trim();
  return 'mi://newtab';
}

async function loadState() {
  state.theme = await window.electron.store.get('theme') || 'light';
  document.body.className = `m-0 p-0 overflow-hidden h-screen theme-${state.theme}`;

  state.searchEngine = (await window.electron.store.get('search-engine')) || 'google';
  const features = (await window.electron.store.get('features')) || {};
  state.googleSuggestEnabled = !!features.googleSuggest;
  state.autoHideToolbar = !!(await window.electron.store.get('autoHideToolbar'));

  const custom = (await window.electron.store.get('customization')) || {};
  applyCustomizationData(custom);
  if (custom.partnerTheme) window.electron.partnerThemes.refreshApplied();

  const restoreSession = await window.electron.store.get('restore-session');
  const shouldRestore = restoreSession !== false;
  const savedTabs = shouldRestore ? await window.electron.store.get('session-tabs') : null;

  if (savedTabs && savedTabs.length > 0) {
    tabs = savedTabs;
    tabIdCounter = Math.max(...tabs.map(t => t.id)) + 1;
    tabs.forEach(tab => createWebview(tab.id, tab.url));
    switchTab(tabs[tabs.length - 1].id);
  } else {
    createTab(getHomepageUrl());
  }

  window.electron.store.onChange((key, value) => {
    if (key === 'theme') {
      state.theme = value;
      applyChromeTheme(tabs.find(t => t.id === activeTabId));
      applyCustomizations();
    }
    if (key === 'search-engine') {
      state.searchEngine = value;
    }
    if (key === 'features') {
      state.googleSuggestEnabled = !!(value && value.googleSuggest);
    }
    if (key === 'autoHideToolbar') {
      state.autoHideToolbar = !!value;
      applyCustomizations();
    }
    if (key === 'customization') {
      applyCustomizationData(value || {});
    }
  });
}

function applyCustomizationData(c) {
  state.homepage = c.homepage || '';
  state.accentColor = c.accentColor || '';
  state.uiZoom = c.uiZoom || 1;
  state.confirmCloseMultiTab = !!c.confirmCloseMultiTab;
  state.openTabsInBackground = !!c.openTabsInBackground;
  state.autoMuteBackgroundTabs = !!c.autoMuteBackgroundTabs;
  state.customSearchEngines = c.customSearchEngines || [];
  state.smoothScrolling = !!c.smoothScrolling;
  state.showClock = !!c.showClock;
  state.compactTabs = !!c.compactTabs;
  state.alwaysShowTabClose = !!c.alwaysShowTabClose;
  state.hideWhyButton = !!c.hideWhyButton;
  state.hideToolsButton = !!c.hideToolsButton;
  state.newTabGreeting = !!c.newTabGreeting;
  state.newTabBackgroundTint = c.newTabBackgroundTint || '';
  state.toolbarIconSize = c.toolbarIconSize || 'comfortable';
  state.boldActiveTab = !!c.boldActiveTab;
  state.alwaysShowBookmarksBar = !!c.alwaysShowBookmarksBar;
  state.newTabDestination = c.newTabDestination || 'newtab';
  state.newTabDestinationUrl = c.newTabDestinationUrl || '';
  state.underlineLinksOnHover = !!c.underlineLinksOnHover;
  state.sharpCorners = !!c.sharpCorners;
  state.addressBarHistorySuggestions = c.addressBarHistorySuggestions !== false;
  state.addressBarBookmarkSuggestions = c.addressBarBookmarkSuggestions !== false;
  state.selectAddressBarOnFocus = !!c.selectAddressBarOnFocus;
  state.uiFontStyle = c.uiFontStyle || 'system';
  state.warnOnActiveDownloadsClose = !!c.warnOnActiveDownloadsClose;
  state.autoOpenDownloadsFolder = !!c.autoOpenDownloadsFolder;
  state.pauseAutoplayVideos = !!c.pauseAutoplayVideos;
  state.reduceMotion = !!c.reduceMotion;
  state.middleClickCloseTab = !!c.middleClickCloseTab;
  state.airTabKey = c.airTabKey || 'Control';
  state.airTabHoldMs = c.airTabHoldMs || 350;
  state.airTabLayout = c.airTabLayout || 'grid';
  state.airTabTileSize = c.airTabTileSize || 'comfortable';
  state.tabBarStyle = c.tabBarStyle || 'top';
  state.confirmBeforeQuit = !!c.confirmBeforeQuit;
  state.partnerTheme = c.partnerTheme || null;
  applyCustomizations();
}

const THEME_ACCENTS = {
  light: '#0a0a0a', dark: '#e5e5e5', blue: '#1d4ed8', green: '#16a34a', sunset: '#ea580c',
  desert: '#b45309', midnight: '#3b82f6', charcoal: '#a8a29e', crimson: '#e11d48', rose: '#e11d48',
  lavender: '#7c3aed', mint: '#0891b2', neon: '#e879f9', cyberpunk: '#38bdf8', emerald: '#10b981',
  amethyst: '#a855f7', inferno: '#f97316', ocean: '#2dd4bf', onyx: '#e5e5e5', nebula: '#d946ef',
  toxic: '#a3e635', sakura: '#db2777', arctic: '#0ea5e9', solar: '#f59e0b', sage: '#7a8f5f',
  espresso: '#c17a4a', private: '#7c3aed'
};

function relativeLuminance(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substr(0, 2), 16) / 255;
  const g = parseInt(clean.substr(2, 2), 16) / 255;
  const b = parseInt(clean.substr(4, 2), 16) / 255;
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function readableTextColor(hex) {
  return relativeLuminance(hex) > 0.5 ? '#000000' : '#ffffff';
}

function shadeColor(hex, percent) {
  try {
    const f = parseInt(hex.replace('#', ''), 16);
    const t = percent < 0 ? 0 : 255;
    const p = Math.abs(percent) / 100;
    const R = f >> 16, G = (f >> 8) & 0x00FF, B = f & 0x0000FF;
    return '#' + (0x1000000 + (Math.round((t - R) * p) + R) * 0x10000 + (Math.round((t - G) * p) + G) * 0x100 + (Math.round((t - B) * p) + B)).toString(16).slice(1);
  } catch (err) {
    return hex;
  }
}

const PARTNER_CHROME_VAR_NAMES = ['--pt-bg', '--pt-surface', '--pt-surface-hover', '--pt-text', '--pt-border', '--pt-border-strong'];

function applyPartnerThemeChromeVars() {
  const isPrivateTab = document.body.classList.contains('is-private');
  const pt = state.partnerTheme;
  const active = !!pt && !isPrivateTab;
  document.body.classList.toggle('partner-theme-active', active);

  if (!active) {
    PARTNER_CHROME_VAR_NAMES.forEach((name) => document.body.style.removeProperty(name));
    return;
  }

  document.body.style.setProperty('--pt-bg', pt.bgColor);
  document.body.style.setProperty('--pt-surface', pt.surfaceColor);
  document.body.style.setProperty('--pt-surface-hover', shadeColor(pt.surfaceColor, -12));
  document.body.style.setProperty('--pt-text', pt.textColor);
  document.body.style.setProperty('--pt-border', pt.borderColor);
  document.body.style.setProperty('--pt-border-strong', shadeColor(pt.borderColor, 20));
}

function applyCustomizations() {
  const resolvedAccent = state.accentColor || (state.partnerTheme && state.partnerTheme.accentColor) || THEME_ACCENTS[state.theme] || '#3b82f6';
  document.documentElement.style.setProperty('--user-accent', resolvedAccent);
  document.documentElement.style.setProperty('--user-accent-text', readableTextColor(resolvedAccent));
  document.documentElement.style.fontSize = `${Math.round((state.uiZoom || 1) * 100)}%`;
  document.body.classList.toggle('compact-tabs', state.compactTabs);
  document.body.classList.toggle('always-show-tab-close', state.alwaysShowTabClose);
  document.body.classList.toggle('auto-hide-toolbar', state.autoHideToolbar);
  if (!state.autoHideToolbar) document.body.classList.remove('toolbar-revealed');
  document.body.classList.toggle('bold-active-tab', state.boldActiveTab);
  document.body.classList.toggle('always-show-bookmarks-bar', state.alwaysShowBookmarksBar);
  document.body.classList.toggle('underline-links-hover', state.underlineLinksOnHover);
  document.body.classList.toggle('sharp-corners', state.sharpCorners);
  document.body.classList.toggle('font-style-rounded', state.uiFontStyle === 'rounded');
  document.body.classList.toggle('reduce-motion', state.reduceMotion);
  document.body.classList.toggle('toolbar-icon-size-compact', state.toolbarIconSize === 'compact');
  document.body.classList.toggle('tab-bar-sidebar', state.tabBarStyle === 'sidebar');
  applyPartnerThemeChromeVars();
  renderBookmarksBar();
  updateClockVisibility();
}

let clockInterval = null;

function updateClockVisibility() {
  const el = document.getElementById('toolbar-clock');
  el.classList.toggle('hidden', !state.showClock);
  if (state.showClock && !clockInterval) {
    const tick = () => { el.textContent = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); };
    tick();
    clockInterval = setInterval(tick, 15000);
  } else if (!state.showClock && clockInterval) {
    clearInterval(clockInterval);
    clockInterval = null;
  }
}

const PRIVATE_PARTITION = 'mi-private';

function createTab(url = 'mi://newtab', { isPrivate = false, background = false } = {}) {
  const tab = {
    id: tabIdCounter++,
    url: url || 'mi://newtab',
    title: isPrivate ? 'Private Tab' : 'New Tab',
    isPrivate
  };

  tabs.push(tab);
  createWebview(tab.id, tab.url, isPrivate);
  if (background && activeTabId !== null) renderTabs();
  else switchTab(tab.id);

  if (tabs.length > 30) {
    const oldest = tabs.shift();
    destroyWebview(oldest.id);
  }
}

function isSplitActive() {
  return splitLeftTabId !== null && splitRightTabId !== null;
}

function layoutWebviews() {
  document.querySelectorAll('#webview-container webview').forEach((el) => {
    const id = parseInt(el.id.slice('webview-'.length), 10);
    let visible = false;
    let left = '0';
    let width = '100%';

    if (isSplitActive() && id === splitLeftTabId) {
      visible = true;
      left = '0';
      width = 'calc(50% - 1.5px)';
    } else if (isSplitActive() && id === splitRightTabId) {
      visible = true;
      left = 'calc(50% + 1.5px)';
      width = 'calc(50% - 1.5px)';
    } else if (!isSplitActive() && id === activeTabId) {
      visible = true;
    }

    el.style.left = left;
    el.style.width = width;
    el.style.visibility = visible ? 'visible' : 'hidden';
    el.style.zIndex = visible ? '1' : '0';
    el.style.pointerEvents = visible ? 'auto' : 'none';

    if (el.dataset.miReady === 'true') {
      const tabForEl = tabs.find(t => t.id === id);
      if (tabForEl && tabForEl.manuallyMuted) el.setAudioMuted(true);
      else if (visible) el.setAudioMuted(false);
      else if (state.autoMuteBackgroundTabs) el.setAudioMuted(true);
    }
  });

  document.getElementById('split-divider').classList.toggle('hidden', !isSplitActive());
  document.getElementById('split-view-btn').classList.toggle('active', isSplitActive());
}

function refreshToolbarForActiveTab() {
  const tab = tabs.find(t => t.id === activeTabId);
  if (tab) document.getElementById('address-bar').value = tab.url;

  applyChromeTheme(tab);
  applyCustomizations();
  updatePipButton();
  document.getElementById('reader-mode-btn').classList.toggle('active', !!(tab && tab.readerMode));
  document.getElementById('force-dark-btn').classList.toggle('active', !!(tab && tab.forceDarkKey));
  if (typeof closeFindBar === 'function') closeFindBar();

  const popover = document.getElementById('site-menu-popover');
  if (popover) popover.classList.add('hidden');
  hideAddressSuggestions();
  document.getElementById('google-blocked-banner').classList.add('hidden');

  renderTabs();
}

function switchTab(tabId) {
  if (isSplitActive() && tabId !== splitLeftTabId && tabId !== splitRightTabId) {
    exitSplitView();
  }

  activeTabId = tabId;
  layoutWebviews();
  refreshToolbarForActiveTab();
  notifyTabActivated(tabId);
}

// A settings tab left open in the background can go stale (partner theme
// list changed in the DB, etc. since it was last loaded) — the page itself
// never reloads just from switching tabs, so tell it explicitly each time
// it becomes the active tab, and let it decide what to refresh.
function notifyTabActivated(tabId) {
  const tab = tabs.find((t) => t.id === tabId);
  if (!tab || !tab.url || !tab.url.startsWith('mi://settings')) return;
  const webview = document.getElementById(`webview-${tabId}`);
  if (webview && webview.dataset.miReady === 'true') webview.send('mi-tab-activated');
}

function enterSplitView(leftTabId, rightTabId) {
  splitLeftTabId = leftTabId;
  splitRightTabId = rightTabId;
  activeTabId = leftTabId;
  layoutWebviews();
  refreshToolbarForActiveTab();
}

function exitSplitView() {
  splitLeftTabId = null;
  splitRightTabId = null;
  layoutWebviews();
}

function focusSplitPane(tabId) {
  if (!isSplitActive() || tabId === activeTabId) return;
  if (tabId !== splitLeftTabId && tabId !== splitRightTabId) return;
  activeTabId = tabId;
  refreshToolbarForActiveTab();
}

function applyChromeTheme(tab) {
  const base = 'm-0 p-0 overflow-hidden h-screen';
  document.body.className = tab && tab.isPrivate
    ? `${base} theme-private`
    : `${base} theme-${state.theme}`;
  document.body.classList.toggle('is-private', !!(tab && tab.isPrivate));
}

function destroyWebview(tabId) {
  const webview = document.getElementById(`webview-${tabId}`);
  if (webview) webview.remove();
}

function hasDuplicateTabs() {
  const seen = new Set();
  return tabs.some((t) => {
    if (seen.has(t.url)) return true;
    seen.add(t.url);
    return false;
  });
}

function closeDuplicateTabs() {
  const seen = new Set();
  const toClose = [];
  tabs.forEach((t) => {
    if (t.isPrivate) return;
    if (seen.has(t.url)) toClose.push(t.id);
    else seen.add(t.url);
  });
  toClose.forEach((id) => closeTab(id));
}

function allTabsMuted() {
  return tabs.length > 0 && tabs.every((t) => t.manuallyMuted);
}

function toggleMuteAllTabs() {
  const shouldMute = !allTabsMuted();
  tabs.forEach((t) => {
    t.manuallyMuted = shouldMute;
    const webview = document.getElementById(`webview-${t.id}`);
    if (webview && webview.dataset.miReady === 'true') webview.setAudioMuted(shouldMute);
  });
}

async function copyActiveTabAsMarkdown() {
  const tab = tabs.find((t) => t.id === activeTabId);
  if (!tab) return;
  await window.electron.clipboard.writeText(`[${tab.title || tab.url}](${tab.url})`);
}

async function captureActiveTabScreenshot() {
  const tab = tabs.find((t) => t.id === activeTabId);
  if (!tab || tab.webContentsId == null) return;
  await window.electron.captureWebview(tab.webContentsId);
}

function closeTab(tabId) {
  const wasSplitLeft = tabId === splitLeftTabId;
  const wasSplitRight = tabId === splitRightTabId;
  const splitRemainingId = wasSplitLeft ? splitRightTabId : wasSplitRight ? splitLeftTabId : null;

  const index = tabs.findIndex(t => t.id === tabId);
  if (index !== -1) {
    const [closed] = tabs.splice(index, 1);
    if (closed.url && !closed.url.startsWith('mi://newtab') && !closed.isPrivate) {
      closedTabsStack.push({ url: closed.url, title: closed.title });
      if (closedTabsStack.length > 20) closedTabsStack.shift();
    }
  }
  destroyWebview(tabId);

  if (wasSplitLeft || wasSplitRight) {
    splitLeftTabId = null;
    splitRightTabId = null;
  }

  if (tabs.length === 0) {
    createTab('mi://newtab');
  } else if (splitRemainingId !== null) {
    switchTab(splitRemainingId);
  } else if (tabId === activeTabId) {
    const nextTab = tabs[Math.max(0, index - 1)];
    switchTab(nextTab.id);
  } else {
    renderTabs();
  }
}

function renderTabs() {
  const container = document.getElementById('tabs-container');
  const newTabBtn = container.querySelector('#new-tab-btn');
  container.innerHTML = '';
  container.appendChild(newTabBtn);

  tabs.forEach(tab => {
    const tabEl = document.createElement('div');
    tabEl.className = `tab ${tab.id === activeTabId ? 'active' : ''} ${tab.isPrivate ? 'tab-private' : ''}`;
    const inSplit = tab.id === splitLeftTabId || tab.id === splitRightTabId;
    let tabHostname = '';
    if (!tab.isPrivate) { try { tabHostname = new URL(tab.url).hostname; } catch (err) { /* mi:// pages etc have no favicon */ } }
    const faviconHtml = (!tab.loading && !tab.isPrivate) ? faviconMarkup(tab.favicon, tabHostname, 'tab-favicon') : '';
    tabEl.innerHTML = `
      ${tab.loading ? '<span class="tab-spinner"></span>' : ''}
      ${faviconHtml}
      ${tab.isPrivate ? '<span class="tab-private-badge" title="Private tab"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="12" r="3.2"></circle><circle cx="17" cy="12" r="3.2"></circle><line x1="10.2" y1="12" x2="13.8" y2="12"></line><path d="M3.5 8 6 6h2l1.5 2"></path><path d="M20.5 8 18 6h-2l-1.5 2"></path></svg></span>' : ''}
      ${inSplit ? '<span class="tab-split-badge" title="In split view"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="12" y1="4" x2="12" y2="20"/></svg></span>' : ''}
      <span class="tab-title">${escapeHtmlAddr(tab.title)}</span>
      <button class="tab-close" data-tab-id="${tab.id}">✕</button>
    `;

    tabEl.addEventListener('click', (e) => {
      if (!e.target.classList.contains('tab-close')) {
        switchTab(tab.id);
      }
    });

    tabEl.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(tab.id);
    });

    tabEl.addEventListener('auxclick', (e) => {
      if (state.middleClickCloseTab && e.button === 1) {
        e.preventDefault();
        closeTab(tab.id);
      }
    });

    tabEl.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const selected = await window.electron.contextMenu.show([
        { id: 'new-tab', label: 'New Tab' },
        { id: 'new-private-tab', label: 'New Private Tab' },
        { id: 'reload', label: 'Reload Tab' },
        { id: 'duplicate', label: 'Duplicate Tab' },
        { type: 'separator' },
        { id: 'close', label: 'Close Tab' },
        { id: 'close-others', label: 'Close Other Tabs', enabled: tabs.length > 1 },
        { id: 'close-right', label: 'Close Tabs to the Right', enabled: tabs.indexOf(tab) < tabs.length - 1 },
        { type: 'separator' },
        inSplit
          ? { id: 'exit-split', label: 'Exit Split View' }
          : { id: 'split-with-this', label: 'Split View with Active Tab', enabled: tab.id !== activeTabId }
      ]);

      if (selected === 'new-tab') {
        createTab('mi://newtab');
      } else if (selected === 'new-private-tab') {
        createTab('mi://private', { isPrivate: true });
      } else if (selected === 'reload') {
        const wv = document.getElementById(`webview-${tab.id}`);
        if (wv) wv.reload();
      } else if (selected === 'duplicate') {
        createTab(tab.url, { isPrivate: tab.isPrivate });
      } else if (selected === 'close') {
        closeTab(tab.id);
      } else if (selected === 'close-others') {
        tabs.filter(t => t.id !== tab.id).forEach(t => destroyWebview(t.id));
        tabs = [tab];
        switchTab(tab.id);
      } else if (selected === 'close-right') {
        const cutIndex = tabs.indexOf(tab);
        const toClose = tabs.slice(cutIndex + 1);
        toClose.forEach(t => destroyWebview(t.id));
        tabs = tabs.slice(0, cutIndex + 1);
        renderTabs();
      } else if (selected === 'split-with-this') {
        enterSplitView(activeTabId, tab.id);
      } else if (selected === 'exit-split') {
        const remainingId = tab.id === splitLeftTabId ? splitRightTabId : splitLeftTabId;
        splitLeftTabId = null;
        splitRightTabId = null;
        switchTab(remainingId);
      }
    });

    container.appendChild(tabEl);
  });
}

const NETWORK_ERROR_CODES = new Set([-2, -6, -21, -101, -102, -105, -106, -109, -118, -137, -138]);
const IGNORABLE_ERROR_CODES = new Set([-3]);

const BROWSER_REALISM_SCRIPT = `(function() {
  if (window.__miRealismApplied) return;
  window.__miRealismApplied = true;

  try {
    if (window.outerWidth === window.innerWidth && window.outerHeight === window.innerHeight) {
      Object.defineProperty(window, 'outerWidth', { get: function () { return window.innerWidth; }, configurable: true });
      Object.defineProperty(window, 'outerHeight', { get: function () { return window.innerHeight + 87; }, configurable: true });
    }
  } catch (e) {}

  try {
    if (navigator.webdriver) {
      Object.defineProperty(Navigator.prototype, 'webdriver', { get: function () { return false; }, configurable: true });
    }
  } catch (e) {}

  try {
    if (navigator.plugins.length === 0) {
      var fakePlugin = { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 1 };
      var fakePlugins = [fakePlugin];
      fakePlugins.item = function (i) { return fakePlugins[i]; };
      fakePlugins.namedItem = function (n) { return fakePlugins.find(function (p) { return p.name === n; }); };
      fakePlugins.refresh = function () {};
      Object.defineProperty(Navigator.prototype, 'plugins', { get: function () { return fakePlugins; }, configurable: true });
    }
  } catch (e) {}
})();`;

function buildPrivacyNoiseScript(hostname) {
  const seedInput = JSON.stringify(hostname);
  return `(function() {
    if (window.__miPrivacyApplied) return;
    window.__miPrivacyApplied = true;
    try { Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { value: true, configurable: true }); } catch (e) {}

    function hashString(str) {
      let hash = 0;
      for (let i = 0; i < str.length; i++) { hash = (hash << 5) - hash + str.charCodeAt(i); hash |= 0; }
      return Math.abs(hash) || 1;
    }
    var siteSeed = hashString(${seedInput});

    function stableNoise(a, b) {
      var x = Math.sin(a * 12.9898 + b * 78.233 + siteSeed) * 43758.5453;
      return x - Math.floor(x);
    }
    function stablePixelNoise(index) {
      return Math.floor(stableNoise(index, 0) * 3) - 1;
    }

    try {
      var origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
      CanvasRenderingContext2D.prototype.getImageData = function () {
        var data = origGetImageData.apply(this, arguments);
        for (var i = 0; i < data.data.length; i += 4) {
          data.data[i] = Math.min(255, Math.max(0, data.data[i] + stablePixelNoise(i)));
        }
        return data;
      };

      var origToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function () {
        try {
          var clone = document.createElement('canvas');
          clone.width = this.width;
          clone.height = this.height;
          var cctx = clone.getContext('2d');
          cctx.drawImage(this, 0, 0);
          var imageData = origGetImageData.call(cctx, 0, 0, clone.width, clone.height);
          for (var i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] = Math.min(255, Math.max(0, imageData.data[i] + stablePixelNoise(i)));
          }
          cctx.putImageData(imageData, 0, 0);
          return origToDataURL.apply(clone, arguments);
        } catch (err) {
          return origToDataURL.apply(this, arguments);
        }
      };

      if (window.AudioBuffer) {
        var origGetChannelData = AudioBuffer.prototype.getChannelData;
        AudioBuffer.prototype.getChannelData = function () {
          var data = origGetChannelData.apply(this, arguments);
          for (var i = 0; i < data.length; i += 100) {
            data[i] += (stableNoise(i, 1) - 0.5) * 0.0001;
          }
          return data;
        };
      }

      var origMeasureText = CanvasRenderingContext2D.prototype.measureText;
      CanvasRenderingContext2D.prototype.measureText = function (text) {
        var metrics = origMeasureText.apply(this, arguments);
        var textSeed = hashString(String(text));
        var noise = (stableNoise(textSeed, 2) - 0.5) * 0.02;
        try { Object.defineProperty(metrics, 'width', { value: metrics.width + noise, configurable: true }); } catch (e) {}
        return metrics;
      };

      var GENERIC_VENDOR = 'Google Inc. (Intel)';
      var GENERIC_RENDERER = 'ANGLE (Intel, Intel(R) Iris(TM) Plus Graphics, OpenGL 4.1)';
      function patchWebGL(proto) {
        if (!proto) return;
        var origGetParameter = proto.getParameter;
        proto.getParameter = function (param) {
          if (param === 37445) return GENERIC_VENDOR;
          if (param === 37446) return GENERIC_RENDERER;
          return origGetParameter.apply(this, arguments);
        };
        var origReadPixels = proto.readPixels;
        proto.readPixels = function (x, y, width, height, format, type, pixels) {
          var result = origReadPixels.apply(this, arguments);
          if (pixels && pixels.length) {
            for (var i = 0; i < pixels.length; i += 40) {
              pixels[i] = Math.min(255, Math.max(0, pixels[i] + stablePixelNoise(i)));
            }
          }
          return result;
        };
      }
      if (window.WebGLRenderingContext) patchWebGL(WebGLRenderingContext.prototype);
      if (window.WebGL2RenderingContext) patchWebGL(WebGL2RenderingContext.prototype);

      var genericCores = [4, 8][Math.floor(stableNoise(0, 3) * 2)];
      var genericMemory = [4, 8][Math.floor(stableNoise(0, 4) * 2)];
      try { Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { value: genericCores, configurable: true }); } catch (e) {}
      try { Object.defineProperty(Navigator.prototype, 'deviceMemory', { value: genericMemory, configurable: true }); } catch (e) {}
    } catch (e) {}
  })();`;
}

const FINGERPRINT_NOISE_EXEMPT_HOSTS = new Set(['accounts.google.com', 'accounts.youtube.com']);

async function injectPrivacyProtections(webview) {
  let currentUrl;
  try { currentUrl = new URL(webview.getURL()); } catch (err) { return; }
  if (!['http:', 'https:', 'data:', 'blob:', 'file:'].includes(currentUrl.protocol)) return;
  const hostname = currentUrl.hostname || currentUrl.protocol;

  webview.executeJavaScript(BROWSER_REALISM_SCRIPT, true).catch(() => {});

  if (FINGERPRINT_NOISE_EXEMPT_HOSTS.has(currentUrl.hostname)) return;

  const [enabled, excepted, blocklistInfo] = await Promise.all([
    window.electron.getOut.isEnabled(),
    window.electron.getOut.isExcepted(currentUrl.hostname),
    window.electron.getOut.getBlocklistInfo()
  ]);

  if (!enabled || excepted) return;
  if (blocklistInfo.enabledCategories && blocklistInfo.enabledCategories.fingerprinting === false) return;

  webview.executeJavaScript(buildPrivacyNoiseScript(hostname), true).catch(() => {});
}

const googleBlockedBanner = document.getElementById('google-blocked-banner');
const googleBlockedOpenBtn = document.getElementById('google-blocked-open-btn');
const googleBlockedCloseBtn = document.getElementById('google-blocked-close-btn');
const OTHER_BROWSER_LABEL = navigator.userAgent.includes('Windows') ? 'Open in Edge' : navigator.userAgent.includes('Mac') ? 'Open in Safari' : 'Open in another browser';
googleBlockedOpenBtn.textContent = OTHER_BROWSER_LABEL;

googleBlockedCloseBtn.addEventListener('click', () => {
  googleBlockedBanner.classList.add('hidden');
});

async function checkGoogleSignInBlocked(webview, tabId) {
  let hostname;
  try { hostname = new URL(webview.getURL()).hostname; } catch (err) { return; }
  if (hostname !== 'accounts.google.com' && hostname !== 'accounts.youtube.com') return;

  const blocked = await webview.executeJavaScript(
    'document.body ? document.body.innerText.toLowerCase().includes("may not be secure") : false',
    true
  ).catch(() => false);

  if (!blocked || tabId !== activeTabId) return;

  googleBlockedBanner.classList.remove('hidden');
  googleBlockedOpenBtn.onclick = () => {
    window.electron.app.openInOtherBrowser(webview.getURL());
    googleBlockedBanner.classList.add('hidden');
  };
}

function createWebview(tabId, url, isPrivate = false) {
  const container = document.getElementById('webview-container');

  const webview = document.createElement('webview');
  webview.id = `webview-${tabId}`;
  webview.setAttribute('allowpopups', 'true');
  if (state.pauseAutoplayVideos) webview.setAttribute('webpreferences', 'autoplayPolicy=user-gesture-required');
  if (isPrivate) webview.partition = PRIVATE_PARTITION;
  webview.src = url;
  webview.style.position = 'absolute';
  webview.style.top = '0';
  webview.style.left = '0';
  webview.style.width = '100%';
  webview.style.height = '100%';
  webview.style.visibility = 'hidden';
  webview.style.zIndex = '0';
  webview.style.pointerEvents = 'none';

  webview.addEventListener('focus', () => focusSplitPane(tabId));

  webview.addEventListener('page-title-updated', (e) => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
      tab.title = e.title || 'Loading...';
      renderTabs();
      if (!tab.isPrivate) window.electron.history.add({ url: tab.url, title: tab.title });
    }
  });

  // Chromium resolves whatever icon format the site actually declares
  // (ico/png/svg/webp/...), so this is more reliable than guessing a
  // /favicon.ico path ourselves.
  webview.addEventListener('page-favicon-updated', (e) => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab && e.favicons && e.favicons.length > 0) {
      tab.favicon = e.favicons[0];
      renderTabs();
    }
  });

  webview.addEventListener('did-start-loading', () => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
      tab.loading = true;
      renderTabs();
    }
  });

  webview.addEventListener('did-stop-loading', () => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
      tab.loading = false;
      renderTabs();
    }
    checkGoogleSignInBlocked(webview, tabId);
  });

  webview.addEventListener('dom-ready', () => {
    if (state.smoothScrolling) webview.insertCSS('html { scroll-behavior: smooth !important; }').catch(() => {});
    if (state.underlineLinksOnHover) webview.insertCSS('a:hover { text-decoration: underline !important; }').catch(() => {});
    injectPrivacyProtections(webview);
    setTimeout(() => {
      webview.dataset.miReady = 'true';
      const tab = tabs.find(t => t.id === tabId);
      if (tab && tab.manuallyMuted) webview.setAudioMuted(true);
      else if (tabId === activeTabId) webview.setAudioMuted(false);
      else if (state.autoMuteBackgroundTabs) webview.setAudioMuted(true);
    }, 0);
  });

  webview.addEventListener('did-navigate', (e) => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
      tab.url = e.url;
      if (tabId === activeTabId) document.getElementById('address-bar').value = e.url;

      if (tab.pendingPasswordCapture && Date.now() - tab.pendingPasswordCapture.capturedAt < 8000) {
        maybeOfferPasswordSave(tab, tab.pendingPasswordCapture);
      }
      tab.pendingPasswordCapture = null;
    }
  });

  webview.addEventListener('did-fail-load', (e) => {
    if (!e.isMainFrame || IGNORABLE_ERROR_CODES.has(e.errorCode)) return;

    const target = NETWORK_ERROR_CODES.has(e.errorCode) ? 'mi://offline' : 'mi://500';
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
      tab.url = target;
      webview.src = target;
    }
  });

  webview.addEventListener('ipc-message', (e) => {
    if (e.channel === 'mi-pip-availability') {
      const tab = tabs.find(t => t.id === tabId);
      if (tab) tab.hasPlayingVideo = e.args[0];
      if (tabId === activeTabId) updatePipButton();
    } else if (e.channel === 'mi-near-top') {
      if (tabId !== activeTabId) return;
      if (e.args[0]) revealToolbar();
      else scheduleToolbarHide();
    } else if (e.channel === 'mi-ctrl-down') {
      if (tabId === activeTabId) startAirTabTimer();
    } else if (e.channel === 'mi-ctrl-cancel') {
      if (tabId === activeTabId) cancelAirTabTimer();
    } else if (e.channel === 'mi-ctrl-up') {
      if (tabId === activeTabId) {
        cancelAirTabTimer();
        if (airTabOpen) closeAirTab(true);
      }
    }
  });

  webview.addEventListener('ipc-message', (e) => {
    if (e.channel === 'mi-password-lookup') {
      let hostname;
      try { hostname = new URL(webview.getURL()).hostname; } catch (err) { return; }
      window.electron.passwords.findForOrigin(hostname).then((matches) => {
        webview.send('mi-password-lookup-result', matches);
      });
    } else if (e.channel === 'mi-password-fill-request') {
      window.electron.passwords.reveal(e.args[0]).then((value) => {
        webview.send('mi-password-fill-value', value);
      });
    } else if (e.channel === 'mi-password-capture') {
      const tab = tabs.find(t => t.id === tabId);
      if (tab) tab.pendingPasswordCapture = { ...e.args[0], capturedAt: Date.now() };
    }
  });

  webview.addEventListener('context-menu', async (e) => {
    const p = e.params;
    const sections = [[
      { id: 'back', label: 'Back' },
      { id: 'forward', label: 'Forward' },
      { id: 'reload', label: 'Reload' }
    ]];

    if (p.linkURL) {
      sections.push([
        { id: 'open-link-new-tab', label: 'Open Link in New Tab' },
        { id: 'copy-link', label: 'Copy Link Address' }
      ]);
    }

    const editSection = [];
    if (p.isEditable) {
      editSection.push({ id: 'cut', label: 'Cut', enabled: !!p.selectionText });
      editSection.push({ id: 'copy', label: 'Copy', enabled: !!p.selectionText });
      editSection.push({ id: 'paste', label: 'Paste' });
    } else if (p.selectionText) {
      editSection.push({ id: 'copy', label: 'Copy' });
      const trimmed = p.selectionText.trim();
      const shortSelection = trimmed.length > 40 ? trimmed.slice(0, 40) + '…' : trimmed;
      editSection.push({ id: 'search-selection', label: `Search for "${shortSelection}"` });
    }
    if (editSection.length) sections.push(editSection);

    sections.push([{ id: 'pin-page', label: 'Pin This Page to Bookmarks Bar' }, { id: 'inspect', label: 'Inspect Element' }]);

    const items = sections.flatMap((section, i) => (i === 0 ? section : [{ type: 'separator' }, ...section]));
    const selected = await window.electron.contextMenu.show(items);

    if (selected === 'back') webview.goBack();
    else if (selected === 'forward') webview.goForward();
    else if (selected === 'reload') webview.reload();
    else if (selected === 'open-link-new-tab') {
      const tab = tabs.find(t => t.id === tabId);
      createTab(p.linkURL, { isPrivate: tab && tab.isPrivate, background: state.openTabsInBackground });
    }
    else if (selected === 'copy-link') window.electron.clipboard.writeText(p.linkURL);
    else if (selected === 'cut') webview.cut();
    else if (selected === 'copy') webview.copy();
    else if (selected === 'paste') webview.paste();
    else if (selected === 'inspect') webview.inspectElement(p.x, p.y);
    else if (selected === 'pin-page') {
      const tab = tabs.find(t => t.id === tabId);
      if (tab) window.electron.bookmarks.add({ url: tab.url, title: tab.title, favicon: tab.favicon || null });
    }
    else if (selected === 'search-selection') {
      const url = buildSearchUrl(getSearchEngineUrlPrefix(state.searchEngine), p.selectionText.trim());
      const tab = tabs.find(t => t.id === tabId);
      createTab(url, { isPrivate: tab && tab.isPrivate, background: state.openTabsInBackground });
    }
  });

  webview.addEventListener('dom-ready', () => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) tab.webContentsId = webview.getWebContentsId();
  });

  webview.addEventListener('found-in-page', (e) => {
    if (tabId !== activeTabId) return;
    const { activeMatchOrdinal, matches } = e.result;
    const findMatchesEl = document.getElementById('find-matches');
    if (findMatchesEl) findMatchesEl.textContent = matches > 0 ? `${activeMatchOrdinal}/${matches}` : 'No results';
  });

  webview.addEventListener('before-input-event', (e) => {
    const input = e.input;
    if (input.type !== 'keyDown') return;
    const handled = performShortcut({
      key: input.key,
      mod: input.control || input.meta,
      shift: input.shift,
      alt: input.alt
    });
    if (handled) e.preventDefault();
  });

  container.appendChild(webview);
}

function navigateTab(tabId, url) {
  const tab = tabs.find(t => t.id === tabId);
  const webview = document.getElementById(`webview-${tabId}`);
  if (tab) tab.url = url;
  if (webview) webview.src = url;
  if (tabId === activeTabId) document.getElementById('address-bar').value = url;
}

document.getElementById('new-tab-btn').addEventListener('click', () => {
  createTab(getNewTabUrl());
});

function getSearchEngineUrlPrefix(key) {
  if (SEARCH_ENGINES[key]) return SEARCH_ENGINES[key];
  const custom = state.customSearchEngines.find((e) => e.key === key);
  return custom ? custom.urlPrefix : SEARCH_ENGINES.google;
}

function buildSearchUrl(urlPrefix, query) {
  const encoded = encodeURIComponent(query);
  return urlPrefix.includes('%s') ? urlPrefix.replace(/%s/g, encoded) : `${urlPrefix}${encoded}`;
}

function resolveAddressBarInput(text) {
  let url = text.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('mi://')) {
    url = buildSearchUrl(getSearchEngineUrlPrefix(state.searchEngine), url);
  }
  return url;
}

function commitAddressBar(url) {
  if (activeTabId !== null) navigateTab(activeTabId, url);
  hideAddressSuggestions();
}

const addressBar = document.getElementById('address-bar');
const addressSuggestions = document.getElementById('address-suggestions');
let suggestionItems = [];
let suggestionIndex = -1;

function hideAddressSuggestions() {
  addressSuggestions.classList.add('hidden');
  addressSuggestions.innerHTML = '';
  suggestionItems = [];
  suggestionIndex = -1;
}

function renderAddressSuggestions(query, matches) {
  suggestionItems = matches;
  suggestionIndex = -1;
  addressSuggestions.innerHTML = '';

  matches.forEach((m, i) => {
    const row = document.createElement('div');
    row.className = 'address-suggestion-row';
    row.dataset.index = i;
    row.innerHTML = `
      <div class="flex-1 min-w-0">
        <div class="address-suggestion-title">${escapeHtmlAddr(m.title)}</div>
        <div class="address-suggestion-url">${escapeHtmlAddr(m.url)}</div>
      </div>
      ${m.source === 'bookmark' ? '<span class="text-xs opacity-50">★</span>' : ''}
      ${m.source === 'google' ? '<span class="address-suggestion-google-tag">Google</span>' : ''}
    `;
    row.addEventListener('mousedown', (e) => {
      e.preventDefault();
      commitAddressBar(m.url);
    });
    addressSuggestions.appendChild(row);
  });

  if (matches.some((m) => m.source === 'google')) {
    const notice = document.createElement('div');
    notice.className = 'address-suggestion-notice';
    notice.innerHTML = `
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
      <span>Your typing is being sent to Google for these suggestions.</span>
    `;
    addressSuggestions.appendChild(notice);
  }

  addressSuggestions.classList.toggle('hidden', matches.length === 0);
}

function escapeHtmlAddr(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeHtmlAttr(str) {
  return escapeHtmlAddr(str).replace(/"/g, '&quot;');
}

// Any format Chromium itself resolves for the page (ico/png/svg/webp/...)
// works here since it's just an <img src>. The one real gap is sites that
// never declare a <link rel="icon"> at all — page-favicon-updated then
// never fires — so we chain a /favicon.ico guess as a second attempt
// before giving up, instead of just failing silently.
function handleFaviconError(img) {
  const fallback = img.dataset.fallback;
  if (fallback) {
    img.removeAttribute('data-fallback');
    img.src = fallback;
  } else {
    img.remove();
  }
}

function faviconMarkup(url, hostname, className) {
  const candidates = [];
  if (url) candidates.push(url);
  const guess = hostname ? `https://${hostname}/favicon.ico` : null;
  if (guess && guess !== url) candidates.push(guess);
  if (candidates.length === 0) return '';

  const fallbackAttr = candidates[1] ? ` data-fallback="${escapeHtmlAttr(candidates[1])}"` : '';
  return `<img src="${escapeHtmlAttr(candidates[0])}" class="${className}"${fallbackAttr} onerror="handleFaviconError(this)" />`;
}

let googleSuggestDebounce = null;

async function updateAddressSuggestions() {
  const query = addressBar.value.trim();
  if (googleSuggestDebounce) { clearTimeout(googleSuggestDebounce); googleSuggestDebounce = null; }

  if (!query || query.startsWith('mi://')) {
    hideAddressSuggestions();
    return;
  }

  const [history, bookmarks] = await Promise.all([
    window.electron.history.getAll(),
    window.electron.bookmarks.getAll()
  ]);

  const q = query.toLowerCase();
  const matchesOf = (list, source) => list
    .filter((e) => e.title.toLowerCase().includes(q) || e.url.toLowerCase().includes(q))
    .map((e) => ({ title: e.title, url: e.url, source }));

  const seen = new Set();
  const combined = [
    ...(state.addressBarBookmarkSuggestions ? matchesOf(bookmarks, 'bookmark') : []),
    ...(state.addressBarHistorySuggestions ? matchesOf(history, 'history') : [])
  ]
    .filter((m) => {
      if (seen.has(m.url)) return false;
      seen.add(m.url);
      return true;
    })
    .slice(0, 6);

  if (addressBar.value.trim() === query) renderAddressSuggestions(query, combined);

  if (state.searchEngine === 'google' && state.googleSuggestEnabled) {
    googleSuggestDebounce = setTimeout(() => fetchGoogleSuggestions(query, combined), 180);
  }
}

async function fetchGoogleSuggestions(query, localMatches) {
  const suggestions = await window.electron.search.googleSuggest(query).catch(() => []);
  if (addressBar.value.trim() !== query || !suggestions.length) return;

  const engine = SEARCH_ENGINES.google;
  const seen = new Set(localMatches.map((m) => m.url.toLowerCase()));
  const googleMatches = suggestions
    .filter((s) => !seen.has(s.toLowerCase()))
    .map((s) => ({ title: s, url: `${engine}${encodeURIComponent(s)}`, source: 'google' }))
    .slice(0, 4);

  renderAddressSuggestions(query, [...localMatches, ...googleMatches]);
}

addressBar.addEventListener('input', () => {
  updateAddressSuggestions();
});

addressBar.addEventListener('focus', () => {
  if (addressBar.value.trim()) updateAddressSuggestions();
  if (state.selectAddressBarOnFocus) addressBar.select();
});

addressBar.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' && suggestionItems.length > 0) {
    e.preventDefault();
    suggestionIndex = Math.min(suggestionIndex + 1, suggestionItems.length - 1);
    updateSuggestionSelection();
  } else if (e.key === 'ArrowUp' && suggestionItems.length > 0) {
    e.preventDefault();
    suggestionIndex = Math.max(suggestionIndex - 1, -1);
    updateSuggestionSelection();
  } else if (e.key === 'Escape') {
    hideAddressSuggestions();
  }
});

function updateSuggestionSelection() {
  Array.from(addressSuggestions.children).forEach((row, i) => {
    row.classList.toggle('selected', i === suggestionIndex);
  });
  if (suggestionIndex >= 0) {
    addressBar.value = suggestionItems[suggestionIndex].url;
  }
}

addressBar.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const url = suggestionIndex >= 0 ? suggestionItems[suggestionIndex].url : resolveAddressBarInput(addressBar.value);
    commitAddressBar(url);
  }
});

document.addEventListener('click', (e) => {
  if (addressSuggestions.classList.contains('hidden')) return;
  if (addressSuggestions.contains(e.target) || e.target === addressBar) return;
  hideAddressSuggestions();
});

document.getElementById('back-btn').addEventListener('click', () => {
  const webview = document.querySelector(`#webview-${activeTabId}`);
  if (webview) webview.goBack();
});

document.getElementById('forward-btn').addEventListener('click', () => {
  const webview = document.querySelector(`#webview-${activeTabId}`);
  if (webview) webview.goForward();
});

document.getElementById('reload-btn').addEventListener('click', () => {
  const webview = document.querySelector(`#webview-${activeTabId}`);
  if (webview) webview.reload();
});

document.getElementById('menu-btn').addEventListener('click', async () => {
  const selected = await window.electron.contextMenu.show([
    { id: 'new-tab', label: 'New Tab' },
    { id: 'new-private-tab', label: 'New Private Tab' },
    { type: 'separator' },
    { id: 'screenshot', label: 'Screenshot This Page' },
    { id: 'copy-markdown', label: 'Copy Page as Markdown Link' },
    { id: 'close-duplicates', label: 'Close Duplicate Tabs', enabled: hasDuplicateTabs() },
    { id: 'mute-all', label: allTabsMuted() ? 'Unmute All Tabs' : 'Mute All Tabs' },
    { type: 'separator' },
    { id: 'history', label: 'History' },
    { id: 'downloads', label: 'Downloads' },
    { type: 'separator' },
    { id: 'settings', label: 'Settings' }
  ]);

  if (selected === 'new-tab') createTab(getNewTabUrl());
  else if (selected === 'new-private-tab') createTab('mi://private', { isPrivate: true });
  else if (selected === 'screenshot') captureActiveTabScreenshot();
  else if (selected === 'copy-markdown') copyActiveTabAsMarkdown();
  else if (selected === 'close-duplicates') closeDuplicateTabs();
  else if (selected === 'mute-all') toggleMuteAllTabs();
  else if (selected === 'history') createTab('mi://history');
  else if (selected === 'downloads') createTab('mi://downloads');
  else if (selected === 'settings') createTab('mi://settings');
});

document.getElementById('passwords-btn').addEventListener('click', () => {
  createTab('mi://settings#passwords');
});

function getActiveHostname() {
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab) return null;
  try {
    return new URL(tab.url).hostname || null;
  } catch (err) {
    return null;
  }
}

const siteMenuBtn = document.getElementById('site-menu-btn');
const siteMenuPopover = document.getElementById('site-menu-popover');
const siteMenuHost = document.getElementById('site-menu-host');
const siteMenuCookieCount = document.getElementById('site-menu-cookie-count');
const siteMenuEatCookiesToggle = document.getElementById('site-menu-eat-cookies-toggle');
const siteMenuClearCookiesBtn = document.getElementById('site-menu-clear-cookies-btn');
const siteMenuGetOutToggle = document.getElementById('site-menu-get-out-toggle');
const siteMenuGetOutCount = document.getElementById('site-menu-get-out-count');

function refreshSiteMenuReadingTime() {
  const webview = document.getElementById(`webview-${activeTabId}`);
  const el = document.getElementById('site-menu-reading-time');
  el.textContent = '';
  if (!webview) return;

  webview.executeJavaScript('(document.body && document.body.innerText || "").trim().split(/\\s+/).length', true)
    .then((wordCount) => {
      if (!wordCount || wordCount < 50) return;
      const minutes = Math.max(1, Math.round(wordCount / 200));
      el.textContent = `About ${minutes} minute${minutes === 1 ? '' : 's'} to read (${wordCount.toLocaleString()} words)`;
    })
    .catch(() => {});
}

async function refreshSiteMenuCookieCount(hostname) {
  const count = await window.electron.cookieExceptions.countForSite(hostname);
  siteMenuCookieCount.textContent = count === 0
    ? 'No cookies stored for this site right now'
    : `${count} cookie${count === 1 ? '' : 's'} stored for this site`;
}

siteMenuBtn.addEventListener('click', async () => {
  if (!siteMenuPopover.classList.contains('hidden')) {
    siteMenuPopover.classList.add('hidden');
    return;
  }

  const hostname = getActiveHostname();
  if (!hostname) return;

  siteMenuHost.textContent = hostname;
  const excepted = await window.electron.cookieExceptions.isExcepted(hostname);
  siteMenuEatCookiesToggle.checked = !excepted;

  const getOutExcepted = await window.electron.getOut.isExcepted(hostname);
  siteMenuGetOutToggle.checked = !getOutExcepted;
  siteMenuGetOutCount.textContent = getOutExcepted ? 'Turned off for this site' : 'Blocking ads and trackers on this site';

  refreshSiteMenuCookieCount(hostname);
  refreshSiteMenuReadingTime();
  siteMenuPopover.classList.remove('hidden');
});

siteMenuEatCookiesToggle.addEventListener('change', () => {
  const hostname = getActiveHostname();
  if (!hostname) return;
  window.electron.cookieExceptions.setExcepted(hostname, !siteMenuEatCookiesToggle.checked);
});

siteMenuGetOutToggle.addEventListener('change', () => {
  const hostname = getActiveHostname();
  if (!hostname) return;
  window.electron.getOut.setExcepted(hostname, !siteMenuGetOutToggle.checked);
  siteMenuGetOutCount.textContent = siteMenuGetOutToggle.checked
    ? 'Blocking ads and trackers on this site'
    : 'Turned off for this site';
});

siteMenuClearCookiesBtn.addEventListener('click', async () => {
  const hostname = getActiveHostname();
  if (!hostname) return;

  siteMenuClearCookiesBtn.disabled = true;
  siteMenuClearCookiesBtn.textContent = 'Clearing…';
  await window.electron.cookieExceptions.clearForSite(hostname);
  siteMenuClearCookiesBtn.textContent = 'Cleared!';
  refreshSiteMenuCookieCount(hostname);

  setTimeout(() => {
    siteMenuClearCookiesBtn.textContent = 'Clear cookies for this site now';
    siteMenuClearCookiesBtn.disabled = false;
  }, 1500);
});

document.addEventListener('click', (e) => {
  if (siteMenuPopover.classList.contains('hidden')) return;
  if (siteMenuPopover.contains(e.target) || siteMenuBtn.contains(e.target)) return;
  siteMenuPopover.classList.add('hidden');
});

const networkMonitorBtn = document.getElementById('network-monitor-btn');
const networkMonitorPopover = document.getElementById('network-monitor-popover');
const netConnection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;

const NET_HISTORY_MAX = 60;
let netHistory = []; // real Mbps samples of actual bytes moving over the wire, oldest first
let netPopoverOpen = false;

function formatMbps(value) {
  return typeof value === 'number' && !Number.isNaN(value) ? value.toFixed(1) : '—';
}

function drawSparkline() {
  const svg = document.getElementById('net-sparkline');
  const points = netHistory.filter((v) => v !== null);
  if (points.length < 2) {
    svg.innerHTML = '';
    return;
  }

  const w = 240;
  const h = 48;
  const max = Math.max(...points, 1);
  const step = w / (netHistory.length - 1);

  let d = '';
  let filled = '';
  netHistory.forEach((v, i) => {
    if (v === null) return;
    const x = i * step;
    const y = h - (v / max) * (h - 6) - 3;
    d += (d ? ' L ' : 'M ') + x + ' ' + y;
  });
  filled = d + ` L ${(netHistory.length - 1) * step} ${h} L 0 ${h} Z`;

  svg.innerHTML = `<path class="net-sparkline-fill" d="${filled}"></path><path d="${d}"></path>`;
}

function refreshNetworkStatus() {
  const online = navigator.onLine;
  document.getElementById('net-status').textContent = online ? 'Online' : 'Offline';
  document.getElementById('net-status-dot').className = 'net-status-dot ' + (online ? 'online' : 'offline');

  const latest = netHistory.length ? netHistory[netHistory.length - 1] : (netConnection ? netConnection.downlink : null);
  document.getElementById('net-headline-value').textContent = formatMbps(latest);

  if (!netConnection) {
    document.getElementById('net-type').textContent = '';
    document.getElementById('net-rtt').textContent = '';
    document.getElementById('net-savedata').textContent = '';
    drawSparkline();
    return;
  }

  document.getElementById('net-type').textContent = netConnection.effectiveType ? netConnection.effectiveType.toUpperCase() : '';
  document.getElementById('net-rtt').textContent = typeof netConnection.rtt === 'number' ? `${netConnection.rtt} ms RTT` : '';
  document.getElementById('net-savedata').textContent = netConnection.saveData ? 'Data saver on' : '';

  drawSparkline();
}

window.addEventListener('online', refreshNetworkStatus);
window.addEventListener('offline', refreshNetworkStatus);
if (netConnection) netConnection.addEventListener('change', refreshNetworkStatus);

// Passively observing real browsing traffic (via the main process) turned
// out to be unreliable in practice, in ways that didn't reproduce the same
// way everywhere. This instead runs small, repeated probes automatically —
// the exact same fetch()-and-measure technique as the manual burst test
// below (which is known to work), just smaller and on a timer, so the
// graph updates on its own without needing a click.
const NET_PROBE_BYTES = 300_000;
const NET_PROBE_INTERVAL_MS = 2500;
let netProbeTimer = null;
let netProbeAbort = null;

async function runNetProbe() {
  netProbeAbort = new AbortController();
  try {
    const started = performance.now();
    const response = await fetch(`https://speed.cloudflare.com/__down?bytes=${NET_PROBE_BYTES}`, { cache: 'no-store', signal: netProbeAbort.signal });
    await response.arrayBuffer();
    const seconds = (performance.now() - started) / 1000;
    const mbps = (NET_PROBE_BYTES * 8) / seconds / 1_000_000;
    netHistory.push(mbps);
    if (netHistory.length > NET_HISTORY_MAX) netHistory.shift();
    if (netPopoverOpen) refreshNetworkStatus();
  } catch (err) {
    // aborted (popover closed) or offline — just skip this tick
  }
}

function startNetProbing() {
  if (netProbeTimer) return;
  runNetProbe();
  netProbeTimer = setInterval(runNetProbe, NET_PROBE_INTERVAL_MS);
}

function stopNetProbing() {
  clearInterval(netProbeTimer);
  netProbeTimer = null;
  if (netProbeAbort) netProbeAbort.abort();
}

networkMonitorBtn.addEventListener('click', () => {
  if (!networkMonitorPopover.classList.contains('hidden')) {
    networkMonitorPopover.classList.add('hidden');
    netPopoverOpen = false;
    stopNetProbing();
    return;
  }
  document.getElementById('net-speedtest-result').textContent = '';
  netPopoverOpen = true;
  refreshNetworkStatus();
  networkMonitorPopover.classList.remove('hidden');
  startNetProbing();
});

document.getElementById('net-speedtest-btn').addEventListener('click', async () => {
  const btn = document.getElementById('net-speedtest-btn');
  const result = document.getElementById('net-speedtest-result');
  btn.disabled = true;
  btn.textContent = 'Testing…';
  result.textContent = '';

  try {
    const bytes = 5000000;
    const started = performance.now();
    const response = await fetch(`https://speed.cloudflare.com/__down?bytes=${bytes}`, { cache: 'no-store' });
    await response.arrayBuffer();
    const seconds = (performance.now() - started) / 1000;
    const mbps = (bytes * 8) / seconds / 1_000_000;
    netHistory.push(mbps);
    if (netHistory.length > NET_HISTORY_MAX) netHistory.shift();
    refreshNetworkStatus();
    result.textContent = `Measured ${mbps.toFixed(1)} Mbps just now (downloaded ${(bytes / 1_000_000).toFixed(0)} MB from Cloudflare's speed test service).`;
  } catch (err) {
    result.textContent = 'Could not run the test — check your connection.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run a burst test (max speed)';
  }
});

document.addEventListener('click', (e) => {
  if (networkMonitorPopover.classList.contains('hidden')) return;
  if (networkMonitorPopover.contains(e.target) || networkMonitorBtn.contains(e.target)) return;
  networkMonitorPopover.classList.add('hidden');
  netPopoverOpen = false;
  stopNetProbing();
});

const passwordSavePopover = document.getElementById('password-save-popover');

async function maybeOfferPasswordSave(tab, capture) {
  if (tab.isPrivate || !capture.origin || !capture.username || !capture.password) return;

  let hostname;
  try { hostname = new URL(capture.origin).hostname; } catch (err) { return; }

  const existing = await window.electron.passwords.findForOrigin(hostname);
  const match = existing.find(p => p.origin === capture.origin && p.username === capture.username);

  if (match) {
    const current = await window.electron.passwords.reveal(match.id);
    if (current === capture.password) return;
  }

  showPasswordSavePrompt(capture, !!match);
}

function showPasswordSavePrompt(capture, isUpdate) {
  document.getElementById('password-save-title').textContent = isUpdate ? 'Update saved password?' : 'Save password?';
  document.getElementById('password-save-host').textContent = capture.origin;
  document.getElementById('password-save-username').textContent = capture.username;
  passwordSavePopover.classList.remove('hidden');

  document.getElementById('password-save-confirm-btn').onclick = () => {
    window.electron.passwords.add(capture.origin, capture.username, capture.password);
    passwordSavePopover.classList.add('hidden');
  };
  document.getElementById('password-save-dismiss-btn').onclick = () => {
    passwordSavePopover.classList.add('hidden');
  };
}

document.addEventListener('click', (e) => {
  if (passwordSavePopover.classList.contains('hidden')) return;
  if (passwordSavePopover.contains(e.target)) return;
  passwordSavePopover.classList.add('hidden');
});

document.getElementById('minimize-btn').addEventListener('click', () => {
  window.electron.window.minimize();
});

document.getElementById('maximize-btn').addEventListener('click', () => {
  window.electron.window.maximize();
});

function showQuitConfirmModal() {
  return new Promise((resolve) => {
    const overlay = document.getElementById('quit-confirm-overlay');
    const okBtn = document.getElementById('quit-confirm-ok-btn');
    const cancelBtn = document.getElementById('quit-confirm-cancel-btn');
    overlay.classList.remove('hidden');

    const cleanup = (result) => {
      overlay.classList.add('hidden');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}

async function saveSessionAndClose() {
  if (state.confirmBeforeQuit) {
    const ok = await showQuitConfirmModal();
    if (!ok) return;
  }
  if (state.confirmCloseMultiTab && tabs.length > 1) {
    const ok = confirm(`Close Mi Browser with ${tabs.length} tabs open?`);
    if (!ok) return;
  }
  if (state.warnOnActiveDownloadsClose) {
    const downloads = await window.electron.downloads.getAll();
    if (downloads.some((d) => d.state === 'progressing')) {
      const ok = confirm('A download is still in progress. Close Mi Browser anyway?');
      if (!ok) return;
    }
  }
  const tabsData = tabs
    .filter(t => !t.isPrivate)
    .map(t => ({ id: t.id, url: t.url, title: t.title }));
  await window.electron.store.set('session-tabs', tabsData);
  window.electron.app.quitConfirmed();
}

document.getElementById('close-btn').addEventListener('click', () => {
  saveSessionAndClose();
});

window.electron.app.onRequestQuit(() => {
  saveSessionAndClose();
});

const pipBtn = document.getElementById('pip-btn');

function updatePipButton() {
  const tab = tabs.find(t => t.id === activeTabId);
  pipBtn.classList.toggle('hidden', !(tab && tab.hasPlayingVideo));
}

pipBtn.addEventListener('click', () => {
  const webview = document.getElementById(`webview-${activeTabId}`);
  if (webview) webview.executeJavaScript('window.__miEnterPip && window.__miEnterPip()', true).catch(() => {});
});

const READER_MODE_SCRIPT = `
(function() {
  var candidates = Array.from(document.querySelectorAll('article, main, [role="main"], section, div'));
  var best = null, bestScore = 0;
  candidates.forEach(function(el) {
    if (el.querySelectorAll('p').length < 2) return;
    var score = (el.innerText || '').length;
    if (score > bestScore) { bestScore = score; best = el; }
  });
  if (!best) best = document.body;
  var title = document.title;
  var contentHtml = best.innerHTML;
  document.body.innerHTML = '<div style="max-width:680px;margin:0 auto;padding:60px 24px 120px;font-family:Georgia,serif;font-size:19px;line-height:1.7;color:#1a1a1a;">' +
    '<h1 style="font-size:32px;margin-bottom:24px;">' + title + '</h1>' + contentHtml + '</div>';
  document.body.style.background = '#fdfdfb';
  var style = document.createElement('style');
  style.textContent = 'img,video{max-width:100%;height:auto;} script,style,nav,header,footer,aside,iframe{display:none !important;}';
  document.head.appendChild(style);
})();
`;

document.getElementById('reader-mode-btn').addEventListener('click', () => {
  const tab = tabs.find(t => t.id === activeTabId);
  const webview = document.getElementById(`webview-${activeTabId}`);
  if (!tab || !webview) return;

  if (tab.readerMode) {
    webview.reload();
    tab.readerMode = false;
    document.getElementById('reader-mode-btn').classList.remove('active');
    return;
  }

  webview.executeJavaScript(READER_MODE_SCRIPT, true).then(() => {
    tab.readerMode = true;
    document.getElementById('reader-mode-btn').classList.add('active');
  }).catch(() => {});
});

document.getElementById('force-dark-btn').addEventListener('click', () => {
  const tab = tabs.find(t => t.id === activeTabId);
  const webview = document.getElementById(`webview-${activeTabId}`);
  if (!tab || !webview) return;

  if (tab.forceDarkKey) {
    webview.removeInsertedCSS(tab.forceDarkKey).catch(() => {});
    tab.forceDarkKey = null;
    document.getElementById('force-dark-btn').classList.remove('active');
    return;
  }

  webview.insertCSS('html { filter: invert(1) hue-rotate(180deg) !important; } img, video, picture, canvas, svg, iframe { filter: invert(1) hue-rotate(180deg) !important; }')
    .then((key) => {
      tab.forceDarkKey = key;
      document.getElementById('force-dark-btn').classList.add('active');
    }).catch(() => {});
});

document.getElementById('split-view-btn').addEventListener('click', async () => {
  if (isSplitActive()) {
    const remainingId = activeTabId;
    splitLeftTabId = null;
    splitRightTabId = null;
    switchTab(remainingId);
    return;
  }

  const otherTabs = tabs.filter(t => t.id !== activeTabId);
  if (otherTabs.length === 0) return;

  const selected = await window.electron.contextMenu.show(
    otherTabs.map(t => ({ id: String(t.id), label: t.title || t.url }))
  );
  if (selected !== null) enterSplitView(activeTabId, parseInt(selected, 10));
});

document.getElementById('pin-btn').addEventListener('click', () => {
  const tab = tabs.find(t => t.id === activeTabId);
  if (tab) window.electron.bookmarks.add({ url: tab.url, title: tab.title, favicon: tab.favicon || null });
});

const bookmarksBar = document.getElementById('bookmarks-bar');

async function renderBookmarksBar() {
  const bookmarks = await window.electron.bookmarks.getAll();
  bookmarksBar.innerHTML = '';
  bookmarksBar.classList.toggle('hidden', bookmarks.length === 0 && !state.alwaysShowBookmarksBar);

  bookmarks.forEach((b, index) => {
    let hostname = '';
    try { hostname = new URL(b.url).hostname; } catch (err) { /* leave blank, no favicon possible */ }

    const chip = document.createElement('div');
    chip.className = 'bookmark-chip';
    chip.innerHTML = `
      ${faviconMarkup(b.favicon, hostname, 'bookmark-chip-favicon')}
      <span class="bookmark-chip-title">${escapeHtmlAddr(b.title)}</span>
    `;
    chip.title = b.url;

    chip.addEventListener('click', () => {
      if (activeTabId !== null) navigateTab(activeTabId, b.url);
    });

    chip.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const selected = await window.electron.contextMenu.show([
        { id: 'open', label: 'Open' },
        { id: 'open-new-tab', label: 'Open in New Tab' },
        { type: 'separator' },
        { id: 'remove', label: 'Remove from Bookmarks Bar' }
      ]);
      if (selected === 'open') {
        if (activeTabId !== null) navigateTab(activeTabId, b.url);
      } else if (selected === 'open-new-tab') {
        createTab(b.url);
      } else if (selected === 'remove') {
        await window.electron.bookmarks.delete(index);
        renderBookmarksBar();
      }
    });

    bookmarksBar.appendChild(chip);
  });
}

window.electron.bookmarks.onChange(renderBookmarksBar);
renderBookmarksBar();

document.getElementById('history-btn').addEventListener('click', () => {
  createTab('mi://history');
});

document.getElementById('downloads-btn').addEventListener('click', () => {
  createTab('mi://downloads');
});

async function refreshDownloadsIndicator() {
  const downloads = await window.electron.downloads.getAll();
  const active = downloads.some((d) => d.state === 'progressing');
  document.getElementById('downloads-indicator').classList.toggle('hidden', !active);
}

window.electron.downloads.onChange(refreshDownloadsIndicator);
refreshDownloadsIndicator();

function updateUpdateIndicator(result) {
  document.getElementById('update-indicator').classList.toggle('hidden', !(result && result.updateAvailable));
}

window.electron.updates.getCached().then(updateUpdateIndicator);
window.electron.updates.onStatusChanged(updateUpdateIndicator);

window.electron.updates.onInstallProgress((progress) => {
  if (progress.state === 'installing') {
    document.getElementById('update-installing-overlay').classList.remove('hidden');
  }
});

document.getElementById('tabs-container').addEventListener('contextmenu', async (e) => {
  if (e.target.closest('.tab')) return;
  e.preventDefault();

  const selected = await window.electron.contextMenu.show([
    { id: 'new-tab', label: 'New Tab' },
    { id: 'new-private-tab', label: 'New Private Tab' },
    { id: 'settings', label: 'Settings' }
  ]);

  if (selected === 'new-tab') createTab(getNewTabUrl());
  else if (selected === 'new-private-tab') createTab('mi://private', { isPrivate: true });
  else if (selected === 'settings') createTab('mi://settings');
});

document.getElementById('drag-bar').addEventListener('contextmenu', async (e) => {
  e.preventDefault();

  const selected = await window.electron.contextMenu.show([
    { id: 'minimize', label: 'Minimise' },
    { id: 'maximize', label: 'Maximise / Restore' },
    { type: 'separator' },
    { id: 'close', label: 'Close Window' }
  ]);

  if (selected === 'minimize') window.electron.window.minimize();
  else if (selected === 'maximize') window.electron.window.maximize();
  else if (selected === 'close') saveSessionAndClose();
});

function switchToRelativeTab(direction) {
  if (tabs.length === 0) return;
  const currentIndex = tabs.findIndex(t => t.id === activeTabId);
  const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
  switchTab(tabs[nextIndex].id);
}

const tabSearchOverlay = document.getElementById('tab-search-overlay');
const tabSearchInput = document.getElementById('tab-search-input');
const tabSearchResults = document.getElementById('tab-search-results');
let tabSearchSelectedIndex = 0;
let tabSearchMatches = [];

function renderTabSearchResults(query) {
  const q = query.trim().toLowerCase();
  tabSearchMatches = tabs.filter((t) => !q || t.title.toLowerCase().includes(q) || t.url.toLowerCase().includes(q));
  tabSearchSelectedIndex = 0;

  tabSearchResults.innerHTML = '';
  tabSearchMatches.forEach((t, i) => {
    const row = document.createElement('div');
    row.className = 'tab-search-result' + (i === 0 ? ' selected' : '');
    row.innerHTML = `<span class="tab-search-result-title"></span><span class="tab-search-result-url"></span>`;
    row.querySelector('.tab-search-result-title').textContent = t.title || t.url;
    row.querySelector('.tab-search-result-url').textContent = t.url;
    row.addEventListener('click', () => { switchTab(t.id); closeTabSearch(); });
    tabSearchResults.appendChild(row);
  });
}

function updateTabSearchSelection() {
  Array.from(tabSearchResults.children).forEach((el, i) => {
    el.classList.toggle('selected', i === tabSearchSelectedIndex);
  });
  const selected = tabSearchResults.children[tabSearchSelectedIndex];
  if (selected) selected.scrollIntoView({ block: 'nearest' });
}

function openTabSearch() {
  tabSearchInput.value = '';
  renderTabSearchResults('');
  tabSearchOverlay.classList.remove('hidden');
  tabSearchInput.focus();
}

function closeTabSearch() {
  tabSearchOverlay.classList.add('hidden');
}

tabSearchInput.addEventListener('input', () => renderTabSearchResults(tabSearchInput.value));

tabSearchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeTabSearch();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    tabSearchSelectedIndex = Math.min(tabSearchSelectedIndex + 1, tabSearchMatches.length - 1);
    updateTabSearchSelection();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    tabSearchSelectedIndex = Math.max(tabSearchSelectedIndex - 1, 0);
    updateTabSearchSelection();
  } else if (e.key === 'Enter') {
    const match = tabSearchMatches[tabSearchSelectedIndex];
    if (match) { switchTab(match.id); closeTabSearch(); }
  }
});

tabSearchOverlay.addEventListener('click', (e) => {
  if (e.target === tabSearchOverlay) closeTabSearch();
});

const airTabOverlay = document.getElementById('air-tab-overlay');
const airTabGrid = document.getElementById('air-tab-grid');
let airTabTimer = null;
let airTabOpen = false;
let airTabSelectedIndex = 0;
let airTabList = [];

function startAirTabTimer() {
  if (airTabOpen || airTabTimer) return;
  airTabTimer = setTimeout(() => {
    airTabTimer = null;
    openAirTab();
  }, state.airTabHoldMs);
}

function cancelAirTabTimer() {
  if (airTabTimer) {
    clearTimeout(airTabTimer);
    airTabTimer = null;
  }
}

function openAirTab() {
  if (tabs.length < 2) return;
  airTabOpen = true;
  airTabList = tabs.filter((t) => !t.isPrivate);
  airTabSelectedIndex = Math.max(0, airTabList.findIndex((t) => t.id === activeTabId));

  airTabOverlay.classList.remove('air-tab-layout-grid', 'air-tab-layout-list');
  airTabOverlay.classList.add(`air-tab-layout-${state.airTabLayout}`);
  airTabGrid.classList.remove('air-tab-size-compact', 'air-tab-size-comfortable', 'air-tab-size-large');
  airTabGrid.classList.add(`air-tab-size-${state.airTabTileSize}`);

  airTabGrid.innerHTML = '';
  airTabList.forEach((t, i) => {
    const tile = document.createElement('div');
    tile.className = 'air-tab-tile' + (i === airTabSelectedIndex ? ' selected' : '');
    tile.innerHTML = '<div class="air-tab-tile-title"></div><div class="air-tab-tile-url"></div>';
    tile.querySelector('.air-tab-tile-title').textContent = t.title || t.url;
    tile.querySelector('.air-tab-tile-url').textContent = t.url;
    tile.addEventListener('mouseenter', () => {
      airTabSelectedIndex = i;
      updateAirTabSelection();
    });
    tile.addEventListener('click', () => {
      airTabSelectedIndex = i;
      closeAirTab(true);
    });
    airTabGrid.appendChild(tile);
  });

  airTabOverlay.classList.remove('hidden');
}

function updateAirTabSelection() {
  Array.from(airTabGrid.children).forEach((el, i) => {
    el.classList.toggle('selected', i === airTabSelectedIndex);
  });
}

function closeAirTab(select) {
  if (!airTabOpen) return;
  airTabOpen = false;
  airTabOverlay.classList.add('hidden');
  if (select && airTabList[airTabSelectedIndex]) {
    switchTab(airTabList[airTabSelectedIndex].id);
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === state.airTabKey && !e.repeat) startAirTabTimer();
  else if (e.key !== state.airTabKey) cancelAirTabTimer();
});

document.addEventListener('keyup', (e) => {
  if (e.key === state.airTabKey) {
    cancelAirTabTimer();
    if (airTabOpen) closeAirTab(true);
  }
});

window.addEventListener('blur', () => {
  cancelAirTabTimer();
  if (airTabOpen) closeAirTab(false);
});

function performShortcut({ key, mod, shift, alt }) {
  const k = key.toLowerCase();

  if (mod && k === 't' && !shift) {
    createTab(getNewTabUrl());
  } else if (mod && k === 't' && shift) {
    if (closedTabsStack.length > 0) createTab(closedTabsStack.pop().url);
  } else if (mod && k === 'n' && shift) {
    createTab('mi://private', { isPrivate: true });
  } else if (mod && k === 'a' && shift) {
    openTabSearch();
  } else if (mod && k === 'w') {
    if (activeTabId !== null) closeTab(activeTabId);
  } else if (mod && k === 'l') {
    const bar = document.getElementById('address-bar');
    bar.focus();
    bar.select();
  } else if (mod && k === 'r') {
    const wv = document.getElementById(`webview-${activeTabId}`);
    if (wv) wv.reload();
  } else if (mod && k >= '1' && k <= '9') {
    const index = k === '9' ? tabs.length - 1 : parseInt(k, 10) - 1;
    if (tabs[index]) switchTab(tabs[index].id);
  } else if (mod && k === 'tab' && !shift) {
    switchToRelativeTab(1);
  } else if (mod && k === 'tab' && shift) {
    switchToRelativeTab(-1);
  } else if (mod && k === ',') {
    createTab('mi://settings');
  } else if (mod && k === 'h') {
    createTab('mi://history');
  } else if (mod && k === 'j') {
    createTab('mi://downloads');
  } else if (alt && k === 'arrowleft') {
    const wv = document.getElementById(`webview-${activeTabId}`);
    if (wv) wv.goBack();
  } else if (alt && k === 'arrowright') {
    const wv = document.getElementById(`webview-${activeTabId}`);
    if (wv) wv.goForward();
  } else {
    return false;
  }

  return true;
}

document.addEventListener('keydown', (e) => {
  const handled = performShortcut({
    key: e.key,
    mod: e.metaKey || e.ctrlKey,
    shift: e.shiftKey,
    alt: e.altKey
  });
  if (handled) e.preventDefault();
});

window.electron.app.onOpenPrivateTab(() => {
  createTab('mi://private', { isPrivate: true });
});

window.electron.app.onOpenExternalUrl((url) => {
  createTab(url);
});

window.electron.app.onGuestNewWindow((webContentsId, url) => {
  const sourceTab = tabs.find(t => t.webContentsId === webContentsId);
  createTab(url, { isPrivate: sourceTab && sourceTab.isPrivate, background: state.openTabsInBackground });
});

const findBar = document.getElementById('find-bar');
const findInput = document.getElementById('find-input');
const findMatches = document.getElementById('find-matches');
let findActive = false;

function activeWebview() {
  return document.getElementById(`webview-${activeTabId}`);
}

function openFindBar() {
  const wv = activeWebview();
  if (!wv) return;
  findBar.classList.remove('hidden');
  findInput.focus();
  findInput.select();
  findActive = true;
}

function closeFindBar() {
  const wv = activeWebview();
  if (wv && wv.dataset.miReady === 'true') wv.stopFindInPage('clearSelection');
  findBar.classList.add('hidden');
  findMatches.textContent = '';
  findActive = false;
}

function runFind(forward, findNext) {
  const wv = activeWebview();
  const text = findInput.value;
  if (!wv || !text) {
    if (wv) wv.stopFindInPage('clearSelection');
    findMatches.textContent = '';
    return;
  }
  wv.findInPage(text, { forward, findNext });
}

findInput.addEventListener('input', () => runFind(true, false));
findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') runFind(!e.shiftKey, true);
  else if (e.key === 'Escape') closeFindBar();
});
document.getElementById('find-prev-btn').addEventListener('click', () => runFind(false, true));
document.getElementById('find-next-btn').addEventListener('click', () => runFind(true, true));
document.getElementById('find-close-btn').addEventListener('click', closeFindBar);

function adjustZoom(delta) {
  const wv = activeWebview();
  if (!wv) return;
  const current = wv.getZoomFactor ? wv.getZoomFactor() : 1;
  wv.setZoomFactor(Math.min(3, Math.max(0.25, current + delta)));
}

function resetZoom() {
  const wv = activeWebview();
  if (wv) wv.setZoomFactor(1);
}

window.electron.app.onMenuEvent((channel) => {
  const wv = activeWebview();
  switch (channel) {
    case 'menu-new-tab': createTab(getNewTabUrl()); break;
    case 'menu-new-private-tab': createTab('mi://private', { isPrivate: true }); break;
    case 'menu-reopen-tab': if (closedTabsStack.length > 0) createTab(closedTabsStack.pop().url); break;
    case 'menu-close-tab': if (activeTabId !== null) closeTab(activeTabId); break;
    case 'menu-reload': if (wv) wv.reload(); break;
    case 'menu-back': if (wv) wv.goBack(); break;
    case 'menu-forward': if (wv) wv.goForward(); break;
    case 'menu-history': createTab('mi://history'); break;
    case 'menu-downloads': createTab('mi://downloads'); break;
    case 'menu-settings': createTab('mi://settings'); break;
    case 'menu-shortcuts': createTab('mi://settings#shortcuts'); break;
    case 'menu-why': createTab('mi://newtab'); break;
    case 'menu-about': createTab('mi://settings#about'); break;
    case 'menu-find-in-page': openFindBar(); break;
    case 'menu-zoom-in': adjustZoom(0.1); break;
    case 'menu-zoom-out': adjustZoom(-0.1); break;
    case 'menu-zoom-reset': resetZoom(); break;
    case 'menu-toggle-devtools': if (wv) { wv.isDevToolsOpened() ? wv.closeDevTools() : wv.openDevTools(); } break;
  }
});

document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'f' && !e.shiftKey) {
    e.preventDefault();
    openFindBar();
  }
});

let toolbarHideTimer = null;

function revealToolbar() {
  if (!state.autoHideToolbar) return;
  document.body.classList.add('toolbar-revealed');
  if (toolbarHideTimer) clearTimeout(toolbarHideTimer);
}

function scheduleToolbarHide() {
  if (!state.autoHideToolbar) return;
  if (toolbarHideTimer) clearTimeout(toolbarHideTimer);
  toolbarHideTimer = setTimeout(() => {
    if (document.activeElement === addressBar) return;
    document.body.classList.remove('toolbar-revealed');
  }, 500);
}

const browserChromeEl = document.getElementById('browser-chrome');

document.getElementById('toolbar-reveal-strip').addEventListener('mousemove', revealToolbar);
document.getElementById('toolbar-reveal-strip').addEventListener('mouseleave', scheduleToolbarHide);

browserChromeEl.addEventListener('mouseenter', revealToolbar);
browserChromeEl.addEventListener('mouseleave', scheduleToolbarHide);

addressBar.addEventListener('focus', revealToolbar);
addressBar.addEventListener('blur', scheduleToolbarHide);

loadState();