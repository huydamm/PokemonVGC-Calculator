/**
 * Content-Security-Policy for the built web app, injected as a <meta> by vite.config.ts.
 * GitHub Pages can't send headers, so frame-ancestors (header-only) is not set.
 * scripts/csp.test.ts fails if a service starts calling a host that isn't listed here.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // React style={} props (Heatmap cells, item icon sprite offsets).
  "style-src 'self' 'unsafe-inline'",
  // Sprites and the item icon sheet.
  "img-src 'self' data: https://play.pokemonshowdown.com",
  "font-src 'self'",
  // data.pkmn.cc 301-redirects to pkmn.github.io, and CSP checks every hop.
  "connect-src 'self' https://data.pkmn.cc https://pkmn.github.io https://championsbattledata.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');
