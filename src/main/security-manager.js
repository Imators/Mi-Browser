const { app, session } = require('electron');
const storage = require('./storage');

const DNS_PROVIDERS = {
  cloudflare: 'https://cloudflare-dns.com/dns-query',
  google: 'https://dns.google/dns-query',
  quad9: 'https://dns.quad9.net/dns-query'
};

function getDnsProvider() {
  const stored = storage.get('security');
  const provider = stored && stored.dnsProvider;
  return provider && (DNS_PROVIDERS[provider] || provider === 'off') ? provider : 'cloudflare';
}

function applyDnsSettings() {
  const provider = getDnsProvider();
  if (provider === 'off') return;

  const template = DNS_PROVIDERS[provider];
  app.commandLine.appendSwitch('dns-over-https-mode', 'secure');
  app.commandLine.appendSwitch('dns-over-https-templates', template);
}

function setupHttpsUpgrade(targetSession) {
  targetSession.webRequest.onBeforeRequest({ urls: ['http://*/*'] }, (details, callback) => {
    const settings = storage.get('security') || {};
    if (settings.httpsOnly !== true || details.resourceType !== 'mainFrame') {
      callback({});
      return;
    }
    callback({ redirectURL: 'https://' + details.url.slice('http://'.length) });
  });
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

module.exports = { applyDnsSettings, setupHttpsUpgrade, getDnsProvider, DNS_PROVIDERS, applyRealisticUserAgent };
