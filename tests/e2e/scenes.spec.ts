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
  await expect.poll(() => sceneOf(page)).toBe('now');
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
