// The frame maths, shared by both renderers: passes() lists the (scene, layer) passes of a frame
// in depth order with each pass's offset terms; compose() is the CPU reference at one pixel per
// world px (it rounds each term the way the backdrop always has, and the unit tests pin it);
// layerCalls() / paintLayer() draw one layer and its hook output in world px for the screen
// renderer (./screen.ts), which places them with sub-pixel offsets. DOM-free so it can be unit-tested.
// Pixels are Uint32Array words (0xAABBGGRR, the ImageData layout).
import type { SceneSet } from '../../lib/scene-math';
import type { LayerMeta, SceneMeta } from '../../lib/world';
import { bandShift, camera, seamJitter } from '../../lib/world-math';
import type { Act, DrawCtx } from './acts';

/** Decoded pixels; a word with alpha 0 is transparent. */
export interface Bitmap { w: number; h: number; px: Uint32Array }

/** A scene ready to draw: its meta and one bitmap per layer and per sprite (same order as the meta). */
export interface World { meta: SceneMeta; layers: Bitmap[]; sprites: Bitmap[]; spriteIndex: Map<string, number> }

export function makeWorld(meta: SceneMeta, layers: Bitmap[], sprites: Bitmap[]): World {
  return { meta, layers, sprites, spriteIndex: new Map(meta.sprites.map((s, i) => [s.name, i])) };
}

/** A flat frame as a one-layer world the size of the view (a base layer, so depth 0). */
export function flatWorld(id: SceneMeta['id'], frame: Bitmap): World {
  return makeWorld(
    { id, world: [frame.w, frame.h], view: { land: [0, 0], port: [0, 0] }, layers: [{ name: 'flat', depth: 0, rate: 0 }], sprites: [] },
    [frame], [],
  );
}

type Hook = (d: DrawCtx, p: number, t: number) => void;

/**
 * One (scene, layer) pass. Screen point u (world px from the view's top-left) shows layer point
 * u + view + cam − shift + pan, where pan = round-or-not(share · vw) for scene k and that − vw for
 * scene k + 1 (`next`). While a pan runs (share > 0), scene k keeps u < vw − share · vw and scene
 * k + 1 keeps u ≥ that − seamJitter(row, band). The terms stay separate so each renderer rounds them its own way.
 */
export interface Pass {
  world: World; i: number; layer: LayerMeta; act: Act | undefined; hook: Hook | undefined;
  next: boolean;
  p: number;                 // the progress the act sees (0 for scene k + 1)
  view: [number, number];    // the view window's top-left in world px (whole)
  cam: [number, number];     // camera drift · rate (fractional world px)
  shift: [number, number];   // the act's layer shift (fractional world px; [0, 0] at p = 0, t = 0)
  share: number;             // bandShift(t, depth): how far this band has slid (0 … 1; 0 without a pan)
  band: number;              // seam jitter band (the layer index)
}

const byDepth = (a: { d: number }, b: { d: number }): number => a.d - b.d;
const ZERO: [number, number] = [0, 0];

/**
 * The passes of a frame: scene `a` at progress `p` and, when `t` > 0, scene `b` sliding in, in
 * depth order (scene k before scene k + 1 at equal depth). `clock` is the ambient time in seconds.
 */
export function passes(
  set: SceneSet, a: World, actA: Act | undefined, b: World | null, actB: Act | undefined,
  p: number, t: number, clock: number,
): Pass[] {
  // The opaque base layer (layers[0]) always pans as depth 0, whatever it declares, so the two
  // scenes' bases are complementary (only the seam jitter overlaps) and no pixel is left blank.
  const depthOf = (w: World, i: number): number => (i === 0 ? 0 : w.meta.layers[i].depth);
  const list: { d: number; next: boolean; i: number }[] = a.meta.layers.map((_, i) => ({ d: depthOf(a, i), next: false, i }));
  if (t > 0 && b) for (let i = 0; i < b.meta.layers.length; i++) list.push({ d: depthOf(b, i), next: true, i });
  list.sort(byDepth); // stable
  return list.map(({ d, next, i }) => {
    const w = next ? b! : a;
    const act = next ? actB : actA;
    const pp = next ? 0 : p;
    const L = w.meta.layers[i];
    const cam = camera(pp);
    const sh = act?.shift?.[L.name]?.(pp, clock) ?? ZERO;
    return {
      world: w, i, layer: L, act, hook: act?.after?.[L.name], next, p: pp,
      view: w.meta.view[set], cam: [cam.x * L.rate, cam.y * L.rate], shift: [sh[0], sh[1]],
      share: t > 0 ? bandShift(t, d) : 0, band: i,
    };
  });
}

// ---------------------------------------------------------------- drawing in world px
// The current pass's transform and clip, shared by the layer and its hook output. Screen pixel
// (x, y) shows layer pixel (x + ox, y + oy); scene k keeps x < cut, scene k + 1 keeps
// x ≥ cut − seamJitter(y, band). paintLayer draws with ox = oy = 0, no clip, into a world-size buffer.
let out: Uint32Array = new Uint32Array(0);
let VW = 0;
let VH = 0;
let ox = 0;
let oy = 0;
let cut = 0;
let next = false;
let band = 0;
let cur: World | null = null;

