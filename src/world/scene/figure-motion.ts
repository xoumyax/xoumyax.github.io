// Motion of the living actors as pure functions of the clock (and journey u). No three.js, no DOM,
// so the e2e spec can import the same constants. Everything loops on FIGURE_PERIOD: an actor at
// t = 0 and at t = FIGURE_PERIOD stands in the same place, so the live view never jumps.
import { riverZ, STOP_U } from '../bake';

/** Seconds per loop of every actor. */
export const FIGURE_PERIOD = 24;
/** The walkers ping-pong over ±WALK_SPAN of journey u around a centre just ahead of their stop's u. */
export const WALK_SPAN = 0.025;
/**
 * How far ahead of the stop's u (down the road, toward the river) the walk is centred. Up-road of a
 * stop's u the road climbs toward the top blur band (desktop) and the view's left edge (phones, where
 * the view pulls toward the landmark), so a centred segment loses the couple at some stops.
 */
export const WALK_LEAD = 0.012;
/** Walk centres are clamped to [WALK_SPAN, 1 − WALK_SPAN] so the segment never folds at the road's ends. */
export const walkCentre = (u: number) => Math.min(1 - WALK_SPAN, Math.max(WALK_SPAN, u + WALK_LEAD));

const STOPS: readonly number[] = Object.values(STOP_U).sort((a, b) => a - b);
/**
 * The stop the walk is anchored to for a camera at journey u: the nearest stop's u. The walkers stay put
 * in the world while the camera scrolls within a stop's band (no sliding); see figures.ts for when they move.
 */
export function walkAnchor(u: number) {
  let best = STOPS[0];
  for (let i = 1; i < STOPS.length; i++) if (Math.abs(STOPS[i] - u) < Math.abs(best - u)) best = STOPS[i];
  return best;
}
/** World units between Soumya and Jen, sideways on screen (they walk side by side, about a sprite apart). */
export const COUPLE_GAP = 1.2;
/** Walk frames per loop: a multiple of 4 (two steps per stride), so the stepping also loops. */
export const WALK_FRAMES_PER_LOOP = 40;

/** The horse's bank: distance from the river's centreline, dry ground between the water's edge (~3.3) and the floodplain. */
export const HORSE_BANK: readonly [number, number] = [4.2, 9.5];
const HORSE_X = 23.5, HORSE_RX = 2.2, HORSE_D = 6.2, HORSE_RD = 1.0;

const TAU = Math.PI * 2;

export interface WalkPose { pos: number; walked: number; moving: boolean; facing: 1 | -1 }
export const newWalkPose = (): WalkPose => ({ pos: 0, walked: 0, moving: false, facing: 1 });

/**
 * The couple's walk: out along the road, a pause and a turn, back, a pause and a turn.
 * pos ∈ [−1, 1] (× WALK_SPAN of u); walked is the distance covered in pos units (0..4 per loop);
 * facing is the way they face along the road (+1 toward the river); moving is false during the pauses.
 * Writes into `out` and returns it (no allocation: the frame loop calls this).
 */
export function walkInto(t: number, out: WalkPose): WalkPose {
  const ph = (((t / FIGURE_PERIOD) % 1) + 1) % 1, raw = 1.25 * Math.sin(TAU * ph);
  const pos = Math.max(-1, Math.min(1, raw));
  // total variation of pos from φ = 0: rises 0→1, falls 1→−1, rises −1→0
  out.pos = pos;
  out.walked = ph < 0.25 ? pos : ph < 0.75 ? 2 - pos : 4 + pos;
  out.moving = Math.abs(raw) < 1;
  // during a pause they still face the way they came; they turn as they set off again
  out.facing = out.moving ? (Math.cos(TAU * ph) >= 0 ? 1 : -1) : pos > 0 ? 1 : -1;
  return out;
}
/** walkInto with a fresh pose (tests, one-off callers). */
export const walk = (t: number) => walkInto(t, newWalkPose());

/** Walk frame index 0..3 (0, 2 = legs apart; 1, 3 = passing), or −1 when standing, for a pose. */
export const poseFrame = (w: WalkPose) => (w.moving ? Math.floor((w.walked / 4) * WALK_FRAMES_PER_LOOP) % 4 : -1);
const scratchWalk = newWalkPose();
/** Walk frame index at clock t (see poseFrame). */
export const walkFrame = (t: number) => poseFrame(walkInto(t, scratchWalk));

export interface HorsePose { x: number; z: number; heading: number; speed: number; gait: number; swish: number }
export const newHorsePose = (): HorsePose => ({ x: 0, z: 0, heading: 0, speed: 0, gait: 0, swish: 0 });

/**
 * The horse wanders a slow loop on the bank in four short bursts per period, grazing in between.
 * Writes ground position, heading (radians, atan2 of the travel direction x, z), speed 0..1 and gait
 * phase into `out` and returns it (no allocation: the frame loop calls this).
 */
export function horseInto(t: number, out: HorsePose): HorsePose {
  const ph = (((t / FIGURE_PERIOD) % 1) + 1) % 1;
  // q advances in four bursts: dq/dφ = 1 − cos(8πφ) ≥ 0
  const q = ph - Math.sin(4 * TAU * ph) / (4 * TAU);
  const a = TAU * q, a2 = a + 0.01;
  const x = HORSE_X + HORSE_RX * Math.cos(a), z = riverZ(x) - (HORSE_D + HORSE_RD * Math.sin(a));
  const x2 = HORSE_X + HORSE_RX * Math.cos(a2), z2 = riverZ(x2) - (HORSE_D + HORSE_RD * Math.sin(a2));
  out.x = x; out.z = z;
  out.heading = Math.atan2(x2 - x, z2 - z);
  out.speed = (1 - Math.cos(4 * TAU * ph)) / 2;
  // gait: leg phase (36 strides per loop); swish: the grazing tail swish, 0 or 1, eight swishes per loop
  out.gait = q * 36 * TAU;
  out.swish = Math.floor(ph * 16) & 1;
  return out;
}
/** horseInto with a fresh pose (tests, one-off callers). */
export const horse = (t: number) => horseInto(t, newHorsePose());
