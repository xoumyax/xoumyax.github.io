import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkText } from '../../src/lib/claims';
import { trackedTextFiles } from './helpers';

// The "never in the repo" rule, enforced on the repo: every tracked text file passes the private
// claims guard, not only src/content and the rendered pages (README, docs, tests, scripts, code
// comments included). A failure names file:line and the pattern number, never the text.
//
// Skipped: binaries (by extension or a NUL byte), the verbatim course material under
// public/CSCE-313/, and lockfiles. resume/*.tex are checked with the PDF rules (html-only
// patterns skipped), as the PDFs they build.

test('every tracked text file passes the private claims guard', () => {
  const files = trackedTextFiles();
  expect(files.length).toBeGreaterThan(50);
  const problems: string[] = [];
  for (const f of files) {
    let buf: Buffer;
    try { buf = readFileSync(f); } catch { continue; } // deleted in the working tree
    if (buf.includes(0)) continue; // binary
    problems.push(...checkText(buf.toString('utf8'), f, { pdf: /^resume\/.*\.tex$/.test(f) }));
  }
  expect(problems).toEqual([]);
});

test('the scan covers tests, scripts and the README, skips what it should, and the private design docs stay untracked', () => {
  const files = trackedTextFiles();
  for (const f of ['README.md', 'setup.sh', 'src/lib/claims.ts', 'tests/unit/claims.test.ts', 'scripts/pixel-scenes.py']) expect(files).toContain(f);
  // docs/superpowers/ (spec, plan, build notes) is private by owner decision (2026-11-16): never tracked.
  expect(files.some((f) => f.startsWith('docs/superpowers/'))).toBe(false);
  expect(files.some((f) => f.startsWith('public/CSCE-313/'))).toBe(false);
  expect(files).not.toContain('package-lock.json');
  expect(files.some((f) => f.endsWith('.webp') || f.endsWith('.pdf'))).toBe(false);
});
