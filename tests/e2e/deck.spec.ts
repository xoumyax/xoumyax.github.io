import { test, expect } from '@playwright/test';

const phd = (page: import('@playwright/test').Page) => page.locator('#stop-phd');

test('one card per view and a pager only for multi-card stops', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#stop-srm .pager')).toHaveCount(0);
  await expect(phd(page).locator('.pager [data-go]')).toHaveCount(9);
  const widths = await phd(page).locator('[data-track]').evaluate((t) =>
    [...t.children].map((c) => Math.abs((c as HTMLElement).getBoundingClientRect().width - t.clientWidth)));
  for (const d of widths) expect(d).toBeLessThanOrEqual(1);
});

test('pager click moves the deck, not the page', async ({ page }) => {
  await page.goto('/');
  await phd(page).scrollIntoViewIfNeeded();
  const y = await page.evaluate(() => scrollY);
  await phd(page).locator('[data-go="2"]').click();
  await page.waitForTimeout(800);
  await expect(phd(page).locator('[data-go="2"]')).toHaveAttribute('aria-current', 'true');
  const t = await phd(page).locator('[data-track]').evaluate((e) => [e.scrollLeft, e.clientWidth]);
  expect(Math.abs(t[0] - 2 * t[1])).toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => scrollY)).toBe(y);
});

test('prev and next stop at the ends', async ({ page }) => {
  await page.goto('/');
  await phd(page).scrollIntoViewIfNeeded();
  await expect(phd(page).locator('[data-prev]')).toBeDisabled();
  await phd(page).locator('[data-go="8"]').dispatchEvent('click');
  await page.waitForTimeout(800);
  await expect(phd(page).locator('[data-next]')).toBeDisabled();
});

test('swiping the track moves the current number', async ({ page }) => {
  await page.goto('/');
  await phd(page).scrollIntoViewIfNeeded();
  await phd(page).locator('[data-track]').evaluate((t) => { t.scrollLeft = 4 * t.clientWidth; });
  await page.waitForTimeout(300);
  await expect(phd(page).locator('[data-go="4"]')).toHaveAttribute('aria-current', 'true');
});

test('arrow keys move one card and the pager follows', async ({ page }) => {
  await page.goto('/');
  const track = phd(page).locator('[data-track]');
  await track.focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(600);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(600);
  await expect(phd(page).locator('[data-go="2"]')).toHaveAttribute('aria-current', 'true');
  expect(await track.evaluate((e) => getComputedStyle(e).outlineStyle)).not.toBe('none');
});

test('rapid arrow presses each move one card', async ({ page }) => {
  await page.goto('/');
  await phd(page).locator('[data-track]').focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await expect(phd(page).locator('[data-go="3"]')).toHaveAttribute('aria-current', 'true');
});

test('rapid Next clicks each move one card', async ({ page }) => {
  await page.goto('/');
  await phd(page).scrollIntoViewIfNeeded();
  const next = phd(page).locator('[data-next]');
  for (let i = 0; i < 3; i++) await next.dispatchEvent('click');
  await expect(phd(page).locator('[data-go="3"]')).toHaveAttribute('aria-current', 'true');
});

test('a swipe resyncs the target before the next key press', async ({ page }) => {
  await page.goto('/');
  const track = phd(page).locator('[data-track]');
  await track.focus();
  await page.keyboard.press('ArrowRight');
  await expect(phd(page).locator('[data-go="1"]')).toHaveAttribute('aria-current', 'true');
  await track.evaluate((t) => { t.dispatchEvent(new Event('touchstart')); t.scrollLeft = 5 * t.clientWidth; });
  await expect(phd(page).locator('[data-go="5"]')).toHaveAttribute('aria-current', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(phd(page).locator('[data-go="6"]')).toHaveAttribute('aria-current', 'true');
});

test('arrow keys in a focused card link are left to the browser', async ({ page }) => {
  await page.goto('/');
  const link = phd(page).locator('[data-track] a').first();
  await link.focus();
  // The deck must not claim the key: it is never preventDefault()ed by the track handler.
  await page.evaluate(() => {
    (window as any).__prevented = null;
    document.addEventListener('keydown', (e) => { (window as any).__prevented = e.defaultPrevented; });
  });
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => (window as any).__prevented)).toBe(false);
});

test('phone pager fits', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone');
  await page.goto('/');
  const res = await page.locator('.pager').evaluateAll((els) => els.map((p) => {
    const nums = [...p.querySelectorAll<HTMLElement>('[data-go]')];
    return {
      right: p.getBoundingClientRect().right, innerWidth,
      total: nums.length, vis: nums.filter((b) => b.offsetParent !== null).length,
    };
  }));
  expect(res.length).toBeGreaterThan(0);
  for (const r of res) {
    expect(r.right).toBeLessThanOrEqual(r.innerWidth);
    // Windowed to five whenever the full row does not fit (a six-card row can still fit).
    if (r.vis < r.total) expect(r.vis).toBeLessThanOrEqual(5);
  }
  expect(res.some((r) => r.vis < r.total)).toBe(true);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('every card is in a scrollable track', async ({ page }) => {
    await page.goto('/');
    const rows = await page.locator('[data-card-row]').evaluateAll((els) => els.map((e) => {
      const s = getComputedStyle(e);
      return [s.overflowX, s.scrollSnapType, e.children.length];
    }));
    expect(rows.map((r) => r[2])).toEqual([1, 2, 6, 9, 8]);
    for (const r of rows) expect([r[0], r[1]]).toEqual(['auto', 'x mandatory']);
  });
});
