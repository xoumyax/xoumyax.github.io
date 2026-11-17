import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SCENE_IDS, SCENE_SIZE, sceneUrl } from '../../src/lib/scenes';
import { getJourney } from '../../src/lib/data';
import { trackedTextFiles } from './helpers';

function chunks(file: string) {
  const b = readFileSync(file);
  const out: { type: string; data: Buffer }[] = [];
  let o = 8;
  while (o < b.length) {
    const len = b.readUInt32BE(o);
    out.push({ type: b.toString('latin1', o + 4, o + 8), data: b.subarray(o + 8, o + 8 + len) });
    o += 12 + len;
  }
  return out;
}
const pub = (url: string) => 'public' + url;
const all = SCENE_IDS.flatMap((id) => (['land', 'port'] as const).map((set) => ({ id, set, file: pub(sceneUrl(id, set)) })));

test('every scene id has both files at the stated sizes', () => {
  expect(all).toHaveLength(14);
  for (const { set, file } of all) {
    const ihdr = chunks(file).find((c) => c.type === 'IHDR')!.data;
    expect([ihdr.readUInt32BE(0), ihdr.readUInt32BE(4)], file).toEqual([SCENE_SIZE[set].w, SCENE_SIZE[set].h]);
    expect(ihdr[9], file).toBe(3);
  }
});

test('all 14 scenes share one palette', () => {
  const plte = all.map(({ file }) => chunks(file).find((c) => c.type === 'PLTE')!.data.toString('hex'));
  expect(new Set(plte).size).toBe(1);
  expect(plte[0].length / 2).toBeLessThanOrEqual(28 * 3);
});

test('no metadata chunks', () => {
  for (const f of [...all.map((a) => a.file), 'public/og.png'])
    for (const c of chunks(f)) expect(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME'], f).not.toContain(c.type);
});

test('og image is 1440×810', () => {
  const ihdr = chunks('public/og.png').find((c) => c.type === 'IHDR')!.data;
  expect([ihdr.readUInt32BE(0), ihdr.readUInt32BE(4)]).toEqual([1440, 810]);
});

test('scene ids match the journey', () => {
  expect(SCENE_IDS.slice(1)).toEqual(getJourney().stops.map((s) => s.id));
});

test('no photo filenames in the repo', () => {
  const bad = trackedTextFiles().filter((f) => f !== 'scripts/pixel-scenes.py' && /DSC0\d|IMG_\d/.test(readFileSync(f, 'utf8')));
  expect(bad).toEqual([]);
});
