// Mode II background clips (public/mode2/, cut by scripts/mode2-clips.sh): silent, free of
// metadata boxes, and light. Box types are read from the box tree (moov and its children), not
// from the compressed picture data, where any byte pattern can turn up by chance.
import { test, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { CLIP_IDS } from '../../src/lib/mode2';

const DIR = 'public/mode2';
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf', 'udta', 'meta', 'ilst']);

/** Every box type in the file, as paths (moov/trak/mdia/hdlr), with each hdlr's handler type. */
function boxTree(file: string): string[] {
  const b = readFileSync(file);
  const out: string[] = [];
  const walk = (start: number, end: number, path: string) => {
    for (let o = start; o + 8 <= end; ) {
      let size = b.readUInt32BE(o);
      let hdr = 8;
      if (size === 1) { size = Number(b.readBigUInt64BE(o + 8)); hdr = 16; } else if (size === 0) size = end - o;
      if (size < hdr || o + size > end) throw new Error(`${file}: bad box at ${o}`);
      const type = b.toString('latin1', o + 4, o + 8);
      const here = `${path}/${type}`;
      out.push(type === 'hdlr' ? `${here}:${b.toString('latin1', o + hdr + 8, o + hdr + 12)}` : here);
      if (CONTAINERS.has(type)) walk(o + hdr + (type === 'meta' ? 4 : 0), o + size, here);
      o += size;
    }
  };
  walk(0, b.length, '');
  return out;
}

const files = readdirSync(DIR);
const size = (f: string) => statSync(`${DIR}/${f}`).size;

test('every clip id has a desktop clip, a phone clip and a poster, and nothing else is there', () => {
  const want = CLIP_IDS.flatMap((id) => [`${id}.mp4`, `${id}-m.mp4`, `${id}.jpg`]).sort();
  expect([...files].sort()).toEqual(want);
});

test('the clips have one video track, no sound, and no user-data or © metadata boxes', () => {
  for (const f of files.filter((f) => f.endsWith('.mp4'))) {
    const tree = boxTree(`${DIR}/${f}`);
    expect(tree.filter((t) => t.startsWith('/moov/trak/mdia/hdlr:')), f).toEqual(['/moov/trak/mdia/hdlr:vide']);
    expect(tree.some((t) => /:soun$/.test(t) || t.endsWith('/smhd')), f).toBe(false);
    expect(tree.some((t) => t.includes('/udta') || t.includes('©') || t.includes('/ilst')), f).toBe(false);
    // faststart: the index comes before the picture data, so playback starts on the first bytes
    expect(tree.indexOf('/moov'), f).toBeLessThan(tree.indexOf('/mdat'));
  }
});

test('the posters carry no EXIF or comment segments', () => {
  for (const f of files.filter((f) => f.endsWith('.jpg'))) {
    const b = readFileSync(`${DIR}/${f}`);
    expect([b[0], b[1]], f).toEqual([0xff, 0xd8]);
    // walk the marker segments up to the start of scan
    for (let o = 2; o < b.length; ) {
      const m = b[o + 1];
      if (m === 0xda) break;
      expect([0xe1, 0xfe], `${f} marker ${m.toString(16)}`).not.toContain(m); // APP1 (EXIF/XMP), COM
      o += 2 + b.readUInt16BE(o + 2);
    }
  }
});

test('weights: desktop clip ≤ 2 MB, phone clip ≤ 0.8 MB, poster ≤ 250 KB, all of public/mode2 ≤ 12 MB', () => {
  for (const id of CLIP_IDS) {
    expect(size(`${id}.mp4`), id).toBeLessThanOrEqual(2_000_000);
    expect(size(`${id}-m.mp4`), id).toBeLessThanOrEqual(800_000);
    expect(size(`${id}.jpg`), id).toBeLessThanOrEqual(250_000);
  }
  expect(files.reduce((n, f) => n + size(f), 0)).toBeLessThanOrEqual(12_000_000);
});
