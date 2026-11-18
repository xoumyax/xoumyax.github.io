// Scene acts (src/scripts/world/acts/): what moves with scroll through a stop, and on its own.
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { SceneMeta } from '../../src/lib/world';
import { camera, worldAt } from '../../src/lib/world-math';
import { canvasHash, scrollToCentre, settle, still } from './scene-probe';

const meta = (id: string) => JSON.parse(readFileSync(`public/scenes/${id}/scene.json`, 'utf8')) as SceneMeta;

/** Puts the viewport middle at progress p through stop `id` (whose next stop is `next`): d = p · (G − P). */
async function scrollToStop(page: Page, id: string, next: string, p: number) {
  await scrollToCentre(page, id);
  await page.evaluate(({ id, next, p }) => {
    const inset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    const c = (i: string) => { const r = document.getElementById(`stop-${i}`)!.getBoundingClientRect(); return Math.min(r.top + r.height / 2, r.top + innerHeight / 2 - inset); };
    const a = c(id);
    const G = c(next) - a;
    const P = Math.max(0, Math.min(0.6 * innerHeight, 0.5 * G));
    scrollBy({ top: a + p * (G - P) - innerHeight / 2, behavior: 'instant' });
  }, { id, next, p });
  await settle(page);
}

/** The backdrop's state as worldAt gives it for the current layout (the same maths the page runs). */
async function state(page: Page) {
  const s = await page.evaluate(() => {
    const inset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    const anchors = [...document.querySelectorAll('[data-section]')].map((el) => {
      const r = el.getBoundingClientRect();
      return Math.min(r.top + r.height / 2, r.top + innerHeight / 2 - inset);
    });
    const cv = document.getElementById('scene') as HTMLCanvasElement;
    return { anchors, mid: innerHeight / 2, vh: innerHeight, remaining: document.documentElement.scrollHeight - innerHeight - scrollY, w: cv.width };
  });
  return { ...worldAt(s.anchors, s.mid, s.vh, s.remaining), set: s.w === 240 ? 'land' as const : 'port' as const };
}

/**
 * Where a sprite's top-left lands on the canvas for scene `id` at progress p (no pan), using the
 * offsets compose() uses: view + round(camera · rate) of the sprite's layer.
 */
function onScreen(m: SceneMeta, sprite: string, set: 'land' | 'port', p: number): [number, number] {
  const s = m.sprites.find((x) => x.name === sprite)!;
  const rate = m.layers.find((l) => l.name === s.layer)!.rate;
  const cam = camera(p);
  const v = m.view[set];
  return [s.at[0] - (v[0] + Math.round(cam.x * rate)), s.at[1] - (v[1] + Math.round(cam.y * rate))];
}

/**
 * Compares the canvas with frame `frame` of a sprite, over that frame's opaque pixels in rows
 * [r0, r1), the frame's top-left at canvas (x, y). Returns whether all match, and a hash of the
 * canvas pixels there.
 */
const underSprite = (page: Page, a: { id: string; name: string; h: number; frame: number; r0: number; r1: number; x: number; y: number }) =>
  page.evaluate(async (a) => {
    const img = new Image();
    img.src = `/scenes/${a.id}/${a.name}.png`;
    await img.decode();
    const off = document.createElement('canvas');
    off.width = img.naturalWidth; off.height = img.naturalHeight;
    const g = off.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const spr = g.getImageData(0, a.frame * a.h, img.naturalWidth, a.h).data;
    const cv = document.getElementById('scene') as HTMLCanvasElement;
    const have = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data;
    let all = true;
    let n = 0;
    let h = 0x811c9dc5;
    for (let y = a.r0; y < a.r1; y++) for (let x = 0; x < img.naturalWidth; x++) {
      const i = (y * img.naturalWidth + x) * 4;
      if (spr[i + 3] === 0) continue;
      const cx = a.x + x;
      const cy = a.y + y;
      if (cx < 0 || cy < 0 || cx >= cv.width || cy >= cv.height) continue;
      const j = (cy * cv.width + cx) * 4;
      n++;
      for (let k = 0; k < 3; k++) { if (have[j + k] !== spr[i + k]) all = false; h = Math.imul(h ^ have[j + k], 16777619); }
    }
    return { all: all && n > 0, hash: `${n}:${h >>> 0}` };
  }, a);

/** Which of `frames` of the horse (head and neck rows) the canvas shows now, or −1. */
async function horseFrameShown(page: Page, m: SceneMeta, frames: number[]): Promise<number> {
  const horse = m.sprites.find((s) => s.name === 'horse')!;
  const s = await state(page);
  if (s.k !== 2 || s.t > 0) return -1;
  const [x, y] = onScreen(m, 'horse', s.set, s.p);
  for (const frame of frames) if ((await underSprite(page, { id: 'phd', name: 'horse', h: horse.h, frame, r0: 0, r1: 34, x, y })).all) return frame;
  return -1;
}

