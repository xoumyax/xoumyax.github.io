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

test('no JS follows the device setting', async ({ browser }, info) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false, colorScheme: 'dark', baseURL: info.project.use.baseURL });
  const page = await ctx.newPage();
  await page.goto('/resume/');
  expect(luminance(await bg(page))).toBeLessThan(0.2);
  const color = await page.evaluate(() => getComputedStyle(document.body).color);
  expect(luminance(color)).toBeGreaterThan(0.5);
  await expect(page.locator('h1').first()).toBeVisible();
  await ctx.close();
});

// The 28-colour palette shared by every public/scenes PNG (tests/unit/scenes.test.ts asserts all
// files carry the identical PLTE): the only colours the fixed backdrop can show.
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
// filter: brightness(b) saturate(s), as CSS applies them in order
function filtered([r, g, b]: number[], bright: number, sat: number): number[] {
  [r, g, b] = [r, g, b].map((v) => Math.min(255, v * bright));
  const m = [
    [0.213 + 0.787 * sat, 0.715 - 0.715 * sat, 0.072 - 0.072 * sat],
    [0.213 - 0.213 * sat, 0.715 + 0.285 * sat, 0.072 - 0.072 * sat],
    [0.213 - 0.213 * sat, 0.715 - 0.715 * sat, 0.072 + 0.928 * sat],
  ];
  return m.map((row) => Math.min(255, Math.max(0, row[0] * r + row[1] * g + row[2] * b)));
}

type Measured = { count: number; worst: { ratio: number; label: string; seed: number[] } | null; low: [string, number][] };

// Measures every visible text element's contrast. `backdrops` (home only) are the colours the
// fixed scene can show under the page: html/body backgrounds are skipped there because the
// scene paints above them, and each element takes its worst case over every backdrop colour.
async function measure(page: Page, backdrops: number[][]): Promise<Measured> {
  return page.evaluate((backdrops) => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 1;
    const cx = cv.getContext('2d', { willReadFrequently: true })!;
    const parse = (c: string) => {
      cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1);
      const d = cx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    };
    const over = (top: number[], base: number[]) => [0, 1, 2].map((i) => top[i] * top[3] + base[i] * (1 - top[3])).concat(1);
    const mix = (below: number[], x: number[], o: number) => [0, 1, 2].map((i) => below[i] * (1 - o) + x[i] * o).concat(1);
    const lum = (c: number[]) => {
      const [r, g, b] = c.slice(0, 3).map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: number[], b: number[]) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
    const label = (e: Element) => `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : ''} "${(e.textContent ?? '').trim().slice(0, 30)}"`;

    const all = [...document.querySelectorAll('body *')].filter((e) => {
      if (e.closest('.scenes, [data-cover], [aria-hidden="true"], [hidden], script, style, noscript, [aria-disabled="true"]')) return false;
      if (![...e.childNodes].some((n) => n.nodeType === 3 && /\w/.test(n.textContent ?? ''))) return false;
      const st = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      return st.display !== 'none' && st.visibility === 'visible' && r.width > 0 && r.height > 0;
    });
    const out: Measured = { count: all.length, worst: null, low: [] };
    const seeds = backdrops.length ? backdrops.map((c) => [...c, 1]) : [[255, 255, 255, 1]];
    for (const el of all) {
      const chain: Element[] = [];
      for (let e: Element | null = el; e; e = e.parentElement) chain.unshift(e);
      // html/body backgrounds sit below the fixed scene on the home page: skip them there
      const layers = chain
        .map((e) => ({ st: getComputedStyle(e), e }))
        .filter(({ e }) => !(backdrops.length && (e === document.documentElement || e === document.body)));
      const fg0 = parse(layers[layers.length - 1].st.color);
      let worst = Infinity; let worstSeed = seeds[0];
      for (const seed of seeds) {
        // group opacity is exact: each element's subtree is blended onto what is below it
        const pix = (i: number, below: number[], text: boolean): number[] => {
          const { st } = layers[i];
          const o = Number(st.opacity);
          let base = below;
          // an ancestor image is unknown: assume it shows the worst-case backdrop
          if (st.backgroundImage !== 'none' && backdrops.length) base = seed;
          base = over(parse(st.backgroundColor), base);
          const inner = i === layers.length - 1 ? (text ? over(fg0, base) : base) : pix(i + 1, base, text);
          return mix(below, inner, o);
        };
        const r = ratio(pix(0, seed, true), pix(0, seed, false));
        if (r < worst) { worst = r; worstSeed = seed; }
      }
      if (!out.worst || worst < out.worst.ratio) out.worst = { ratio: worst, label: label(el), seed: worstSeed.slice(0, 3).map(Math.round) };
      if (worst < 4.5) out.low.push([label(el), worst]);
    }
    return out;
  }, backdrops);
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
      // measure every visible text element ourselves (see measure()). The home backdrop gets the
      // mode's filter: dark = brightness(.6) saturate(.9), light = none.
      const backdrops = path === '/' ? scenePalette().map((c) => (mode === 'dark' ? filtered(c, 0.6, 0.9) : c)) : [];
      const m = await measure(page, backdrops);
      expect(m.count).toBeGreaterThan(5);
      if (path === '/') console.log(`LOWEST ${mode} /: ${m.worst!.ratio.toFixed(2)} ${m.worst!.label} over backdrop rgb(${m.worst!.seed})`);
      for (const [l, r] of m.low) bad.push(`measured ${l} contrast ${r.toFixed(2)}`);
      expect(bad).toEqual([]);
    });
  }
}

