// Pure maths for the scene backdrop: section anchors, the snapped scene for reduced motion, the scale and set.

export type SceneSet = 'land' | 'port';

/**
 * Where a section counts as "here": its centre, but never further below its top than half a
 * viewport, so a stop taller than the screen gets its scene as its top arrives. `inset` is the
 * scroll-padding a deep link leaves above the section (the sticky bar), so landing on the section
 * puts the viewport middle exactly on its anchor.
 */
export const sectionAnchor = (top: number, height: number, vh: number, inset = 0): number =>
  Math.min(top + height / 2, top + vh / 2 - inset);

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
