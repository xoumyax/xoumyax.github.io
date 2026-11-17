// Soumya and Jen: two walkers on the road, drawn as hand-made glyph sprites on a 2D overlay canvas.
// At world scale a 3D figure is a stack of four glyphs (Phase 0 spike), so the couple gets its own
// treatment: sprites in the site's monospace font, slightly larger than world scale like map icons,
// snapped to the glyph grid of the ASCII pass at each figure's projected road position.
//
// They walk the road together, ping-ponging over ±WALK_SPAN of journey u around a point just past the
// stop nearest the camera (walkAnchor), and face their direction of travel. The walk is anchored to the
// stop, not to the camera, so they stay put in the world while the page scrolls (no sliding). When the
// nearest stop changes, they move to it only while they are out of view (off screen or under the
// backdrop card), and fade in at the new spot. If they are still in view once the camera has arrived at
// the new stop, they fade out where they are first. A jump (jumpJourney) moves them at once. (The sprites
// are drawn over the tilt blur, so a jump in the bottom blur band would show: that band does not count
// as out of view.) Fades run on real frame time, so they also finish under a frozen clock (?t=).
//
// The overlay is a sibling of the WebGL canvas (fallbacks hide `canvas[data-world-sprites]` with it).
// It mirrors the canvas's box (checked every frame with four scalar reads), its positioning scheme,
// z-index and visibility (a MutationObserver on the canvas), so it always sits exactly on it.
// Nothing here allocates per frame.
import * as THREE from 'three';
import { MONO_FONT } from '../render/ascii';
import { BASE_NDC } from './backdrop';
import { DESKTOP, HORSE_DESKTOP, HORSE_PALETTE, HORSE_PHONE, PHONE, PALETTE, mirror, type HorseSet, type Sprite, type SpriteSet } from './figure-art';
import { COUPLE_GAP, WALK_SPAN, newWalkPose, poseFrame, walkAnchor, walkCentre, walkInto } from './figure-motion';
import type { HorseState } from './life';
import type { road as Road } from './road';

/** The ASCII pass's grid, in CSS px: `cols` × `rows` cells over `cssW` × `cssH`. */
export interface GlyphGrid { cssW: number; cssH: number; cols: number; rows: number; dpr: number; phone: boolean }
/** A walker's sprite feet on screen (CSS px) and whether it was drawn in the last frame. */
export interface SpriteSpot { x: number; y: number; shown: boolean }

type Facing = 1 | -1;
interface Prepared { right: Sprite; left: Sprite }
const prep = (s: Sprite): Prepared => ({ right: s, left: mirror(s) });
const prepSet = (s: SpriteSet) => ({ stand: prep(s.stand), walk: s.walk.map(prep) });
const SETS = {
  desktop: { soumya: prepSet(DESKTOP.soumya), jen: prepSet(DESKTOP.jen) },
  phone: { soumya: prepSet(PHONE.soumya), jen: prepSet(PHONE.jen) },
};
type PreparedSet = ReturnType<typeof prepSet>;
const prepHorse = (h: HorseSet) => ({ walk: h.walk.map(prep), graze: h.graze.map(prep) });
const HORSES = { desktop: prepHorse(HORSE_DESKTOP), phone: prepHorse(HORSE_PHONE) };
type Palette = Record<string, { fg: string; bg: string }>;

/** Backing cell alpha: dark enough that the sprite reads over bright ground, faint enough to sit in the world. */
const BG_ALPHA = 0.94;
/** Seconds for the walkers to fade out or in when they move to another stop. */
const FADE_S = 0.45;
/** Journey-u step for the walkers' screen direction along the road. */
const DU = 0.002;
/** Device-pixel edge of glyph cell `i` for a cell size of `k` device px. */
const edge = (i: number, k: number) => Math.round(i * k);

