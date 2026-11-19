import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import type { SceneMeta } from '../../src/lib/world';
import { SEAM_MAX, bandShift, seamJitter, worldAt } from '../../src/lib/world-math';
import { IDS, brokenBlocks, canvasHash, covers, geometry, sceneOf, scrollToCentre, scrollToPan, settle, still, worldsLoaded } from './scene-probe';

const cv = (page: import('@playwright/test').Page) => page.locator('#scene');

test.describe('still', () => {
  test.beforeEach(({ page }) => still(page));

  test('the same scroll position gives the same frame going down and back up', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#scene:not([hidden])');
    await worldsLoaded(page); // a world arriving between the two reads would change the frame
    await scrollToPan(page, 'now', 'phd', 0.5);
    const y = await page.evaluate(() => scrollY);
    const a = await canvasHash(page);
    await scrollToCentre(page, 'river');
    expect(await canvasHash(page)).not.toBe(a);
    await page.evaluate((y) => scrollTo({ top: y, behavior: 'instant' }), y);
    await settle(page);
    expect(await canvasHash(page)).toBe(a);
  });

  test('mid-pan frame has no blank pixels', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#scene:not([hidden])');
    for (const share of [0.25, 0.5, 0.75]) {
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      await scrollToPan(page, 'hero', 'now', share);
      expect(await cv(page).getAttribute('data-next'), String(share)).toBe('now');
      const blank = await page.evaluate(() => {
        const c = document.getElementById('scene') as HTMLCanvasElement;
        const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] !== 255) n++;
        return n;
      });
      expect(blank, String(share)).toBe(0);
    }
  });

  test('a scene whose world fails to load falls back to its flat frame', async ({ page }) => {
    test.skip(!existsSync('public/scenes/phd/scene.json'), 'needs a world for phd (Task 3 on)');
    await page.route('**/scenes/phd/**', (r) => r.abort());
    await page.goto('/');
    await page.waitForSelector('#scene:not([hidden])');
    await scrollToCentre(page, 'phd');
    await expect.poll(() => sceneOf(page)).toBe('phd');
    const transparent = await page.evaluate(() => {
      const c = document.getElementById('scene') as HTMLCanvasElement;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] !== 255) n++;
      return n;
    });
    expect(transparent).toBe(0);
  });

  test('inside the Ph.D. stop the scene moves with scroll, not on its own', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#scene:not([hidden])');
    await scrollToCentre(page, 'phd');
    await expect(cv(page)).toHaveAttribute('data-scene', 'phd');
    const a = await canvasHash(page);
    await page.evaluate(() => scrollBy({ top: 300, behavior: 'instant' }));
    await settle(page);
    await expect(cv(page)).toHaveAttribute('data-scene', 'phd');
    await expect(cv(page)).not.toHaveAttribute('data-next', /.*/);
    // The world loads after first paint; until then the flat frame shows and nothing moves.
    await expect.poll(() => canvasHash(page)).not.toBe(a);
    const b = await canvasHash(page);
    await page.waitForTimeout(400);
    expect(await canvasHash(page)).toBe(b);
  });

  test('opening Small projects keeps scenes on their stops', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#scene:not([hidden])');
    const more = page.locator('[data-more]').first();
    await more.locator('summary').click();
    await expect(more).toHaveAttribute('open', '');
    await scrollToCentre(page, 'ms');
    await expect(cv(page)).toHaveAttribute('data-scene', 'ms');
    await expect(cv(page)).not.toHaveAttribute('data-next', /.*/);
  });

  test('deep link lands settled', async ({ page }) => {
    await page.goto('/#stop-ms');
    await page.waitForLoadState('load');
    await page.waitForSelector('#scene:not([hidden])');
    await expect(cv(page)).toHaveAttribute('data-scene', 'ms');
    await expect(cv(page)).not.toHaveAttribute('data-next', /.*/);
    // A short stop may land with p > 0, so compare frames over time, not with the flat file.
    const a = await canvasHash(page);
    await page.waitForTimeout(400);
    expect(await canvasHash(page)).toBe(a);
  });

  test('rotating mid-pan keeps the scene pair and covers the viewport', async ({ page }, info) => {
    test.skip(info.project.name === 'phone', 'needs a landscape start');
    await page.goto('/');
    await page.waitForSelector('#scene:not([hidden])');
    await scrollToPan(page, 'phd', 'ms', 0.5);
    await expect(cv(page)).toHaveAttribute('data-next', 'ms');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(cv(page)).toHaveAttribute('data-set', 'port');
    expect(await covers(page)).toBe(true);
    // The page reflows, so the pair may change: it must be what worldAt gives for the new layout.
    // One evaluate reads the layout and the attributes together, so they cannot race the reflow.
    await expect.poll(async () => {
      const s = await page.evaluate(() => {
        const inset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
        const anchors = [...document.querySelectorAll('[data-section]')].map((el) => {
          const r = el.getBoundingClientRect();
          return Math.min(r.top + r.height / 2, r.top + innerHeight / 2 - inset);
        });
        const c = document.getElementById('scene')!;
        return {
          anchors, mid: innerHeight / 2, vh: innerHeight,
          remaining: document.documentElement.scrollHeight - innerHeight - scrollY,
          got: { scene: c.getAttribute('data-scene'), next: c.getAttribute('data-next') },
        };
      });
      const w = worldAt(s.anchors, s.mid, s.vh, s.remaining);
      const want = { scene: IDS[w.k], next: w.t > 0 ? IDS[w.k + 1] : null };
      return JSON.stringify(s.got) === JSON.stringify(want) ? 'match' : JSON.stringify({ got: s.got, want });
    }).toBe('match');
  });
});