const rowStart = (y: number): number => (next ? Math.max(0, cut - seamJitter(y, band)) : 0);
const rowEnd = (): number => (next ? VW : Math.min(VW, cut));

function blit(b: Bitmap, sy0: number, sh: number, x: number, y: number): void {
  // Draws rows sy0 … sy0 + sh − 1 of b with its top-left at world (x, y).
  const W = cur!.meta.world;
  for (let r = 0; r < sh; r++) {
    const wy = y + r;
    const ty = wy - oy;
    if (wy < 0 || wy >= W[1] || ty < 0 || ty >= VH) continue;
    const x0 = Math.max(rowStart(ty), x - ox, -ox);
    const x1 = Math.min(rowEnd(), x + b.w - ox, W[0] - ox);
    const src = (sy0 + r) * b.w - x + ox;
    const dst = ty * VW;
    for (let tx = x0; tx < x1; tx++) {
      const v = b.px[src + tx];
      if (v >>> 24) out[dst + tx] = v;
    }
  }
}

// What a hook draws, in whole world px: plot → [0, x, y, c], sprite → [1, j, frame, x, y].
// Both renderers draw from this list, so they round positions and frames the same way.
const rec: number[] = [];
const recorder: DrawCtx = {
  plot(x, y, c) { rec.push(0, Math.round(x), Math.round(y), c); },
  sprite(name, frame, x, y) {
    const j = cur!.spriteIndex.get(name);
    if (j === undefined) return;
    const m = cur!.meta.sprites[j];
    const f = ((Math.floor(frame) % m.frames) + m.frames) % m.frames;
    rec.push(1, j, f, Math.round(x ?? m.at[0]), Math.round(y ?? m.at[1]));
  },
  world: [0, 0],
};

function record(w: World, L: LayerMeta, hook: Hook | undefined, p: number, clock: number): number[] {
  rec.length = 0;
  cur = w;
  if (hook) {
    recorder.world = [w.meta.world[0], w.meta.world[1]]; // a copy: an act cannot change the meta
    hook(recorder, p, clock);
  } else {
    for (const m of w.meta.sprites) if (m.layer === L.name) recorder.sprite(m.name, m.rest);
  }
  return rec.slice();
}

function replay(calls: number[]): void {
  const W = cur!.meta.world;
  for (let k = 0; k < calls.length;) {
    if (calls[k] === 0) {
      const x = calls[k + 1], y = calls[k + 2], c = calls[k + 3];
      k += 4;
      if (x < 0 || y < 0 || x >= W[0] || y >= W[1]) continue;
      const tx = x - ox;
      const ty = y - oy;
      if (ty < 0 || ty >= VH || tx < rowStart(ty) || tx >= rowEnd()) continue;
      out[ty * VW + tx] = c;
    } else {
      const j = calls[k + 1], f = calls[k + 2], x = calls[k + 3], y = calls[k + 4];
      k += 5;
      const m = cur!.meta.sprites[j];
      blit(cur!.sprites[j], f * m.h, m.h, x, y);
    }
  }
}

/** A pass's hook output (or its layer's rest sprites when it has no hook), as a call list in world px. */
export const layerCalls = (ps: Pass, clock: number): number[] => record(ps.world, ps.layer, ps.hook, ps.p, clock);

/** Layer i of world w with `calls` drawn on it, into dst (world-sized, overwritten). */
export function paintLayer(dst: Uint32Array, w: World, i: number, calls: number[]): void {
  const [W, H] = w.meta.world;
  dst.set(w.layers[i].px);
  out = dst; VW = W; VH = H; ox = 0; oy = 0; cut = W; next = false; band = i; cur = w;
  replay(calls);
  cur = null;
}

/**
 * The CPU reference: draws scene `a` at progress `p` and, when `t` > 0, scene `b` sliding in, into
 * `dst` (vw × vh), one pixel per world px. `clock` is the ambient time in seconds handed to the acts.
 */
export function compose(
  dst: Uint32Array, vw: number, vh: number, set: SceneSet,
  a: World, actA: Act | undefined, b: World | null, actB: Act | undefined,
  p: number, t: number, clock: number,
): void {
  out = dst; VW = vw; VH = vh;
  dst.fill(0);
  for (const ps of passes(set, a, actA, b, actB, p, t, clock)) {
    const calls = layerCalls(ps, clock);
    const s = Math.round(ps.share * vw);
    out = dst; VW = vw; VH = vh;
    cur = ps.world; next = ps.next; band = ps.band; cut = vw - s;
    ox = ps.view[0] + Math.round(ps.cam[0]) + (ps.next ? s - vw : s) - Math.round(ps.shift[0]);
    oy = ps.view[1] + Math.round(ps.cam[1]) - Math.round(ps.shift[1]);
    blit(ps.world.layers[ps.i], 0, ps.world.layers[ps.i].h, 0, 0);
    replay(calls);
  }
  cur = null;
}
