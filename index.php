<?php
$versionData = @json_decode(@file_get_contents(__DIR__ . '/version.json'), true) ?: [];
$version      = $versionData['version'] ?? '1.2.0';
$releaseDate  = $versionData['releaseDate'] ?? null;
$changelog    = $versionData['changelog'] ?? [];
$downloads    = $versionData['downloads'] ?? [];

$macUrl   = $downloads['mac'] ?? '#';
$linuxUrl = $downloads['linux'] ?? '#';

$releaseDateFormatted = null;
if ($releaseDate) {
    $ts = strtotime($releaseDate);
    if ($ts) $releaseDateFormatted = date('j F Y', $ts);
}

function shot($file, $alt) {
    $path = 'assets/screenshots/' . $file;
    $full = __DIR__ . '/' . $path;
    echo '<div class="shot-frame">';
    echo '<img src="' . htmlspecialchars($path) . '" alt="' . htmlspecialchars($alt) . '" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';">';
    echo '<div class="shot-placeholder" style="display:' . (file_exists($full) ? 'none' : 'flex') . ';">';
    echo '<svg viewBox="0 0 24 24" class="icon" width="26" height="26"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><path d="M21 15l-5-5L5 21"></path></svg>';
    echo '<span>' . htmlspecialchars($file) . '</span>';
    echo '</div></div>';
}
?>
<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Mi Browser — My Internet</title>
<meta name="description" content="Mi Browser is a fast, privacy-first desktop browser. No tracking, no intrusive adverts, encrypted DNS by default, and everything stored on your own device.">
<link rel="icon" href="assets/icon.png">
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  :root {
    --bg: #f5f3ff;
    --text: #4c1d95;
    --text-secondary: #7c3aed;
    --surface: #ffffff;
    --border: #c4b5fd;
    --border-hover: #a78bfa;
    --accent: #7c3aed;
    --accent-hover: #6d28d9;
    --accent-text: #ffffff;
    --tool-item-bg: #ffffff;
  }

  html { scroll-behavior: smooth; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
  }

  .wrap { max-width: 760px; margin: 0 auto; padding: 0 32px; }
  .wrap-wide { max-width: 1000px; margin: 0 auto; padding: 0 32px; }

  nav {
    position: sticky;
    top: 0;
    z-index: 40;
    background: var(--bg);
    border-bottom: 1.5px solid transparent;
    transition: border-color 0.3s ease, box-shadow 0.3s ease;
  }

  nav.nav-scrolled {
    border-bottom-color: var(--border);
    box-shadow: 0 4px 24px rgba(76, 29, 149, 0.06);
  }

  nav .inner {
    max-width: 1000px;
    margin: 0 auto;
    padding: 0 32px;
    height: 72px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .nav-mark {
    font-size: 20px;
    letter-spacing: -0.5px;
    color: var(--text);
    text-decoration: none;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .nav-mark img { width: 26px; height: 26px; border-radius: 7px; }

  .nav-links {
    display: flex;
    align-items: center;
    gap: 32px;
  }

  .nav-links a {
    color: var(--text-secondary);
    text-decoration: none;
    font-size: 14px;
    transition: color 0.2s ease;
  }

  .nav-links a:hover { color: var(--text); }

  section { padding: 100px 0; position: relative; }

  .hero {
    text-align: center;
    padding-top: 140px;
    position: relative;
    overflow: hidden;
  }

  .hero-blob {
    position: absolute;
    top: -220px;
    left: 50%;
    width: 900px;
    height: 900px;
    background: var(--accent);
    opacity: 0.08;
    filter: blur(90px);
    border-radius: 44% 56% 62% 38% / 45% 40% 60% 55%;
    transform: translateX(-50%) rotate(8deg);
    pointer-events: none;
  }

  .hero > * { position: relative; z-index: 1; }
  .hero-blob { z-index: 0; }

  .logo-text {
    font-size: 88px;
    font-weight: 400;
    letter-spacing: -3px;
    line-height: 1;
    margin-bottom: 20px;
    display: inline-block;
  }

  .logo-text .accent-word { color: var(--accent); }

  .tagline {
    font-size: 18px;
    color: var(--text-secondary);
    max-width: 520px;
    margin: 0 auto 48px;
    line-height: 1.6;
  }

  .buttons-container {
    display: flex;
    gap: 16px;
    justify-content: center;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }

  .action-button {
    padding: 16px 32px;
    background: var(--surface);
    border: 1.5px solid var(--border);
    border-radius: 16px;
    font-family: inherit;
    font-size: 15px;
    font-weight: 500;
    color: var(--text);
    cursor: pointer;
    transition: all 0.3s ease;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }

  .action-button:hover {
    border-color: var(--border-hover);
    box-shadow: 0 4px 24px rgba(76, 29, 149, 0.1);
    transform: translateY(-2px);
  }

  .action-button.primary {
    background: var(--accent);
    color: var(--accent-text);
    border-color: var(--accent);
  }

  .action-button.primary:hover {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
  }

  .action-button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    transform: none !important;
    box-shadow: none !important;
  }

  .fine-print { font-size: 13px; color: var(--text-secondary); }
  .fine-print a { color: inherit; }

  .shot-frame {
    position: relative;
    border: 1.5px solid var(--border);
    border-radius: 16px;
    background: var(--surface);
    overflow: hidden;
    aspect-ratio: 16 / 10;
    transition: box-shadow 0.4s ease;
  }

  .shot-frame:hover {
    box-shadow: 0 16px 40px rgba(76, 29, 149, 0.14);
  }

  #hero-shot .shot-frame { --tilt: -1.4deg; max-width: 980px; margin: 0 auto; }
  .feature-row:nth-of-type(odd) .shot-frame { --tilt: -1.6deg; }
  .feature-row:nth-of-type(even) .shot-frame { --tilt: 1.6deg; }

  .shot-frame img { width: 100%; height: 100%; object-fit: cover; display: block; }

  .shot-placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    background: var(--bg);
    color: var(--text-secondary);
    font-size: 13px;
  }

  .section-title { font-size: 32px; font-weight: 600; margin-bottom: 12px; }
  .section-lead { font-size: 16px; color: var(--text-secondary); line-height: 1.6; }

  .feature-row { display: grid; grid-template-columns: 1fr 1fr; gap: 56px; align-items: center; }
  .feature-row.reverse .shot-frame { order: 2; }

  .feature-title { font-size: 24px; font-weight: 600; margin-bottom: 12px; }
  .feature-text { color: var(--text-secondary); line-height: 1.7; }

  .tool-item {
    background: var(--tool-item-bg);
    border: 1.5px solid var(--border);
    border-radius: 16px;
    padding: 28px 32px;
  }

  .tool-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .tool-title { font-size: 17px; font-weight: 600; color: var(--text); }
  .tool-description { font-size: 15px; line-height: 1.6; color: var(--text-secondary); }
  .tool-status { font-size: 13px; font-weight: 500; color: var(--text-secondary); white-space: nowrap; }

  .swatch-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px; max-width: 460px; margin: 0 auto; }
  .swatch { aspect-ratio: 1; border-radius: 10px; border: 1.5px solid var(--border); }

  details.tool-item summary { cursor: pointer; list-style: none; display: flex; align-items: center; justify-content: space-between; font-weight: 600; }
  details.tool-item summary::-webkit-details-marker { display: none; }
  details.tool-item .tool-description { margin-top: 12px; }
  details.tool-item svg { transition: transform 0.2s ease; flex-shrink: 0; }
  details.tool-item[open] svg { transform: rotate(45deg); }

  .icon { width: 20px; height: 20px; stroke: currentColor; stroke-width: 2; fill: none; stroke-linecap: round; stroke-linejoin: round; }

  .manifesto { display: flex; flex-direction: column; gap: 14px; }

  .manifesto-line {
    width: 100%;
    font-size: clamp(28px, 5.4vw, 56px);
    line-height: 1.15;
    letter-spacing: -0.5px;
    color: var(--text);
    opacity: 0;
    transform: translateY(36px);
  }

  .manifesto-line:nth-child(odd) { margin-right: 12%; }
  .manifesto-line:nth-child(even) { margin-left: 12%; text-align: right; }

  .manifesto-line.strong { font-weight: 700; font-style: italic; }
  .manifesto-line.light { font-weight: 300; color: var(--text-secondary); }

  @media (max-width: 720px) {
    .manifesto-line { font-size: clamp(22px, 8vw, 34px); }
    .manifesto-line:nth-child(odd) { margin-right: 0; }
    .manifesto-line:nth-child(even) { margin-left: 0; text-align: left; }
  }

  footer { padding: 48px 0; }
  .footer-inner { max-width: 1000px; margin: 0 auto; padding: 0 32px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; font-size: 14px; color: var(--text-secondary); }
  .footer-inner a { color: inherit; text-decoration: none; }
  .footer-inner a:hover { color: var(--text); }

  .reveal { opacity: 0; transform: translateY(20px); }

  @media (max-width: 720px) {
    .feature-row, .feature-row.reverse .shot-frame { grid-template-columns: 1fr; order: 0; }
    .logo-text { font-size: 48px; letter-spacing: -1.5px; }
    .hero-blob { width: 600px; height: 600px; top: -160px; }
    .swatch-grid { grid-template-columns: repeat(4, 1fr); }
  }
