// Big Bend world: shape and bake. Pure TypeScript (no DOM, no three.js), so the same code runs
// in the bake worker, on the main thread as a fallback, and in Node unit tests.
//
// Frame: x is screen-right, z is depth (screen-far is -z), y is up.
// The road descends diagonally from the Chisos (far, top-left of the view) to the Rio Grande
// (near, bottom-right). The journey u = 0..1 travels it downhill, trailhead to river.

export const X0 = -84, X1 = 84, Z0 = -78, Z1 = 84; // world extents (168 × 162 units); the near edge holds at zoom .6, yaw ±40 at u = 1
export const WATER = -0.3;                          // river surface height
export const ROAD_HALF = 1.0;
/** Centre-line dashes: half-width, period along the road and painted share (world units). */
const DASH_HALF = 0.17, DASH_PERIOD = 2.2, DASH_DUTY = 0.42;
/** Glyph classes; the scene writes class / 16 into alpha (15 slots, 0 = nothing). */
export const CLS = { blade: 1, leaf: 2, glow: 3, stone: 4, road: 5, dome: 6, wood: 7, gravel: 8, water: 9, foam: 10, figure: 11, roof: 12, rock: 13, dirt: 14, sky: 15 } as const;

const H_PER_UNIT = 4;   // height grid resolution
const T_PER_UNIT = 8;   // colour / class texture resolution

// ---------------------------------------------------------------- noise
const fract = (x: number) => x - Math.floor(x);
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const sstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
function hash2(i: number, j: number) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x: number, y: number) {
  const i = Math.floor(x), j = Math.floor(y), f = x - i, g = y - j, u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g);
  return (hash2(i, j) * (1 - u) + hash2(i + 1, j) * u) * (1 - v) + (hash2(i, j + 1) * (1 - u) + hash2(i + 1, j + 1) * u) * v;
}
export const fbm = (x: number, y: number) => vnoise(x, y) * 0.5 + vnoise(x * 2.1 + 3, y * 2.1) * 0.28 + vnoise(x * 4.3, y * 4.3 + 5) * 0.15 + vnoise(x * 8.7, y * 8.7) * 0.07;
const ridged = (x: number, y: number) => { const a = 1 - Math.abs(2 * vnoise(x, y) - 1), b = 1 - Math.abs(2 * vnoise(x * 2.2 + 7, y * 2.2) - 1); return a * a * 0.65 + b * b * 0.35; };
/** Seeded PRNG (mulberry32). */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------------------------------------------------------------- the Rio Grande (runs along x, near the camera)
export const riverZ = (x: number) => 51 + 2.6 * Math.sin(x * 0.045 + 0.5) + (fbm(x * 0.04, 7.3) - 0.5) * 2.4;
const riverZd = (x: number) => (riverZ(x + 0.05) - riverZ(x - 0.05)) / 0.1;
export const riverDist = (x: number, z: number) => Math.abs(z - riverZ(x)) / Math.sqrt(1 + riverZd(x) ** 2);

// ---------------------------------------------------------------- the road: a long gentle S, top-left to bottom-right
const END_X = 34;
const TRAIL: readonly [number, number] = [-44, -46];
const END: readonly [number, number] = [END_X, riverZ(END_X) - 6.2];
/**
 * Control points (x, z), far to near: a long gentle S around the trailhead→river diagonal.
 * Index 2 is the trailhead (u = 0); the last is the road's end on the Rio Grande's bank (u = 1).
 */
export const ROAD_CONTROL: ReadonlyArray<readonly [number, number]> = (() => {
  const dx = END[0] - TRAIL[0], dz = END[1] - TRAIL[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
  const pts: [number, number][] = [
    [TRAIL[0] - 30 * ux - 1.5 * nx, TRAIL[1] - 30 * uz - 1.5 * nz], // lead-in, climbing into the Chisos behind the backdrop
    [TRAIL[0] - 15 * ux + 1.0 * nx, TRAIL[1] - 15 * uz + 1.0 * nz],
    [TRAIL[0], TRAIL[1]],
  ];
  for (let k = 1; k < 10; k++) { const f = k / 10, o = 4.2 * Math.sin(f * Math.PI * 3) * (1 - 0.4 * f); pts.push([TRAIL[0] + dx * f + nx * o, TRAIL[1] + dz * f + nz * o]); }
  pts.push([END[0], END[1]]);
  return pts;
})();
const TRAIL_IDX = 2;

// The regional descent axis: trailhead to river end.
const AX = ROAD_CONTROL[TRAIL_IDX][0], AZ = ROAD_CONTROL[TRAIL_IDX][1];
const BX = ROAD_CONTROL[ROAD_CONTROL.length - 1][0], BZ = ROAD_CONTROL[ROAD_CONTROL.length - 1][1];
const AL = Math.hypot(BX - AX, BZ - AZ), ADX = (BX - AX) / AL, ADZ = (BZ - AZ) / AL;
/** 0 at the trailhead, 1 at the river end, along the descent. */
const axisT = (x: number, z: number) => ((x - AX) * ADX + (z - AZ) * ADZ) / AL;
/** Signed distance across the descent; positive is the near side (lower-left on screen). */
const axisW = (x: number, z: number) => -(x - AX) * ADZ + (z - AZ) * ADX;

// Centripetal Catmull-Rom (the same family as THREE.CatmullRomCurve3 'centripetal').
function catmull(pts: ReadonlyArray<readonly [number, number]>, perSeg: number) {
  const P = [
    [2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]],
    ...pts.map((p) => [p[0], p[1]]),
    [2 * pts[pts.length - 1][0] - pts[pts.length - 2][0], 2 * pts[pts.length - 1][1] - pts[pts.length - 2][1]],
  ];
  const out: number[] = [];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    let d01 = Math.pow(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), 0.5), d12 = Math.pow(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), 0.5), d23 = Math.pow(Math.hypot(p3[0] - p2[0], p3[1] - p2[1]), 0.5);
    if (d12 < 1e-4) d12 = 1; if (d01 < 1e-4) d01 = d12; if (d23 < 1e-4) d23 = d12;
    const K: number[][] = [];
    for (let c = 0; c < 2; c++) {
      // Hermite tangents for non-uniform Catmull-Rom (as in three.js)
      const t1 = ((p1[c] - p0[c]) / d01 - (p2[c] - p0[c]) / (d01 + d12) + (p2[c] - p1[c]) / d12) * d12;
      const t2 = ((p2[c] - p1[c]) / d12 - (p3[c] - p1[c]) / (d12 + d23) + (p3[c] - p2[c]) / d23) * d12;
      K.push([p1[c], t1, -3 * p1[c] + 3 * p2[c] - 2 * t1 - t2, 2 * p1[c] - 2 * p2[c] + t1 + t2]);
    }
    for (let s = 0; s < perSeg; s++) {
      const t = s / perSeg, t2 = t * t, t3 = t2 * t;
      out.push(K[0][0] + K[0][1] * t + K[0][2] * t2 + K[0][3] * t3, K[1][0] + K[1][1] * t + K[1][2] * t2 + K[1][3] * t3);
    }
  }
  const last = pts[pts.length - 1];
  out.push(last[0], last[1]);
  return out;
}

