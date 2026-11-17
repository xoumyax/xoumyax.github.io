import { test, expect } from 'vitest';
import { STOP_U } from '../../src/world/bake';
import {
  FIGURE_PERIOD, WALK_FRAMES_PER_LOOP, horse, horseInto, newHorsePose, newWalkPose, walk, walkAnchor, walkCentre, walkFrame, walkInto,
} from '../../src/world/scene/figure-motion';
import { HORSE_COAT, HORSE_PALETTE } from '../../src/world/scene/figure-art';

// Task 12b. Walk frames alternate with real stepping; the pure motion functions have allocation-free
// out-param variants (I1); the walk is anchored to the nearest stop, not to the camera's u.

/** One stride: two steps = 2 walk frames … the loop has WALK_FRAMES_PER_LOOP frames over 4 pos units. */
const STRIDE_S = FIGURE_PERIOD / (WALK_FRAMES_PER_LOOP / 2);

test('walk frames alternate over a stride (constant u): legs apart, passing, legs apart, passing', () => {
  // t = 2 s is mid-walk (moving) in the loop
  const t0 = 2;
  expect(walk(t0).moving).toBe(true);
  const seen = new Set<number>();
  let changes = 0, prev = walkFrame(t0);
  for (let k = 1; k <= 40; k++) {
    const f = walkFrame(t0 + (k / 40) * STRIDE_S);
    expect(f).toBeGreaterThanOrEqual(0);
    seen.add(f);
    if (f !== prev) { changes++; expect(f, 'frames step in order').toBe((prev + 1) % 4); }
    prev = f;
  }
  expect(seen.size).toBeGreaterThanOrEqual(2);
  expect(changes).toBeGreaterThanOrEqual(1);
});

test('walkInto / horseInto fill a caller-owned pose and agree with walk / horse', () => {
  const wp = newWalkPose(), hp = newHorsePose();
  for (const t of [0, 1.7, 5, 9, 13.3, 20, 23.9]) {
    expect(walkInto(t, wp)).toBe(wp);
    expect({ ...wp }).toEqual(walk(t));
    expect(horseInto(t, hp)).toBe(hp);
    const h = horse(t);
    for (const k of ['x', 'z', 'heading', 'speed', 'gait', 'swish'] as const) expect(hp[k]).toBeCloseTo(h[k], 9);
  }
});

test('the walk is anchored to the nearest stop: the same segment anywhere inside a stop\'s band', () => {
  expect(walkAnchor(STOP_U.ms)).toBe(STOP_U.ms);
  expect(walkAnchor(STOP_U.ms + 0.04)).toBe(STOP_U.ms);
  expect(walkAnchor(STOP_U.ms - 0.04)).toBe(STOP_U.ms);
  expect(walkAnchor(0.7)).toBe(STOP_U.now);
  expect(walkAnchor(0.8)).toBe(STOP_U.river);
  expect(walkCentre(walkAnchor(0.27))).toBe(walkCentre(walkAnchor(0.3)));
});

test('the horse colour lives in one named constant', () => {
  expect(HORSE_COAT).toMatch(/^#[0-9a-f]{6}$/i);
  expect(HORSE_PALETTE.c.fg.toLowerCase()).toBe(HORSE_COAT.toLowerCase());
});
