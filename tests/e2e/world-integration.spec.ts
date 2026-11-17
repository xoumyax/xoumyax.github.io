import { test, expect, type Page } from '@playwright/test';

// The world on `/`: scroll travel, gestures, landmark doors, and the poster fallback.
// Runs in the `world` project (Brave, real GPU); the @nowebgl test runs in the `nowebgl` project.
// Serial: parallel GPU pages stretch each other's main-thread tasks.
test.describe.configure({ mode: 'serial', timeout: 90_000 });

const Q = 'debug=1&governor=off&tier=medium';
const DOORS = [
  ['Study — trailhead', '/study/'],
  ['Resume — ranger station', '/resume/'],
  ['Teaching — adobe schoolhouse', '/teaching/'],
  ['Projects — trailer camp', '/projects/'],
  ['Personal — geodesic dome', '/personal/'],
] as const;

const state = (page: Page) => page.evaluate(() => document.documentElement.dataset.world ?? '');

async function ready(page: Page, path = `/?${Q}`) {
  await page.goto(path);
  await page.waitForFunction(() => {
    const s = document.documentElement.dataset.world ?? '';
    return s === 'ready' || s.startsWith('poster');
  }, null, { timeout: 60_000 });
  expect(await state(page)).toBe('ready');
  await frames(page, 4);
}

const frames = (page: Page, n: number) =>
  page.evaluate((n) => new Promise<void>((r) => { let i = 0; const f = () => (++i > n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

/** Scroll a stop to the top (as a hash link would) and wait for the camera to settle on it. */
async function settleAt(page: Page, id: string) {
  await page.evaluate((id) => document.getElementById(`stop-${id}`)!.scrollIntoView({ behavior: 'instant' }), id);
  await page.waitForFunction((id) => {
    const w = window as unknown as { __world?: { journey: number }; __worldCtl?: { journeyForStop(s: string): number } };
    return !!w.__world && !!w.__worldCtl && Math.abs(w.__world.journey - w.__worldCtl.journeyForStop(id)) < 0.002;
  }, id, { timeout: 20_000 });
  await frames(page, 3);
}

/** Wait for the camera to stop gliding wherever the page is now. */
async function settle(page: Page) {
  await page.evaluate(() => { (window as unknown as { __prevJ?: number }).__prevJ = undefined; });
  await page.waitForFunction(() => {
    const w = window as unknown as { __world?: { journey: number }; __prevJ?: number };
    const j = w.__world?.journey, prev = w.__prevJ;
    w.__prevJ = j;
    return j !== undefined && prev !== undefined && Math.abs(j - prev) < 0.0003;
  }, null, { polling: 200, timeout: 20_000 });
  await frames(page, 3);
}

test('wheel: plain wheel is never intercepted; ctrl+wheel zooms only over open world', async ({ page }) => {
  await ready(page);
  const r = await page.evaluate(() => {
    const fire = (el: EventTarget, init: WheelEventInit) => {
      const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -60, clientX: innerWidth / 2, clientY: innerHeight / 2, ...init });
      el.dispatchEvent(e);
      return e.defaultPrevented;
    };
    // an open-world point: nothing but the page itself under the pointer
    let open: Element | null = null;
    for (let y = 80; y < innerHeight && !open; y += 20) for (let x = 20; x < innerWidth && !open; x += 40) {
      const el = document.elementFromPoint(x, y);
      if (el && !el.closest('[data-panel], [data-card-row], #landmarks, header, footer, a, button')) open = el;
    }
    const row = document.querySelector('[data-card-row]')!;
    const card = row.querySelector('a, h3') ?? row;
    const panel = document.querySelector('[data-panel] h1')!;
    // open world's surface: real wheel events over open world land here (the canvas takes none)
    const canvas = document.getElementById('world-touch')!;
    return {
      found: !!open,
      plainOpen: fire(open!, {}), plainCanvas: fire(canvas, {}), shiftRow: fire(row, { shiftKey: true }), plainRow: fire(row, {}),
      ctrlOpen: fire(open!, { ctrlKey: true }), metaOpen: fire(open!, { metaKey: true }), ctrlCanvas: fire(canvas, { ctrlKey: true }),
      ctrlRow: fire(row, { ctrlKey: true }), ctrlCard: fire(card, { ctrlKey: true }), ctrlPanel: fire(panel, { ctrlKey: true }),
    };
  });
  expect(r.found).toBe(true);
  expect(r).toMatchObject({ plainOpen: false, plainCanvas: false, shiftRow: false, plainRow: false });
  expect(r).toMatchObject({ ctrlOpen: true, metaOpen: true, ctrlCanvas: true });
  expect(r).toMatchObject({ ctrlRow: false, ctrlCard: false, ctrlPanel: false });

  // A real wheel still scrolls the page (travels the road).
  await page.mouse.move(720, 120);
  const y0 = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, 600);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(y0 + 100);
});

test('wheel: no non-passive wheel listener on window or document; ctrl+wheel on a door zooms (M5)', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __blockingWheel: string[] };
    w.__blockingWheel = [];
    const orig = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (this: EventTarget, type: string, fn: EventListenerOrEventListenerObject | null, opts?: boolean | AddEventListenerOptions) {
      const passive = typeof opts === 'object' && opts !== null ? opts.passive : undefined;
      const stack = new Error().stack ?? '';
      if ((type === 'wheel' || type === 'mousewheel') && (this === window || this === document || this === document.documentElement || this === document.body)
        && passive !== true && !stack.includes('InjectedScript')) w.__blockingWheel.push(type);
      return orig.call(this, type, fn, opts);
    };
  });
  await ready(page);
  const r = await page.evaluate(async () => {
    const door = document.querySelector<HTMLElement>('#landmarks a.lm:not([hidden])');
    const fire = (el: EventTarget) => {
      const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -60, ctrlKey: true });
      el.dispatchEvent(e);
      return e.defaultPrevented;
    };
    return { blocking: (window as unknown as { __blockingWheel: string[] }).__blockingWheel, door: door ? fire(door) : null, body: fire(document.body) };
  });
  expect(r.blocking).toEqual([]);
  expect(r.door ?? true).toBe(true);
  expect(r.body).toBe(false);
});

