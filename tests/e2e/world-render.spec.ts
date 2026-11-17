import { test, expect, type Page } from '@playwright/test';

// Every world test passes governor=off and an explicit tier (URL contract, Task 10).
const Q = 'governor=off&tier=medium';
// One page at a time: several GPU pages in parallel starve each other's main threads and skew the long-task budget.
test.describe.configure({ mode: 'default', timeout: 90_000 });

async function mount(page: Page, extra = '') {
  // Installed before any page script, so the mount's long tasks are all seen.
  await page.addInitScript(() => {
    const w = window as unknown as { __lt: number[] };
    w.__lt = [];
    try {
      new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__lt.push(e.duration))).observe({ type: 'longtask', buffered: true });
    } catch { /* longtask unsupported */ }
  });
  await page.goto(`/world-test/?${Q}${extra}`);
  await page.waitForFunction(() => document.documentElement.dataset.world === 'ready' || document.documentElement.dataset.world?.startsWith('error'), null, { timeout: 60_000 });
  expect(await page.evaluate(() => document.documentElement.dataset.world)).toBe('ready');
  // a few real frames after the first one
  await page.evaluate(() => new Promise<void>((r) => { let n = 0; const f = () => (++n > 6 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }));
}

interface Stats { centreStd: number; hf: { top: number; centre: number; bottom: number }; ridgeCols: number }

// Decode a screenshot in the page and measure it there (no PNG decoder in Node).
async function measure(page: Page): Promise<Stats> {
  const png = (await page.screenshot()).toString('base64');
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d')!; x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, W, H).data;
    const L = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) L[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    // high-frequency energy: mean absolute neighbour difference within a row band
    const hf = (y0: number, y1: number) => {
      let s = 0, n = 0;
      for (let y = Math.floor(y0 * H); y < Math.floor(y1 * H) - 1; y++) for (let xx = 0; xx < W - 1; xx++) {
        const i = y * W + xx; s += Math.abs(L[i + 1] - L[i]) + Math.abs(L[i + W] - L[i]); n++;
      }
      return s / n;
    };
    let m = 0, m2 = 0, n = 0;
    for (let y = Math.floor(0.4 * H); y < Math.floor(0.6 * H); y++) for (let xx = 0; xx < W; xx++) { const v = L[y * W + xx]; m += v; m2 += v * v; n++; }
    m /= n;
    const centreStd = Math.sqrt(m2 / n - m * m);
    // Ridgeline: a row-wise luminance step somewhere in the top 25%, column by column.
    // Columns are averaged over 16 px so single glyphs do not count; the step is taken over 14 px.
    const step = 14, win = 16, yMax = Math.floor(0.25 * H);
    let edgeCols = 0, cols = 0;
    for (let x0 = 0; x0 + win <= W; x0 += win) {
      const prof: number[] = [];
      for (let y = 0; y < yMax; y++) { let s = 0; for (let xx = x0; xx < x0 + win; xx++) s += L[y * W + xx]; prof.push(s / win); }
      let best = 0;
      for (let y = 0; y + step < yMax; y++) best = Math.max(best, Math.abs(prof[y] - prof[y + step]));
      cols++; if (best >= 22) edgeCols++;
    }
    return { centreStd, hf: { top: hf(0, 0.15), centre: hf(0.42, 0.58), bottom: hf(0.85, 1) }, ridgeCols: edgeCols / cols };
  }, png);
}

test('the world renders: a varied sharp centre, blurred top and bottom bands', async ({ page }) => {
  await mount(page, '&u=0.5&t=8');
  const s = await measure(page);
  expect(s.centreStd).toBeGreaterThan(12);
  expect(s.hf.top).toBeLessThan(0.6 * s.hf.centre);
  expect(s.hf.bottom).toBeLessThan(0.6 * s.hf.centre);
});

test('at u=0 the top band holds a ridgeline', async ({ page }) => {
  await mount(page, '&u=0&t=8');
  const s = await measure(page);
  expect(s.ridgeCols).toBeGreaterThanOrEqual(0.6);
});

test('landmark positions and stop order', async ({ page }) => {
  await mount(page, '&u=0.5&t=8');
  const r = await page.evaluate(() => {
    const ctl = (window as unknown as { __worldCtl: import('../../src/world/index').WorldController }).__worldCtl;
    const pos = ctl.landmarkScreenPositions();
    const us = (['srm', 'cognizant', 'ms', 'phd', 'now', 'river'] as const).map((id) => ctl.journeyForStop(id));
    return { ids: Object.keys(pos).sort(), sample: Object.values(pos), us, tier: ctl.tier };
  });
  expect(r.ids).toEqual(['dome', 'ranger', 'school', 'trailer', 'trailhead']);
  for (const p of r.sample) { expect(Number.isFinite(p.x)).toBe(true); expect(Number.isFinite(p.y)).toBe(true); }
  expect(r.sample.some((p) => p.visible)).toBe(true);
  for (let i = 1; i < r.us.length; i++) expect(r.us[i]).toBeGreaterThan(r.us[i - 1]);
  expect(r.us[0]).toBeGreaterThanOrEqual(0);
  expect(r.us[5]).toBeLessThanOrEqual(1);
  expect(r.tier).toBe('medium');
});

