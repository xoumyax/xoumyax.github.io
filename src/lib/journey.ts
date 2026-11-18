import type { Journey, StopId } from './schema';

/** The journey stop that lists a project (as an item, in a group, or under "more"). */
export function stopForProject(journey: Journey, slug: string): StopId | undefined {
  for (const stop of journey.stops) {
    const slugs = [...stop.items, ...(stop.groups ?? []).flatMap((g) => g.items), ...(stop.more?.items ?? [])];
    if (slugs.includes(slug)) return stop.id;
  }
  return undefined;
}
