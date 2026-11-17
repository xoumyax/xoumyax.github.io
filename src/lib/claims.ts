// Claims guard. The literal banned patterns are private and live OUTSIDE the repo
// (see loadBannedPatterns). This file only holds structural rules.
import { existsSync, readFileSync } from 'node:fs';
import type { Project } from './schema';

export const DEFAULT_PATTERN_FILE = '/Users/xoumyax/portfolio/private/banned-patterns.txt';
export const VENUE_ALLOWED = ['autopyara', 'iocscooper-plus-plus'] as const;

export interface BannedPattern { re: RegExp; htmlOnly: boolean; scope?: string }

let cache: { file: string; patterns: BannedPattern[] } | undefined;
let warned = false;

/** One `/source/flags` per line; optional `@slug ` prefix scopes it; trailing `# html-only` skips PDFs. */
export function loadBannedPatterns(): BannedPattern[] {
  const file = process.env.PORTFOLIO_PRIVATE_PATTERNS ?? DEFAULT_PATTERN_FILE;
  if (cache?.file === file) return cache.patterns;
  if (!existsSync(file)) {
    // Fail closed on a workstation, even when PORTFOLIO_PRIVATE_PATTERNS is set (a typo in the
    // path must not skip every pattern). CI (public runners) has no private file by design.
    if (!process.env.CI) {
      throw new Error(`[claims] private pattern file missing: ${file}. Fix PORTFOLIO_PRIVATE_PATTERNS, or set CI=1 for structural checks only.`);
    }
    if (!warned) console.warn(`[claims] private pattern file not found (${file}); only structural checks run.`);
    warned = true;
    return []; // not cached: a missing file is re-checked (and fails closed off CI) every time
  }
  const patterns: BannedPattern[] = [];
  for (const [n, raw] of readFileSync(file, 'utf8').split('\n').entries()) {
    let line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const htmlOnly = /\s#\s*html-only\s*$/.test(line);
    line = line.replace(/\s#\s*html-only\s*$/, '');
    let scope: string | undefined;
    const scoped = line.match(/^@([a-z0-9-]+)\s+(.*)$/);
    if (scoped) [, scope, line] = scoped;
    const m = line.match(/^\/(.*)\/([a-z]*)$/);
    if (!m) throw new Error(`[claims] bad pattern on line ${n + 1} of ${file}`); // never echo the pattern
    patterns.push({ re: new RegExp(m[1], m[2]), htmlOnly, scope });
  }
  cache = { file, patterns };
  return patterns;
}

/**
 * Violation messages for `text`, one per line that matches a pattern: `context:line (pattern #N)`.
 * A message never carries the matched text or anything around it (the test output must not
 * repeat a banned string). `context` is a file path or URL; scoped patterns apply when it
 * contains the slug.
 */
export function checkText(text: string, context: string, o: { pdf?: boolean } = {}): string[] {
  const out: string[] = [];
  const patterns = loadBannedPatterns();
  patterns.forEach((p, k) => {
    if (o.pdf && p.htmlOnly) return;
    if (p.scope && !inScope(context, p.scope)) return;
    const re = new RegExp(p.re.source, p.re.flags.includes('g') ? p.re.flags : p.re.flags + 'g');
    const lines = new Set<number>();
    for (const m of text.matchAll(re)) lines.add(lineAt(text, m.index ?? 0));
    for (const line of lines) out.push(`${context}:${line}: banned phrase (pattern #${k + 1})`);
  });
  return out;
}

/** 1-based line number of a character index. */
function lineAt(text: string, i: number): number {
  let n = 1;
  for (let j = text.indexOf('\n'); j !== -1 && j < i; j = text.indexOf('\n', j + 1)) n++;
  return n;
}

export function checkVenueRule(projects: Pick<Project, 'slug' | 'venue'>[]): string[] {
  return projects
    .filter((p) => p.venue && !(VENUE_ALLOWED as readonly string[]).includes(p.slug))
    .map((p) => `${p.slug}: only ${VENUE_ALLOWED.join(' and ')} may set a venue`);
}

/** Every "57×" must sit within 80 characters of "generator" or "139M". */
export function check57x(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(?<![\d.])57\s*[×x]/g)) {
    const i = m.index ?? 0;
    const near = text.slice(Math.max(0, i - 80), i + m[0].length + 80);
    if (!/generator|139M/.test(near)) out.push(`line ${lineAt(text, i)}: 57× without "generator"/"139M" nearby`);
  }
  return out;
}

/** A scope applies to the project's own file (…/<slug>.md) or page (…/projects/<slug>[/]). */
export function inScope(context: string, slug: string): boolean {
  return new RegExp(`(^|/)${slug}(\\.md$|/?$|[?#])`).test(context);
}
