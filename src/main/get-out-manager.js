const fs = require('fs');
const path = require('path');
const storage = require('./storage');

const CURATED_CATEGORIES = {
  ads: [
    'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'adservice.google.com',
    'pagead2.googlesyndication.com', 'adnxs.com', 'adsrvr.org', 'adsafeprotected.com', 'taboola.com',
    'outbrain.com', 'criteo.com', 'criteo.net', 'rubiconproject.com', 'pubmatic.com', 'openx.net',
    'casalemedia.com', 'indexexchange.com', 'smartadserver.com', 'yieldmo.com', 'media.net', 'zedo.com',
    'sonobi.com', '33across.com', 'gumgum.com', 'sharethrough.com', 'teads.tv', 'advertising.com',
    'adform.net', 'mathtag.com', 'tapad.com', 'amazon-adsystem.com', 'moatads.com', 'serving-sys.com',
    '2mdn.net', 'adtech.de', 'spotxchange.com', 'springserve.com', 'undertone.com', 'contextweb.com',
    'rlcdn.com', 'bidswitch.net', 'improvedigital.com', 'triplelift.com', 'sovrn.com', 'sortable.com',
    'connatix.com', 'freewheel.tv', 'innovid.com', 'flashtalking.com', 'adroll.com', 'revcontent.com',
    'mgid.com', 'content.ad', 'nativeads.com', 'ads-twitter.com', 'bat.bing.com', 'px.ads.linkedin.com'
  ],
  trackers: [
    'google-analytics.com', 'googletagmanager.com', 'googletagservices.com', 'scorecardresearch.com',
    'quantserve.com', 'quantcount.com', 'chartbeat.com', 'chartbeat.net', 'nr-data.net', 'mixpanel.com',
    'segment.io', 'segment.com', 'amplitude.com', 'heap.io', 'heapanalytics.com', 'kissmetrics.com',
    'woopra.com', 'statcounter.com', 'histats.com', 'cnzz.com', 'umeng.com', 'parsely.com', 'at.atwola.com',
    'bluekai.com', 'demdex.net', 'everesttech.net', 'agkn.com', 'exelator.com', 'crwdcntrl.net',
    'eyeota.net', 'tealiumiq.com', 'omtrdc.net', '2o7.net', 'sc.omtrdc.net', 'analytics.twitter.com',
    'ct.pinimg.com', 'snap.licdn.com', 'js.hs-analytics.net', 'js.hsleadflows.net', 'track.hubspot.com',
    'adjust.com', 'kochava.com', 'singular.net'
  ],
  sessionRecording: [
    'hotjar.com', 'fullstory.com', 'logrocket.com', 'smartlook.com', 'mouseflow.com', 'inspectlet.com',
    'luckyorange.com', 'clarity.ms', 'decibelinsight.net', 'crazyegg.com', 'clicktale.net'
  ],
  socialTrackers: [
    'connect.facebook.net'
  ]
};

function loadBundledList(filename) {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'blocklists', filename), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
}

const CATEGORY_SETS = {
  ads: new Set([...CURATED_CATEGORIES.ads, ...loadBundledList('easylist-domains.json')]),
  trackers: new Set([...CURATED_CATEGORIES.trackers, ...loadBundledList('easyprivacy-domains.json')]),
  sessionRecording: new Set(CURATED_CATEGORIES.sessionRecording),
  socialTrackers: new Set(CURATED_CATEGORIES.socialTrackers)
};

const DEFAULT_CATEGORIES = { ads: true, trackers: true, sessionRecording: true, socialTrackers: true, fingerprinting: true };

function getEnabledCategories() {
  const security = storage.get('security') || {};
  return { ...DEFAULT_CATEGORIES, ...(security.getOutCategories || {}) };
}

function isGloballyEnabled() {
  const security = storage.get('security') || {};
  return security.getOutEnabled !== false;
}

function matchedCategoryForHostname(hostname, enabledCategories) {
  const labels = hostname.split('.');
  for (let i = 0; i < labels.length - 1; i++) {
    const candidate = labels.slice(i).join('.');
    for (const [category, set] of Object.entries(CATEGORY_SETS)) {
      if (enabledCategories[category] && set.has(candidate)) return category;
    }
  }
  return null;
}

function getExceptions() {
  return storage.get('getOutExceptions') || [];
}

function isExcepted(hostname) {
  if (!hostname) return false;
  return getExceptions().some((h) => hostname === h || hostname.endsWith(`.${h}`));
}

function setExcepted(hostname, excepted) {
  if (!hostname) return;
  const exceptions = getExceptions();
  const next = excepted
    ? exceptions.filter((h) => h !== hostname)
    : Array.from(new Set([...exceptions, hostname]));
  storage.set('getOutExceptions', next);
}

let statsCache = null;
let statsDirty = false;
let statsFlushTimer = null;

function loadStatsCache() {
  if (!statsCache) statsCache = storage.get('getOutStats') || { total: 0 };
  return statsCache;
}

function scheduleStatsFlush() {
  if (statsFlushTimer) return;
  statsFlushTimer = setTimeout(() => {
    statsFlushTimer = null;
    if (statsDirty) {
      storage.set('getOutStats', statsCache);
      statsDirty = false;
    }
  }, 3000);
}

function recordBlock() {
  const stats = loadStatsCache();
  stats.total = (stats.total || 0) + 1;
  statsDirty = true;
  scheduleStatsFlush();
}

function getStats() {
  return loadStatsCache();
}

function isBlocked(requestUrl, topHostname) {
  if (!isGloballyEnabled()) return false;
  if (isExcepted(topHostname)) return false;

  let hostname;
  try {
    hostname = new URL(requestUrl).hostname;
  } catch (err) {
    return false;
  }
  if (!hostname) return false;

  const enabledCategories = getEnabledCategories();
  const category = matchedCategoryForHostname(hostname, enabledCategories);
  if (category) recordBlock();
  return !!category;
}

function getBlocklistSize() {
  const all = new Set();
  Object.values(CATEGORY_SETS).forEach((set) => set.forEach((d) => all.add(d)));
  return all.size;
}

function getCategorySizes() {
  const sizes = {};
  for (const [category, set] of Object.entries(CATEGORY_SETS)) sizes[category] = set.size;
  return sizes;
}

module.exports = {
  isBlocked,
  isExcepted,
  setExcepted,
  getExceptions,
  isGloballyEnabled,
  getEnabledCategories,
  getStats,
  getBlocklistSize,
  getCategorySizes
};
