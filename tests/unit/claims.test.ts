import { test, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkText, checkVenueRule, check57x, inScope } from '../../src/lib/claims';
import { getProjects } from '../../src/lib/data';
import { glob, read } from './helpers';

const ORIGINAL = process.env.PORTFOLIO_PRIVATE_PATTERNS, ORIGINAL_CI = process.env.CI;
const restore = (k: string, v: string | undefined) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; };
afterEach(() => {
  restore('PORTFOLIO_PRIVATE_PATTERNS', ORIGINAL);
  restore('CI', ORIGINAL_CI);
});

test('venue rule', async () => expect(checkVenueRule(await getProjects())).toEqual([]));

test('venue rule rejects a venue on any other project', () =>
  expect(checkVenueRule([{ slug: 'yaragen', venue: 'Somewhere' }])).toHaveLength(1));

test('no banned phrase in any content file', () => {
  for (const f of glob('src/content/**/*.{yaml,md}')) expect(checkText(read(f), f)).toEqual([]);
});

test('57x always tied to the generator', () => {
  for (const f of glob('src/content/**/*')) expect(check57x(read(f)), f).toEqual([]);
  expect(check57x('the pipeline is 57× smaller')).toHaveLength(1);
  expect(check57x('the 139M generator is 57× smaller than the 8B')).toEqual([]);
  expect(check57x('a 157x speedup and 0.57x ratio')).toEqual([]);
});

function fakePatterns() {
  const dir = mkdtempSync(join(tmpdir(), 'claims-'));
  const file = join(dir, 'p.txt');
  writeFileSync(file, '# comment\n/zebra-quokka/i\n/okapi-phone/ # html-only\n@only-here /narwhal/\n');
  process.env.PORTFOLIO_PRIVATE_PATTERNS = file;
}

test('guard loads private patterns and catches a match', () => {
  fakePatterns();
  expect(checkText('a Zebra-Quokka appears', 'x').length).toBeGreaterThan(0);
  expect(checkText('okapi-phone', 'x.html')).toHaveLength(1);
  expect(checkText('okapi-phone', 'x.pdf', { pdf: true })).toEqual([]);
  expect(checkText('narwhal', 'src/content/projects/other.md')).toEqual([]);
  expect(checkText('narwhal', 'src/content/projects/only-here.md')).toHaveLength(1);
});

test('guard messages give context:line and the pattern number, never the matched text (M3)', () => {
  fakePatterns();
  const msgs = checkText('line one\nsee the zebra-quokka here\nfine\nZEBRA-QUOKKA again', 'docs/x.md');
  expect(msgs).toEqual(['docs/x.md:2: banned phrase (pattern #1)', 'docs/x.md:4: banned phrase (pattern #1)']);
  for (const m of msgs) expect(m).not.toMatch(/zebra|quokka|see the|here|again/i);
});

test('missing private file in CI means structural checks only', () => {
  process.env.CI = 'true';
  process.env.PORTFOLIO_PRIVATE_PATTERNS = '/nonexistent/patterns.txt';
  expect(checkText('anything at all', 'x')).toEqual([]);
});

test('missing private file fails closed on a workstation even when the path is set (a typo must fail, I7)', () => {
  delete process.env.CI;
  process.env.PORTFOLIO_PRIVATE_PATTERNS = '/nonexistent/typo-patterns.txt';
  expect(() => checkText('x', 'y')).toThrow(/private pattern file missing/);
});

test('scopes match the exact project file or page only', () => {
  expect(inScope('src/content/projects/yaragen.md', 'yaragen')).toBe(true);
  expect(inScope('/projects/yaragen', 'yaragen')).toBe(true);
  expect(inScope('/projects/yaragen/', 'yaragen')).toBe(true);
  expect(inScope('src/content/projects/yaragen-plus-plus.md', 'yaragen')).toBe(false);
  expect(inScope('/projects/yaragen-plus-plus', 'yaragen')).toBe(false);
  // the crawl passes the bare page path; anything appended after it would drop scoped patterns
  expect(inScope('/projects/yaragen/ (text)', 'yaragen')).toBe(false);
});

test('resume sources pass the guard (PDF rules)', () => {
  for (const f of glob('resume/*.tex')) expect(checkText(read(f), f, { pdf: true })).toEqual([]);
});

test('missing private file fails closed on a workstation', async () => {
  delete process.env.PORTFOLIO_PRIVATE_PATTERNS;
  const { DEFAULT_PATTERN_FILE } = await import('../../src/lib/claims');
  if (process.env.CI) return; // CI has no private file by design
  const { existsSync } = await import('node:fs');
  if (existsSync(DEFAULT_PATTERN_FILE)) return; // owner's machine: file present, nothing to assert
  expect(() => checkText('x', 'y')).toThrow(/private pattern file missing/);
});
