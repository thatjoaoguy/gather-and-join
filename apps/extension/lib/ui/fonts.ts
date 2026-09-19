/**
 * Quicksand for every extension surface. The files are copied into the package
 * from docs/design-system at build time (see wxt.config.ts), so they are
 * addressed through chrome.runtime.getURL rather than a static stylesheet:
 * that resolves in dev mode, in production, and inside a page's shadow-root
 * HUD (where @font-face rules are ignored and must live in the host document).
 */
const FONT_STYLE_ID = 'gj-fonts';
const WEIGHTS = [400, 500, 600, 700] as const;

export function ensureQuicksand(doc: Document = document) {
  if (doc.getElementById(FONT_STYLE_ID) || typeof chrome === 'undefined' || !chrome.runtime?.getURL) return;
  const style = doc.createElement('style');
  style.id = FONT_STYLE_ID;
  style.textContent = WEIGHTS
    .map((w) => `@font-face{font-family:'Quicksand';font-style:normal;font-weight:${w};font-display:swap;src:url(${chrome.runtime.getURL(`/fonts/quicksand-${w}.ttf`)}) format('truetype')}`)
    .join('\n');
  (doc.head ?? doc.documentElement).appendChild(style);
}