test.describe('still', () => {
  test.beforeEach(({ page }) => still(page));

  test('phd: the head pose follows scroll and returns', async ({ page }) => {
    const m = meta('phd');
    const horse = m.sprites.find((s) => s.name === 'horse')!;
    // The head and neck only (sprite rows above the tail and the grass): the hooves meet `fore`.
    const head = async () => {
      const s = await state(page);
      expect(s.k).toBe(2);
      const [x, y] = onScreen(m, 'horse', s.set, s.p);
      return { p: s.p, ...(await underSprite(page, { id: 'phd', name: 'horse', h: horse.h, frame: 0, r0: 0, r1: 34, x, y })) };
    };
    await page.goto('/');
    await page.waitForSelector('#scene:not([hidden])');
    // Grazing at p ≈ 0.4 (poll: the world loads after first paint; the flat frame never moves).
    await scrollToStop(page, 'phd', 'ms', 0.4);
    await expect.poll(() => horseFrameShown(page, m, [6])).toBe(6);
    const mid = await head();
    expect(mid.p).toBeGreaterThan(0.3);
    expect(mid.p).toBeLessThan(0.5);
    await scrollToCentre(page, 'phd');
    const first = await head();
    expect(first.p).toBeLessThan(0.05);
    expect(first.all).toBe(true);           // up: exactly the rest frame
    await scrollToStop(page, 'phd', 'ms', 0.95);
    const third = await head();
    expect(third.p).toBeGreaterThan(0.9);
    expect(third.all).toBe(true);           // up again, after the camera has drifted
    expect(first.hash).not.toBe(mid.hash);
    expect(first.hash).toBe(third.hash);
  });

  test('now: the door lights up through the stop', async ({ page }) => {
    const m = meta('now');
    const door = m.sprites.find((s) => s.name === 'door')!;
    await page.goto('/');
    await page.waitForSelector('#scene:not([hidden])');
    // A door pixel that is the lit orange in the last frame and dark at rest, nearest the door's middle.
    const px = await page.evaluate(async ({ w, h, last }) => {
      const img = new Image();
      img.src = '/scenes/now/door.png';
      await img.decode();
      const c = document.createElement('canvas');
      c.width = w; c.height = h * (last + 1);
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const at = (f: number, x: number, y: number) => [...g.getImageData(x, f * h + y, 1, 1).data];
      let best: [number, number] | null = null;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const [r, gg, b, a] = at(last, x, y);
        const [r0, g0, b0] = at(0, x, y);
        if (a === 255 && r === 0xef && gg === 0x8d && b === 0x19 && r0 + g0 + b0 < 180) {
          const d = (x - w / 2) ** 2 + (y - h / 2) ** 2;
          if (!best || d < (best[0] - w / 2) ** 2 + (best[1] - h / 2) ** 2) best = [x, y];
        }
      }
      return best;
    }, { w: door.w, h: door.h, last: door.frames - 1 });
    expect(px).not.toBeNull();
    const sample = async () => {
      const s = await state(page);
      expect(s.k).toBe(1);
      const [x, y] = onScreen(m, 'door', s.set, s.p);
      const rgb = await page.evaluate(([x, y]) => {
        const cv = document.getElementById('scene') as HTMLCanvasElement;
        return [...cv.getContext('2d')!.getImageData(x, y, 1, 1).data].slice(0, 3);
      }, [x + px![0], y + px![1]]);
      return { p: s.p, rgb };
    };
    await scrollToCentre(page, 'now');
    const dark = await sample();
    expect(dark.p).toBeLessThan(0.05);
    expect(dark.rgb[0] + dark.rgb[1] + dark.rgb[2]).toBeLessThan(180);
    await scrollToStop(page, 'now', 'phd', 1);
    await expect.poll(async () => (await sample()).rgb).toEqual([0xef, 0x8d, 0x19]);
    expect((await sample()).p).toBeGreaterThan(0.97);
  });
});

test('phd: ambient motion changes the frame without scrolling', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#scene:not([hidden])');
  await expect(page.locator('#scene')).toHaveAttribute('data-ambient', 'on');
  await scrollToStop(page, 'phd', 'ms', 0.4);
  // Wait for the world (the flat frame never moves), then let it settle a moment.
  const m = meta('phd');
  await expect.poll(() => horseFrameShown(page, m, [6, 7, 8, 9])).toBeGreaterThanOrEqual(6);
  const a = await canvasHash(page);
  await page.waitForTimeout(1500);
  const b = await canvasHash(page);
  expect(b).not.toBe(a);
});