test('deep link: /#stop-phd starts the camera at the PhD stop, with no flash of the trailhead', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __world?: { journey: number; frames: number }; __first?: number; __flash?: boolean };
    w.__flash = false;
    const poll = () => {
      const d = w.__world, c = document.getElementById('world');
      // __world exists from mount (with the u=0 mount frame drawn) until the loop's first frame
      // every world canvas, the sprite overlay included, stays hidden until the jumped frame
      if (d && d.frames === 0 && c && [...document.querySelectorAll('#world-layer canvas')].some((k) => getComputedStyle(k).visibility !== 'hidden')) w.__flash = true;
      if (d && d.frames > 0 && w.__first === undefined) { w.__first = d.journey; return; }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  });
  await ready(page, `/?${Q}#stop-phd`);
  const r = await page.evaluate(() => {
    const w = window as unknown as { __first?: number; __flash?: boolean; __worldCtl: { journeyForStop(s: string): number } };
    return { first: w.__first, flash: w.__flash, phd: w.__worldCtl.journeyForStop('phd'), y: scrollY };
  });
  expect(r.y).toBeGreaterThan(1000);
  expect(r.first).toBeDefined();
  expect(Math.abs(r.first! - r.phd)).toBeLessThan(0.02);
  expect(r.flash).toBe(false);
  await expect(page.locator('#world')).toBeVisible();
  // the engine's sprite overlay shows with the world
  await expect(page.locator('#world-layer canvas[data-world-sprites]')).toHaveCount(1);
  await expect(page.locator('#world-layer canvas[data-world-sprites]')).toBeVisible();
});

