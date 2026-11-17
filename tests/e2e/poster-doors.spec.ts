import { test, expect, type Page } from '@playwright/test';

// The landing page's poster fallback (no GPU needed): every landmark door stays reachable.
// Runs in `desktop` (1440×900) and `phone` (390×844) under reduced motion, and in `nowebgl`.
// A door is a pin on the poster when its landmark is on the image and clear of content, otherwise
// a link in the world bar's Explore list; either way all five are one Tab away, uncovered.

const NAMES = [
  'Study — trailhead', 'Resume — ranger station', 'Teaching — adobe schoolhouse',
  'Projects — trailer camp', 'Personal — geodesic dome',
].sort();

/** Tab on until focus leaves the doors and the world bar; returns the door names met. */
async function tabThroughDoors(page: Page) {
  const names: string[] = [];
  let entered = false;
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      if (!a || a === document.body) return null;
      // the centre of the focused element, as drawn (a door's tag is open while it has focus)
      const r = a.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return {
        inDoors: !!a.closest('#landmarks, #world-ui'), inJourney: !!a.closest('.journey'),
        name: a.getAttribute('aria-label') ?? '', href: a.getAttribute('href'),
        uncovered: !!top && a.contains(top), outline: getComputedStyle(a).outlineStyle,
        cover: `${top?.tagName}.${top?.className} box ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)} ${a.className}`,
      };
    });
    if (!f) continue;
    if (f.inDoors) {
      entered = true;
      if (f.href) names.push(f.name);
      expect(f.uncovered, `${f.name} is focused under ${f.cover}`).toBe(true);
      expect(f.outline).not.toBe('none');
    } else if (entered || f.inJourney) break;
  }
  return names.sort();
}

/** Every shown focusable in the doors and the world bar has its centre uncovered. */
const allUncovered = (page: Page) => page.evaluate(() => {
  const bad: string[] = [];
  for (const el of document.querySelectorAll<HTMLElement>('#landmarks a, #landmarks button, #world-ui a, #world-ui button')) {
    if (!el.checkVisibility()) continue;
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    if (!top || !el.contains(top)) bad.push(`${el.getAttribute('aria-label')} under ${top?.tagName}.${top?.className}`);
  }
  return bad;
});

async function checkPosterDoors(page: Page) {
  // the poster's landmark table has been applied (doors move from the list onto the poster)
  await page.waitForFunction(() => document.documentElement.dataset.worldDoors === 'placed');
  // From the top of the page.
  expect(await tabThroughDoors(page)).toEqual(NAMES);
  // Down the page: at every step all five are still reachable and nothing focusable is covered.
  const H = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  const step = await page.evaluate(() => Math.round(innerHeight / 2));
  for (let y = 0; y <= H; y += step) {
    await page.evaluate((y) => scrollTo({ top: y, behavior: 'instant' }), y);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await allUncovered(page), `at scrollY ${y}`).toEqual([]);
    const reach = await page.evaluate(() => {
      const shown = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)].filter((e) => e.checkVisibility()).map((e) => e.getAttribute('aria-label'));
      return [...shown('#landmarks a.lm'), ...shown('#world-ui a.lm-x')].sort();
    });
    expect(reach, `at scrollY ${y}`).toEqual(NAMES);
  }
  // Tab from the end of the hero, mid-page, without scrolling.
  await page.evaluate((y) => scrollTo({ top: y, behavior: 'instant' }), Math.round(H / 2));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); // doors re-placed
  await page.evaluate(() => {
    const els = [...document.querySelectorAll<HTMLElement>('.hero a, .hero button')];
    els[els.length - 1].focus({ preventScroll: true });
  });
  expect(await tabThroughDoors(page)).toEqual(NAMES);
}

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('the poster keeps all five doors reachable by Tab, never under content', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => document.documentElement.dataset.world === 'poster:reduced-motion');
    await expect(page.locator('#world-poster')).toBeVisible();
    await expect(page.locator('#world')).toBeHidden();
    await expect(page.locator('#world-ui .world-view')).toBeHidden();
    await expect(page.locator('#landmarks a.lm')).toHaveCount(5);
    await expect(page.locator('#world-ui a.lm-x')).toHaveCount(5);
    await checkPosterDoors(page);
  });
});

test.describe('reduced motion: touch and compositing', () => {
  test.use({ reducedMotion: 'reduce' });

  test('touch targets: Explore links are ≥ 44 px tall, and a pin takes taps 20 px from its centre (M16)', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => document.documentElement.dataset.worldDoors === 'placed');
    const r = await page.evaluate(() => {
      const links = [...document.querySelectorAll<HTMLElement>('#world-ui a.lm-x')].filter((e) => e.checkVisibility());
      const pins = [...document.querySelectorAll<HTMLElement>('#landmarks a.lm')].filter((e) => e.checkVisibility());
      const hits = pins.map((a) => {
        const p = a.querySelector('.lm-pin')!.getBoundingClientRect();
        const cx = p.x + p.width / 2, cy = p.y + p.height / 2;
        // straight above and below the 22 px pin, outside it but inside the 44 px hit area
        return [cy - 20, cy + 20].every((y) => { const t = document.elementFromPoint(cx, y); return !t || a.contains(t) || !!t.closest('[data-panel], [data-card-row], footer, header, #world-ui'); });
      });
      return { heights: links.map((e) => e.getBoundingClientRect().height), hits, pins: pins.length };
    });
    for (const h of r.heights) expect(h).toBeGreaterThanOrEqual(44);
    expect(r.hits.every(Boolean)).toBe(true);
    expect(r.pins + r.heights.length).toBeGreaterThan(0);
  });

  test('over the poster on a touch device no surface keeps a backdrop blur; a mouse keeps it (I5)', async ({ page }, info) => {
    await page.goto('/');
    await page.waitForFunction(() => document.documentElement.dataset.world === 'poster:reduced-motion');
    const r = await page.evaluate(() => {
      const bf = (sel: string) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).backdropFilter : 'missing'; };
      return { coarse: matchMedia('(pointer: coarse)').matches, panel: bf('[data-panel]'), topbar: bf('.topbar'), footer: bf('.footer'), explore: bf('#world-ui .world-explore') };
    });
    if (info.project.name === 'phone') {
      expect(r).toEqual({ coarse: true, panel: 'none', topbar: 'none', footer: 'none', explore: 'none' });
    } else {
      expect(r.coarse).toBe(false);
      expect(r.panel).toContain('blur');
    }
  });
});

test('no WebGL: the poster shows, all five doors are reachable, and the console stays clean @nowebgl', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await page.waitForFunction(() => document.documentElement.dataset.world?.startsWith('poster'), null, { timeout: 30_000 });
  expect(await page.evaluate(() => document.documentElement.dataset.world)).toBe('poster:no-webgl');
  await expect(page.locator('#world-poster')).toBeVisible();
  await expect(page.locator('#world')).toBeHidden();
  await expect(page.locator('#world-touch')).toHaveCount(0);
  await checkPosterDoors(page);
  expect(errors).toEqual([]);
});
