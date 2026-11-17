// The still poster: shown when there is no WebGL2, under reduced motion, on a context loss, on a
// sustained low frame rate (the governor's 'fallback'), or on any mount error.
//
// The poster <img> sits under the canvas in #world-layer from the start (and alone with JS off),
// so the swap only hides the canvas: both are absolutely positioned in a fixed layer, so nothing
// moves (no layout shift). The canvas is hidden, never removed. State goes to <html data-world>:
// 'loading' | 'ready' | 'poster:<reason>'. world.css keys every canvas in #world-layer (the GL
// canvas and the engine's sprite overlay, added mid-mount) to that state, so they hide together.

export interface Fallback {
  /** The reason the poster is up, or null while the world can still run. */
  readonly reason: string | null;
  /** Mount is starting: keep the canvas invisible until the first frame at the right place. */
  loading(): void;
  /** The first good frame is on the canvas. */
  reveal(): void;
  /** Swap to the poster (once; later calls are ignored). */
  toPoster(reason: string): void;
  onPoster(fn: (reason: string) => void): void;
}

export function setupFallback(doc: Document = document): Fallback {
  const root = doc.documentElement;
  const canvas = doc.getElementById('world') as HTMLCanvasElement | null;
  const poster = doc.getElementById('world-poster') as HTMLImageElement | null;
  let reason: string | null = null;
  const subs: Array<(r: string) => void> = [];
  return {
    get reason() { return reason; },
    loading() {
      if (reason) return;
      // visibility, not display: the engine sizes from the canvas's client box
      if (canvas) canvas.style.visibility = 'hidden';
      root.dataset.world = 'loading';
    },
    reveal() {
      if (reason) return;
      if (canvas) canvas.style.visibility = '';
      root.dataset.world = 'ready';
    },
    toPoster(r) {
      if (reason) return;
      reason = r;
      if (canvas) { canvas.style.visibility = 'hidden'; canvas.hidden = true; }
      for (const c of doc.querySelectorAll<HTMLCanvasElement>('#world-layer canvas')) c.hidden = true;
      if (poster) poster.hidden = false;
      root.dataset.world = `poster:${r}`;
      for (const f of subs) {
        try { f(r); } catch (e) { console.warn('world: poster handler failed', e); }
      }
    },
    onPoster(fn) { subs.push(fn); },
  };
}

/** WebGL2 on a scratch canvas (never #world, whose context the engine must create). */
export function hasWebGL2(doc: Document = document): boolean {
  try {
    const c = doc.createElement('canvas');
    // a software-only GL (blocklisted GPU) cannot hold the frame rate: take the poster up front
    const gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: true });
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}