test('context loss: the poster replaces the canvas without a layout shift, and scrolling still works', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __shifts: { t: number; v: number; input: boolean }[] };
    w.__shifts = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => {
      const s = e as PerformanceEntry & { value: number; hadRecentInput: boolean };
      w.__shifts.push({ t: s.startTime, v: s.value, input: s.hadRecentInput });
    })).observe({ type: 'layout-shift', buffered: true });
  });
  await ready(page);
  await settleAt(page, 'ms');
  // every frame from here: whenever #world is hidden, the sprite overlay is too
  await page.evaluate(() => {
    const w = window as unknown as { __spriteLeak: number; __sprites: number };
    w.__spriteLeak = 0; w.__sprites = 0;
    const vis = (el: Element) => el.isConnected && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none';
    const poll = () => {
      const world = document.getElementById('world')!, sprites = [...document.querySelectorAll('#world-layer canvas[data-world-sprites]')];
      w.__sprites = Math.max(w.__sprites, sprites.length);
      if (!vis(world) && sprites.some(vis)) w.__spriteLeak++;
      requestAnimationFrame(poll);
    };
    poll(); // sample now too: the loss can dispose the overlay before the next frame
  });
  const t0 = await page.evaluate(() => performance.now());
  await page.evaluate(() => {
    const gl = (document.getElementById('world') as HTMLCanvasElement).getContext('webgl2')!;
    gl.getExtension('WEBGL_lose_context')!.loseContext();
  });
  await page.waitForFunction(() => document.documentElement.dataset.world === 'poster:context-lost');
  await expect(page.locator('#world-poster')).toBeVisible();
  await expect(page.locator('#world')).toBeHidden();
  // the sprite overlay goes with it (hidden, or removed by dispose)
  for (const c of await page.locator('#world-layer canvas[data-world-sprites]').all()) await expect(c).toBeHidden();
  await frames(page, 4);
  const leak = await page.evaluate(() => { const w = window as unknown as { __spriteLeak: number; __sprites: number }; return { __sprites: w.__sprites, __spriteLeak: w.__spriteLeak }; });
  expect(leak.__sprites).toBe(1); // the overlay was there while the world ran
  expect(leak.__spriteLeak).toBe(0);
  await frames(page, 4);
  const cls = await page.evaluate((t0) => (window as unknown as { __shifts: { t: number; v: number; input: boolean }[] }).__shifts
    .filter((s) => s.t >= t0 && !s.input).reduce((a, s) => a + s.v, 0), t0);
  expect(cls).toBeLessThan(0.01);

  // Wheel scrolling still travels the page, and the river is reachable.
  await page.mouse.move(720, 450);
  const y0 = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, 900);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(y0 + 100);
  await page.evaluate(() => document.getElementById('stop-river')!.scrollIntoView({ behavior: 'instant' }));
  await expect(page.locator('#stop-river h2')).toBeInViewport();
  // the doors stay (pins from the poster's table, the rest in the Explore list); no gesture surface
  await expect(page.locator('#landmarks a.lm')).toHaveCount(5);
  await expect(page.locator('#world-ui .world-view')).toBeHidden();
  await expect(page.locator('#world-touch')).toHaveCount(0);
  const reach = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#landmarks a.lm, #world-ui a.lm-x')]
    .filter((e) => e.checkVisibility()).map((e) => e.getAttribute('aria-label')).sort());
  expect(reach).toEqual(DOORS.map(([n]) => n).sort());
});

