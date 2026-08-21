// Shared by Settings/History/Downloads: applies the currently-applied
// partner theme's colours (from customization.partnerTheme) as --pt-*
// custom properties on <body>, and toggles the .partner-theme-active
// class the matching override block in shared/theme.css keys off.

function shadeColor(hex, percent) {
  try {
    const f = parseInt(hex.replace('#', ''), 16);
    const t = percent < 0 ? 0 : 255;
    const p = Math.abs(percent) / 100;
    const R = f >> 16, G = (f >> 8) & 0x00FF, B = f & 0x0000FF;
    return '#' + (0x1000000 + (Math.round((t - R) * p) + R) * 0x10000 + (Math.round((t - G) * p) + G) * 0x100 + (Math.round((t - B) * p) + B)).toString(16).slice(1);
  } catch (err) {
    return hex;
  }
}

function readableOnColor(hex) {
  try {
    const f = parseInt(hex.replace('#', ''), 16);
    const R = (f >> 16) / 255, G = ((f >> 8) & 0x00FF) / 255, B = (f & 0x0000FF) / 255;
    const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const lum = 0.2126 * lin(R) + 0.7152 * lin(G) + 0.0722 * lin(B);
    return lum > 0.5 ? '#000000' : '#ffffff';
  } catch (err) {
    return '#ffffff';
  }
}

const PARTNER_THEME_VAR_NAMES = [
  '--pt-bg', '--pt-surface', '--pt-surface-hover', '--pt-text',
  '--pt-border', '--pt-border-strong', '--pt-accent', '--pt-accent-text'
];

function applyPartnerThemeVars(customization) {
  const pt = customization && customization.partnerTheme;
  document.body.classList.toggle('partner-theme-active', !!pt);

  if (!pt) {
    PARTNER_THEME_VAR_NAMES.forEach((name) => document.body.style.removeProperty(name));
    return;
  }

  document.body.style.setProperty('--pt-bg', pt.bgColor);
  document.body.style.setProperty('--pt-surface', pt.surfaceColor);
  document.body.style.setProperty('--pt-surface-hover', shadeColor(pt.surfaceColor, -12));
  document.body.style.setProperty('--pt-text', pt.textColor);
  document.body.style.setProperty('--pt-border', pt.borderColor);
  document.body.style.setProperty('--pt-border-strong', shadeColor(pt.borderColor, 20));
  document.body.style.setProperty('--pt-accent', pt.accentColor);
  document.body.style.setProperty('--pt-accent-text', readableOnColor(pt.accentColor));
}
