import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { worldAt } from '../../src/lib/world-math';
import { IDS, canvasHash, covers, sceneOf, scrollToCentre, scrollToPan, settle, still } from './scene-probe';

const cv = (page: import('@playwright/test').Page) => page.locator('#scene');

test.describe('still', () => {
  test.beforeEach(({ page }) => still(page));

  test('the same scroll position gives the same frame going down and back up', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#scene:not([hidden])');
    await scrollToPan(page, 'now', 'phd', 0.5);
    const y = await page.evaluate(() => scrollY);
    const a = await canvasHash(page);
    await scrollToCentre(page, 'river');
    expect(await canvasHash(page)).not.toBe(a);
    await page.evaluate((y) => scrollTo({ top: y, behavior: 'instant' }), y);
    await settle(page);
    expect(await canvasHash(page)).toBe(a);
  });

  test('mid-pan frame has no blank pixels', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#scene:not([hidden])');
    for (const share of [0.25, 0.5, 0.75]) {
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      await scrollToPan(page, 'hero', 'now', share);
      expect(await cv(page).getAttribute('data-next'), String(share)).toBe('now');
      const blank = await page.evaluate(() => {
        const c = document.getElementById('scene') as HTMLCanvasElement;
        const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] !== 255) n++;
        return n;
      });
      expect(blank, String(share)).toBe(0);
    }
  });

  test('a scene whose world fails to load falls back to its flat frame', async ({ page }) => {
    test.skip(!existsSync('public/scenes/phd/scene.json'), 'needs a world for phd (Task 3 on)');
    await page.route('**/scenes/phd/**', (r) => r.abort());
    await page.goto('/');
    await page.waitForSelector('#scene:not([hidden])');
    await scrollToCentre(page, 'phd');
    await expect.poll(() => sceneOf(page)).toBe('phd');
    const transparent = await page.evaluate(() => {
      const c = document.getElementById('scene') as HTMLCanvasElement;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] !== 255) n++;
      return n;
    });
    expect(transparent).toBe(0);
  });

  test('opening Small projects keeps scenes on their stops', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#scene:not([hidden])');
    const more = page.locator('[data-more]').first();
    await more.locator('summary').click();
    await expect(more).toHaveAttribute('open', '');
    await scrollToCentre(page, 'ms');
    await expect(cv(page)).toHaveAttribute('data-scene', 'ms');
    await expect(cv(page)).not.toHaveAttribute('data-next', /.*/);
  });

  test('deep link lands settled', async ({ page }) => {
    await page.goto('/#stop-ms');
    await page.waitForLoadState('load');
    await page.waitForSelector('#scene:not([hidden])');
    await expect(cv(page)).toHaveAttribute('data-scene', 'ms');
    await expect(cv(page)).not.toHaveAttribute('data-next', /.*/);
    // A short stop may land with p > 0, so compare frames over time, not with the flat file.
    const a = await canvasHash(page);
    await page.waitForTimeout(400);
    expect(await canvasHash(page)).toBe(a);
  });

  test('rotating mid-pan keeps the scene pair and covers the viewport', async ({ page }, info) => {
    test.skip(info.project.name === 'phone', 'needs a landscape start');
    await page.goto('/');
    await page.waitForSelector('#scene:not([hidden])');
    await scrollToPan(page, 'phd', 'ms', 0.5);
    await expect(cv(page)).toHaveAttribute('data-next', 'ms');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => cv(page).evaluate((c: HTMLCanvasElement) => [c.width, c.height])).toEqual([120, 214]);
    expect(await covers(page)).toBe(true);
    // The page reflows, so the pair may change: it must be what worldAt gives for the new layout.
    // One evaluate reads the layout and the attributes together, so they cannot race the reflow.
    await expect.poll(async () => {
      const s = await page.evaluate(() => {
        const inset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
        const anchors = [...document.querySelectorAll('[data-section]')].map((el) => {
          const r = el.getBoundingClientRect();
          return Math.min(r.top + r.height / 2, r.top + innerHeight / 2 - inset);
        });
        const c = document.getElementById('scene')!;
        return {
          anchors, mid: innerHeight / 2, vh: innerHeight,
          remaining: document.documentElement.scrollHeight - innerHeight - scrollY,
          got: { scene: c.getAttribute('data-scene'), next: c.getAttribute('data-next') },
        };
      });
      const w = worldAt(s.anchors, s.mid, s.vh, s.remaining);
      const want = { scene: IDS[w.k], next: w.t > 0 ? IDS[w.k + 1] : null };
      return JSON.stringify(s.got) === JSON.stringify(want) ? 'match' : JSON.stringify({ got: s.got, want });
    }).toBe('match');
  });
});

test('the ambient clock runs and stops with the tab', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#scene:not([hidden])');
  await expect(cv(page)).toHaveAttribute('data-ambient', 'on');
  const setHidden = (hidden: boolean) => page.evaluate((hidden) => {
    Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  await setHidden(true);
  await expect(cv(page)).toHaveAttribute('data-ambient', 'off');
  await setHidden(false);
  await expect(cv(page)).toHaveAttribute('data-ambient', 'on');
});

test('reduced motion: no pan, no ambient', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForSelector('#scene:not([hidden])');
  await expect(cv(page)).toHaveAttribute('data-ambient', 'off');
  await scrollToPan(page, 'phd', 'ms', 0.5);
  expect(['phd', 'ms']).toContain(await sceneOf(page));
  await expect(cv(page)).not.toHaveAttribute('data-next', /.*/);
});

test('no console errors on load and full scroll', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await page.waitForSelector('#scene:not([hidden])');
  await page.evaluate(async () => {
    const end = document.documentElement.scrollHeight - innerHeight;
    for (let y = 0; y <= end; y += innerHeight / 4) {
      scrollTo({ top: y, behavior: 'instant' });
      await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    }
    scrollTo({ top: end, behavior: 'instant' });
  });
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});