test('keyboard: Tab reaches all five named landmark doors with a visible focus ring; Enter opens the route', async ({ page }) => {
  // t freezes the ambient sway, so a door near a panel's edge cannot drift under it mid-check
  await ready(page, `/?${Q}&t=8`);
  await expect(page.locator('#world-layer')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#landmarks a.lm')).toHaveCount(5);

  const focused = () => page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    if (!a || a === document.body) return null;
    const s = getComputedStyle(a);
    const pin = a.querySelector('.lm-pin')?.getBoundingClientRect();
    const top = pin ? document.elementFromPoint(pin.x + pin.width / 2, pin.y + pin.height / 2) : null;
    return {
      inLandmarks: !!a.closest('#landmarks, #world-ui'), isDoor: a.matches('#landmarks a.lm'), inJourney: !!a.closest('.journey'),
      name: a.getAttribute('aria-label') ?? '', href: a.getAttribute('href'),
      outline: { style: s.outlineStyle, width: parseFloat(s.outlineWidth), color: s.outlineColor },
      // nothing covers the focused door (content sits above the doors)
      uncovered: !!top && a.contains(top),
      cover: top && !a.contains(top) ? `${top.tagName.toLowerCase()}.${top.className} at ${pin!.x | 0},${pin!.y | 0}, scrollY ${scrollY}` : '',
    };
  });
  const seen = new Map<string, { href: string | null; y: number }>();
  /** Tab on until focus leaves the landmark layer; true if focus passed through it. */
  const record = async () => {
    let entered = false;
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const f = await focused();
      if (!f) continue;
      if (f.inLandmarks) entered = true;
      else if (entered || f.inJourney) break;
      if (!f.isDoor) continue;
      seen.set(f.name, { href: f.href, y: await page.evaluate(() => scrollY) });
      expect(f.outline.style).not.toBe('none');
      expect(f.outline.width).toBeGreaterThanOrEqual(2);
      expect(f.outline.color).toBe('rgb(240, 164, 58)'); // --amber on the dark tag
      expect(f.uncovered, `${f.name} is focused under ${f.cover}`).toBe(true);
      const box = (await page.locator('#landmarks a.lm:focus').boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(-1);
      expect(box.y).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width).toBeLessThanOrEqual(1441);
      expect(box.y + box.height).toBeLessThanOrEqual(901);
    }
    return entered;
  };

  // From the very top of the page, Tab goes hero → the world's layer (doors, view controls) → the journey.
  await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); scrollTo(0, 0); });
  await settle(page);
  expect(await record()).toBe(true);

  // Along the road: at each stop (and partway through it), Tab on from the end of the hero,
  // with focus placed there without scrolling.
  for (const id of ['srm', 'cognizant', 'ms', 'phd', 'now']) {
    for (const f of [0, 0.25, 0.5]) {
      await page.evaluate(([id, f]) => {
        const s = document.getElementById(`stop-${id}`)!;
        s.scrollIntoView({ behavior: 'instant' });
        scrollBy({ top: s.offsetHeight * Number(f), behavior: 'instant' });
      }, [id, f] as const);
      await settle(page);
      await page.evaluate(() => {
        const els = [...document.querySelectorAll<HTMLElement>('.hero a, .hero button')];
        els[els.length - 1].focus({ preventScroll: true });
      });
      await record();
    }
  }
  expect([...seen.keys()].sort()).toEqual(DOORS.map(([n]) => n).sort());
  for (const [name, href] of DOORS) expect(seen.get(name)?.href).toBe(href);

  // Enter on a door opens its section.
  await page.evaluate((y) => scrollTo({ top: y, behavior: 'instant' }), seen.get('Resume — ranger station')!.y);
  await settle(page);
  const door = page.getByRole('link', { name: 'Resume — ranger station' });
  await expect(door).toBeVisible();
  await door.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/resume\/?$/);
});

test('view controls: + / − / reset sit in the world bar, above content', async ({ page }) => {
  await ready(page);
  const group = page.getByRole('group', { name: 'World view' });
  await expect(group).toBeVisible();
  for (const name of ['Zoom in', 'Zoom out', 'Reset view']) await expect(group.getByRole('button', { name })).toBeVisible();
  await expect(page.locator('#world-ui .world-explore')).toBeHidden();
  // the bar's height reserves room at the bottom: focus scrolling and the footer keep clear of it
  const r = await page.evaluate(() => ({
    h: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--world-ui-h')),
    pad: parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom),
    bar: document.getElementById('world-ui')!.offsetHeight,
  }));
  expect(r.h).toBe(r.bar);
  expect(r.pad).toBeGreaterThan(r.bar);
});

