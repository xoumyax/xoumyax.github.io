import { z } from 'zod';

export const STOP_IDS = ['srm', 'cognizant', 'ms', 'phd', 'now', 'river'] as const;
export const PROJECT_STOPS = ['srm', 'cognizant', 'ms', 'phd', 'now'] as const;
export const AREAS = ['post-training-eval', 'agents', 'security', 'systems', 'other'] as const;
export const LANDMARK_IDS = ['ranger', 'trailer', 'dome', 'school', 'trailhead'] as const;
export const TONES = ['amber', 'rust', 'sage', 'storm', 'sand'] as const;

export type StopId = (typeof STOP_IDS)[number];
export type Area = (typeof AREAS)[number];
export type LandmarkId = (typeof LANDMARK_IDS)[number];

const url = z.string().url();
const link = z.object({ label: z.string().min(1), href: url });

export const ProjectSchema = z.object({
  title: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  oneLiner: z.string().min(1).max(140),
  years: z.string().min(1),
  statusLabel: z.string().min(1),
  venue: z.string().min(1).optional(),
  areas: z.array(z.enum(AREAS)).min(1),
  metrics: z.array(z.object({ value: z.string().min(1), label: z.string().min(1) })).max(4).default([]),
  links: z.array(link).default([]),
  sponsors: z.array(z.string().min(1)).default([]),
  stop: z.enum(PROJECT_STOPS),
  order: z.number(),
  featured: z.boolean().default(false),
  cover: z.object({ glyphs: z.string().min(1), tone: z.enum(TONES) }),
});
export type Project = z.infer<typeof ProjectSchema> & { body: string };

export const ProfileSchema = z.object({
  name: z.string(),
  role: z.string(),
  openToWork: z.string(),
  email: z.string().email(),
  github: url,
  linkedin: url,
  education: z.array(z.object({ degree: z.string(), school: z.string(), years: z.string(), note: z.string().optional() })).min(1),
  experience: z.array(z.object({ title: z.string(), org: z.string(), years: z.string(), bullets: z.array(z.string()).min(1) })).min(1),
  skills: z.array(z.object({ group: z.string(), items: z.array(z.string()).min(1) })).min(1),
  publications: z.array(z.object({ text: z.string(), href: url.optional() })).min(1),
  teaching: z.array(z.object({ course: z.string(), term: z.string(), what: z.string() })).min(1),
  talks: z.array(z.object({ title: z.string(), venue: z.string(), date: z.string() })).min(1),
});
export type Profile = z.infer<typeof ProfileSchema>;

const journeyItem = z.union([z.string().regex(/^[a-z0-9-]+$/), z.object({ title: z.string(), text: z.string() })]);
export const JourneySchema = z.object({
  stops: z
    .array(z.object({
      id: z.enum(STOP_IDS),
      years: z.string(),
      title: z.string(),
      place: z.string(),
      summary: z.string(),
      landmark: z.enum(LANDMARK_IDS).optional(),
      items: z.array(journeyItem).default([]),
    }))
    .refine((s) => s.map((x) => x.id).join() === STOP_IDS.join(), { message: `stop ids must be exactly ${STOP_IDS.join(', ')} in order` }),
});
export type Journey = z.infer<typeof JourneySchema>;
export type JourneyStop = Journey['stops'][number];

export const StudySchema = z.object({ links: z.array(z.object({ title: z.string(), href: url, blurb: z.string() })).min(1) });
export type Study = z.infer<typeof StudySchema>;

export const ConfigSchema = z.object({
  yaraikiba: z.object({ url, steps: z.array(z.string()).length(4) }),
  resumePdf: z.string().startsWith('/'),
  cvPdf: z.string().startsWith('/'),
});
export type Config = z.infer<typeof ConfigSchema>;
