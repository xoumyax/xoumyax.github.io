import { test, expect } from 'vitest';
import { nextShown, posterPositions, doorName, DOORS } from '../../src/world/landmarks';

const ORDER = ['trailhead', 'ranger', 'school', 'trailer', 'dome'] as const;

test('door names and routes follow the landmark → section mapping', () => {
  expect(ORDER.map(doorName)).toEqual([
    'Study — trailhead', 'Resume — ranger station', 'Teaching — adobe schoolhouse', 'Projects — trailer camp', 'Personal — geodesic dome',
  ]);
  expect(ORDER.map((id) => DOORS[id].route)).toEqual(['/study/', '/resume/', '/teaching/', '/projects/', '/personal/']);
});

test('nextShown: focus moves to the next showing door, wrapping, or nowhere', () => {
  expect(nextShown(ORDER, { school: true, dome: true }, 'ranger')).toBe('school');
  expect(nextShown(ORDER, { trailhead: true }, 'dome')).toBe('trailhead');
  expect(nextShown(ORDER, { ranger: true }, 'ranger')).toBe(null); // only itself
  expect(nextShown(ORDER, {}, 'school')).toBe(null);
});

test('posterPositions maps capture fractions through object-fit: cover', () => {
  const shot = { width: 1440, height: 900, landmarks: { ranger: { x: 0.5, y: 0.5, visible: true }, dome: { x: 0, y: 0, visible: false } } };
  // same aspect: plain scale
  expect(posterPositions(shot, 720, 450)).toEqual({ ranger: { x: 360, y: 225, visible: true }, dome: { x: 0, y: 0, visible: false } });
  // taller box: height fills, the sides crop equally
  const p = posterPositions(shot, 400, 900);
  expect(p.ranger).toEqual({ x: 200, y: 450, visible: true });
  expect(p.dome!.x).toBeCloseTo((400 - 1440) / 2);
});