// Best (dx, dy) in device px that maps strip a onto strip b (b(x, y) ≈ a(x − dx, y − dy)) over the
// middle of the strip, and the share of pixels that still differ at that shift.
const SHIFT = `(a, b, w, h, R, RY) => {
  let best = [0, 0], err = Infinity;
  for (let dy = -RY; dy <= RY; dy++) for (let dx = -R; dx <= R; dx++) {
    let n = 0, bad = 0;
    for (let y = RY; y < h - RY; y += 1) for (let x = R; x < w - R; x += 2) {
      const i = (y * w + x) * 4, j = ((y - dy) * w + (x - dx)) * 4;
      n++;
      if (a[j] !== b[i] || a[j + 1] !== b[i + 1] || a[j + 2] !== b[i + 2]) bad++;
    }
    const e = bad / n;
    if (e < err - 1e-12 || (e === err && Math.abs(dx) + Math.abs(dy) < Math.abs(best[0]) + Math.abs(best[1]))) { err = e; best = [dx, dy]; }
  }
  return { dx: best[0], dy: best[1], err };
}`;

test.describe('still', () => {
  test.beforeEach(({ page }) => still(page));

  test('at rest every block is whole and the frame is the flat file', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#scene:not([hidden])');
    await worldsLoaded(page);
    for (const id of ['now', 'phd', 'river']) {
      await scrollToCentre(page, id);                       // p = 0: every layer on the block grid
      if (id !== 'river') expect(await sceneOf(page), id).toBe(id); // river's last stop has p > 0 at its centre
      expect(await brokenBlocks(page), id).toEqual([]);
    }
    const g = await geometry(page);
    expect(Number.isInteger(g.b)).toBe(true);
  });

  test('inside the Ph.D. stop the near layer drifts a little each step, never a block at once', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#scene:not([hidden])');
    await worldsLoaded(page);
    await scrollToCentre(page, 'phd');
    await page.evaluate(() => scrollBy({ top: 120, behavior: 'instant' }));
    await settle(page);
    const g = await geometry(page);
    // The bottom rows of the view show only the near bank (`fore`, rate 1.4, no act). Still mode:
    // the shown position is the real one, so two frames after a scroll the canvas shows it.
    const rows = Math.round(4 * g.b);
    const steps: { dx: number; dy: number; err: number; scene: string }[] = await page.evaluate(async ({ y0, rows, f }) => {
      const shift = new Function(`return ${f}`)();
      const c = document.getElementById('scene') as HTMLCanvasElement;
      const read = () => c.getContext('2d')!.getImageData(0, y0, c.width, rows).data;
      const two = () => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
      let prev = read();
      const out = [];
      for (let i = 0; i < 60; i++) {
        scrollBy({ top: 4, behavior: 'instant' });
        await two();
        const next = read();
        out.push({ ...shift(prev, next, c.width, rows, 12, 4), scene: c.dataset.scene + (c.dataset.next ?? '') });
        prev = next;
      }
      return out;
    }, { y0: g.h - rows - Math.round(g.b), rows, f: SHIFT });
    const moved = steps.filter((s) => s.dx || s.dy).length;
    const total = steps.reduce((a, s) => a + Math.abs(s.dx), 0);
    const trace = `b=${g.b}: ${moved}/60 steps moved, ${total} device px; dx ${steps.map((s) => s.dx).join(' ')}`;
    for (const s of steps) {
      expect(s.scene).toBe('phd');
      expect(s.err, JSON.stringify(s)).toBeLessThan(0.02);                       // one rigid layer
      expect(Math.max(Math.abs(s.dx), Math.abs(s.dy)), JSON.stringify(s)).toBeLessThanOrEqual(2);
    }
    expect(total, trace).toBeGreaterThan(0.5 * g.b);  // it moved (more than half a block)…
    expect(moved, trace).toBeGreaterThan(total / 2);  // …in small steps, not in a few block-sized ones
  });
});

