// Shared probes for the backdrop tests (not a spec file: imported by scenes.spec.ts and world.spec.ts).
import type { Page } from '@playwright/test';
import { SCENE_IDS } from '../../src/lib/scenes';

export const IDS = [...SCENE_IDS];

/** Turns the ambient clock off for the page (scroll still drives everything). */
export const still = (page: Page) => page.addInitScript(() => localStorage.setItem('world-still', '1'));

// Reads 16 pixels spread across the canvas (native resolution) and compares them with the
// same pixels of each scene file drawn into an offscreen canvas. Returns the scene id that
// matches all 16, or 'mixed'.
export async function sceneOf(page: Page): Promise<string> {
  await page.waitForSelector('#scene:not([hidden])');
  return page.evaluate(async (ids) => {
    const cv = document.getElementById('scene') as HTMLCanvasElement;
    const { width: w, height: h } = cv;
    const pts: [number, number][] = [];
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      pts.push([Math.floor(((i + 0.37 + 0.21 * j) % 4) / 4 * w), Math.floor(((j + 0.61 + 0.17 * i) % 4) / 4 * h)]);
    }
    const sample = (c: HTMLCanvasElement) => {
      const g = c.getContext('2d')!;
      return pts.map(([x, y]) => [...g.getImageData(x, y, 1, 1).data].join(','));
    };
    const have = sample(cv);
    const suffix = w === 120 ? '-m' : '';
    const hits: string[] = [];
    for (const id of ids) {
      const img = new Image();
      img.src = `/scenes/${id}${suffix}.png`;
      await img.decode();
      const off = document.createElement('canvas');
      off.width = w; off.height = h;
      off.getContext('2d')!.drawImage(img, 0, 0);
      const want = sample(off);
      if (want.every((v, i) => v === have[i])) hits.push(id);
    }
    return hits[0] ?? 'mixed';
  }, IDS);
}

export const settle = (page: Page) =>
  page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));

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
 * P = min(0.6 · vh, 0.5 · gap) (panLength) and I = gap − P.
 */
export async function scrollToPan(page: Page, from: string, to: string, share = 0.5) {
  await page.evaluate(({ from, to, share }) => {
    const inset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    const el = (i: string) => (i === 'hero' ? document.querySelector('.hero') : document.getElementById(`stop-${i}`))!;
    const c = (i: string) => { const r = el(i).getBoundingClientRect(); return Math.min(r.top + r.height / 2, r.top + innerHeight / 2 - inset); };
    const a = c(from);
    const G = c(to) - a;
    const P = Math.max(0, Math.min(0.6 * innerHeight, 0.5 * G));
    const d = G - P + share * P;
    scrollBy({ top: a + d - innerHeight / 2, behavior: 'instant' });
  }, { from, to, share });
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
