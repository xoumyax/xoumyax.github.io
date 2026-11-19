import { test, expect } from '@playwright/test';

const ROUTES = ['/', '/road/', '/resume/', '/projects/', '/teaching/', '/study/', '/personal/'];
const NAV = [
  ['Home', '/'], ['Resume', '/resume/'], ['Projects', '/projects/'],
  ['Personal', '/personal/'], ['Teaching', '/teaching/'], ['Study', '/study/'],
];

for (const route of ROUTES) {
  test(`shell on ${route}`, async ({ page }, info) => {
    const res = await page.goto(route);
    expect(res?.status()).toBe(200);

    const links = page.locator('header nav a');
    const got = await links.evaluateAll((as) => as.map((a) => [a.textContent?.trim(), a.getAttribute('href')]));
    expect(got.slice(0, 6)).toEqual(NAV);
    const pdf = got[6];
    expect(pdf?.[0]).toContain('Resume PDF');
    expect(pdf?.[1]).toBe('/Soumyajyoti_Dutta_Resume.pdf');
    await expect(links.nth(6)).toHaveAttribute('download', /.*/);

    await page.keyboard.press('Tab');
    await expect(page.locator('.skip')).toBeFocused();

    if (info.project.name === 'phone') {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    }
  });
}

test('custom 404 keeps the nav', async ({ page }) => {
  const res = await page.goto('/no-such-page');
  expect(res?.status()).toBe(404);
  await expect(page.locator('header nav a').first()).toHaveText('Home');
  await expect(page.locator('h1')).toContainText(/not found/i);
});

// Phone: the bar's links all fit or scroll into view, and none is ever covered (the sticky PDF
// pill, the art style switch). On the home pages the switch moves into the page on narrow screens.
for (const route of ['/', '/road/', '/resume/']) {
  test(`every top-bar control is reachable and uncovered on a phone at ${route}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(route);
    const items = page.locator('header nav a, header nav button:visible');
    const n = await items.count();
    expect(n).toBeGreaterThanOrEqual(7);
    // the first three links show on arrival, as before the switch existed
    for (let i = 0; i < 3; i++) await expect(items.nth(i)).toBeInViewport({ ratio: 1 });
    for (let i = 0; i < n; i++) {
      const el = items.nth(i);
      const ok = await el.evaluate((e) => {
        e.scrollIntoView({ block: 'nearest', inline: 'center' });
        const r = e.getBoundingClientRect();
        const pts = [[r.left + 2, r.top + r.height / 2], [r.left + r.width / 2, r.top + r.height / 2], [r.right - 2, r.top + r.height / 2]];
        return r.left >= 0 && r.right <= innerWidth && pts.every(([x, y]) => { const t = document.elementFromPoint(x, y); return !!t && (t === e || e.contains(t)); });
      });
      expect(ok, (await el.textContent()) ?? `item ${i}`).toBe(true);
    }
  });
}

test('the pixel home has its own title and points its canonical at /', async ({ page }) => {
  await page.goto('/road/');
  const home = 'Soumyajyoti Dutta';
  await expect(page).toHaveTitle(/Pixel road/);
  expect(await page.title()).not.toBe(home);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://xoumyax.github.io/');
  await page.goto('/');
  await expect(page).toHaveTitle(home);
});
