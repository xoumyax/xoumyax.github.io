// Ph.D. (the palomino by the Rio Grande). Subject: the horse lowers its head and grazes as the
// visitor scrolls through the stop, then looks up again (a pure step function of p). Ambient,
// all at rest at t = 0 and calm: leaf clusters sway, glints come and go on the water, dust motes
// drift over the upper sand, the ear flicks, the tail swishes, the grass stirs, the horse chews
// while it grazes, and now and then a bird crosses the top right (the land view).
//
// Sprites (public/scenes/phd/scene.json): on `trees`, leaf1–leaf6 (0 rest, 1 one px right, 2 one
// px left); on `ground`, in draw order, horse (frame = 2·pose + ear; pose 0 up, 1 lowering, 2 low,
// 3 grazing, 4 chew), tail (0 rest, 1 a little left, 2 full left, 3 a little right) and grass
// (0 rest, 1 tips right, 2 tips left).
import type { Act, DrawCtx } from '../acts';
import { EventSchedule, seedHash as seed } from '../../../lib/world-math';
import { PAL32 } from '../../../lib/palette';

const PAPER = PAL32[0];
const MIST = PAL32[1];
const CREAM = PAL32[3];
const INK = PAL32[24];
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- subject: the head pose
/** Head pose from scroll alone: up, lowering, grazing, lifting, up. */
export function horsePose(p: number): number {
  if (p < 0.08) return 0;
  if (p < 0.165) return 1;
  if (p < 0.25) return 2;
  if (p < 0.7) return 3;
  if (p < 0.8) return 2;
  if (p < 0.9) return 1;
  return 0;
}
/** The horse frame scroll gives (ear forward). */
export const horseFrame = (p: number): number => 2 * horsePose(p);

// ---------------------------------------------------------------- ambient schedules
// eventPhase schedules (EventSchedule: the same phases, resumed as the clock runs). Every first
// event starts gap[0] > 0 s in, so all is at rest at t = 0. Seeds go through seedHash, so the
// schedules do not start together.
const EAR = new EventSchedule(seed(101), [4, 9], 0.35);
const CHEW = new EventSchedule(seed(211), [2.5, 6], 0.5);   // shows only while grazing
const TAIL = new EventSchedule(seed(307), [5, 11], 0.4);
const TAIL_SEQ = [[1, 2, 2, 1], [0, 3, 3, 0]];         // 0.1 s a step: a full swish, a small flick
const GRASS = new EventSchedule(seed(401), [3, 8], 1.0);
const GRASS_SEQ = [1, 1, 1, 0, 0, 2, 2, 2, 0, 0];
const BIRD_DUR = 11;
const BIRD = new EventSchedule(seed(503), [14, 26], BIRD_DUR);

/** A stable integer in [0, n) for event `i` of schedule `k`: which variant (spot, direction) it plays. */
const pick = (k: number, i: number, n: number): number => (Math.imul(Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(k + 1, 0x85ebca6b), 0x2c1b3c6d) >>> 8) % n;

// Leaf sway: offset round(A·(sin(ωt + φ) + 0.35·sin(2πt/13))), with |A·sin φ| < 0.5, so 0 at t = 0.
const LEAF_NAMES = ['leaf1', 'leaf2', 'leaf3', 'leaf4', 'leaf5', 'leaf6'];
const LEAF_A = [0.85, 0.8, 0.75, 0.95, 0.9, 0.85];
const LEAF_P = [6.3, 7.9, 5.7, 8.6, 6.9, 7.4];
const LEAF_PH = [0.35, Math.PI - 0.3, 0.1, Math.PI + 0.4, -0.3, Math.PI - 0.05];

// Glints: short light streaks on the water (world x 140–248, y 106–130: clear of the trees and
// the near shore). Each slot runs its own schedule and takes one of SPOTS spots per event.
const GLINT_DUR = [0.7, 1.1, 0.9, 1.5, 0.6, 1.2];
const GLINTS = GLINT_DUR.map((dur, k) => new EventSchedule(seed(1000 + k), [0.4, 3], dur));
const SPOTS = 48;
const GLINT_X = new Int16Array(SPOTS);
const GLINT_Y = new Int16Array(SPOTS);
const GLINT_LEN = new Int8Array(SPOTS);
const GLINT_C = new Uint32Array(SPOTS);

// Motes: slow specks over the darker top of the upper sand (world y 139–149), drifting right and
// up, bobbing (paper on the bright sand lower down would vanish into its speckle).
const MOTE_DUR = [5, 6.5, 4, 7, 5.5];
const MOTES = MOTE_DUR.map((dur, k) => new EventSchedule(seed(2000 + k), [0.3, 2.5], dur));
const MOTE_X = new Float32Array(SPOTS);
const MOTE_Y = new Float32Array(SPOTS);
const MOTE_VX = new Float32Array(SPOTS);
const MOTE_PH = new Float32Array(SPOTS);

