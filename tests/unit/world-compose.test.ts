import { test, expect } from 'vitest';
import { compose, flatWorld, makeWorld, type Bitmap, type World } from '../../src/scripts/world/compose';
import type { Act } from '../../src/scripts/world/acts';
import type { SceneMeta } from '../../src/lib/world';
import { CAM_X, CAM_Y, bandShift, seamJitter } from '../../src/lib/world-math';
import { PAL32 } from '../../src/lib/palette';

const VW = 8;
const VH = 4;
const fill = (w: number, h: number, f: (x: number, y: number) => number): Bitmap => {
  const px = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = f(x, y);
  return { w, h, px };
};
const solid = (c: number) => fill(VW, VH, () => c);
const [A, B, C, D, S0, S1] = PAL32;

// A 12×6 world: an opaque back layer (colour by x so offsets show), a front layer that is
// transparent except column 0, and a 2×1 two-frame sprite on the front layer at (3, 2).
const meta: SceneMeta = {
  id: 'phd', world: [12, 6], view: { land: [2, 1], port: [0, 0] },
  layers: [{ name: 'back', depth: 0, rate: 0 }, { name: 'front', depth: 1, rate: 0 }],
  sprites: [{ name: 'bird', w: 2, h: 1, frames: 2, at: [3, 2], layer: 'front', rest: 1 }],
};
const back = fill(12, 6, (x) => PAL32[x]);
const front = fill(12, 6, (x) => (x === 0 ? D : 0));
const bird = fill(2, 2, (_, y) => (y === 0 ? S0 : S1));
const world = (): World => makeWorld(meta, [back, front], [bird]);
const frame = (a: World, actA: Act | undefined, b: World | null, p: number, t: number) => {
  const out = new Uint32Array(VW * VH);
  compose(out, VW, VH, 'land', a, actA, b, undefined, p, t, 0);
  return out;
};

test('a flat scene at rest is its frame', () => {
  const f = solid(A);
  expect(frame(flatWorld('hero', f), undefined, null, 0.3, 0)).toEqual(f.px);
});

test('settled world: view window, transparent pixels skipped, rest sprite after its layer', () => {
  const out = frame(world(), undefined, null, 0, 0);
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
    const wx = x + 2, wy = y + 1;
    const want = wy === 2 && (wx === 3 || wx === 4) ? S1 : PAL32[wx];
    expect(out[y * VW + x], `${x},${y}`).toBe(want);
  }
});

test('camera drift: at p = 1 a rate-1 layer is offset by CAM_X right and CAM_Y up', () => {
  // A 30×12 world viewed from (2, 6): each pixel encodes its own world (x, y).
  const m: SceneMeta = { ...meta, world: [30, 12], view: { land: [2, 6], port: [0, 0] }, sprites: [],
    layers: [{ name: 'back', depth: 0, rate: 1 }] };
  const enc = (x: number, y: number) => (0xff000000 | (y << 8) | x) >>> 0;
  const w = makeWorld(m, [fill(30, 12, enc)], []);
  const out = frame(w, undefined, null, 1, 0);
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
    expect(out[y * VW + x], `${x},${y}`).toBe(enc(x + 2 + CAM_X, y + 6 - CAM_Y));
  }
  // rate 0.5 moves half as far (rounded)
  const half = makeWorld({ ...m, layers: [{ name: 'back', depth: 0, rate: 0.5 }] }, [fill(30, 12, enc)], []);
  expect(frame(half, undefined, null, 1, 0)[0]).toBe(enc(2 + Math.round(CAM_X * 0.5), 6 - Math.round(CAM_Y * 0.5)));
});

test('mid-pan: scene k left of the cut, scene k+1 right of it, a ragged seam, no blanks', () => {
  const t = 0.5;
  const s = Math.round(bandShift(t, 0) * VW);
  const out = frame(flatWorld('hero', solid(A)), undefined, flatWorld('now', solid(B)), 1, t);
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
    expect(out[y * VW + x], `${x},${y}`).toBe(x < VW - s ? A : B);
  }
});

test('the seam is ragged where scene k+1 has world to the left of its edge', () => {
  // Scene k+1 viewed from x = 4 in its world, so the jitter has pixels to show.
  const m: SceneMeta = { ...meta, id: 'ms', view: { land: [4, 0], port: [0, 0] }, layers: [{ name: 'back', depth: 0.5, rate: 0 }], sprites: [] };
  const b = makeWorld(m, [fill(12, 6, () => C)], []);
  const t = 0.5;
  const s = Math.round(bandShift(t, 0) * VW);
  const out = frame(flatWorld('hero', solid(A)), undefined, b, 1, t);
  let ragged = false;
  for (let y = 0; y < VH; y++) {
    const edge = VW - s - seamJitter(y, 0);
    if (edge !== VW - s) ragged = true;
    for (let x = 0; x < VW; x++) expect(out[y * VW + x], `${x},${y}`).toBe(x >= edge ? C : A);
  }
  expect(ragged).toBe(true);
});

test('at the end of a pan scene k+1 shows as it does settled', () => {
  const a = flatWorld('hero', solid(A));
  const settled = frame(world(), undefined, null, 0, 0);
  expect(frame(a, undefined, world(), 1, 0.9999999)).toEqual(settled);
});

