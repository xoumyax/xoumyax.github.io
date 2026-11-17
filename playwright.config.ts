import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 4321);
// The e2e build includes /world-test and lets `/` honour the test parameters (?debug, ?governor,
// ?t, ?tier): astro.config.mjs reads WORLD_TEST at build. Set here (not only in webServer.env) so
// the test processes see it too: site-guards checks /world-test is absent when it is not '1'.
process.env.WORLD_TEST ??= '1';
const BRAVE = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const worldSpecs = /world-.*\.spec\.ts/;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `npm run build && PORT=${PORT} npm run preview`,
    env: { WORLD_TEST: process.env.WORLD_TEST ?? '1' },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    { name: 'desktop', testIgnore: worldSpecs, grepInvert: /@nowebgl/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', testIgnore: worldSpecs, grepInvert: /@nowebgl/, use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } },
    {
      name: 'world', testMatch: worldSpecs, grepInvert: /@nowebgl/,
      use: {
        viewport: { width: 1440, height: 900 },
        launchOptions: { executablePath: process.env.WORLD_BROWSER ?? BRAVE, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] },
      },
    },
    { name: 'nowebgl', grep: /@nowebgl/, use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--disable-webgl', '--disable-webgl2'] } } },
  ],
});
