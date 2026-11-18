// What a layered scene (a "world") looks like on disk: public/scenes/<id>/scene.json plus one
// indexed PNG per layer and per sprite. Kept free of runtime imports so the client stays light.
import type { SceneId } from './scenes';

/**
 * One layer, back to front; layers[0] is opaque. `depth` 0 (farthest) … 1 (nearest) sets how early
 * it slides in a pan (layers[0] always pans as depth 0, whatever it declares), `rate` its parallax against the camera. travel = [left, right, up, down]: the
 * most a `shift` hook moves this layer, in world px (default 0s). A layer PNG is world-sized.
 */
export interface LayerMeta { name: string; depth: number; rate: number; travel?: [number, number, number, number] }

/**
 * A vertical strip of `frames` frames, each w×h. `at` is its top-left in world px; it is drawn
 * right after `layer`, moving with that layer; `rest` is the frame shown at p = 0, t = 0.
 */
export interface SpriteMeta { name: string; w: number; h: number; frames: number; at: [number, number]; layer: string; rest: number }

/** `view` is the top-left, in world px, of the 240×135 (land) and 120×214 (port) windows. */
export interface SceneMeta {
  id: SceneId; world: [number, number]; view: { land: [number, number]; port: [number, number] };
  layers: LayerMeta[]; sprites: SpriteMeta[];
}

/** scene.json, <layer>.png, <sprite>.png */
export const worldUrl = (id: SceneId, file: string): string => `/scenes/${id}/${file}`;
