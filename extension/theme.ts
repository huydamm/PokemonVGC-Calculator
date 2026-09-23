/**
 * Pixel theme for extension surfaces (the overlay panel): the web app's
 * design tokens plus the three pixel fonts bundled in `fonts/`, applied as
 * constructable stylesheets.
 */
import tokens from '../src/tokens.css';

// Prefixed family names so they never collide with fonts on the host page.
const FONTS: [family: string, file: string, weight: string][] = [
  ['VGC Press Start 2P', 'press-start-2p.woff2', '400'],
  ['VGC Pixelify Sans', 'pixelify-sans.woff2', '400 700'],
  ['VGC VT323', 'vt323.woff2', '400'],
];

const FONT_TOKENS = `:root, :host {
  --font-display: 'VGC Press Start 2P', ui-monospace, monospace;
  --font-ui: 'VGC Pixelify Sans', system-ui, sans-serif;
  --font-mono: 'VGC VT323', ui-monospace, monospace;
}`;

function sheet(css: string): CSSStyleSheet {
  const s = new CSSStyleSheet();
  s.replaceSync(css);
  return s;
}

/** Declare the fonts on the document: Chrome ignores @font-face inside a shadow root. */
export function installFonts(): void {
  const css = FONTS.map(
    ([family, file, weight]) =>
      `@font-face { font-family: '${family}'; src: url('${chrome.runtime.getURL(`fonts/${file}`)}') format('woff2'); font-weight: ${weight}; font-display: swap; }`,
  ).join('\n');
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet(css)];
}

/** One stylesheet: shared tokens, extension font names, then the surface's own rules. */
export function themeSheet(css: string): CSSStyleSheet {
  return sheet(`${tokens}\n${FONT_TOKENS}\n${css}`);
}
