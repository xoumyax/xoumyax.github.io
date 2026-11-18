import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';

const bg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const luminance = (css: string) => {
  const [r, g, b] = (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

test('device dark mode applies on first load', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  expect(luminance(await bg(page))).toBeLessThan(0.2);
  await expect(page.locator('#mode-toggle')).toHaveAttribute('aria-pressed', 'true');
});

test('the toggle switches and is remembered', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const toggle = page.locator('#mode-toggle');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  expect(luminance(await bg(page))).toBeLessThan(0.2);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  expect(luminance(await bg(page))).toBeLessThan(0.2);
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');
  expect(await page.evaluate(() => localStorage.getItem('mode'))).toBe('light');
  expect(luminance(await bg(page))).toBeGreaterThan(0.5);
});

test('the stored choice wins over the device setting, across pages', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.locator('#mode-toggle').click();
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/resume/');
  expect(luminance(await bg(page))).toBeLessThan(0.2);
  await expect(page.locator('#mode-toggle')).toHaveAttribute('aria-pressed', 'true');
});

test('no JS follows the device setting', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto('http://localhost:' + (process.env.PORT ?? 4321) + '/resume/');
  expect(luminance(await bg(page))).toBeLessThan(0.2);
  const color = await page.evaluate(() => getComputedStyle(document.body).color);
  expect(luminance(color)).toBeGreaterThan(0.5);
  await expect(page.locator('h1').first()).toBeVisible();
  await ctx.close();
});

// The 28-colour palette shared by every public/scenes PNG: the colours the fixed backdrop can show.
function scenePalette(): number[][] {
  const d = readFileSync('public/scenes/hero.png');
  for (let i = 8; i < d.length; ) {
    const n = d.readUInt32BE(i);
    if (d.toString('latin1', i + 4, i + 8) === 'PLTE') {
      return Array.from({ length: n / 3 }, (_, k) => [...d.subarray(i + 8 + k * 3, i + 11 + k * 3)]);
    }
    i += 12 + n;
  }
  throw new Error('no PLTE in hero.png');
}

const PAGES = ['/', '/projects/', '/projects/autopyara/', '/resume/', '/teaching/', '/study/', '/404'];
for (const mode of ['light', 'dark'] as const) {
  for (const path of PAGES) {
    test(`${path} reads in ${mode} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: mode });
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const bad: string[] = [];

      // 1. axe: any definite violation fails.
      const res = await new AxeBuilder({ page }).withRules(['color-contrast']).exclude('.scenes').exclude('[data-cover]').analyze();
      for (const r of res.violations) for (const n of r.nodes) bad.push(`axe ${n.target.join(' ')} :: ${n.any[0]?.message ?? ''}`);

      // 2. Axe cannot resolve translucent panels, blurred surfaces or overlapping cards, so
      // measure EVERY visible text element ourselves. Surfaces are composited with their
      // opacity; a background-image counts as unknown. On the home page the fixed backdrop sits
      // under the panels, so each element is measured over every scene palette colour (with the
      // mode's backdrop filter) and the worst one must still reach 4.5.
      const dim = mode === 'dark' ? 0.6 : 1;
      const backdrops = path === '/' ? scenePalette().map((c) => c.map((v) => v * dim)) : [];
      const found = await page.evaluate((backdrops) => {
        const cv = document.createElement('canvas');
        cv.width = cv.height = 1;
        const cx = cv.getContext('2d', { willReadFrequently: true })!;
        const parse = (c: string) => {
          cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1);
          const d = cx.getImageData(0, 0, 1, 1).data;
          return [d[0], d[1], d[2], d[3] / 255];
        };
        const over = (top: number[], base: number[]) => [0, 1, 2].map((i) => top[i] * top[3] + base[i] * (1 - top[3])).concat(1);
        const lum = (c: number[]) => {
          const [r, g, b] = c.slice(0, 3).map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const ratio = (a: number[], b: number[]) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
        const label = (e: Element) => `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : ''} "${(e.textContent ?? '').trim().slice(0, 30)}"`;

        const out: [string, number][] = [];
        const all = [...document.querySelectorAll('body *')].filter((e) => {
          if (e.closest('.scenes, [data-cover], [aria-hidden="true"], [hidden], script, style, noscript, [aria-disabled="true"]')) return false;
          if (![...e.childNodes].some((n) => n.nodeType === 3 && /\w/.test(n.textContent ?? ''))) return false;
          const st = getComputedStyle(e);
          const r = e.getBoundingClientRect();
          return st.display !== 'none' && st.visibility === 'visible' && r.width > 0 && r.height > 0;
        });
        for (const el of all) {
          const chain: Element[] = [];
          for (let e: Element | null = el; e; e = e.parentElement) chain.unshift(e);
          const styles = chain.map((e) => getComputedStyle(e));
          const fg0 = parse(styles[styles.length - 1].color);
          const seeds = backdrops.length ? backdrops.map((c) => [...c, 1]) : [[255, 255, 255, 1]];
          let worst = Infinity;
          for (const seed of seeds) {
            let base = seed;
            let opacity = 1;
            chain.forEach((_, i) => {
              const st = styles[i];
              const o = Number(st.opacity);
              const before = base;
              // an ancestor image is unknown: assume it shows the worst-case backdrop
              if (st.backgroundImage !== 'none' && backdrops.length) base = seed;
              base = over(parse(st.backgroundColor), base);
              if (o < 1) base = [0, 1, 2].map((k) => before[k] * (1 - o) + base[k] * o).concat(1);
              opacity *= o;
            });
            const fg = over([fg0[0], fg0[1], fg0[2], fg0[3] * opacity], base);
            worst = Math.min(worst, ratio(fg, base));
          }
          if (worst < 4.5) out.push([label(el), worst]);
        }
        return { out, count: all.length };
      }, backdrops);
      expect(found.count).toBeGreaterThan(5);
      for (const [l, r] of found.out) bad.push(`measured ${l} contrast ${r.toFixed(2)}`);
      expect(bad).toEqual([]);
    });
  }
}

test('the home backdrop is dimmed in dark mode', async ({ page }) => {
  const filter = () => page.evaluate(() => getComputedStyle(document.querySelector('.scenes')!).filter);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const m = (await filter()).match(/brightness\(([\d.]+)\)/);
  expect(m).not.toBeNull();
  expect(Number(m![1])).toBeLessThan(1);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  expect(await filter()).toBe('none');
});

test('the Personal page keeps its night look in both modes', async ({ page }) => {
  const look = async (scheme: 'light' | 'dark') => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/personal/');
    return page.evaluate(() => {
      const s = getComputedStyle(document.body);
      const h = getComputedStyle(document.querySelector('h1')!);
      return [s.backgroundColor, s.color, h.color];
    });
  };
  const light = await look('light');
  const dark = await look('dark');
  expect(dark).toEqual(light);
  expect(luminance(light[0])).toBeLessThan(0.05);
});
