// Scene acts: the rest rule (p = 0, t = 0 draws exactly the rest frames), every ambient effect at
// rest at t = 0, sprite names and frames that exist, and the pure p → subject mappings.
import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ACTS } from '../../src/scripts/world/acts';
import type { DrawCtx } from '../../src/scripts/world/acts';
import type { SceneMeta } from '../../src/lib/world';
import type { SceneId } from '../../src/lib/scenes';
import { PAL32 } from '../../src/lib/palette';
import { horseFrame } from '../../src/scripts/world/acts/phd';
import { doorFrame } from '../../src/scripts/world/acts/now';

const meta = (id: string) => JSON.parse(readFileSync(`public/scenes/${id}/scene.json`, 'utf8')) as SceneMeta;
const ids = Object.keys(ACTS) as SceneId[];

type Call = ['plot', number, number, number] | ['sprite', string, number, number | undefined, number | undefined];
function recorder(m: SceneMeta): { d: DrawCtx; calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    d: {
      plot: (x, y, c) => { calls.push(['plot', x, y, c]); },
      sprite: (name, frame, x, y) => { calls.push(['sprite', name, frame, x, y]); },
      world: [m.world[0], m.world[1]],
    },
  };
}

test('acts exist for now and phd', () => {
  expect(ids).toEqual(expect.arrayContaining(['now', 'phd']));
});

test('at p = 0, t = 0 every hook draws exactly its layer\'s rest sprites at `at`, and every shift is [0, 0]', () => {
  for (const id of ids) {
    const m = meta(id);
    const act = ACTS[id]!;
    for (const name of Object.keys(act.after ?? {})) expect(m.layers.map((l) => l.name), `${id} ${name}`).toContain(name);
    for (const L of m.layers) {
      const hook = act.after?.[L.name];
      if (hook) {
        const { d, calls } = recorder(m);
        hook(d, 0, 0);
        const want = m.sprites.filter((s) => s.layer === L.name).map((s) => s.name + ':' + s.rest + '@' + s.at.join(','));
        const got = calls.map((c) => (c[0] === 'plot' ? 'plot' : c[1] + ':' + c[2] + '@' + (c[3] === undefined ? m.sprites.find((s) => s.name === c[1])!.at.join(',') : `${c[3]},${c[4]}`)));
        expect(got, `${id} ${L.name}`).toEqual(want);
      }
      const sh = act.shift?.[L.name];
      if (sh) expect(sh(0, 0), `${id} ${L.name}`).toEqual([0, 0]);
    }
  }
});

test('ambient effects are at rest at t = 0 whatever p is', () => {
  // At t = 0 only the subject may move: no plots, and sprites other than the subject at rest.
  const subject: Record<string, string> = { phd: 'horse', now: 'door' };
  for (const id of ids) {
    const m = meta(id);
    const act = ACTS[id]!;
    for (let p = 0; p <= 1; p += 0.05) for (const L of m.layers) {
      const hook = act.after?.[L.name];
      if (hook) {
        const { d, calls } = recorder(m);
        hook(d, p, 0);
        for (const c of calls) {
          expect(c[0], `${id} ${L.name} p=${p}`).toBe('sprite');
          if (c[0] !== 'sprite' || c[1] === subject[id]) continue;
          const s = m.sprites.find((x) => x.name === c[1])!;
          expect([c[2], c[3] ?? s.at[0], c[4] ?? s.at[1]], `${id} ${c[1]} p=${p}`).toEqual([s.rest, ...s.at]);
        }
      }
      const sh = act.shift?.[L.name];
      if (sh) expect(sh(p, 0)).toEqual([0, 0]);
    }
  }
});