/** Every shown focusable door or control has its centre uncovered (WCAG 2.4.11). */
const coveredFocusables = (page: Page) => page.evaluate(() => {
  const bad: string[] = [];
  for (const el of document.querySelectorAll<HTMLElement>('#landmarks a, #landmarks button, #world-ui a, #world-ui button')) {
    if (!el.checkVisibility()) continue;
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    if (!top || !el.contains(top)) bad.push(`${el.getAttribute('aria-label')} under ${top?.tagName}.${top?.className} at y ${scrollY}`);
  }
  return bad;
});

for (const [w, h] of [[1440, 900], [390, 844]] as const) {
  test(`no shown door or control is ever under content, all the way down (${w}×${h})`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await ready(page, `/?${Q}&t=8`);
    const H = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    let doorsSeen = 0;
    for (let y = 0; y <= H + h / 4; y += Math.round(h / 4)) {
      await page.evaluate((y) => scrollTo({ top: y, behavior: 'instant' }), y);
      await frames(page, 3);
      expect(await coveredFocusables(page)).toEqual([]);
      doorsSeen += await page.locator('#landmarks a.lm:visible').count();
    }
    expect(doorsSeen).toBeGreaterThan(0);
  });
}

test('a focused door that has to hide hands focus on without scrolling', async ({ page }) => {
  await ready(page, `/?${Q}&t=8`);
  const door = page.locator('#landmarks a.lm:visible').first();
  for (const stop of ['srm', 'cognizant', 'ms', 'phd', 'now']) {
    await page.evaluate((s) => document.getElementById(`stop-${s}`)!.scrollIntoView({ behavior: 'instant' }), stop);
    await settle(page);
    if (await door.count()) break;
  }
  await expect(door).toHaveCount(1);
  await door.focus();
  const id = await door.getAttribute('data-landmark');
  // the river: this door is off screen there
  const y = await page.evaluate(() => { document.getElementById('stop-river')!.scrollIntoView({ behavior: 'instant' }); return scrollY; });
  await page.waitForFunction((id) => (document.querySelector(`#landmarks a.lm[data-landmark="${id}"]`) as HTMLElement).hidden, id);
  await frames(page, 2);
  const f = await page.evaluate(() => {
    const a = document.activeElement as HTMLElement;
    return { inWorld: !!a.closest('#landmarks, #world-ui'), shown: a.checkVisibility(), y: scrollY };
  });
  expect(f).toEqual({ inWorld: true, shown: true, y });
});

test('arrow keys: Left/Right turn the view, Up/Down still scroll the page', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Zoom in' }).focus();
  const prevented = await page.evaluate(() => {
    const fire = (key: string) => {
      const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      document.activeElement!.dispatchEvent(e);
      return e.defaultPrevented;
    };
    return { left: fire('ArrowLeft'), right: fire('ArrowRight'), up: fire('ArrowUp'), down: fire('ArrowDown') };
  });
  expect(prevented).toEqual({ left: true, right: true, up: false, down: false });
  const y0 = await page.evaluate(() => scrollY);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(y0);
});

test('arrow-key turns ease back to the stop\'s viewpoint, like a drag (M4)', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Zoom in' }).focus();
  const yaw = () => page.evaluate(() => (window as unknown as { __world: { view: { yaw: number } } }).__world.view.yaw);
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight'); // keydown + keyup, 4 × 6°
  await expect.poll(yaw, { timeout: 3000 }).toBeGreaterThan(10);
  // released: after the relax delay (1.4 s) the view eases back to rest
  await expect.poll(yaw, { timeout: 8000 }).toBeLessThan(0.5);
});

