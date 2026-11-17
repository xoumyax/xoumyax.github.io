// The poster pair's version: a content hash of the two poster images, in a fixed order. The
// capture script writes it into landmarks.json; the landing page asks for the images and the
// table with ?v=<it>, so a cached table never pairs with another capture's poster (M10).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const POSTER_FILES = ['poster.webp', 'poster-mobile.webp'];

/** sha256 over the poster files that exist under `dir`, as 12 hex characters ('' when none do). */
export function posterVersion(dir) {
  const h = createHash('sha256');
  let any = false;
  for (const f of POSTER_FILES) {
    const p = join(dir, f);
    if (!existsSync(p)) continue;
    any = true;
    h.update(f).update('\0').update(readFileSync(p));
  }
  return any ? h.digest('hex').slice(0, 12) : '';
}
