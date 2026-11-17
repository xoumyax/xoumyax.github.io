// Scroll → road position, easing, and view limits. Pure: no DOM, no three.js.

export interface StopBox { top: number; height: number }

/** Even spacing along the road. A fallback only: boot uses the engine's `journeyForStop`, which is not even. */
export function stopU(index: number, count: number): number {
  return count <= 1 ? 0 : Math.min(1, Math.max(0, index / (count - 1)));
}

/** The reading line, as a fraction of the viewport height. */
export const LINE = 0.4;
/** A stop holds its u while the line is in the first half of its section. */
export const HOLD = 0.5;

/**
 * Road position (0..1) for the current scroll. `stops` are the stop sections in page order, with
 * `top` relative to the viewport. The stop under the line at 40% of the viewport maps to its u:
 * the u holds while the line is in the stop's first half (so a `#stop-x` link, which puts the
 * section's top at scroll-padding-top, lands exactly on it), then glides linearly to the next
 * stop's u across the second half. Above the first stop it is the first u; past the last, the last.
 * `us` defaults to even spacing (`stopU`); it must be non-decreasing.
 */
export function journeyProgress(stops: StopBox[], viewportH: number, us?: number[]): number {
  const n = stops.length;
  if (!n) return 0;
  const u = (i: number) => (us ? us[i] : stopU(i, n));
  const y = LINE * viewportH;
  if (y < stops[0].top) return clamp01(u(0));
  for (let i = 0; i < n - 1; i++) {
    const next = stops[i + 1];
    if (y >= next.top) continue;
    // the line is in stop i
    const holdEnd = stops[i].top + HOLD * stops[i].height;
    if (y <= holdEnd) return clamp01(u(i));
    const span = next.top - holdEnd;
    const f = span > 0 ? Math.min(1, (y - holdEnd) / span) : 1;
    return clamp01(u(i) + f * (u(i + 1) - u(i)));
  }
  return clamp01(u(n - 1));
}

/** Exponential ease: after `halfLife` seconds, half the gap to `target` is closed. */
export function easeToward(cur: number, target: number, dtSec: number, halfLife = 0.35): number {
  return target + (cur - target) * Math.pow(0.5, dtSec / halfLife);
}

export interface View { yaw: number; pitch: number; zoom: number }
/** The engine's base camera pitch (degrees). The one definition: the engine and boot import it. */
export const BASE_PITCH = 52;
/**
 * View limits, the one definition (the engine clamps its offsets with them; boot and clampView use
 * them in absolute terms). Pitch is absolute; the engine's offset range is pitch − BASE_PITCH.
 */
export const VIEW_LIMITS = { yaw: [-40, 40], pitch: [48, 62], zoom: [0.6, 1.8] } as const;

export function clampView(v: View): View {
  const c = (x: number, [a, b]: readonly [number, number]) => Math.min(b, Math.max(a, x));
  return { yaw: c(v.yaw, VIEW_LIMITS.yaw), pitch: c(v.pitch, VIEW_LIMITS.pitch), zoom: c(v.zoom, VIEW_LIMITS.zoom) };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
