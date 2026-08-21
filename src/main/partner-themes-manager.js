const { net, app } = require('electron');
const fs = require('fs');
const path = require('path');
const config = require('./partner-themes-config');

const cacheDir = () => path.join(app.getPath('userData'), 'partner-themes');
const cacheFile = () => path.join(cacheDir(), 'cache.json');
const originUrl = () => new URL(config.BASE_URL).origin;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(cacheFile(), 'utf8'));
  } catch (err) {
    return { themes: [], details: {} };
  }
}

function writeCache(cache) {
  ensureDir(cacheDir());
  fs.writeFileSync(cacheFile(), JSON.stringify(cache, null, 2));
}

// Respects the Cache-Control: public, max-age=300 that themes.php/theme.php
// send, same as before — a normal HTTP cache for 5 minutes.
async function fetchJson(url) {
  const response = await net.fetch(url, { headers: { 'X-Mi-Key': config.MI_API_KEY } });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

async function downloadAsset(remoteUrl, destPath) {
  const response = await net.fetch(remoteUrl);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${remoteUrl}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  ensureDir(path.dirname(destPath));
  fs.writeFileSync(destPath, buffer);
  return destPath;
}

function assetExtension(url) {
  try {
    const ext = path.extname(new URL(url, originUrl()).pathname).toLowerCase();
    return ext || '.bin';
  } catch (err) {
    return '.bin';
  }
}

function resolve(url) {
  return new URL(url, originUrl()).href;
}

function localLogoPath(slug, logoUrl) {
  return path.join(cacheDir(), slug, `logo${assetExtension(logoUrl)}`);
}

function localWallpaperPath(slug, variationSlug, wallpaperUrl) {
  return path.join(cacheDir(), slug, `wallpaper-${variationSlug}${assetExtension(wallpaperUrl)}`);
}

// mi://partner-theme/<slug>/<filename> serves files out of cacheDir(), so
// callers get a URL, not a raw filesystem path.
function miUrlFor(absolutePath) {
  const rel = path.relative(cacheDir(), absolutePath).split(path.sep).join('/');
  return `mi://partner-theme/${rel}`;
}

async function list() {
  try {
    const data = await fetchJson(`${config.BASE_URL}/themes.php`);
    const themes = (data.themes || []).map((t) => ({ ...t, logo_url: resolve(t.logo_url) }));
    const cache = readCache();
    cache.themes = themes;
    writeCache(cache);

    for (const theme of themes) {
      const dest = localLogoPath(theme.slug, theme.logo_url);
      if (!fs.existsSync(dest)) downloadAsset(theme.logo_url, dest).catch(() => {});
    }

    return themes.map((theme) => ({ ...theme, logoMiUrl: miUrlFor(localLogoPath(theme.slug, theme.logo_url)) }));
  } catch (err) {
    console.error('Mi Browser: partner theme list refresh failed, falling back to local cache —', err.message);
    const cache = readCache();
    return (cache.themes || []).map((theme) => ({
      ...theme,
      logoMiUrl: miUrlFor(localLogoPath(theme.slug, theme.logo_url))
    }));
  }
}

async function detail(slug) {
  try {
    const data = await fetchJson(`${config.BASE_URL}/theme.php?slug=${encodeURIComponent(slug)}`);
    const theme = data.theme;
    const logoUrl = resolve(theme.logo_url);
    const logoDest = localLogoPath(slug, logoUrl);
    await downloadAsset(logoUrl, logoDest);

    const variations = [];
    for (const variation of theme.variations || []) {
      const wallpaperUrl = resolve(variation.wallpaper_url);
      const wallpaperDest = localWallpaperPath(slug, variation.slug, wallpaperUrl);
      await downloadAsset(wallpaperUrl, wallpaperDest);
      variations.push({ ...variation, wallpaperMiUrl: miUrlFor(wallpaperDest) });
    }

    const resolvedTheme = { ...theme, logoMiUrl: miUrlFor(logoDest), variations };

    const cache = readCache();
    cache.details = cache.details || {};
    cache.details[slug] = resolvedTheme;
    writeCache(cache);

    return resolvedTheme;
  } catch (err) {
    console.error(`Mi Browser: partner theme "${slug}" refresh failed, falling back to local cache —`, err.message);
    const cache = readCache();
    return (cache.details && cache.details[slug]) || null;
  }
}

// Re-fetches the currently applied theme from the DB and rebuilds the same
// shape saved into customization.partnerTheme, so callers can diff it
// against what's stored and pick up changes made in the DB after the fact.
async function refreshApplied(appliedPartnerTheme) {
  if (!appliedPartnerTheme || !appliedPartnerTheme.slug) return null;

  const fresh = await detail(appliedPartnerTheme.slug);
  if (!fresh) return null;

  const variation = (fresh.variations || []).find((v) => v.slug === appliedPartnerTheme.variationSlug) || (fresh.variations || [])[0];
  if (!variation) return null;

  return {
    slug: fresh.slug,
    variationSlug: variation.slug,
    name: fresh.name,
    wallpaperMiUrl: variation.wallpaperMiUrl,
    logoMiUrl: fresh.logoMiUrl,
    accentColor: fresh.accent_color || '#3b82f6',
    bgColor: variation.bg_color,
    textColor: variation.text_color,
    surfaceColor: variation.surface_color,
    borderColor: variation.border_color
  };
}

module.exports = { list, detail, refreshApplied };
