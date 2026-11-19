// Now (the dome). Subject: the door light comes on as the visitor scrolls through the stop.
// Ambient, at rest at t = 0 and calm: a few stars twinkle in the sky, and the tip of a cloud
// drifts a few px right over ~40 s and back. Twinkles step on the clock's 0.1 s grid; the cloud
// drift reads the continuous clock (a sprite frame, so it still moves a whole world px at a time).
//
// Sprites (public/scenes/now/scene.json): on `sky`, cloud (frame d = the piece d px right of
// where it was cut; 0 rest); on `dome`, door (0 dark rest, 1 dim, 2–4 the light growing down
// from the lamp, 5 lit).
import type { Act, DrawCtx } from '../acts';
import { EventSchedule, seedHash as seed, tenth } from '../../../lib/world-math';
import { PAL32 } from '../../../lib/palette';

const PAPER = PAL32[0];
const MIST = PAL32[1];

// ---------------------------------------------------------------- subject: the door light
// Frame k shows from DOOR_AT[k − 1] on. On a phone the free band between the panels moves up
// the door as p rises while the light grows down it, so the steps are placed where the lit part
// is in that band (and between the panels on a desktop).
const DOOR_AT = [0.12, 0.3, 0.45, 0.6, 0.78];
/** Door frame from scroll alone: non-decreasing, 0 (dark) at p = 0, 5 (lit) well before p = 1. */
export function doorFrame(p: number): number {
  let f = 0;
  while (f < DOOR_AT.length && p >= DOOR_AT[f]) f++;
  return f;
}

// ---------------------------------------------------------------- ambient
// Stars: world (x, y) in clear sky right of the dome. The land view shows all five; the last two
// are in the deep-blue band just right of the dome's shoulder, which the port view shows in its
// free band late in the stop.
const STAR_X = [214, 233, 226, 204, 200];
const STAR_Y = [58, 71, 96, 91, 101];
// Seeds go through seedHash, so the stars do not twinkle together.
const STARS = STAR_X.map((_, k) => new EventSchedule(seed(3000 + k), [3, 9], 1.6));

// Cloud: 0 → 3 px → 0 over 80 s, as (1 − cos)/2, so it is at rest at t = 0.
const CLOUD_DRIFT = 3;
const CLOUD_T = 80;

function sky(d: DrawCtx, _p: number, t: number): void {
  d.sprite('cloud', Math.round((CLOUD_DRIFT * (1 - Math.cos((2 * Math.PI * t) / CLOUD_T))) / 2));
  const q = tenth(t);
  for (let k = 0; k < STAR_X.length; k++) {
    const ph = STARS[k].phase(q);
    if (ph < 0) continue;
    const x = STAR_X[k];
    const y = STAR_Y[k];
    const peak = ph >= 0.3 && ph < 0.7;
    d.plot(x, y, peak ? PAPER : MIST);
    if (ph >= 0.4 && ph < 0.6) { d.plot(x - 1, y, MIST); d.plot(x + 1, y, MIST); d.plot(x, y - 1, MIST); d.plot(x, y + 1, MIST); }
  }
}

function dome(d: DrawCtx, p: number): void {
  d.sprite('door', doorFrame(p));
}

export const now: Act = { after: { sky, dome } };
