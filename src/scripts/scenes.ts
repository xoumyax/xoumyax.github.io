// Backdrop: one low-res canvas, scaled by a whole number. Scene k + 1 dissolves in pixel by
// pixel as the visitor scrolls from section k's centre to section k + 1's centre.
import { SCENE_IDS, SCENE_SIZE, sceneUrl } from '../lib/scenes';
import { dissolveOrder, integerScale, pickSet, sceneAt, type SceneSet } from '../lib/scene-math';

interface Loaded { w: number; h: number; frames: (Uint32Array | null)[]; order: Float32Array }

export function initScenes(): void {
  const cv = document.getElementById('scene') as HTMLCanvasElement | null;
  const ctx = cv?.getContext('2d', { willReadFrequently: true });
  if (!cv || !ctx) return;
  const sections = [...document.querySelectorAll<HTMLElement>('[data-section]')];
  if (sections.length === 0) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  const loaded = new Map<SceneSet, Loaded>();
  const loading = new Set<SceneSet>();
  const tried = new Set<SceneSet>();
  let cur: Loaded | null = null;
  let curSet: SceneSet | null = null;
  let out: ImageData | null = null;
  let out32: Uint32Array | null = null;
  let last = '';
  let pending = false;

  const loadImage = (url: string) => new Promise<HTMLImageElement | null>((ok) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = url;
  });

  async function load(set: SceneSet): Promise<void> {
    if (loaded.has(set) || loading.has(set) || tried.has(set)) return;
    tried.add(set);
    loading.add(set);
    const { w, h } = SCENE_SIZE[set];
    const scratch = document.createElement('canvas');
    scratch.width = w; scratch.height = h;
    const g = scratch.getContext('2d', { willReadFrequently: true })!;
    const imgs = await Promise.all(SCENE_IDS.map((id) => loadImage(sceneUrl(id, set))));
    const frames = imgs.map((img) => {
      if (!img || img.naturalWidth !== w || img.naturalHeight !== h) return null;
      g.clearRect(0, 0, w, h);
      g.drawImage(img, 0, 0);
      return new Uint32Array(g.getImageData(0, 0, w, h).data.buffer);
    });
    loading.delete(set);
    if (frames.some(Boolean)) loaded.set(set, { w, h, frames, order: dissolveOrder(w * h, 7) });
    adopt();
  }

  // Use the set that fits the viewport as soon as it is loaded.
  function adopt(): void {
    fit(); // keep the current canvas covering the viewport while a new set loads (or fails)
    const want = pickSet(innerWidth, innerHeight);
    const next = loaded.get(want);
    if (!next) { void load(want); return; }
    if (curSet !== want) {
      curSet = want; cur = next;
      cv!.width = next.w; cv!.height = next.h;
      out = ctx!.createImageData(next.w, next.h);
      out32 = new Uint32Array(out.data.buffer);
      last = '';
    }
    fit();
    draw(true);
  }

  function fit(): void {
    if (!cur) return;
    const s = integerScale(innerWidth, innerHeight, cur.w, cur.h);
    cv!.style.width = `${cur.w * s}px`;
    cv!.style.height = `${cur.h * s}px`;
  }

  // A scene that failed to load borrows its nearest loaded neighbour.
  function frameFor(k: number): Uint32Array | null {
    const f = cur!.frames;
    for (let d = 0; d < f.length; d++) {
      const a = k - d >= 0 ? f[k - d] : null;
      if (a) return a;
      const b = f[k + d];
      if (b) return b;
    }
    return null;
  }

  function draw(force: boolean): void {
    if (!cur || !out || !out32) return;
    const mid = innerHeight / 2;
    const centres = sections.map((s) => { const r = s.getBoundingClientRect(); return r.top + r.height / 2; });
    const { k, t } = sceneAt(centres, mid, reduced.matches);
    const key = `${curSet}:${k}:${t}`;
    if (!force && key === last) return;
    const A = frameFor(Math.min(k, SCENE_IDS.length - 1));
    const B = frameFor(Math.min(k + 1, SCENE_IDS.length - 1));
    if (!A || !B) return;
    last = key;
    if (t === 0) out32.set(A);
    else {
      const order = cur.order;
      for (let p = 0; p < order.length; p++) out32[p] = order[p] < t ? B[p] : A[p];
    }
    ctx!.putImageData(out, 0, 0);
    cv!.hidden = false;
  }

  const schedule = (): void => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; draw(false); });
  };

  const onLoad = () => requestAnimationFrame(schedule);
  if (document.readyState === 'complete') onLoad(); else addEventListener('load', onLoad, { once: true });

  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', () => { adopt(); });
  reduced.addEventListener('change', schedule);
  adopt();
}
