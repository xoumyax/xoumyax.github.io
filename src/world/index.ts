// The world engine: mounts the Big Bend diorama on a canvas and returns a controller.
//
// URL contract (read by boot.ts on `/` and by `/world-test`, which pass it in as options):
//   ?u=0..1 (jumpJourney)  ?t=<sec> (freeze the clock)  ?debug=1  ?tier=high|medium|low  ?governor=off
// With debug, window.__world = { journey, frames, figures } is updated every frame;
// figures is { soumya, jen, horse }, each { x, y, z } in world units (feet / hooves). With debug and perf, whole-frame GPU ms go to __world.gpu.
// With debug, __world.memory is three's live renderer.info.memory, and __world.disposeAudit holds the
// geometry / texture counts left just before renderer.dispose() (0 / 0 when everything was released).
//
// Lifecycle: the loop pauses itself while the tab is hidden and resumes when it is shown again (unless
// the caller paused it). After a 'low-fps' or 'context-lost' onLost, the caller should call dispose().
// dispose() releases every GPU resource and the context itself; a remount needs a fresh canvas.
// Aborting `signal` during the mount cancels the bake, stops the build at the next await, releases
// everything, and rejects the mount. Once the mount has resolved the signal is ignored: dispose().
import * as THREE from 'three';
import type { LandmarkId, StopId } from '../lib/schema';
import { journeyS, roadAt, STOP_U, type BakeResult, type LandmarkKey, type StopKey } from './bake';
import { bakeOffThread } from './bake-client';
import { TIERS, createGovernor, type QualityTier } from './quality';
import { BASE_PITCH, VIEW_LIMITS } from './journey-math';
import { ignoreResize } from './viewport';
import { buildAtlas, createAsciiMaterial } from './render/ascii';
import { createTiltMaterial, tiltRadius } from './render/tilt';
import { buildSky } from './scene/sky';
import { buildTerrain, buildScrub } from './scene/terrain';
import { buildRiver } from './scene/river';
import { buildRoadside, road } from './scene/road';
import { addFigures } from './scene/figures';
import { addLife } from './scene/life';
import { buildProps } from './scene/props';
import { buildBackdrop, BASE_NDC } from './scene/backdrop';

export type { QualityTier } from './quality';

export interface WorldController {
  setJourney(p: number): void; jumpJourney(p: number): void;
  orbit(dYawDeg: number, dPitchDeg: number): void; zoom(factor: number): void; resetView(): void;
  /**
   * Each landmark's anchor on screen (CSS px) for the current journey, view and clock. Pass `into`
   * to reuse a result object (the door loop does, every frame); without it a fresh object is returned.
   */
  landmarkScreenPositions(into?: LandmarkPositions): LandmarkPositions;
  journeyForStop(id: 'srm' | 'cognizant' | 'ms' | 'phd' | 'now' | 'river'): number; // u of each stop on the road
  readonly tier: QualityTier; pause(): void; resume(): void; dispose(): void;
}

export type LandmarkPositions = Record<LandmarkId, { x: number; y: number; visible: boolean }>;
/** Which landmark each stop frames (journey.yaml's `landmark`; the river frames none). */
export type StopLandmarks = Partial<Record<StopId, LandmarkId>>;

export interface MountOptions {
  tier: QualityTier;
  onLost(reason: string): void;
  /** journey.yaml's stop → landmark map (the single source; boot reads it from the stop sections). */
  stopLandmarks: StopLandmarks;
  /** Abort the mount (boot's timeout, or the poster taking over): see the lifecycle note above. */
  signal?: AbortSignal;
  debug?: boolean;
  /** Frame-rate governor (demote-only). Default on; `?governor=off` turns it off. */
  governor?: boolean;
  /** Freeze the ambient clock at this time in seconds (`?t=`). */
  freezeAt?: number | null;
  /** With debug: time every frame on the GPU (EXT_disjoint_timer_query_webgl2) into __world.gpu. */
  perf?: boolean;
}

