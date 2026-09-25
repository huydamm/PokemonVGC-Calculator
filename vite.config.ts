/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { CSP } from './scripts/csp';

// esbuild minify + Rollup tree-shaking are on by default in `vite build`.
// Importing @smogon/calc via its `/dist/adaptable` entry (see services/calc.ts)
// keeps the engine's large bundled data tables out of the build.
export default defineConfig({
  plugins: [
    react(),
    {
      // Build only: the dev server injects inline React Refresh scripts a strict CSP would block.
      name: 'csp',
      apply: 'build',
      transformIndexHtml: (html) =>
        html.replace(
          '<meta charset="UTF-8" />',
          `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />` +
            '\n    <meta name="referrer" content="strict-origin-when-cross-origin" />',
        ),
    },
  ],
  build: {
    rollupOptions: {
      output: {
        // Dex data and the calc change only on dep bumps, app code on every deploy, so returning
        // visitors keep the ~500 KB gzip engine chunk across deploys.
        // Learnsets stay out: @pkmn/dex imports them lazily and the app never asks for them.
        manualChunks: (id) =>
          /node_modules[\/]@(pkmn|smogon)[\/]/.test(id) && !/learnsets/.test(id) ? 'engine' : undefined,
      },
    },
    // engine is ~2.1 MB raw; the 3.2 MB learnsets chunk is emitted but never fetched.
    chunkSizeWarningLimit: 3300,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.ts'],
  },
});
