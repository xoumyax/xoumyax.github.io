import { test, expect, type Page } from '@playwright/test';
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

const PAGES = ['/', '/projects/', '/projects/autopyara/', '/resume/', '/teaching/', '/study/', '/404'];
for (const mode of ['light', 'dark'] as const) {
  for (const path of PAGES) {
    test(`${path} reads in ${mode} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: mode });
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const res = await new AxeBuilder({ page })
        .withRules(['color-contrast'])
        .exclude('.scenes')
        .exclude('[data-cover]')
        .analyze();
      const entries = [...res.violations.map((r) => ['violation', r] as const), ...res.incomplete.map((r) => ['incomplete', r] as const)]
        .filter(([, r]) => r.id === 'color-contrast');
      const bad: string[] = [];
      const undecided: string[] = [];
      for (const [kind, r] of entries) {
        for (const n of r.nodes) {
          const msg = n.any[0]?.message ?? '';
          const label = `${kind}: ${n.target.join(' ')} :: ${msg}`;
          if (kind === 'violation') bad.push(label);
          else if (/only non-text characters/.test(msg)) continue; // aria-hidden arrows and glyphs
          else undecided.push(String(n.target[0]));
        }
      }
      // Axe cannot resolve translucent panels over the backdrop or cards that overlap in the
      // scroller. Resolve those ourselves: composite the ancestors' backgrounds, translucent
      // paper included, over the page colour.
      const ratios = await page.evaluate((targets) => {
        const cv = document.createElement('canvas');
        cv.width = cv.height = 1;
        const cx = cv.getContext('2d', { willReadFrequently: true })!;
        const parse = (c: string) => {
          cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1);
          const d = cx.getImageData(0, 0, 1, 1).data;
          return [d[0], d[1], d[2], d[3] / 255];
        };
        const over = (top: number[], base: number[]) => {
          const a = top[3];
          return [0, 1, 2].map((i) => top[i] * a + base[i] * (1 - a)).concat(1);
        };
        const lum = (c: number[]) => {
          const [r, g, b] = c.slice(0, 3).map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        return targets.map((sel) => {
          const el = document.querySelector(sel);
          if (!el) return [sel, 0] as const;
          const chain: Element[] = [];
          for (let e: Element | null = el; e; e = e.parentElement) chain.unshift(e);
          let bg = [255, 255, 255, 1];
          let opacity = 1;
          for (const e of chain) {
            const st = getComputedStyle(e);
            bg = over(parse(st.backgroundColor), bg);
            opacity *= Number(st.opacity);
          }
          const fg0 = parse(getComputedStyle(el).color);
          const fg = over([fg0[0], fg0[1], fg0[2], fg0[3] * opacity], bg);
          const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
          return [sel, (hi + 0.05) / (lo + 0.05)] as const;
        });
      }, undecided);
      for (const [sel, ratio] of ratios) if (ratio < 4.5) bad.push(`resolved ${sel} contrast ${ratio.toFixed(2)}`);
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
