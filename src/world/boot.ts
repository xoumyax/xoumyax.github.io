// Boots the Big Bend world behind the landing page (spec §5.4–5.6).
//
// Order: the text is already painted. On idle (or the first interaction) we check reduced motion
// and WebGL2, and only then import the engine (three.js stays off `/`'s critical path). Scroll
// drives the camera along the road; drag, pinch and ctrl+wheel over open world turn and zoom it;
// the landmark doors follow the landmarks every frame. Anything that goes wrong swaps to the poster.
//
// Touch: while the world runs, a fixed surface (#world-touch) sits between the world and the
// content and is what a finger on open world lands on. It has `touch-action: pan-y`, so over open
// world the browser only scrolls vertically and never pinch-zooms, and every touch listener can be
// passive. Content keeps `auto` (pinch-zoom, horizontal row scroll): touch-action intersects down
// the ancestor chain, so it cannot go on html/body without taking pinch-zoom away from the text.
//
// Focus (WCAG 2.4.11): a focused pin that must hide (covered by content, off screen) first hands
// focus to the next showing pin, else to the world bar (Zoom in over the world, the door's own
// Explore link over the poster), without scrolling.
//
// URL contract (same as /world-test), honoured only in a build made with WORLD_TEST=1 (the e2e
// build; never the deploy, M9): ?debug=1 (window.__world, window.__worldCtl) ?tier=high|medium|low
// ?governor=off ?t=<sec> (freeze the clock) ?perf=1 (with debug: GPU ms into __world.gpu).
// Hash deep links (/#stop-phd) always work: they are plain scroll positions.
import type { LandmarkPositions, StopLandmarks, WorldController } from './index';
import { pickInitialTier, type QualityTier } from './quality';
import { journeyProgress, clampView, stopU, BASE_PITCH, type View } from './journey-math';
import { classifyWheel, classifyTouch, overOf, wheelZoomFactor, TOUCH_SLOP, type Intent, type Over } from './input';
import { createDoors, createWorldBar, posterPositions, isLandmark, nextShown, type Box, type PosterTable, type Shows } from './landmarks';
import type { LandmarkId } from '../lib/schema';
import { setupFallback, hasWebGL2 } from './fallback';
import './world.css';

declare global { interface Window { __worldCtl?: WorldController } }

type StopKey = Parameters<WorldController['journeyForStop']>[0];
const STOP_KEYS: readonly string[] = ['srm', 'cognizant', 'ms', 'phd', 'now', 'river'] satisfies StopKey[];

/** clampView works in absolute pitch: the rest view is the engine's base pitch. */
const REST: View = { yaw: 0, pitch: BASE_PITCH, zoom: 1 };
/** A drag, pinch or ctrl+wheel eases back to the stop's viewpoint this long after it ends. */
const RELAX_MS = 1400;
const ZOOM_STEP = 1.25;
/** Clearance (px) between a door's box and content or the world bar. */
const BOX_MARGIN = 4;
/** Past this, a pending mount is abandoned for the poster. */
const MOUNT_TIMEOUT_MS = 15_000;
/** Degrees per CSS px of drag. */
const YAW_PER_PX = 0.15, PITCH_PER_PX = 0.06, TOUCH_YAW_PER_PX = 0.2;
/** Degrees per arrow key (Left/Right only: Up/Down stay the page's own scroll keys). */
const YAW_PER_KEY = 6;

let booted = false;

