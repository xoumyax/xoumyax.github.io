// Quality tiers and the frame-rate governor. Pure: no DOM, no three.js.
// Values come from the Phase 0 performance spike (GPU ms per tier at 1440×900 @1x/@2x and 390×844 @3x).

export type QualityTier = 'high' | 'medium' | 'low';

export interface TierSettings {
  /** glyph cell width in CSS px on desktop; cell height is twice this */
  cellPx: number;
  /** glyph cell width in CSS px on phones (CSS width < 700) */
  cellPxPhone: number;
  /** scrub instances (grass blades + leaf cards) the worker bakes */
  scrubCount: number;
  shadowMap: number;
  /** scene render target as a fraction of the output backing */
  renderScale: number;
  /** cap on devicePixelRatio for the output backing */
  dprCap: number;
}

export const TIERS: Record<QualityTier, TierSettings> = {
  high: { cellPx: 7.2, cellPxPhone: 6.0, scrubCount: 290000, shadowMap: 4096, renderScale: 1.0, dprCap: 2 },
  medium: { cellPx: 7.2, cellPxPhone: 6.0, scrubCount: 174000, shadowMap: 2048, renderScale: 0.75, dprCap: 1.5 },
  low: { cellPx: 8.0, cellPxPhone: 6.5, scrubCount: 87000, shadowMap: 1024, renderScale: 0.5, dprCap: 1.5 },
};

const ORDER: QualityTier[] = ['high', 'medium', 'low'];

/**
 * Start tier. Phones start on medium (low on weak devices). Desktops start on high at DPR < 2;
 * a DPR ≥ 2 backing costs about twice the GPU time, so those start on medium. The governor
 * only ever demotes from here.
 */
export function pickInitialTier(i: { isMobile: boolean; dpr: number; deviceMemory?: number; hardwareConcurrency?: number }): QualityTier {
  const mem = i.deviceMemory ?? 8, cores = i.hardwareConcurrency ?? 8;
  if (i.isMobile) return mem <= 3 || cores <= 4 ? 'low' : 'medium';
  if (mem <= 2 || cores <= 2) return 'low';
  if (i.dpr >= 2 || mem <= 4 || cores <= 4) return 'medium';
  return 'high';
}

/** Fewest frame samples a governor window is judged on (a 10 fps device gives 20 in a 2 s window). */
export const GOVERNOR_MIN_SAMPLES = 20;

/** Sustained-trouble thresholds: a median under this many fps … */
export const GOVERNOR_MIN_FPS = 24;
/** … or a 90th-percentile frame time over this many ms. */
export const GOVERNOR_MAX_P90_MS = 50;

/**
 * Demote-only governor. `fps` is a window of per-frame rates (1000 / frame ms). It steps down one
 * tier only on sustained trouble: a median under 24 fps, or a p90 frame time over 50 ms. From
 * 'low', the same conditions ask for the still fallback. A device whose rAF is capped near 30 Hz
 * (iOS Low Power Mode, battery saver) is healthy and keeps its tier. Too few samples keeps it too.
 */
export function governor(fps: number[], tier: QualityTier, minSamples = GOVERNOR_MIN_SAMPLES): QualityTier | 'fallback' {
  if (fps.length < minSamples) return tier;
  const s = [...fps].sort((a, b) => a - b);
  const median = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  // p90 frame time is the frame time of the 10th-percentile fps (nearest rank)
  const p10 = s[Math.floor(0.1 * (s.length - 1))];
  const p90ms = p10 > 0 ? 1000 / p10 : Infinity;
  if (median >= GOVERNOR_MIN_FPS && p90ms <= GOVERNOR_MAX_P90_MS) return tier;
  const next = ORDER[ORDER.indexOf(tier) + 1];
  return next ?? 'fallback';
}

/**
 * The governor's timings, in elapsed render time (the sum of frame times, so a hidden, paused tab
 * does not count): ignore the first `warmupMs` after reveal (shaders, uploads, the first glide),
 * then judge a window every `windowMs` once it holds GOVERNOR_MIN_SAMPLES frames. Fast path: if
 * the first `fastMs` average more than `fastFrameMs` a frame, go straight to 'low' (the next bad
 * window then asks for the fallback). A window that cannot reach GOVERNOR_MIN_SAMPLES in
 * `windowMs` (a device under 10 fps) is judged at `windowMs` on what it has, once it holds
 * `slowMinSamples`.
 */
export const GOVERNOR_TIMING = { warmupMs: 1500, windowMs: 2000, fastMs: 1000, fastFrameMs: 100, slowMinSamples: 5 } as const;

export interface Governor {
  readonly tier: QualityTier;
  /**
   * Feed one frame's duration (ms). Returns the new tier when it demotes, 'fallback' when even
   * 'low' cannot hold, else null. After 'fallback' it only returns null.
   */
  frame(frameMs: number): QualityTier | 'fallback' | null;
}

/** The stateful, demote-only frame-rate governor. Pure: the caller supplies the frame times. */
export function createGovernor(start: QualityTier, t: typeof GOVERNOR_TIMING = GOVERNOR_TIMING): Governor {
  let tier = start, done = false;
  let elapsed = 0, fastElapsed = 0, frames = 0, fastDone = false;
  const fast: number[] = [];
  let winStart: number = t.warmupMs;
  const win: number[] = [];
  const close = () => { win.length = 0; winStart = Math.max(elapsed, t.warmupMs); };
  return {
    get tier() { return tier; },
    frame(ms) {
      if (done || !(ms > 0)) return null;
      elapsed += ms;
      // Fast path: the very first frame (shader upload, first paint) is excluded, and the verdict uses the
      // median of at least 3 frames, so one slow start-up frame can't send a healthy device to 'low'.
      if (!fastDone && frames++ > 0) {
        fastElapsed += ms; fast.push(ms);
        if (fastElapsed >= t.fastMs && fast.length >= 3) {
          fastDone = true;
          const med = fast.slice().sort((a, b) => a - b)[fast.length >> 1];
          if (med > t.fastFrameMs && tier !== 'low') { close(); tier = 'low'; return tier; }
        }
      }
      if (elapsed <= t.warmupMs) return null;
      win.push(1000 / ms);
      if (elapsed - winStart < t.windowMs) return null;
      if (win.length < t.slowMinSamples) return null; // under 2.5 fps: wait for a few more frames
      const verdict = governor(win, tier, Math.min(GOVERNOR_MIN_SAMPLES, win.length));
      close();
      if (verdict === tier) return null;
      if (verdict === 'fallback') { done = true; return verdict; }
      tier = verdict;
      return verdict;
    },
  };
}
