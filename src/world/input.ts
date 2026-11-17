// Gesture classification for the world on `/` (spec §5.5). Pure: no DOM globals, no three.js.
//
// Plain wheel and vertical swipes are always the page's own scroll (travel the road). Ctrl/⌘+wheel
// (a trackpad pinch arrives as ctrl+wheel) and two-finger pinch zoom the world only over open
// world; over a card row or text the browser keeps them. A horizontal one-finger drag on open
// world turns the view; on a card row it scrolls the row.

export type Intent = 'native' | 'orbit' | 'zoom' | 'browser';
export type Over = 'world' | 'card-row' | 'content';

export function classifyWheel(e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }, over: Over): Intent {
  if (e.ctrlKey || e.metaKey) return over === 'world' ? 'zoom' : 'browser';
  return 'native';
}

/** Movement (px) before a one-finger touch is classified. */
export const TOUCH_SLOP = 8;

export function classifyTouch(t: { touches: number; dx: number; dy: number }, over: Over): Intent {
  if (t.touches >= 2) return over === 'world' ? 'zoom' : 'browser';
  if (over !== 'world') return 'native';
  // clearly sideways turns the view; anything near vertical (or a tie) scrolls
  return Math.abs(t.dx) > 1.5 * Math.abs(t.dy) ? 'orbit' : 'native';
}

/** Selectors that are content (not open world) under the pointer. */
const CONTENT = '[data-panel], header, footer, nav, a, button, input, select, textarea, label, [contenteditable]';

/**
 * Where a pointer event's target sits. Open world is anything outside `[data-panel]` and
 * `[data-card-row]` (and the page chrome); the landmark doors stand on the world, so they count as world.
 */
export function overOf(target: { closest?: (sel: string) => unknown } | null | undefined): Over {
  if (!target || typeof target.closest !== 'function') return 'world';
  if (target.closest('[data-card-row]')) return 'card-row';
  if (target.closest('#landmarks')) return 'world';
  if (target.closest(CONTENT)) return 'content';
  return 'world';
}

/** Zoom factor for one wheel event; deltaMode 1 is lines (16 px), 2 is pages (800 px). */
export function wheelZoomFactor(deltaY: number, deltaMode: number): number {
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 800 : deltaY;
  return Math.exp(-Math.max(-240, Math.min(240, px)) * 0.004);
}
