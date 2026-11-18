import { test, expect } from 'vitest';
import { getJourney, getProjects } from '../../src/lib/data';
import { stopForProject } from '../../src/lib/journey';

const listed = (j: ReturnType<typeof getJourney>) => {
  const out: [string, string][] = [];
  for (const s of j.stops) {
    const slugs = [
      ...s.items, ...(s.groups ?? []).flatMap((g) => g.items), ...(s.more?.items ?? []),
    ].filter((x): x is string => typeof x === 'string');
    for (const slug of slugs) out.push([slug, s.id]);
  }
  return out;
};

test('every project slug listed in journey.yaml maps to the stop that lists it', () => {
  const j = getJourney();
  const pairs = listed(j);
  expect(pairs.length).toBeGreaterThan(10);
  for (const [slug, id] of pairs) expect(stopForProject(j, slug), slug).toBe(id);
});

test('unlisted slugs give undefined', () => expect(stopForProject(getJourney(), 'nope')).toBeUndefined());

test('the five formerly "now" projects land on the Ph.D. stop', () => {
  for (const s of ['proactive-research-agent', 'depixelation', 'sturdy-fishstick', 'yaragen-plus-plus', 'attendance-wizard'])
    expect(stopForProject(getJourney(), s), s).toBe('phd');
});

test('every project page link target lists the project', async () => {
  const j = getJourney();
  for (const p of await getProjects()) {
    const id = stopForProject(j, p.slug) ?? p.stop;
    const stop = j.stops.find((s) => s.id === id)!;
    const shown = [...stop.items, ...(stop.groups ?? []).flatMap((g) => g.items), ...(stop.more?.items ?? [])];
    // a project the journey never lists falls back to its own stop; that is the only allowed gap
    if (stopForProject(j, p.slug)) expect(shown, p.slug).toContain(p.slug);
  }
});
