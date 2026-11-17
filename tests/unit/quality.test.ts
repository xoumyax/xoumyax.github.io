import { test, expect } from 'vitest';
import { TIERS, pickInitialTier, governor, createGovernor } from '../../src/world/quality';

const fps = (v: number, n = 90) => Array.from({ length: n }, () => v);

test('tier values match the brief', () => {
  expect(TIERS.high).toEqual({ cellPx: 7.2, cellPxPhone: 6.0, scrubCount: 290000, shadowMap: 4096, renderScale: 1.0, dprCap: 2 });
  expect(TIERS.medium).toEqual({ cellPx: 7.2, cellPxPhone: 6.0, scrubCount: 174000, shadowMap: 2048, renderScale: 0.75, dprCap: 1.5 });
  expect(TIERS.low).toEqual({ cellPx: 8.0, cellPxPhone: 6.5, scrubCount: 87000, shadowMap: 1024, renderScale: 0.5, dprCap: 1.5 });
});

test('initial tier: weak phones start low, other phones medium', () => {
  expect(pickInitialTier({ isMobile: true, dpr: 3, deviceMemory: 2 })).toBe('low');
  expect(pickInitialTier({ isMobile: true, dpr: 3, deviceMemory: 8 })).toBe('medium');
});

test('initial tier: desktops start by DPR', () => {
  expect(pickInitialTier({ isMobile: false, dpr: 1, hardwareConcurrency: 12 })).toBe('high');
  expect(pickInitialTier({ isMobile: false, dpr: 2, hardwareConcurrency: 12 })).toBe('medium');
});

// Demote only on sustained trouble: median < 24 fps, or p90 frame time > 50 ms (Task 10b, I3).
// A display capped near 30 Hz (iOS Low Power Mode, battery saver) is healthy and must not demote.
test('governor steps down one tier on a sustained median under 24 fps', () => {
  expect(governor(fps(20), 'high')).toBe('medium');
  expect(governor(fps(20), 'medium')).toBe('low');
});

test('governor steps down when p90 frame time is over 50 ms, even with a healthy median', () => {
  // 80% of frames at 60 fps, 20% at 15 fps (66.7 ms): median 60, p90 frame time 66.7 ms
  expect(governor([...fps(60, 72), ...fps(15, 18)], 'high')).toBe('medium');
});

test('governor keeps a steady 30 Hz device (capped rAF) on its tier', () => {
  expect(governor(fps(30), 'medium')).toBe('medium');
  expect(governor(fps(30), 'high')).toBe('high');
  // 29–31 fps jitter, as a real capped display reports it
  const jitter = Array.from({ length: 180 }, (_, i) => 30 + Math.sin(i * 1.7) * 1.0);
  expect(governor(jitter, 'medium')).toBe('medium');
  expect(governor(jitter, 'low')).toBe('low');
});

test('governor falls back from low only on sustained trouble', () => {
  expect(governor(fps(15), 'low')).toBe('fallback');
  expect(governor(fps(30), 'low')).toBe('low');
});

test('governor is demote-only', () => {
  expect(governor(fps(60), 'medium')).toBe('medium');
  expect(governor(fps(60), 'low')).toBe('low');
});

// I4: the governor runs on elapsed time (a fake clock here: the frame times it is fed), not frame counts.
/** Feed frames of `ms` until `limitMs` of render time; returns [time, verdict] for each verdict. */
function drive(start: 'high' | 'medium' | 'low', ms: number | ((i: number) => number), limitMs: number) {
  const g = createGovernor(start);
  const out: Array<[number, string]> = [];
  for (let t = 0, i = 0; t < limitMs; i++) {
    const f = typeof ms === 'number' ? ms : ms(i);
    t += f;
    const v = g.frame(f);
    if (v) out.push([t, v]);
  }
  return out;
}

test('a 10 fps device reaches the fallback from medium within 6 s', () => {
  const v = drive('medium', 100, 20_000);
  expect(v.map(([, x]) => x)).toEqual(['low', 'fallback']);
  expect(v[1][0]).toBeLessThanOrEqual(6000);
});

test('a 10 fps device with jitter still reaches the fallback within 6 s, from high too', () => {
  const v = drive('medium', (i) => 100 + 6 * Math.sin(i * 1.3), 20_000);
  expect(v.at(-1)?.[1]).toBe('fallback');
  expect(v.at(-1)![0]).toBeLessThanOrEqual(6000);
  const h = drive('high', 100, 20_000);
  expect(h.at(-1)?.[1]).toBe('fallback');
  expect(h.at(-1)![0]).toBeLessThanOrEqual(8000);
});

test('fast path: a first second over 100 ms a frame goes straight to low, then the next bad window to the fallback', () => {
  const v = drive('high', 125, 20_000);
  // the first (start-up) frame is excluded, so the verdict lands one frame after the 1 s mark
  expect(v[0][1]).toBe('low');
  expect(v[0][0]).toBeLessThanOrEqual(1250);
  expect(v.map(([, x]) => x)).toEqual(['low', 'fallback']);
  expect(v[1][0]).toBeLessThanOrEqual(4000);
});

test('a very slow device (2 fps) is judged without waiting for 20 frames', () => {
  const v = drive('medium', 500, 60_000);
  expect(v.map(([, x]) => x)).toEqual(['low', 'fallback']);
  expect(v[1][0]).toBeLessThanOrEqual(5000);
});

test('a steady 30 fps device (capped rAF) never demotes', () => {
  expect(drive('medium', 1000 / 30, 120_000)).toEqual([]);
  expect(drive('high', (i) => 1000 / (30 + Math.sin(i * 1.7)), 120_000)).toEqual([]);
  expect(drive('low', 1000 / 30, 120_000)).toEqual([]);
});

test('a 60 fps device with a slow first second (shader compile) keeps its tier', () => {
  // a 700 ms hitch, then 60 fps: the first second averages well under 100 ms a frame
  expect(drive('high', (i) => (i === 0 ? 700 : 1000 / 60), 60_000)).toEqual([]);
});

test('governor ignores a handful of slow frames and short samples', () => {
  // 5 of 90 frames at 100 ms: under the p90 line
  expect(governor([...fps(60, 85), ...fps(10, 5)], 'high')).toBe('high');
  expect(governor(fps(10, 5), 'high')).toBe('high'); // too few samples to judge
});

test('fast path: one slow start-up frame does not demote a healthy device', () => {
  const g = createGovernor('medium');
  expect(g.frame(1200)).toBeNull(); // shader upload / first paint
  for (let i = 0; i < 600; i++) g.frame(1000 / 60);
  expect(g.tier).toBe('medium');
});