interface DebugState {
  journey: number; frames: number; figures: Record<string, { x: number; y: number; z: number }>;
  gpu?: number[]; tier?: QualityTier;
  memory?: { geometries: number; textures: number };
  disposeAudit?: { geometries: number; textures: number };
  /** Screen extent (CSS px) of each landmark's geometry, refreshed by landmarkScreenPositions(). */
  footprints?: Record<string, { x0: number; y0: number; x1: number; y1: number }>;
  /** The walkers' walk frame (−1 standing), the journey u of the stop their walk is anchored to, their opacity. */
  walk?: { frame: number; anchor: number; alpha: number };
  /** The walkers' sprite feet on screen (CSS px) and whether they were drawn this frame. */
  sprites?: Record<'soumya' | 'jen', { x: number; y: number; shown: boolean }>;
  /** The eased view offsets (degrees, zoom factor) the last frame drew with. */
  view?: { yaw: number; pitch: number; zoom: number };
  /** Resizes the engine applied, and height-only ones it ignored (coarse pointers, I6). */
  resizes?: { applied: number; ignored: number };
}
declare global { interface Window { __world?: DebugState } }

const SEED = 23;
const BASE_YAW = -3, DIST = 76;
/**
 * Desktop: the current stop's landmark sits this fraction of the width right of centre (stop panels sit
 * left). Done with a horizontal lens shift, so the view still pivots on the landmark itself and the
 * camera's slow sway leaves it in place (in the sharp middle band).
 */
const DESK_SHIFT = 0.16;
/** Phone: how far the view pulls from the road toward the current stop's landmark (1 = centred on it). */
const PHONE_PULL = 0.85;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const ease = (cur: number, target: number, dt: number, half: number) => target + (cur - target) * Math.pow(0.5, dt / half);
const sstep = (x: number) => x * x * (3 - 2 * x);

const STOP_ORDER: StopKey[] = ['srm', 'cognizant', 'ms', 'phd', 'now', 'river'];