interface RoadData {
  /** polyline x, z, cumulative arc length s, smoothed surface height y */
  x: Float64Array; z: Float64Array; s: Float64Array; y: Float64Array;
  n: number; length: number; trailS: number; endS: number;
  /** cumulative 3D arc length (with the descent), which is what THREE's getPointAt measures */
  s3: Float64Array; trailI: number;
  /** spatial buckets of segment indices (4-unit cells, segments within 14 units) */
  buckets: Int32Array[]; bw: number; bh: number;
}
const BUCKET = 4, BUCKET_R = 14;
let ROAD: RoadData | null = null;

function road(): RoadData {
  if (ROAD) return ROAD;
  const flat = catmull(ROAD_CONTROL, 48);
  const n = flat.length / 2;
  const x = new Float64Array(n), z = new Float64Array(n), s = new Float64Array(n), y = new Float64Array(n);
  for (let i = 0; i < n; i++) { x[i] = flat[i * 2]; z[i] = flat[i * 2 + 1]; if (i) s[i] = s[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]); }
  const trailS = s[TRAIL_IDX * 48], endS = s[n - 1];
  // buckets
  const bw = Math.ceil((X1 - X0) / BUCKET), bh = Math.ceil((Z1 - Z0) / BUCKET);
  const lists: number[][] = Array.from({ length: bw * bh }, () => []);
  for (let i = 0; i < n - 1; i++) {
    const i0 = Math.max(0, Math.floor((Math.min(x[i], x[i + 1]) - BUCKET_R - X0) / BUCKET)), i1 = Math.min(bw - 1, Math.floor((Math.max(x[i], x[i + 1]) + BUCKET_R - X0) / BUCKET));
    const j0 = Math.max(0, Math.floor((Math.min(z[i], z[i + 1]) - BUCKET_R - Z0) / BUCKET)), j1 = Math.min(bh - 1, Math.floor((Math.max(z[i], z[i + 1]) + BUCKET_R - Z0) / BUCKET));
    for (let j = j0; j <= j1; j++) for (let k = i0; k <= i1; k++) lists[j * bw + k].push(i);
  }
  ROAD = { x, z, s, y, n, length: endS, trailS, endS, buckets: lists.map((l) => Int32Array.from(l)), bw, bh, s3: new Float64Array(n), trailI: TRAIL_IDX * 48 };
  // surface height: the terrain along the centreline, smoothed so the road rolls gently downhill
  for (let i = 0; i < n; i++) y[i] = baseH(x[i], z[i]);
  const win = Math.max(1, Math.round(9 / (endS / n)));
  for (let pass = 0; pass < 6; pass++) {
    const c = y.slice();
    for (let i = 0; i < n; i++) { let a = 0, m = 0; for (let k = -win; k <= win; k++) { const v = c[i + k]; if (v !== undefined) { a += v; m++; } } y[i] = a / m; }
  }
  for (let i = 0; i < n; i++) y[i] = Math.max(y[i], 0.25);
  for (let i = 1; i < n; i++) ROAD.s3[i] = ROAD.s3[i - 1] + Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1], z[i] - z[i - 1]);
  return ROAD;
}