</style>
</head>
<body>

<nav>
  <div class="inner">
    <a href="#top" class="nav-mark">
      <img src="assets/icon.png" alt="" onerror="this.remove()">
      Mi Browser
    </a>
    <div class="nav-links">
      <a href="#features">Features</a>
      <a href="#security">Security</a>
      <a href="#themes">Themes</a>
      <a href="#faq">FAQ</a>
      <a href="#download">Download</a>
    </div>
  </div>
</nav>

<section id="top" class="hero">
  <div class="hero-blob"></div>
  <div class="wrap">
    <h1 id="hero-title" class="logo-text reveal"><span class="accent-word">Mi</span> Browser</h1>
    <p id="hero-tag" class="tagline reveal">Your internet. Nobody else's business. Fast, private browsing with no tracking and no intrusive adverts.</p>

    <div id="hero-buttons" class="buttons-container reveal">
      <a href="<?= htmlspecialchars($macUrl) ?>" class="action-button primary">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M16.365 1.43c0 1.14-.415 2.083-1.245 2.83-.995.898-2.157 1.008-2.7.947a3.72 3.72 0 0 1-.03-.395c0-1.14.5-2.147 1.29-2.87.585-.535 1.66-1.02 2.615-1.04.03.16.07.34.07.528zM20.13 17.32c-.556 1.28-.823 1.852-1.538 2.98-.997 1.575-2.404 3.538-4.148 3.552-1.55.014-1.95-.996-4.05-.984-2.1.012-2.542 1-4.092.985-1.744-.015-3.077-1.786-4.074-3.36-2.79-4.39-3.083-9.545-1.36-12.293 1.223-1.95 3.16-3.09 4.98-3.09 1.855 0 3.02 1.017 4.56 1.017 1.49 0 2.4-1.02 4.56-1.02 1.62 0 3.34.882 4.56 2.404-4.01 2.2-3.36 7.926.602 9.81z"/></svg>
        Download for macOS
      </a>
      <button disabled title="Coming soon" class="action-button">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 5.5 10.4 4.4v6.8H3V5.5zM11.3 4.3 20.9 3v8.2h-9.6V4.3zM3 12.2h7.4V19L3 17.9v-5.7zM11.3 12.2h9.6V21l-9.6-1.3v-7.5z"/></svg>
        Windows — coming soon
      </button>
    </div>
    <p id="hero-sub" class="fine-print reveal">Also available for <a href="<?= htmlspecialchars($linuxUrl) ?>">Linux (AppImage)</a> · Version <?= htmlspecialchars($version) ?> · Free &amp; open, MIT licensed</p>
  </div>

  <div class="wrap-wide" style="margin-top: 72px;">
    <div id="hero-shot" class="reveal">
      <?php shot('hero.png', 'Mi Browser main window'); ?>
    </div>
  </div>