test('a 20 px scroll mid-pan glides over several frames', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#scene:not([hidden])');
  await worldsLoaded(page);
  await scrollToPan(page, 'phd', 'ms', 0.45);
  await expect(cv(page)).toHaveAttribute('data-next', 'ms');
  const g = await geometry(page);
  const rows = Math.round(3 * g.b);
  const y0 = g.h - rows - Math.round(g.b);
  // One rAF loop reads the bottom strip every frame from the scroll until the follower settles.
  const frames: number[][] = await page.evaluate(async ({ y0, rows }) => {
    const c = document.getElementById('scene') as HTMLCanvasElement;
    const read = () => [...c.getContext('2d')!.getImageData(0, y0, c.width, rows).data];
    const out = [read()];
    scrollBy({ top: 20, behavior: 'instant' });
    for (let i = 0; i < 90; i++) {
      await new Promise((ok) => requestAnimationFrame(ok));
      out.push(read());
      if (i > 3 && !c.hasAttribute('data-follow')) break;
    }
    return out;
  }, { y0, rows });
  const shifts: number[] = await page.evaluate(({ frames, w, h, f }) => {
    const shift = new Function(`return ${f}`)();
    return frames.slice(1).map((b, i) => shift(frames[i], b, w, h, 90, 0).dx);
  }, { frames, w: g.w, h: rows, f: SHIFT });
  const total = shifts.reduce((a, v) => a + Math.abs(v), 0);
  const max = Math.max(...shifts.map(Math.abs));
  const trace = `b=${g.b}: per-frame band shift ${shifts.join(' ')} (total ${total}, max ${max})`;
  expect(total, trace).toBeGreaterThan(2 * g.b);
  expect(shifts.filter((v) => v !== 0).length, trace).toBeGreaterThanOrEqual(5);
  expect(max, trace).toBeLessThanOrEqual(0.3 * total);
});

test('"Travel the road" lands on Now at once, without gliding through the pan', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#scene:not([hidden])');
  await page.evaluate(() => document.fonts.ready);
  const seen = await page.evaluate(async () => {
    const c = document.getElementById('scene')!;
    (document.querySelector('a.start') as HTMLAnchorElement).click();
    const out: string[] = [];
    for (let i = 0; i < 6; i++) {
      await new Promise((ok) => requestAnimationFrame(ok));
      out.push(`${c.dataset.scene}${c.dataset.next ? '>' + c.dataset.next : ''}${c.hasAttribute('data-follow') ? '~' : ''}`);
    }
    return out;
  });
  expect(seen.every((s) => s === 'now'), seen.join(' ')).toBe(true);
});

