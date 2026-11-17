// Ambient life: a palomino horse grazing and wandering on the Rio Grande's bank near the road's end.
// A 3D horse at this scale read as an orange bar of `&$` glyphs (as in the Phase 0 spike), so the horse
// is a glyph sprite like the walkers: this module moves it and the overlay in figures.ts draws it.
// The clouds drift in the backdrop's sky and the river's bands roll in its shader, on the shared clock.
// Everything is a pure function of the clock: see figure-motion.ts.
import * as THREE from 'three';
import { heightAt } from '../bake';
import { horseInto, newHorsePose } from './figure-motion';

export interface HorseState { pos: THREE.Vector3; heading: number; speed: number; gait: number; swish: number }

export function addLife(_scene: THREE.Scene) {
  const horse: HorseState = { pos: new THREE.Vector3(), heading: 0, speed: 0, gait: 0, swish: 0 };
  const h = newHorsePose(); // reused every frame (no per-frame allocation)
  return {
    horse,
    tick(t: number) {
      horseInto(t, h);
      horse.pos.set(h.x, heightAt(h.x, h.z), h.z);
      horse.heading = h.heading; horse.speed = h.speed; horse.gait = h.gait; horse.swish = h.swish;
    },
  };
}
