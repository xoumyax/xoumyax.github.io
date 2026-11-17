import { test, expect } from '@playwright/test';
import { checkText } from '../../src/lib/claims';

const H2 = ['Education', 'Technical expertise', 'Experience', 'Selected projects', 'Publications', 'Teaching & talks'];

async function check(page: import('@playwright/test').Page) {
  await page.goto('/resume/');
  const h2 = await page.locator('main h2').allTextContents();
  expect(h2.map((s) => s.trim())).toEqual(H2);

  const dl = page.locator('main').getByRole('link', { name: 'Download resume (PDF)' });
  await expect(dl).toHaveCount(2);
  for (const i of [0, 1]) await expect(dl.nth(i)).toHaveAttribute('href', '/Soumyajyoti_Dutta_Resume.pdf');
  const top = await dl.first().boundingBox();
  const bottom = await dl.last().boundingBox();
  expect(top!.y).toBeLessThan(bottom!.y);

  await expect(page.locator('main').getByRole('link', { name: 'Full CV (PDF)' })).toHaveAttribute('href', '/Soumyajyoti_Dutta_CV.pdf');
  await expect(page.locator('main a[href="mailto:soumyajyotidutta23@gmail.com"]').first()).toBeVisible();

  const text = await page.locator('main').innerText();
  expect(checkText(text, '/resume')).toEqual([]);
  expect(text.length).toBeGreaterThan(500);
}

test('resume page content and links', async ({ page }) => {
  await check(page);
});

test('resume has no horizontal overflow', async ({ page }) => {
  await page.goto('/resume/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('resume renders fully', async ({ page }) => {
    await check(page);
  });
});
