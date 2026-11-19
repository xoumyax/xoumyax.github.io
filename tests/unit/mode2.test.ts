import { test, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { CLIP_IDS, STOP_CLIP, STOP_SHORT, clearedShare, clipUrl, posterUrl, slidesLabel, stopFromHash, tabKeyTarget } from '../../src/lib/mode2';
import { artHref } from '../../src/lib/art-style';
import { STOP_IDS } from '../../src/lib/stops';
import { getJourney } from '../../src/lib/data';

test('every stop has a clip on disk and a short tab label', () => {
  expect(Object.keys(STOP_CLIP)).toEqual([...STOP_IDS]);
  expect(Object.keys(STOP_SHORT)).toEqual(getJourney().stops.map((s) => s.id));
  for (const id of CLIP_IDS) {
    for (const f of [clipUrl(id, false), clipUrl(id, true), posterUrl(id)]) expect(existsSync(`public${f}`), f).toBe(true);
  }
  // the designer's mapping (mode2 brief, call 2)
  expect(STOP_CLIP).toEqual({ now: 'glamping', phd: 'hero', ms: 'littlebirdy', cognizant: 'road', srm: 'road', river: 'campground' });
});

test('stopFromHash accepts only known #stop-<id> hashes', () => {
  expect(stopFromHash('#stop-phd', STOP_IDS)).toBe('phd');
  expect(stopFromHash('#stop-nope', STOP_IDS)).toBeNull();
  expect(stopFromHash('#main', STOP_IDS)).toBeNull();
  expect(stopFromHash('', STOP_IDS)).toBeNull();
});

test('tab keys wrap with the arrows and jump with Home/End', () => {
  expect(tabKeyTarget('ArrowRight', 5, 6)).toBe(0);
  expect(tabKeyTarget('ArrowLeft', 0, 6)).toBe(5);
  expect(tabKeyTarget('ArrowRight', 2, 6)).toBe(3);
  expect(tabKeyTarget('Home', 4, 6)).toBe(0);
  expect(tabKeyTarget('End', 1, 6)).toBe(5);
  expect(tabKeyTarget('Enter', 1, 6)).toBeNull();
});

test('clearedShare counts transparent pixels on the sample grid', () => {
  const w = 8, h = 8;
  const px = new Uint8ClampedArray(w * h * 4).fill(255);
  expect(clearedShare(px, w, h, 1)).toBe(0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w / 2; x++) px[(y * w + x) * 4 + 3] = 0;
  expect(clearedShare(px, w, h, 1)).toBe(0.5);
  expect(clearedShare(px, w, h, 2)).toBe(0.5);
  expect(clearedShare(new Uint8ClampedArray(0), 0, 0)).toBe(0);
});

test('slidesLabel reads the cards in view', () => {
  expect(slidesLabel(0, 1, 6)).toBe('1 / 6');
  expect(slidesLabel(0, 3, 6)).toBe('1–3 / 6');
  expect(slidesLabel(4, 3, 6)).toBe('5–6 / 6');
  expect(slidesLabel(9, 1, 6)).toBe('6 / 6');
  expect(slidesLabel(0, 0, 1)).toBe('1 / 1');
});

test('the art switch carries only a stop deep link across', () => {
  expect(artHref('pixel', '#stop-ms')).toBe('/road/#stop-ms');
  expect(artHref('ascii', '#stop-ms')).toBe('/?style=ascii#stop-ms');
  expect(artHref('pixel', '#main')).toBe('/road/');
  expect(artHref('ascii', '')).toBe('/?style=ascii');
});
