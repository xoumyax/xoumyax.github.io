// Shared probes for the backdrop tests (not a spec file: imported by scenes.spec.ts and world.spec.ts).
// The canvas is screen-sized: a view of VIEW[set] world px, each a block of b = width / view width
// device px. Probes read blocks at their centres and compare them with the flat PNGs at view size.
import type { Page } from '@playwright/test';
import { SCENE_IDS } from '../../src/lib/scenes';
import { PAN_MAX, PAN_VH } from '../../src/lib/world-math';

export const IDS = [...SCENE_IDS];
export const VIEW = { land: [240, 135], port: [120, 214] } as const;

/** Turns the ambient clock off for the page (scroll still drives everything). */
export const still = (page: Page) => page.addInitScript(() => localStorage.setItem('world-still', '1'));

/** The canvas's set, view size and block size (device px per world px). */
export const geometry = (page: Page) => page.locator('#scene').evaluate((c: HTMLCanvasElement, VIEW) => {
  const set = c.dataset.set as 'land' | 'port';
  const [vw, vh] = VIEW[set];
  return { set, vw, vh, b: c.width / vw, w: c.width, h: c.height };
}, VIEW);

/** Waits until every world the page wants (data-worlds) is loaded (data-loaded). */
export const worldsLoaded = (page: Page) => page.waitForFunction(() => {
  const want = (document.querySelector('.scenes') as HTMLElement).dataset.worlds?.split(/\s+/).filter(Boolean) ?? [];
  const have = new Set((document.getElementById('scene') as HTMLElement).dataset.loaded?.split(' ') ?? []);
  return want.every((id) => have.has(id));
});

// Reads 16 blocks spread across the view (at their centres) and compares them with the same
// pixels of each flat scene file. Returns the scene id that matches all 16, or 'mixed'.
export async function sceneOf(page: Page): Promise<string> {
  await page.waitForSelector('#scene:not([hidden])');
  return page.evaluate(async ({ ids, VIEW }) => {
    const cv = document.getElementById('scene') as HTMLCanvasElement;
    const set = cv.dataset.set as 'land' | 'port';
    const [w, h] = VIEW[set];
    const b = cv.width / w;
    const pts: [number, number][] = [];
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      pts.push([Math.floor(((i + 0.37 + 0.21 * j) % 4) / 4 * w), Math.floor(((j + 0.61 + 0.17 * i) % 4) / 4 * h)]);
    }
    const g = cv.getContext('2d')!;
    const have = pts.map(([x, y]) => [...g.getImageData(Math.floor((x + 0.5) * b), Math.floor((y + 0.5) * b), 1, 1).data].join(','));
    const suffix = set === 'port' ? '-m' : '';
    const hits: string[] = [];
    for (const id of ids) {
      const img = new Image();
      img.src = `/scenes/${id}${suffix}.png`;
      await img.decode();
      const off = document.createElement('canvas');
      off.width = w; off.height = h;
      const o = off.getContext('2d')!;
      o.drawImage(img, 0, 0);
      const want = pts.map(([x, y]) => [...o.getImageData(x, y, 1, 1).data].join(','));
      if (want.every((v, i) => v === have[i])) hits.push(id);
    }
    return hits[0] ?? 'mixed';
  }, { ids: IDS, VIEW });
}

/**
 * At rest every block is whole: all device px of a block are one colour (blocks sit on the device
 * grid, none straddles another). Checks every block of `rows` view rows; returns the bad ones.
 */
export const brokenBlocks = (page: Page, rows = 12) => page.evaluate(({ VIEW, rows }) => {
  const cv = document.getElementById('scene') as HTMLCanvasElement;
  const [w, h] = VIEW[cv.dataset.set as 'land' | 'port'];
  const b = cv.width / w;
  const d = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data;
  const bad: string[] = [];
  for (let k = 0; k < rows; k++) {
    const j = Math.floor((k + 0.5) * h / rows);
    for (let i = 0; i < w; i++) {
      const x0 = Math.round(i * b), x1 = Math.round((i + 1) * b), y0 = Math.round(j * b), y1 = Math.round((j + 1) * b);
      const c0 = (y0 * cv.width + x0) * 4;
      let ok = true;
      for (let y = y0; y < y1 && ok; y++) for (let x = x0; x < x1; x++) {
        const c = (y * cv.width + x) * 4;
        if (d[c] !== d[c0] || d[c + 1] !== d[c0 + 1] || d[c + 2] !== d[c0 + 2] || d[c + 3] !== d[c0 + 3]) { ok = false; break; }
      }
      if (!ok) bad.push(`${i},${j}`);
    }
  }
  return bad;
}, { VIEW, rows });

/** Two frames, then until the shown scroll position has caught up with the real one (data-follow gone). */
export const settle = async (page: Page) => {
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
  await page.waitForSelector('#scene:not([data-follow])', { state: 'attached' });
};

// Puts the section's anchor (its centre; a stop taller than the screen: top + half a viewport) (or the point `frac` of the way to the next section's centre) at mid-viewport.
export async function scrollToCentre(page: Page, id: string, nextId?: string, frac = 0.5) {
  await page.evaluate(({ id, nextId, frac }) => {
    const inset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    const c = (i: string) => { const r = document.getElementById(`stop-${i}`)!.getBoundingClientRect(); return Math.min(r.top + r.height / 2, r.top + innerHeight / 2 - inset); };
    const target = nextId ? c(id) + (c(nextId) - c(id)) * frac : c(id);
    scrollBy({ top: target - innerHeight / 2, behavior: 'instant' });
  }, { id, nextId, frac });
  await settle(page);
}

/**
 * Scrolls so the viewport middle sits `share` of the way through the pan from section `from`
 * to section `to` (ids of [data-section] elements, 'hero' for the hero): d = I + share · P, with
 * P = min(PAN_VH · vh, PAN_MAX · gap) (panLength) and I = gap − P.
 */
export async function scrollToPan(page: Page, from: string, to: string, share = 0.5) {
  await page.evaluate(({ from, to, share, PAN_VH, PAN_MAX }) => {
    const inset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    const el = (i: string) => (i === 'hero' ? document.querySelector('.hero') : document.getElementById(`stop-${i}`))!;
    const c = (i: string) => { const r = el(i).getBoundingClientRect(); return Math.min(r.top + r.height / 2, r.top + innerHeight / 2 - inset); };
    const a = c(from);
    const G = c(to) - a;
    const P = Math.max(0, Math.min(PAN_VH * innerHeight, PAN_MAX * G));
    const d = G - P + share * P;
    scrollBy({ top: a + d - innerHeight / 2, behavior: 'instant' });
  }, { from, to, share, PAN_VH, PAN_MAX });
  await settle(page);
}

/** A hash of every canvas pixel. */
export const canvasHash = (page: Page) => page.evaluate(() => {
  const cv = document.getElementById('scene') as HTMLCanvasElement;
  const d = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data;
  let h = 0x811c9dc5;
  for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619);
  return `${cv.width}x${cv.height}:${h >>> 0}`;
});

export const covers = (page: Page) => page.locator('#scene').evaluate((c) => {
  const r = c.getBoundingClientRect();
  return r.left <= 0 && r.top <= 0 && r.right >= innerWidth && r.bottom >= innerHeight;
});
