const { app, session } = require('electron');
const storage = require('./storage');

const DNS_PROVIDERS = {
  cloudflare: 'https://cloudflare-dns.com/dns-query',
  google: 'https://dns.google/dns-query',
  quad9: 'https://dns.quad9.net/dns-query'
};

let activeDnsProvider = null;

function getDnsProvider() {
  const stored = storage.get('security');
  const provider = stored && stored.dnsProvider;
  return provider && (DNS_PROVIDERS[provider] || provider === 'off') ? provider : 'cloudflare';
}

function getActiveDnsProvider() {
  return activeDnsProvider;
}

function applyDnsSettings() {
  const provider = getDnsProvider();
  activeDnsProvider = provider;
  if (provider === 'off') return;

  const template = DNS_PROVIDERS[provider];
  app.commandLine.appendSwitch('dns-over-https-mode', 'secure');
  app.commandLine.appendSwitch('dns-over-https-templates', template);
}


function realisticChromeUserAgent() {
  const chromeVersion = process.versions.chrome;
  const platformString = process.platform === 'darwin'
    ? 'Macintosh; Intel Mac OS X 10_15_7'
    : process.platform === 'win32'
      ? 'Windows NT 10.0; Win64; x64'
      : 'X11; Linux x86_64';
  return `Mozilla/5.0 (${platformString}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
}

function applyRealisticUserAgent(targetSession) {
  targetSession.setUserAgent(realisticChromeUserAgent());
}

function applyUserAgentClientHints() {
  const chromeVersion = process.versions.chrome;
  const majorVersion = chromeVersion.split('.')[0];
  const platform = process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux';
  const metadata = {
    brand_version_list: [
      { brand: 'Not_A Brand', version: '8' },
      { brand: 'Chromium', version: majorVersion },
      { brand: 'Google Chrome', version: majorVersion }
    ],
    brand_full_version_list: [
      { brand: 'Not_A Brand', version: '8.0.0.0' },
      { brand: 'Chromium', version: chromeVersion },
      { brand: 'Google Chrome', version: chromeVersion }
    ],
    full_version: chromeVersion,
    platform,
    platform_version: process.platform === 'darwin' ? '10.15.7' : '10.0.0',
    architecture: 'x86',
    model: '',
    mobile: false,
    bitness: '64',
    wow64: false
  };
  app.commandLine.appendSwitch('user-agent-metadata', JSON.stringify(metadata));
}

const GOOGLE_SIGNIN_HOSTS = new Set(['accounts.google.com', 'accounts.youtube.com']);

function isGoogleSignInUrl(urlString) {
  try {
    const url = new URL(urlString);
    return GOOGLE_SIGNIN_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function setupRequestInterception(targetSession, onGoogleRedirect) {
  targetSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://accounts.google.com/*', 'https://accounts.youtube.com/*'] },
    (details, callback) => {
      if (details.resourceType !== 'mainFrame') {
        callback({});
        return;
      }

      if (isGoogleSignInUrl(details.url)) {
        onGoogleRedirect(details.url);
        callback({ redirectURL: 'mi://newtab?googleRedirect=1' });
        return;
      }

      const settings = storage.get('security') || {};
      if (settings.httpsOnly === true && details.url.startsWith('http://')) {
        callback({ redirectURL: 'https://' + details.url.slice('http://'.length) });
        return;
      }

      callback({});
    }
  );
}

module.exports = {
  applyDnsSettings,
  getDnsProvider,
  getActiveDnsProvider,
  DNS_PROVIDERS,
  applyRealisticUserAgent,
  applyUserAgentClientHints,
  isGoogleSignInUrl,
  setupRequestInterception
};
