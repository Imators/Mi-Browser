const storage = require('./storage');

const MAX_HISTORY = 2000;

function add({ url, title }) {
  if (!url || !/^https?:\/\//i.test(url)) return;

  const history = storage.get('history') || [];

  if (history.length > 0 && history[0].url === url) {
    history[0].title = title || history[0].title;
    history[0].timestamp = Date.now();
  } else {
    history.unshift({ url, title: title || url, timestamp: Date.now() });
  }

  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  storage.set('history', history);
}

function getAll() {
  return storage.get('history') || [];
}

function clear() {
  storage.set('history', []);
}

function deleteEntry(index) {
  const history = storage.get('history') || [];
  history.splice(index, 1);
  storage.set('history', history);
}

function mergeImported(entries) {
  if (!entries || entries.length === 0) return 0;

  const history = storage.get('history') || [];
  const existingUrls = new Set(history.map((h) => h.url));

  const fresh = entries
    .filter((e) => e.url && /^https?:\/\//i.test(e.url) && !existingUrls.has(e.url))
    .map((e) => ({ url: e.url, title: e.title || e.url, timestamp: Date.now(), imported: true }));

  const combined = history.concat(fresh).slice(0, MAX_HISTORY);
  storage.set('history', combined);
  return fresh.length;
}

module.exports = { add, getAll, clear, deleteEntry, mergeImported };