/** Nearest point on the road: unsigned distance d, signed distance sd (+ near side), arc s. d is capped at BUCKET_R. */
export function roadInfo(px: number, pz: number): { d: number; sd: number; s: number } {
  const d = nearestRoad(px, pz);
  return { d, sd: d * NR.side, s: NR.s };
}
/** Scratch result of nearestRoad (side ±1, arc s), so per-frame callers allocate nothing. */
const NR = { side: 1, s: 0 };
/** Unsigned distance to the road (capped at BUCKET_R); side and arc go to NR. */
function nearestRoad(px: number, pz: number): number {
  const R = road();
  const bi = Math.floor((px - X0) / BUCKET), bj = Math.floor((pz - Z0) / BUCKET);
  NR.side = 1; NR.s = 0;
  if (bi < 0 || bj < 0 || bi >= R.bw || bj >= R.bh) return BUCKET_R;
  const list = R.buckets[bj * R.bw + bi];
  let best = BUCKET_R * BUCKET_R;
  for (let q = 0; q < list.length; q++) {
    const i = list[q], ax = R.x[i], az = R.z[i], dx = R.x[i + 1] - ax, dz = R.z[i + 1] - az, L2 = dx * dx + dz * dz;
    const t = clamp(((px - ax) * dx + (pz - az) * dz) / L2);
    const cx = ax + dx * t, cz = az + dz * t, d2 = (px - cx) ** 2 + (pz - cz) ** 2;
    if (d2 < best) { best = d2; NR.s = R.s[i] + (R.s[i + 1] - R.s[i]) * t; NR.side = dx * (pz - az) - dz * (px - ax) >= 0 ? 1 : -1; }
  }
  return Math.sqrt(best);
}

/** Road surface height at arc length s. */
export function roadY(s: number) {
  const R = road();
  let lo = 0, hi = R.n - 1;
  if (s <= 0) return R.y[0];
  if (s >= R.s[hi]) return R.y[hi];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (R.s[m] <= s) lo = m; else hi = m; }
  const a = (s - R.s[lo]) / (R.s[hi] - R.s[lo]);
  return R.y[lo] * (1 - a) + R.y[hi] * a;
}

/** Road point (x, y, z) at arc length s, plus its unit tangent on the ground. */
export function roadAt(s: number): { x: number; y: number; z: number; tx: number; tz: number } {
  const R = road();
  s = clamp(s, 0, R.endS);
  let lo = 0, hi = R.n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (R.s[m] <= s) lo = m; else hi = m; }
  const a = (s - R.s[lo]) / (R.s[hi] - R.s[lo] || 1);
  const dx = R.x[hi] - R.x[lo], dz = R.z[hi] - R.z[lo], L = Math.hypot(dx, dz) || 1;
  return { x: R.x[lo] + dx * a, y: roadY(s) - 0.02, z: R.z[lo] + dz * a, tx: dx / L, tz: dz / L };
}

/** Dense road polyline with surface heights from arc length `s0` to the end, for THREE.CatmullRomCurve3 (every ~`step` units). */
export function roadPolyline(step = 1.5, s0 = 0): number[][] {
  const R = road(), out: number[][] = [], span = R.endS - s0, m = Math.ceil(span / step);
  for (let k = 0; k <= m; k++) { const p = roadAt(s0 + (span * k) / m); out.push([p.x, p.y, p.z]); }
  return out;
}

export const roadLength = () => road().endS;
/** Arc length along the full road polyline (lead-in included) of journey u (0 = trailhead, 1 = river end).
 *  Not curve t: `road.curve` in scene/road.ts already starts at the trailhead, so there curve t = journey u. */
export const journeyS = (u: number) => {
  // u is the fraction of the 3D length from the trailhead, as `road.curve.getPointAt(u)` measures it
  const R = road(), a = R.s3[R.trailI], t = a + clamp(u) * (R.s3[R.n - 1] - a);
  let lo = R.trailI, hi = R.n - 1;
  if (t <= a) return R.trailS;
  if (t >= R.s3[hi]) return R.endS;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (R.s3[m] <= t) lo = m; else hi = m; }
  return R.s[lo] + (R.s[hi] - R.s[lo]) * ((t - R.s3[lo]) / (R.s3[hi] - R.s3[lo] || 1));
};

// ---------------------------------------------------------------- stops and landmarks
export type StopKey = 'srm' | 'cognizant' | 'ms' | 'phd' | 'now' | 'river';
/**
 * Journey u of each stop. Authoritative for Task 11 (not evenly spaced): the dome (now) sits at
 * u = .5 so the focal point is in the sharp band of the u = .5 shots; the last stretch is the
 * long descent to the river.
 */
export const STOP_U: Record<StopKey, number> = { srm: 0, cognizant: 0.13, ms: 0.26, phd: 0.38, now: 0.5, river: 1 };

