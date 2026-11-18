import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PAN_VH, PAN_MAX, CAM_X, CAM_Y, SEAM_MAX, panLength, worldAt, bandShift, seamJitter, camera, eventPhase } from '../../src/lib/world-math';
import { PALETTE, PAL32 } from '../../src/lib/palette';

test('constants', () => {
  expect([PAN_VH, PAN_MAX, CAM_X, CAM_Y, SEAM_MAX]).toEqual([0.6, 0.5, 12, 4, 4]);
});

test('worldAt: inside a stop, p rises 0→1 and t stays 0', () => {
  expect(worldAt([450, 1450, 2350], 450, 900, 5000)).toEqual({ k: 0, p: 0, t: 0 });
  expect(worldAt([200, 1200, 2100], 450, 900, 5000)).toEqual({ k: 0, p: 0.5, t: 0 });
});

test('worldAt: the pan is the last part of the gap', () => {
  const r = worldAt([-300, 700, 1600], 450, 900, 5000);
  expect(r.k).toBe(0);
  expect(r.p).toBe(1);
  expect(r.t).toBeCloseTo(0.5);
});

test('worldAt: a short gap pans over at most half of it', () => {
  expect(panLength(400, 900)).toBe(200);
  expect(panLength(1000, 900)).toBe(500);
  expect(panLength(-5, 900)).toBe(0);
});

test('worldAt: past the pan lands on the next stop settled', () => {
  expect(worldAt([-550, 450, 1350], 450, 900, 5000)).toEqual({ k: 1, p: 0, t: 0 });
  expect(worldAt([100, 100, 900], 450, 900, 5000).k).toBe(1);
});

test('worldAt: last stop measures progress to the page end', () => {
  const r = worldAt([-3000, -1000], 450, 900, 1450);
  expect(r.k).toBe(1);
  expect(r.p).toBeCloseTo(0.5);
  expect(r.t).toBe(0);
  expect(worldAt([-3000, -1000], 450, 900, 0).p).toBe(1);
  expect(worldAt([450], 450, 900, 0)).toEqual({ k: 0, p: 0, t: 0 });
});

test('worldAt: an anchor a sub-pixel below mid counts as reached', () => {
  expect(worldAt([-1000, 450.6, 1350], 450, 900, 5000)).toEqual({ k: 1, p: 0, t: 0 });
});

test('worldAt: before the first anchor, and monotonic', () => {
  expect(worldAt([100, 900], 50, 900, 100)).toEqual({ k: 0, p: 0, t: 0 });
  const anchors = [0, 1000, 1400, 3000];
  let prev = -Infinity;
  for (let mid = -500; mid <= 4000; mid += 7) {
    const r = worldAt(anchors, mid, 900, 1000);
    expect(worldAt(anchors, mid, 900, 1000)).toEqual(r);
    const key = r.k + (r.t > 0 ? 0.5 + r.t / 2 : r.p / 2);
    expect(key).toBeGreaterThanOrEqual(prev);
    prev = key;
  }
});

test('bandShift: 0 at t=0, 1 at t=1, monotonic, nearer bands lead', () => {
  for (const d of [0, 0.5, 1]) {
    expect(bandShift(0, d)).toBe(0);
    expect(bandShift(1, d)).toBe(1);
  }
  for (let t = 0.01; t < 1; t += 0.01) {
    expect(bandShift(t, 1)).toBeGreaterThanOrEqual(bandShift(t, 0.5));
    expect(bandShift(t, 0.5)).toBeGreaterThanOrEqual(bandShift(t, 0));
    expect(bandShift(t + 0.005, 0.5)).toBeGreaterThanOrEqual(bandShift(t, 0.5));
  }
  expect(bandShift(0.6, 1)).toBe(1);
});

test('seamJitter: integers in [0, 4], deterministic, not constant', () => {
  const vals = new Set<number>();
  for (let y = 0; y < 135; y++) {
    const v = seamJitter(y, 2);
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(SEAM_MAX);
    expect(seamJitter(y, 2)).toBe(v);
    vals.add(v);
  }
  expect(vals.size).toBeGreaterThan(1);
});

test('camera', () => {
  expect(camera(0)).toEqual({ x: 0, y: 0 });
  expect(camera(1)).toEqual({ x: 12, y: -4 });
});

test('eventPhase: −1 at t=0; deterministic; events never closer than gap[0]', () => {
  const gap: [number, number] = [3, 8];
  const dur = 2;
  expect(eventPhase(0, 7, gap, dur)).toBe(-1);
  const ends: number[] = [];
  const starts: number[] = [];
  let inside = false;
  for (let i = 0; i <= 2400; i++) {
    const t = i * 0.05;
    const ph = eventPhase(t, 7, gap, dur);
    expect(eventPhase(t, 7, gap, dur)).toBe(ph);
    expect(ph === -1 || (ph >= 0 && ph < 1)).toBe(true);
    if (ph >= 0 && !inside) starts.push(t);
    if (ph < 0 && inside) ends.push(t);
    inside = ph >= 0;
  }
  expect(starts.length).toBeGreaterThan(3);
  expect(starts[0]).toBeGreaterThanOrEqual(gap[0] - 1e-9);
  for (let i = 1; i < starts.length; i++) expect(starts[i] - (ends[i - 1] ?? 0)).toBeGreaterThanOrEqual(gap[0] - 0.06);
  expect(eventPhase(300, 7, gap, dur)).toBe(eventPhase(300, 7, gap, dur));
});

test('eventPhase: non-finite or negative t returns -1 without looping', () => {
  for (const t of [NaN, Infinity, -Infinity, -1]) expect(eventPhase(t, 7, [3, 8], 2)).toBe(-1);
});

test('worldAt: unsorted anchors follow the last reached stop', () => {
  // 500 and 300 are both reached at mid 600; the last (300) wins: G = 600, P = 300, I = 300, d = 300.
  expect(worldAt([500, 300, 900], 600, 900, 5000)).toEqual({ k: 1, p: 1, t: 0 });
});

function chunks(file: string) {
  const b = readFileSync(file);
  const out: { type: string; data: Buffer }[] = [];
  let o = 8;
  while (o < b.length) {
    const len = b.readUInt32BE(o);
    out.push({ type: b.toString('latin1', o + 4, o + 8), data: b.subarray(o + 8, o + 8 + len) });
    o += 12 + len;
  }
  return out;
}

test("PALETTE matches the flat scenes' PLTE", () => {
  const plte = chunks('public/scenes/hero.png').find((c) => c.type === 'PLTE')!.data;
  expect([...plte]).toEqual(PALETTE.flat());
  expect(PAL32).toHaveLength(28);
  expect(PAL32[0]).toBe(0xffecf1f4);
});
