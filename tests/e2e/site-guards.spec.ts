import { test, expect } from '@playwright/test';
import { checkText, check57x } from '../../src/lib/claims';

const PLACEHOLDER = '[[TODO-CONTENT]]';
const PLACEHOLDER_OK = new Set(['/personal/']);

async function crawl(request: import('@playwright/test').APIRequestContext) {
  const seen = new Map<string, string>(); // path -> html
  const queue = ['/'];
  const broken: string[] = [];
  /** Internal links to a page (not a file) without the trailing slash Pages serves pages at (M1). */
  const slashless: string[] = [];
  while (queue.length) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    const res = await request.get(path, { maxRedirects: 0 });
    if (res.status() !== 200) { broken.push(`${path} → ${res.status()}`); seen.set(path, ''); continue; }
    const type = res.headers()['content-type'] ?? '';
    if (!type.includes('text/html')) { seen.set(path, ''); continue; }
    const html = await res.text();
    seen.set(path, html);
    for (const m of html.matchAll(/href="([^"#?]*)(?:[?#][^"]*)?"/g)) {
      const href = m[1];
      if (!href || !href.startsWith('/') || href.startsWith('//')) continue;
      const clean = decodeURI(href).replace(/\/index\.html$/, '/');
      if (!path.startsWith('/CSCE-313/') && !clean.endsWith('/') && !/\.[a-z0-9]+$/i.test(clean)) slashless.push(`${path} → ${href}`);
      if (!seen.has(clean) && !queue.includes(clean)) queue.push(clean);
    }
  }
  return { seen, broken, slashless };
}

/** Named entities a page may carry; anything else left undecoded fails the guard (M2). */
const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', middot: '·', bull: '•', times: '×',
  rarr: '→', larr: '←', uarr: '↑', darr: '↓', copy: '©', reg: '®', trade: '™', deg: '°', shy: '­', zwj: '‍', zwnj: '‌',
};
/** Decodes numeric and named character references (all of them; an unknown name is left as is and reported). */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return NAMED[e] ?? NAMED[e.toLowerCase()] ?? m;
  });
}

const textOf = (html: string) =>
  decodeEntities(html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');

/** The attribute values a reader or a crawler sees: meta content, aria-label, title, alt (M2). */
const attrsOf = (html: string) =>
  [...html.matchAll(/\s(?:content|aria-label|title|alt)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map((m) => decodeEntities(m[1] ?? m[2] ?? '')).join('\n');

test('the crawl guard decodes every entity and reads attributes', () => {
  expect(decodeEntities('a&amp;b &#39;c&#x27; &rsquo;d&mdash; &#8212; &nbsp;')).toBe("a&b 'c' ’d— —  ");
  expect(attrsOf('<meta name="description" content="x &amp; y"><a aria-label=\'z\' title="t"><img alt="w">')).toBe('x & y\nz\nt\nw');
});

test('every internal link resolves and every page passes the content guards', async ({ request }) => {
  const { seen, broken, slashless } = await crawl(request);
  expect(broken, 'broken internal links').toEqual([]);
  expect(slashless, 'internal page links without a trailing slash (M1)').toEqual([]);
  expect(seen.size).toBeGreaterThan(20);

  const problems: string[] = [];
  for (const [path, html] of seen) {
    if (!html || path.startsWith('/CSCE-313/')) continue; // course material is served verbatim
    const text = textOf(html), attrs = attrsOf(html);
    for (const [where, t] of [['text', text], ['attributes', attrs]] as const) {
      // the context is the bare path: scoped (@slug) patterns match on it (inScope)
      problems.push(...checkText(t, path).map((m) => `${m} [${where}]`), ...check57x(t).map((m) => `${path} (${where}): ${m}`));
    }
    for (const t of [text, attrs]) {
      for (const m of t.matchAll(/USENIX/g)) {
        const i = m.index ?? 0;
        if (!t.slice(Math.max(0, i - 200), i + 200).includes('IOCScooper++')) problems.push(`${path}: USENIX outside the IOCScooper++ entry`);
      }
      const left = t.match(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/i);
      if (left) problems.push(`${path}: undecoded entity ${left[0]}`);
    }
    if (text.includes(PLACEHOLDER) && !PLACEHOLDER_OK.has(path)) problems.push(`${path}: live placeholder`);
  }
  expect(problems).toEqual([]);
});

test('every page has a social preview: og:image (the hero scene) and a large twitter card (M13)', async ({ request }) => {
  for (const path of ['/', '/resume/', '/projects/yaragen/']) {
    const html = await (await request.get(path)).text();
    const img = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
    expect(img, path).toBe('https://xoumyax.github.io/og.png');
    expect(html, path).toContain('<meta name="twitter:card" content="summary_large_image"');
    const local = new URL(img!).pathname;
    expect((await request.get(local)).status(), local).toBe(200);
  }
});

test('the sitemap lists the public pages, with slashes, and no /personal (M13)', async ({ request }) => {
  const res = await request.get('/sitemap.xml');
  expect(res.status()).toBe(200);
  const locs = [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  for (const p of ['/', '/resume/', '/projects/', '/teaching/', '/study/', '/projects/yaragen/']) expect(locs).toContain(p);
  for (const p of locs) {
    expect(p.endsWith('/'), p).toBe(true);
    expect(p).not.toMatch(/personal/);
    expect((await request.get(p)).status(), p).toBe(200);
  }
});
