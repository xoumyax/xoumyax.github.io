import { test, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { JourneySchema, STOP_IDS } from '../../src/lib/schema';
import { SCENE_IDS } from '../../src/lib/scenes';
import { getConfig, getJourney, getProfile, getProjects, getStudy } from '../../src/lib/data';

test('singletons validate', () => {
  getProfile(); getJourney(); getStudy(); getConfig();
});

test('journey stop ids in order', () =>
  expect(getJourney().stops.map((s) => s.id)).toEqual(['now', 'phd', 'ms', 'cognizant', 'srm', 'river']));

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

test('journey has no landmark field', () => {
  const raw = parse(readFileSync('src/content/journey.yaml', 'utf8')) as { stops: Record<string, unknown>[] };
  for (const s of raw.stops) expect(Object.keys(s), String(s.id)).not.toContain('landmark');
});

test('STOP_IDS run newest first and the scenes follow', () => {
  expect([...STOP_IDS]).toEqual(['now', 'phd', 'ms', 'cognizant', 'srm', 'river']);
  expect([...SCENE_IDS]).toEqual(['hero', ...STOP_IDS]);
});

test('the Ph.D. stop is split into status blocks', () => {
  const phd = getJourney().stops.find((s) => s.id === 'phd')!;
  expect(phd.items).toEqual([]);
  expect(phd.groups?.map((g) => [g.title, g.items])).toEqual([
    ['Published', ['autopyara']],
    ['Finished · awaiting submission', ['yaragen', 'iocscooper-plus-plus']],
    ['In progress', ['proactive-research-agent', 'yaraikiba', 'yaragen-plus-plus', 'depixelation']],
  ]);
  expect(phd.more?.title).toBe('Small projects');
  expect(phd.more?.items).toEqual(['hellopentagon', 'hawkeye', 'breast-cancer-classification', 'sturdy-fishstick', 'attendance-wizard', 'vlm-evaluation', 'yara-sentencepiece']);
});

test('the Now stop keeps only its three text items', () => {
  const now = getJourney().stops.find((s) => s.id === 'now')!;
  expect(now.items).toHaveLength(3);
  for (const it of now.items) expect(typeof it).toBe('object');
  expect(now.groups).toBeUndefined();
});

test('every slug in groups and more exists', () => {
  for (const s of getJourney().stops) {
    const slugs = [...(s.groups ?? []).flatMap((g) => g.items), ...(s.more?.items ?? [])];
    for (const it of slugs) if (typeof it === 'string') expect(existsSync(`src/content/projects/${it}.md`), it).toBe(true);
  }
});

test('a stop with both items and groups fails to parse', () => {
  const stops = getJourney().stops.map((s) => ({ ...s }));
  const phd = stops.find((s) => s.id === 'phd')!;
  phd.items = ['autopyara'];
  const r = JourneySchema.safeParse({ stops });
  expect(r.success).toBe(false);
  expect(JSON.stringify(r.error?.issues)).toContain('phd');
});

test('a stop with more but no groups fails to parse', () => {
  const stops = getJourney().stops.map((s) => ({ ...s }));
  const ms = stops.find((s) => s.id === 'ms')!;
  ms.more = { title: 'Small projects', items: ['hawkeye'] };
  const r = JourneySchema.safeParse({ stops });
  expect(r.success).toBe(false);
  expect(JSON.stringify(r.error?.issues)).toContain('ms');
});
