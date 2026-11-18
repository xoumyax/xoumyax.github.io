// Composes one frame of the backdrop into a Uint32Array (0xAABBGGRR words, the ImageData layout).
// DOM-free so it can be unit-tested. Scene k sits at progress p; while a pan runs (t > 0) scene
// k + 1 slides in from the right, each layer by its own band shift, with a ragged seam.
import type { SceneSet } from '../../lib/scene-math';
import type { SceneMeta } from '../../lib/world';
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

interface Pass { scene: 0 | 1; i: number; depth: number }

// One (scene, layer) pass's transform and clip, shared by the layer and its after-hook. Screen
// pixel (x, y) shows layer pixel (x + ox, y + oy); scene k keeps x < cut, scene k + 1 keeps
// x ≥ cut − seamJitter(y, i).
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

const ctx: DrawCtx = {
  plot(x, y, c) {
    x |= 0; y |= 0;
    const W = cur!.meta.world;
    if (x < 0 || y < 0 || x >= W[0] || y >= W[1]) return;
    const tx = x - ox;
    const ty = y - oy;
    if (ty < 0 || ty >= VH || tx < rowStart(ty) || tx >= rowEnd()) return;
    out[ty * VW + tx] = c;
  },
  sprite(name, frame, x, y) {
    const j = cur!.spriteIndex.get(name);
    if (j === undefined) return;
    const m = cur!.meta.sprites[j];
    const f = ((Math.floor(frame) % m.frames) + m.frames) % m.frames;
    blit(cur!.sprites[j], f * m.h, m.h, Math.round(x ?? m.at[0]), Math.round(y ?? m.at[1]));
  },
  world: [0, 0],
};

const byDepth = (a: Pass, b: Pass): number => a.depth - b.depth;

/**
 * Draws scene `a` at progress `p` and, when `t` > 0, scene `b` sliding in, into `dst` (vw × vh).
 * `clock` is the ambient time in seconds handed to the acts.
 */
export function compose(
  dst: Uint32Array, vw: number, vh: number, set: SceneSet,
  a: World, actA: Act | undefined, b: World | null, actB: Act | undefined,
  p: number, t: number, clock: number,
): void {
  out = dst; VW = vw; VH = vh;
  dst.fill(0);
  // The opaque base layer (layers[0]) always pans as depth 0, whatever it declares, so the two
  // scenes' bases are complementary (only the seam jitter overlaps) and no pixel is left blank.
  const depthOf = (w: World, i: number): number => (i === 0 ? 0 : w.meta.layers[i].depth);
  const passes: Pass[] = a.meta.layers.map((_, i) => ({ scene: 0, i, depth: depthOf(a, i) }));
  if (t > 0 && b) for (let i = 0; i < b.meta.layers.length; i++) passes.push({ scene: 1, i, depth: depthOf(b, i) });
  passes.sort(byDepth); // stable: k before k + 1 at equal depth

  for (const { scene, i, depth } of passes) {
    const w = scene === 0 ? a : b!;
    const act = scene === 0 ? actA : actB;
    const pp = scene === 0 ? p : 0;
    const L = w.meta.layers[i];
    const cam = camera(pp);
    const s = t > 0 ? Math.round(bandShift(t, depth) * vw) : 0;
    const pan = scene === 0 ? s : s - vw;
    const sh = act?.shift?.[L.name]?.(pp, clock) ?? [0, 0];
    const v = w.meta.view[set];
    cur = w; next = scene === 1; band = i; cut = vw - s;
    ox = v[0] + Math.round(cam.x * L.rate) + pan - Math.round(sh[0]);
    oy = v[1] + Math.round(cam.y * L.rate) - Math.round(sh[1]);
    blit(w.layers[i], 0, w.layers[i].h, 0, 0);
    ctx.world = w.meta.world;
    const hook = act?.after?.[L.name];
    if (hook) hook(ctx, pp, clock);
    else for (const m of w.meta.sprites) if (m.layer === L.name) ctx.sprite(m.name, m.rest);
  }
  cur = null;
}
