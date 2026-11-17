import type { Area, Project } from '../../lib/schema';
import { PROJECT_STOPS } from '../../lib/schema';

export const AREA_LABELS: Record<Area, string> = {
  'post-training-eval': 'Post-training & eval',
  agents: 'Agents',
  security: 'Security',
  systems: 'Systems',
  other: 'Other',
};

/** Paper text on the dark tones, ink on the light ones. */
export const onTone = (tone: Project['cover']['tone']) =>
  tone === 'rust' || tone === 'storm' ? 'var(--paper)' : 'var(--ink)';

/** FNV-1a; stable across builds so each card keeps its tilt and texture. */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 */
export function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A 3D tilt (rotate3d axis + angle), as CSS custom properties, derived from the slug. */
export function tiltFor(slug: string): string {
  const r = rng(hash(`tilt:${slug}`));
  const tx = (r() * 1.6 - 0.8).toFixed(2);
  const ty = (r() * 1.6 - 0.8).toFixed(2);
  const sign = r() < 0.5 ? -1 : 1;
  const ta = (sign * (4 + r() * 3.5)).toFixed(1);
  return `--tx:${tx};--ty:${ty};--ta:${ta}deg`;
}

/** Wall order: newest journey stop first, then the content's own order within a stop. */
export function wallOrder(projects: Project[]): Project[] {
  const i = (p: Project) => PROJECT_STOPS.indexOf(p.stop);
  return [...projects].sort((a, b) => i(b) - i(a) || a.order - b.order);
}

/** An ASCII texture built from the cover glyphs: denser toward one corner, deterministic per slug. */
export function glyphField(project: Project, cols: number, rows: number): string {
  const r = rng(hash(`field:${project.slug}`));
  const own = [...new Set(project.cover.glyphs.replace(/\s+/g, ''))];
  const fill = ['.', '.', ':', '·'];
  const flip = r() < 0.5;
  const lines: string[] = [];
  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let x = 0; x < cols; x++) {
      const fx = flip ? 1 - x / cols : x / cols;
      const d = (fx * 0.55 + (y / rows) * 0.45) ** 1.6;
      const v = r();
      if (v < d * 0.5) line += own[Math.floor(r() * own.length)];
      else if (v < d * 0.9) line += fill[Math.floor(r() * fill.length)];
      else line += ' ';
    }
    lines.push(line.replace(/\s+$/, ''));
  }
  return lines.join('\n');
}
