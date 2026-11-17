import { test, expect } from 'vitest';
import { landmarks, roadAt, journeyS, STOP_U, type StopKey } from '../../src/world/bake';
import { road } from '../../src/world/scene/road';

// I2 (Task 10b): `road.curve` runs from the trailhead (t = 0, the srm stop) to the river stop (t = 1),
// arc-length parametrised, so curve t equals journey u and Task 12 can place figures with
// `road.curve.getPointAt(journeyForStop(id))`.
//
// "Near the landmark" is measured from the curve point to the landmark's footprint edge
// (centre distance minus its footprint radius): buildings stand beside the road, not on it.
// The river stop has no building; there the point must be the road's end.
const STOP_LANDMARK: Partial<Record<StopKey, string>> = { srm: 'trailhead', cognizant: 'ranger', ms: 'school', phd: 'trailer', now: 'dome' };

test('the curve point at each stop u lies within 3 units of that stop\'s landmark', () => {
  const lm = landmarks();
  for (const [stop, id] of Object.entries(STOP_LANDMARK) as [StopKey, string][]) {
    const l = lm.find((m) => m.id === id)!;
    const p = road.curve.getPointAt(STOP_U[stop]);
    const edge = Math.hypot(p.x - l.x, p.z - l.z) - l.radius;
    expect(edge, `${stop} → ${id}`).toBeLessThanOrEqual(3);
  }
  const end = road.curve.getPointAt(STOP_U.river), last = roadAt(1e9);
  expect(Math.hypot(end.x - last.x, end.z - last.z)).toBeLessThan(0.5);
});

test('curve t agrees with the engine\'s journey mapping (camera and figures share one road)', () => {
  for (const u of [0, 0.13, 0.26, 0.38, 0.5, 0.74, 0.9, 1]) {
    const a = road.curve.getPointAt(u), b = roadAt(journeyS(u));
    expect(Math.hypot(a.x - b.x, a.z - b.z), `u=${u}`).toBeLessThan(0.15);
    expect(Math.abs(a.y - b.y), `u=${u}`).toBeLessThan(0.15);
  }
});
