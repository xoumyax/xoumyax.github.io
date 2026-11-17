import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const encodePath = (rel: string) => rel.split('/').map(encodeURIComponent).join('/');
function readFixture(path: string): [string, string][] {
  return readFileSync(path, 'utf8').trim().split('\n').map((l) => {
    const i = l.indexOf('  ');
    return [l.slice(0, i), l.slice(i + 2)];
  });
}

test('every CSCE-313 file is served byte-identical', async ({ request }) => {
  const rows = readFixture('tests/fixtures/csce313.sha256');
  expect(rows.length).toBe(18);
  for (const [sha, rel] of rows) {
    const res = await request.get('/CSCE-313/' + encodePath(rel));
    expect(res.status(), rel).toBe(200);
    expect(sha256(await res.body()), rel).toBe(sha);
  }
});

test('removed duplicate is gone', async ({ request }) => {
  const res = await request.get('/CSCE-313/Lab2/' + encodeURIComponent('Lab 2 — The Process Abstraction and Creating Processes · CSCE 313.html'));
  expect(res.status()).toBe(404);
});

test('resume PDFs resolve', async ({ request }) => {
  for (const p of ['/Soumyajyoti_Dutta_Resume.pdf', '/Soumyajyoti_Dutta_CV.pdf']) {
    const r = await request.get(p);
    expect(r.status(), p).toBe(200);
    expect(r.headers()['content-type'], p).toContain('application/pdf');
  }
});
