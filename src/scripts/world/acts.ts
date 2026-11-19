// Per-scene acts: what moves in a scene as the visitor scrolls through its stop (p) and as the
// ambient clock runs (t). Each scene's act lives in ./acts/<id>.ts and is registered in ACTS.
//
// Rule for every act: at p = 0, t = 0 it draws exactly the rest frames at `at` and nothing else,
// and every `shift` returns [0, 0], so the settled frame equals the flat PNG.
//
// Coordinates: everything is in the layer's own world px. A `shift` of [dx, dy] moves the whole
// layer (and its after-hook) by +dx, +dy: the screen then samples that layer at world − shift, and
// `plot`/`sprite` positions are moved by the same amount.
//
// The clock and shift contract:
// - `t` is the ambient clock in continuous seconds (rAF time; it holds while the tab is hidden and
//   stays 0 in still mode and reduced motion). It never runs backwards while the page is open.
// - Frame flips, poses and events step on the 0.1 s grid: an act quantises its own clock with
//   tenth(t) (src/lib/world-math.ts) before it picks a sprite frame, a step of a sequence or an
//   EventSchedule phase, so those behave as if the clock ticked every 0.1 s.
// - What an after-hook draws lands in whole world px (plot and sprite positions are rounded): a
//   drift drawn there may use t directly, but it still moves a block at a time. Hook output is
//   re-drawn only when its rounded call list changes.
// - Sub-pixel motion is a `shift`: a whole layer (with its after-hook output) moved by a fractional
//   offset, drawn on screen in whole device px. A shift is a smooth function of (p, t) (no
//   quantising), [0, 0] at p = 0, t = 0, and within the layer's `travel`. An act with a shift is
//   continuous: while it is on screen with the clock running, the backdrop draws every frame;
//   other acts are drawn on the 0.1 s grid. Put anything that should glide (a cloud bank, haze)
//   on its own layer and move it with a shift.
import type { SceneId } from '../../lib/scenes';
import { now } from './acts/now';
import { phd } from './acts/phd';

export interface DrawCtx {           // one (scene, layer) pass: world coords, already offset and clipped like that layer
  plot(x: number, y: number, c: number): void;                      // c from PAL32; x, y rounded to whole world px
  sprite(name: string, frame: number, x?: number, y?: number): void; // default position: the sprite's `at`; x, y rounded
  world: [number, number];
}

export interface Act {               // p: progress through the stop; t: ambient seconds (always 0 when still)
  /** Keyed by layer name. A layer with a hook draws only what the hook draws; one without draws its sprites at rest. */
  after?: Partial<Record<string, (d: DrawCtx, p: number, t: number) => void>>;
  /** Extra world offset of a whole layer (and its after-hook), fractional, keyed by layer name; [0, 0] at p = 0, t = 0. */
  shift?: Partial<Record<string, (p: number, t: number) => [number, number]>>;
}

/** Whether an act moves continuously with the clock (it has a layer shift), so it is drawn every frame. */
export const continuous = (act: Act | undefined): boolean => !!act?.shift && Object.keys(act.shift).length > 0;

export const ACTS: Partial<Record<SceneId, Act>> = { now, phd };
