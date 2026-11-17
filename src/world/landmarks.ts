// Landmark doors: DOM links laid over the world's landmarks (spec §5.3), and the world bar.
//
// Over the live world the pins follow the engine's projected positions every frame; over the
// poster they come from the static table capture-poster.mjs writes to /world/landmarks.json.
// A pin shows only when it is on screen and clear of content (panels, card rows and the footer
// sit above the doors), so Tab never lands on something you cannot see (WCAG 2.4.11).
//
// The world bar (#world-ui) is a small fixed group in the bottom-right corner, above content:
// the + / − / reset view controls while the world runs, or, over the poster, an "Explore" list
// holding every door whose pin is not showing, so all five doors are always one Tab away.
// Its height is published as --world-ui-h; world.css turns that into scroll-padding-bottom (so
// focused content scrolls clear of it) and footer padding (so the last links are never under it).
import type { LandmarkId } from '../lib/schema';

/** Each landmark opens a section (spec §5.3). The stop → landmark mapping comes from journey.yaml via the DOM. */
export const DOORS: Record<LandmarkId, { route: string; section: string; place: string }> = {
  trailhead: { route: '/study/', section: 'Study', place: 'trailhead' },
  ranger: { route: '/resume/', section: 'Resume', place: 'ranger station' },
  school: { route: '/teaching/', section: 'Teaching', place: 'adobe schoolhouse' },
  trailer: { route: '/projects/', section: 'Projects', place: 'trailer camp' },
  dome: { route: '/personal/', section: 'Personal', place: 'geodesic dome' },
};
export const isLandmark = (s: unknown): s is LandmarkId => typeof s === 'string' && Object.hasOwn(DOORS, s);
export const doorName = (id: LandmarkId) => `${DOORS[id].section} — ${DOORS[id].place}`;

export interface ScreenPos { x: number; y: number; visible: boolean }
export type Positions = Partial<Record<LandmarkId, ScreenPos>>;

/** One capture in landmarks.json: x and y are fractions of the capture's CSS size. */
export interface PosterShot {
  width: number; height: number;
  /** The view the capture used (engine offsets in degrees, zoom factor). */
  framing?: { u: number; yaw: number; pitch: number; zoom: number };
  landmarks: Partial<Record<LandmarkId, ScreenPos>>;
}
/** `version`: a content hash of the two poster images (capture-poster.mjs), so a table is only used with its own poster. */
export interface PosterTable { source: string; version?: string; shots: { desktop: PosterShot; mobile?: PosterShot } }

/** Positions of the poster's landmarks inside a box the poster covers (`object-fit: cover`, centred). */
export function posterPositions(shot: PosterShot, boxW: number, boxH: number): Positions {
  const s = Math.max(boxW / shot.width, boxH / shot.height);
  const ox = (boxW - shot.width * s) / 2, oy = (boxH - shot.height * s) / 2;
  const out: Positions = {};
  for (const [id, p] of Object.entries(shot.landmarks) as [LandmarkId, ScreenPos][]) {
    out[id] = { x: ox + p.x * shot.width * s, y: oy + p.y * shot.height * s, visible: p.visible };
  }
  return out;
}

/**
 * Where focus goes when the focused door must hide: the next showing door after it (in journey
 * order, wrapping), else null (the caller then falls back to the world bar). Pure.
 */
export function nextShown(order: readonly LandmarkId[], shows: Partial<Record<LandmarkId, boolean>>, from: LandmarkId): LandmarkId | null {
  const i = order.indexOf(from);
  for (let k = 1; k < order.length; k++) {
    const id = order[(i + k) % order.length];
    if (shows[id]) return id;
  }
  return null;
}

/** Keep pins this far inside the viewport (and below the top bar). */
const EDGE = 16;
/** Past this far right, the tag opens to the left of the pin. */
const FLIP = 240;
/** The pin's radius (world.css: 22 px pin). */
const PIN_R = 11;
/**
 * A door's widest box, tag open (focus or hover): pin, gap, and the full name in the tag's mono
 * caps. An estimate on the safe side, so a door shows only when all of it is clear of content.
 */
