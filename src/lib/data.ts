import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import matter from 'gray-matter';
import type { ZodType } from 'zod';
import {
  ConfigSchema, JourneySchema, ProfileSchema, ProjectSchema, StudySchema, PROJECT_STOPS,
  type Config, type Journey, type Profile, type Project, type Study,
} from './schema';

const CONTENT = join(process.cwd(), 'src/content');

function load<T>(file: string, schema: ZodType<T>): T {
  const path = join(CONTENT, file);
  const parsed = schema.safeParse(parse(readFileSync(path, 'utf8')));
  if (!parsed.success) throw new Error(`${path}: ${parsed.error.message}`);
  return parsed.data;
}

export const getProfile = (): Profile => load('profile.yaml', ProfileSchema);
export const getJourney = (): Journey => load('journey.yaml', JourneySchema);
export const getStudy = (): Study => load('study.yaml', StudySchema);
export const getConfig = (): Config => load('config.yaml', ConfigSchema);

export async function getProjects(): Promise<Project[]> {
  const dir = join(CONTENT, 'projects');
  const files = readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('_'));
  const projects = files.map((f) => {
    const { data, content } = matter(readFileSync(join(dir, f), 'utf8'));
    const parsed = ProjectSchema.safeParse(data);
    if (!parsed.success) throw new Error(`${join(dir, f)}: ${parsed.error.message}`);
    if (`${parsed.data.slug}.md` !== f) throw new Error(`${join(dir, f)}: slug "${parsed.data.slug}" must match the file name`);
    return { ...parsed.data, body: content.trim() };
  });
  const stopIndex = (s: Project['stop']) => PROJECT_STOPS.indexOf(s);
  return projects.sort((a, b) => stopIndex(a.stop) - stopIndex(b.stop) || a.order - b.order);
}
