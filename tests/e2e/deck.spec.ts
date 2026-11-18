import { test, expect } from '@playwright/test';

const ms = (page: import('@playwright/test').Page) => page.locator('#stop-ms');

test('one card per view and a pager only for multi-card stops', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#stop-srm .pager')).toHaveCount(0);
  await expect(ms(page).locator('.pager [data-go]')).toHaveCount(6);
  const widths = await ms(page).locator('[data-track]').evaluate((t) =>
    [...t.children].map((c) => Math.abs((c as HTMLElement).getBoundingClientRect().width - t.clientWidth)));
  for (const d of widths) expect(d).toBeLessThanOrEqual(1);
});

test('pager click moves the deck, not the page', async ({ page }) => {
  await page.goto('/');
  await ms(page).scrollIntoViewIfNeeded();
  const y = await page.evaluate(() => scrollY);
  await ms(page).locator('[data-go="2"]').click();
  await page.waitForTimeout(800);
  await expect(ms(page).locator('[data-go="2"]')).toHaveAttribute('aria-current', 'true');
  const t = await ms(page).locator('[data-track]').evaluate((e) => [e.scrollLeft, e.clientWidth]);
  expect(Math.abs(t[0] - 2 * t[1])).toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => scrollY)).toBe(y);
});

test('prev and next stop at the ends', async ({ page }) => {
  await page.goto('/');
  await ms(page).scrollIntoViewIfNeeded();
  await expect(ms(page).locator('[data-prev]')).toHaveAttribute('aria-disabled', 'true');
  await expect(ms(page).locator('[data-next]')).not.toHaveAttribute('aria-disabled', 'true');
  await ms(page).locator('[data-go="5"]').dispatchEvent('click');
  await page.waitForTimeout(800);
  await expect(ms(page).locator('[data-next]')).toHaveAttribute('aria-disabled', 'true');
  await expect(ms(page).locator('[data-prev]')).not.toHaveAttribute('aria-disabled', 'true');
  // A click on a button at its end does nothing.
  await ms(page).locator('[data-next]').dispatchEvent('click');
  await page.waitForTimeout(300);
  await expect(ms(page).locator('[data-go="5"]')).toHaveAttribute('aria-current', 'true');
});

test('keyboard focus stays on Next at the last card; Space then leaves the page still', async ({ page }) => {
  await page.goto('/');
  const next = ms(page).locator('[data-next]');
  await next.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('Enter');
  await expect(ms(page).locator('[data-go="5"]')).toHaveAttribute('aria-current', 'true');
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => !!document.activeElement?.closest('[data-deck]'))).toBe(true);
  const y = await page.evaluate(() => scrollY);
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => scrollY)).toBe(y);
  await expect(ms(page).locator('[data-go="5"]')).toHaveAttribute('aria-current', 'true');
});

test('keyboard focus stays on Prev at the first card; Space then leaves the page still', async ({ page }) => {
  await page.goto('/');
  await ms(page).locator('[data-next]').focus();
  await page.keyboard.press('Enter');
  await expect(ms(page).locator('[data-go="1"]')).toHaveAttribute('aria-current', 'true');
  await page.waitForTimeout(800);
  await ms(page).locator('[data-prev]').focus();
  await page.keyboard.press('Enter');
  await expect(ms(page).locator('[data-go="0"]')).toHaveAttribute('aria-current', 'true');
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => document.activeElement?.hasAttribute('data-prev'))).toBe(true);
  const y = await page.evaluate(() => scrollY);
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => scrollY)).toBe(y);
});

test('Next then Prev in quick succession ends back on the first card', async ({ page }) => {
  await page.goto('/');
  await ms(page).scrollIntoViewIfNeeded();
  await ms(page).locator('.pager').evaluate((p) => {
    (p.querySelector('[data-next]') as HTMLElement).click();
    (p.querySelector('[data-prev]') as HTMLElement).click();
  });
  await page.waitForTimeout(900);
  await expect(ms(page).locator('[data-go="0"]')).toHaveAttribute('aria-current', 'true');
  expect(await ms(page).locator('[data-track]').evaluate((t) => t.scrollLeft)).toBeLessThanOrEqual(2);
});

test('each pager is named after its stop', async ({ page }) => {
  await page.goto('/');
  const names = await page.locator('nav.pager').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  expect(names.length).toBeGreaterThan(1);
  expect(new Set(names).size).toBe(names.length);
  const title = (await ms(page).locator('h2').innerText()).trim();
  await expect(ms(page).locator('nav.pager')).toHaveAttribute('aria-label', `${title}: choose a card`);
  await expect(ms(page).locator('nav.pager')).toBeVisible();
});

test('swiping the track moves the current number', async ({ page }) => {
  await page.goto('/');
  await ms(page).scrollIntoViewIfNeeded();
  await ms(page).locator('[data-track]').evaluate((t) => { t.scrollLeft = 4 * t.clientWidth; });
  await page.waitForTimeout(300);
  await expect(ms(page).locator('[data-go="4"]')).toHaveAttribute('aria-current', 'true');
});