test('layers draw by depth, scene k before scene k+1 at equal depth', () => {
  // k's near layer (depth 1) is drawn after k+1's far layer (depth 0): where both reach, k wins.
  const near: SceneMeta = { ...meta, id: 'now', view: { land: [0, 0], port: [0, 0] }, sprites: [],
    layers: [{ name: 'back', depth: 0, rate: 0 }, { name: 'front', depth: 1, rate: 0 }] };
  const a = makeWorld(near, [fill(12, 6, () => A), fill(12, 6, () => D)], []);
  const farOnly: SceneMeta = { ...near, id: 'phd', view: { land: [4, 0], port: [0, 0] }, layers: [{ name: 'back', depth: 0, rate: 0 }] };
  const b = makeWorld(farOnly, [fill(12, 6, () => B)], []);
  const t = 0.3;
  const sNear = Math.round(bandShift(t, 1) * VW);
  const sFar = Math.round(bandShift(t, 0) * VW);
  const out = frame(a, undefined, b, 1, t);
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
    const kNear = x < VW - sNear;
    const kFar = x < VW - sFar;
    const nFar = x >= VW - sFar - seamJitter(y, 0);
    const want = kNear ? D : nFar ? B : kFar ? A : 0;
    expect(out[y * VW + x], `${x},${y}`).toBe(want);
  }
});

test('an act: after-hook plots and sprites in world px with the layer clip; shift moves layer and hook', () => {
  const act: Act = {
    after: { front: (d, p) => { d.plot(5, 2, C); d.sprite('bird', 0, 6, 3); if (p > 0) d.plot(100, 100, C); } },
    shift: { back: () => [1, 0], front: () => [0, 0] },
  };
  const out = frame(world(), act, null, 0, 0);
  // back shifted right by 1: screen x shows back[x + 2 − 1]
  expect(out[0 * VW + 0]).toBe(PAL32[1]);
  expect(out[(2 - 1) * VW + (5 - 2)]).toBe(C);           // plot at world (5,2)
  expect(out[(3 - 1) * VW + (6 - 2)]).toBe(S0);          // sprite frame 0 at (6,3)
  expect(out[(3 - 1) * VW + (7 - 2)]).toBe(S0);
  expect(out[(2 - 1) * VW + (3 - 2)]).toBe(PAL32[2]);   // no rest sprite at (3,2): the hook owns the layer; back shows back[1 + 1]
});

test('an after-hook cannot draw past the cut of scene k', () => {
  // Plot a whole world row from scene k's back layer mid-pan (no scene k+1 to cover it): only
  // screen x < VW − s(depth 0) keeps the plotted pixels.
  const act: Act = { after: { back: (d) => { for (let x = 0; x < d.world[0]; x++) d.plot(x, 1, C); } } };
  const t = 0.5;
  const s = Math.round(bandShift(t, 0) * VW);
  const out = frame(world(), act, null, 0, t);
  for (let x = 0; x < VW; x++) expect(out[x], String(x)).toBe(x < VW - s ? C : 0);
});

test('no blank pixel mid-pan, whatever depth each scene declares for its base layer', () => {
  // Ruling: layers[0] always pans with bandShift(t, 0), so the two bases are complementary (the
  // seam jitter only overlaps). Scene k: base declared at 0.7 under a clear front; scene k+1: base
  // at 0.1 under a clear front; also a flat fallback (declared depth 0) against each.
  const clear = fill(12, 6, () => 0);
  const w = (id: SceneMeta['id'], d0: number, c: number) => makeWorld(
    { ...meta, id, sprites: [], view: { land: [2, 1], port: [0, 0] },
      layers: [{ name: 'base', depth: d0, rate: 0 }, { name: 'front', depth: 1, rate: 0 }] },
    [fill(12, 6, () => c), clear], []);
  expect(flatWorld('hero', solid(A)).meta.layers[0].depth).toBe(0);
  const pairs: [World, World][] = [
    [w('now', 0.7, A), w('phd', 0.1, B)],
    [w('now', 0.1, A), w('phd', 0.7, B)],
    [flatWorld('now', solid(A)), w('phd', 0.1, B)],
    [w('now', 0.9, A), flatWorld('phd', solid(B))],
  ];
  for (const [a, b] of pairs) for (const t of [0.05, 0.25, 0.5, 0.75, 0.95]) {
    const out = frame(a, undefined, b, 1, t);
    expect([...out].filter((v) => v === 0).length, `${a.meta.id}->${b.meta.id} t=${t}`).toBe(0);
  }
});

test('acts get a copy of the world size, not the live meta tuple', () => {
  const w = world();
  const act: Act = { after: { back: (d) => { d.world[0] = 0; d.world[1] = 0; } } };
  const first = frame(w, act, null, 0, 0);
  expect(w.meta.world).toEqual([12, 6]);
  expect(frame(w, act, null, 0, 0)).toEqual(first);
});

test('plot and sprite round positions the same way', () => {
  const act: Act = { after: { front: (d) => { d.plot(5.6, 2.4, C); d.sprite('bird', 0, 6.6, 3.4); } } };
  const out = frame(world(), act, null, 0, 0);
  expect(out[(2 - 1) * VW + (6 - 2)]).toBe(C);   // plot (5.6, 2.4) → (6, 2)
  expect(out[(3 - 1) * VW + (7 - 2)]).toBe(S0);  // sprite (6.6, 3.4) → (7, 3)
});
