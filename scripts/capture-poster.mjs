#!/usr/bin/env node
// Captures the world's still poster and its landmark table for the landing page's fallback.
//
// Usage: against a running build preview (any port), built with the test bench (WORLD_TEST=1):
//   WORLD_TEST=1 npm run build && PORT=4417 npm run preview   # in one shell
//   PORT=4417 node scripts/capture-poster.mjs                 # in another
// Then rebuild: index.astro only renders the poster <img> if public/world/poster.webp exists
// at build time.
//
// For each size (1440×900 @1x, 390×844 @2x) it loads /world-test/?governor=off&tier=medium&t=8
// (clock frozen, fixed tier, no governor) and searches for the framing that shows the most of
// the five landmarks inside the frame, with a margin and below the top bar:
//   zoom 1 → 0.6 (closest first), pitch offset 0 / +6°, yaw 0, ±10 … ±40 (clampView's limits),
//   and journey u 0 … 0.5 in steps of 0.02.
// Ties go to the closer zoom, then the wider margin, then the earlier candidate. Everything is a
// fixed grid on a frozen clock, so a rerun picks the same framing for the same world. The chosen
// framing is written into landmarks.json with the positions; doors the poster cannot show go
// into the landing page's Explore list at runtime.
//
// Writes (overwrites; idempotent):
//   public/world/poster.webp          1440×900 @1x
//   public/world/poster-mobile.webp   390×844 @2x
//   public/world/landmarks.json       per capture: size, framing, landmark positions as fractions;
//                                     and `version`, the posters' content hash (poster-version.mjs):
//                                     the page pairs the images and the table by it (M10)
// Each webp is encoded in the browser (no image dependency) and kept ≤ 250 000 bytes by stepping
// the quality down.
//
// Needs a WebGL2 GPU browser: Brave by default (as the `world` Playwright project), or WORLD_BROWSER.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { posterVersion } from './poster-version.mjs';

const PORT = process.env.PORT ?? '4321';
const BASE = `http://localhost:${PORT}`;
const PAGE = '/world-test/?governor=off&tier=medium&t=8';
const MAX_BYTES = 250_000;
const BROWSER = process.env.WORLD_BROWSER ?? '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'world');

const ZOOMS = [1, 0.9, 0.8, 0.7, 0.6];
const PITCHES = [0, 6];
const YAWS = [0, -10, 10, -20, 20, -30, 30, -40, 40];
const US = Array.from({ length: 26 }, (_, i) => Math.round(i * 0.02 * 100) / 100);
/** A landmark counts when it is this far inside the frame (fractions), and below the top bar. */
const MARGIN = 0.06, TOP = 0.12;

const SHOTS = {
  desktop: { width: 1440, height: 900, dpr: 1, file: 'poster.webp' },
  mobile: { width: 390, height: 844, dpr: 2, file: 'poster-mobile.webp' },
};

/** Set the view (engine offsets) and wait until the eased camera has settled. */
async function setView(page, { yaw, pitch, zoom }) {
  await page.evaluate(async ({ yaw, pitch, zoom }) => {
    const c = window.__worldCtl;
    c.resetView(); c.orbit(yaw, pitch); c.zoom(zoom);
    // the view eases with a 0.18 s half-life: wait until the projection stops moving
    let prev = null, still = 0;
    for (let i = 0; i < 600 && still < 6; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const p = Object.values(c.landmarkScreenPositions()).map((q) => q.x + q.y);
      still = prev && p.every((v, k) => Math.abs(v - prev[k]) < 0.02) ? still + 1 : 0;
      prev = p;
    }
  }, { yaw, pitch, zoom });
}

