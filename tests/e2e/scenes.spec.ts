import { test, expect } from '@playwright/test';
import { STOP_IDS } from '../../src/lib/schema';
import { sceneOf, scrollToCentre, scrollToPan, still } from './scene-probe';

test.beforeEach(({ page }) => still(page));

test('the hero scene shows on load, with no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  expect(await sceneOf(page)).toBe('hero');
  expect(errors).toEqual([]);
});

test('scrolling to a stop shows its scene', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#scene:not([hidden])');
  await scrollToCentre(page, 'phd');
  expect(await sceneOf(page)).toBe('phd');
});

test('each stop shows its own scene in the new order', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#scene:not([hidden])');
  for (const id of STOP_IDS) {
    await scrollToCentre(page, id);
    expect(await sceneOf(page), id).toBe(id);
  }
});

test('mid-pan is a mix of both scenes', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#scene:not([hidden])');
  await scrollToPan(page, 'phd', 'ms', 0.5);
  expect(await sceneOf(page)).toBe('mixed');
  await expect(page.locator('#scene')).toHaveAttribute('data-scene', 'phd');
  await expect(page.locator('#scene')).toHaveAttribute('data-next', 'ms');
});

test('portrait to landscape keeps the canvas covering the viewport while the set loads', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'needs a viewport resize from portrait');
  await page.route(/\/scenes\/[a-z]+\.png/, async (r) => { await new Promise((ok) => setTimeout(ok, 1500)); await r.continue(); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForSelector('#scene:not([hidden])');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(100);
  const cv = page.locator('#scene');
  expect(await cv.evaluate((c: HTMLCanvasElement) => c.width)).toBe(120);
  expect(await cv.evaluate((c) => { const r = c.getBoundingClientRect(); return r.left <= 0 && r.top <= 0 && r.right >= innerWidth && r.bottom >= innerHeight; })).toBe(true);
});

test('portrait to landscape with the landscape set failing still covers the viewport', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'needs a viewport resize from portrait');
  await page.route(/\/scenes\/[a-z]+\.png/, (r) => r.abort());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForSelector('#scene:not([hidden])');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
  expect(await page.locator('#scene').evaluate((c) => { const r = c.getBoundingClientRect(); return r.left <= 0 && r.top <= 0 && r.right >= innerWidth && r.bottom >= innerHeight; })).toBe(true);
});

test('a phone URL bar showing and hiding does not rescale the backdrop', async ({ page }) => {
  // Headless Chromium has no URL bar, so 100lvh follows the viewport here: the first growth to
  // 895 may rescale, but going back to 839 (the bar showing again) must not shrink the scene.
  const covers = () => page.locator('#scene').evaluate((c) => {
    const r = c.getBoundingClientRect();
    return r.left <= 0 && r.top <= 0 && r.right >= innerWidth && r.bottom >= innerHeight;
  });
  const size = () => page.locator('#scene').evaluate((c) => { const r = c.getBoundingClientRect(); return [r.width, r.height]; });
  const settle = () => page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
  await page.setViewportSize({ width: 412, height: 839 });
  await page.goto('/');
  await page.waitForSelector('#scene:not([hidden])');
  expect(await covers()).toBe(true);
  await page.setViewportSize({ width: 412, height: 895 });
  await settle();
  expect(await covers()).toBe(true);
  const big = await size();
  await page.setViewportSize({ width: 412, height: 839 });
  await settle();
  expect(await covers()).toBe(true);
  expect(await size()).toEqual(big);
  await page.setViewportSize({ width: 412, height: 895 });
  await settle();
  expect(await size()).toEqual(big);
  // The layer is sized to the large viewport, like the old 100lvh backdrop.
  const [layer, lvh] = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;height:100lvh;width:1px';
    document.body.append(probe);
    const h = probe.getBoundingClientRect().height;
    probe.remove();
    return [document.querySelector('.scenes')!.getBoundingClientRect().height, h];
  });
  expect(layer).toBe(lvh);
});

test('end key lands on the river scene', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#scene:not([hidden])');
  await page.keyboard.press('End');
  await page.waitForTimeout(300);
  // River's subject is not at rest at the very end (p > 0 there), so check the stop, not the file.
  await expect(page.locator('#scene')).toHaveAttribute('data-scene', 'river');
});

test('reduced motion never mixes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForSelector('#scene:not([hidden])');
  for (const frac of [0.3, 0.45, 0.55, 0.7]) {
    await scrollToCentre(page, 'phd', 'ms', frac);
    expect(['phd', 'ms']).toContain(await sceneOf(page));
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  }
});

test('resize to portrait re-picks the set and covers the viewport', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'starts in portrait already');
  await page.goto('/');
  await page.waitForSelector('#scene:not([hidden])');
  expect(await page.locator('#scene').evaluate((c: HTMLCanvasElement) => [c.width, c.height])).toEqual([240, 135]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.locator('#scene').evaluate((c: HTMLCanvasElement) => [c.width, c.height])).toEqual([120, 214]);
  const covers = await page.locator('#scene').evaluate((c) => {
    const r = c.getBoundingClientRect();
    return r.left <= 0 && r.top <= 0 && r.right >= innerWidth && r.bottom >= innerHeight;
  });
  expect(covers).toBe(true);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('no JS shows the static hero image', async ({ page }) => {
    await page.goto('/');
    const img = page.locator('.scenes img');
    await expect(img).toBeVisible();
    await expect(img).toHaveCSS('image-rendering', 'pixelated');
    await expect(page.locator('#scene')).toBeHidden();
  });
});

test('a failed scene load leaves the static image and no errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('**/scenes/phd*.png', (r) => r.abort());
  await page.goto('/');
  await page.waitForSelector('#scene:not([hidden])');
  for (const id of ['srm', 'ms', 'phd', 'now', 'river']) await scrollToCentre(page, id);
  await expect(page.locator('.scenes img')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('scroll stays smooth', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#scene:not([hidden])');
  const avg = await page.evaluate(async () => {
    const step = Math.max(1, (document.documentElement.scrollHeight - innerHeight) / 30);
    const times: number[] = [];
    let last = performance.now();
    for (let i = 0; i < 30; i++) {
      scrollBy({ top: step, behavior: 'instant' });
      await new Promise((ok) => requestAnimationFrame(ok));
      const now = performance.now();
      times.push(now - last);
      last = now;
    }
    return times.reduce((a, b) => a + b, 0) / times.length;
  });
  console.log(`average frame ${avg.toFixed(1)}ms`);
  expect(avg).toBeLessThan(25);
});

// A deep link lands with its stop's top in view; that stop's own scene must be showing, not a mix.
for (const [name, size, reduced] of [
  ['1440x900', { width: 1440, height: 900 }, false],
  ['1366x650, reduced motion', { width: 1366, height: 650 }, true],
] as const) {
  test(`every /#stop-<id> deep link lands on its own scene at ${name}`, async ({ page }, info) => {
    test.skip(info.project.name === 'phone', 'desktop sizes only');
    await page.setViewportSize(size);
    if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const id of STOP_IDS) {
      await page.goto(`/#stop-${id}`);
      await page.waitForLoadState('load');
      await page.waitForSelector('#scene:not([hidden])');
      await expect.poll(() => sceneOf(page), { message: id }).toBe(id);
    }
  });
}
