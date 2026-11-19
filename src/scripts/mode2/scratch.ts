// Scratch card (Scratch.astro). The foil is a canvas painted with an ASCII texture; a pointer
// drag erases it, and past SCRATCH_DONE of it gone the rest fades away. The Reveal button, or
// keyboard focus landing on a link underneath, clears it at once. Reduced motion: never shown.
import { SCRATCH_DONE, clearedShare } from '../../lib/mode2';

const GLYPHS = ' .:-=+*#%@';

export interface ScratchCard { refresh(): void }

export function initScratch(root: ParentNode = document): ScratchCard[] {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  return [...root.querySelectorAll<HTMLElement>('[data-scratch]')].map((card) => {
    const cover = card.querySelector<HTMLElement>('[data-scratch-cover]')!;
    const canvas = cover.querySelector('canvas')!;
    const body = card.querySelector<HTMLElement>('[data-scratch-body]')!;
    const button = card.querySelector<HTMLButtonElement>('[data-reveal]')!;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let painted = '';
    let done = false;
    let started = false;

    const reveal = (focusBody: boolean) => {
      if (done) return;
      done = true;
      card.classList.add('fading');
      card.classList.add('revealed');
      if (focusBody) body.focus();
      const end = () => card.classList.remove('fading');
      if (reduce.matches) end(); else window.setTimeout(end, 480);
    };
    if (reduce.matches || !ctx) {
      card.classList.add('revealed');
      done = true;
      return { refresh() {} };
    }

    /** Paints the foil at the cover's size; only before any scratching, or when the size changes. */
    const paint = () => {
      const w = cover.clientWidth;
      const h = cover.clientHeight;
      const dpr = Math.min(2, devicePixelRatio || 1);
      const key = `${w}x${h}@${dpr}`;
      if (done || !w || !h || key === painted || (started && painted)) return;
      painted = key;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const cs = getComputedStyle(cover);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = cs.backgroundColor;
      ctx.fillRect(0, 0, w, h);
      // An ASCII field, denser toward the corners; deterministic so it never flickers on resize.
      ctx.fillStyle = cs.color;
      ctx.globalAlpha = 0.22;
      ctx.font = `12px ${getComputedStyle(document.documentElement).getPropertyValue('--font-mono') || 'monospace'}`;
      ctx.textBaseline = 'top';
      const cw = 9;
      const ch = 14;
      for (let y = 0, r = 0; y < h; y += ch, r++) {
        for (let x = 0, c = 0; x < w; x += cw, c++) {
          const d = Math.hypot(x / w - 0.5, y / h - 0.5) * 1.6;
          const n = ((c * 7 + r * 13 + ((c * r) % 5)) % 10) / 10;
          const g = GLYPHS[Math.min(GLYPHS.length - 1, Math.floor((d * 0.7 + n * 0.5) * GLYPHS.length))];
          if (g !== ' ') ctx.fillText(g, x, y);
        }
      }
      ctx.globalAlpha = 1;
      cover.classList.add('painted');
    };

    let last: [number, number] | null = null;
    let down: number | null = null;
    let moves = 0;
    const point = (e: PointerEvent): [number, number] => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    const scratch = (to: [number, number]) => {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineCap = ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(28, Math.min(48, cover.clientWidth / 12));
      ctx.beginPath();
      const from = last ?? to;
      ctx.moveTo(from[0], from[1]);
      ctx.lineTo(to[0] + 0.01, to[1]);
      ctx.stroke();
      last = to;
      if (++moves % 6 === 0) check();
    };
    const check = () => {
      const { width, height } = canvas;
      if (!width || !height) return;
      const share = clearedShare(ctx.getImageData(0, 0, width, height).data, width, height, 6);
      if (share >= SCRATCH_DONE) reveal(false);
    };

    cover.addEventListener('pointerdown', (e) => {
      if (done) return;
      paint();
      started = true;
      card.classList.add('started');
      try { cover.setPointerCapture(e.pointerId); } catch { /* not a live pointer: moves still arrive over the cover */ }
      down = e.pointerId;
      last = null;
      scratch(point(e));
    });
    cover.addEventListener('pointermove', (e) => {
      if (done || e.pointerId !== down) return;
      scratch(point(e));
    });
    const up = () => { down = null; last = null; if (!done) check(); };
    cover.addEventListener('pointerup', up);
    cover.addEventListener('pointercancel', up);
    button.addEventListener('click', () => reveal(true));
    // A keyboard user tabbing onto a covered link sees it at once.
    body.addEventListener('focusin', (e) => { if (e.target !== body) reveal(false); });
    reduce.addEventListener('change', () => { if (reduce.matches) reveal(false); });
    new ResizeObserver(paint).observe(cover);
    paint();
    return { refresh: paint };
  });
}
