const { session } = require('electron');
const storage = require('./storage');

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // re-check hourly in case the app stays open
const EAT_INTERVAL_MS = 24 * 60 * 60 * 1000; // "every 24 hours", as advertised in setup

function getExceptions() {
  return storage.get('cookieExceptions') || [];
}

function isExcepted(hostname) {
  if (!hostname) return false;
  const exceptions = getExceptions();
  return exceptions.some((h) => matchesHostname(hostname, h));
}

function setExcepted(hostname, excepted) {
  if (!hostname) return;
  const exceptions = getExceptions();
  const next = excepted
    ? Array.from(new Set([...exceptions, hostname]))
    : exceptions.filter((h) => h !== hostname);
  storage.set('cookieExceptions', next);
}

function matchesHostname(cookieHostname, hostname) {
  return cookieHostname === hostname || cookieHostname.endsWith(`.${hostname}`);
}

// Lets the site menu show real proof the feature is doing something for the
// site you're actually looking at, rather than a silent "trust us" toggle.
async function countForSite(hostname) {
  if (!hostname) return 0;
  const cookies = await session.defaultSession.cookies.get({});
  return cookies.filter((cookie) => matchesHostname(cookie.domain.replace(/^\./, ''), hostname)).length;
}

// Sweeps every cookie EXCEPT those belonging to a hostname on the exceptions
// list, so a user can trust a specific site (banking, an account they stay
// logged into) while everything else still gets eaten on schedule.
async function sweepCookies({ onlyHostname } = {}) {
  const exceptions = getExceptions();
  const cookies = await session.defaultSession.cookies.get({});
  let removed = 0;

  for (const cookie of cookies) {
    const hostname = cookie.domain.replace(/^\./, '');

    if (onlyHostname) {
      if (!matchesHostname(hostname, onlyHostname)) continue;
    } else if (exceptions.some((h) => matchesHostname(hostname, h))) {
      continue;
    }

    const protocol = cookie.secure ? 'https://' : 'http://';
    const url = `${protocol}${hostname}${cookie.path}`;
    try {
      await session.defaultSession.cookies.remove(url, cookie.name);
      removed++;
    } catch (err) {
      // cookie already gone or URL didn't resolve cleanly, skip it
    }
  }

  return removed;
}

async function runIfDue() {
  const features = storage.get('features') || {};
  if (!features.eatCookies) return false;

  const stats = storage.get('stats') || {};
  const last = stats.lastCookieClear || 0;
  if (Date.now() - last < EAT_INTERVAL_MS) return false;

  await sweepCookies();

  storage.set('stats', {
    ...stats,
    lastCookieClear: Date.now(),
    cookiesClearedRuns: (stats.cookiesClearedRuns || 0) + 1
  });

  return true;
}

function start() {
  runIfDue();
  setInterval(runIfDue, CHECK_INTERVAL_MS);
}

module.exports = { start, runIfDue, sweepCookies, getExceptions, isExcepted, setExcepted, countForSite };
