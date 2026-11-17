import { defineConfig } from 'astro/config';

// WORLD_TEST=1 (set by playwright.config.ts for the e2e build, and needed by
// scripts/capture-poster.mjs) builds the engine test bench at /world-test and lets `/` honour
// its test parameters (?debug ?governor ?t ?tier ?perf). The deploy build never sets it (M8, M9).
const WORLD_TEST = process.env.WORLD_TEST === '1';

/** Injects /world-test only in a WORLD_TEST build; the page lives outside src/pages for that. */
const worldTest = {
  name: 'world-test',
  hooks: {
    'astro:config:setup': ({ injectRoute }) => {
      if (WORLD_TEST) injectRoute({ pattern: '/world-test', entrypoint: './src/dev/world-test.astro' });
    },
  },
};

export default defineConfig({
  site: 'https://xoumyax.github.io',
  output: 'static',
  trailingSlash: 'ignore',
  outDir: process.env.OUT_DIR ?? './dist',
  integrations: [worldTest],
  vite: { define: { __WORLD_TEST__: JSON.stringify(WORLD_TEST) } },
});
