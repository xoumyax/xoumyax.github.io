// Backdrop: one screen-resolution canvas showing a low-res world scaled by a whole number of CSS
// px per world px (the block). Each stop has a scene; scrolling through a stop drives its act (p),
// and the last stretch of the gap to the next stop is a sideways pan (t) that slides the next
// scene in, layer by layer. A scene without a loaded world is its flat frame as a single layer.
// Reduced motion shows flat scenes only, snapped.
//
// Smoothness: the scene follows a smoothed copy of the scroll position (Follower: ~110 ms behind,
// snapping on big jumps, in still mode and in reduced motion), layers move by whole device px
// rather than whole blocks (./screen.ts), and the ambient clock runs in continuous seconds.
import { SCENE_IDS, SCENE_SIZE, sceneUrl, type SceneId } from '../../lib/scenes';
import { integerScale, pickSet, sceneAt, sectionAnchor, type SceneSet } from '../../lib/scene-math';
import { Follower, worldAt } from '../../lib/world-math';
import { ACTS, continuous } from './acts';
import { flatWorld, passes, type Bitmap, type World } from './compose';
import { loadBitmap, loadWorld } from './load';
import { Screen } from './screen';

interface FlatSet { w: number; h: number; worlds: World[] }  // one flat one-layer world per scene

const N = SCENE_IDS.length;

