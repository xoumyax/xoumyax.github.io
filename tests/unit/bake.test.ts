import { test, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { bakeWorld, type BakeResult } from '../../src/world/bake';
import { road } from '../../src/world/scene/road';

const hash = (r: BakeResult) => {
  const h = createHash('sha256');
  for (const a of [r.heights, r.colors, r.classes, r.scrub]) h.update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  h.update(JSON.stringify(r.meta));
  return h.digest('hex');
};

const a = bakeWorld({ scrubCount: 20000, seed: 7 });

test('bake is deterministic for a seed', () => {
  expect(hash(bakeWorld({ scrubCount: 20000, seed: 7 }))).toBe(hash(a));
  expect(hash(bakeWorld({ scrubCount: 20000, seed: 8 }))).not.toBe(hash(a));
});

test('bake honours the scrub count', () => {
  expect(a.meta.scrubCount).toBe(20000);
  expect(a.scrub.length).toBe(20000 * 19); // 16 matrix floats + 3 colour floats per instance
});

// Bilinear sample of the baked height grid at world (x, z).
function baked(r: BakeResult, x: number, z: number) {
  const m = r.meta;
  const u = ((x - m.x0) / (m.x1 - m.x0)) * (m.hCols - 1), v = ((z - m.z0) / (m.z1 - m.z0)) * (m.hRows - 1);
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, H = r.heights, W = m.hCols;
  return (H[j * W + i] * (1 - fu) + H[j * W + i + 1] * fu) * (1 - fv) + (H[(j + 1) * W + i] * (1 - fu) + H[(j + 1) * W + i + 1] * fu) * fv;
}

test('the road descends from the Chisos to the river', () => {
  const top = road.curve.getPointAt(0), end = road.curve.getPointAt(1);
  expect(top.z).toBeLessThan(end.z); // top of view is far (-z); the river is near (+z)
  expect(top.y - end.y).toBeGreaterThanOrEqual(8);
  expect(baked(a, top.x, top.z) - baked(a, end.x, end.z)).toBeGreaterThanOrEqual(8);
});

test('the road runs diagonally across the view', () => {
  const top = road.curve.getPointAt(0), end = road.curve.getPointAt(1);
  expect(Math.abs(end.x - top.x)).toBeGreaterThanOrEqual(0.3 * road.length);
  expect(Math.abs(end.z - top.z)).toBeGreaterThanOrEqual(0.3 * road.length);
});

test('road.heightAt agrees with the baked heights and the curve (figures stand on it)', () => {
  for (const t of [0.05, 0.3, 0.55, 0.8, 0.97]) {
    const p = road.curve.getPointAt(t);
    expect(Math.abs(road.heightAt(p.x, p.z) - baked(a, p.x, p.z))).toBeLessThan(0.15);
    expect(Math.abs(road.heightAt(p.x, p.z) - p.y)).toBeLessThan(0.15);
  }
});

// Task 12b: the centre-line dashes read (a light warm dash every few glyph cells), but stay light:
// broken, about a glyph cell wide (a desktop cell is ~0.2 units; a thinner line melts into the asphalt in
// the glyph pass), and not the old heavy band. Sampled in the baked colour texture along the centreline.
test('the road centre line is a visible, light, broken dash', () => {
  const m = a.meta, tx = m.cols / (m.x1 - m.x0), tz = m.rows / (m.z1 - m.z0);
  const lumAt = (x: number, z: number) => {
    const i = Math.floor((x - m.x0) * tx), j = Math.floor((z - m.z0) * tz), q = (j * m.cols + i) * 4;
    return 0.299 * a.colors[q] + 0.587 * a.colors[q + 1] + 0.114 * a.colors[q + 2];
  };
  let dash = 0, n = 0, contrast = 0, wide = 0, side = 0, runs = 0, prev = false;
  for (let u = 0.02; u < 0.98; u += 0.0005) {
    const p = road.curve.getPointAt(u), q = road.curve.getPointAt(Math.min(1, u + 0.001));
    const L = Math.hypot(q.x - p.x, q.z - p.z) || 1, nx = -(q.z - p.z) / L, nz = (q.x - p.x) / L;
    const off = lumAt(p.x + nx * 0.55, p.z + nz * 0.55), lit = (d: number) => lumAt(p.x + nx * d, p.z + nz * d) - off > 18;
    const on = lit(0);
    n++;
    if (on) {
      dash++; contrast += lumAt(p.x, p.z) - off;
      if (!prev) runs++;
      if (lit(0.11) && lit(-0.11)) wide++;          // about a glyph cell across
    }
    if (lit(0.4) || lit(-0.4)) side++;              // but not a band: plain asphalt 0.4 out
    prev = on;
  }
  const duty = dash / n;
  expect(duty).toBeGreaterThan(0.25);               // a good share of the line is painted
  expect(duty).toBeLessThan(0.55);                  // broken
  expect(runs).toBeGreaterThan(40);                 // a dash every few cells, not every few metres
  expect(wide / dash).toBeGreaterThan(0.8);         // wide enough to survive the glyph pass
  expect(side / n).toBeLessThan(0.05);              // narrow
  expect(contrast / dash).toBeGreaterThan(25);      // visible …
  expect(contrast / dash).toBeLessThan(70);         // … but light, not a bright stripe
});
