import { test, expect, type Page } from '@playwright/test';
import { riverDist, riverZ } from '../../src/world/bake';
import { FIGURE_PERIOD, HORSE_BANK, WALK_SPAN } from '../../src/world/scene/figure-motion';

// Task 12: Soumya and Jen walk the road as glyph sprites on a 2D overlay; a horse grazes on the river bank.
// Every world test passes governor=off and an explicit tier (URL contract, Task 10). ?t= freezes the clock,
// so each actor's position is a pure function of (t, u) and the test is deterministic.
const Q = 'governor=off&tier=medium&debug=1';
test.describe.configure({ mode: 'serial', timeout: 90_000 });

type V = { x: number; y: number; z: number };
type Figs = { soumya: V; jen: V; horse: V };
type Ctl = import('../../src/world/index').WorldController;
interface W { __worldCtl: Ctl; __world?: { frames: number; figures: Figs } }

async function mount(page: Page, extra: string) {
  await page.goto(`/world-test/?${Q}${extra}`);
  await page.waitForFunction(() => document.documentElement.dataset.world === 'ready' || document.documentElement.dataset.world?.startsWith('error'), null, { timeout: 60_000 });
  expect(await page.evaluate(() => document.documentElement.dataset.world)).toBe('ready');
  await page.evaluate(() => new Promise<void>((r) => { let n = 0; const f = () => (++n > 4 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }));
}
const figures = (page: Page) => page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as W).__world!.figures)) as Figs);
const dist = (a: V, b: V) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

async function figuresAt(page: Page, u: number, t: number) {
  await mount(page, `&u=${u}&t=${t}`);
  return figures(page);
}

test('three actors, moving, together, on the bank, and looping cleanly', async ({ page }) => {
  const a = await figuresAt(page, 0.5, 0);
  expect(Object.keys(a).sort()).toEqual(['horse', 'jen', 'soumya']);
  for (const k of ['soumya', 'jen', 'horse'] as const) for (const c of ['x', 'y', 'z'] as const) expect(Number.isFinite(a[k][c]), `${k}.${c}`).toBe(true);

  const b = await figuresAt(page, 0.5, 2);
  for (const k of ['soumya', 'jen', 'horse'] as const) expect(dist(a[k], b[k]), `${k} moves between t=0 and t=2`).toBeGreaterThan(0.05);

  // the couple stays together
  for (const f of [a, b]) expect(dist(f.soumya, f.jen)).toBeLessThanOrEqual(1.5);

  // the horse stays on the river bank: dry ground between the water's edge and the floodplain's edge, road side
  for (const f of [a, b]) {
    const d = riverDist(f.horse.x, f.horse.z);
    expect(d).toBeGreaterThanOrEqual(HORSE_BANK[0]);
    expect(d).toBeLessThanOrEqual(HORSE_BANK[1]);
    expect(f.horse.z).toBeLessThan(riverZ(f.horse.x));
  }

  // all actors loop: t = 0 and t = period put every actor in the same place
  const c = await figuresAt(page, 0.5, FIGURE_PERIOD);
  for (const k of ['soumya', 'jen', 'horse'] as const) expect(dist(a[k], c[k]), `${k} loops`).toBeLessThan(0.01);
});

test('the walkers ping-pong along the road near the current stop', async ({ page }) => {
  // over one loop (t = 0, P/4, P/2, 3P/4) the walkers cover the segment, within ±WALK_SPAN of u = .13
  const pts: Figs[] = [];
  for (const t of [0, FIGURE_PERIOD / 4, FIGURE_PERIOD / 2, (3 * FIGURE_PERIOD) / 4]) pts.push(await figuresAt(page, 0.13, t));
  const span = Math.max(...pts.map((p) => dist(p.soumya, pts[0].soumya)));
  expect(span).toBeGreaterThan(2);           // they really walk (WALK_SPAN of a ~124-unit road is ~3.7 each way)
  expect(span).toBeLessThan(WALK_SPAN * 2 * 130 + 1);
  for (const p of pts) expect(dist(p.soumya, p.jen)).toBeLessThanOrEqual(1.5);
});

