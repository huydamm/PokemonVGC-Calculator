/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// esbuild minify + Rollup tree-shaking are on by default in `vite build`.
// Importing @smogon/calc via its `/dist/adaptable` entry (see services/calc.ts)
// keeps the engine's large bundled data tables out of the build.
export default defineConfig(({ command }) => ({
  // Served at /<repo>/ on GitHub Pages (case-sensitive); root locally.
  base: command === 'build' ? '/PokemonVGC-Calculator/' : '/',
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
}));