export function addFigures(_scene: THREE.Scene, road: typeof Road, o: { canvas: HTMLCanvasElement; baseYawDeg: number }) {
  const soumya = new THREE.Vector3(), jen = new THREE.Vector3();
  const centre = new THREE.Vector3(), ahead = new THREE.Vector3(), tangent = new THREE.Vector3();
  const pose = newWalkPose();
  let facing: Facing = 1, frame = -1, uWalk = 0;
  /** Journey u of the stop the walk is anchored to (−1 until the first tick). */
  let anchor = -1;
  /** The walkers' opacity, and where it is heading: −1 fading out (then move), +1 fading in, 0 steady. */
  let alpha = 1, fading: -1 | 0 | 1 = 0;

  // camera-right on the ground at the base yaw: the couple walks side by side across the screen
  const az = THREE.MathUtils.degToRad(o.baseYawDeg), side = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az));

  // ---- the overlay: a sibling of the WebGL canvas, on top of it, never catching the pointer
  const cv = o.canvas;
  const ov = document.createElement('canvas');
  ov.dataset.worldSprites = '';
  ov.setAttribute('aria-hidden', 'true');
  ov.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;margin:0;padding:0;border:0';
  cv.after(ov);
  const ctx = ov.getContext('2d')!;
  let grid: GlyphGrid = { cssW: 1, cssH: 1, cols: 1, rows: 1, dpr: 1, phone: false };
  let font = '';
  /** Device-pixel rects drawn last frame, cleared before the next one. */
  const dirty: number[] = [];
  /** The canvas box last mirrored (offset from the shared containing block, client size). */
  let bl = NaN, bt = NaN, bw = NaN, bh = NaN;

  /**
   * Mirror the canvas's positioning scheme, stacking and visibility (on a style / class / hidden change
   * of the canvas, or any attribute change on <html>, where page states like data-world live). Only a
   * hidden canvas writes anything inline; a shown one clears it, so page rules and the `hidden`
   * attribute that hide the overlay directly (the poster fallback does) still apply.
   */
  function mirrorStyle() {
    const cs = getComputedStyle(cv);
    ov.style.position = cs.position === 'fixed' ? 'fixed' : 'absolute';
    ov.style.zIndex = cs.zIndex === 'auto' ? '' : cs.zIndex;
    ov.style.visibility = cs.visibility === 'visible' ? '' : cs.visibility;
    ov.style.display = cv.hidden || cs.display === 'none' ? 'none' : '';
    bl = NaN; // re-place on the next check
  }
  const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(mirrorStyle) : null;
  mo?.observe(cv, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
  mo?.observe(document.documentElement, { attributes: true });
  mirrorStyle();

  /** Follow the canvas's box: four scalar reads (no allocation); writes only when it moved or resized. */
  function followBox() {
    const l = cv.offsetLeft, t = cv.offsetTop, w = cv.clientWidth, h = cv.clientHeight;
    if (l === bl && t === bt && w === bw && h === bh) return;
    bl = l; bt = t; bw = w; bh = h;
    // the canvas has no border or padding here, so its client box is its border box
    ov.style.left = `${l + cv.clientLeft}px`; ov.style.top = `${t + cv.clientTop}px`;
    ov.style.width = `${w}px`; ov.style.height = `${h}px`;
  }

  function layout(g: GlyphGrid) {
    grid = g;
    ov.width = Math.round(g.cssW * g.dpr); ov.height = Math.round(g.cssH * g.dpr);
    const ch = g.cssH / g.rows;
    font = `700 ${(ch * 0.83 * g.dpr).toFixed(2)}px ${MONO_FONT}`;
    dirty.length = 0;
    bl = NaN;
    followBox();
  }

  // off screen, behind the camera, or up under the backdrop card (the top blur band): hidden
  const shown = (n: THREE.Vector3) => n.z < 1 && n.y < BASE_NDC && n.y > -1 && n.x > -1 && n.x < 1;
  const sx = (n: THREE.Vector3) => (n.x * 0.5 + 0.5) * grid.cssW, sy = (n: THREE.Vector3) => (-n.y * 0.5 + 0.5) * grid.cssH;
  const nS = new THREE.Vector3(), nJ = new THREE.Vector3(), nH = new THREE.Vector3(), v = new THREE.Vector3(), v2 = new THREE.Vector3(), dirH = new THREE.Vector3();
  /** In view: the sprite would be drawn (on screen, below the backdrop card). */
  const inView = (p: THREE.Vector3, camera: THREE.Camera) => shown(v.copy(p).project(camera));

  /**
   * Place the couple for clock t with the camera at journey u. `snap` (a jump, or the first frame) moves
   * the walk to the nearest stop at once; otherwise they move only out of view, or after fading out once
   * the camera has arrived. `dt` is real frame time in seconds (for the fades).
   */
  function tick(t: number, u: number, camera: THREE.Camera, snap = false, dt = 0) {
    const want = walkAnchor(u);
    if (anchor < 0 || snap) { anchor = want; alpha = 1; fading = 0; }
    else if (want === anchor) { if (fading < 0) fading = 1; } // came back before they were gone
    else if (fading >= 0) {
      if (!inView(soumya, camera) && !inView(jen, camera)) { anchor = want; alpha = 0; fading = 1; dt = 0; } // arrive at 0
      else if (Math.abs(u - want) <= WALK_SPAN) fading = -1; // the camera is at the new stop: fade out here first
    }
    if (fading < 0 && (alpha -= dt / FADE_S) <= 0) { alpha = 0; anchor = want; fading = 1; }
    else if (fading > 0 && (alpha += dt / FADE_S) >= 1) { alpha = 1; fading = 0; }
    walkInto(t, pose);
    const c = walkCentre(anchor);
    uWalk = Math.min(1, Math.max(0, c + WALK_SPAN * pose.pos));
    road.curve.getPointAt(uWalk, centre);
    // the road's direction (toward the river) from two points, without three's allocating getTangentAt
    const ua = Math.min(1, uWalk + DU), ub = ua - DU;
    road.curve.getPointAt(ua, ahead); road.curve.getPointAt(ub, tangent);
    tangent.subVectors(ahead, tangent).normalize();
    soumya.copy(centre).addScaledVector(side, -COUPLE_GAP / 2);
    jen.copy(centre).addScaledVector(side, COUPLE_GAP / 2);
    facing = pose.facing;
    frame = poseFrame(pose);
  }

  const screen: Record<'soumya' | 'jen', SpriteSpot> = { soumya: { x: 0, y: 0, shown: false }, jen: { x: 0, y: 0, shown: false } };

  /** Draw the sprites for the current camera (after the WebGL frame, so both show the same moment). */
  function draw(camera: THREE.Camera, horse: HorseState) {
    followBox();
    clear();
    ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const phone = grid.phone;

    // the horse: walk frames while it moves, head down grazing (with a tail swish) while it stands
    nH.copy(horse.pos).project(camera);
    if (shown(nH)) {
      dirH.set(Math.sin(horse.heading), 0, Math.cos(horse.heading)).add(horse.pos).project(camera);
      const hs = phone ? HORSES.phone : HORSES.desktop;
      const pr = horse.speed > 0.3 ? hs.walk[Math.floor(horse.gait / Math.PI) & 1] : hs.graze[horse.swish];
      blit(dirH.x >= nH.x ? pr.right : pr.left, sx(nH), sy(nH), HORSE_PALETTE);
    }

    // which way is "along the road, the way they face" on screen?
    v.copy(soumya).project(camera); v2.copy(soumya).addScaledVector(tangent, facing).project(camera);
    const faceRight = v2.x >= v.x;
    const set = phone ? SETS.phone : SETS.desktop;
    nS.copy(soumya).project(camera); nJ.copy(jen).project(camera);
    // the lower one on screen is nearer the camera: draw it last
    if (nS.y >= nJ.y) { walker(nS, set.soumya, faceRight, screen.soumya); walker(nJ, set.jen, faceRight, screen.jen); }
    else { walker(nJ, set.jen, faceRight, screen.jen); walker(nS, set.soumya, faceRight, screen.soumya); }
  }

  function walker(n: THREE.Vector3, s: PreparedSet, faceRight: boolean, spot: SpriteSpot) {
    spot.x = sx(n); spot.y = sy(n); spot.shown = shown(n);
    if (!spot.shown || alpha <= 0) return;
    const pr = frame < 0 ? s.stand : s.walk[frame];
    blit(faceRight ? pr.right : pr.left, spot.x, spot.y, PALETTE, alpha);
  }

  /** Erase what the last frame drew. */
  function clear() {
    for (let i = 0; i < dirty.length; i += 4) ctx.clearRect(dirty[i], dirty[i + 1], dirty[i + 2], dirty[i + 3]);
    dirty.length = 0;
  }

  /** Draw a sprite with its feet's bottom-centre at CSS (x, y), snapped to the glyph grid. */
  function blit(s: Sprite, x: number, y: number, pal: Palette, a = 1) {
    const cw = grid.cssW / grid.cols, ch = grid.cssH / grid.rows, d = grid.dpr;
    const w = s.rows[0].length, h = s.rows.length;
    const c0 = Math.round(x / cw - w / 2), r0 = Math.floor(y / ch) - h + 1;
    // device-pixel cell edges (edge(c0 + c, cw·d)), so neighbouring backing cells meet without seams
    const kx = cw * d, ky = ch * d;
    ctx.globalAlpha = BG_ALPHA * a;
    for (let r = 0; r < h; r++) {
      const y0 = edge(r0 + r, ky), y1 = edge(r0 + r + 1, ky);
      for (let c = 0; c < w; c++) {
        const k = s.keys[r][c];
        if (k === ' ') continue;
        const x0 = edge(c0 + c, kx);
        ctx.fillStyle = pal[k].bg;
        ctx.fillRect(x0, y0, edge(c0 + c + 1, kx) - x0, y1 - y0);
      }
    }
    ctx.globalAlpha = a;
    for (let r = 0; r < h; r++) {
      const y0 = edge(r0 + r, ky), y1 = edge(r0 + r + 1, ky);
      for (let c = 0; c < w; c++) {
        const k = s.keys[r][c], g = s.rows[r][c];
        if (k === ' ' || g === ' ') continue;
        ctx.fillStyle = pal[k].fg;
        ctx.fillText(g, (edge(c0 + c, kx) + edge(c0 + c + 1, kx)) / 2, y0 + (y1 - y0) * 0.52);
      }
    }
    ctx.globalAlpha = 1;
    const X0 = edge(c0, kx), Y0 = edge(r0, ky);
    dirty.push(X0 - 2, Y0 - 2, edge(c0 + w, kx) - X0 + 4, edge(r0 + h, ky) - Y0 + 4);
  }

  return {
    /** World positions of the walkers' feet (live objects, updated by tick). */
    soumya, jen,
    /** The walkers' sprite feet on screen (live objects, updated by draw). */
    screen,
    get u() { return uWalk; },
    get frame() { return frame; },
    get anchor() { return anchor; },
    /** The walkers' opacity (1 but while they fade out of one stop and into the next). */
    get alpha() { return alpha; },
    tick, layout, draw,
    /** Wipe the overlay (after a context loss: the WebGL frame under it is gone). */
    clear() { clear(); ctx.clearRect(0, 0, ov.width, ov.height); },
    dispose() { mo?.disconnect(); ov.remove(); },
  };
}