{
  let s = 20261118;
  const rnd = (): number => (s = (s * 48271) % 2147483647) / 2147483647;
  for (let i = 0; i < SPOTS; i++) {
    GLINT_X[i] = 140 + Math.floor(rnd() * 106);
    GLINT_Y[i] = 106 + Math.floor(rnd() * 25);
    GLINT_LEN[i] = rnd() < 0.7 ? 2 : 3;
    GLINT_C[i] = rnd() < 0.8 ? MIST : PAPER;
    MOTE_X[i] = 12 + rnd() * 236;
    MOTE_Y[i] = 139 + rnd() * 10;
    MOTE_VX[i] = 1.2 + rnd() * 1.4;
    MOTE_PH[i] = rnd() * TAU;
  }
}

// The bird: three rows of five, one shape per wing beat (0.2 s each), as (dx, dy) pairs.
const shape = (rows: string[]): Int8Array => {
  const out: number[] = [];
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'X') out.push(x, y); }));
  return Int8Array.from(out);
};
const WINGS_UP = shape(['X...X', '.X.X.', '..X..']);
const BIRD_SHAPES = [WINGS_UP, shape(['.....', 'X...X', '.XXX.']), WINGS_UP, shape(['.....', '.XXX.', 'X...X'])];

// ---------------------------------------------------------------- hooks
function far(d: DrawCtx, _p: number, t: number): void {
  for (let k = 0; k < GLINTS.length; k++) {
    const ph = GLINTS[k].phase(t);
    if (ph < 0) continue;
    const i = pick(k, GLINTS[k].index, SPOTS);
    const x = GLINT_X[i];
    const y = GLINT_Y[i];
    // a short streak that is shorter at its start and end
    const len = ph < 0.2 || ph > 0.8 ? 1 : GLINT_LEN[i];
    for (let j = 0; j < len; j++) d.plot(x + j, y, GLINT_C[i]);
  }
  const ph = BIRD.phase(t);
  if (ph >= 0) {
    const dir = pick(50, BIRD.index, 5) < 3 ? -1 : 1;   // mostly right to left
    const y0 = 90 + pick(51, BIRD.index, 6);
    const x = Math.round(dir < 0 ? 252 - ph * 116 : 136 + ph * 116);
    const y = y0 + Math.round(Math.sin(ph * 9) * 1.4);
    const wing = BIRD_SHAPES[Math.floor((ph * BIRD_DUR) / 0.2) % 4];
    for (let j = 0; j < wing.length; j += 2) d.plot(x + wing[j], y + wing[j + 1], INK);
  }
}

function trees(d: DrawCtx, _p: number, t: number): void {
  const gust = 0.35 * Math.sin((TAU * t) / 13);
  for (let k = 0; k < 6; k++) {
    const dx = Math.round(LEAF_A[k] * (Math.sin((TAU * t) / LEAF_P[k] + LEAF_PH[k]) + gust));
    d.sprite(LEAF_NAMES[k], dx > 0 ? 1 : dx < 0 ? 2 : 0);
  }
}

function ground(d: DrawCtx, p: number, t: number): void {
  // motes first: the horse passes in front of them
  for (let k = 0; k < MOTES.length; k++) {
    const dur = MOTE_DUR[k];
    const ph = MOTES[k].phase(t);
    if (ph < 0) continue;
    const i = pick(20 + k, MOTES[k].index, SPOTS);
    const age = ph * dur;
    const x = MOTE_X[i] + age * MOTE_VX[i];
    const y = MOTE_Y[i] + Math.sin(MOTE_PH[i] + age * 0.9) * 2 - age * 0.6;
    d.plot(x, y, age < 0.5 || dur - age < 0.5 ? CREAM : PAPER);
  }

  let pose = horsePose(p);
  if (CHEW.phase(t) >= 0 && pose === 3) pose = 4;
  const ear = EAR.phase(t) >= 0 ? 1 : 0;
  d.sprite('horse', 2 * pose + ear);

  let tail = 0;
  const tp = TAIL.phase(t);
  if (tp >= 0) {
    const seq = TAIL_SEQ[pick(30, TAIL.index, 3) === 0 ? 1 : 0];   // one in three a small flick
    tail = seq[Math.min(seq.length - 1, Math.floor(tp * seq.length))];
  }
  d.sprite('tail', tail);

  const gp = GRASS.phase(t);
  d.sprite('grass', gp >= 0 ? GRASS_SEQ[Math.min(GRASS_SEQ.length - 1, Math.floor(gp * GRASS_SEQ.length))] : 0);
}

export const phd: Act = { after: { far, trees, ground } };