</section>

<section id="manifesto">
  <div class="wrap-wide manifesto">
    <p class="manifesto-line strong">Your data belongs to you.</p>
    <p class="manifesto-line light">Not an ad network. Not a data broker. Not us.</p>
    <p class="manifesto-line strong">No accounts. No telemetry. No catch.</p>
    <p class="manifesto-line light">Just a browser that minds its own business.</p>
    <p class="manifesto-line strong">My Internet. Actually mine.</p>
  </div>
</section>

<section id="features">
  <div class="wrap-wide">
    <div class="reveal" style="text-align:center; margin-bottom: 88px;">
      <p class="section-title">Built for people, not ad networks</p>
      <p class="section-lead">Every feature exists to put you back in control of your own browsing.</p>
    </div>

    <div style="display:flex; flex-direction:column; gap: 88px;">
      <div class="feature-row reveal">
        <?php shot('eat-my-cookies.png', 'Eat My Cookies settings'); ?>
        <div>
          <p class="feature-title">Eat My Cookies</p>
          <p class="feature-text">Sweeps cookies per site on a schedule you control, with a live count of what each site is actually holding onto. Turn it off for the one site you need to stay signed into, and leave it eating everywhere else.</p>
        </div>
      </div>

      <div class="feature-row reverse reveal">
        <?php shot('private-browsing.png', 'Private Browsing mode'); ?>
        <div>
          <p class="feature-title">Private Browsing</p>
          <p class="feature-text">Its own fixed dark look, its own ephemeral session. No history, no cookies, no passwords, ever, and it's gone the moment you close the tab.</p>
        </div>
      </div>

      <div class="feature-row reveal">
        <?php shot('mini-player.png', 'Mini player floating window'); ?>
        <div>
          <p class="feature-title">Mini player</p>
          <p class="feature-text">Pop a playing video into a small floating window and keep watching while you read, write or browse somewhere else entirely.</p>
        </div>
      </div>
    </div>
  </div>