export const doorWidth = (id: LandmarkId) => 2 * PIN_R + 8 + doorName(id).length * 7.6 + 24;

/** A box in viewport px. */
export interface Box { l: number; t: number; r: number; b: number }

/** The box a door at (x, y) takes, opening right of the pin, or left when flipped. */
export function doorBox(id: LandmarkId, x: number, y: number, flip: boolean): Box {
  const w = doorWidth(id);
  return flip ? { l: x + PIN_R - w, t: y - PIN_R, r: x + PIN_R, b: y + PIN_R } : { l: x - PIN_R, t: y - PIN_R, r: x - PIN_R + w, b: y + PIN_R };
}

export type Shows = Partial<Record<LandmarkId, boolean>>;

export interface Doors {
  readonly order: readonly LandmarkId[];
  readonly els: ReadonlyMap<LandmarkId, HTMLAnchorElement>;
  /**
   * Place the pins and return which show. `w`/`h` are the viewport's size, `top` the bottom of the
   * top bar, and `covered(box)` says a door's box would be under content. A focused pin that has to
   * hide first hands focus on: `handoff(id, shows)` returns where to (focused without scrolling).
   */
  place(pos: Positions, w: number, h: number, top: number, covered: (box: Box) => boolean,
    handoff: (id: LandmarkId, shows: Shows) => HTMLElement | null): Shows;
  hideAll(): void;
}

