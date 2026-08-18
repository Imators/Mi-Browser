const storage = require('./storage');

function getAll() {
  return storage.get('bookmarks') || [];
}

function clear() {
  storage.set('bookmarks', []);
}

function deleteEntry(index) {
  const bookmarks = storage.get('bookmarks') || [];
  bookmarks.splice(index, 1);
  storage.set('bookmarks', bookmarks);
}

function mergeImported(entries) {
  if (!entries || entries.length === 0) return 0;

  const bookmarks = storage.get('bookmarks') || [];
  const existingUrls = new Set(bookmarks.map((b) => b.url));

  const fresh = entries
    .filter((e) => e.url && !existingUrls.has(e.url))
    .map((e) => ({ url: e.url, title: e.title || e.url, timestamp: Date.now() }));

  storage.set('bookmarks', bookmarks.concat(fresh));
  return fresh.length;
}

// Pinning a single page, e.g. via the page's right-click menu.
function add(entry) {
  if (!entry || !entry.url) return false;

  const bookmarks = storage.get('bookmarks') || [];
  if (bookmarks.some((b) => b.url === entry.url)) return false;

  bookmarks.unshift({ url: entry.url, title: entry.title || entry.url, timestamp: Date.now() });
  storage.set('bookmarks', bookmarks);
  return true;
}

module.exports = { getAll, clear, deleteEntry, mergeImported, add };