</section>

<section id="security">
  <div class="wrap">
    <div class="reveal" style="text-align:center; margin-bottom: 56px;">
      <p class="section-title">Secure, out of the box</p>
      <p class="section-lead">No add-ons required. It's just how Mi Browser is built.</p>
    </div>
    <div class="reveal" style="display:flex; flex-direction:column; gap:12px;">
      <?php
      $security = [
        ['label' => 'Sandboxed browsing', 'status' => 'Always on', 'text' => 'Every tab runs in an isolated process, cut off from the rest of your machine.'],
        ['label' => 'Encrypted DNS (DoH)', 'status' => 'Default on', 'text' => 'Cloudflare, Google or Quad9, your choice, encrypted end to end.'],
        ['label' => 'HTTPS-Only Mode', 'status' => 'Optional', 'text' => 'Upgrades every site to a secure connection automatically.'],
        ['label' => 'Risky download warnings', 'status' => 'Default on', 'text' => 'Flags file types commonly used to spread malware before they land on disk.'],
      ];
      foreach ($security as $s):
      ?>
      <div class="tool-item">
        <div class="tool-header">
          <p class="tool-title"><?= htmlspecialchars($s['label']) ?></p>
          <span class="tool-status"><?= htmlspecialchars($s['status']) ?></span>
        </div>
        <p class="tool-description"><?= htmlspecialchars($s['text']) ?></p>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<section id="themes">
  <div class="wrap">
    <div class="reveal" style="text-align:center;">
      <p class="section-title">Make it yours</p>
      <p class="section-lead" style="margin-bottom: 40px;">21 themes, a custom accent colour, a compact tab mode, your own homepage. Mi Browser bends to you, not the other way round.</p>
      <div class="swatch-grid">
        <?php
        $swatches = ['#f5f3ff,#7c3aed', '#0f172a,#3b82f6', '#dcfce7,#16a34a', '#ffedd5,#ea580c', '#0a0014,#e879f9', '#001a0f,#10b981', '#fff1f2,#e11d48'];
        foreach ($swatches as $sw): [$a, $b] = explode(',', $sw); ?>
        <div class="swatch" style="background: linear-gradient(135deg, <?= $a ?>, <?= $b ?>);"></div>
        <?php endforeach; ?>
      </div>
    </div>
  </div>
</section>

<?php if (!empty($changelog)): ?>
<section id="changelog">
  <div class="wrap">
    <div class="reveal" style="text-align:center; margin-bottom: 40px;">
      <p class="section-title">What's new in <?= htmlspecialchars($version) ?></p>
      <?php if ($releaseDateFormatted): ?><p class="section-lead">Released <?= htmlspecialchars($releaseDateFormatted) ?></p><?php endif; ?>
    </div>
    <div class="reveal" style="display:flex; flex-direction:column; gap:10px;">
      <?php foreach ($changelog as $item): ?>
      <div class="tool-item" style="padding: 16px 24px;">
        <p class="tool-description" style="color: var(--text);"><?= htmlspecialchars($item) ?></p>
      </div>
      <?php endforeach; ?>
    </div>
  </div>
</section>
<?php endif; ?>

