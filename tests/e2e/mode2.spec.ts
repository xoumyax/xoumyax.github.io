// Mode II, the ASCII home at /: the clip backdrop, identity card, journey tabs, dropdowns,
// sliding cards, the scratch card, the art-style switch to /road/ (Mode I), and accessibility.
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { STOP_IDS } from '../../src/lib/schema';
import { STOP_CLIP, STOP_SHORT } from '../../src/lib/mode2';
import { getJourney } from '../../src/lib/data';

const journey = getJourney();
const bg = (page: Page) => page.locator('[data-m2-bg]');
const active = (page: Page) => page.locator('[data-m2-bg] video.on');
const tab = (page: Page, id: string) => page.locator(`#tab-${id}`);

test('/ shows Mode II: a clip backdrop, the identity card and the journey tabs', async ({ page }) => {
  await page.goto('/');
  await expect(bg(page)).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('[data-m2-bg] video')).toHaveCount(2);
  await expect(active(page)).toHaveAttribute('poster', '/mode2/hero.jpg');
  for (const a of ['muted', 'playsinline', 'loop']) await expect(active(page)).toHaveAttribute(a, /.*/);
  const sources = await active(page).locator('source').evaluateAll((s) => s.map((e) => [e.getAttribute('media'), e.getAttribute('src')]));
  expect(sources).toEqual([['(orientation: portrait)', '/mode2/hero-m.mp4'], [null, '/mode2/hero.mp4']]);
  await expect.poll(() => active(page).evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true);
  // only the hero clip loads first
  expect(await page.locator('[data-m2-bg] video:not(.on)').evaluate((v: HTMLVideoElement) => v.currentSrc)).toBe('');

  await expect(page.locator('main h1')).toHaveText('Soumyajyoti Dutta');
  await expect(page.locator('[role="tablist"]')).toBeVisible();
  const tabs = page.locator('[role="tab"]');
  await expect(tabs).toHaveCount(STOP_IDS.length);
  const labels = await tabs.locator('.short').allInnerTexts();
  expect(labels).toEqual(STOP_IDS.map((id) => STOP_SHORT[id]));
  expect(await tabs.locator('.yrs').allInnerTexts()).toEqual(journey.stops.map((s) => s.years));
  await expect(tab(page, 'now')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#stop-now')).toBeVisible();
  await expect(page.locator('#stop-now')).toHaveAttribute('role', 'tabpanel');
  await expect(page.locator('#stop-now')).toHaveAttribute('aria-labelledby', 'tab-now');
  for (const id of STOP_IDS.slice(1)) await expect(page.locator(`#stop-${id}`)).toBeHidden();
});