export function createDoors(box: HTMLElement, order: LandmarkId[]): Doors {
  const ids = [...new Set(order)];
  const els = new Map<LandmarkId, HTMLAnchorElement>();
  for (const id of ids) {
    const a = document.createElement('a');
    a.className = 'lm';
    a.href = DOORS[id].route;
    a.dataset.landmark = id;
    a.setAttribute('aria-label', doorName(id));
    a.hidden = true;
    const pin = document.createElement('span'); pin.className = 'lm-pin'; pin.setAttribute('aria-hidden', 'true');
    const tag = document.createElement('span'); tag.className = 'lm-tag'; tag.setAttribute('aria-hidden', 'true');
    const sec = document.createElement('span'); sec.className = 'lm-section'; sec.textContent = DOORS[id].section;
    const place = document.createElement('span'); place.className = 'lm-place'; place.textContent = ` — ${DOORS[id].place}`;
    tag.append(sec, place);
    a.append(pin, tag);
    box.append(a);
    els.set(id, a);
  }
  const last = new Map<LandmarkId, string>();
  return {
    order: ids,
    els,
    place(pos, w, h, top, covered, handoff) {
      const shows: Shows = {};
      for (const [id] of els) {
        const p = pos[id];
        shows[id] = !!p && p.visible && p.x >= EDGE && p.x <= w - EDGE && p.y >= top + EDGE && p.y <= h - EDGE
          && !covered(doorBox(id, p.x, p.y, p.x > w - FLIP));
      }
      let leaving: LandmarkId | null = null;
      for (const [id, el] of els) {
        const p = pos[id];
        if (shows[id] && p) {
          const flip = p.x > w - FLIP;
          const t = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)${flip ? ' translateX(-100%)' : ''}`;
          if (last.get(id) !== t) { el.style.transform = t; last.set(id, t); el.toggleAttribute('data-flip', flip); }
          if (el.hidden) el.hidden = false;
        } else if (!el.hidden) {
          if (el === document.activeElement) leaving = id;
          else el.hidden = true;
        }
      }
      // the focused pin hides last, after focus has moved on (no scroll, no lost focus)
      if (leaving) {
        handoff(leaving, shows)?.focus({ preventScroll: true });
        els.get(leaving)!.hidden = true;
      }
      return shows;
    },
    hideAll() { for (const el of els.values()) el.hidden = true; },
  };
}

export interface WorldBar {
  readonly el: HTMLElement;
  /** The bar's box in the viewport (it sits above the doors), or null while hidden. */
  box(): Box | null;
  readonly zoomIn: HTMLButtonElement;
  setMode(mode: 'off' | 'world' | 'poster'): void;
  /** Poster mode: list the doors whose pins are not showing. Returns a door's list link, for handoff. */
  syncExplore(shows: Shows): void;
  exploreLink(id: LandmarkId): HTMLAnchorElement | undefined;
}

export function createWorldBar(after: Element, order: readonly LandmarkId[], on: { zoomIn(): void; zoomOut(): void; reset(): void }): WorldBar {
  const bar = document.createElement('div');
  bar.id = 'world-ui';
  bar.hidden = true;

  const view = document.createElement('div');
  view.className = 'world-view';
  view.setAttribute('role', 'group');
  view.setAttribute('aria-label', 'World view');
  const mk = (label: string, glyph: string, fn: () => void) => {
    const b = document.createElement('button');
    b.type = 'button'; b.setAttribute('aria-label', label); b.title = label;
    b.innerHTML = `<span aria-hidden="true">${glyph}</span>`;
    b.addEventListener('click', fn);
    view.append(b);
    return b;
  };
  const zoomIn = mk('Zoom in', '+', on.zoomIn);
  mk('Zoom out', '−', on.zoomOut);
  mk('Reset view', '↺', on.reset);

  const explore = document.createElement('nav');
  explore.className = 'world-explore';
  explore.setAttribute('aria-label', 'Explore');
  const label = document.createElement('span');
  label.className = 'x-label'; label.setAttribute('aria-hidden', 'true'); label.textContent = 'Explore';
  explore.append(label);
  const links = new Map<LandmarkId, HTMLAnchorElement>();
  for (const id of order) {
    const a = document.createElement('a');
    a.className = 'lm-x';
    a.href = DOORS[id].route;
    a.dataset.landmark = id;
    a.setAttribute('aria-label', doorName(id));
    a.textContent = DOORS[id].section;
    a.hidden = true;
    explore.append(a);
    links.set(id, a);
  }
  bar.append(view, explore);
  after.after(bar);

  // The bar is fixed, so its box only changes with its own size or the viewport's: cache it here
  // (where layout is clean) rather than reading it every frame.
  let cached: Box | null = null;
  const publish = () => {
    const r = bar.getBoundingClientRect();
    cached = bar.hidden ? null : { l: r.left, t: r.top, r: r.right, b: r.bottom };
    document.documentElement.style.setProperty('--world-ui-h', bar.hidden ? '0px' : `${bar.offsetHeight}px`);
  };
  addEventListener('resize', publish);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(publish).observe(bar);

  return {
    el: bar,
    box: () => cached,
    zoomIn,
    setMode(mode) {
      view.hidden = mode !== 'world';
      explore.hidden = mode !== 'poster';
      bar.hidden = mode === 'off';
      publish();
    },
    syncExplore(shows) {
      let any = false, leaving: HTMLAnchorElement | null = null;
      for (const [id, a] of links) {
        const want = !shows[id];
        any ||= want;
        if (want) a.hidden = false;
        else if (!a.hidden) { if (a === document.activeElement) leaving = a; else a.hidden = true; }
      }
      if (leaving) {
        // its pin is showing again: focus follows the door back onto the poster
        const id = leaving.dataset.landmark as LandmarkId;
        document.querySelector<HTMLElement>(`#landmarks a.lm[data-landmark="${id}"]`)?.focus({ preventScroll: true });
        leaving.hidden = true;
      }
      const hide = !any;
      if (bar.hidden !== hide) { bar.hidden = hide; publish(); }
    },
    exploreLink: (id) => links.get(id),
  };
}