test('arrow keys move one card and the pager follows', async ({ page }) => {
  await page.goto('/');
  const track = ms(page).locator('[data-track]');
  await track.focus();
  await page.keyboard.press('ArrowRight');
  await expect(ms(page).locator('[data-go="1"]')).toHaveAttribute('aria-current', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(ms(page).locator('[data-go="2"]')).toHaveAttribute('aria-current', 'true');
  expect(await track.evaluate((e) => getComputedStyle(e).outlineStyle)).not.toBe('none');
});

test('rapid arrow presses each move one card', async ({ page }) => {
  await page.goto('/');
  await ms(page).locator('[data-track]').focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await expect(ms(page).locator('[data-go="3"]')).toHaveAttribute('aria-current', 'true');
});

test('rapid Next clicks each move one card', async ({ page }) => {
  await page.goto('/');
  await ms(page).scrollIntoViewIfNeeded();
  const next = ms(page).locator('[data-next]');
  for (let i = 0; i < 3; i++) await next.dispatchEvent('click');
  await expect(ms(page).locator('[data-go="3"]')).toHaveAttribute('aria-current', 'true');
});

test('a swipe resyncs the target before the next key press', async ({ page }) => {
  await page.goto('/');
  const track = ms(page).locator('[data-track]');
  await track.focus();
  await page.keyboard.press('ArrowRight');
  await expect(ms(page).locator('[data-go="1"]')).toHaveAttribute('aria-current', 'true');
  await track.evaluate((t) => { t.dispatchEvent(new Event('touchstart')); t.scrollLeft = 3 * t.clientWidth; });
  await expect(ms(page).locator('[data-go="3"]')).toHaveAttribute('aria-current', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(ms(page).locator('[data-go="4"]')).toHaveAttribute('aria-current', 'true');
});

test('arrow keys in a focused card link are left to the browser', async ({ page }) => {
  await page.goto('/');
  const link = ms(page).locator('[data-track] a').first();
  await link.focus();
  // The deck must not claim the key: it is never preventDefault()ed by the track handler.
  await page.evaluate(() => {
    (window as any).__prevented = null;
    document.addEventListener('keydown', (e) => { (window as any).__prevented = e.defaultPrevented; });
  });
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => (window as any).__prevented)).toBe(false);
});

test('ArrowLeft at the first card and ArrowRight at the last are not remembered', async ({ page }) => {
  await page.goto('/');
  const track = ms(page).locator('[data-track]');
  await track.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await expect(ms(page).locator('[data-go="1"]')).toHaveAttribute('aria-current', 'true');
  await track.evaluate((t) => { t.scrollLeft = 5 * t.clientWidth; });
  await expect(ms(page).locator('[data-go="5"]')).toHaveAttribute('aria-current', 'true');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await expect(ms(page).locator('[data-go="4"]')).toHaveAttribute('aria-current', 'true');
});

test('focusing a link in an off-screen card brings the pager along', async ({ page }) => {
  await page.goto('/');
  const track = ms(page).locator('[data-track]');
  await track.locator('a').nth(2).focus();
  await expect.poll(async () => track.evaluate((t) => Math.round(t.scrollLeft / t.clientWidth))).toBeGreaterThan(0);
  await expect.poll(async () => {
    const k = await track.evaluate((t) => Math.round(t.scrollLeft / t.clientWidth));
    return ms(page).locator(`[data-go="${k}"]`).getAttribute('aria-current');
  }).toBe('true');
});

test('phone pager fits', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone');
  await page.goto('/');
  const res = await page.locator('.pager').evaluateAll((els) => els.map((p) => {
    const box = p.getBoundingClientRect();
    const btns = [...p.querySelectorAll<HTMLElement>('button')].filter((b) => b.offsetParent !== null);
    return {
      right: box.right, innerWidth,
      overflow: btns.some((b) => { const r = b.getBoundingClientRect(); return r.left < box.left - 0.5 || r.right > box.right + 0.5; }),
    };
  }));
  expect(res.length).toBeGreaterThan(0);
  for (const r of res) {
    expect(r.right).toBeLessThanOrEqual(r.innerWidth);
    expect(r.overflow).toBe(false);
  }
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('every card is in a scrollable track', async ({ page }) => {
    await page.goto('/');
    const rows = await page.locator('[data-card-row]').evaluateAll((els) => els.map((e) => {
      const s = getComputedStyle(e);
      return [s.overflowX, s.scrollSnapType, e.children.length];
    }));
    expect(rows.map((r) => r[2])).toEqual([3, 1, 2, 4, 6, 2, 1]);
    for (const r of rows) expect([r[0], r[1]]).toEqual(['auto', 'x mandatory']);
  });
  test('the pager keeps its space but is not shown', async ({ page }) => {
    await page.goto('/');
    const pagers = await page.locator('nav.pager').evaluateAll((els) =>
      els.map((e) => [getComputedStyle(e).visibility, e.getBoundingClientRect().height > 0]));
    expect(pagers.length).toBeGreaterThan(0);
    for (const p of pagers) expect(p).toEqual(['hidden', true]);
  });
});