test('the home measurement really uses the backdrop colour', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const onWhite = await measure(page, [[255, 255, 255]]);
  const onBlack = await measure(page, [[0, 0, 0]]);
  expect(onWhite.worst!.ratio).not.toBeCloseTo(onBlack.worst!.ratio, 1);
  const ratios = new Set((await Promise.all(scenePalette().slice(0, 28).map((c) => measure(page, [c])))).map((r) => r.worst!.ratio.toFixed(3)));
  expect(ratios.size).toBeGreaterThan(1);
});

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

test('a stored light choice wins on a dark device', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => localStorage.setItem('mode', 'light'));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');
  expect(luminance(await bg(page))).toBeGreaterThan(0.5);
  await expect(page.locator('#mode-toggle')).toHaveAttribute('aria-pressed', 'false');
});

test('the toggle does not shift the nav when it appears', async ({ page, browser }, info) => {
  const x = (p: typeof page) => p.locator('nav[aria-label="Main"] a', { hasText: 'Resume' }).first().evaluate((e) => e.getBoundingClientRect().x);
  await page.goto('/resume/');
  const withScripts = await x(page);
  const ctx = await browser.newContext({ ...info.project.use, baseURL: info.project.use.baseURL });
  const bare = await ctx.newPage();
  // module scripts blocked: the toggle must already be laid out by the inline head script and CSS
  // (Astro may inline module scripts, so strip them from the HTML as well as aborting fetched ones.)
  await bare.route('**/_astro/**', (r) => (r.request().resourceType() === 'script' ? r.abort() : r.continue()));
  await bare.route('**/resume/', async (r) => {
    const res = await r.fetch();
    const html = (await res.text()).replace(/<script type="module"[\s\S]*?<\/script>/g, '');
    await r.fulfill({ response: res, body: html });
  });
  await bare.goto('/resume/');
  expect(await x(bare)).toBe(withScripts);
  await ctx.close();
});

test('the toggle is hidden on the Personal page, where it would change nothing', async ({ page }) => {
  await page.goto('/personal/');
  await expect(page.locator('#mode-toggle')).toBeHidden();
  await page.goto('/resume/');
  await expect(page.locator('#mode-toggle')).toBeVisible();
});

test('hover text on the project journey link reads in both modes', async ({ page }) => {
  for (const mode of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: mode });
    await page.goto('/projects/autopyara/');
    const link = page.locator('a.journey');
    await link.hover();
    await page.waitForTimeout(500);
    const ratios = await link.evaluate((a) => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 1;
      const cx = cv.getContext('2d', { willReadFrequently: true })!;
      const px = (c: string) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); return [...cx.getImageData(0, 0, 1, 1).data]; };
      const lum = (c: number[]) => { const [r, g, b] = c.slice(0, 3).map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const bgc = px(getComputedStyle(a).backgroundColor);
      return [...a.querySelectorAll('span')].filter((s) => (s.textContent ?? '').trim()).map((s) => {
        const st = getComputedStyle(s);
        const f = px(st.color); const o = Number(st.opacity);
        const fg = [0, 1, 2].map((i) => f[i] * o + bgc[i] * (1 - o));
        const [hi, lo] = [lum(fg), lum(bgc)].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
      });
    });
    for (const r of ratios) expect(r, mode).toBeGreaterThanOrEqual(4.5);
  }
});
