import { test, expect } from '@playwright/test';

test('teaching lists courses, talks and valid course links', async ({ page, request }) => {
  await page.goto('/teaching/');
  const text = await page.locator('main').innerText();
  for (const s of ['CSCE 313', 'Fall 2026', 'CSCE 439/704', 'Spring 2026', 'ECEN 325', 'Spring 2023', 'Texas Security Workshop 2026']) {
    expect(text).toContain(s);
  }
  const hrefs = await page.locator('main a[href^="/CSCE-313/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')!));
  expect(hrefs).toContain('/CSCE-313/');
  expect(hrefs.length).toBeGreaterThan(2);
  for (const h of hrefs) {
    const r = await request.get(h);
    expect(r.status(), h).toBe(200);
  }
});

test('study has exactly two external links', async ({ page }) => {
  await page.goto('/study/');
  const links = page.locator('main a[target="_blank"]');
  await expect(links).toHaveCount(2);
  expect(await links.evaluateAll((as) => as.map((a) => a.getAttribute('href')))).toEqual([
    'https://claude.ai/artifact/1gKVHr8ij1e5L5hF1y6zZT',
    'https://www.tensortonic.com/study-plans',
  ]);
  for (let i = 0; i < 2; i++) expect(await links.nth(i).getAttribute('rel')).toContain('noopener');
});