export type LandmarkKey = 'ranger' | 'trailer' | 'dome' | 'school' | 'trailhead';
interface LandmarkSpec { id: LandmarkKey; stop: StopKey; label: string; side: 1 | -1; off: number; along: number; scale: number; radius: number }
// side: +1 near (lower-left of the road on screen), -1 far (upper-right). off: centre distance from the
// road's centreline; scale: the builder's scale (Task 10b: every landmark ≥ 1.6× its Task 10 footprint,
// the dome still the largest); radius: footprint radius in world units (pad, scrub clearance).
// Near-side landmarks clear the telephone-pole line (3.1 units out).
const LANDMARK_SPECS: LandmarkSpec[] = [
  { id: 'trailhead', stop: 'srm', label: 'Trailhead', side: -1, off: 4.4, along: 0, scale: 1.6, radius: 3.6 },
  { id: 'ranger', stop: 'cognizant', label: 'Ranger station', side: 1, off: 7.6, along: 0, scale: 1.7, radius: 5.0 },
  { id: 'school', stop: 'ms', label: 'Adobe schoolhouse', side: -1, off: 6.6, along: 0, scale: 1.65, radius: 4.6 },
  // far side, so at u = .5 (the dome's stop) it sits up-road and right of the stop panels, not under them
  { id: 'trailer', stop: 'phd', label: 'Trailer camp', side: -1, off: 6.8, along: 0, scale: 1.7, radius: 5.0 },
  { id: 'dome', stop: 'now', label: 'Geodesic dome', side: -1, off: 7.0, along: 3.0, scale: 1.75, radius: 5.0 },
];
export interface Landmark {
  id: LandmarkKey; stop: StopKey; label: string; x: number; z: number; y: number;
  /** yaw that turns the front (+z local) to face the road */ yaw: number; radius: number; scale: number;
}
let LM: Landmark[] | null = null;
function placeBeside(s: number, side: number, off: number) {
  const p = roadAt(s);
  // near-side normal of the tangent (tx, tz) is (-tz, tx)
  return { x: p.x - p.tz * side * off, z: p.z + p.tx * side * off, faceX: p.tz * side, faceZ: -p.tx * side };
}
export function landmarks(): Landmark[] {
  if (LM) return LM;
  LM = LANDMARK_SPECS.map((l) => {
    const q = placeBeside(journeyS(STOP_U[l.stop]) + l.along, l.side, l.off);
    return { id: l.id, stop: l.stop, label: l.label, x: q.x, z: q.z, y: 0, yaw: Math.atan2(q.faceX, q.faceZ), radius: l.radius, scale: l.scale };
  });
  // each landmark stands on a level pad at its centre's height (see `padded`)
  for (const l of LM) l.y = cutH(l.x, l.z);
  return LM;
}
/** The parked silver Corolla, on the dome's side of the road just before it. */
export function carSpot() { const q = placeBeside(journeyS(STOP_U.now) + 0.2, -1, 2.6); const p = roadAt(journeyS(STOP_U.now) + 0.2); return { x: q.x, z: q.z, y: heightAt(q.x, q.z), yaw: Math.atan2(p.tx, p.tz) }; }
/** Windmill and cottonwoods at a spring on the long last stretch (Dugout Wells). */
export function windmillSpot() { const q = placeBeside(journeyS(0.74), 1, 6.5); return { x: q.x, z: q.z, y: heightAt(q.x, q.z) }; }

// ---------------------------------------------------------------- terrain height
const BUTTES: ReadonlyArray<readonly [number, number, number, number]> = [
  // x, z, radius, height
  [-20, -40, 5.5, 3.6], [-52, -20, 6.5, 4.2], [12, -6, 5.0, 3.0], [-34, 8, 4.2, 2.6], [40, 18, 6.0, 3.8], [-6, 34, 4.0, 2.4],
];
/** Dry washes running down the descent, by axis W offset. */
const washW = (t: number, k: number) => (k === 0 ? 15 + 3.5 * Math.sin(t * 9 + 1) : -21 + 3 * Math.sin(t * 7 + 4));

function baseH(x: number, z: number) {
  const t = axisT(x, z), w = axisW(x, z);
  let y = 0.35 + 11 * Math.pow(clamp(1 - t), 1.15);
  // the Chisos beyond the trailhead
  const m = sstep(0.02, -0.4, t);
  if (m > 0) {
    let mm = m * (12 + 9 * fbm(x * 0.04 + 1, z * 0.04)) + sstep(-0.08, -0.45, t) * ridged(x * 0.08, z * 0.08) * 8;
    mm += 0.45 * Math.sin(mm * 2.3); // rimrock terraces
    y += Math.max(0, mm);
  }
  // valley sides rise away from the corridor
  y += sstep(16, 44, Math.abs(w)) * (2.2 + 3.5 * fbm(x * 0.05 + 4, z * 0.05));
  y += (fbm(x * 0.06, z * 0.06) - 0.5) * 2.0 + (fbm(x * 0.2 + 9, z * 0.2) - 0.5) * 0.6;
  // buttes: flat tops, cliff edges, a caprock step
  for (let i = 0; i < BUTTES.length; i++) {
    const bx = BUTTES[i][0], bz = BUTTES[i][1], r = BUTTES[i][2], hb = BUTTES[i][3];
    const dd = Math.hypot(x - bx, z - bz) * (1 + 0.35 * (fbm(x * 0.22 + bx, z * 0.22) - 0.5));
    if (dd < r + 1.5) y += hb * sstep(r + 1.1, r - 0.3, dd) + 0.5 * sstep(r * 0.7, r * 0.55, dd);
  }
  // washes
  for (let k = 0; k < 2; k++) { const dw = Math.abs(w - washW(t, k)); if (dw < 3) y -= 0.5 * sstep(1.8, 0.5, dw); }
  // Rio Grande: floodplain, then the channel
  const dr = riverDist(x, z);
  y = y + (0.2 - y) * sstep(13, 5, dr);
  y = y + (-1.5 - y) * sstep(4.2, 1.6, dr);
  return y;
}

