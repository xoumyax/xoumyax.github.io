import { test, expect, type Page } from '@playwright/test';
import { checkText } from '../../src/lib/claims';
import { getProfile, getJourney, getConfig } from '../../src/lib/data';
import { STOP_IDS } from '../../src/lib/schema';

const profile = getProfile();
const journey = getJourney();
const cfg = getConfig();
const plain = (md: string) => md.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');

// Both homes carry the same content: / (Mode II, ASCII: tabs and dropdowns, opened here as a
// visitor would) and /road/ (Mode I, the pixel world: everything stacked).
type Route = '/' | '/road/';

/** On /, shows a stop's tab (when the tabs are live) so its content is on screen. */
async function open(page: Page, route: Route, id: string) {
  if (route !== '/') return;
  const tab = page.locator(`#tab-${id}`);
  if (await tab.isVisible()) await tab.click();
}

async function checkContent(page: Page, route: Route) {
  await page.goto(route);
  const main = page.locator('main');
  const js = await page.evaluate(() => document.documentElement.classList.contains('js'));

  // Identity first.
  await expect(main.locator('h1')).toHaveCount(1);
  await expect(main.locator('h1')).toContainText('Soumyajyoti Dutta');
  await expect(main.getByText(profile.role, { exact: true })).toBeVisible();
  await expect(main.getByText(profile.openToWork, { exact: true })).toBeVisible();
  if (route === '/road/') {
    const firstIsHero = await main.evaluate((m) => m.firstElementChild?.classList.contains('hero') ?? false);
    expect(firstIsHero).toBe(true);
  } else {
    // the identity card comes before the journey, and links out like the river does
    const order = await main.evaluate((m) => {
      const h1 = m.querySelector('h1')!, j = m.querySelector('[data-console]')!;
      return !!(h1.compareDocumentPosition(j) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(order).toBe(true);
    const id = main.locator('.id');
    for (const href of [`mailto:${profile.email}`, profile.github, profile.linkedin, cfg.resumePdf, cfg.cvPdf]) {
      await expect(id.locator(`a[href="${href}"]`)).toBeVisible();
    }
  }

  // Six stops, in order.
  const ids = await main.locator(route === '/' ? 'section.stop-panel' : 'section.stop').evaluateAll((els) => els.map((e) => [e.id, (e as HTMLElement).dataset.stop]));
  expect(ids).toEqual(STOP_IDS.map((id) => [`stop-${id}`, id]));

  // YARAikiba card (on / its steps are a dropdown).
  const yk = main.locator('.yaraikiba');
  if (route === '/') await yk.locator('details summary').click();
  await expect(yk.locator(`a[href="${cfg.yaraikiba.url}"]`).first()).toBeVisible();
  const steps = (await yk.locator('ol > li').allInnerTexts()).map((s) => s.trim());
  expect(steps).toEqual(cfg.yaraikiba.steps.map(plain));
  await expect(yk.locator('ol > li em').first()).toBeVisible();
  await expect(yk.locator('ol > li strong').first()).toBeVisible();

  // Every stop's items. On / the text is gathered as each tab is shown.
  let text = route === '/' ? await main.locator('.idcol').innerText() : '';
  for (const stop of journey.stops) {
    await open(page, route, stop.id);
    const sec = main.locator(`#stop-${stop.id}`);
    await expect(sec.locator('h2')).toContainText(stop.title);
    await expect(sec.locator('h2')).toBeVisible();
    if (route === '/') {
      await expect(sec.getByText(stop.summary, { exact: true })).toBeAttached();
      // every dropdown open in turn, so each card is reachable on screen
      for (const d of await sec.locator('details').all()) {
        if ((await d.getAttribute('open')) === null) await d.locator('summary').click();
        await expect(d.locator('[data-track] > *, ul a').first()).toBeVisible();
        text += '\n' + (await d.innerText());
      }
      if (js) text += '\n' + (await sec.innerText());
    }
    const walk = async (item: (typeof stop.items)[number]) => {
      if (typeof item === 'string') {
        await expect(sec.locator(`.card-row a[href="/projects/${item}/"]`)).toHaveCount(1);
      } else {
        await expect(sec.locator('.card-row').getByText(item.title, { exact: true })).toHaveCount(1);
        await expect(sec.locator('.card-row').getByText(item.text, { exact: true })).toHaveCount(1);
      }
    };
    for (const item of stop.items) await walk(item);
    for (const g of stop.groups ?? []) for (const item of g.items) await walk(item);
    for (const slug of stop.more?.items ?? []) await expect(sec.locator(`[data-more] a[href="/projects/${slug}/"]`)).toHaveCount(1);
    await expect(sec.locator('.card-row')).toHaveCount(stop.groups?.length ?? (stop.items.length ? 1 : 0));
  }

  // The river: contact links, scoped away from the footer.
  await open(page, route, 'river');
  const river = main.locator('#stop-river');
  await expect(river.locator(`a[href="mailto:${profile.email}"]`)).toHaveCount(1);
  await expect(river.locator(`a[href="${profile.github}"]`)).toHaveCount(1);
  await expect(river.locator(`a[href="${profile.linkedin}"]`)).toHaveCount(1);
  await expect(river.locator(`a[href="${cfg.resumePdf}"]`)).toHaveCount(1);
  await expect(river.locator(`a[href="${cfg.cvPdf}"]`)).toHaveCount(1);

  // Card rows scroll horizontally with snap.
  const rows = await main.locator('[data-card-row]').evaluateAll((els) => els.map((e) => {
    const s = getComputedStyle(e);
    return [e.classList.contains('card-row'), s.overflowX, s.scrollSnapType];
  }));
  expect(rows.length).toBe(journey.stops.reduce((n, s) => n + (s.groups?.length ?? (s.items.length ? 1 : 0)), 0));
  for (const r of rows) expect(r).toEqual([true, 'auto', 'x mandatory']);

  // Claims guard.
  if (route === '/road/') text = await main.innerText();
  else if (!js) text += '\n' + (await main.innerText());
  expect(text.length).toBeGreaterThan(1000);
  expect(checkText(text, '/')).toEqual([]);
}

for (const route of ['/', '/road/'] as const) {
  test(`landing content and stops on ${route}`, async ({ page }) => {
    await checkContent(page, route);
  });
}

test('the Ph.D. stop shows three blocks', async ({ page }) => {
  await page.goto('/road/');
  const blocks = page.locator('#stop-phd [data-block]');
  await expect(page.locator('#stop-phd [data-block] > h3')).toHaveText(['Published', 'Finished · awaiting submission', 'In progress']);
  await expect(blocks.nth(0).locator('.pager')).toHaveCount(0);
  await expect(blocks.nth(2).locator('.pager [data-go]')).toHaveCount(4);
});

test('small projects open with the keyboard and every link resolves', async ({ page }) => {
  await page.goto('/road/');
  const more = page.locator('#stop-phd [data-more]');
  await expect(more).not.toHaveAttribute('open', '');
  await more.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(more).toHaveAttribute('open', '');
  const hrefs = await more.locator('a').evaluateAll((els) => els.map((e) => e.getAttribute('href')!));
  expect(hrefs).toHaveLength(7);
  for (const h of hrefs) expect((await page.request.get(h)).status(), h).toBe(200);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  for (const route of ['/', '/road/'] as const) {
    test(`landing renders fully on ${route}`, async ({ page }) => {
      await checkContent(page, route);
    });
  }
});

for (const [w, h] of [[320, 640], [844, 390], [390, 844]] as const) {
  test(`no page overflow at ${w}×${h} on /, on each tab`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/');
    for (const id of STOP_IDS) {
      await page.locator(`#tab-${id}`).click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, id).toBeLessThanOrEqual(0);
    }
  });

  test(`no page overflow at ${w}×${h} on /road/; long rows scroll inside`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/road/');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const rows = await page.locator('[data-card-row]').evaluateAll((els) =>
      els.map((e) => ({ n: e.children.length, sw: e.scrollWidth, cw: e.clientWidth })));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) if (r.n > 1) expect(r.sw).toBeGreaterThan(r.cw);
  });
}

for (const id of STOP_IDS) {
  test(`/road/#stop-${id} lands on its stop`, async ({ page }) => {
    await page.goto(`/road/#stop-${id}`);
    await page.waitForLoadState('load');
    await expect.poll(() => page.evaluate((id) => {
      const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      const top = document.getElementById(`stop-${id}`)!.getBoundingClientRect().top;
      const atEnd = Math.ceil(scrollY + innerHeight) >= document.documentElement.scrollHeight;
      // At the scroll padding, or (for the last stop on a short screen) as far as the page scrolls.
      return Math.abs(top - pad) <= 2 || (atEnd && top >= pad - 2 && top < innerHeight / 2);
    }, id)).toBe(true);
  });
}

test('"Travel the road" goes to the first stop below the intro', async ({ page }) => {
  await page.goto('/road/');
  await expect(page.locator('.hero a.start')).toHaveAttribute('href', '#stop-now');
  await page.locator('.hero a.start').click();
  await expect(page).toHaveURL(/#stop-now$/);
  await expect(page.locator('#stop-now')).toBeInViewport();
});