export function initWorld(): void {
  const cv = document.getElementById('scene') as HTMLCanvasElement | null;
  const layer = cv?.parentElement;
  if (!cv || !layer || !cv.getContext('2d')) return;
  const sections = [...document.querySelectorAll<HTMLElement>('[data-section]')];
  if (sections.length === 0) return;
  const screen = new Screen(cv);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let still = false;
  try { still = localStorage.getItem('world-still') === '1'; } catch { /* storage blocked */ }

  const loaded = new Map<SceneSet, FlatSet>();
  const loading = new Set<SceneSet>();
  const tried = new Set<SceneSet>();
  let cur: FlatSet | null = null;
  let curSet: SceneSet | null = null;
  let shownK = 0;
  let animating = false; // a scene on screen (k, or k + 1 mid-pan) has an act
  let smooth = false;    // … and one of them moves continuously (a layer shift)

  // The shown scroll position: follows scrollY while it settles, rAF-driven only until then.
  const follow = new Follower();
  let followed = false;  // snapped to scrollY at least once

  // Ambient clock in seconds of rAF time. It is enabled (data-ambient="on") while the tab shows,
  // motion is allowed and still mode is off; disabled, it holds its value and resumes from there.
  // Frames are scheduled every rAF while a continuous act is on screen, otherwise on the clock's
  // 0.1 s grid while an act is on screen, and not at all once the scene is settled.
  let running = false; // clock enabled
  let base = 0;        // performance.now() at clock 0, while running
  let clock = 0;       // seconds
  let raf = 0;         // pending frame, 0 if none
  let lastFrame = 0;   // the previous frame's time while frames run back to back, else 0
  let timer = 0;       // pending 0.1 s grid wake-up, 0 if none

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
    follow.snap(scrollY); // a resize moves the stops under the shown position: land on the real one
    fit(); // keep the current canvas covering the viewport while a new set loads (or fails)
    const v = view();
    const want = pickSet(v.w, v.h);
    const next = loaded.get(want);
    if (!next) { void load(want); if (cur) render(true); return; }
    if (curSet !== want) {
      curSet = want; cur = next;
      cv!.dataset.set = want;
    }
    fit();
    render(true);
  }

  // The layer is 100lvh tall (the viewport with a phone's URL bar hidden), so the scale is taken
  // from its rect. Where lvh follows innerHeight anyway, the scale only grows while the set and
  // the width stay the same: a URL bar sliding in and out never rescales the whole backdrop.
  // The backing store is the CSS size in device px (at most 2 per CSS px): b device px per world px.
  let fitKey = '';
  let fitScale = 0;
  let dpr = 1;
  let b = 1;
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
    dpr = Math.min(devicePixelRatio || 1, 2);
    b = fitScale * dpr;
    cv!.style.width = `${cur.w * fitScale}px`;
    cv!.style.height = `${cur.h * fitScale}px`;
    screen.size(Math.round(cur.w * b), Math.round(cur.h * b));
  }

  const sceneWorld = (k: number): World => worlds.get(SCENE_IDS[k]) ?? cur!.worlds[k];

  function mark(k: number, next: number): void {
    const id = SCENE_IDS[k];
    if (cv!.dataset.scene !== id) cv!.dataset.scene = id;
    if (next < 0) { if (cv!.hasAttribute('data-next')) cv!.removeAttribute('data-next'); }
    else if (cv!.dataset.next !== SCENE_IDS[next]) cv!.dataset.next = SCENE_IDS[next];
  }

  function render(force: boolean): void {
    if (!cur || !curSet) return;
    if (Math.min(devicePixelRatio || 1, 2) !== dpr) fit(); // zoom, or a move to another screen
    const vh = innerHeight;
    const mid = vh / 2;
    const inset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    // The rects are at the real scroll position; the scene is drawn at the shown one.
    const lag = reduced.matches ? 0 : scrollY - follow.y;
    const anchors = sections.map((s) => { const r = s.getBoundingClientRect(); return sectionAnchor(r.top + lag, r.height, vh, inset); });
    let list;
    if (reduced.matches) {
      const k = Math.min(sceneAt(anchors, mid, true).k, N - 1);
      shownK = k;
      animating = smooth = false;
      mark(k, -1);
      list = passes(curSet, cur.worlds[k], undefined, null, undefined, 0, 0, 0);
    } else {
      const remaining = document.documentElement.scrollHeight - innerHeight - follow.y;
      const w = worldAt(anchors, mid, vh, remaining);
      const k = Math.min(w.k, N - 1);
      const t = k + 1 < N ? w.t : 0;
      shownK = k;
      mark(k, t > 0 ? k + 1 : -1);
      const actA = ACTS[SCENE_IDS[k]];
      const actB = t > 0 ? ACTS[SCENE_IDS[k + 1]] : undefined;
      animating = !!(actA || actB);
      smooth = continuous(actA) || continuous(actB);
      list = passes(curSet, sceneWorld(k), actA, t > 0 ? sceneWorld(k + 1) : null, actB, w.p, t, clock);
    }
    screen.draw(list, cur.w, cur.h, b, clock, force);
    cv!.hidden = false;
  }

  function request(): void {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function frame(now: number): void {
    raf = 0;
    const dt = lastFrame ? (now - lastFrame) / 1000 : 1 / 60;
    if (running) clock = Math.max(clock, (now - base) / 1000); // never backwards
    let moving = false;
    if (!followed) { follow.snap(scrollY); followed = true; } // the first frame lands where the page opened
    else moving = follow.step(scrollY, dt, innerHeight, still || reduced.matches);
    // data-follow is present while the shown position is catching up (tests wait for it to go).
    if (moving !== cv!.hasAttribute('data-follow')) cv!.toggleAttribute('data-follow', moving);
    render(false);
    if (moving || (running && smooth)) { lastFrame = now; request(); return; }
    lastFrame = 0;
    if (running && animating && !timer) {
      // Wake on the clock's next 0.1 s step.
      const ms = Math.max(1, (Math.floor(clock * 10 + 1e-7) + 1) * 100 - clock * 1000);
      timer = window.setTimeout(() => { timer = 0; if (running) request(); }, ms);
    }
  }

  function ambient(): void {
    const on = !document.hidden && !reduced.matches && !still;
    cv!.dataset.ambient = on ? 'on' : 'off';
    if (on === running) return;
    if (on) { base = performance.now() - clock * 1000; running = true; request(); }
    else {
      clock = Math.max(clock, (performance.now() - base) / 1000);
      running = false;
      if (timer) { clearTimeout(timer); timer = 0; }
    }
  }

  // Worlds load after first paint, one at a time, nearest to the scene on screen first (the
  // next one ahead before the one behind). A world that fails leaves its flat frame in place.
  // data-loaded lists the worlds in use.
  async function loadWorlds(): Promise<void> {
    const queue = SCENE_IDS.map((id, k) => ({ id, k })).filter(({ id }) => wanted.has(id));
    while (queue.length) {
      const dist = (k: number) => (k >= shownK ? k - shownK : shownK - k + 0.5);
      queue.sort((a, b) => dist(a.k) - dist(b.k));
      const { id } = queue.shift()!;
      const w = await loadWorld(id);
      if (w) {
        worlds.set(id, w);
        cv!.dataset.loaded = SCENE_IDS.filter((s) => worlds.has(s)).join(' ');
        render(true);
      }
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

  const onLoad = () => requestAnimationFrame(() => { request(); painted = true; startWorlds(); });
  if (document.readyState === 'complete') onLoad(); else addEventListener('load', onLoad, { once: true });

  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', () => { adopt(); });
  // Layout can move the stops without a scroll (a details panel opening, fonts settling).
  new ResizeObserver(request).observe(document.body);
  reduced.addEventListener('change', () => { follow.snap(scrollY); ambient(); render(true); startWorlds(); });
  document.addEventListener('visibilitychange', ambient);
  ambient();
  adopt();
}