/** Terrain height with the road cut in (no landmark pads). */
function cutH(x: number, z: number) {
  const y = baseH(x, z), d = nearestRoad(x, z), k = sstep(3.6, 1.7, d);
  return k > 0 ? y * (1 - k) + (roadY(NR.s) - 0.02) * k : y;
}
/** Level the ground under each landmark (outside the road cut), so big footprints neither float nor sink. */
function padded(x: number, z: number, y: number, roadD: number) {
  const lm = landmarks();
  for (let i = 0; i < lm.length; i++) {
    const l = lm[i], d = Math.hypot(x - l.x, z - l.z);
    if (d < l.radius + 2) y += (l.y - y) * sstep(l.radius + 2, l.radius * 0.85, d) * sstep(1.7, 3.6, roadD);
  }
  return y;
}
/** Terrain height with the road cut in and the landmark pads levelled. This is `road.heightAt`. */
export function heightAt(x: number, z: number) {
  return padded(x, z, cutH(x, z), nearestRoad(x, z));
}

// ---------------------------------------------------------------- the bake
export interface ScrubChunk { kind: 0 | 1; start: number; count: number; sphere: [number, number, number, number] }
export interface BakeMeta {
  /** colour / class texture size */
  cols: number; rows: number;
  /** height grid size */
  hCols: number; hRows: number;
  x0: number; x1: number; z0: number; z1: number;
  scrubCount: number;
  /** blades (kind 0) then leaf cards (kind 1), each chunked on a 2D grid; `start` is the instance index */
  chunks: ScrubChunk[];
}
export interface BakeResult { heights: Float32Array; colors: Uint8Array; classes: Uint8Array; scrub: Float32Array; meta: BakeMeta }

/** Fraction of scrub instances that are blades; the rest are leaf cards. Task 10b moved budget from
 *  bunchgrass (which read as dots) to creosote / mesquite mounds (spike: 0.69). */
const BLADE_SHARE = 0.56;
/** Stage timings (ms) of the last bake in this realm; kept out of the result so it stays deterministic. */
export let bakeTimings: Record<string, number> = {};
const CHUNKS = 7;