test('tabs: click, arrow keys, Home/End; the panel, the hash and the clip follow', async ({ page }) => {
  await page.goto('/');
  await tab(page, 'ms').click();
  await expect(tab(page, 'ms')).toHaveAttribute('aria-selected', 'true');
  await expect(tab(page, 'now')).toHaveAttribute('aria-selected', 'false');
  await expect(page.locator('#stop-ms')).toBeVisible();
  await expect(page.locator('#stop-now')).toBeHidden();
  await expect(page).toHaveURL(/\/#stop-ms$/);
  await expect(bg(page)).toHaveAttribute('data-clip', STOP_CLIP.ms);
  await expect(active(page)).toHaveAttribute('src', /\/mode2\/littlebirdy(-m)?\.mp4$/);
  await expect(active(page)).toHaveAttribute('poster', '/mode2/littlebirdy.jpg');

  await page.keyboard.press('ArrowRight');
  await expect(tab(page, 'cognizant')).toBeFocused();
  await expect(tab(page, 'cognizant')).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/#stop-cognizant$/);
  await expect(active(page)).toHaveAttribute('src', /\/mode2\/road(-m)?\.mp4$/);
  await page.keyboard.press('End');
  await expect(tab(page, 'river')).toBeFocused();
  await expect(page.locator('#stop-river')).toBeVisible();
  await page.keyboard.press('ArrowRight'); // wraps
  await expect(tab(page, 'now')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowLeft'); // wraps back
  await expect(tab(page, 'river')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await expect(tab(page, 'now')).toBeFocused();
  await expect(bg(page)).toHaveAttribute('data-clip', STOP_CLIP.now);
  // roving tabindex: only the selected tab is in the Tab order
  expect(await page.locator('[role="tab"][tabindex="0"]').count()).toBe(1);
  await expect.poll(() => active(page).evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true);
});

test('the clip cross-fades: the old one fades out, one clip shows', async ({ page }) => {
  await page.goto('/');
  await tab(page, 'now').click();
  await expect(page.locator('[data-m2-bg] video.on')).toHaveCount(1);
  await expect.poll(() => page.locator('[data-m2-bg] video:not(.on)').evaluate((v) => getComputedStyle(v).opacity)).toBe('0');
  expect(await active(page).evaluate((v) => getComputedStyle(v).transitionDuration)).toBe('0.6s');
});

for (const id of STOP_IDS) {
  test(`/#stop-${id} opens its tab and clip`, async ({ page }) => {
    await page.goto(`/#stop-${id}`);
    await expect(tab(page, id)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator(`#stop-${id}`)).toBeVisible();
    await expect(page.locator(`#stop-${id} h2`)).toBeInViewport();
    await expect(page.locator('[role="tablist"]')).toBeInViewport();
    await expect(bg(page)).toHaveAttribute('data-clip', STOP_CLIP[id]);
    await expect(active(page)).toHaveAttribute('data-clip', STOP_CLIP[id]);
  });
}

test('a deep link never fetches the landing clip', async ({ page }) => {
  const asked: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/mode2/')) asked.push(new URL(r.url()).pathname); });
  await page.goto('/#stop-ms');
  await expect.poll(() => asked.some((u) => /littlebirdy(-m)?\.mp4$/.test(u))).toBe(true);
  expect(asked.filter((u) => u.endsWith('.mp4')).every((u) => u.includes('littlebirdy'))).toBe(true);
});

test('Ph.D. groups are dropdowns, the first open, one open at a time', async ({ page }) => {
  await page.goto('/#stop-phd');
  const groups = page.locator('#stop-phd details[data-block]');
  await expect(groups.locator('> summary .t')).toHaveText(['Published', 'Finished · awaiting submission', 'In progress']);
  await expect(groups.nth(0)).toHaveAttribute('open', '');
  await expect(groups.nth(1)).not.toHaveAttribute('open', '');
  await groups.nth(2).locator('summary').click();
  await expect(groups.nth(2)).toHaveAttribute('open', '');
  await expect(groups.nth(0)).not.toHaveAttribute('open', '');
  await expect(groups.nth(2).locator('[data-track] a')).toHaveCount(4);
  const more = page.locator('#stop-phd details[data-more]');
  await more.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(more).toHaveAttribute('open', '');
  await expect(more.locator('a')).toHaveCount(7);
  for (const a of await more.locator('a').all()) await expect(a).toBeVisible();
});

test('sliding cards move with Next and Previous and say where they are', async ({ page }) => {
  await page.goto('/#stop-ms');
  const s = page.locator('#stop-ms [data-slides]');
  const track = s.locator('[data-track]');
  const pos = s.locator('[data-pos]');
  await expect(s.locator('[data-ctl]')).toBeVisible();
  await expect(pos).toHaveText(/^1(–\d)? \/ 6$/);
  await expect(s.locator('[data-prev]')).toHaveAttribute('aria-disabled', 'true');
  const left = () => track.evaluate((t) => t.scrollLeft);
  await s.locator('[data-next]').click();
  await expect.poll(left).toBeGreaterThan(50);
  await expect(pos).toHaveText(/^2(–\d)? \/ 6$/);
  await expect(s.locator('[data-prev]')).toHaveAttribute('aria-disabled', 'false');
  await s.locator('[data-next]').click();
  await expect(pos).toHaveText(/^3(–\d)? \/ 6$/);
  await s.locator('[data-prev]').click();
  await expect(pos).toHaveText(/^2(–\d)? \/ 6$/);
  // to the end: Next turns off, and the page never scrolled sideways
  for (let i = 0; i < 6 && (await s.locator('[data-next]').getAttribute('aria-disabled')) !== 'true'; i++) {
    await s.locator('[data-next]').click();
    await page.waitForTimeout(450);
  }
  await expect(s.locator('[data-next]')).toHaveAttribute('aria-disabled', 'true');
  await expect(pos).toHaveText(/6 \/ 6$/);
  const r = await track.evaluate((t) => [t.scrollLeft, t.scrollWidth - t.clientWidth]);
  expect(Math.abs(r[0] - r[1])).toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => scrollX)).toBe(0);
  const snap = await track.evaluate((t) => [getComputedStyle(t).overflowX, getComputedStyle(t).scrollSnapType]);
  expect(snap).toEqual(['auto', 'x mandatory']);
});

test('the scratch card reveals with the button, focus moving into it', async ({ page }) => {
  await page.goto('/#stop-river');
  const card = page.locator('#stop-river [data-scratch]');
  const cover = card.locator('[data-scratch-cover]');
  await expect(cover).toBeVisible();
  await expect(card.locator('canvas')).toBeVisible();
  // the content is in the page for screen readers all along
  await expect(card.locator('[data-scratch-body] a[href^="mailto:"]')).toHaveCount(1);
  await expect(page.getByRole('link', { name: /GitHub/ }).last()).toBeAttached();
  await card.locator('[data-reveal]').focus();
  await page.keyboard.press('Enter');
  await expect(cover).toBeHidden();
  await expect(card.locator('[data-reveal]')).toBeHidden();
  await expect(card.locator('[data-scratch-body]')).toBeFocused();
  await expect(card.locator('[data-scratch-body] .summary')).toBeVisible();
});

test('the scratch card clears when scratched past the threshold', async ({ page }, info) => {
  await page.goto('/#stop-river');
  const card = page.locator('#stop-river [data-scratch]');
  const cover = card.locator('[data-scratch-cover]');
  await expect(cover).toHaveClass(/painted/);
  const box = (await cover.boundingBox())!;
  const drag = async (rows: number[]) => {
    if (info.project.name === 'phone') {
      // touch: drive pointer events on the cover (touch-action: none keeps the page still)
      await cover.evaluate((el, rows) => {
        const r = el.getBoundingClientRect();
        const ev = (type: string, x: number, y: number) => el.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: r.left + x, clientY: r.top + y, bubbles: true, isPrimary: true }));
        ev('pointerdown', 4, rows[0]);
        for (const y of rows) for (let x = 4; x <= r.width - 4; x += 12) ev('pointermove', x, y);
        ev('pointerup', r.width - 4, rows[rows.length - 1]);
      }, rows);
    } else {
      await page.mouse.move(box.x + 4, box.y + rows[0]);
      await page.mouse.down();
      for (const y of rows) {
        await page.mouse.move(box.x + 4, box.y + y, { steps: 2 });
        await page.mouse.move(box.x + box.width - 4, box.y + y, { steps: 12 });
      }
      await page.mouse.up();
    }
  };
  // A short scratch is not enough...
  await drag([box.height / 2]);
  await expect(card).toHaveClass(/started/);
  await expect(cover).toBeVisible();
  // ...a thorough one is.
  const rows: number[] = [];
  for (let y = 6; y < box.height; y += 16) rows.push(y);
  await drag(rows);
  await expect(card).toHaveClass(/revealed/);
  await expect(cover).toBeHidden();
});

