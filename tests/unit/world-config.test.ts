import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ignoreResize, URL_BAR_PX } from '../../src/world/viewport';
import { BASE_PITCH, VIEW_LIMITS, clampView } from '../../src/world/journey-math';
import { landmarks } from '../../src/world/bake';
import { getJourney } from '../../src/lib/data';

// I6: a phone's URL bar moving the viewport by < 120 px (height only) does not resize the world.
test('height-only changes under 120 px are ignored on a coarse pointer only', () => {
  const a = { w: 390, h: 844 };
  expect(URL_BAR_PX).toBe(120);
  expect(ignoreResize(a, { w: 390, h: 844 - 84 }, true)).toBe(true);
  expect(ignoreResize(a, { w: 390, h: 844 + 119 }, true)).toBe(true);
  expect(ignoreResize(a, { w: 390, h: 844 - 120 }, true)).toBe(false); // a real resize (keyboard, split view)
  expect(ignoreResize(a, { w: 400, h: 844 }, true)).toBe(false); // width always applies (rotation)
  expect(ignoreResize(a, { w: 390, h: 800 }, false)).toBe(false); // desktop windows resize normally
});

// M7: one definition each for the base pitch and the view limits, and one source for which
// landmark each stop frames (journey.yaml; boot reads it from the DOM, /world-test from the YAML).
test('the engine and boot take BASE_PITCH and the view limits from journey-math', () => {
  for (const f of ['src/world/index.ts', 'src/world/boot.ts']) {
    const src = readFileSync(f, 'utf8');
    expect(src, f).toMatch(/import \{[^}]*BASE_PITCH[^}]*\} from '\.\/journey-math'/);
    expect(src, f).not.toMatch(/const BASE_PITCH\s*=/);
    expect(src, f).not.toMatch(/\b48, 62\b|-40, 40|0\.6, 1\.8/);
  }
  expect(BASE_PITCH).toBe(52);
  expect(clampView({ yaw: 99, pitch: 0, zoom: 9 })).toEqual({ yaw: VIEW_LIMITS.yaw[1], pitch: VIEW_LIMITS.pitch[0], zoom: VIEW_LIMITS.zoom[1] });
  expect(readFileSync('src/world/index.ts', 'utf8')).not.toMatch(/STOP_LANDMARK\b.*'trailhead'/);
});

test('every landmark building stands at the stop journey.yaml frames it from', () => {
  const fromYaml = Object.fromEntries(getJourney().stops.filter((s) => s.landmark).map((s) => [s.landmark!, s.id]));
  const fromBake = Object.fromEntries(landmarks().map((l) => [l.id, l.stop]));
  expect(fromBake).toEqual(fromYaml);
});

// M10: the posters and landmarks.json are one versioned pair; a recapture rewrites both.
test('landmarks.json carries the content hash of the posters it was captured with', async () => {
  const { posterVersion } = await import('../../scripts/poster-version.mjs');
  const table = JSON.parse(readFileSync('public/world/landmarks.json', 'utf8')) as { version?: string };
  expect(table.version).toMatch(/^[0-9a-f]{12}$/);
  expect(table.version).toBe(posterVersion('public/world'));
});
