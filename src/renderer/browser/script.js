let tabs = [];
let activeTabId = null;
let tabIdCounter = 0;
let closedTabsStack = [];

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
  autoHideToolbar: false
};

function getHomepageUrl() {
  return state.homepage && state.homepage.trim() ? state.homepage.trim() : 'mi://newtab';
}

async function loadState() {
  state.theme = await window.electron.store.get('theme') || 'light';
  document.body.className = `m-0 p-0 overflow-hidden h-screen theme-${state.theme}`;

  state.searchEngine = (await window.electron.store.get('search-engine')) || 'google';
  const features = (await window.electron.store.get('features')) || {};
  state.googleSuggestEnabled = !!features.googleSuggest;
  state.autoHideToolbar = !!(await window.electron.store.get('autoHideToolbar'));

  const custom = (await window.electron.store.get('customization')) || {};
  state.homepage = custom.homepage || '';
  state.accentColor = custom.accentColor || '';
  state.uiZoom = custom.uiZoom || 1;
  state.confirmCloseMultiTab = !!custom.confirmCloseMultiTab;
  state.openTabsInBackground = !!custom.openTabsInBackground;
  state.autoMuteBackgroundTabs = !!custom.autoMuteBackgroundTabs;
  state.customSearchEngines = custom.customSearchEngines || [];
  state.smoothScrolling = !!custom.smoothScrolling;
  state.showClock = !!custom.showClock;
  state.compactTabs = !!custom.compactTabs;
  state.alwaysShowTabClose = !!custom.alwaysShowTabClose;
  applyCustomizations();

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
      const c = value || {};
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
      applyCustomizations();
    }
  });
}

