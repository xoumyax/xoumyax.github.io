import { test, expect } from 'vitest';
import { getConfig, getJourney, getProfile, getProjects, getStudy } from '../../src/lib/data';

test('singletons validate', () => {
  getProfile(); getJourney(); getStudy(); getConfig();
});

test('journey stop ids in order', () =>
  expect(getJourney().stops.map((s) => s.id)).toEqual(['srm', 'cognizant', 'ms', 'phd', 'now', 'river']));

test('journey project refs exist', async () => {
  const slugs = new Set((await getProjects()).map((p) => p.slug));
  for (const s of getJourney().stops) for (const it of s.items) if (typeof it === 'string') expect(slugs.has(it), it).toBe(true);
});

test('study has the two owner links', () =>
  expect(getStudy().links.map((l) => l.href)).toEqual([
    'https://claude.ai/artifact/1gKVHr8ij1e5L5hF1y6zZT',
    'https://www.tensortonic.com/study-plans',
  ]));

test('YARAikiba config carries the URL and four guest steps', () => {
  const c = getConfig();
  expect(c.yaraikiba.url).toBe('https://wifi-deflate-boneless.ngrok-free.dev');
  expect(c.yaraikiba.steps).toHaveLength(4);
  expect(c.resumePdf).toBe('/Soumyajyoti_Dutta_Resume.pdf');
  expect(c.cvPdf).toBe('/Soumyajyoti_Dutta_CV.pdf');
});
