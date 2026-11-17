// Pure maths for the scene backdrop: which scene shows, how much of the next one has dissolved in.

export type SceneSet = 'land' | 'port';

/**
 * `centres` are the section centres (rect.top + rect.height / 2) in page order, `mid` is
 * innerHeight / 2. `k` is the scene underneath and `t` the share of scene k + 1 on top.
 * With `reduced`, `t` snaps at one half so a frame is never a mix.
 */
export function sceneAt(centres: number[], mid: number, reduced: boolean): { k: number; t: number } {
  let k = 0;
  let t = 0;
  for (let i = 0; i < centres.length - 1; i++) {
    const span = centres[i] - centres[i + 1];
    const share = span === 0 ? (mid >= centres[i] ? 1 : 0) : (centres[i] - mid) / span;
    if (share >= 0) { k = i; t = Math.min(1, share); }
  }
  if (reduced) t = t >= 0.5 ? 1 : 0;
  if (t >= 1 && k + 1 < centres.length) return { k: k + 1, t: 0 };
  return { k, t: t >= 1 ? 0 : t };
}

/** Whole-number CSS scale at which a w×h scene covers the viewport. */
export const integerScale = (vw: number, vh: number, w: number, h: number): number =>
  Math.ceil(Math.max(vw / w, vh / h));

export const pickSet = (vw: number, vh: number): SceneSet => (vh > vw ? 'port' : 'land');

/** Deterministic per-pixel thresholds in [0,1) (Park–Miller), the order pixels dissolve in. */
export function dissolveOrder(n: number, seed: number): Float32Array {
  const out = new Float32Array(n);
  let s = seed % 2147483647 || 1;
  for (let i = 0; i < n; i++) {
    s = (s * 16807) % 2147483647;
    out[i] = Math.min(s / 2147483647, 1 - 2 ** -24);
  }
  return out;
}
