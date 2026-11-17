// Viewport rules for the world canvas. Pure: no DOM, no three.js.

/** A height-only change under this many CSS px is a phone's URL bar showing or hiding (I6). */
export const URL_BAR_PX = 120;

/**
 * Whether the engine skips a ResizeObserver change from `prev` to `next` (CSS px). On a coarse
 * pointer a height-only change under URL_BAR_PX is ignored: reallocating both render targets and
 * re-framing the camera every time the URL bar moves is a visible pop. Width changes always apply,
 * and DPR changes reach the engine another way (a resolution media query), never through here.
 */
export function ignoreResize(prev: { w: number; h: number }, next: { w: number; h: number }, coarse: boolean): boolean {
  return coarse && next.w === prev.w && Math.abs(next.h - prev.h) < URL_BAR_PX;
}