export function boot(): void {
  if (booted) return;
  booted = true;
  // M9: the test parameters exist only in a WORLD_TEST=1 build; on the live site a shared
  // `?governor=off` link cannot take the fallback away from whoever opens it
  const P = new URLSearchParams(__WORLD_TEST__ ? location.search : '');
  const root = document.documentElement;
  const canvas = document.getElementById('world') as HTMLCanvasElement | null;
  const layer = document.getElementById('world-layer');
  const box = document.getElementById('landmarks');
  if (!canvas || !layer || !box) return;
  const debug = P.get('debug') === '1';
  const fb = setupFallback();
  const sections = [...document.querySelectorAll<HTMLElement>('section.stop[data-stop]')];
  const doors = createDoors(box, sections.map((s) => s.dataset.landmark).filter(isLandmark));
  // M7: which landmark each stop frames, from journey.yaml (rendered into the stop sections)
  const stopLandmarks: StopLandmarks = {};
  for (const s of sections) {
    const id = s.dataset.stop, lm = s.dataset.landmark;
    if (id && STOP_KEYS.includes(id) && isLandmark(lm)) stopLandmarks[id as StopKey] = lm;
  }

  // ---- view state (mirrors the engine's view target; the engine clamps the same way)
  let ctl: WorldController | null = null;
  const view: View = { ...REST };
  let restZoom = 1, relaxTimer = 0;
  function setView(next: View) {
    const c = clampView(next);
    if (ctl) {
      if (c.yaw !== view.yaw || c.pitch !== view.pitch) ctl.orbit(c.yaw - view.yaw, c.pitch - view.pitch);
      if (c.zoom !== view.zoom) ctl.zoom(c.zoom / view.zoom);
    }
    Object.assign(view, c);
  }
  function relax() {
    if (restZoom === 1) { ctl?.resetView(); Object.assign(view, REST); }
    else setView({ yaw: 0, pitch: BASE_PITCH, zoom: restZoom });
  }
  const cancelRelax = () => clearTimeout(relaxTimer);
  const scheduleRelax = () => { cancelRelax(); relaxTimer = window.setTimeout(relax, RELAX_MS); };
  const bar = createWorldBar(box, doors.order, {
    zoomIn: () => { cancelRelax(); restZoom = clampView({ ...REST, zoom: restZoom * ZOOM_STEP }).zoom; setView({ ...view, zoom: restZoom }); },
    zoomOut: () => { cancelRelax(); restZoom = clampView({ ...REST, zoom: restZoom / ZOOM_STEP }).zoom; setView({ ...view, zoom: restZoom }); },
    reset: () => { cancelRelax(); restZoom = 1; ctl?.resetView(); Object.assign(view, REST); },
  });

  // ---- layout, measured on resize (never per frame)
  /**
   * layerW/layerH: the world layer's box (sized in lvh, so on a phone it can reach under the URL
   * bar). viewH: the part of it on screen, which bounds where a door may show (I6).
   */
  let layerW = 0, layerH = 0, viewH = 0, barBottom = 0, maxScroll = 0;
  let stopBoxes: { top: number; height: number }[] = [];
  /** Content that sits above the doors (page coordinates): a door under one is hidden. */
  let occluders: Box[] = [];
  const occluderEls = [...document.querySelectorAll<HTMLElement>('[data-panel], [data-card-row], .footer')];
  function measure() {
    layerW = layer!.clientWidth; layerH = layer!.clientHeight;
    viewH = Math.min(layerH, innerHeight);
    barBottom = Math.max(0, document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0);
    const y = scrollY;
    stopBoxes = sections.map((s) => { const r = s.getBoundingClientRect(); return { top: r.top + y, height: r.height }; });
    occluders = occluderEls.map((el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top + y, b: r.bottom + y }; });
    maxScroll = root.scrollHeight - innerHeight;
  }
  /** A door shows only when all of its box is clear of content and of the world bar. */
  const covered = (d: Box) => {
    const y = scrollY, m = BOX_MARGIN;
    const hit = (o: Box, dy: number) => d.l - m < o.r && d.r + m > o.l && d.t + dy - m < o.b && d.b + dy + m > o.t;
    const b = bar.box();
    return (b !== null && hit(b, 0)) || occluders.some((o) => hit(o, y));
  };

  // ---- focus handoff for a focused pin that has to hide
  const handoffWorld = (id: LandmarkId, shows: Shows) => {
    const next = nextShown(doors.order, shows, id);
    return next ? doors.els.get(next)! : bar.zoomIn;
  };
  const handoffPoster = (id: LandmarkId, shows: Shows) => {
    bar.syncExplore(shows);
    return bar.exploreLink(id) ?? null;
  };

  // ---- poster mode
  // M10: the poster and its landmark table are one versioned pair. The page asks for both with
  // the same ?v= (the build renders it from landmarks.json), and a table of another version (a
  // stale cache) is not used: the doors go into the Explore list rather than off their landmarks.
  const posterVersion = layer.dataset.posterVersion ?? '';
  let table: Promise<PosterTable | null> | null = null;
  const loadTable = () => (table ??= fetch(`/world/landmarks.json${posterVersion ? `?v=${posterVersion}` : ''}`)
    .then((r) => (r.ok ? (r.json() as Promise<PosterTable>) : null))
    .then((t) => (t && (t.version ?? '') === posterVersion ? t : null))
    .catch(() => null));
  let posterShot: PosterTable['shots']['desktop'] | null = null, posterRaf = 0, placedY = NaN;
  function placeOnPoster() {
    posterRaf = 0;
    placedY = scrollY;
    // no table or no poster image: no pins, every door is in the Explore list
    const pos = posterShot && document.getElementById('world-poster') ? posterPositions(posterShot, layerW, layerH) : {};
    bar.syncExplore(doors.place(pos, layerW, viewH, barBottom, covered, handoffPoster));
  }
  fb.onPoster(() => {
    // I8: a mount still in flight (the 15 s timeout, a context loss or reduced motion mid-mount)
    // stops where it is and releases everything
    mountAbort?.abort();
    stopWorld();
    bar.setMode('poster');
    measure();
    placeOnPoster(); // every door is listed until the table arrives
    void loadTable().then((t) => {
      // <html data-world-doors>: the poster's doors are final ('placed', or 'list' with no table)
      if (!t) { root.dataset.worldDoors = 'list'; return; }
      const src = document.querySelector<HTMLSourceElement>('#world-layer picture source');
      const pick = () => {
        posterShot = t.shots.mobile && src && matchMedia(src.media).matches ? t.shots.mobile : t.shots.desktop;
        measure();
        placeOnPoster();
      };
      pick();
      root.dataset.worldDoors = 'placed';
      addEventListener('resize', pick);
      // late layout changes (a font swap) move the panels the doors hide under
      if (typeof ResizeObserver !== 'undefined') new ResizeObserver(pick).observe(document.body);
      // the doors stay put over the poster while content scrolls over them
      addEventListener('scroll', () => { posterRaf ||= requestAnimationFrame(placeOnPoster); }, { passive: true });
      // Tab can scroll the page (focus into view) and press on before that frame: re-place at
      // once, so a door that the scroll uncovered is a pin before focus reaches the doors.
      document.addEventListener('focusin', () => {
        if (scrollY === placedY) return;
        cancelAnimationFrame(posterRaf);
        placeOnPoster();
      });
    });
  });

  let mountAbort: AbortController | null = null;
  async function mount() {
    fb.loading();
    const freeze = P.has('t') ? Number(P.get('t')) : NaN;
    // A context lost mid-mount can stall the mount rather than reject it: give up on a timer.
    // The poster taking over (this timer or anything else) aborts the mount: the bake is
    // cancelled and the engine stops building at its next await, releasing everything (I8).
    mountAbort = new AbortController();
    const timer = window.setTimeout(() => fb.toPoster('timeout'), MOUNT_TIMEOUT_MS);
    try {
      const { mountWorld } = await import('./index');
      if (fb.reason) return;
      // onLost may fire before mountWorld resolves (e.g. a loss during shader compile): the
      // poster goes up at once, and the controller, if it ever arrives, is disposed.
      const c = await mountWorld(canvas!, {
        tier: pickTier(P.get('tier')),
        debug,
        governor: P.get('governor') !== 'off',
        freezeAt: Number.isFinite(freeze) ? freeze : null,
        perf: P.get('perf') === '1',
        stopLandmarks,
        signal: mountAbort.signal,
        onLost: (reason) => fb.toPoster(reason),
      });
      if (fb.reason) { dispose(c); return; }
      ctl = c;
      if (debug) window.__worldCtl = c;
      start(c);
    } catch (e) {
      // already on the poster (the abort is what rejected the mount): nothing to report
      if (fb.reason) return;
      console.warn('world: showing the poster instead', e);
      fb.toPoster('error');
    } finally {
      clearTimeout(timer);
      mountAbort = null;
    }
  }

  // ---- running
  let us: number[] = [];
  let raf = 0;
  let ro: ResizeObserver | null = null;
  const progress = () => {
    const y = scrollY;
    // at the very bottom of the page the road has reached the river
    if (maxScroll > 0 && y >= maxScroll - 2) return us[us.length - 1] ?? 1;
    return journeyProgress(stopBoxes.map((s) => ({ top: s.top - y, height: s.height })), innerHeight, us);
  };
  const onScroll = () => ctl?.setJourney(progress());
  const onResize = () => { measure(); onScroll(); };
  /** M6: one positions object, refilled every frame (no per-frame allocation in the door loop). */
  const scratch = {} as LandmarkPositions;
  function tick() {
    raf = requestAnimationFrame(tick);
    if (ctl) doors.place(ctl.landmarkScreenPositions(scratch), layerW, viewH, barBottom, covered, handoffWorld);
  }
  function onVisibility() {
    if (!ctl) return;
    if (document.hidden) { ctl.pause(); cancelAnimationFrame(raf); raf = 0; }
    else { ctl.resume(); if (!raf) raf = requestAnimationFrame(tick); } // queued after the engine's frame
  }

  function start(c: WorldController) {
    us = sections.map((s, i) => (STOP_KEYS.includes(s.dataset.stop ?? '') ? c.journeyForStop(s.dataset.stop as StopKey) : stopU(i, sections.length)));
    measure();
    // A deep link or a restored scroll starts the camera where the page is, not at the trailhead.
    // The engine drew its mount frame at u=0; the canvas stays hidden until the loop draws this u.
    c.jumpJourney(progress());
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onResize);
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(onResize);
      ro.observe(document.body);
      for (const s of sections) ro.observe(s);
    }
    // M5: the one non-passive listener sits only where open-world wheel events land (the touch
    // surface, and the doors standing on the world), so no other wheel on the page waits for it
    surface.addEventListener('wheel', onWheel, { passive: false });
    box!.addEventListener('wheel', onWheel, { passive: false });
    addEventListener('pointerdown', onPointerDown);
    addEventListener('pointermove', onPointerMove, { passive: true });
    addEventListener('pointerup', endDrag);
    addEventListener('pointercancel', endDrag);
    addEventListener('blur', endDrag);
    // all touch listeners are passive: #world-touch's pan-y keeps the browser off open world's
    // horizontal drags and pinches, so nothing needs cancelling
    addEventListener('touchstart', onTouchStart, { passive: true });
    addEventListener('touchmove', onTouchMove, { passive: true });
    addEventListener('touchend', onTouchEnd, { passive: true });
    addEventListener('touchcancel', onTouchEnd, { passive: true });
    box!.addEventListener('keydown', onKey);
    bar.el.addEventListener('keydown', onKey);
    box!.addEventListener('keyup', onKeyUp);
    bar.el.addEventListener('keyup', onKeyUp);
    box!.addEventListener('focusout', onKeyBlur);
    bar.el.addEventListener('focusout', onKeyBlur);
    document.addEventListener('visibilitychange', onVisibility);
    layer!.after(surface);
    // Both rAFs are queued after the engine's first loop frame, so they run once it has drawn.
    requestAnimationFrame(() => { fb.reveal(); if (!fb.reason) bar.setMode('world'); });
    raf = requestAnimationFrame(tick);
    if (document.hidden) onVisibility();
  }

  function stopWorld() {
    cancelAnimationFrame(raf); raf = 0;
    cancelRelax();
    removeEventListener('scroll', onScroll);
    removeEventListener('resize', onResize);
    ro?.disconnect(); ro = null;
    surface.removeEventListener('wheel', onWheel);
    box!.removeEventListener('wheel', onWheel);
    removeEventListener('pointerdown', onPointerDown);
    removeEventListener('pointermove', onPointerMove);
    removeEventListener('pointerup', endDrag);
    removeEventListener('pointercancel', endDrag);
    removeEventListener('blur', endDrag);
    removeEventListener('touchstart', onTouchStart);
    removeEventListener('touchmove', onTouchMove);
    removeEventListener('touchend', onTouchEnd);
    removeEventListener('touchcancel', onTouchEnd);
    box!.removeEventListener('keydown', onKey);
    bar.el.removeEventListener('keydown', onKey);
    box!.removeEventListener('keyup', onKeyUp);
    bar.el.removeEventListener('keyup', onKeyUp);
    box!.removeEventListener('focusout', onKeyBlur);
    bar.el.removeEventListener('focusout', onKeyBlur);
    keyTurned = false;
    document.removeEventListener('visibilitychange', onVisibility);
    surface.remove();
    root.classList.remove('world-dragging');
    drag = null; touch = null;
    if (ctl) { dispose(ctl); ctl = null; }
    if (debug) delete window.__worldCtl;
  }

  // ---- gestures (spec §5.5); listeners on window, the world layer takes no pointer events.
  // The touch surface: what open world is under a finger or the mouse while the world runs.
  const surface = document.createElement('div');
  surface.id = 'world-touch';
  surface.setAttribute('aria-hidden', 'true');
  function onWheel(e: WheelEvent) {
    if (classifyWheel(e, overOf(e.target as Element | null)) !== 'zoom') return;
    e.preventDefault();
    setView({ ...view, zoom: view.zoom * wheelZoomFactor(e.deltaY, e.deltaMode) });
    scheduleRelax();
  }

  let drag: { id: number; x: number; y: number } | null = null;
  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === 'touch' || e.button !== 0 || !e.isPrimary) return;
    const t = e.target as Element | null;
    if (overOf(t) !== 'world' || t?.closest?.('#landmarks')) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    cancelRelax();
    root.classList.add('world-dragging'); // #world-touch is user-select: none, so no selection starts
  }
  function onPointerMove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return;
    if (e.buttons === 0) { endDrag(); return; }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    setView({ ...view, yaw: view.yaw - dx * YAW_PER_PX, pitch: view.pitch + dy * PITCH_PER_PX });
  }
  function endDrag() {
    if (!drag) return;
    drag = null;
    root.classList.remove('world-dragging');
    scheduleRelax();
  }

  /**
   * One finger or two. `carry`: during an orbit, the page scroll this gesture is carrying itself
   * (null once the browser is seen scrolling natively, so the two never add up).
   */
  let touch: { x: number; y: number; lastX: number; lastY: number; over: Over; intent: Intent | null; dist: number; carry: number | null } | null = null;
  const spread = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  function onTouchStart(e: TouchEvent) {
    const t = e.touches;
    if (t.length === 1) {
      touch = { x: t[0].clientX, y: t[0].clientY, lastX: t[0].clientX, lastY: t[0].clientY, over: overOf(t[0].target as Element), intent: null, dist: 0, carry: null };
    } else if (t.length === 2) {
      if (touch?.intent === 'native') return; // the page is already scrolling: leave the gesture to it
      const over: Over = overOf(t[0].target as Element) === 'world' && overOf(t[1].target as Element) === 'world' ? 'world' : 'content';
      touch = { x: 0, y: 0, lastX: 0, lastY: 0, over, intent: classifyTouch({ touches: 2, dx: 0, dy: 0 }, over), dist: spread(t), carry: null };
      if (touch.intent === 'zoom') cancelRelax();
    } else touch = null;
  }
  function onTouchMove(e: TouchEvent) {
    if (!touch) return;
    const t = e.touches;
    if (touch.intent === null) {
      if (t.length !== 1) return;
      const dx = t[0].clientX - touch.x, dy = t[0].clientY - touch.y;
      if (Math.hypot(dx, dy) < TOUCH_SLOP) return;
      touch.intent = classifyTouch({ touches: 1, dx, dy }, touch.over);
      if (touch.intent === 'orbit') { cancelRelax(); touch.carry = scrollY; }
    }
    if (touch.intent === 'orbit' && t.length === 1) {
      // a vertical drift after a sideways start still scrolls the page (pan-y): only x turns
      const x = t[0].clientX, y = t[0].clientY;
      setView({ ...view, yaw: view.yaw - (x - touch.lastX) * TOUCH_YAW_PER_PX });
      // Chromium's pan-y drops the native scroll for a swipe that starts sideways, so the vertical
      // part of this swipe would be lost: carry it as page scroll. If the page moved on its own
      // since the last move, the browser is scrolling natively after all: stand down.
      if (touch.carry !== null) {
        if (Math.abs(scrollY - touch.carry) > 1) touch.carry = null;
        else if (y !== touch.lastY) { scrollBy({ top: touch.lastY - y, behavior: 'instant' }); touch.carry = scrollY; }
      }
      touch.lastX = x; touch.lastY = y;
    } else if (touch.intent === 'zoom' && t.length === 2) {
      const d = spread(t);
      if (touch.dist > 0 && d > 0) setView({ ...view, zoom: (view.zoom * d) / touch.dist });
      touch.dist = d;
    }
  }
  function onTouchEnd(e: TouchEvent) {
    if (e.touches.length > 0 || !touch) return;
    const was = touch.intent;
    touch = null;
    if (was === 'orbit' || was === 'zoom') scheduleRelax();
  }

  // ArrowLeft/Right turn the view while focus is on a door or a view control. Up/Down are left
  // alone: they are the keyboard's vertical scroll (travel the road). Like a drag, a turn eases
  // back to the stop's viewpoint once the key is released or focus leaves (M4).
  let keyTurned = false;
  function onKey(e: KeyboardEvent) {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const d = e.key === 'ArrowLeft' ? -YAW_PER_KEY : e.key === 'ArrowRight' ? YAW_PER_KEY : 0;
    if (!d) return;
    e.preventDefault();
    cancelRelax();
    keyTurned = true;
    setView({ ...view, yaw: view.yaw + d });
  }
  function onKeyUp(e: KeyboardEvent) {
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && keyTurned) { keyTurned = false; scheduleRelax(); }
  }
  function onKeyBlur() {
    if (keyTurned) { keyTurned = false; scheduleRelax(); }
  }

  // ---- the gates (last, so every binding above is initialised before a synchronous poster swap)
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  reduce.addEventListener?.('change', (e) => { if (e.matches) fb.toPoster('reduced-motion'); });
  if (reduce.matches) { fb.toPoster('reduced-motion'); return; }
  root.dataset.world = 'idle';
  whenIdle(() => {
    if (fb.reason) return;
    if (!hasWebGL2()) { fb.toPoster('no-webgl'); return; }
    void mount();
  });
}

function pickTier(forced: string | null): QualityTier {
  if (forced === 'high' || forced === 'medium' || forced === 'low') return forced;
  return pickInitialTier({
    isMobile: matchMedia('(pointer: coarse)').matches && innerWidth < 900,
    dpr: devicePixelRatio || 1,
    deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,
  });
}

/** On idle, or on the first interaction, whichever is first. */
function whenIdle(fn: () => void) {
  let done = false;
  const evs = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
  const go = () => {
    if (done) return;
    done = true;
    for (const ev of evs) removeEventListener(ev, go, true);
    setTimeout(fn, 0); // out of the event handler
  };
  for (const ev of evs) addEventListener(ev, go, { capture: true, passive: true, once: true });
  if (typeof requestIdleCallback === 'function') requestIdleCallback(go, { timeout: 2000 });
  else setTimeout(go, 500);
}

function dispose(c: WorldController) {
  try { c.dispose(); } catch (e) { console.warn('world: dispose failed', e); }
}

