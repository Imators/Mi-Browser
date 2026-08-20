const { app, session, webContents } = require('electron');
const storage = require('./storage');
const getOutManager = require('./get-out-manager');

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

function setupWebRtcProtection(contents) {
  try {
    contents.setWebRTCIPHandlingPolicy('default_public_interface_only');
  } catch (err) {
    console.error('setupWebRtcProtection failed:', err);
  }
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

function topFrameHostname(details) {
  try {
    if (details.resourceType === 'mainFrame') return new URL(details.url).hostname;
    const contents = webContents.fromId(details.webContentsId);
    if (!contents || contents.isDestroyed()) return null;
    return new URL(contents.getURL()).hostname;
  } catch (err) {
    return null;
  }
}

function setupGpcSignal(targetSession) {
  targetSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['Sec-GPC'] = '1';
    details.requestHeaders['DNT'] = '1';
    callback({ requestHeaders: details.requestHeaders });
  });
}

function setupRequestInterception(targetSession) {
  targetSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    if (getOutManager.isBlocked(details.url, topFrameHostname(details))) {
      callback({ cancel: true });
      return;
    }

    if (details.resourceType !== 'mainFrame') {
      callback({});
      return;
    }

    const settings = storage.get('security') || {};
    if (settings.httpsOnly === true && details.url.startsWith('http://')) {
      callback({ redirectURL: 'https://' + details.url.slice('http://'.length) });
      return;
    }

    callback({});
  });
}

module.exports = {
  applyDnsSettings,
  getDnsProvider,
  getActiveDnsProvider,
  DNS_PROVIDERS,
  applyRealisticUserAgent,
  applyUserAgentClientHints,
  isGoogleSignInUrl,
  setupRequestInterception,
  setupGpcSignal,
  setupWebRtcProtection
};