<section id="faq">
  <div class="wrap">
    <div class="reveal" style="text-align:center; margin-bottom: 40px;">
      <p class="section-title">Questions, answered</p>
    </div>
    <div class="reveal" style="display:flex; flex-direction:column; gap:10px;">
      <?php
      $faqs = [
        ['q' => 'Is Mi Browser really free?', 'a' => 'Yes. Free to download, free to use, MIT licensed. No account, no subscription.'],
        ['q' => 'Does it collect any data?', 'a' => 'No telemetry, no analytics, no tracking. Everything Mi Browser remembers stays on your own device.'],
        ['q' => 'What happened to extensions?', 'a' => 'Removed entirely. It kept us honest about focusing on the browser itself rather than plugging gaps with add-ons.'],
        ['q' => 'When is Windows coming?', 'a' => 'It\'s in progress. The macOS and Linux builds are ready today.'],
      ];
      foreach ($faqs as $f):
      ?>
      <details class="tool-item">
        <summary>
          <?= htmlspecialchars($f['q']) ?>
          <svg class="icon" viewBox="0 0 24 24" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </summary>
        <p class="tool-description"><?= htmlspecialchars($f['a']) ?></p>
      </details>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<section id="download" style="text-align:center; padding-bottom: 60px;">
  <div class="wrap">
    <div class="reveal">
      <p class="logo-text" style="font-size: 40px;">Ready when you are</p>
      <p class="tagline">Free. Open source. No account required.</p>
      <div class="buttons-container">
        <a href="<?= htmlspecialchars($macUrl) ?>" class="action-button primary">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M16.365 1.43c0 1.14-.415 2.083-1.245 2.83-.995.898-2.157 1.008-2.7.947a3.72 3.72 0 0 1-.03-.395c0-1.14.5-2.147 1.29-2.87.585-.535 1.66-1.02 2.615-1.04.03.16.07.34.07.528zM20.13 17.32c-.556 1.28-.823 1.852-1.538 2.98-.997 1.575-2.404 3.538-4.148 3.552-1.55.014-1.95-.996-4.05-.984-2.1.012-2.542 1-4.092.985-1.744-.015-3.077-1.786-4.074-3.36-2.79-4.39-3.083-9.545-1.36-12.293 1.223-1.95 3.16-3.09 4.98-3.09 1.855 0 3.02 1.017 4.56 1.017 1.49 0 2.4-1.02 4.56-1.02 1.62 0 3.34.882 4.56 2.404-4.01 2.2-3.36 7.926.602 9.81z"/></svg>
          macOS
        </a>
        <button disabled title="Coming soon" class="action-button">Windows — coming soon</button>
        <a href="<?= htmlspecialchars($linuxUrl) ?>" class="action-button">Linux (AppImage)</a>
      </div>
      <p class="fine-print">Version <?= htmlspecialchars($version) ?> · MIT licensed · Built by Imators LLC</p>
    </div>
  </div>
</section>

<footer>
  <div class="footer-inner">
    <span>Mi Browser — My Internet</span>
    <div style="display:flex; gap:24px;">
      <a href="#features">Features</a>
      <a href="#security">Security</a>
      <a href="#download">Download</a>
    </div>
    <span>&copy; <?= date('Y') ?> Imators LLC</span>
  </div>
</footer>

<script>
gsap.registerPlugin(ScrollTrigger);

document.querySelectorAll('.section-title').forEach(function (el) {
  var words = el.textContent.split(' ');
  el.innerHTML = words.map(function (w) {
    return '<span style="display:inline-block; overflow:hidden; padding-bottom:0.1em;"><span class="word" style="display:inline-block; transform:translateY(115%);">' + w + '&nbsp;</span></span>';
  }).join('');
});

gsap.timeline({ defaults: { ease: 'power3.out' } })
  .to('#hero-title', { opacity: 1, y: 0, duration: .7 })
  .to('#hero-tag', { opacity: 1, y: 0, duration: .6 }, '-=0.4')
  .to('#hero-buttons', { opacity: 1, y: 0, duration: .5 }, '-=0.3')
  .to('#hero-sub', { opacity: 1, y: 0, duration: .5 }, '-=0.3')
  .to('#hero-shot', { opacity: 1, y: 0, duration: .8, ease: 'power2.out' }, '-=0.25');

gsap.to('.hero-blob', {
  y: 200,
  rotate: 18,
  ease: 'none',
  scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.8 }
});

