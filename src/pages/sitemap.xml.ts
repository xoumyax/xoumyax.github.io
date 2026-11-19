// /sitemap.xml (M13): the site's public pages, with the trailing slash Pages serves them at.
// Not listed: /personal (a placeholder for now), 404.
import type { APIRoute } from 'astro';
import { getProjects } from '../lib/data';

export const SITEMAP_PAGES = ['/', '/road/', '/resume/', '/projects/', '/teaching/', '/study/'];

export const GET: APIRoute = async ({ site }) => {
  const paths = [...SITEMAP_PAGES, ...(await getProjects()).map((p) => `/projects/${p.slug}/`)];
  const urls = paths.map((p) => `  <url><loc>${new URL(p, site).href}</loc></url>`).join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
