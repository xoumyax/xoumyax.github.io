import { test, expect } from 'vitest';
import { journeyProgress, stopU, easeToward, clampView } from '../../src/world/journey-math';

// The engine's authoritative stop u's (WorldController.journeyForStop), srm → river.
const US = [0, 0.13, 0.26, 0.38, 0.5, 1];

/** Six stacked sections of the given heights, scrolled so the page top sits `scroll` px above the viewport. */
function layout(heights: number[], scroll: number, start = 900) {
  let y = start - scroll;
  return heights.map((h) => { const s = { top: y, height: h }; y += h; return s; });
}

test('stopU spaces stops evenly from 0 to 1', () => {
  expect(stopU(0, 6)).toBe(0);
  expect(stopU(5, 6)).toBe(1);
  expect(stopU(2, 5)).toBeCloseTo(0.5);
  expect(stopU(0, 1)).toBe(0);
});

test('journeyProgress is monotonic as stop tops decrease', () => {
  const heights = [820, 900, 1100, 1250, 1400, 860];
  for (const us of [US, undefined]) {
    let prev = -1;
    for (let scroll = 0; scroll < 9000; scroll += 7) {
      const p = journeyProgress(layout(heights, scroll), 900, us);
      expect(p).toBeGreaterThanOrEqual(prev);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
      prev = p;
    }
    expect(prev).toBe(1);
  }
});

test('journeyProgress: above the first stop is the trailhead', () => {
  expect(journeyProgress(layout([800, 800, 800, 800, 800, 800], 0), 900, US)).toBe(0);
});

test('journeyProgress: the stop under the 40% line maps to its u', () => {
  const heights = [820, 900, 1100, 1250, 1400, 860];
  for (const [i, u] of US.entries()) {
    const stops = layout(heights, 0);
    // put stop i's top 100 px above the 40% line
    const shift = stops[i].top - (0.4 * 900 - 100);
    const p = journeyProgress(stops.map((s) => ({ top: s.top - shift, height: s.height })), 900, US);
    expect(p).toBeCloseTo(u, 6);
  }
});

test('journeyProgress: a deep link (stop top at scroll-padding-top) lands exactly on the stop', () => {
  // `/#stop-x` puts the section's top at scroll-padding-top (bar 56 px + 1rem = 72 px).
  // Desktop sections are at least 88svh tall; phone sections at least 72svh.
  for (const [vh, minH] of [[900, 0.88 * 900], [844, 0.72 * 844], [390, 0.88 * 390]] as const) {
    for (const [i, u] of US.entries()) {
      const stops = US.map((_, j) => ({ top: 72 + (j - i) * minH, height: minH }));
      expect(journeyProgress(stops, vh, US)).toBeCloseTo(u, 6);
    }
  }
});

test('journeyProgress glides between stops (no snap)', () => {
  const heights = [800, 800, 800, 800, 800, 800];
  const values = new Set<number>();
  for (let scroll = 0; scroll < 6000; scroll += 25) values.add(Number(journeyProgress(layout(heights, scroll), 900, US).toFixed(4)));
  expect(values.size).toBeGreaterThan(40);
});

test('easeToward closes half the gap in one half-life', () => {
  expect(easeToward(0, 1, 0.35)).toBeCloseTo(0.5, 6);
  expect(easeToward(0, 1, 0.2, 0.2)).toBeCloseTo(0.5, 6);
  expect(easeToward(10, 2, 0.7)).toBeCloseTo(4, 6);
  expect(easeToward(0.3, 0.3, 1)).toBe(0.3);
});

test('clampView clamps yaw ±40, pitch 48–62, zoom 0.6–1.8', () => {
  expect(clampView({ yaw: 90, pitch: 10, zoom: 9 })).toEqual({ yaw: 40, pitch: 48, zoom: 1.8 });
  expect(clampView({ yaw: -90, pitch: 99, zoom: 0.1 })).toEqual({ yaw: -40, pitch: 62, zoom: 0.6 });
  expect(clampView({ yaw: 5, pitch: 52, zoom: 1 })).toEqual({ yaw: 5, pitch: 52, zoom: 1 });
});