test('the sprite overlay sits on the world canvas, draws the walkers, and goes away on dispose()', async ({ page }) => {
  await mount(page, '&u=0.5&t=8');
  const r = await page.evaluate(() => {
    const w = window as unknown as W;
    const gl = document.getElementById('world') as HTMLCanvasElement;
    const ov = gl.parentElement!.querySelector('canvas[data-world-sprites]') as HTMLCanvasElement | null;
    if (!ov) return null;
    const a = gl.getBoundingClientRect(), b = ov.getBoundingClientRect();
    const pe = getComputedStyle(ov).pointerEvents; // read now: a computed style is live, and empty once removed
    // count lit sprite pixels on the overlay
    const x = ov.getContext('2d')!, d = x.getImageData(0, 0, ov.width, ov.height).data;
    let lit = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) lit++;
    const sameParent = ov.parentElement === gl.parentElement;
    w.__worldCtl.dispose();
    return {
      rectA: [a.left, a.top, a.width, a.height], rectB: [b.left, b.top, b.width, b.height],
      pe, sameParent, lit, backing: [ov.width, ov.height], dpr: devicePixelRatio,
      gone: !document.querySelector('canvas[data-world-sprites]'),
    };
  });
  expect(r, 'overlay canvas exists').not.toBeNull();
  expect(r!.sameParent).toBe(true);
  expect(r!.rectB).toEqual(r!.rectA);
  expect(r!.pe).toBe('none');
  expect(r!.backing[0]).toBe(Math.round(r!.rectA[2] * Math.min(r!.dpr, 1.5)));
  expect(r!.lit).toBeGreaterThan(400);
  expect(r!.gone).toBe(true);
});

