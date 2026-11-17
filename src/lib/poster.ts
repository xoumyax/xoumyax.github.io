// Build-time facts about the world poster (public/world/), shared by the landing page and the
// social preview. The posters and landmarks.json are one versioned pair (M10): capture-poster.mjs
// writes the posters' content hash into landmarks.json as `version`, and every URL to them
// carries ?v=<version>.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = () => join(process.cwd(), 'public/world');
export const hasPosterFile = (f: string) => existsSync(join(dir(), f));

/** The poster pair's version from landmarks.json ('' when there is no table yet). */
export function posterVersion(): string {
  const f = join(dir(), 'landmarks.json');
  if (!existsSync(f)) return '';
  const v = (JSON.parse(readFileSync(f, 'utf8')) as { version?: unknown }).version;
  return typeof v === 'string' ? v : '';
}

/** `/world/<file>?v=<version>` (no query when unversioned). */
export function posterUrl(file: string): string {
  const v = posterVersion();
  return `/world/${file}${v ? `?v=${v}` : ''}`;
}
