import { test, expect, type Page } from '@playwright/test';

const IDS = ['hero', 'srm', 'cognizant', 'ms', 'phd', 'now', 'river'];

// Reads 16 pixels spread across the canvas (native resolution) and compares them with the
// same pixels of each scene file drawn into an offscreen canvas. Returns the scene id that
// matches all 16, or 'mixed'.
async function sceneOf(page: Page): Promise<string> {
  await page.waitForSelector('#scene:not([hidden])');
  return page.evaluate(async (ids) => {
    const cv = document.getElementById('scene') as HTMLCanvasElement;
    const { width: w, height: h } = cv;
    const pts: [number, number][] = [];
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      pts.push([Math.floor(((i + 0.37 + 0.21 * j) % 4) / 4 * w), Math.floor(((j + 0.61 + 0.17 * i) % 4) / 4 * h)]);
    }
    const sample = (c: HTMLCanvasElement) => {
      const g = c.getContext('2d')!;
      return pts.map(([x, y]) => [...g.getImageData(x, y, 1, 1).data].join(','));
    };
    const have = sample(cv);
    const suffix = w === 120 ? '-m' : '';
    const hits: string[] = [];
    for (const id of ids) {
      const img = new Image();
      img.src = `/scenes/${id}${suffix}.png`;
      await img.decode();
      const off = document.createElement('canvas');
      off.width = w; off.height = h;
      off.getContext('2d')!.drawImage(img, 0, 0);
      const want = sample(off);
      if (want.every((v, i) => v === have[i])) hits.push(id);
    }
    return hits[0] ?? 'mixed';
  }, IDS);
}

// Puts the section's centre (or the point `frac` of the way to the next section's centre) at mid-viewport.
async function scrollToCentre(page: Page, id: string, nextId?: string, frac = 0.5) {
  await page.evaluate(({ id, nextId, frac }) => {
    const c = (i: string) => { const r = document.getElementById(`stop-${i}`)!.getBoundingClientRect(); return r.top + r.height / 2; };
    const target = nextId ? c(id) + (c(nextId) - c(id)) * frac : c(id);
    scrollBy({ top: target - innerHeight / 2, behavior: 'instant' });
  }, { id, nextId, frac });
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
}

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

test('halfway between two stops is a mix', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#scene:not([hidden])');
  await scrollToCentre(page, 'ms', 'phd', 0.5);
  expect(await sceneOf(page)).toBe('mixed');
});

test('deep link shows its scene at once', async ({ page }) => {
  await page.goto('/#stop-now');
  await page.waitForLoadState('load');
  await page.waitForSelector('#scene:not([hidden])');
  // Which scene the landed position calls for, from the same section centres.
  const expected = () => page.evaluate((ids) => {
    const c = [...document.querySelectorAll('[data-section]')].map((s) => { const r = s.getBoundingClientRect(); return r.top + r.height / 2; });
    const mid = innerHeight / 2;
    let k = 0, t = 0;
    for (let i = 0; i < c.length - 1; i++) { const f = (c[i] - mid) / (c[i] - c[i + 1]); if (f >= 0) { k = i; t = Math.min(1, f); } }
    if (t >= 1) { k += 1; t = 0; }
    return { k, t, id: ids[k], next: ids[k + 1] ?? ids[k] };
  }, IDS);
  const snap = () => page.evaluate(() => {
    const cv = document.getElementById('scene') as HTMLCanvasElement;
    return [...cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data].join(',').length + ':' +
      Array.from(cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data).reduce((h, v, i) => (h * 31 + v + i) | 0, 7);
  });
  await expect.poll(async () => {
    const e = await expected();
    const got = await sceneOf(page);
    if (got === 'hero') return 'hero';
    return e.t === 0 ? got === e.id : got === 'mixed' || got === e.id || got === e.next;
  }).toBe(true);
  expect(await sceneOf(page)).not.toBe('hero');
  const a = await snap();
  await page.waitForTimeout(400);
  expect(await snap()).toBe(a);
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
  expect(await sceneOf(page)).toBe('river');
});

test('reduced motion never mixes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForSelector('#scene:not([hidden])');
  for (const frac of [0.3, 0.45, 0.55, 0.7]) {
    await scrollToCentre(page, 'ms', 'phd', frac);
    expect(['ms', 'phd']).toContain(await sceneOf(page));
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
