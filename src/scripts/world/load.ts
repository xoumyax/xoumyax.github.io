// Loading: flat frames and layered worlds, decoded once into Uint32Arrays.
import type { SceneId } from '../../lib/scenes';
import { worldUrl, type SceneMeta } from '../../lib/world';
import { makeWorld, type Bitmap, type World } from './compose';

let scratch: CanvasRenderingContext2D | null = null;

function decode(img: HTMLImageElement): Bitmap {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!scratch) scratch = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
  const c = scratch.canvas;
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } else scratch.clearRect(0, 0, w, h);
  scratch.drawImage(img, 0, 0);
  return { w, h, px: new Uint32Array(scratch.getImageData(0, 0, w, h).data.buffer) };
}

const loadImage = (url: string) => new Promise<HTMLImageElement | null>((ok) => {
  const img = new Image();
  img.onload = () => ok(img);
  img.onerror = () => ok(null);
  img.src = url;
});

/** An image decoded to pixels, or null if it fails to load or is not w×h (when given). */
export async function loadBitmap(url: string, w?: number, h?: number): Promise<Bitmap | null> {
  const img = await loadImage(url);
  if (!img || (w !== undefined && img.naturalWidth !== w) || (h !== undefined && img.naturalHeight !== h)) return null;
  return decode(img);
}

const isPair = (v: unknown): v is [number, number] =>
  Array.isArray(v) && v.length === 2 && v.every((n) => Number.isInteger(n));

/** Shape check of a scene.json; layer depths may not decrease from layers[1] on. */
export function validMeta(m: SceneMeta, id: SceneId): boolean {
  return m && m.id === id && isPair(m.world) && m.world[0] > 0 && m.world[1] > 0
    && isPair(m.view?.land) && isPair(m.view?.port)
    && Array.isArray(m.layers) && m.layers.length > 0
    && m.layers.every((l) => typeof l.name === 'string' && typeof l.depth === 'number' && typeof l.rate === 'number')
    && m.layers.every((l, i) => i < 2 || l.depth >= m.layers[i - 1].depth)
    && Array.isArray(m.sprites)
    && m.sprites.every((s) => typeof s.name === 'string' && s.w > 0 && s.h > 0 && s.frames > 0 && isPair(s.at)
      && Number.isInteger(s.rest) && m.layers.some((l) => l.name === s.layer));
}

/** scene.json and every layer and sprite PNG of a scene, or null if any part fails. */
export async function loadWorld(id: SceneId): Promise<World | null> {
  try {
    const res = await fetch(worldUrl(id, 'scene.json'));
    if (!res.ok) return null;
    const meta = (await res.json()) as SceneMeta;
    if (!validMeta(meta, id)) { console.warn(`world ${id}: bad scene.json`); return null; }
    const [W, H] = meta.world;
    const [layers, sprites] = await Promise.all([
      Promise.all(meta.layers.map((l) => loadBitmap(worldUrl(id, `${l.name}.png`), W, H))),
      Promise.all(meta.sprites.map((s) => loadBitmap(worldUrl(id, `${s.name}.png`), s.w, s.h * s.frames))),
    ]);
    if (layers.some((b) => !b) || sprites.some((b) => !b)) {
      console.warn(`world ${id}: a layer or sprite PNG failed to load or is not the size scene.json gives`);
      return null;
    }
    return makeWorld(meta, layers as Bitmap[], sprites as Bitmap[]);
  } catch {
    return null;
  }
}