test('mounting keeps main-thread long tasks under 200 ms (the bake runs in a worker)', async ({ page }) => {
  await mount(page, '&u=0.5');
  const lt = await page.evaluate(() => (window as unknown as { __lt: number[] }).__lt);
  expect(Math.max(0, ...lt)).toBeLessThan(200);
});

test('/world-test is noindex', async ({ page }) => {
  const res = await page.goto(`/world-test/?${Q}`);
  expect(res?.status()).toBe(200);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
});

type Ctl = import('../../src/world/index').WorldController;
type Pos = Record<string, { x: number; y: number; visible: boolean }>;
interface W { __worldCtl: Ctl; __world?: { frames: number; memory?: { geometries: number; textures: number } } }
const frames = (page: Page) => page.evaluate(() => (window as unknown as W).__world!.frames);

test('landmarkScreenPositions() is current right after a jump, even while paused (M4)', async ({ page }) => {
  await mount(page, '&debug=1&u=0&t=8');
  const r = await page.evaluate(async () => {
    const ctl = (window as unknown as W).__worldCtl;
    ctl.pause();
    ctl.jumpJourney(0); const a = ctl.landmarkScreenPositions();
    ctl.jumpJourney(0.5); const b = ctl.landmarkScreenPositions();
    ctl.resume();
    await new Promise<void>((res) => { let n = 0; const f = () => (++n > 8 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    return { a: a.dome, b: b.dome, c: ctl.landmarkScreenPositions().dome };
  });
  expect(Math.hypot(r.b.x - r.c.x, r.b.y - r.c.y)).toBeLessThan(1);
  expect(Math.hypot(r.a.x - r.b.x, r.a.y - r.b.y)).toBeGreaterThan(20);
});

test('a hidden tab pauses the loop; visible resumes it, but not a caller\'s pause (M6)', async ({ page }) => {
  await mount(page, '&debug=1&u=0.5&t=8');
  const setHidden = (h: boolean) => page.evaluate((hh) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hh });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hh ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, h);
  await setHidden(true);
  const f0 = await frames(page); await page.waitForTimeout(400);
  expect(await frames(page)).toBe(f0);
  await setHidden(false);
  await page.waitForTimeout(400);
  const f1 = await frames(page);
  expect(f1).toBeGreaterThan(f0);
  // the caller paused: showing the tab again must not restart it
  await page.evaluate(() => (window as unknown as W).__worldCtl.pause());
  await setHidden(true); await setHidden(false);
  const f2 = await frames(page); await page.waitForTimeout(400);
  expect(await frames(page)).toBe(f2);
});

// Each stop's landmark sits right of the stop panel on desktop (right-hand ~55%) and is centred on phones,
// whole, in the clear middle band (the tilt blur is negligible between 25% and 75% of the height).
// Checked over the camera's sway (t across its 32 s yaw period, and t = 36 for the low point of the pitch) with the anchor (landmarkScreenPositions) and
// with the extent of the landmark's whole projected geometry (debug: __world.footprints, filled by that same call).
const STOP_LM = [['srm', 'trailhead'], ['cognizant', 'ranger'], ['ms', 'school'], ['phd', 'trailer'], ['now', 'dome']] as const;
type Box = { x0: number; y0: number; x1: number; y1: number };
for (const [vw, vh, label] of [[1440, 900, 'desktop'], [390, 844, 'phone']] as const) {
  test(`the current stop's landmark is framed for the ${label} layout`, async ({ page }) => {
    await page.setViewportSize({ width: vw, height: vh });
    const bad: string[] = [];
    for (const t of [0, 8, 16, 24, 36]) {
      await mount(page, `&debug=1&t=${t}`);
      for (const [stop, id] of STOP_LM) {
        const p = await page.evaluate(async ([s, i]) => {
          const w = window as unknown as W & { __world?: { footprints?: Record<string, Box> } };
          const ctl = w.__worldCtl;
          ctl.jumpJourney(ctl.journeyForStop(s as 'srm'));
          await new Promise<void>((res) => { let n = 0; const f = () => (++n > 4 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
          const q = (ctl.landmarkScreenPositions() as Pos)[i];
          const b = w.__world?.footprints?.[i] ?? null;
          const W_ = innerWidth, H_ = innerHeight;
          return { fx: q.x / W_, fy: q.y / H_, visible: q.visible, box: b && { x0: b.x0 / W_, x1: b.x1 / W_, y0: b.y0 / H_, y1: b.y1 / H_ } };
        }, [stop, id] as const);
        const tag = `t=${t} ${stop}/${id} anchor (${p.fx.toFixed(2)}, ${p.fy.toFixed(2)})`;
        if (!p.visible) bad.push(`${tag} not visible`);
        if (label === 'desktop' ? p.fx < 0.45 : Math.abs(p.fx - 0.5) >= 0.15) bad.push(`${tag} x out of range`);
        if (p.fy < 0.25 || p.fy > 0.75) bad.push(`${tag} y out of the clear band`);
        if (!p.box) { bad.push(`${tag} no footprint`); continue; }
        const b = p.box, bt = `${tag} box x ${b.x0.toFixed(2)}..${b.x1.toFixed(2)} y ${b.y0.toFixed(2)}..${b.y1.toFixed(2)}`;
        if (b.x0 < 0 || b.x1 > 1) bad.push(`${bt} not fully on screen`);
        if (b.y0 < 0.25 || b.y1 > 0.75) bad.push(`${bt} not inside the clear band`);
        if (label === 'desktop' && b.x0 < 0.4) bad.push(`${bt} reaches into the panel side`);
      }
    }
    expect(bad).toEqual([]);
  });
}

test('landmarkScreenPositions(into) refills the caller\'s object, with the same values as a fresh call (M6)', async ({ page }) => {
  await mount(page, '&debug=1&u=0.3&t=8');
  const r = await page.evaluate(() => {
    const ctl = (window as unknown as W).__worldCtl;
    const into = {} as ReturnType<Ctl['landmarkScreenPositions']>;
    const a = ctl.landmarkScreenPositions(into), dome = a.dome;
    ctl.jumpJourney(0.5);
    const b = ctl.landmarkScreenPositions(into), fresh = ctl.landmarkScreenPositions();
    return { same: a === into && b === into, kept: b.dome === dome, fresh: fresh !== into, dx: Math.abs(fresh.dome.x - b.dome.x), dy: Math.abs(fresh.dome.y - b.dome.y) };
  });
  expect(r).toEqual({ same: true, kept: true, fresh: true, dx: 0, dy: 0 });
});

// I8: boot's timeout and the poster abort a mount in flight; the engine stops and releases everything.
for (const [mark, phase] of [['world:start', 'the bake'], ['world:baked', 'the build and shader compile']] as const) {
  test(`an abort during ${phase} rejects the mount and releases the context (I8)`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`/world-test/?${Q}&debug=1&abort=${mark}`);
    await page.waitForFunction(() => /^(ready|aborted|error)/.test(document.documentElement.dataset.world ?? ''), null, { timeout: 60_000 });
    await page.waitForTimeout(500); // anything the aborted mount might still have done
    const r = await page.evaluate(() => {
      const gl = (document.getElementById('world') as HTMLCanvasElement).getContext('webgl2');
      return {
        state: document.documentElement.dataset.world?.split(':')[0], lost: gl ? gl.isContextLost() : true,
        sprites: document.querySelectorAll('canvas[data-world-sprites]').length,
        firstFrame: performance.getEntriesByName('world:first-frame').length, debug: '__world' in window,
      };
    });
    expect(r).toEqual({ state: 'aborted', lost: true, sprites: 0, firstFrame: 0, debug: false });
    expect(errors).toEqual([]);
  });
}

// Last: dispose() must release every geometry and texture and the context (I1).
test('dispose() releases geometries, textures and the GL context (I1)', async ({ page }) => {
  await mount(page, '&debug=1&u=0.5&t=8');
  const r = await page.evaluate(() => {
    const w = window as unknown as W & { __world?: { disposeAudit?: { geometries: number; textures: number } } };
    const dbg = w.__world!, mem = dbg.memory!;
    const before = { geometries: mem.geometries, textures: mem.textures };
    w.__worldCtl.dispose();
    const gl = (document.getElementById('world') as HTMLCanvasElement).getContext('webgl2');
    return { before, audit: dbg.disposeAudit, after: { geometries: mem.geometries, textures: mem.textures }, lost: gl ? gl.isContextLost() : true, state: document.documentElement.dataset.world, gone: !('__world' in window) };
  });
  expect(r.before.geometries).toBeGreaterThan(10);
  expect(r.before.textures).toBeGreaterThan(3);
  // the engine's own releases account for everything (counted before renderer.dispose(), which would zero them anyway)
  expect(r.audit).toEqual({ geometries: 0, textures: 0 });
  expect(r.after).toEqual({ geometries: 0, textures: 0 });
  expect(r.gone).toBe(true);
  expect(r.lost).toBe(true);
  expect(r.state).toBe('ready'); // a deliberate dispose is not reported as a context loss
});