test('mid-pan at a fractional DPR the seam is as ragged as at DPR 1, with no blank pixels', async ({ browser }, info) => {
  test.skip(info.project.name === 'phone', 'desktop sizes only');
  // The Now → Ph.D. pan, checked on Ph.D.'s nearest band (`fore`, depth 1: nothing of scene
  // k + 1 is drawn over it), at a scroll position where that band has slid a whole number of
  // world px, so both block sizes put its cut on the same block edge. Reads the blocks around the
  // cut in every view row at DPR 1 (b = 7) and 1.25 (b = 8.75): the jitter blocks left of the cut
  // show Ph.D.'s bank at both, not what lies under it.
  const phd = JSON.parse(readFileSync('public/scenes/phd/scene.json', 'utf8')) as SceneMeta;
  const band = phd.layers.length - 1;
  const depth = phd.layers[band].depth;
  const read = async (dpr: number, y?: number) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr, baseURL: info.project.use.baseURL });
    const page = await ctx.newPage();
    await still(page);
    await page.goto('/');
    await page.waitForSelector('#scene:not([hidden])');
    await worldsLoaded(page);
    const L = await page.evaluate(() => {
      const inset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      return {
        anchors: [...document.querySelectorAll('[data-section]')].map((el) => { const r = el.getBoundingClientRect(); return Math.min(r.top + r.height / 2, r.top + innerHeight / 2 - inset) + scrollY; }),
        vh: innerHeight, end: document.documentElement.scrollHeight - innerHeight,
      };
    });
    const at = (y: number) => worldAt(L.anchors.map((a) => a - y), L.vh / 2, L.vh, L.end - y);
    if (y === undefined) {
      let best = Infinity;
      for (let c = 0; c <= L.end; c++) {
        const w = at(c);
        if (w.k !== 1 || w.t <= 0) continue;
        const s = bandShift(w.t, depth) * 240;
        if (s < 60 || s > 180) continue;
        if (Math.abs(s - Math.round(s)) < best) { best = Math.abs(s - Math.round(s)); y = c; }
      }
      expect(best).toBeLessThan(0.04);
    }
    await page.evaluate((y) => scrollTo({ top: y, behavior: 'instant' }), y!);
    await settle(page);
    await expect(cv(page)).toHaveAttribute('data-next', 'phd');
    const cutV = 240 - Math.round(bandShift(at(y!).t, depth) * 240);
    const got = await page.evaluate(({ cutV, SEAM_MAX }) => {
      const c = document.getElementById('scene') as HTMLCanvasElement;
      const b = c.width / 240;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let blank = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] !== 255) blank++;
      const rows: string[][] = [];
      for (let j = 0; j < 135; j++) {
        const row: string[] = [];
        for (let i = cutV - SEAM_MAX - 2; i <= cutV + 1; i++) {
          const k = (Math.floor((j + 0.5) * b) * c.width + Math.floor((i + 0.5) * b)) * 4;
          row.push(`${d[k]},${d[k + 1]},${d[k + 2]}`);
        }
        rows.push(row);
      }
      return { blank, rows };
    }, { cutV, SEAM_MAX });
    await ctx.close();
    return { y: y!, cutV, ...got };
  };
  const one = await read(1);
  const frac = await read(1.25, one.y);
  expect(frac.cutV).toBe(one.cutV);
  expect(one.blank).toBe(0);
  expect(frac.blank).toBe(0);
  let jitter = 0;
  let bad = 0;
  for (let j = 0; j < 135; j++) for (let x = 0; x < one.rows[j].length; x++) {
    const i = one.cutV - SEAM_MAX - 2 + x;
    if (i < one.cutV && i >= one.cutV - seamJitter(j, band)) { jitter++; if (one.rows[j][x] !== frac.rows[j][x]) bad++; }
  }
  expect(jitter).toBeGreaterThan(100);
  expect(bad, `${bad} of ${jitter} jitter blocks differ between DPR 1 and 1.25`).toBeLessThanOrEqual(jitter * 0.02);
});

test('the ambient clock runs and stops with the tab', async ({ page }) => {
  // Count requestAnimationFrame calls (this page's only caller is the backdrop).
  await page.addInitScript(() => {
    const w = window as unknown as { __raf: number };
    w.__raf = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => { w.__raf++; return raf(cb); };
  });
  await page.goto('/');
  await page.waitForLoadState('load');
  await page.waitForSelector('#scene:not([hidden])');
  await page.evaluate(() => document.fonts.ready);
  await expect(cv(page)).toHaveAttribute('data-ambient', 'on');
  const rafs = () => page.evaluate(() => (window as unknown as { __raf: number }).__raf);
  const quiet = async (what: string) => {
    await page.waitForTimeout(200);
    const a = await rafs();
    await page.waitForTimeout(500);
    expect(await rafs(), what).toBe(a);
  };
  // No scene on screen has an act yet, so the enabled clock schedules no frames.
  await quiet('visible, no act on screen');
  const setHidden = (hidden: boolean) => page.evaluate((hidden) => {
    Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  await setHidden(true);
  await expect(cv(page)).toHaveAttribute('data-ambient', 'off');
  await quiet('hidden');
  await setHidden(false);
  await expect(cv(page)).toHaveAttribute('data-ambient', 'on');
});

test('reduced motion: no pan, no ambient', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForSelector('#scene:not([hidden])');
  await expect(cv(page)).toHaveAttribute('data-ambient', 'off');
  await scrollToPan(page, 'phd', 'ms', 0.5);
  expect(['phd', 'ms']).toContain(await sceneOf(page));
  await expect(cv(page)).not.toHaveAttribute('data-next', /.*/);
});

test('no console errors on load and full scroll', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await page.waitForSelector('#scene:not([hidden])');
  await page.evaluate(async () => {
    const end = document.documentElement.scrollHeight - innerHeight;
    for (let y = 0; y <= end; y += innerHeight / 4) {
      scrollTo({ top: y, behavior: 'instant' });
      await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    }
    scrollTo({ top: end, behavior: 'instant' });
  });
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});