test('hooks draw only sprites that exist, whole frames in range, colours from the palette', () => {
  const pal = new Set(PAL32);
  for (const id of ids) {
    const m = meta(id);
    const act = ACTS[id]!;
    const seen = new Set<string>();
    for (let t = 0; t < 240; t += 0.1) for (const p of [0, 0.3, 0.75, 1]) for (const L of m.layers) {
      const hook = act.after?.[L.name];
      if (!hook) continue;
      const { d, calls } = recorder(m);
      hook(d, p, t);
      for (const c of calls) {
        if (c[0] === 'plot') {
          expect(pal.has(c[3]), `${id} colour`).toBe(true);
          expect(Number.isFinite(c[1]) && Number.isFinite(c[2])).toBe(true);
          continue;
        }
        const s = m.sprites.find((x) => x.name === c[1]);
        expect(s, `${id} ${c[1]}`).toBeDefined();
        expect(s!.layer, `${id} ${c[1]} drawn in its own layer`).toBe(L.name);
        expect(Number.isInteger(c[2]) && c[2] >= 0 && c[2] < s!.frames, `${id} ${c[1]} frame ${c[2]}`).toBe(true);
        seen.add(`${c[1]}:${c[2]}`);
      }
    }
    // every sprite of a hooked layer is drawn, and ambient sprites leave their rest frame some time
    for (const s of m.sprites) if (act.after?.[s.layer]) expect(seen.has(`${s.name}:${s.rest}`), `${id} ${s.name}`).toBe(true);
    for (const s of m.sprites) if (act.after?.[s.layer] && s.frames > 1) {
      expect([...seen].some((k) => k.startsWith(s.name + ':') && k !== `${s.name}:${s.rest}`), `${id} ${s.name} moves`).toBe(true);
    }
  }
});

test('phd: the head pose is a pure step function of p: up, lowering, grazing, lifting, up', () => {
  const pose = (p: number) => horseFrame(p) >> 1;
  expect(pose(0)).toBe(0);
  expect(pose(0.079)).toBe(0);
  for (const p of [0.08, 0.1, 0.2, 0.24]) expect([1, 2], String(p)).toContain(pose(p));
  expect(pose(0.1)).toBeLessThanOrEqual(pose(0.2));
  for (const p of [0.25, 0.4, 0.69]) expect(pose(p), String(p)).toBe(3);
  for (const p of [0.7, 0.8, 0.89]) expect([1, 2], String(p)).toContain(pose(p));
  expect(pose(0.75)).toBeGreaterThanOrEqual(pose(0.85));
  for (const p of [0.9, 0.95, 1]) expect(pose(p), String(p)).toBe(0);
  // the whole map, as a table: [from p, frame]
  const table: [number, number][] = [[0, 0], [0.08, 2], [0.165, 4], [0.25, 6], [0.7, 4], [0.8, 2], [0.9, 0]];
  const want = (p: number) => table.filter(([q]) => p >= q).at(-1)![1];
  const sorted = Array.from({ length: 1001 }, (_, i) => i / 1000);
  for (const p of sorted) expect(horseFrame(p), String(p)).toBe(want(p));
  // no hysteresis: scrolled in a shuffled order (big jumps both ways), each p gives the frame it gives in order
  const inOrder = new Map(sorted.map((p) => [p, horseFrame(p)]));
  const shuffled = sorted.map((_, i) => sorted[(i * 7919) % sorted.length]);
  for (const p of shuffled) expect(horseFrame(p), String(p)).toBe(inOrder.get(p));
  for (let p = 0; p <= 1; p += 0.01) expect(horseFrame(p) % 2, 'no ear flick from scroll').toBe(0);
});

test('now: the door frame is non-decreasing in p, dark at p = 0, fully lit by p = 1', () => {
  const frames = meta('now').sprites.find((s) => s.name === 'door')!.frames;
  expect(doorFrame(0)).toBe(0);
  expect(doorFrame(1)).toBe(frames - 1);
  let prev = 0;
  for (let p = 0; p <= 1.0001; p += 0.001) {
    const f = doorFrame(p);
    expect(Number.isInteger(f) && f >= 0 && f < frames).toBe(true);
    expect(f).toBeGreaterThanOrEqual(prev);
    prev = f;
  }
  expect(doorFrame(-1)).toBe(0);
  expect(doorFrame(2)).toBe(frames - 1);
});