// ---------------------------------------------------------------- Task 12b: review round 1
type Spr = { x: number; y: number; shown: boolean };
type Dbg2 = { frames: number; figures: Figs; walk?: { frame: number; anchor: number; alpha: number }; sprites?: { soumya: Spr; jen: Spr } };
const nextFrames = (page: Page, n = 4) => page.evaluate((k) => new Promise<void>((r) => { let i = 0; const f = () => (++i > k ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const litPixels = (page: Page) => page.evaluate(() => {
  const ov = document.querySelector('canvas[data-world-sprites]') as HTMLCanvasElement;
  const d = ov.getContext('2d')!.getImageData(0, 0, ov.width, ov.height).data;
  let lit = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) lit++;
  return lit;
});
const rects = (page: Page) => page.evaluate(() => {
  const r = (e: Element) => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; };
  const gl = document.getElementById('world') as HTMLCanvasElement, ov = document.querySelector('canvas[data-world-sprites]') as HTMLCanvasElement;
  return { gl: r(gl), ov: r(ov), glBacking: [gl.width, gl.height], ovBacking: [ov.width, ov.height] };
});

test('no sliding: moving the camera inside one stop\'s band leaves the walkers where they are in the world', async ({ page }) => {
  await mount(page, '&u=0.26&t=9');
  const a = await figures(page);
  // eased travel (scrolling) inside the ms band, then a jump inside it
  for (const u of [0.27, 0.29, 0.235]) {
    await page.evaluate((uu) => (window as unknown as W).__worldCtl.setJourney(uu), u);
    await page.waitForTimeout(600);
    const b = await figures(page);
    expect(dist(a.soumya, b.soumya), `setJourney(${u})`).toBeLessThan(1e-6);
    expect(dist(a.jen, b.jen), `setJourney(${u})`).toBeLessThan(1e-6);
  }
  await page.evaluate(() => (window as unknown as W).__worldCtl.jumpJourney(0.28));
  await nextFrames(page);
  expect(dist(a.soumya, (await figures(page)).soumya), 'jumpJourney(.28)').toBeLessThan(1e-6);
});

test('walk frames alternate on screen: the frame index changes over a stride at constant u', async ({ page }) => {
  const seen = new Set<number>();
  for (const t of [2, 2.3, 2.6, 2.9, 3.2]) {
    await mount(page, `&u=0.26&t=${t}`);
    const w = await page.evaluate(() => (window as unknown as { __world: Dbg2 }).__world.walk);
    expect(w, '__world.walk').toBeTruthy();
    expect(w!.frame).toBeGreaterThanOrEqual(0);
    seen.add(w!.frame);
  }
  expect(seen.size).toBeGreaterThanOrEqual(2);
});

// Both walkers are drawn (on screen, below the backdrop card) at every stop across the whole loop.
for (const [vw, vh, label] of [[1440, 900, 'desktop'], [390, 844, 'phone']] as const) {
  test(`the walkers are in view at every stop over the loop (${label})`, async ({ page }) => {
    await page.setViewportSize({ width: vw, height: vh });
    const bad: string[] = [];
    for (let k = 0; k < 8; k++) {
      const t = (k / 8) * FIGURE_PERIOD;
      await mount(page, `&t=${t}`);
      for (const stop of ['srm', 'cognizant', 'ms', 'phd', 'now', 'river'] as const) {
        const s = await page.evaluate(async (st) => {
          (window as unknown as W).__worldCtl.jumpJourney((window as unknown as W).__worldCtl.journeyForStop(st));
          await new Promise<void>((r) => { let i = 0; const f = () => (++i > 3 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
          return (window as unknown as { __world: Dbg2 }).__world.sprites;
        }, stop);
        if (!s) { bad.push(`${stop} t=${t}: no __world.sprites`); continue; }
        for (const who of ['soumya', 'jen'] as const) {
          const p = s[who];
          if (!p.shown || p.y / vh < 0.3 || p.y / vh > 0.97 || p.x < 0 || p.x > vw) bad.push(`${stop} t=${t} ${who} (${(p.x / vw).toFixed(2)}, ${(p.y / vh).toFixed(2)}) shown=${p.shown}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
}

// Scrolling (eased travel, not jumps) between neighbouring stops, both ways: the walkers end up walking at
// the stop the camera arrived at, fully opaque; and they never pop. Each move to another stop happens while
// the old pair is faded out or just leaving view (at an edge or under the backdrop card), and the pair
// arrives at the new spot transparent (it fades in). The clock is frozen (?t=); the fades run on real time.
for (const [vw, vh, label] of [[1440, 900, 'desktop'], [390, 844, 'phone']] as const) {
  test(`scrolling between stops moves the walkers without a pop (${label})`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: vw, height: vh });
    await mount(page, '&t=9');
    const us = [0, 0.13, 0.26, 0.38, 0.5, 1];
    const bad: string[] = [];
    for (let i = 0; i < us.length - 1; i++) for (const [a, b] of [[us[i], us[i + 1]], [us[i + 1], us[i]]]) {
      const rec = await page.evaluate(async ([a, b]) => {
        const w = window as unknown as W & { __world: Dbg2 & { journey: number } }, ctl = w.__worldCtl, D = w.__world;
        ctl.jumpJourney(a);
        await new Promise((r) => setTimeout(r, 300));
        const out: Array<{ an: number; al: number; s: Spr; j: Spr }> = [];
        const t0 = performance.now();
        await new Promise<void>((res) => {
          const f = (now: number) => {
            const k = Math.min(1, (now - t0) / 1500);
            ctl.setJourney(a + (b - a) * k);
            out.push({ an: D.walk!.anchor, al: D.walk!.alpha, s: { ...D.sprites!.soumya }, j: { ...D.sprites!.jen } });
            const settled = k === 1 && Math.abs(D.journey - b) < 0.001 && D.walk!.alpha === 1;
            if ((settled && now - t0 > 2500) || now - t0 > 8000) res(); else requestAnimationFrame(f);
          };
          requestAnimationFrame(f);
        });
        return out;
      }, [a, b]);
      const tag = `${a}→${b}`, end = rec[rec.length - 1];
      if (end.an !== b) bad.push(`${tag}: ends anchored at ${end.an}`);
      if (end.al !== 1) bad.push(`${tag}: ends at alpha ${end.al}`);
      if (!end.s.shown || !end.j.shown) bad.push(`${tag}: ends with a walker not drawn`);
      const edgy = (p: Spr) => !p.shown || p.y / vh < 0.34 || p.y / vh > 0.97 || p.x / vw < 0.03 || p.x / vw > 0.97;
      for (let k = 1; k < rec.length; k++) {
        if (rec[k].an === rec[k - 1].an) continue;
        const before = rec[k - 1];
        if (!(before.al <= 0.25 || (edgy(before.s) && edgy(before.j)))) bad.push(`${tag}: moved from a visible pair (alpha ${before.al.toFixed(2)}, y ${(before.s.y / vh).toFixed(2)})`);
        if (rec[k].al > 0.1) bad.push(`${tag}: arrived at alpha ${rec[k].al.toFixed(2)}`);
      }
    }
    expect(bad).toEqual([]);
  });
}

test('the overlay follows the canvas when it moves without resizing (I2)', async ({ page }) => {
  await mount(page, '&u=0.5&t=8');
  await page.evaluate(() => {
    const gl = document.getElementById('world')!;
    gl.parentElement!.style.position = 'relative';
    gl.style.position = 'absolute'; gl.style.left = '0px'; gl.style.top = '0px';
  });
  await nextFrames(page);
  // a banner pushes the canvas's container down: no resize, and no style change on the canvas itself
  await page.evaluate(() => { const b = document.createElement('div'); b.style.height = '57px'; document.body.prepend(b); });
  await nextFrames(page);
  const r = await rects(page);
  expect(r.gl[1]).toBeGreaterThan(50);
  expect(r.ov).toEqual(r.gl);
});

test('a devicePixelRatio change resizes the WebGL backing and the overlay (I3)', async ({ page }) => {
  // Record every media query the page makes. CDP's DPR emulation changes devicePixelRatio but (in headless
  // Brave) dispatches no media-query 'change', which is what a real move to another monitor or a browser
  // zoom does; so the test changes the ratio for real, then dispatches that event itself.
  await page.addInitScript(() => {
    const w = window as unknown as { __mqs: MediaQueryList[] }, mm = window.matchMedia.bind(window);
    w.__mqs = [];
    window.matchMedia = (q: string) => { const m = mm(q); w.__mqs.push(m); return m; };
  });
  await mount(page, '&u=0.5&t=8');
  expect((await rects(page)).ovBacking[0]).toBe(1440);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
  await page.waitForFunction(() => devicePixelRatio === 2);
  const armed = await page.evaluate(() => {
    const mqs = (window as unknown as { __mqs: MediaQueryList[] }).__mqs;
    const res = mqs.filter((m) => m.media.includes('resolution'));
    for (const m of res) m.dispatchEvent(new Event('change'));
    return res.map((m) => m.media);
  });
  expect(armed.some((q) => /resolution:\s*1dppx/.test(q))).toBe(true);
  await nextFrames(page, 6);
  const after = await rects(page);
  // medium caps the DPR at 1.5
  expect(after.ovBacking).toEqual([2160, 1350]);
  expect(after.glBacking).toEqual([2160, 1350]);
  expect(after.ov).toEqual(after.gl);
  // re-armed for the new ratio
  const media = await page.evaluate(() => (window as unknown as { __mqs: MediaQueryList[] }).__mqs.map((m) => m.media));
  expect(media.some((q) => /resolution:\s*2dppx/.test(q))).toBe(true);
});

test('paused: a resize still redraws the sprites (M1)', async ({ page }) => {
  await mount(page, '&u=0.5&t=8');
  await page.evaluate(() => (window as unknown as W).__worldCtl.pause());
  await page.setViewportSize({ width: 1300, height: 860 });
  await page.waitForTimeout(500);
  expect(await litPixels(page)).toBeGreaterThan(400);
});

test('the overlay mirrors the canvas\'s visibility and is cleared on a context loss (M2, M3)', async ({ page }) => {
  await mount(page, '&u=0.5&t=8');
  const vis = () => page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('canvas[data-world-sprites]')!);
    return cs.display === 'none' ? 'none' : cs.visibility;
  });
  expect(await vis()).toBe('visible');
  await page.evaluate(() => { document.getElementById('world')!.style.visibility = 'hidden'; });
  await nextFrames(page, 2);
  expect(await vis()).toBe('hidden');
  await page.evaluate(() => { document.getElementById('world')!.style.visibility = ''; });
  await nextFrames(page, 2);
  expect(await vis()).toBe('visible');
  // a page state on <html> that hides the canvas through a stylesheet (as boot's loading / poster states do)
  await page.evaluate(() => {
    const st = document.createElement('style'); st.textContent = 'html[data-dim] #world { visibility: hidden }'; document.head.append(st);
    document.documentElement.dataset.dim = '';
  });
  await nextFrames(page, 2);
  expect(await vis()).toBe('hidden');
  await page.evaluate(() => { delete document.documentElement.dataset.dim; });
  await nextFrames(page, 2);
  expect(await vis()).toBe('visible');
  expect(await litPixels(page)).toBeGreaterThan(400);
  await page.evaluate(() => (document.getElementById('world') as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext());
  await page.waitForFunction(() => document.documentElement.dataset.world?.startsWith('lost'));
  await nextFrames(page, 2);
  expect(await litPixels(page)).toBe(0);
});
