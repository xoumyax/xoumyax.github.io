import { test, expect } from 'vitest';
import { lastYear } from '../../src/lib/years';

test('lastYear reads the end of a range, including a two-digit end', () => {
  expect(lastYear('2024–26')).toBe(2026);
  expect(lastYear('2022-23')).toBe(2023);
  expect(lastYear('1999–01')).toBe(2001);
  expect(lastYear('2024–')).toBe(2024);
  expect(lastYear('2026')).toBe(2026);
  expect(lastYear('Fall 2022 – Fall 2023')).toBe(2023);
  expect(lastYear('Next')).toBe(0);
});
