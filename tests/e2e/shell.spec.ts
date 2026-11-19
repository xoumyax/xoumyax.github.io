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
