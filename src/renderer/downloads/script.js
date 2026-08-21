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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let value = bytes;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function stateLabel(d) {
  if (d.state === 'progressing') return d.paused ? 'Paused' : 'Downloading…';
  if (d.state === 'completed') return 'Done';
  if (d.state === 'cancelled') return 'Cancelled';
  if (d.state === 'interrupted') return 'Failed';
  return d.state;
}

async function loadDownloads() {
  const downloads = await window.electron.downloads.getAll();
  const list = document.getElementById('downloads-list');
  const empty = document.getElementById('empty-state');
  list.innerHTML = '';

  empty.classList.toggle('hidden', downloads.length > 0);

  downloads.forEach((d) => {
    const percent = d.totalBytes > 0 ? Math.min(100, Math.round((d.receivedBytes / d.totalBytes) * 100)) : 0;
    const inProgress = d.state === 'progressing';

    const row = document.createElement('div');
    row.className = 'history-entry p-4 rounded-lg border-2';
    row.innerHTML = `
      <div class="flex items-center gap-4">
        <div class="flex-1 min-w-0">
          <p class="font-semibold truncate">${escapeHtml(d.filename)}</p>
          <p class="text-xs opacity-60">${stateLabel(d)} &middot; ${formatBytes(d.receivedBytes)}${d.totalBytes ? ' / ' + formatBytes(d.totalBytes) : ''}</p>
        </div>
        <div class="flex gap-2 shrink-0">
          ${d.state === 'completed' ? `
            <button class="open-btn px-3 py-1.5 rounded text-sm font-semibold border-2 hover:opacity-80">Open</button>
            <button class="show-btn px-3 py-1.5 rounded text-sm font-semibold border-2 hover:opacity-80">Show in folder</button>
          ` : ''}
          ${inProgress && !d.paused ? '<button class="pause-btn px-3 py-1.5 rounded text-sm font-semibold border-2 hover:opacity-80">Pause</button>' : ''}
          ${inProgress && d.paused ? '<button class="resume-btn px-3 py-1.5 rounded text-sm font-semibold border-2 hover:opacity-80">Resume</button>' : ''}
          ${inProgress ? '<button class="cancel-btn px-3 py-1.5 rounded text-sm font-semibold border-2 danger-btn">Cancel</button>' : ''}
          ${!inProgress ? '<button class="remove-btn px-3 py-1.5 rounded text-sm font-semibold border-2 danger-btn">Remove</button>' : ''}
        </div>
      </div>
      ${inProgress ? `<div class="mt-3 h-1.5 rounded-full bg-black bg-opacity-10 overflow-hidden"><div class="h-full bg-blue-500" style="width:${percent}%"></div></div>` : ''}
    `;

    const openBtn = row.querySelector('.open-btn');
    if (openBtn) openBtn.addEventListener('click', () => window.electron.downloads.open(d.id));

    const showBtn = row.querySelector('.show-btn');
    if (showBtn) showBtn.addEventListener('click', () => window.electron.downloads.showInFolder(d.id));

    const pauseBtn = row.querySelector('.pause-btn');
    if (pauseBtn) pauseBtn.addEventListener('click', () => window.electron.downloads.pause(d.id));

    const resumeBtn = row.querySelector('.resume-btn');
    if (resumeBtn) resumeBtn.addEventListener('click', () => window.electron.downloads.resume(d.id));

    const cancelBtn = row.querySelector('.cancel-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => window.electron.downloads.cancel(d.id));

    const removeBtn = row.querySelector('.remove-btn');
    if (removeBtn) removeBtn.addEventListener('click', async () => {
      await window.electron.downloads.delete(d.id);
      loadDownloads();
    });

    list.appendChild(row);
  });
}

document.getElementById('clear-btn').addEventListener('click', async () => {
  if (!confirm('Clear the downloads list? This only clears the list, downloaded files stay on your computer.')) return;
  await window.electron.downloads.clear();
  loadDownloads();
});

window.electron.downloads.onChange(loadDownloads);

loadTheme();
loadDownloads();