test('pause: a hidden tab stops the render loop, and showing it again resumes', async ({ page }) => {
  await ready(page);
  const count = () => page.evaluate(() => (window as unknown as { __world: { frames: number } }).__world.frames);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const f0 = await count();
  await page.waitForTimeout(600);
  expect(await count()).toBe(f0);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(count).toBeGreaterThan(f0 + 5);
});

test.describe('touch (phone)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('pan-y only on the open-world surface; content keeps auto; no blocking touch listener on window', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __blocking: string[] };
      w.__blocking = [];
      const orig = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function (this: EventTarget, type: string, fn: EventListenerOrEventListenerObject | null, opts?: boolean | AddEventListenerOptions) {
        const passive = typeof opts === 'object' && opts !== null ? opts.passive : undefined;
        const stack = new Error().stack ?? '';
        // Playwright's own injected script adds hit-target listeners; only the page's count
        if (/^touch/.test(type) && (this === window || this === document || this === document.documentElement || this === document.body)
          && passive !== true && !stack.includes('InjectedScript')) {
          w.__blocking.push(`${type} ${stack.split('\n').slice(2, 4).join(' | ')}`);
        }
        return orig.call(this, type, fn, opts);
      };
    });
    await ready(page);
    const r = await page.evaluate(() => {
      const ta = (el: Element | null) => (el ? getComputedStyle(el).touchAction : 'missing');
      // an open-world point: what a finger there lands on
      let open: Element | null = null;
      for (let y = 80; y < innerHeight && !open; y += 16) for (let x = 8; x < innerWidth && !open; x += 16) {
        const el = document.elementFromPoint(x, y);
        if (el && !el.closest('[data-panel], [data-card-row], #landmarks, #world-ui, header, footer')) open = el;
      }
      return {
        open: open?.id, surface: ta(document.getElementById('world-touch')),
        html: ta(document.documentElement), body: ta(document.body),
        panel: ta(document.querySelector('[data-panel]')), row: ta(document.querySelector('[data-card-row]')),
        footer: ta(document.querySelector('.footer')),
        blocking: (window as unknown as { __blocking: string[] }).__blocking,
      };
    });
    expect(r).toEqual({ open: 'world-touch', surface: 'pan-y', html: 'auto', body: 'auto', panel: 'auto', row: 'auto', footer: 'auto', blocking: [] });
  });

  test('with the world running on a touch device, no surface blurs the canvas (I5)', async ({ page }) => {
    await ready(page);
    const r = await page.evaluate(() => {
      const bf = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return 'missing';
        const cs = getComputedStyle(el);
        return `${cs.backdropFilter}|${cs.getPropertyValue('-webkit-backdrop-filter') || 'none'}`;
      };
      return {
        coarse: matchMedia('(pointer: coarse)').matches,
        panel: bf('[data-panel]'), topbar: bf('.topbar'), footer: bf('.footer'), bar: bf('#world-ui .world-view'),
      };
    });
    expect(r).toEqual({ coarse: true, panel: 'none|none', topbar: 'none|none', footer: 'none|none', bar: 'none|none' });
  });

  test('the world layer is sized in lvh, and a URL-bar-sized height change does not resize the engine (I6)', async ({ page }) => {
    await ready(page);
    const css = await page.evaluate(() => {
      const l = document.getElementById('world-layer')!, b = document.getElementById('landmarks')!;
      return { layer: l.clientHeight, doors: b.clientHeight, inner: innerHeight };
    });
    // (no URL bar in emulation: lvh = the viewport here; the 120 px rule below is what is tested)
    expect(css).toEqual({ layer: 844, doors: 844, inner: 844 });
    const resizes = () => page.evaluate(() => ({ ...(window as unknown as { __world: { resizes: { applied: number; ignored: number } } }).__world.resizes }));
    const before = await resizes();
    // the URL bar hiding: 60 px taller, same width
    await page.setViewportSize({ width: 390, height: 904 });
    await expect.poll(async () => (await resizes()).ignored).toBeGreaterThan(before.ignored);
    expect((await resizes()).applied).toBe(before.applied);
    // a rotation (width change) still resizes
    await page.setViewportSize({ width: 844, height: 390 });
    await expect.poll(async () => (await resizes()).applied).toBeGreaterThan(before.applied);
  });

  test('a swipe that starts sideways on open world still scrolls the page vertically', async ({ page }) => {
    await ready(page);
    const pt = await page.evaluate(() => {
      for (let y = 120; y < innerHeight - 200; y += 16) for (let x = 40; x < innerWidth - 40; x += 16) {
        if (document.elementFromPoint(x, y)?.id === 'world-touch') return { x, y };
      }
      return null;
    });
    expect(pt).not.toBeNull();
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) => cdp.send('Input.dispatchTouchEvent', {
      type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
    });
    const swipe = async (moves: [number, number][]) => {
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      await page.waitForTimeout(300);
      await touch('touchStart', pt!.x, pt!.y);
      for (const [x, y] of moves) { await touch('touchMove', x, y); await page.waitForTimeout(16); }
      await touch('touchEnd', 0, 0);
      await page.waitForTimeout(500);
      return page.evaluate(() => scrollY);
    };
    const up = Array.from({ length: 12 }, (_, i) => [pt!.x, pt!.y - (i + 1) * 15] as [number, number]); // 180 px
    // a plain vertical swipe is the browser's own scroll, about the finger's travel (nothing doubles it)
    const v = await swipe(up);
    expect(v).toBeGreaterThan(90);
    expect(v).toBeLessThan(240);
    // sideways first (turns the view) ... then up: the page still scrolls for the rest of the swipe
    const sideways = Array.from({ length: 5 }, (_, i) => [pt!.x + (i + 1) * 8, pt!.y] as [number, number]);
    const s = await swipe([...sideways, ...up.map(([x, y]) => [x + 40, y] as [number, number])]);
    expect(s).toBeGreaterThan(90);
    expect(s).toBeLessThan(240);
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('shows the poster, mounts no canvas, never fetches the engine', async ({ page }) => {
    const scripts: import('@playwright/test').Response[] = [];
    page.on('response', (r) => { if (r.request().resourceType() === 'script') scripts.push(r); });
    await page.goto(`/?${Q}`);
    await page.waitForFunction(() => document.documentElement.dataset.world === 'poster:reduced-motion');
    await page.waitForTimeout(1500); // give an idle mount the chance to (wrongly) happen
    await expect(page.locator('#world-poster')).toBeVisible();
    await expect(page.locator('#world')).toBeHidden();
    await expect(page.locator('#world-touch')).toHaveCount(0);
    const c = await page.evaluate(() => ({
      w: (document.getElementById('world') as HTMLCanvasElement).width,
      debug: 'undefined' !== typeof (window as unknown as { __world?: unknown }).__world,
      state: document.documentElement.dataset.world,
    }));
    expect(c).toEqual({ w: 300, debug: false, state: 'poster:reduced-motion' }); // 300: never sized by a renderer
    expect(scripts.length).toBeGreaterThan(0);
    for (const r of scripts) expect(await r.text(), r.url()).not.toContain('WebGLRenderer');
    // pins over the poster sit on the poster; the Explore list holds the rest (poster-doors.spec covers Tab)
    const poster = (await page.locator('#world-poster').boundingBox())!;
    for (const b of await page.locator('#landmarks a.lm:visible').all()) {
      const box = (await b.locator('.lm-pin').boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(poster.x - 1);
      expect(box.y).toBeGreaterThanOrEqual(poster.y - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(poster.x + poster.width + 1);
      expect(box.y + box.height).toBeLessThanOrEqual(poster.y + poster.height + 1);
    }
  });
});
