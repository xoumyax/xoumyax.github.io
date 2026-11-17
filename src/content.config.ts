import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { ProjectSchema } from './lib/schema';

// Pages read projects through src/lib/data.ts (shared with the tests); this collection
// makes Astro validate the same files at build time.
const projects = defineCollection({
  loader: glob({ pattern: ['*.md', '!_*.md'], base: './src/content/projects' }),
  schema: ProjectSchema,
});

export const collections = { projects };