function applyCustomizations() {
  document.documentElement.style.setProperty('--user-accent', state.accentColor || '');
  document.documentElement.style.fontSize = `${Math.round((state.uiZoom || 1) * 100)}%`;
  document.body.classList.toggle('compact-tabs', state.compactTabs);
  document.body.classList.toggle('always-show-tab-close', state.alwaysShowTabClose);
  document.body.classList.toggle('auto-hide-toolbar', state.autoHideToolbar);
  if (!state.autoHideToolbar) document.body.classList.remove('toolbar-revealed');
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

function switchTab(tabId) {
  activeTabId = tabId;

  document.querySelectorAll('#webview-container webview').forEach((el) => {
    const isActive = el.id === `webview-${tabId}`;
    el.style.visibility = isActive ? 'visible' : 'hidden';
    el.style.zIndex = isActive ? '1' : '0';
    el.style.pointerEvents = isActive ? 'auto' : 'none';
    if (el.dataset.miReady === 'true') {
      if (isActive) el.setAudioMuted(false);
      else if (state.autoMuteBackgroundTabs) el.setAudioMuted(true);
    }
  });

  const tab = tabs.find(t => t.id === tabId);
  if (tab) document.getElementById('address-bar').value = tab.url;

  applyChromeTheme(tab);
  applyCustomizations();
  updatePipButton();
  if (typeof closeFindBar === 'function') closeFindBar();

  const popover = document.getElementById('site-menu-popover');
  if (popover) popover.classList.add('hidden');
  hideAddressSuggestions();

  renderTabs();
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

function closeTab(tabId) {
  const index = tabs.findIndex(t => t.id === tabId);
  if (index !== -1) {
    const [closed] = tabs.splice(index, 1);
    if (closed.url && !closed.url.startsWith('mi://newtab') && !closed.isPrivate) {
      closedTabsStack.push({ url: closed.url, title: closed.title });
      if (closedTabsStack.length > 20) closedTabsStack.shift();
    }
  }
  destroyWebview(tabId);

  if (tabs.length === 0) {
    createTab('mi://newtab');
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
    tabEl.innerHTML = `
      ${tab.loading ? '<span class="tab-spinner"></span>' : ''}
      ${tab.isPrivate ? '<span class="tab-private-badge" title="Private tab"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="12" r="3.2"></circle><circle cx="17" cy="12" r="3.2"></circle><line x1="10.2" y1="12" x2="13.8" y2="12"></line><path d="M3.5 8 6 6h2l1.5 2"></path><path d="M20.5 8 18 6h-2l-1.5 2"></path></svg></span>' : ''}
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
        { id: 'close-right', label: 'Close Tabs to the Right', enabled: tabs.indexOf(tab) < tabs.length - 1 }
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
      }
    });

    container.appendChild(tabEl);
  });
}

const NETWORK_ERROR_CODES = new Set([-2, -6, -21, -101, -102, -105, -106, -109, -118, -137, -138]);
const IGNORABLE_ERROR_CODES = new Set([-3]);

function createWebview(tabId, url, isPrivate = false) {
  const container = document.getElementById('webview-container');

  const webview = document.createElement('webview');
  webview.id = `webview-${tabId}`;
  webview.setAttribute('allowpopups', 'true');
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

  webview.addEventListener('page-title-updated', (e) => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
      tab.title = e.title || 'Loading...';
      renderTabs();
      if (!tab.isPrivate) window.electron.history.add({ url: tab.url, title: tab.title });
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
  });

  webview.addEventListener('dom-ready', () => {
    if (state.smoothScrolling) webview.insertCSS('html { scroll-behavior: smooth !important; }').catch(() => {});
    setTimeout(() => {
      webview.dataset.miReady = 'true';
      if (tabId === activeTabId) webview.setAudioMuted(false);
      else if (state.autoMuteBackgroundTabs) webview.setAudioMuted(true);
    }, 0);
  });

  webview.addEventListener('did-navigate', (e) => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
      tab.url = e.url;
      if (tabId === activeTabId) document.getElementById('address-bar').value = e.url;
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
      if (tab) window.electron.bookmarks.add({ url: tab.url, title: tab.title });
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
  createTab('mi://newtab');
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
  const combined = [...matchesOf(bookmarks, 'bookmark'), ...matchesOf(history, 'history')]
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

document.getElementById('menu-btn').addEventListener('click', () => {
  createTab('mi://settings');
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
  refreshSiteMenuCookieCount(hostname);
  siteMenuPopover.classList.remove('hidden');
});

siteMenuEatCookiesToggle.addEventListener('change', () => {
  const hostname = getActiveHostname();
  if (!hostname) return;
  window.electron.cookieExceptions.setExcepted(hostname, !siteMenuEatCookiesToggle.checked);
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

document.getElementById('minimize-btn').addEventListener('click', () => {
  window.electron.window.minimize();
});

document.getElementById('maximize-btn').addEventListener('click', () => {
  window.electron.window.maximize();
});

async function saveSessionAndClose() {
  if (state.confirmCloseMultiTab && tabs.length > 1) {
    const ok = confirm(`Close Mi Browser with ${tabs.length} tabs open?`);
    if (!ok) return;
  }
  const tabsData = tabs
    .filter(t => !t.isPrivate)
    .map(t => ({ id: t.id, url: t.url, title: t.title }));
  await window.electron.store.set('session-tabs', tabsData);
  window.electron.window.close();
}

document.getElementById('close-btn').addEventListener('click', () => {
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

document.getElementById('pin-btn').addEventListener('click', () => {
  const tab = tabs.find(t => t.id === activeTabId);
  if (tab) window.electron.bookmarks.add({ url: tab.url, title: tab.title });
});

const bookmarksBar = document.getElementById('bookmarks-bar');

async function renderBookmarksBar() {
  const bookmarks = await window.electron.bookmarks.getAll();
  bookmarksBar.innerHTML = '';
  bookmarksBar.classList.toggle('hidden', bookmarks.length === 0);

  bookmarks.forEach((b, index) => {
    let hostname = '';
    try { hostname = new URL(b.url).hostname; } catch (err) { /* leave blank, no favicon possible */ }

    const chip = document.createElement('div');
    chip.className = 'bookmark-chip';
    chip.innerHTML = `
      ${hostname ? `<img src="https://${hostname}/favicon.ico" class="bookmark-chip-favicon" onerror="this.remove()" />` : ''}
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

document.getElementById('tabs-container').addEventListener('contextmenu', async (e) => {
  if (e.target.closest('.tab')) return;
  e.preventDefault();

  const selected = await window.electron.contextMenu.show([
    { id: 'new-tab', label: 'New Tab' },
    { id: 'new-private-tab', label: 'New Private Tab' },
    { id: 'settings', label: 'Settings' }
  ]);

  if (selected === 'new-tab') createTab('mi://newtab');
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

function performShortcut({ key, mod, shift, alt }) {
  const k = key.toLowerCase();

  if (mod && k === 't' && !shift) {
    createTab('mi://newtab');
  } else if (mod && k === 't' && shift) {
    if (closedTabsStack.length > 0) createTab(closedTabsStack.pop().url);
  } else if (mod && k === 'n' && shift) {
    createTab('mi://private', { isPrivate: true });
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
    case 'menu-new-tab': createTab('mi://newtab'); break;
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

document.getElementById('toolbar-reveal-strip').addEventListener('mousemove', revealToolbar);
document.getElementById('toolbar-reveal-strip').addEventListener('mouseleave', scheduleToolbarHide);

document.addEventListener('mousemove', (e) => {
  if (!state.autoHideToolbar) return;
  if (e.clientY > 36) scheduleToolbarHide();
});

addressBar.addEventListener('focus', revealToolbar);
addressBar.addEventListener('blur', scheduleToolbarHide);

loadState();