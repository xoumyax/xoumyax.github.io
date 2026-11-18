import { test, expect } from 'vitest';
import { sceneAt, sectionAnchor, integerScale, pickSet, dissolveOrder } from '../../src/lib/scene-math';

const C = [100, 500, 900];

test('sceneAt: shares between centres, clamped at both ends', () => {
  expect(sceneAt(C, 300, false)).toEqual({ k: 0, t: 0.5 });
  expect(sceneAt(C, 50, false)).toEqual({ k: 0, t: 0 });
  expect(sceneAt(C, 900, false)).toEqual({ k: 2, t: 0 });
  expect(sceneAt(C, 2000, false)).toEqual({ k: 2, t: 0 });
});

test('sceneAt: reduced motion snaps at one half and never mixes', () => {
  expect(sceneAt(C, 300, true)).toEqual({ k: 1, t: 0 });
  expect(sceneAt(C, 250, true)).toEqual({ k: 0, t: 0 });
});

test('integerScale covers the viewport', () => {
  expect(integerScale(1440, 900, 240, 135)).toBe(7);
  expect(integerScale(390, 844, 120, 214)).toBe(4);
});

test('pickSet uses the portrait set when taller than wide', () => {
  expect(pickSet(390, 844)).toBe('port');
  expect(pickSet(1440, 900)).toBe('land');
});

test('dissolveOrder is deterministic and in [0,1)', () => {
  const a = dissolveOrder(10, 7);
  const b = dissolveOrder(10, 7);
  expect(a).toEqual(b);
  expect(a).toHaveLength(10);
  for (const v of a) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
});

test('sectionAnchor: short sections anchor at their centre, tall ones as their top arrives', () => {
  expect(sectionAnchor(100, 400, 900)).toBe(300);
  expect(sectionAnchor(100, 900, 900)).toBe(550);
  expect(sectionAnchor(100, 2242, 900)).toBe(550);
  expect(sectionAnchor(-50, 3000, 650)).toBe(275);
  // landing under a 72px sticky bar puts the viewport middle on the anchor
  expect(sectionAnchor(72, 2242, 900, 72)).toBe(450);
  expect(sectionAnchor(72, 300, 900, 72)).toBe(222);
});