test('the foil stays opaque when it is repainted at a new size', async ({ page }, info) => {
  await page.goto('/#stop-river');
  const cover = page.locator('#stop-river [data-scratch-cover]');
  await expect(cover).toHaveClass(/painted/);
  const vp = info.project.use.viewport!;
  await page.setViewportSize({ width: Math.round(vp.width * 0.75), height: vp.height });
  await page.waitForTimeout(300);
  const alpha = await cover.locator('canvas').evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let min = 255;
    for (let i = 3; i < d.length; i += 4 * 97) min = Math.min(min, d[i]);
    return [c.width, min];
  });
  expect(alpha[0]).toBeGreaterThan(0);
  expect(alpha[1]).toBe(255);
});

test('keyboard focus on a covered link reveals the card', async ({ page }) => {
  await page.goto('/#stop-river');
  const card = page.locator('#stop-river [data-scratch]');
  await card.locator('[data-scratch-body] a').first().focus();
  await expect(card.locator('[data-scratch-cover]')).toBeHidden();
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('no clip plays, posters show, the scratch card is open', async ({ page }) => {
    const asked: string[] = [];
    page.on('request', (r) => { if (r.url().endsWith('.mp4')) asked.push(r.url()); });
    await page.goto('/');
    await expect(active(page)).toHaveAttribute('poster', '/mode2/hero.jpg');
    await tab(page, 'ms').click();
    await expect(active(page)).toHaveAttribute('poster', '/mode2/littlebirdy.jpg');
    await expect(active(page)).not.toHaveAttribute('src', /.+/);
    await tab(page, 'river').click();
    await page.waitForTimeout(500);
    const playing = await page.locator('[data-m2-bg] video').evaluateAll((vs) => vs.filter((v) => !(v as HTMLVideoElement).paused).length);
    expect(playing).toBe(0);
    expect(asked).toEqual([]);
    await expect(page.locator('#stop-river [data-scratch-cover]')).toBeHidden();
    await expect(page.locator('#stop-river [data-reveal]')).toBeHidden();
    await expect(page.locator('#stop-river [data-scratch-body] .summary')).toBeVisible();
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('every stop is stacked with its heading, the poster stands in for the clip', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[role="tablist"]')).toBeHidden();
    for (const s of journey.stops) {
      await expect(page.locator(`#stop-${s.id}`)).toBeVisible();
      await expect(page.locator(`#stop-${s.id} h2`)).toHaveText(s.title);
    }
    await expect(page.locator('#stop-river [data-scratch-cover]')).toBeHidden();
    await expect(page.locator('#stop-river [data-scratch-body] .summary')).toBeVisible();
    expect(await bg(page).evaluate((e) => getComputedStyle(e).backgroundImage)).toContain('/mode2/hero.jpg');
    expect(await page.locator('[data-m2-bg] video').evaluateAll((vs) => vs.filter((v) => (v as HTMLVideoElement).autoplay).length)).toBe(0);
    await expect(page.locator('[data-ctl]').first()).toBeHidden();
  });
});

test.describe('the art-style switch', () => {
  test('goes to /road/, is remembered across a reload of /, and back', async ({ page }) => {
    await page.goto('/#stop-phd');
    const sw = page.getByRole('group', { name: 'Art style' });
    await expect(sw.getByRole('link', { name: 'ASCII' })).toHaveAttribute('aria-current', 'page');
    await sw.getByRole('link', { name: 'Pixel' }).click();
    await page.waitForURL('**/road/#stop-phd');
    await expect(page.locator('.scenes')).toHaveCount(1);
    expect(await page.evaluate(() => localStorage.getItem('art-style'))).toBe('pixel');
    await expect(page.getByRole('group', { name: 'Art style' }).getByRole('link', { name: 'Pixel' })).toHaveAttribute('aria-current', 'page');

    // / now sends this visitor to /road/, keeping the deep link
    await page.goto('/#stop-ms', { waitUntil: 'commit' });
    await page.waitForURL('**/road/#stop-ms');
    await page.goto('/', { waitUntil: 'commit' });
    await page.waitForURL('**/road/');

    await page.getByRole('group', { name: 'Art style' }).getByRole('link', { name: 'ASCII' }).click();
    await page.waitForURL((u) => u.pathname === '/' && u.search === '');
    await expect(page.locator('[data-m2-bg]')).toHaveCount(1);
    expect(await page.evaluate(() => localStorage.getItem('art-style'))).toBe('ascii');
    await page.reload();
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('?style=ascii clears a stored pixel choice', async ({ page }) => {
    await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('art-style', 'pixel'); sessionStorage.setItem('seeded', '1'); } });
    await page.goto('/?style=ascii#stop-now');
    await expect(page).toHaveURL(/\/#stop-now$/);
    await expect(tab(page, 'now')).toHaveAttribute('aria-selected', 'true');
    expect(await page.evaluate(() => localStorage.getItem('art-style'))).toBe('ascii');
  });

  test('is only on the two home pages', async ({ page }) => {
    await page.goto('/resume/');
    await expect(page.getByRole('group', { name: 'Art style' })).toHaveCount(0);
  });
});

for (const mode of ['light', 'dark'] as const) {
  test(`axe finds nothing on / in ${mode} mode (landing, Ph.D. open, scratch card)`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: mode });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const check = async (what: string) => {
      await page.waitForTimeout(400); // tab colours ease over .2s
      const res = await new AxeBuilder({ page }).exclude('[data-cover]').analyze();
      expect(res.violations.map((v) => `${what}: ${v.id} ${v.nodes.map((n) => `${n.target.join(' ')} (${n.any[0]?.message ?? ''})`).join(', ')}`)).toEqual([]);
    };
    await check('landing');
    await page.locator('[data-yk-steps] summary').click();
    await tab(page, 'phd').click();
    await page.locator('#stop-phd details[data-more] summary').click();
    await check('phd');
    await tab(page, 'river').click();
    await check('river');
  });
}
