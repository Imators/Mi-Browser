let currentView = 'history';
let entries = [];

async function loadTheme() {
  const theme = await window.electron.store.get('theme');
  document.body.className = `m-0 p-0 min-h-screen theme-${theme || 'light'}`;
  applyPartnerThemeVars((await window.electron.store.get('customization')) || {});
}

window.electron.store.onChange((key, value) => {
  if (key === 'theme') {
    document.body.className = `m-0 p-0 min-h-screen theme-${value}`;
    window.electron.store.get('customization').then((c) => applyPartnerThemeVars(c || {}));
  }
  if (key === 'customization') applyPartnerThemeVars(value || {});
});

async function loadEntries() {
  entries = currentView === 'history'
    ? await window.electron.history.getAll()
    : await window.electron.bookmarks.getAll();
  render();
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function render() {
  const query = document.getElementById('search-input').value.trim().toLowerCase();
  const filtered = query
    ? entries.filter((e) => e.title.toLowerCase().includes(query) || e.url.toLowerCase().includes(query))
    : entries;

  const list = document.getElementById('entries-list');
  const emptyState = document.getElementById('empty-state');
  list.innerHTML = '';

  emptyState.classList.toggle('hidden', filtered.length > 0);

  filtered.forEach((entry) => {
    const realIndex = entries.indexOf(entry);
    const row = document.createElement('div');
    row.className = 'history-entry flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer';
    row.innerHTML = `
      <div class="flex-1 min-w-0">
        <p class="font-semibold truncate">${escapeHtml(entry.title)}</p>
        <p class="text-xs opacity-60 truncate">${escapeHtml(entry.url)}</p>
      </div>
      ${entry.timestamp ? `<span class="text-xs opacity-50 shrink-0">${formatDate(entry.timestamp)}</span>` : ''}
      <button class="delete-entry-btn shrink-0 px-2 py-1 rounded text-sm opacity-60 hover:opacity-100" data-index="${realIndex}">&times;</button>
    `;

    row.addEventListener('click', (e) => {
      if (e.target.closest('.delete-entry-btn')) return;
      window.location.href = entry.url;
    });

    row.querySelector('.delete-entry-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (currentView === 'history') await window.electron.history.delete(realIndex);
      else await window.electron.bookmarks.delete(realIndex);
      loadEntries();
    });

    list.appendChild(row);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function setView(view) {
  currentView = view;
  document.getElementById('tab-history-btn').classList.toggle('active', view === 'history');
  document.getElementById('tab-bookmarks-btn').classList.toggle('active', view === 'bookmarks');
  document.getElementById('clear-btn').textContent = view === 'history' ? 'Clear all' : 'Clear bookmarks';
  loadEntries();
}

document.getElementById('tab-history-btn').addEventListener('click', () => setView('history'));
document.getElementById('tab-bookmarks-btn').addEventListener('click', () => setView('bookmarks'));

document.getElementById('search-input').addEventListener('input', render);

document.getElementById('clear-btn').addEventListener('click', async () => {
  const label = currentView === 'history' ? 'your entire browsing history' : 'all saved bookmarks';
  if (!confirm(`Clear ${label}? This can't be undone.`)) return;

  if (currentView === 'history') await window.electron.history.clear();
  else await window.electron.bookmarks.clear();
  loadEntries();
});

loadTheme();
setView('history');