document.querySelectorAll('.section-title .word').forEach(function (el) {
  gsap.to(el, {
    y: '0%',
    duration: .8,
    ease: 'power3.out',
    scrollTrigger: { trigger: el, start: 'top 88%' }
  });
});

document.querySelectorAll('.section-lead').forEach(function (el) {
  gsap.fromTo(el, { opacity: 0, y: 16 }, {
    opacity: 1, y: 0, duration: .6, ease: 'power2.out', delay: .15,
    scrollTrigger: { trigger: el, start: 'top 88%' }
  });
});

gsap.to('.manifesto-line', {
  opacity: 1,
  y: 0,
  duration: .9,
  ease: 'power3.out',
  stagger: 0.22,
  scrollTrigger: { trigger: '.manifesto', start: 'top 75%' }
});

document.querySelectorAll('.shot-frame').forEach(function (el) {
  var tilt = parseFloat(getComputedStyle(el).getPropertyValue('--tilt')) || 0;
  el.dataset.tilt = tilt;
  gsap.set(el, { rotate: tilt });
  el.addEventListener('mouseenter', function () {
    gsap.to(el, { rotate: 0, duration: .4, ease: 'power3.out' });
  });
  el.addEventListener('mouseleave', function () {
    gsap.to(el, { rotate: tilt, duration: .4, ease: 'power3.out' });
  });
});

document.querySelectorAll('.feature-row').forEach(function (row) {
  var img = row.querySelector('.shot-frame');
  var copy = row.querySelector('.feature-title').parentElement;
  var fromX = row.classList.contains('reverse') ? 60 : -60;
  var tiltDeg = parseFloat(img.dataset.tilt) || 0;

  gsap.fromTo(img, { opacity: 0, x: fromX, rotate: 0 }, {
    opacity: 1, x: 0, rotate: tiltDeg,
    duration: 1,
    ease: 'power3.out',
    scrollTrigger: { trigger: row, start: 'top 80%' }
  });
  gsap.fromTo(copy, { opacity: 0, x: fromX * -1 }, {
    opacity: 1, x: 0,
    duration: 1,
    ease: 'power3.out',
    delay: 0.1,
    scrollTrigger: { trigger: row, start: 'top 80%' }
  });
  gsap.to(img, {
    y: -30,
    ease: 'none',
    scrollTrigger: { trigger: row, start: 'top bottom', end: 'bottom top', scrub: 0.8 }
  });
});

document.querySelectorAll('#security .tool-item, #changelog .tool-item, #faq .tool-item').forEach(function (el, i) {
  gsap.fromTo(el, { opacity: 0, x: -32 }, {
    opacity: 1, x: 0,
    duration: .6,
    ease: 'power2.out',
    scrollTrigger: { trigger: el, start: 'top 90%' }
  });
});

gsap.fromTo('.swatch', { opacity: 0, scale: 0.4, rotate: -12 }, {
  opacity: 1, scale: 1, rotate: 0,
  duration: .6,
  ease: 'back.out(2.2)',
  stagger: 0.06,
  scrollTrigger: { trigger: '.swatch-grid', start: 'top 88%' }
});

document.querySelectorAll('.reveal:not(#hero-title):not(#hero-tag):not(#hero-buttons):not(#hero-sub):not(#hero-shot)').forEach(function (el) {
  if (el.querySelector('.section-title')) {
    gsap.set(el, { opacity: 1, y: 0 });
    return;
  }
  gsap.fromTo(el, { opacity: 0, y: 20 }, {
    opacity: 1,
    y: 0,
    duration: .6,
    ease: 'power2.out',
    scrollTrigger: { trigger: el, start: 'top 90%' }
  });
});

document.querySelectorAll('.action-button.primary').forEach(function (btn) {
  var moveX = gsap.quickTo(btn, 'x', { duration: 0.4, ease: 'power3.out' });
  var moveY = gsap.quickTo(btn, 'y', { duration: 0.4, ease: 'power3.out' });
  btn.addEventListener('mousemove', function (e) {
    var b = btn.getBoundingClientRect();
    moveX((e.clientX - b.left - b.width / 2) * 0.35);
    moveY((e.clientY - b.top - b.height / 2) * 0.35);
  });
  btn.addEventListener('mouseleave', function () {
    moveX(0);
    moveY(0);
  });
});

ScrollTrigger.create({
  start: 'top -80',
  end: 99999,
  toggleClass: { targets: 'nav', className: 'nav-scrolled' }
});
</script>
</body>
</html>