/** Score every u for the current view: [{u, count, margin}]. */
function sweep(page, w, h) {
  return page.evaluate(({ us, w, h, M, TOP }) => us.map((u) => {
    const c = window.__worldCtl;
    c.jumpJourney(u); // with the clock frozen the camera is at u at once
    let count = 0, margin = Infinity;
    for (const p of Object.values(c.landmarkScreenPositions())) {
      const fx = p.x / w, fy = p.y / h;
      const m = Math.min(fx - M, 1 - M - fx, fy - TOP, 1 - M - fy);
      if (p.visible && m >= 0) { count++; margin = Math.min(margin, m); }
    }
    return { u, count, margin: count ? margin : 0 };
  }), { us: US, w, h, M: MARGIN, TOP });
}

async function search(page, s) {
  let best = null;
  for (const zoom of ZOOMS) {
    for (const pitch of PITCHES) for (const yaw of YAWS) {
      await setView(page, { yaw, pitch, zoom });
      for (const r of await sweep(page, s.width, s.height)) {
        const better = !best || r.count > best.count || (r.count === best.count && zoom === best.zoom && r.margin > best.margin + 1e-9);
        if (better) best = { ...r, yaw, pitch, zoom };
      }
    }
    if (best?.count === 5) break; // the closest zoom that frames all five
  }
  return best;
}

const browser = await chromium.launch({ executablePath: BROWSER, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const table = { source: PAGE, version: '', shots: {} };
try {
  mkdirSync(OUT, { recursive: true });
  for (const [name, s] of Object.entries(SHOTS)) {
    const page = await browser.newPage({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: s.dpr });
    await page.goto(BASE + PAGE);
    await page.waitForFunction(() => {
      const w = document.documentElement.dataset.world ?? '';
      return w === 'ready' || w.startsWith('error') || w.startsWith('lost');
    }, null, { timeout: 90_000 });
    const st = await page.evaluate(() => document.documentElement.dataset.world);
    if (st !== 'ready') throw new Error(`world-test did not mount (${st}): is this a GPU browser?`);

    const f = await search(page, s);
    await setView(page, f);
    await page.evaluate((u) => window.__worldCtl.jumpJourney(u), f.u);
    await page.evaluate(() => new Promise((r) => { let n = 0; const g = () => (++n > 10 ? r() : requestAnimationFrame(g)); requestAnimationFrame(g); }));
    const marks = await page.evaluate(() => window.__worldCtl.landmarkScreenPositions());
    const png = (await page.screenshot({ type: 'png' })).toString('base64');
    const { b64, quality } = await page.evaluate(async ({ png, max }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      let blob = null, q = 0.86;
      for (; q >= 0.3; q -= 0.04) {
        blob = await new Promise((r) => c.toBlob(r, 'image/webp', q));
        if (!blob || blob.type !== 'image/webp') throw new Error('this browser cannot encode webp');
        if (blob.size <= max) break;
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { b64: btoa(bin), quality: Math.round(q * 100) / 100 };
    }, { png, max: MAX_BYTES });
    const buf = Buffer.from(b64, 'base64');
    if (buf.length > MAX_BYTES) throw new Error(`${s.file} is ${buf.length} bytes even at the lowest quality`);
    writeFileSync(join(OUT, s.file), buf);
    const r4 = (v) => Math.round(v * 1e4) / 1e4;
    table.shots[name] = {
      width: s.width, height: s.height,
      framing: { u: f.u, yaw: f.yaw, pitch: f.pitch, zoom: f.zoom },
      landmarks: Object.fromEntries(Object.entries(marks).map(([id, p]) => [id, { x: r4(p.x / s.width), y: r4(p.y / s.height), visible: p.visible }])),
    };
    const shown = Object.entries(marks).filter(([, p]) => p.visible).map(([id]) => id).join(', ') || 'none';
    console.log(`${s.file}: ${(buf.length / 1000).toFixed(0)} kB at q=${quality}; framing u=${f.u} yaw=${f.yaw} pitch=+${f.pitch} zoom=${f.zoom}; ${f.count}/5 framed; on screen: ${shown}`);
    await page.close();
  }
  table.version = posterVersion(OUT);
  writeFileSync(join(OUT, 'landmarks.json'), JSON.stringify(table, null, 2) + '\n');
  console.log('landmarks.json written');
} finally {
  await browser.close();
}
