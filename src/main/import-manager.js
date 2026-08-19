const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const Database = require('better-sqlite3');

const homeDir = os.homedir();
const platform = process.platform;

const SAFE_STORAGE_ACCOUNTS = {
  chrome: { service: 'Chrome Safe Storage', account: 'Chrome' },
  brave: { service: 'Brave Safe Storage', account: 'Brave' },
  edge: { service: 'Microsoft Edge Safe Storage', account: 'Microsoft Edge' },
  vivaldi: { service: 'Vivaldi Safe Storage', account: 'Vivaldi' },
  chromium: { service: 'Chromium Safe Storage', account: 'Chromium' },
  arc: { service: 'Arc Safe Storage', account: 'Arc' }
};

function getMacSafeStorageKey(browserName) {
  const cfg = SAFE_STORAGE_ACCOUNTS[browserName];
  if (!cfg) return null;

  try {
    const password = execFileSync(
      'security',
      ['find-generic-password', '-w', '-s', cfg.service, '-a', cfg.account],
      { encoding: 'utf8' }
    ).trim();
    return crypto.pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1');
  } catch (err) {
    return null;
  }
}

function decryptChromePassword(encryptedBlob, key) {
  if (!key || !encryptedBlob || encryptedBlob.length <= 3) return null;

  try {
    const prefix = encryptedBlob.slice(0, 3).toString('latin1');
    if (prefix !== 'v10' && prefix !== 'v11') return null;

    const iv = Buffer.alloc(16, ' ');
    const ciphertext = encryptedBlob.slice(3);
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    return null;
  }
}

function getChromiumRoots() {
  if (platform === 'darwin') {
    return {
      chrome: path.join(homeDir, 'Library/Application Support/Google/Chrome'),
      brave: path.join(homeDir, 'Library/Application Support/BraveSoftware/Brave-Browser'),
      edge: path.join(homeDir, 'Library/Application Support/Microsoft Edge'),
      vivaldi: path.join(homeDir, 'Library/Application Support/Vivaldi'),
      opera: path.join(homeDir, 'Library/Application Support/com.operasoftware.Opera'),
      arc: path.join(homeDir, 'Library/Application Support/Arc/User Data'),
      chromium: path.join(homeDir, 'Library/Application Support/Chromium')
    };
  }

  if (platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(homeDir, 'AppData/Local');
    const roamingAppData = process.env.APPDATA || path.join(homeDir, 'AppData/Roaming');
    return {
      chrome: path.join(localAppData, 'Google/Chrome/User Data'),
      brave: path.join(localAppData, 'BraveSoftware/Brave-Browser/User Data'),
      edge: path.join(localAppData, 'Microsoft/Edge/User Data'),
      vivaldi: path.join(localAppData, 'Vivaldi/User Data'),
      opera: path.join(roamingAppData, 'Opera Software/Opera Stable'),
      chromium: path.join(localAppData, 'Chromium/User Data')
    };
  }

  return {
    chrome: path.join(homeDir, '.config/google-chrome'),
    brave: path.join(homeDir, '.config/BraveSoftware/Brave-Browser'),
    edge: path.join(homeDir, '.config/microsoft-edge'),
    vivaldi: path.join(homeDir, '.config/vivaldi'),
    opera: path.join(homeDir, '.config/opera'),
    chromium: path.join(homeDir, '.config/chromium')
  };
}

function getFirefoxProfilesPath() {
  if (platform === 'darwin') return path.join(homeDir, 'Library/Application Support/Firefox/Profiles');
  if (platform === 'win32') return path.join(process.env.APPDATA || path.join(homeDir, 'AppData/Roaming'), 'Mozilla/Firefox/Profiles');
  return path.join(homeDir, '.mozilla/firefox');
}

function findProfileDirs(root) {
  if (!fs.existsSync(root)) return [];

  const dirs = [];

  if (fs.existsSync(path.join(root, 'Bookmarks')) || fs.existsSync(path.join(root, 'History'))) {
    dirs.push(root);
  }

  try {
    fs.readdirSync(root, { withFileTypes: true }).forEach((entry) => {
      if (entry.isDirectory() && (entry.name === 'Default' || /^Profile \d+$/.test(entry.name))) {
        dirs.push(path.join(root, entry.name));
      }
    });
  } catch (err) {
  }

  return dirs;
}

