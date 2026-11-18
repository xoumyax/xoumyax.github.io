import { test, expect } from 'vitest';
import { validMeta } from '../../src/scripts/world/load';
import type { SceneMeta } from '../../src/lib/world';

const meta = (depths: number[]): SceneMeta => ({
  id: 'phd', world: [260, 230], view: { land: [10, 40], port: [70, 8] },
  layers: depths.map((depth, i) => ({ name: `l${i}`, depth, rate: 0.5 })),
  sprites: [{ name: 'bird', w: 4, h: 3, frames: 2, at: [20, 30], layer: 'l1', rest: 0 }],
});

test('a well-formed scene.json is valid', () => {
  expect(validMeta(meta([0, 0.3, 0.3, 1]), 'phd')).toBe(true);
});

test('layer depths must not decrease from layers[1] on (layers[0] always pans as depth 0)', () => {
  expect(validMeta(meta([0, 0.6, 0.3]), 'phd')).toBe(false);
  expect(validMeta(meta([0.9, 0.2, 0.5]), 'phd')).toBe(true);
});

test('a scene.json for another scene, or with a sprite on a missing layer, is invalid', () => {
  expect(validMeta(meta([0, 1]), 'ms')).toBe(false);
  const m = meta([0, 1]);
  m.sprites[0].layer = 'nope';
  expect(validMeta(m, 'phd')).toBe(false);
});
