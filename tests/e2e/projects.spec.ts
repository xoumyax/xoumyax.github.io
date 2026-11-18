import { test, expect, type Page } from '@playwright/test';
import { getProjects } from '../../src/lib/data';
import { checkText, check57x, VENUE_ALLOWED } from '../../src/lib/claims';
import { AREAS } from '../../src/lib/schema';
import { getJourney } from '../../src/lib/data';
import { stopForProject } from '../../src/lib/journey';

const projects = await getProjects();
const FILTERS = ['All', 'Post-training & eval', 'Agents', 'Security', 'Systems', 'Other'];
const cards = (page: Page) => page.locator('[data-wall] > li');
const visibleCards = (page: Page) => page.locator('[data-wall] > li:visible');
const mainText = (page: Page) => page.locator('main').evaluate((m) => m.textContent ?? '');

test('content sanity: 18 projects', () => {
  expect(projects).toHaveLength(18);
});

test('wall lists every project, linked to its page', async ({ page }) => {
  await page.goto('/projects/');
  await expect(cards(page)).toHaveCount(projects.length);
  await expect(visibleCards(page)).toHaveCount(projects.length);
  const hrefs = await page.locator('[data-wall] > li a[data-card]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  expect(hrefs.sort()).toEqual(projects.map((p) => `/projects/${p.slug}/`).sort());
  // The h1 is the big headline.
  await expect(page.locator('main h1')).toHaveCount(1);
});

test('filters change the visible set and the URL', async ({ page }) => {
  await page.goto('/projects/');
  const buttons = page.locator('[data-filters] button');
  expect(await buttons.allTextContents()).toEqual(FILTERS);

  for (const [i, area] of AREAS.entries()) {
    await buttons.nth(i + 1).click();
    const want = projects.filter((p) => p.areas.includes(area)).length;
    await expect(visibleCards(page)).toHaveCount(want);
    expect(want).toBeLessThan(projects.length);
    expect(new URL(page.url()).searchParams.get('area')).toBe(area);
    await expect(buttons.nth(i + 1)).toHaveAttribute('aria-pressed', 'true');
  }

  await buttons.nth(0).click();
  await expect(visibleCards(page)).toHaveCount(projects.length);
  expect(new URL(page.url()).searchParams.has('area')).toBe(false);
  await expect(buttons.nth(0)).toHaveAttribute('aria-pressed', 'true');
});

test('?area= pre-applies the filter; unknown areas fall back to All', async ({ page }) => {
  await page.goto('/projects/?area=security');
  await expect(visibleCards(page)).toHaveCount(projects.filter((p) => p.areas.includes('security')).length);
  await expect(page.locator('[data-filters] button', { hasText: 'Security' })).toHaveAttribute('aria-pressed', 'true');

  await page.goto('/projects/?area=nonsense');
  await expect(visibleCards(page)).toHaveCount(projects.length);
});

test('with JS off, every card shows', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await ctx.newPage();
  await page.goto('/projects/?area=security');
  await expect(visibleCards(page)).toHaveCount(projects.length);
  await ctx.close();
});

test('cards tilt at rest on desktop', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop control for the reduced-motion test');
  await page.goto('/projects/');
  const t = await page.locator('[data-wall] a[data-card]').first().evaluate((el) => getComputedStyle(el).transform);
  expect(t).not.toBe('none');
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('no card transforms, at rest or after hover', async ({ page }, info) => {
    test.skip(info.project.name === 'phone', 'hover is a desktop concern');
    await page.goto('/projects/');
    const n = await cards(page).count();
    expect(n).toBe(projects.length);
    for (let i = 0; i < n; i++) {
      const card = page.locator('[data-wall] a[data-card]').nth(i);
      await card.hover();
      const transforms = await card.evaluate((el) =>
        [el, ...el.querySelectorAll('*')].map((e) => getComputedStyle(e).transform).filter((t) => t !== 'none'),
      );
      expect(transforms, `card ${i}`).toEqual([]);
    }
  });
});

test('wall text passes the claims guard', async ({ page }) => {
  await page.goto('/projects/');
  const text = await mainText(page);
  expect(checkText(text, '/projects')).toEqual([]);
  expect(check57x(text)).toEqual([]);
  for (const p of projects) if (p.venue) expect(text).not.toContain(p.venue);
});

test('only autopyara and iocscooper-plus-plus set a venue', () => {
  expect(projects.filter((p) => p.venue).map((p) => p.slug).sort()).toEqual([...VENUE_ALLOWED].sort());
});

for (const p of projects) {
  test(`detail page /projects/${p.slug}`, async ({ page, request }) => {
    const path = `/projects/${p.slug}`;
    expect((await request.get(path)).status()).toBe(200);
    await page.goto(path);
    await expect(page.locator('main h1')).toHaveCount(1);
    await expect(page.locator('main h1')).toHaveText(p.title);

    const text = await mainText(page);
    expect(checkText(text, path)).toEqual([]);
    expect(check57x(text)).toEqual([]);

    // Venue appears only where the project sets one.
    const venues = page.locator('[data-venue]');
    if (p.venue) {
      await expect(venues).toHaveCount(1);
      await expect(venues).toHaveText(p.venue);
    } else {
      await expect(venues).toHaveCount(0);
      for (const q of projects) if (q.venue) expect(text).not.toContain(q.venue);
    }

    for (const s of p.sponsors) expect(text).toContain(s);
    for (const m of p.metrics) expect(text).toContain(m.value);
    for (const l of p.links) await expect(page.locator(`main a[href="${l.href}"]`).first()).toBeVisible();
    for (const h of ['Problem', 'Approach', 'Results']) await expect(page.locator('main h2', { hasText: h }).first()).toBeVisible();

    // the link goes to the stop that lists the project, which really shows it
    const stopId = stopForProject(getJourney(), p.slug) ?? p.stop;
    const journey = page.locator('main a[href="/#stop-' + stopId + '"]');
    await expect(journey).toHaveCount(1);
    await expect(journey).toContainText('On the journey');
  });
}

test('/projects/yaragen shows both sponsors', async ({ page }) => {
  await page.goto('/projects/yaragen/');
  const text = await mainText(page);
  expect(text).toContain('LPS (UMD)');
  expect(text).toContain('Booz Allen Hamilton');
});

test('detail page has no horizontal overflow on a phone', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'phone only');
  for (const path of ['/projects/', '/projects/yaragen/', '/projects/iocscooper-plus-plus/']) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