function readSqliteSafely(dbPath, query) {
  if (!fs.existsSync(dbPath)) return [];

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mi-browser-import-'));
  const tmpDb = path.join(tmpDir, 'db.sqlite');

  try {
    fs.copyFileSync(dbPath, tmpDb);
    ['-wal', '-shm'].forEach((suffix) => {
      const src = dbPath + suffix;
      if (fs.existsSync(src)) fs.copyFileSync(src, tmpDb + suffix);
    });

    const db = new Database(tmpDb, { readonly: true, fileMustExist: true });
    const rows = db.prepare(query).all();
    db.close();
    return rows;
  } catch (err) {
    return [];
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function detectBrowsers() {
  const detected = {};

  const chromiumRoots = getChromiumRoots();
  for (const [name, root] of Object.entries(chromiumRoots)) {
    const profiles = findProfileDirs(root);
    if (profiles.length > 0) {
      detected[name] = await getChromiumData(profiles);
    }
  }

  const firefoxPath = getFirefoxProfilesPath();
  if (fs.existsSync(firefoxPath)) {
    detected.firefox = await getFirefoxData(firefoxPath);
  }

  if (platform === 'darwin') {
    const safariPath = path.join(homeDir, 'Library/Safari');
    if (fs.existsSync(safariPath)) {
      detected.safari = await getSafariData(safariPath);
    }
  }

  return detected;
}

async function getChromiumData(profileDirs) {
  let bookmarks = [];
  let history = [];
  let passwordCount = 0;

  for (const dir of profileDirs) {
    const bookmarksPath = path.join(dir, 'Bookmarks');
    if (fs.existsSync(bookmarksPath)) {
      try {
        const bookmarksData = JSON.parse(fs.readFileSync(bookmarksPath, 'utf8'));
        bookmarks = bookmarks.concat(extractBookmarks(bookmarksData.roots));
      } catch (err) {
      }
    }

    const rows = readSqliteSafely(path.join(dir, 'History'), 'SELECT url, title FROM urls');
    history = history.concat(rows.map((row) => ({ url: row.url, title: row.title })));

    const loginRows = readSqliteSafely(path.join(dir, 'Login Data'), 'SELECT COUNT(*) as count FROM logins');
    if (loginRows.length > 0) passwordCount += loginRows[0].count;
  }

  return {
    bookmarks: bookmarks.length,
    history: history.length,
    passwords: passwordCount,
    data: { bookmarks, history, passwords: [] }
  };
}

function getChromiumPasswords(profileDirs, browserName) {
  if (platform !== 'darwin') return [];

  const key = getMacSafeStorageKey(browserName);
  if (!key) return [];

  const passwords = [];

  for (const dir of profileDirs) {
    const rows = readSqliteSafely(
      path.join(dir, 'Login Data'),
      'SELECT origin_url, username_value, password_value FROM logins'
    );

    rows.forEach((row) => {
      if (!row.username_value) return;
      const decrypted = decryptChromePassword(row.password_value, key);
      if (decrypted) {
        passwords.push({ origin: row.origin_url, username: row.username_value, password: decrypted });
      }
    });
  }

  return passwords;
}

async function getFirefoxData(firefoxPath) {
  try {
    const profileDirs = fs.readdirSync(firefoxPath).filter((f) => f.endsWith('.default-release') || f.endsWith('.default'));
    if (profileDirs.length === 0) return { bookmarks: 0, history: 0, passwords: 0, data: {} };

    const profileDir = path.join(firefoxPath, profileDirs[0]);
    const placesPath = path.join(profileDir, 'places.sqlite');

    const bookmarksRows = readSqliteSafely(placesPath, `
      SELECT moz_bookmarks.title, moz_places.url
      FROM moz_bookmarks
      LEFT JOIN moz_places ON moz_bookmarks.fk = moz_places.id
      WHERE moz_bookmarks.type = 1 AND moz_places.url NOT NULL
    `);
    const bookmarks = bookmarksRows.map((row) => ({ title: row.title || 'Untitled', url: row.url }));

    const historyRows = readSqliteSafely(placesPath, 'SELECT url, title FROM moz_places LIMIT 10000');
    const history = historyRows.map((row) => ({ url: row.url, title: row.title || 'Untitled' }));

    return {
      bookmarks: bookmarks.length,
      history: history.length,
      passwords: 0,
      data: { bookmarks, history, passwords: [] }
    };
  } catch (err) {
    return { bookmarks: 0, history: 0, passwords: 0, data: {} };
  }
}

async function getSafariData(safariPath) {
  try {
    const bookmarksPath = path.join(safariPath, 'Bookmarks.plist');
    const historyPath = path.join(safariPath, 'History.plist');

    let bookmarks = [];
    let history = [];

    if (fs.existsSync(bookmarksPath)) {
      bookmarks = await parsePlist(bookmarksPath);
    }

    if (fs.existsSync(historyPath)) {
      history = await parsePlist(historyPath);
    }

    return {
      bookmarks: bookmarks.length,
      history: history.length,
      passwords: 0,
      data: { bookmarks, history, passwords: [] }
    };
  } catch (err) {
    return { bookmarks: 0, history: 0, passwords: 0, data: {} };
  }
}

async function parsePlist(filePath) {
  const plistParser = require('plist');
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const parsed = plistParser.parse(data);
    return parsed || [];
  } catch (err) {
    return [];
  }
}

function extractBookmarks(roots) {
  let bookmarks = [];

  function traverse(node) {
    if (node.children) {
      node.children.forEach(child => {
        if (child.type === 'url') {
          bookmarks.push({ title: child.name, url: child.url });
        }
        traverse(child);
      });
    }
  }

  Object.keys(roots).forEach(key => traverse(roots[key]));
  return bookmarks;
}

async function importData(browserName, selections) {
  const browserData = await detectBrowsers();
  if (!browserData[browserName]) return null;

  const data = browserData[browserName].data;
  const result = {
    bookmarks: selections.bookmarks ? data.bookmarks : [],
    history: selections.history ? data.history : [],
    passwords: [],
    passwordsSupported: platform === 'darwin' && !!SAFE_STORAGE_ACCOUNTS[browserName]
  };

  if (selections.passwords) {
    const roots = getChromiumRoots();
    const root = roots[browserName];
    if (root) {
      const profiles = findProfileDirs(root);
      result.passwords = getChromiumPasswords(profiles, browserName);
    }
  }

  return result;
}

module.exports = {
  detectBrowsers,
  importData
};
