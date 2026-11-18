// Backdrop: one low-res canvas, scaled by a whole number. Each stop has a scene; scrolling
// through a stop drives its act (p), and the last stretch of the gap to the next stop is a
// sideways pan (t) that slides the next scene in, layer by layer. A scene without a loaded world
// is its flat frame as a single layer. Reduced motion shows flat scenes only, snapped.
import { SCENE_IDS, SCENE_SIZE, sceneUrl, type SceneId } from '../../lib/scenes';
import { integerScale, pickSet, sceneAt, sectionAnchor, type SceneSet } from '../../lib/scene-math';
import { worldAt } from '../../lib/world-math';
import { ACTS } from './acts';
import { compose, flatWorld, type Bitmap, type World } from './compose';
import { loadBitmap, loadWorld } from './load';

interface FlatSet { w: number; h: number; worlds: World[] }  // one flat one-layer world per scene

const N = SCENE_IDS.length;

export function initWorld(): void {
  const cv = document.getElementById('scene') as HTMLCanvasElement | null;
  const ctx = cv?.getContext('2d', { willReadFrequently: true });
  const layer = cv?.parentElement;
  if (!cv || !ctx || !layer) return;
  const sections = [...document.querySelectorAll<HTMLElement>('[data-section]')];
  if (sections.length === 0) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let still = false;
  try { still = localStorage.getItem('world-still') === '1'; } catch { /* storage blocked */ }

  const loaded = new Map<SceneSet, FlatSet>();
  const loading = new Set<SceneSet>();
  const tried = new Set<SceneSet>();
  let cur: FlatSet | null = null;
  let curSet: SceneSet | null = null;
  let out: ImageData | null = null;
  let out32: Uint32Array | null = null;
  let last = '';
  let pending = false;
  let shownK = 0;
  let animating = false; // a scene on screen (k, or k + 1 mid-pan) has an act

  // Ambient clock in whole tenths of a second of rAF time. It is enabled (data-ambient="on")
  // while the tab shows, motion is allowed and still mode is off; disabled, it holds its value
  // and resumes from there. Frames are scheduled only while it is enabled and animating.
  let running = false; // clock enabled
  let base = 0;        // performance.now() at clock 0, while running
  let tick = 0;        // clock in tenths of a second
  let raf = 0;         // the clock loop's pending frame, 0 if none

  const worlds = new Map<SceneId, World>();
  const wanted = new Set((layer.dataset.worlds ?? '').split(/\s+/).filter((id): id is SceneId => (SCENE_IDS as readonly string[]).includes(id)));

  async function load(set: SceneSet): Promise<void> {
    if (loaded.has(set) || loading.has(set) || tried.has(set)) return;
    tried.add(set);
    loading.add(set);
    const { w, h } = SCENE_SIZE[set];
    const frames = await Promise.all(SCENE_IDS.map((id) => loadBitmap(sceneUrl(id, set), w, h)));
    loading.delete(set);
    if (frames.some(Boolean)) {
      // A scene whose flat frame failed borrows its nearest loaded neighbour.
      const near = (k: number): Bitmap => {
        for (let d = 0; d < N; d++) {
          const a = k - d >= 0 ? frames[k - d] : null;
          if (a) return a;
          const b = frames[k + d];
          if (b) return b;
        }
        throw new Error('unreachable');
      };
      loaded.set(set, { w, h, worlds: SCENE_IDS.map((id, k) => flatWorld(id, near(k))) });
    }
    adopt();
  }

  // Use the set that fits the viewport as soon as it is loaded.
  function adopt(): void {
    fit(); // keep the current canvas covering the viewport while a new set loads (or fails)
    const v = view();
    const want = pickSet(v.w, v.h);
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

  // The layer is 100lvh tall (the viewport with a phone's URL bar hidden), so the scale is taken
  // from its rect. Where lvh follows innerHeight anyway, the scale only grows while the set and
  // the width stay the same: a URL bar sliding in and out never rescales the whole backdrop.
  let fitKey = '';
  let fitScale = 0;
  function view(): { w: number; h: number } {
    const r = layer!.getBoundingClientRect();
    return { w: Math.max(innerWidth, r.width), h: Math.max(innerHeight, r.height) };
  }
  function fit(): void {
    if (!cur) return;
    const v = view();
    const key = `${cur.w}x${cur.h}@${innerWidth}`;
    const s = integerScale(v.w, v.h, cur.w, cur.h);
    fitScale = key === fitKey ? Math.max(fitScale, s) : s;
    fitKey = key;
    cv!.style.width = `${cur.w * fitScale}px`;
    cv!.style.height = `${cur.h * fitScale}px`;
  }

  const sceneWorld = (k: number): World => worlds.get(SCENE_IDS[k]) ?? cur!.worlds[k];

  function mark(k: number, next: number): void {
    const id = SCENE_IDS[k];
    if (cv!.dataset.scene !== id) cv!.dataset.scene = id;
    if (next < 0) { if (cv!.hasAttribute('data-next')) cv!.removeAttribute('data-next'); }
    else if (cv!.dataset.next !== SCENE_IDS[next]) cv!.dataset.next = SCENE_IDS[next];
  }

  function draw(force: boolean): void {
    if (!cur || !out || !out32) return;
    const vh = innerHeight;
    const mid = vh / 2;
    const inset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    const anchors = sections.map((s) => { const r = s.getBoundingClientRect(); return sectionAnchor(r.top, r.height, vh, inset); });
    let key: string;
    if (reduced.matches) {
      const k = Math.min(sceneAt(anchors, mid, true).k, N - 1);
      shownK = k;
      animating = false;
      mark(k, -1);
      key = `r:${curSet}:${k}`;
      if (!force && key === last) return;
      out32.set(cur.worlds[k].layers[0].px);
    } else {
      const remaining = document.documentElement.scrollHeight - innerHeight - scrollY;
      const w = worldAt(anchors, mid, vh, remaining);
      const k = Math.min(w.k, N - 1);
      const t = k + 1 < N ? w.t : 0;
      shownK = k;
      mark(k, t > 0 ? k + 1 : -1);
      const actA = ACTS[SCENE_IDS[k]];
      const actB = t > 0 ? ACTS[SCENE_IDS[k + 1]] : undefined;
      animating = !!(actA || actB);
      if (animating && running) { tick = Math.max(tick, Math.floor((performance.now() - base) / 100)); loop(); }
      key = `${curSet}:${k}:${w.p}:${t}:${animating ? tick : 0}`;
      if (!force && key === last) return;
      compose(out32, cur.w, cur.h, curSet!, sceneWorld(k), actA, t > 0 ? sceneWorld(k + 1) : null, actB, w.p, t, tick / 10);
    }
    last = key;
    ctx!.putImageData(out, 0, 0);
    cv!.hidden = false;
  }

  const schedule = (): void => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; draw(false); });
  };

  const onTick = (now: number): void => {
    raf = 0;
    if (!running || !animating) return;
    const n = Math.floor((now - base) / 100);
    if (n > tick) { tick = n; schedule(); } // never backwards: draw() may have read a later performance.now()
    raf = requestAnimationFrame(onTick);
  };
  function loop(): void {
    if (running && animating && !raf) raf = requestAnimationFrame(onTick);
  }
  function ambient(): void {
    const on = !document.hidden && !reduced.matches && !still;
    cv!.dataset.ambient = on ? 'on' : 'off';
    if (on === running) return;
    if (on) { base = performance.now() - tick * 100; running = true; loop(); }
    else {
      tick = Math.max(tick, Math.floor((performance.now() - base) / 100));
      running = false;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }
  }

  // Worlds load after first paint, one at a time, nearest to the scene on screen first (the
  // next one ahead before the one behind). A world that fails leaves its flat frame in place.
  async function loadWorlds(): Promise<void> {
    const queue = SCENE_IDS.map((id, k) => ({ id, k })).filter(({ id }) => wanted.has(id));
    while (queue.length) {
      const dist = (k: number) => (k >= shownK ? k - shownK : shownK - k + 0.5);
      queue.sort((a, b) => dist(a.k) - dist(b.k));
      const { id } = queue.shift()!;
      const w = await loadWorld(id);
      if (w) { worlds.set(id, w); draw(true); }
    }
  }
  const idle = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 200));
  // Reduced motion never draws worlds, so they are fetched only once motion is allowed.
  let painted = false;
  let fetching = false;
  function startWorlds(): void {
    if (!painted || fetching || !wanted.size || reduced.matches) return;
    fetching = true;
    idle(() => void loadWorlds());
  }

  const onLoad = () => requestAnimationFrame(() => { schedule(); painted = true; startWorlds(); });
  if (document.readyState === 'complete') onLoad(); else addEventListener('load', onLoad, { once: true });

  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', () => { adopt(); });
  // Layout can move the stops without a scroll (a details panel opening, fonts settling).
  new ResizeObserver(schedule).observe(document.body);
  reduced.addEventListener('change', () => { ambient(); draw(true); startWorlds(); });
  document.addEventListener('visibilitychange', ambient);
  ambient();
  adopt();
}
