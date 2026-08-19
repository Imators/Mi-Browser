const { app, session } = require('electron');
const storage = require('./storage');

// Real Chromium-level DNS-over-HTTPS -- not a JS shim, the actual network
// stack resolves through an encrypted DoH endpoint instead of plaintext
// UDP:53, so a local network/ISP watching DNS traffic sees nothing. These
// are genuine Chromium command-line switches (the same mechanism enterprise
// policy uses), so they only take effect at next launch -- there's no
// public runtime API to flip DNS mode after the network stack has already
// started.
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

// Must run before app.whenReady() -- Chromium locks in DNS mode when the
// network service starts, which happens during startup.
function applyDnsSettings() {
  const provider = getDnsProvider();
  if (provider === 'off') return;

  const template = DNS_PROVIDERS[provider];
  app.commandLine.appendSwitch('dns-over-https-mode', 'secure');
  app.commandLine.appendSwitch('dns-over-https-templates', template);
}

// A real (if simplified) HTTPS-Only Mode: every top-level navigation to a
// plain http:// address is upgraded to https:// before the request goes
// out. If the site genuinely doesn't support https, the load fails and
// falls through to the existing offline/500 page rather than silently
// serving the request in the clear -- the same "fail closed, don't
// downgrade silently" behaviour Chrome/Firefox's own HTTPS-Only Mode uses.
// Off by default (unlike DNS-over-HTTPS): this one *can* break genuinely
// http-only sites (old intranet gear, local dev servers) with no fallback,
// so it's an opt-in rather than a silent default.
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

// Google (and a growing list of other sites) actively detects and blocks
// sign-in flows from what it calls an "embedded user-agent" -- Electron's
// default UA string literally contains "Electron/x.y.z", which is exactly
// what that detection looks for, and the sign-in page refuses to proceed
// ("This browser or app may not be secure"). Presenting the UA of a real,
// current desktop Chrome build (built from this exact Chromium version, so
// it's never a lie about capability) is the standard, legitimate fix real
// Electron-based browsers use for this -- it doesn't defeat every anti-bot
// signal Google checks, but the UA string is the primary one for this
// specific block.
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
