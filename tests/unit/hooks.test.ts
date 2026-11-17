import { test, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// I7: setup.sh installs a pre-push hook that runs the unit tests (the private guard and the
// repo-wide scan) into the common git dir, idempotently, never over a hook it did not write.

const SCRIPT = resolve('scripts/install-hooks.sh');
/**
 * This file runs inside the pre-push hook, where git exports GIT_DIR and friends: every child
 * process gets an env without any GIT_* variable, so the scratch repos below are never this repo.
 */
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function tempRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'hooks-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, '-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init');
  return dir;
}
const install = (dir: string) => execFileSync('bash', [SCRIPT, dir], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

test('installs an executable pre-push hook running test:unit, idempotently', () => {
  const dir = tempRepo();
  install(dir);
  const hook = join(dir, '.git/hooks/pre-push');
  const first = readFileSync(hook, 'utf8');
  expect(first).toContain('npm run --silent test:unit');
  expect(first).toContain('# portfolio-guard-hook');
  expect(first).toMatch(/unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE/);
  expect(statSync(hook).mode & 0o111).not.toBe(0);
  install(dir);
  expect(readFileSync(hook, 'utf8')).toBe(first);
});

test('from a worktree it installs into the common git dir', () => {
  const dir = tempRepo();
  const wt = join(dir, 'wt');
  git(dir, 'worktree', 'add', '-q', wt);
  install(wt);
  expect(existsSync(join(dir, '.git/hooks/pre-push'))).toBe(true);
});

test('a pre-push hook it did not write is left alone', () => {
  const dir = tempRepo();
  const hook = join(dir, '.git/hooks/pre-push');
  writeFileSync(hook, '#!/bin/sh\necho mine\n', { mode: 0o755 });
  const r = spawnSync('bash', [SCRIPT, dir], { env, encoding: 'utf8' });
  expect(r.status).toBe(0);
  expect(r.stderr).toMatch(/left as is/);
  expect(readFileSync(hook, 'utf8')).toBe('#!/bin/sh\necho mine\n');
});

test('setup.sh takes --no-hooks (in any order) and rejects unknown options before installing anything', () => {
  const src = readFileSync('setup.sh', 'utf8');
  expect(src).toMatch(/--no-hooks\) HOOKS=0/);
  expect(src).toMatch(/if \[\[ \$HOOKS == 1 \]\]; then scripts\/install-hooks\.sh/);
  const r = spawnSync('bash', ['setup.sh', '--no-hooks', '--bogus'], { env, encoding: 'utf8' });
  expect(r.status).toBe(2);
  expect(r.stderr).toMatch(/unknown option --bogus/);
});
