// Per-scene acts: what moves in a scene as the visitor scrolls through its stop (p) and as the
// ambient clock runs (t). Each scene's act lives in ./acts/<id>.ts and is registered in ACTS.
//
// Rule for every act: at p = 0, t = 0 it draws exactly the rest frames at `at` and nothing else,
// and every `shift` returns [0, 0], so the settled frame equals the flat PNG.
//
// Coordinates: everything is in the layer's own world px. A `shift` of [dx, dy] moves the whole
// layer (and its after-hook) by +dx, +dy: the screen then samples that layer at world − shift, and
// `plot`/`sprite` positions are moved by the same amount.
import type { SceneId } from '../../lib/scenes';
import { now } from './acts/now';
import { phd } from './acts/phd';

export interface DrawCtx {           // one (scene, layer) pass: world coords, already offset and clipped like that layer
  plot(x: number, y: number, c: number): void;                      // c from PAL32
  sprite(name: string, frame: number, x?: number, y?: number): void; // default position: the sprite's `at`
  world: [number, number];
}

export interface Act {               // p: progress through the stop; t: ambient seconds (always 0 when still)
  /** Keyed by layer name. A layer with a hook draws only what the hook draws; one without draws its sprites at rest. */
  after?: Partial<Record<string, (d: DrawCtx, p: number, t: number) => void>>;
  /** Extra integer world offset of a whole layer (and its after-hook), keyed by layer name; [0, 0] at p = 0, t = 0. */
  shift?: Partial<Record<string, (p: number, t: number) => [number, number]>>;
}

export const ACTS: Partial<Record<SceneId, Act>> = { now, phd };
