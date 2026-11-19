// The screen renderer: draws a frame's passes (./compose.ts) onto the #scene canvas at screen
// resolution, `b` device px per world px, nearest-neighbour. Each layer is a world-px source canvas
// (the layer with its hook output or rest sprites painted on, re-painted only when that output
// changes); a pass draws it upscaled, offset by its fractional offsets snapped to whole device px,
// clipped to its side of the pan seam. A whole offset puts the layer on the same device grid as a
// flat frame, so the rest frame is the flat PNG scaled by the block size, block-aligned.
import { panDev, rowY, seamEdges, snapOffset } from '../../lib/world-math';
import { layerCalls, paintLayer, type Pass, type World } from './compose';

interface Source {
  cv: HTMLCanvasElement; g: CanvasRenderingContext2D; img: ImageData; px: Uint32Array;
  calls: number[] | null;    // what is painted on it now (null: nothing yet)
  version: number;           // bumped on every re-paint
  box: [number, number, number, number]; // opaque columns [x0, x1) and rows [y0, y1); whole world for hooked layers
}

const sameCalls = (a: number[] | null, b: number[]): boolean => {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

function opaqueBox(px: Uint32Array, w: number, h: number): [number, number, number, number] {
  let x0 = w, x1 = 0, y0 = h, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!(px[y * w + x] >>> 24)) continue;
    if (x < x0) x0 = x;
    if (x >= x1) x1 = x + 1;
    if (y < y0) y0 = y;
    if (y >= y1) y1 = y + 1;
  }
  return x1 > x0 ? [x0, x1, y0, y1] : [0, 0, 0, 0];
}

export class Screen {
  private readonly g: CanvasRenderingContext2D;
  private readonly sources = new WeakMap<World, (Source | undefined)[]>();
  private last = '';

  constructor(private readonly cv: HTMLCanvasElement) {
    this.g = cv.getContext('2d')!;
  }

  /** Sets the backing store (device px); clears the canvas, so the next draw repaints. */
  size(w: number, h: number): void {
    if (this.cv.width === w && this.cv.height === h) return;
    this.cv.width = w; this.cv.height = h;
    this.last = '';
  }

  private source(ps: Pass, clock: number): Source {
    let list = this.sources.get(ps.world);
    if (!list) this.sources.set(ps.world, (list = []));
    const [W, H] = ps.world.meta.world;
    let s = list[ps.i];
    if (!s) {
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const g = cv.getContext('2d')!;
      const img = g.createImageData(W, H);
      s = { cv, g, img, px: new Uint32Array(img.data.buffer), calls: null, version: 0, box: [0, W, 0, H] };
      list[ps.i] = s;
    }
    // A layer without a hook is painted once (with its rest sprites); a hooked one whenever its output changes.
    if (s.calls && !ps.hook) return s;
    const calls = layerCalls(ps, clock);
    if (sameCalls(s.calls, calls)) return s;
    paintLayer(s.px, ps.world, ps.i, calls);
    s.g.putImageData(s.img, 0, 0);
    s.calls = calls;
    s.version++;
    s.box = ps.hook ? [0, W, 0, H] : opaqueBox(s.px, W, H);
    return s;
  }

  /**
   * Draws the passes for a view vw × vh world px at b device px per world px (the canvas is
   * round(vw · b) × round(vh · b)). Returns false when the frame equals the last one drawn.
   */
  draw(list: Pass[], vw: number, vh: number, b: number, clock: number, force = false): boolean {
    const Wd = this.cv.width;
    const Hd = this.cv.height;
    const whole = Number.isInteger(b);
    const plan = list.map((ps) => {
      const src = this.source(ps, clock);
      const sx = snapOffset(ps.view[0] + ps.cam[0] - ps.shift[0], b);
      const sy = snapOffset(ps.view[1] + ps.cam[1] - ps.shift[1], b);
      const s = panDev(ps.share, vw, b);
      const cut = Wd - s;
      // Layer column sx.n sits at device x0, row sy.n at device y0.
      const x0 = sx.d + (ps.next ? cut : -s);
      const y0 = sy.d;
      return { ps, src, sx, sy, x0, y0, cut, pan: ps.share > 0 };
    });
    const key = `${Wd}x${Hd}@${b}|` + plan.map((q) => `${q.ps.world.meta.id}.${q.ps.i}.${q.src.version}:${q.sx.n},${q.x0},${q.sy.n},${q.y0},${q.pan ? q.cut : -1}`).join('|');
    if (!force && key === this.last) return false;
    this.last = key;

    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, Wd, Hd);
    for (const { ps, src, sx, sy, x0, y0, cut, pan } of plan) {
      const [W, H] = ps.world.meta.world;
      // The device span this pass may touch.
      let left = 0;
      let right = Wd;
      let edges: Int32Array | null = null;
      if (pan && !ps.next) right = Math.min(Wd, cut);
      if (pan && ps.next) {
        edges = seamEdges(cut, ps.band, vh, b);
        left = Math.min(...edges);
      }
      if (right <= left) continue;
      // Source columns [c0, c1) and rows [r0, r1) that reach the span (cropped to the opaque box).
      // With a fractional b only whole-layer starts keep the device grid, so crop only at the layer's own edges then.
      let c0: number, c1: number, r0: number, r1: number;
      if (whole) {
        c0 = Math.max(src.box[0], sx.n + Math.floor((left - x0) / b));
        c1 = Math.min(src.box[1], sx.n + Math.ceil((right - x0) / b));
        r0 = Math.max(src.box[2], sy.n + Math.floor(-y0 / b));
        r1 = Math.min(src.box[3], sy.n + Math.ceil((Hd - y0) / b));
      } else {
        c0 = Math.max(0, sx.n); c1 = Math.min(W, sx.n + vw + 2);
        r0 = Math.max(0, sy.n); r1 = Math.min(H, sy.n + vh + 2);
      }
      if (c1 <= c0 || r1 <= r0) continue;
      const dx = x0 + Math.round((c0 - sx.n) * b);
      const dy = y0 + Math.round((r0 - sy.n) * b);
      const clip = pan;
      if (clip) {
        g.save();
        const path = new Path2D();
        if (!ps.next) path.rect(0, 0, right, Hd);
        else {
          // A stepped outline: each view row from its seam edge to the right edge.
          path.moveTo(Wd, 0);
          for (let j = 0; j < vh; j++) {
            const ya = j === 0 ? 0 : rowY(j, b);
            const yb = j === vh - 1 ? Hd : rowY(j + 1, b);
            path.lineTo(edges![j], ya);
            path.lineTo(edges![j], yb);
          }
          path.lineTo(Wd, Hd);
          path.closePath();
        }
        g.clip(path);
      }
      g.drawImage(src.cv, c0, r0, c1 - c0, r1 - r0, dx, dy, (c1 - c0) * b, (r1 - r0) * b);
      if (clip) g.restore();
    }
    return true;
  }
}
