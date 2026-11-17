import { test, expect } from 'vitest';
import { pagerWindow } from '../../src/lib/deck';

test('pagerWindow shows everything when the row fits', () => {
  expect(pagerWindow(9, 0, true)).toEqual({ lo: 0, hi: 8 });
});
test('pagerWindow slides a five-wide window clamped to the ends', () => {
  expect(pagerWindow(9, 0, false)).toEqual({ lo: 0, hi: 4 });
  expect(pagerWindow(9, 4, false)).toEqual({ lo: 2, hi: 6 });
  expect(pagerWindow(9, 8, false)).toEqual({ lo: 4, hi: 8 });
  expect(pagerWindow(3, 1, false)).toEqual({ lo: 0, hi: 2 });
});
