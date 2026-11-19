// Pure maths for the living world: stop progress, the sideways pan between scenes, band shifts,
// seam jitter, camera drift, ambient event timing, and the screen side: device-px snapping, the
// seam clip and the smoothed scroll position. Import-free so the client bundle stays light.

export const PAN_VH = 1;
export const PAN_MAX = 0.5;
export const CAM_X = 12;
export const CAM_Y = 4;
export const SEAM_MAX = 4;

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const smoothstep = (x: number): number => x * x * (3 - 2 * x);

/** Scroll px the pan between two stops takes: a viewport, never more than half the gap. */
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

// ---------------------------------------------------------------- ambient clock grid

/** The ambient clock on its 0.1 s grid (frame flips, poses, events): floor(t · 10) / 10, exact for t = n / 10. */
export const tenth = (t: number): number => Math.floor(t * 10 + 1e-7) / 10;

// ---------------------------------------------------------------- screen: device px

/**
 * Where a layer offset `o` (world px, fractional) lands at `b` device px per world px: layer
 * column (or row) n = floor(o) starts at device px d = −round(frac(o) · b), in [−b, 0]. A whole
 * offset gives d = 0, so a layer at rest sits on the same device grid as a flat frame; between whole
 * offsets it moves in whole device px (blocks never straddle a device px, so they never shimmer).
 */
export function snapOffset(o: number, b: number): { n: number; d: number } {
  const n = Math.floor(o);
  return { n, d: 0 - Math.round((o - n) * b) }; // 0 − …: never −0
}

/** Device px the band of pan share `share` (bandShift) has slid, for a view `vw` world px wide. */
export const panDev = (share: number, vw: number, b: number): number => Math.round(share * vw * b);

/** Device y where view row j starts (j = 0 … rows): row j covers [rowY(j), rowY(j + 1)). */
export const rowY = (j: number, b: number): number => Math.round(j * b);

/**
 * The left edge, in device px, of scene k + 1's band `band` in each view row while scene k keeps
 * x < `cut` (device px): cut − round(seamJitter(row) · b), never below 0. Same rounding as the cut,
 * so where the jitter is 0 the two scenes meet with no gap and no overlap.
 */
export function seamEdges(cut: number, band: number, rows: number, b: number): Int32Array {
  const e = new Int32Array(rows);
  for (let j = 0; j < rows; j++) e[j] = Math.max(0, cut - Math.round(seamJitter(j, band) * b));
  return e;
}

// ---------------------------------------------------------------- the smoothed scroll position

/** Each of the follower's two stages (s): lag behind a steady scroll ≈ 2 · FOLLOW_TAU. */
export const FOLLOW_TAU = 0.055;
/** A jump further than this many viewport heights (deep link, End, an anchor) snaps. */
export const FOLLOW_JUMP = 1.5;
/** Settled within this many px of the target. */
export const FOLLOW_EPS = 0.5;

/**
 * The scroll position the backdrop shows: it follows the real one through two exponential stages
 * (critically damped, no overshoot: it is a positively weighted average of past targets), so
 * uneven wheel and trackpad deltas reach the scene as an even glide. `step` returns whether it is
 * still moving; once within FOLLOW_EPS of the target it lands there exactly.
 */
export class Follower {
  y = 0;              // shown position
  private a = 0;      // first stage
  moving = false;
  snap(target: number): void { this.y = this.a = target; this.moving = false; }
  /**
   * One frame: dt in s since the last one (clamped to 1/20 s so a stalled frame does not lurch),
   * vh the viewport height. `instant` (still mode, reduced motion) lands on the target at once.
   */
  step(target: number, dt: number, vh: number, instant = false): boolean {
    if (instant || !Number.isFinite(this.y) || Math.abs(target - this.y) > FOLLOW_JUMP * vh) { this.snap(target); return false; }
    const k = 1 - Math.exp(-Math.min(Math.max(dt, 0), 0.05) / FOLLOW_TAU);
    this.a += (target - this.a) * k;
    this.y += (this.a - this.y) * k;
    if (Math.abs(target - this.a) < FOLLOW_EPS && Math.abs(target - this.y) < FOLLOW_EPS) this.snap(target);
    else this.moving = true;
    return this.moving;
  }
}
