// Mode II (the ASCII landing page): which background clip plays for each part, and the short
// tab labels. Free of runtime imports so the client script can use it.
import type { STOP_IDS } from './stops';

type StopId = (typeof STOP_IDS)[number];

/** The clips in public/mode2 (scripts/mode2-clips.sh cuts them). */
export const CLIP_IDS = ['hero', 'road', 'littlebirdy', 'campground', 'glamping'] as const;
export type ClipId = (typeof CLIP_IDS)[number];

/** The landing clip, shown with the identity card before any tab is chosen. */
export const LANDING_CLIP: ClipId = 'hero';

/** The clip behind each journey stop. */
export const STOP_CLIP: Record<StopId, ClipId> = {
  now: 'glamping',
  phd: 'hero',
  ms: 'littlebirdy',
  cognizant: 'road',
  srm: 'road',
  river: 'campground',
};

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