export async function mountWorld(canvas: HTMLCanvasElement, o: MountOptions): Promise<WorldController> {
  if (o.signal?.aborted) throw new DOMException('world: mount aborted', 'AbortError');
  let tierName: QualityTier = o.tier;
  let tier = TIERS[tierName];
  const freezeAt = o.freezeAt ?? null;
  const useGovernor = o.governor !== false;

  // Loop and lifecycle state, declared before anything that can fail or await (M1, M2).
  let raf = 0, running = false, disposed = false, lost = false, userPaused = false, hiddenPaused = false;
  let clock = freezeAt ?? 0, last = performance.now(), frames = 0;
  /** GPU and DOM releases, run in reverse on dispose or on a failed mount. */
  const releases: Array<() => void> = [];
  const bakeJob = { cancel() {} };
  let dbg: DebugState | null = null;
  let loopFrame: ((now: number) => void) | null = null;
  /** Wipes the sprite overlay; set once the figures exist (M3: a lost context leaves no stale sprites). */
  let clearSprites: (() => void) | null = null;
  function start() { if (running || disposed || lost || !loopFrame) return; running = true; last = performance.now(); raf = requestAnimationFrame(loopFrame); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  // M1: listen for a context loss from the start, so a loss during the awaits still reaches onLost
  const onLost = (e: Event) => { e.preventDefault(); lost = true; stop(); clearSprites?.(); o.onLost('context-lost'); };
  canvas.addEventListener('webglcontextlost', onLost);
  // I8: an abort cancels the bake and releases everything at once, except during compileAsync,
  // which cannot be cancelled and polls the renderer: the check right after it tears down.
  let aborted = false, compiling = false;
  const onAbort = () => {
    if (disposed) return;
    aborted = true;
    bakeJob.cancel();
    if (!compiling) teardown();
  };
  o.signal?.addEventListener('abort', onAbort, { once: true });

  function teardown() {
    disposed = true; stop();
    bakeJob.cancel();
    o.signal?.removeEventListener('abort', onAbort);
    canvas.removeEventListener('webglcontextlost', onLost);
    for (let i = releases.length - 1; i >= 0; i--) { try { releases[i](); } catch (err) { console.warn('world: release failed', err); } }
    releases.length = 0;
    if (dbg) dbg.disposeAudit = { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
    renderer.dispose();
    renderer.forceContextLoss();
    if (dbg && window.__world === dbg) delete window.__world;
  }

  try {
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    const gl = renderer.getContext() as WebGL2RenderingContext; // three r187 is WebGL2-only
    const time = { value: freezeAt ?? 0 };

    performance.mark('world:start');
    const atlasP = buildAtlas();
    // the atlas is released however the mount ends, even when an abort or a failed bake has already
    // torn down while it was still building
    atlasP.then((a) => { if (disposed) a.dispose(); else releases.push(() => a.dispose()); }, () => {});
    const [B, atlas] = await Promise.all([bakeOffThread({ scrubCount: tier.scrubCount, seed: SEED }, { job: bakeJob }), atlasP]) as [BakeResult, THREE.CanvasTexture];
    performance.mark('world:baked');
    if (disposed) throw new Error('world: disposed during mount');

    // ---- scene
    const scene = new THREE.Scene();
    releases.push(() => disposeScene(scene));
    const sky = buildSky(scene, tier.shadowMap);
    releases.push(() => sky.sun.shadow.dispose());
    scene.add(buildTerrain(B, time, Math.min(8, renderer.capabilities.getMaxAnisotropy())));
    const scrub = buildScrub(scene, B, time);
    scene.add(buildRiver(B, time));
    buildRoadside(scene);
    const props = buildProps(scene);
    const backdrop = buildBackdrop(scene, time);
    const life = addLife(scene);
    // the walkers are glyph sprites on a 2D overlay canvas beside this one (see scene/figures.ts)
    const figures = addFigures(scene, road, { canvas, baseYawDeg: BASE_YAW });
    releases.push(() => { clearSprites = null; figures.dispose(); });
    clearSprites = figures.clear;
    performance.mark('world:built');
    /** Per-frame tickers (the walkers also need journey u: they tick in draw()). */
    const tickers: Array<(t: number) => void> = [props.tick, life.tick];

    // ---- passes
    const camera = new THREE.PerspectiveCamera(20, 1, 5, 420);
    const ascii = createAsciiMaterial(atlas, time), tilt = createTiltMaterial();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ascii); quad.frustumCulled = false;
    releases.push(() => { quad.geometry.dispose(); ascii.dispose(); tilt.dispose(); });
    const post = new THREE.Scene(); post.add(quad);
    const postCam = new THREE.Camera();
    let rt: THREE.WebGLRenderTarget | null = null, art: THREE.WebGLRenderTarget | null = null;
    releases.push(() => { rt?.dispose(); art?.dispose(); rt = art = null; });
    let cssW = 1, cssH = 1, phone = false, across = 40;
    /** Set after the first frame: from then on a resize while paused redraws at once (M1). */
    let drawn = false;
    /** M6: the camera needs placing before a projection (a jump or a resize since the last frame). */
    let camDirty = true;
    function resize() {
      camDirty = true;
      cssW = Math.max(1, canvas.clientWidth || innerWidth); cssH = Math.max(1, canvas.clientHeight || innerHeight);
      phone = cssW < 700;
      const dpr = Math.min(devicePixelRatio || 1, tier.dprCap);
      renderer.setPixelRatio(dpr); renderer.setSize(cssW, cssH, false);
      const bw = Math.round(cssW * dpr), bh = Math.round(cssH * dpr);
      const sw = Math.max(64, Math.round(bw * tier.renderScale)), sh = Math.max(64, Math.round(bh * tier.renderScale));
      rt?.dispose(); art?.dispose();
      rt = new THREE.WebGLRenderTarget(sw, sh, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
      art = new THREE.WebGLRenderTarget(bw, bh, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
      const cell = phone ? tier.cellPxPhone : tier.cellPx;
      ascii.uniforms.uScene.value = rt.texture; ascii.uniforms.uGrid.value.set(Math.round(cssW / cell), Math.round(cssH / (cell * 2)));
      tilt.uniforms.uA.value = art.texture; tilt.uniforms.uRes.value.set(bw, bh); tilt.uniforms.uR.value = tiltRadius(bh);
      figures.layout({ cssW, cssH, cols: ascii.uniforms.uGrid.value.x, rows: ascii.uniforms.uGrid.value.y, dpr, phone });
      // keep the miniature's scale: a fixed number of world units across the width at the target
      across = clamp(cssW / 36, 18, 40);
      camera.aspect = cssW / cssH;
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(Math.atan(across / 2 / DIST)) / camera.aspect));
      camera.updateProjectionMatrix();
      frameStops();
      // resizing cleared both canvases: while the loop is paused nothing else would redraw them
      if (drawn && !running && !lost && !disposed) draw(clock);
    }

    // ---- framing: at each stop, where the view target sits relative to the road point (x, y, z), and
    // the desktop lens shift. The target is the centre of the stop landmark's whole geometry (its bounding
    // box), so the building sits in the sharp middle band, not with its roof up in the top blur; on
    // desktop a lens shift (not a moved target) puts it right of centre, so the sway pivots on it.
    const lmBox = new THREE.Vector3();
    const stopFrame = STOP_ORDER.map((stop) => {
      const id = o.stopLandmarks[stop] as LandmarkKey | undefined;
      const r = roadAt(journeyS(STOP_U[stop])), c = id && props.boxes[id] ? props.boxes[id].getCenter(lmBox) : null;
      return { u: STOP_U[stop], rx: r.x, ry: r.y + 0.6, rz: r.z, lx: c ? c.x : r.x, ly: c ? c.y : r.y + 0.6, lz: c ? c.z : r.z, has: !!c, ox: 0, oy: 0, oz: 0, sh: 0 };
    });
    function frameStops() {
      for (const f of stopFrame) {
        if (!f.has) { f.ox = f.oy = f.oz = f.sh = 0; continue; }
        // desktop: on the landmark, lens-shifted right of centre; phone: most of the way to it, centred
        const k = phone ? PHONE_PULL : 1;
        f.ox = k * (f.lx - f.rx); f.oy = k * (f.ly - f.ry); f.oz = k * (f.lz - f.rz);
        f.sh = phone ? 0 : DESK_SHIFT;
      }
    }
    const frameOff = { x: 0, y: 0, z: 0, sh: 0 };
    function frameOffset(uu: number) {
      let i = 0;
      while (i < stopFrame.length - 2 && uu > stopFrame[i + 1].u) i++;
      const a = stopFrame[i], b = stopFrame[i + 1], k = sstep(clamp((uu - a.u) / (b.u - a.u), 0, 1));
      frameOff.x = a.ox + (b.ox - a.ox) * k; frameOff.y = a.oy + (b.oy - a.oy) * k; frameOff.z = a.oz + (b.oz - a.oz) * k;
      frameOff.sh = a.sh + (b.sh - a.sh) * k;
      return frameOff;
    }

    resize();
    // I6: on a phone the URL bar showing or hiding changes the viewport's height by ~60–110 px; the
    // layer is sized in lvh so the canvas should not change, but where it does, a height-only change
    // under 120 px on a coarse pointer is not worth reallocating both targets and re-framing for.
    // Width changes, larger ones, and DPR changes (onDpr, below) always resize.
    const coarse = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : null;
    const resizes = { applied: 0, ignored: 0 };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
      const next = { w: Math.max(1, canvas.clientWidth || innerWidth), h: Math.max(1, canvas.clientHeight || innerHeight) };
      if (ignoreResize({ w: cssW, h: cssH }, next, !!coarse?.matches)) { resizes.ignored++; return; }
      resizes.applied++;
      resize();
    }) : null;
    ro?.observe(canvas);
    releases.push(() => ro?.disconnect());
    // I3: a devicePixelRatio change (another monitor, browser zoom) leaves the CSS size alone, so no
    // ResizeObserver fires: watch the resolution and re-arm the query for the new ratio each time
    let dprQuery: MediaQueryList | null = null;
    const onDpr = () => { armDpr(); resize(); };
    function armDpr() {
      dprQuery?.removeEventListener('change', onDpr);
      dprQuery = typeof matchMedia === 'function' ? matchMedia(`(resolution: ${devicePixelRatio || 1}dppx)`) : null;
      dprQuery?.addEventListener('change', onDpr);
    }
    armDpr();
    releases.push(() => { dprQuery?.removeEventListener('change', onDpr); dprQuery = null; });

    // ---- journey and view
    let u = 0, uTarget = 0;
    /** A jump moves the walkers to the new stop at once (eased travel moves them out of view, or fades them). */
    let snapWalk = true;
    /** Real seconds since the last frame (0 for a redraw outside the loop): drives the walkers' fades. */
    let frameDt = 0;
    const view = { yaw: 0, pitch: 0, zoom: 1 }, viewTarget = { yaw: 0, pitch: 0, zoom: 1 };
    const target = new THREE.Vector3();
    function placeCamera(t: number) {
      // near the end the view looks back up the road a little, so the river fills the bottom band
      const back = 7 * Math.max(0, Math.min(1, (u - 0.82) / 0.18)) ** 2;
      const p = roadAt(journeyS(u) - back), off = frameOffset(u);
      target.set(p.x + off.x, p.y + 0.6 + off.y, p.z + off.z);
      const sway = Math.sin((t * Math.PI * 2) / 32);
      const yaw = BASE_YAW + 4 * sway + view.yaw;
      const pitch = clamp(BASE_PITCH + 0.8 * Math.sin(t * 0.13) + view.pitch, VIEW_LIMITS.pitch[0], VIEW_LIMITS.pitch[1]);
      const az = THREE.MathUtils.degToRad(yaw), el = THREE.MathUtils.degToRad(pitch), R = DIST / view.zoom;
      camera.position.set(target.x + Math.sin(az) * Math.cos(el) * R, target.y + Math.sin(el) * R, target.z + Math.cos(az) * Math.cos(el) * R);
      camera.lookAt(target); camera.updateMatrixWorld();
      // the desktop lens shift: NDC x of everything moves right by 2·sh (projection element 8; resize()
      // rebuilds the matrix with 0 there)
      const pe = camera.projectionMatrix.elements;
      if (pe[8] !== -2 * off.sh) { pe[8] = -2 * off.sh; camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert(); }
      sky.follow(target);
      // the ridge slides against travel and turns like a distant range
      const k = 32 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      backdrop.update(camera, target.x * 0.25 - az * k);
      camDirty = false;
    }

    // ---- landmarks
    const anchors = props.anchors, v = new THREE.Vector3();
    const lmIds = Object.keys(anchors) as LandmarkId[];
    function landmarkScreenPositions(into?: LandmarkPositions): LandmarkPositions {
      // M4: project with the camera for the current journey and clock, not a stale one. M6: the
      // frame that just drew placed it already (the door loop runs right after it): no second placing.
      if (camDirty) placeCamera(clock);
      const out = into ?? ({} as LandmarkPositions);
      for (const id of lmIds) {
        v.copy(anchors[id]).project(camera);
        const x = (v.x * 0.5 + 0.5) * cssW, y = (-v.y * 0.5 + 0.5) * cssH;
        // behind the camera, off screen, or up under the backdrop card: not visible
        const visible = v.z < 1 && v.y < BASE_NDC && x >= 0 && x <= cssW && y >= 0 && y <= cssH;
        const p = out[id];
        if (p) { p.x = x; p.y = y; p.visible = visible; } else out[id] = { x, y, visible };
        if (dbg) footprint(id);
      }
      return out;
    }
    /** Debug: the screen extent (CSS px) of a landmark's geometry (every vertex), for the framing tests. */
    function footprint(id: LandmarkId) {
      const P = props.points[id], F = (dbg!.footprints ??= {});
      const r = (F[id] ??= { x0: 0, y0: 0, x1: 0, y1: 0 });
      r.x0 = r.y0 = Infinity; r.x1 = r.y1 = -Infinity;
      for (let k = 0; k < P.length; k += 3) {
        v.set(P[k], P[k + 1], P[k + 2]).project(camera);
        const x = (v.x * 0.5 + 0.5) * cssW, y = (-v.y * 0.5 + 0.5) * cssH;
        r.x0 = Math.min(r.x0, x); r.x1 = Math.max(r.x1, x); r.y0 = Math.min(r.y0, y); r.y1 = Math.max(r.y1, y);
      }
    }

    // ---- debug and perf
    dbg = o.debug ? {
      journey: 0, frames: 0, tier: tierName, memory: renderer.info.memory,
      figures: { soumya: { x: 0, y: 0, z: 0 }, jen: { x: 0, y: 0, z: 0 }, horse: { x: 0, y: 0, z: 0 } },
      walk: { frame: -1, anchor: -1, alpha: 1 }, sprites: figures.screen, view, resizes,
    } : null;
    if (dbg) window.__world = dbg;
    const tq = o.debug && o.perf ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null;
    const pending: WebGLQuery[] = [];
    if (dbg && tq) dbg.gpu = [];
    releases.push(() => { for (const q of pending) gl.deleteQuery(q); pending.length = 0; });

    function draw(t: number) {
      time.value = t;
      placeCamera(t);
      for (let i = 0; i < tickers.length; i++) tickers[i](t);
      figures.tick(t, u, camera, snapWalk, frameDt); snapWalk = false; frameDt = 0;
      renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, camera);
      quad.material = ascii; renderer.setRenderTarget(art); renderer.render(post, postCam);
      quad.material = tilt; renderer.setRenderTarget(null); renderer.render(post, postCam);
      figures.draw(camera, life.horse);
      if (dbg) {
        const F = dbg.figures;
        F.soumya.x = figures.soumya.x; F.soumya.y = figures.soumya.y; F.soumya.z = figures.soumya.z;
        F.jen.x = figures.jen.x; F.jen.y = figures.jen.y; F.jen.z = figures.jen.z;
        F.horse.x = life.horse.pos.x; F.horse.y = life.horse.pos.y; F.horse.z = life.horse.pos.z;
        dbg.walk!.frame = figures.frame; dbg.walk!.anchor = figures.anchor; dbg.walk!.alpha = figures.alpha;
      }
    }

    // compile off the critical path where the browser can (KHR_parallel_shader_compile), then a first frame
    renderer.setRenderTarget(rt);
    compiling = true;
    try { await renderer.compileAsync(scene, camera); } finally { compiling = false; }
    if (disposed || aborted) throw new DOMException('world: mount aborted', 'AbortError');
    renderer.setRenderTarget(null);
    performance.mark('world:compiled');
    if (!lost) { draw(time.value); gl.flush(); drawn = true; }
    performance.mark('world:first-frame');

    // ---- loop
    // I4: the governor runs on elapsed render time (see quality.ts): a 10 fps phone reaches the
    // poster in under 6 s, a capped 30 Hz device never demotes
    const gov = createGovernor(tierName);
    loopFrame = function frame(now: number) {
      raf = requestAnimationFrame(frame);
      const dtMs = now - last, dt = Math.min(0.1, dtMs / 1000); last = now;
      if (freezeAt === null) clock += dt;
      u = freezeAt !== null ? uTarget : ease(u, uTarget, dt, 0.35);
      frameDt = dt;
      view.yaw = ease(view.yaw, viewTarget.yaw, dt, 0.18); view.pitch = ease(view.pitch, viewTarget.pitch, dt, 0.18); view.zoom = ease(view.zoom, viewTarget.zoom, dt, 0.18);
      let q: WebGLQuery | null = null;
      if (tq) { q = gl.createQuery(); if (q) gl.beginQuery(tq.TIME_ELAPSED_EXT, q); }
      draw(clock);
      if (tq && q) { gl.endQuery(tq.TIME_ELAPSED_EXT); pending.push(q); pollGpu(); }
      frames++;
      if (dbg) { dbg.journey = u; dbg.frames = frames; dbg.tier = tierName; }
      if (useGovernor && dtMs > 0 && !document.hidden) govern(dtMs);
    };
    function pollGpu() {
      if (!tq) return;
      while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
        const q = pending.shift()!;
        if (!gl.getParameter(tq.GPU_DISJOINT_EXT)) dbg?.gpu?.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
        gl.deleteQuery(q);
      }
    }
    function govern(frameMs: number) {
      const verdict = gov.frame(frameMs);
      if (!verdict) return;
      if (verdict === 'fallback') { stop(); o.onLost('low-fps'); return; }
      tierName = verdict; tier = TIERS[verdict];
      sky.setShadowMap(tier.shadowMap);
      scrub.setFraction(tier.scrubCount / scrub.count);
      resize();
    }

    // M6: pause while the tab is hidden; on show, resume with a fresh dt (unless the caller paused)
    const onVisibility = () => {
      if (document.hidden) { if (running) { hiddenPaused = true; stop(); } }
      else if (hiddenPaused) { hiddenPaused = false; if (!userPaused) start(); }
    };
    document.addEventListener('visibilitychange', onVisibility);
    releases.push(() => document.removeEventListener('visibilitychange', onVisibility));
    if (document.hidden) hiddenPaused = true; else start();

    const ctl: WorldController = {
      setJourney(p) { uTarget = clamp(p, 0, 1); },
      jumpJourney(p) { uTarget = u = clamp(p, 0, 1); snapWalk = true; camDirty = true; },
      orbit(dYaw, dPitch) {
        const L = VIEW_LIMITS;
        viewTarget.yaw = clamp(viewTarget.yaw + dYaw, L.yaw[0], L.yaw[1]);
        viewTarget.pitch = clamp(viewTarget.pitch + dPitch, L.pitch[0] - BASE_PITCH, L.pitch[1] - BASE_PITCH);
      },
      zoom(f) { viewTarget.zoom = clamp(viewTarget.zoom * f, VIEW_LIMITS.zoom[0], VIEW_LIMITS.zoom[1]); },
      resetView() { viewTarget.yaw = 0; viewTarget.pitch = 0; viewTarget.zoom = 1; },
      landmarkScreenPositions,
      journeyForStop: (id: StopKey) => STOP_U[id],
      get tier() { return tierName; },
      pause() { userPaused = true; hiddenPaused = false; stop(); },
      resume() { userPaused = false; if (document.hidden) hiddenPaused = true; else start(); },
      dispose() { if (!disposed) teardown(); },
    };
    // mounted: from here the caller owns the controller and disposes it
    o.signal?.removeEventListener('abort', onAbort);
    return ctl;
  } catch (err) {
    // M2: a failed mount releases everything it built; the caller has no controller to dispose
    if (!disposed) teardown();
    throw err;
  }
}

/** Release every geometry, material, texture and instance buffer in a scene. */
function disposeScene(scene: THREE.Scene) {
  scene.traverse((ob) => {
    if (ob instanceof THREE.InstancedMesh) ob.dispose();
    for (const t of (ob.userData.textures as THREE.Texture[] | undefined) ?? []) t.dispose();
    const m = ob as THREE.Mesh;
    m.geometry?.dispose();
    for (const mat of ([] as THREE.Material[]).concat(m.material ?? [])) {
      for (const val of Object.values(mat)) if (val instanceof THREE.Texture) val.dispose();
      for (const un of Object.values((mat as THREE.ShaderMaterial).uniforms ?? {})) if (un?.value instanceof THREE.Texture) un.value.dispose();
      mat.dispose();
    }
  });
}
