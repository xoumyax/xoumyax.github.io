// Mode II (the ASCII landing page): which background clip plays for each part, and the short
// tab labels. Free of runtime imports so the client script can use it.
import type { STOP_IDS } from './stops';

type StopId = (typeof STOP_IDS)[number];

/** The clips in public/mode2 (scripts/mode2-clips.sh cuts them). */
export const CLIP_IDS = ['hero', 'road', 'littlebirdy', 'campground', 'glamping', 'mesa'] as const;
export type ClipId = (typeof CLIP_IDS)[number];

/** Each journey stop's own clip: one clip per stop, never shared (the owner, 2026-11-19). */
export const STOP_CLIP: Record<StopId, ClipId> = {
  now: 'glamping',
  phd: 'hero',
  ms: 'littlebirdy',
  cognizant: 'road',
  srm: 'mesa',
  river: 'campground',
};

/** The landing shares Now's clip: Now is the tab open on arrival. */
export const LANDING_CLIP: ClipId = STOP_CLIP.now;

/** Short tab labels (the panel keeps each stop's full title). */
export const STOP_SHORT: Record<StopId, string> = {
  now: 'Now',
  phd: 'Ph.D.',
  ms: 'M.S.',
  cognizant: 'Cognizant',
  srm: 'B.Tech',
  river: 'Open to work',
};

/** Phone clips are portrait crops; the poster is shared by both. */
export const clipUrl = (id: ClipId, portrait: boolean) => `/mode2/${id}${portrait ? '-m' : ''}.mp4`;
export const posterUrl = (id: ClipId) => `/mode2/${id}.jpg`;

/** The stop a #stop-<id> hash names, if it is one of `ids`. */
export function stopFromHash<T extends string>(hash: string, ids: readonly T[]): T | null {
  const m = /^#stop-([a-z]+)$/.exec(hash);
  return m && (ids as readonly string[]).includes(m[1]) ? (m[1] as T) : null;
}

/** ARIA tabs keys: arrows wrap, Home/End go to the ends; anything else is not ours (null). */
export function tabKeyTarget(key: string, at: number, count: number): number | null {
  switch (key) {
    case 'ArrowRight': return (at + 1) % count;
    case 'ArrowLeft': return (at - 1 + count) % count;
    case 'Home': return 0;
    case 'End': return count - 1;
    default: return null;
  }
}

/** Share (0–1) of a scratch canvas that is scratched clear, sampling every `step`-th pixel. */
export function clearedShare(rgba: ArrayLike<number>, width: number, height: number, step = 4): number {
  let all = 0;
  let clear = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      all++;
      if (rgba[(y * width + x) * 4 + 3] < 128) clear++;
    }
  }
  return all ? clear / all : 0;
}

/** The scratch card clears itself past this share. */
export const SCRATCH_DONE = 0.45;

/** Sliding cards read-out: "2 / 6", or "2–3 / 6" when more than one card is in full view. */
export function slidesLabel(first: number, inView: number, count: number): string {
  const a = Math.min(Math.max(first, 0), count - 1) + 1;
  const b = Math.min(count, a + Math.max(1, inView) - 1);
  return b > a ? `${a}–${b} / ${count}` : `${a} / ${count}`;
}