export function bakeWorld(o: { scrubCount: number; seed: number }): BakeResult {
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const ms: Record<string, number> = (bakeTimings = {});
  let t0 = now();
  road(); landmarks();

  // 1. height grid, with road distance / arc grids for the texture pass
  const HW = (X1 - X0) * H_PER_UNIT + 1, HH = (Z1 - Z0) * H_PER_UNIT + 1;
  const heights = new Float32Array(HW * HH), gSD = new Float32Array(HW * HH), gS = new Float32Array(HW * HH);
  for (let j = 0; j < HH; j++) for (let i = 0; i < HW; i++) {
    const x = X0 + i / H_PER_UNIT, z = Z0 + j / H_PER_UNIT, k = j * HW + i, r = roadInfo(x, z), y = baseH(x, z), c = sstep(3.6, 1.7, r.d);
    heights[k] = padded(x, z, c > 0 ? y * (1 - c) + (roadY(r.s) - 0.02) * c : y, r.d);
    gSD[k] = r.sd; gS[k] = r.s;
  }
  const bil = (g: Float32Array, x: number, z: number) => {
    const u = clamp((x - X0) * H_PER_UNIT, 0, HW - 1.001), v = clamp((z - Z0) * H_PER_UNIT, 0, HH - 1.001);
    const i = u | 0, j = v | 0, a = u - i, b = v - j, q = j * HW + i;
    return (g[q] * (1 - a) + g[q + 1] * a) * (1 - b) + (g[q + HW] * (1 - a) + g[q + HW + 1] * a) * b;
  };
  const H = (x: number, z: number) => bil(heights, x, z);
  ms.fields = now() - t0; t0 = now();

  // 2. colour + glyph-class textures (sRGB bytes)
  const TW = (X1 - X0) * T_PER_UNIT, TH = (Z1 - Z0) * T_PER_UNIT;
  const colors = new Uint8Array(TW * TH * 4), classes = new Uint8Array(TW * TH);
  const lm = landmarks();
  for (let j = 0; j < TH; j++) {
    const z = Z0 + (j + 0.5) / T_PER_UNIT;
    for (let i = 0; i < TW; i++) {
      const x = X0 + (i + 0.5) / T_PER_UNIT;
      const y = H(x, z), sd = bil(gSD, x, z), rd = Math.abs(sd), sp = hash2(i, j), n = fbm(x * 0.3, z * 0.3);
      let r: number, g: number, b: number, k: number;
      if (rd < ROAD_HALF + 0.3) {
        const s = bil(gS, x, z);
        if (rd < ROAD_HALF - 0.15) {
          // dusty asphalt, a warm grey not far below the desert's tone
          const v = 0.9 + n * 0.16 + sp * 0.06; r = 156 * v; g = 142 * v; b = 122 * v; k = CLS.road;
          // centre line: a light warm dash every few glyph cells, about a cell wide (thinner melts into the
          // asphalt in the glyph pass, which samples a cell-sized mip), dim enough not to read as a stripe
          if (rd < DASH_HALF && fract(s / DASH_PERIOD) < DASH_DUTY) { r = 212; g = 194; b = 146; }
        } else { const v = 0.92 + sp * 0.1; r = 188 * v; g = 174 * v; b = 146 * v; k = CLS.gravel; } // gravel shoulders
      } else {
        const dr = riverDist(x, z), t = axisT(x, z), w = axisW(x, z);
        if (dr < 6.2 && y < 0.55) {
          const v = 0.84 + 0.3 * n + sp * 0.12;
          if (dr > 4.4 || n > 0.47) { r = 204 * v; g = 196 * v; b = 178 * v; } else { r = 156 * v; g = 134 * v; b = 104 * v; }
          k = CLS.gravel;
        } else {
          const tone = 0.84 + 0.36 * fbm(x * 0.12 + 5, z * 0.12);
          const red = sstep(0.52, 0.7, fbm(x * 0.07 - 3, z * 0.07)), cal = sstep(0.55, 0.72, fbm(x * 0.11 + 13, z * 0.11 - 2));
          r = (204 - 24 * red + 20 * cal) * tone; g = (186 - 40 * red + 28 * cal) * tone; b = (152 - 34 * red + 36 * cal) * tone;
          k = CLS.dirt;
          const sage = sstep(0.48, 0.66, fbm(x * 0.2 + 31, z * 0.2)) * 0.45;
          r = r * (1 - sage) + 146 * sage; g = g * (1 - sage) + 156 * sage; b = b * (1 - sage) + 122 * sage;
          // washes: pale gravel floors
          for (let q = 0; q < 2; q++) {
            const dw = Math.abs(w - washW(t, q));
            if (dw < 1.1 + 0.5 * n) { const v = 0.86 + 0.2 * n + sp * 0.1; r = 214 * v; g = 206 * v; b = 186 * v; k = CLS.gravel; }
          }
          // slopes, mountains, cliffs
          const e = 0.35, sl = Math.hypot(H(x + e, z) - H(x - e, z), H(x, z + e) - H(x, z - e)) / (2 * e);
          const hi = sstep(0.02, -0.25, t);
          if (hi > 0) {
            const tone2 = 0.8 + 0.45 * fbm(x * 0.15, z * 0.15);
            r = r * (1 - hi) + 142 * tone2 * hi; g = g * (1 - hi) + 140 * tone2 * hi; b = b * (1 - hi) + 114 * tone2 * hi;
            if (hash2(i * 3 + 1, j * 7) < 0.08 * hi) { r *= 0.42; g *= 0.55; b *= 0.4; } // juniper dots
          }
          const cliff = sstep(0.75, 1.25, sl);
          if (cliff > 0.3) {
            const band = fract(y / 1.3 + fbm(x * 0.2, z * 0.2) * 0.5) < 0.5;
            const rv = 0.74 + 0.45 * fbm(x * 0.5, y * 1.6);
            if (band) { r = 166 * rv; g = 140 * rv; b = 134 * rv; } else { r = 150 * rv; g = 146 * rv; b = 144 * rv; }
            k = CLS.rock;
          }
          // rubble fields and desert pavement: dark varnished stones on the flats, between the landmarks
          const rub = sstep(0.5, 0.68, fbm(x * 0.32 + 71, z * 0.32 - 9)) * (1 - hi);
          if (rub > 0 && hash2(i * 5 + 3, j * 11 + 1) < 0.34 * rub) {
            const rv = 0.55 + 0.3 * hash2(i + 7, j * 3); r = 128 * rv; g = 116 * rv; b = 104 * rv; k = CLS.rock;
          } else if (rub > 0.3) { r *= 0.86; g *= 0.83; b *= 0.8; }
          if (sp < 0.05) { r *= 0.62; g *= 0.6; b *= 0.58; } // pebbles
          // trampled pads around the landmarks
          for (const l of lm) {
            const dl = Math.hypot(x - l.x, z - l.z);
            if (dl < l.radius + 1.6) { const a = sstep(l.radius + 1.6, l.radius, dl) * 0.6; r = r * (1 - a) + 214 * a; g = g * (1 - a) + 200 * a; b = b * (1 - a) + 170 * a; }
          }
        }
      }
      const q = (j * TW + i) * 4;
      colors[q] = clamp(r, 0, 255); colors[q + 1] = clamp(g, 0, 255); colors[q + 2] = clamp(b, 0, 255); colors[q + 3] = 255;
      classes[j * TW + i] = k * 16;
    }
  }
  ms.texture = now() - t0; t0 = now();

  // 3. scrub: blades (bunchgrass, ocotillo, lechuguilla, river cane) and leaf cards (creosote,
  //    mesquite, juniper, willow). Corridor only: what the camera can see along the journey.
  const rnd = prng(o.seed * 7919 + 17);
  const N = Math.max(0, Math.floor(o.scrubCount)), NB = Math.round(N * BLADE_SHARE), NL = N - NB;
  const CW = (X1 - X0) / CHUNKS, CH = (Z1 - Z0) / CHUNKS;
  const chunkOf = (x: number, z: number) => clamp(Math.floor((z - Z0) / CH), 0, CHUNKS - 1) * CHUNKS + clamp(Math.floor((x - X0) / CW), 0, CHUNKS - 1);
  type Inst = number[]; // x y z ex ey ez sx sy sz r g b
  const blades: Inst[][] = Array.from({ length: CHUNKS * CHUNKS }, () => []), leaves: Inst[][] = Array.from({ length: CHUNKS * CHUNKS }, () => []);
  const car = carSpot(), mill = windmillSpot();
  const avoid = (x: number, z: number) => {
    for (const l of lm) if ((x - l.x) ** 2 + (z - l.z) ** 2 < (l.radius + 0.8) ** 2) return true;
    return (x - car.x) ** 2 + (z - car.z) ** 2 < 4 || (x - mill.x) ** 2 + (z - mill.z) ** 2 < 2.5;
  };
  const inCorridor = (x: number, z: number) => { const t = axisT(x, z); return (Math.abs(axisW(x, z)) < 27 && t > -0.16 && t < 1.15) || riverDist(x, z) < 13; };
  const pick = () => { const x = X0 + 1 + rnd() * (X1 - X0 - 2), z = Z0 + 1 + rnd() * (Z1 - Z0 - 2); return [x, z]; };
  let nb = 0, nl = 0, guard = 0;
  const pushB = (x: number, z: number, ex: number, ey: number, ez: number, sx: number, sy: number, c: number[]) => { blades[chunkOf(x, z)].push([x, H(x, z) - 0.02, z, ex, ey, ez, sx, sy, sx, c[0], c[1], c[2]]); nb++; };
  // river cane in dense bands along both banks (about 12% of blades)
  while (nb < NB * 0.12 && guard++ < 4e6) {
    const x = X0 + 1 + rnd() * (X1 - X0 - 2), side = rnd() < 0.5 ? -1 : 1, z = riverZ(x) + side * (3.4 + rnd() * 1.8);
    if (fbm(x * 0.15, side * 5) < 0.36 || avoid(x, z)) continue;
    const v = 0.75 + rnd() * 0.5;
    pushB(x, z, (rnd() - 0.5) * 0.3, rnd() * 6.28, (rnd() - 0.5) * 0.3, 1.3, 0.9 + rnd() * 0.8, [0.34 * v, 0.48 * v, 0.15 * v]);
  }
  // desert clumps
  guard = 0;
  while (nb < NB && guard++ < 8e6) {
    const [cx, cz] = pick();
    if (!inCorridor(cx, cz)) continue;
    const rd = Math.abs(bil(gSD, cx, cz)), cy = H(cx, cz);
    if (rd < 2.1 || riverDist(cx, cz) < 5.6 || avoid(cx, cz)) continue;
    const kind = rnd();
    if (kind < 0.1) { // ocotillo: tall thin whips fanning out
      const n = 8 + ((rnd() * 6) | 0), v = 0.8 + rnd() * 0.3;
      for (let m = 0; m < n && nb < NB; m++) { const a = rnd() * 6.283, lean = 0.12 + rnd() * 0.22; pushB(cx + Math.cos(a) * 0.08, cz + Math.sin(a) * 0.08, Math.sin(a) * lean, rnd() * 6.28, Math.cos(a) * lean, 0.6, 2.2 + rnd() * 1.0, [0.24 * v, 0.24 * v, 0.15 * v]); }
    } else if (kind < 0.4) { // lechuguilla: clumps of short pale rosettes, often in rocky ground
      const clump = 2 + ((rnd() * 5) | 0), v = 0.85 + rnd() * 0.3;
      for (let c = 0; c < clump && nb < NB; c++) {
        const ca = rnd() * 6.283, cr = c ? 0.35 + rnd() * 0.6 : 0, rx = cx + Math.cos(ca) * cr, rz = cz + Math.sin(ca) * cr, n = 7 + ((rnd() * 5) | 0), sz = 0.8 + rnd() * 0.5;
        for (let m = 0; m < n && nb < NB; m++) { const a = rnd() * 6.283, lean = 0.55 + rnd() * 0.4; pushB(rx, rz, Math.sin(a) * lean, a, Math.cos(a) * lean, 1.5, (0.45 + rnd() * 0.25) * sz, [0.42 * v, 0.48 * v, 0.3 * v]); }
      }
    } else { // bunchgrass, patchy
      if (fbm(cx * 0.2 + 31, cz * 0.2) < 0.38 + rnd() * 0.1 || cy > 22) continue;
      const dry = rnd() < 0.62, n = 6 + ((rnd() * 8) | 0), tone = 0.75 + rnd() * 0.5;
      for (let m = 0; m < n && nb < NB; m++) {
        const a = rnd() * 6.283, rr = rnd() * 0.38, v = (0.75 + rnd() * 0.5) * tone;
        pushB(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, (rnd() - 0.5) * 0.5, rnd() * 6.28, (rnd() - 0.5) * 0.5, 1.4, 0.35 + rnd() * 0.35, dry ? [0.66 * v, 0.54 * v, 0.3 * v] : [0.36 * v, 0.42 * v, 0.22 * v]);
      }
    }
  }
  if (nb < NB) throw new Error(`bake: placed ${nb} of ${NB} blades`);
  // bushes: creosote / mesquite on the flats, junipers in the hills, willows and mesquite by water
  guard = 0;
  const bushes: number[] = []; // x, z, s of each bush, for the ground shading under it
  const bushAt = (bx: number, bz: number, s: number, pal: number[][]) => {
    const by = H(bx, bz), n = Math.round(30 * s * s + 12);
    bushes.push(bx, bz, s);
    for (let m = 0; m < n && nl < NL; m++) {
      const u = rnd() * 2 - 1, th = rnd() * 6.283, qq = Math.sqrt(1 - u * u), rr = s * Math.cbrt(rnd());
      const p = pal[(rnd() * pal.length) | 0], lit = 0.72 + 0.55 * clamp(u * 0.5 + 0.5);
      const x = bx + qq * Math.cos(th) * rr, z = bz + qq * Math.sin(th) * rr;
      leaves[chunkOf(x, z)].push([x, by + s * 0.55 + u * rr * 0.6, z, rnd() * 6, rnd() * 6, rnd() * 6, 1, 1, 1, p[0] * lit, p[1] * lit, p[2] * lit]); nl++;
    }
  };
  // cottonwoods at the windmill spring
  for (let c = 0; c < 7 && nl < NL; c++) { const a = c * 0.9 + rnd(), rr = 3 + rnd() * 3; bushAt(mill.x + Math.cos(a) * rr, mill.z + Math.sin(a) * rr, 1.5 + rnd() * 0.6, [[0.26, 0.42, 0.12], [0.34, 0.5, 0.14], [0.2, 0.34, 0.1]]); }
  while (nl < NL && guard++ < 4e6) {
    const [bx, bz] = pick();
    if (!inCorridor(bx, bz)) continue;
    const rd = Math.abs(bil(gSD, bx, bz)), dr = riverDist(bx, bz), by = H(bx, bz);
    if (rd < 2.7 || dr < 3.3 || by > 24 || avoid(bx, bz)) continue;
    const t = axisT(bx, bz), w = axisW(bx, bz);
    const wash = Math.min(Math.abs(w - washW(t, 0)), Math.abs(w - washW(t, 1)));
    const river = dr < 7, green = river || (wash > 1.3 && wash < 3.6), mtn = t < 0.02;
    if (wash < 1.3) continue;
    if (green ? rnd() < 0.4 : rnd() < 0.3) continue;
    const s = green ? 0.85 + rnd() * 0.8 : mtn ? 0.5 + rnd() * 0.4 : 0.5 + rnd() * 0.55;
    const pal = green ? [[0.22, 0.4, 0.1], [0.3, 0.47, 0.12], [0.18, 0.32, 0.08]] : mtn ? [[0.16, 0.24, 0.12], [0.22, 0.3, 0.14]] : [[0.32, 0.38, 0.18], [0.4, 0.44, 0.23], [0.26, 0.32, 0.15]];
    bushAt(bx, bz, s, pal);
  }
  if (nl < NL) throw new Error(`bake: placed ${nl} of ${NL} leaf cards`);
  // ground shading under each bush: a soft dark mound base, so scrub reads as clumps on the sand
  for (let q = 0; q < bushes.length; q += 3) {
    const bx = bushes[q], bz = bushes[q + 1], R = bushes[q + 2] * 1.25;
    const i0 = Math.max(0, Math.floor((bx - R - X0) * T_PER_UNIT)), i1 = Math.min(TW - 1, Math.ceil((bx + R - X0) * T_PER_UNIT));
    const j0 = Math.max(0, Math.floor((bz - R - Z0) * T_PER_UNIT)), j1 = Math.min(TH - 1, Math.ceil((bz + R - Z0) * T_PER_UNIT));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(X0 + (i + 0.5) / T_PER_UNIT - bx, Z0 + (j + 0.5) / T_PER_UNIT - bz) / R;
      if (d >= 1) continue;
      const c = (j * TW + i) * 4, f = 1 - 0.38 * sstep(1, 0.35, d);
      colors[c] *= f; colors[c + 1] *= f; colors[c + 2] *= f;
    }
  }

  // pack: matrices [0, 16N), colours [16N, 19N); blades by chunk, then leaves by chunk
  const scrub = new Float32Array(N * 19);
  const chunks: ScrubChunk[] = [];
  let k = 0;
  for (const [kind, set] of [[0, blades], [1, leaves]] as const) {
    set.forEach((c) => {
      if (!c.length) return;
      for (let i = c.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const tmp = c[i]; c[i] = c[j]; c[j] = tmp; } // any prefix is a uniform subset
      const start = k;
      let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9, mnz = 1e9, mxz = -1e9;
      for (const [x, y, z, ex, ey, ez, sx, sy, sz, r, g, b] of c) {
        const a = Math.cos(ex), bb = Math.sin(ex), cc = Math.cos(ey), d = Math.sin(ey), e = Math.cos(ez), f = Math.sin(ez);
        const ae = a * e, af = a * f, be = bb * e, bf = bb * f, q = k * 16;
        // Euler XYZ rotation × scale, column-major (as THREE.Matrix4.compose)
        scrub[q] = cc * e * sx; scrub[q + 1] = (af + be * d) * sx; scrub[q + 2] = (bf - ae * d) * sx; scrub[q + 3] = 0;
        scrub[q + 4] = -cc * f * sy; scrub[q + 5] = (ae - bf * d) * sy; scrub[q + 6] = (be + af * d) * sy; scrub[q + 7] = 0;
        scrub[q + 8] = d * sz; scrub[q + 9] = -bb * cc * sz; scrub[q + 10] = a * cc * sz; scrub[q + 11] = 0;
        scrub[q + 12] = x; scrub[q + 13] = y; scrub[q + 14] = z; scrub[q + 15] = 1;
        const cq = N * 16 + k * 3; scrub[cq] = r; scrub[cq + 1] = g; scrub[cq + 2] = b;
        k++;
        if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y; if (z < mnz) mnz = z; if (z > mxz) mxz = z;
      }
      chunks.push({ kind, start, count: c.length, sphere: [(mnx + mxx) / 2, (mny + mxy) / 2, (mnz + mxz) / 2, Math.hypot(mxx - mnx, mxy - mny, mxz - mnz) / 2 + 3] });
    });
  }
  ms.scrub = now() - t0;

  return { heights, colors, classes, scrub, meta: { cols: TW, rows: TH, hCols: HW, hRows: HH, x0: X0, x1: X1, z0: Z0, z1: Z1, scrubCount: N, chunks } };
}

/** Typed arrays of a bake result, for postMessage transfer lists. */
export const bakeTransfer = (r: BakeResult): ArrayBuffer[] => [r.heights.buffer, r.colors.buffer, r.classes.buffer, r.scrub.buffer] as ArrayBuffer[];
