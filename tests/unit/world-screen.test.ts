// The screen side of the world maths: device-px snapping, the seam clip and the smoothed scroll.
import { test, expect } from 'vitest';
import { FOLLOW_EPS, FOLLOW_JUMP, FOLLOW_TAU, Follower, SEAM_MAX, panDev, rowY, seamEdges, seamJitter, snapOffset } from '../../src/lib/world-math';

// Device x where layer column c lands for a layer offset o at b device px per world px.
const at = (c: number, o: number, b: number) => { const s = snapOffset(o, b); return s.d + (c - s.n) * b; };

test('snapOffset: whole offsets sit on the block grid, fractional ones in whole device px between', () => {
  for (const b of [1, 2, 7, 8, 14]) {
    for (let o = -20; o <= 20; o++) expect(snapOffset(o, b), `${o}@${b}`).toEqual({ n: o, d: 0 });
    for (let o = -5; o < 5; o += 0.013) {
      const s = snapOffset(o, b);
      expect(Number.isInteger(s.d) && s.d <= 0 && s.d >= -b, `${o}@${b}`).toBe(true);
      // with a whole b every column lands at round((c − o) · b): the exact position, snapped
      for (const c of [0, 3, 11]) expect(at(c, o, b) - Math.round((c - o) * b), `${c} ${o}@${b}`).toBe(0);
    }
  }
});

test('snapOffset: a layer drifting a little each frame moves a little each frame (no block jumps)', () => {
  for (const b of [7, 8, 8.75, 10.5]) {
    let prev = at(5, 0, b);
    let moved = 0;
    for (let o = 0; o <= 6; o += 0.01) {
      const x = at(5, o, b);
      // 0.01 world px is 0.07 … 0.105 device px: never more than one device px a step (fractional b may re-base by one more)
      expect(Math.abs(x - prev), `${o}@${b}`).toBeLessThanOrEqual(Number.isInteger(b) ? 1 : 2);
      if (x !== prev) moved++;
      prev = x;
    }
    expect(moved, String(b)).toBeGreaterThan(6 * b * 0.9); // about b steps per world px, not one
  }
});

test('panDev and rowY: whole device px, from 0 to the full width / height', () => {
  for (const b of [7, 8.75]) {
    expect(panDev(0, 240, b)).toBe(0);
    expect(panDev(1, 240, b)).toBe(Math.round(240 * b));
    expect(rowY(0, b)).toBe(0);
    expect(rowY(135, b)).toBe(Math.round(135 * b));
    for (let j = 0; j < 135; j++) expect(rowY(j + 1, b)).toBeGreaterThan(rowY(j, b));
  }
});

test('seamEdges: scene k + 1 starts at or left of the cut by the jitter, never past 0: no gap at the seam', () => {
  for (const b of [7, 8, 8.75, 10.5]) for (const band of [0, 1, 4]) for (const cut of [0, 3, 500, 1680]) {
    const e = seamEdges(cut, band, 135, b);
    for (let j = 0; j < 135; j++) {
      const want = Math.max(0, cut - Math.round(seamJitter(j, band) * b));
      expect(e[j], `${b} ${band} ${cut} ${j}`).toBe(want);
      // scene k covers [0, cut), scene k + 1 covers [e, width): every device px of the row is covered
      expect(e[j]).toBeLessThanOrEqual(cut);
      expect(cut - e[j]).toBeLessThanOrEqual(Math.round(SEAM_MAX * b));
    }
    if (cut > Math.round(SEAM_MAX * b)) expect(new Set(e).size, 'ragged').toBeGreaterThan(1);
  }
});

const run = (f: Follower, targets: (i: number) => number, frames: number, dt = 1 / 60, vh = 900) => {
  const ys: number[] = [];
  for (let i = 0; i < frames; i++) { f.step(targets(i), dt, vh); ys.push(f.y); }
  return ys;
};

test('Follower: a step glides there without overshoot and lands exactly, then stops', () => {
  const f = new Follower();
  f.snap(1000);
  const ys = run(f, () => 1100, 120);
  for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThanOrEqual(ys[i - 1]);
  expect(Math.max(...ys)).toBe(1100);
  expect(ys[0]).toBeLessThan(1010);                    // not a jump: the first frame moves a little
  const done = ys.findIndex((y) => y === 1100);
  expect(done).toBeGreaterThan(5);
  expect(done * (1 / 60)).toBeLessThan(0.6);           // settled well within a second
  expect(f.moving).toBe(false);
  expect(f.step(1100, 1 / 60, 900)).toBe(false);       // settled: nothing to do
});

test('Follower: the largest frame-to-frame move of a 20 px step is a fraction of it', () => {
  const f = new Follower();
  f.snap(0);
  const ys = run(f, () => 20, 60);
  let max = ys[0];
  for (let i = 1; i < ys.length; i++) max = Math.max(max, ys[i] - ys[i - 1]);
  expect(max).toBeLessThan(20 * 0.15);
});

test('Follower: uneven deltas come out even, and it stays within the targets it was given', () => {
  // A steady scroll delivered unevenly (0, 60, 15, 45 …; 31.25 px/frame on average): the shown position moves evenly.
  const deltas = [0, 60, 15, 45, 30, 0, 75, 20, 40, 30, 10, 50];
  const v = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const f = new Follower();
  f.snap(0);
  let target = 0;
  const moves: number[] = [];
  let prev = 0;
  for (let i = 0; i < 240; i++) {
    target += deltas[i % deltas.length];
    f.step(target, 1 / 60, 900);
    expect(f.y).toBeLessThanOrEqual(target);
    if (i > 60) moves.push(f.y - prev);
    prev = f.y;
  }
  const spread = Math.max(...moves) - Math.min(...moves);
  expect(spread).toBeLessThan(0.35 * 75);                       // the deltas spread 0 … 75
  const mean = moves.reduce((a, b) => a + b, 0) / moves.length;
  expect(mean).toBeCloseTo(v, 0);
  expect(target - f.y).toBeGreaterThan(v * 60 * FOLLOW_TAU);   // it lags about 2 τ behind…
  expect(target - f.y).toBeLessThan(v * 60 * 3 * FOLLOW_TAU);  // …and no more
});

test('Follower: big jumps, still mode and reduced motion snap', () => {
  const f = new Follower();
  f.snap(0);
  expect(f.step(FOLLOW_JUMP * 900 + 1, 1 / 60, 900)).toBe(false);
  expect(f.y).toBe(FOLLOW_JUMP * 900 + 1);
  f.snap(0);
  f.step(FOLLOW_JUMP * 900 - 1, 1 / 60, 900);
  expect(f.y).toBeLessThan(FOLLOW_JUMP * 900 - 1);              // just under: it glides
  f.snap(0);
  expect(f.step(300, 1 / 60, 900, true)).toBe(false);           // instant: still / reduced
  expect(f.y).toBe(300);
  f.snap(0);
  f.step(-5000, 1 / 60, 900);                                    // up too
  expect(f.y).toBe(-5000);
});

test('Follower: a stalled frame does not lurch, and a small offset settles within FOLLOW_EPS', () => {
  const f = new Follower();
  f.snap(0);
  f.step(100, 2, 900);                                           // 2 s gap: clamped to 1/20 s
  expect(f.y).toBeLessThan(100 * 0.5);
  f.snap(0);
  expect(f.step(FOLLOW_EPS * 0.9, 1 / 60, 900)).toBe(false);
  expect(f.y).toBe(FOLLOW_EPS * 0.9);
});
