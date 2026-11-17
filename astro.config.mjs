import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://xoumyax.github.io',
  output: 'static',
  trailingSlash: 'ignore',
  outDir: process.env.OUT_DIR ?? './dist',
});
