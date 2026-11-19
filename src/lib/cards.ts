// A journey item as a card: a project (by slug) or a plain title + text note. Shared by both homes
// (Stop, StopBlocks on /road/; the Mode II console on /). An unknown slug fails the build.
import type { JourneyStop, Project } from './schema';

export type JourneyCard = { kind: 'project'; project: Project } | { kind: 'text'; title: string; text: string };

export function projectFor(stop: JourneyStop, slug: string, projects: Map<string, Project>): Project {
  const p = projects.get(slug);
  if (!p) throw new Error(`journey.yaml: stop "${stop.id}" lists unknown project "${slug}"`);
  return p;
}

export function cardFor(stop: JourneyStop, item: JourneyStop['items'][number], projects: Map<string, Project>): JourneyCard {
  return typeof item === 'string' ? { kind: 'project', project: projectFor(stop, item, projects) } : { kind: 'text', ...item };
}
