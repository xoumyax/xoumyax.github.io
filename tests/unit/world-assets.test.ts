// Layered scene worlds on disk (public/scenes/<id>/): files, palette, opacity, margins, and the
// flat files being the world's rest frame. Covers every scene that has a scene.json.
import { test, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { SCENE_IDS, SCENE_SIZE, sceneUrl } from '../../src/lib/scenes';
import type { SceneMeta } from '../../src/lib/world';
import { CAM_X, CAM_Y, SEAM_MAX } from '../../src/lib/world-math';
import { chunks, readIndexed } from './png';

const KEY = 28; // the transparent index in world PNGs
const dir = (id: string) => `public/scenes/${id}`;
const ids = SCENE_IDS.filter((id) => existsSync(`${dir(id)}/scene.json`));
const metas = ids.map((id) => JSON.parse(readFileSync(`${dir(id)}/scene.json`, 'utf8')) as SceneMeta);
const files = (m: SceneMeta) => [...m.layers.map((l) => l.name), ...m.sprites.map((s) => s.name)].map((n) => `${dir(m.id)}/${n}.png`);
const flatPlte = chunks('public/scenes/hero.png').find((c) => c.type === 'PLTE')!.data.toString('hex');

test('the Ph.D. scene has a world', () => {
  expect(ids).toContain('phd');
});

test('scene.json matches its files', () => {
  for (const m of metas) {
    expect(m.id).toBeDefined();
    const sizes = [
      ...m.layers.map((l) => ({ n: l.name, w: m.world[0], h: m.world[1] })),
      ...m.sprites.map((s) => ({ n: s.name, w: s.w, h: s.h * s.frames })),
    ];
    for (const { n, w, h } of sizes) {
      const f = `${dir(m.id)}/${n}.png`;
      expect(existsSync(f), f).toBe(true);
      const ihdr = chunks(f).find((c) => c.type === 'IHDR')!.data;
      expect([ihdr.readUInt32BE(0), ihdr.readUInt32BE(4)], f).toEqual([w, h]);
      expect(ihdr[8], f).toBe(8);
      expect(ihdr[9], f).toBe(3);
    }
    for (const s of m.sprites) {
      expect(m.layers.some((l) => l.name === s.layer), s.name).toBe(true);
      expect(s.rest >= 0 && s.rest < s.frames, s.name).toBe(true);
    }
  }
});

test('world PNGs use the shared palette plus one transparent key', () => {
  expect(flatPlte.length / 2).toBe(84);
  for (const m of metas) for (const f of files(m)) {
    const cs = chunks(f);
    expect(cs.find((c) => c.type === 'PLTE')!.data.toString('hex'), f).toBe(flatPlte + '000000');
    expect(cs.find((c) => c.type === 'tRNS')!.data.toString('hex'), f).toBe('ff'.repeat(KEY) + '00');
    const { px } = readIndexed(f);
    expect(px.every((i) => i <= KEY), f).toBe(true);
  }
});

test('first layer is opaque and pans as depth 0', () => {
  for (const m of metas) {
    expect(m.layers[0].depth, m.id).toBe(0);
    const { px } = readIndexed(`${dir(m.id)}/${m.layers[0].name}.png`);
    expect(px.includes(KEY), m.id).toBe(false);
  }
});

test('views, camera travel and layer travel fit inside the world', () => {
  for (const m of metas) {
    const [W, H] = m.world;
    for (const set of ['land', 'port'] as const) {
      const { w, h } = SCENE_SIZE[set];
      const [vx, vy] = m.view[set];
      for (const l of m.layers) {
        // travel = [left, right, up, down] that a shift hook moves the layer: moving it right
        // samples further left, and so on. The camera reads up to ceil(CAM·rate) right and up;
        // the incoming scene of a pan reads up to SEAM_MAX left of its view.
        const [tl, tr, tu, td] = l.travel ?? [0, 0, 0, 0];
        const what = `${m.id} ${set} ${l.name}`;
        expect(vx - SEAM_MAX - tr, what).toBeGreaterThanOrEqual(0);
        expect(vx + w + Math.ceil(CAM_X * l.rate) + tl, what).toBeLessThanOrEqual(W);
        expect(vy - Math.ceil(CAM_Y * l.rate) - td, what).toBeGreaterThanOrEqual(0);
        expect(vy + h + tu, what).toBeLessThanOrEqual(H);
      }
    }
  }
});

test('rest composite equals the flat files', () => {
  for (const m of metas) {
    const [W, H] = m.world;
    const world = new Uint8Array(W * H);
    const layers = m.layers.map((l) => readIndexed(`${dir(m.id)}/${l.name}.png`));
    const sprites = m.sprites.map((s) => readIndexed(`${dir(m.id)}/${s.name}.png`));
    m.layers.forEach((l, i) => {
      layers[i].px.forEach((v, j) => { if (v !== KEY) world[j] = v; });
      m.sprites.forEach((s, j) => {
        if (s.layer !== l.name) return;
        const src = sprites[j].px;
        for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
          const v = src[(s.rest * s.h + y) * s.w + x];
          const wx = s.at[0] + x;
          const wy = s.at[1] + y;
          if (v !== KEY && wx >= 0 && wy >= 0 && wx < W && wy < H) world[wy * W + wx] = v;
        }
      });
    });
    for (const set of ['land', 'port'] as const) {
      const flat = readIndexed(`public${sceneUrl(m.id, set)}`);
      const [vx, vy] = m.view[set];
      let diff = 0;
      for (let y = 0; y < flat.h; y++) for (let x = 0; x < flat.w; x++)
        if (flat.px[y * flat.w + x] !== world[(vy + y) * W + vx + x]) diff++;
      expect(diff, `${m.id} ${set}`).toBe(0);
    }
  }
});

test('no metadata chunks in world PNGs', () => {
  for (const m of metas) for (const f of files(m))
    for (const c of chunks(f)) expect(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME'], f).not.toContain(c.type);
});
