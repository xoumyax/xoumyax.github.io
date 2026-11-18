// Pure maths for the living world: stop progress, the sideways pan between scenes, band shifts,
// seam jitter, camera drift and ambient event timing. Import-free so the client bundle stays light.

export const PAN_VH = 0.6;
export const PAN_MAX = 0.5;
export const CAM_X = 12;
export const CAM_Y = 4;
export const SEAM_MAX = 4;

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const smoothstep = (x: number): number => x * x * (3 - 2 * x);

/** Scroll px the pan between two stops takes: 60% of a viewport, never more than half the gap. */
export const panLength = (gap: number, vh: number): number => Math.max(0, Math.min(PAN_VH * vh, PAN_MAX * gap));

/**
 * `anchors` are the stops' anchors in viewport y (page order), `mid` the viewport middle and
 * `remaining` the page scroll left below. `k` is the scene, `p` the progress through stop k and
 * `t` the share of the pan toward scene k + 1.
 */
export function worldAt(anchors: number[], mid: number, vh: number, remaining: number): { k: number; p: number; t: number } {
  let i = -1;
  let d = 0;
  for (let j = 0; j < anchors.length; j++) {
    const dj = mid - anchors[j];
    if (dj >= -1) { i = j; d = Math.max(0, dj); } // within 1px below mid counts as reached
  }
  if (i < 0) return { k: 0, p: 0, t: 0 };
  if (i === anchors.length - 1) {
    const total = d + Math.max(0, remaining);
    return { k: i, p: total === 0 ? 0 : d / total, t: 0 };
  }
  const G = anchors[i + 1] - anchors[i];
  if (G <= 0) return { k: i + 1, p: 0, t: 0 };
  const P = panLength(G, vh);
  const I = G - P;
  if (d < I) return { k: i, p: d / I, t: 0 };
  const t = P > 0 ? (d - I) / P : 1;
  return t >= 1 ? { k: i + 1, p: 0, t: 0 } : { k: i, p: 1, t };
}

/** Share of the view width a layer of depth 0 (farthest) … 1 (nearest) has slid at pan share t. */
export const bandShift = (t: number, depth: number): number => smoothstep(clamp(t / (1 - 0.4 * depth), 0, 1));

/** Deterministic integer in [0, SEAM_MAX] from a hash of (y, band): ragged seam edges. */
export function seamJitter(y: number, band: number): number {
  let h = Math.imul(y | 0, 0x9e3779b1) ^ Math.imul((band | 0) + 0x7f4a7c15, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) % (SEAM_MAX + 1);
}

/** Camera drift in world px at parallax rate 1. */
export const camera = (p: number): { x: number; y: number } => ({ x: p * CAM_X, y: 0 - p * CAM_Y });

/**
 * Ambient events on a seeded schedule: each starts a random `gap` seconds after the previous ends,
 * the first one gap after t = 0. Returns the phase [0,1) inside an event, else −1. Pure: the
 * schedule is replayed from 0 on every call.
 */
export function eventPhase(t: number, seed: number, gap: [number, number], dur: number): number {
  if (!(t >= 0) || !Number.isFinite(t)) return -1;
  let s = (Math.floor(Math.abs(seed)) % 2147483646) + 1; // Park–Miller state in [1, 2^31 − 2]
  let cursor = 0;
  for (;;) {
    s = (s * 48271) % 2147483647;
    const start = cursor + gap[0] + (s / 2147483647) * (gap[1] - gap[0]);
    if (t < start) return -1;
    if (t < start + dur) return (t - start) / dur;
    cursor = start + dur;
  }
}

/**
 * A seed for eventPhase / EventSchedule from a small id, in [0, 2^31 − 2). The hash is non-linear
 * (xorshift-multiply): with nearby or evenly spaced seeds the Park–Miller draws stay linear in the
 * seed, and the schedules' events start together.
 */
export function seedHash(n: number): number {
  let h = Math.imul(n ^ 0x5bd1e995, 0x9e3779b1);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13;
  return (h >>> 1) % 2147483646;
}

/**
 * eventPhase(t, seed, gap, dur) as a resumable schedule, for a clock that runs forward: `phase(t)`
 * returns exactly what eventPhase returns, but resumes from the event the previous call reached
 * (it replays from 0 only when t goes back), so its cost does not grow with t. `index` is the
 * number of the event under way after a call (0, 1, …), or −1 between events.
 */
export class EventSchedule {
  index = -1;
  private readonly s0: number;
  private s = 0;
  private cursor = 0;
  private start = 0;
  private n = 0;
  constructor(seed: number, private readonly gap: [number, number], private readonly dur: number) {
    this.s0 = (Math.floor(Math.abs(seed)) % 2147483646) + 1;
    this.reset();
  }
  private reset(): void {
    this.s = this.s0; this.cursor = 0; this.n = 0; this.next();
  }
  private next(): void {
    this.s = (this.s * 48271) % 2147483647;
    this.start = this.cursor + this.gap[0] + (this.s / 2147483647) * (this.gap[1] - this.gap[0]);
  }
  phase(t: number): number {
    this.index = -1;
    if (!(t >= 0) || !Number.isFinite(t)) return -1;
    if (t < this.cursor) this.reset();
    for (;;) {
      if (t < this.start) return -1;
      if (t < this.start + this.dur) { this.index = this.n; return (t - this.start) / this.dur; }
      this.cursor = this.start + this.dur;
      this.n++;
      this.next();
    }
  }
}
