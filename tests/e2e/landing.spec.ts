import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { checkText } from '../../src/lib/claims';
import { getProfile, getJourney, getConfig } from '../../src/lib/data';
import { STOP_IDS } from '../../src/lib/schema';

const profile = getProfile();
const journey = getJourney();
const cfg = getConfig();
const plain = (md: string) => md.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');

async function checkContent(page: Page) {
  await page.goto('/');
  const main = page.locator('main');

  // Hero first.
  await expect(main.locator('h1')).toHaveCount(1);
  await expect(main.locator('h1')).toContainText('Soumyajyoti Dutta');
  await expect(main.getByText(profile.role, { exact: true })).toBeVisible();
  await expect(main.getByText(profile.openToWork, { exact: true })).toBeVisible();
  const firstIsHero = await main.evaluate((m) => m.firstElementChild?.classList.contains('hero') ?? false);
  expect(firstIsHero).toBe(true);

  // Six stops, in order.
  const ids = await main.locator('section.stop').evaluateAll((els) => els.map((e) => [e.id, (e as HTMLElement).dataset.stop]));
  expect(ids).toEqual(STOP_IDS.map((id) => [`stop-${id}`, id]));

  // YARAikiba card.
  const yk = main.locator('.yaraikiba');
  await expect(yk.locator(`a[href="${cfg.yaraikiba.url}"]`).first()).toBeVisible();
  const steps = (await yk.locator('ol > li').allInnerTexts()).map((s) => s.trim());
  expect(steps).toEqual(cfg.yaraikiba.steps.map(plain));
  await expect(yk.locator('ol > li em').first()).toBeVisible();
  await expect(yk.locator('ol > li strong').first()).toBeVisible();

  // Every stop's items.
  for (const stop of journey.stops) {
    const sec = main.locator(`#stop-${stop.id}`);
    await expect(sec.locator('h2')).toContainText(stop.title);
    for (const item of stop.items) {
      if (typeof item === 'string') {
        await expect(sec.locator(`.card-row a[href="/projects/${item}/"]`)).toHaveCount(1);
      } else {
        await expect(sec.locator('.card-row').getByText(item.title, { exact: true })).toHaveCount(1);
        await expect(sec.locator('.card-row').getByText(item.text, { exact: true })).toHaveCount(1);
      }
    }
    await expect(sec.locator('.card-row')).toHaveCount(stop.items.length ? 1 : 0);
  }

  // The river: contact links, scoped away from the footer.
  const river = main.locator('#stop-river');
  await expect(river.locator(`a[href="mailto:${profile.email}"]`)).toHaveCount(1);
  await expect(river.locator(`a[href="${profile.github}"]`)).toHaveCount(1);
  await expect(river.locator(`a[href="${profile.linkedin}"]`)).toHaveCount(1);
  await expect(river.locator(`a[href="${cfg.resumePdf}"]`)).toHaveCount(1);
  await expect(river.locator(`a[href="${cfg.cvPdf}"]`)).toHaveCount(1);

  // World layer contract.
  const layer = page.locator('#world-layer');
  await expect(layer).toHaveAttribute('aria-hidden', 'true');
  const ls = await layer.evaluate((el) => {
    const s = getComputedStyle(el);
    return { position: s.position, pe: s.pointerEvents, z: s.zIndex, bg: s.backgroundImage };
  });
  expect(ls).toMatchObject({ position: 'fixed', pe: 'none' });
  expect(Number(ls.z)).toBeLessThan(0);
  expect(ls.bg).toContain('gradient');
  await expect(layer.locator('canvas#world')).toHaveCount(1);
  await expect(page.locator('#landmarks')).toHaveCount(1);
  expect(await page.locator('#world-layer #landmarks').count()).toBe(0);
  const poster = layer.locator('#world-poster');
  if (await poster.count()) {
    expect(await poster.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  }

  // Card rows scroll horizontally with snap.
  const rows = await main.locator('[data-card-row]').evaluateAll((els) => els.map((e) => {
    const s = getComputedStyle(e);
    return [e.classList.contains('card-row'), s.overflowX, s.scrollSnapType];
  }));
  expect(rows.length).toBe(journey.stops.filter((s) => s.items.length).length);
  for (const r of rows) expect(r).toEqual([true, 'auto', 'x mandatory']);

  // Claims guard.
  const text = await main.innerText();
  expect(checkText(text, '/')).toEqual([]);
}

test('landing content, stops and world layer', async ({ page }) => {
  await checkContent(page);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('landing renders fully', async ({ page }) => {
    await checkContent(page);
  });
});

// Task 11 replaced the `<!-- world:boot -->` marker with the boot script, at the top level just before </Base>.
test('the world boot script sits where the world:boot marker was', () => {
  const src = readFileSync(join(process.cwd(), 'src/pages/index.astro'), 'utf8');
  expect(src).not.toContain('<!-- world:boot -->');
  expect(src).toMatch(/^ {2}<script>\n {4}import \{ boot \} from '\.\.\/world\/boot';\n {4}boot\(\);\n {2}<\/script>\n<\/Base>$/m);
});

for (const [w, h] of [[320, 640], [844, 390], [390, 844]] as const) {
  test(`no page overflow at ${w}×${h}; long rows scroll inside`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const rows = await page.locator('[data-card-row]').evaluateAll((els) =>
      els.map((e) => ({ n: e.children.length, sw: e.scrollWidth, cw: e.clientWidth })));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) if (r.n > 2) expect(r.sw).toBeGreaterThan(r.cw);
  });
}
