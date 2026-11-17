// Runs the bake in a worker, with a main-thread bake only for a worker that cannot run at all.
//
// - A worker that cannot be constructed, or errors right away (within EARLY_ERROR_MS: a blocked or
//   unsupported module worker, a failed import), falls back to baking on the main thread.
// - A worker that never answers within BAKE_TIMEOUT_MS rejects: a device or connection that slow
//   would freeze the page for a full main-thread bake, so the caller shows the poster instead (I8).
//   A worker that errors later than EARLY_ERROR_MS rejects for the same reason.
// The promise settles once; a late reply is ignored. `job.cancel()` terminates a pending worker
// and rejects (an abort or a dispose during the mount).
import { bakeWorld, type BakeResult } from './bake';

export const BAKE_TIMEOUT_MS = 10000;
/** An error this soon after the worker starts means workers cannot run here: bake on the main thread. */
export const EARLY_ERROR_MS = 1000;

/** The part of `Worker` the bake uses (injectable for tests). */
export interface BakeWorkerLike {
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  onmessageerror: ((e: MessageEvent) => void) | null;
  postMessage(m: unknown): void;
  terminate(): void;
}

/** Filled in by `bakeOffThread`: cancel() terminates a pending worker and rejects (dispose during mount). */
export interface BakeJob { cancel(): void }

export interface BakeOptions {
  createWorker?: () => BakeWorkerLike;
  fallback?: (o: { scrubCount: number; seed: number }) => BakeResult;
  timeoutMs?: number;
  job?: BakeJob;
  /** Injectable clock (ms) for tests. */
  now?: () => number;
}

const defaultWorker = (): BakeWorkerLike => new Worker(new URL('./bake.worker.ts', import.meta.url), { type: 'module' });

export function bakeOffThread(o: { scrubCount: number; seed: number }, d: BakeOptions = {}): Promise<BakeResult> {
  const createWorker = d.createWorker ?? defaultWorker, fallback = d.fallback ?? bakeWorld, timeoutMs = d.timeoutMs ?? BAKE_TIMEOUT_MS;
  const now = d.now ?? (() => performance.now());
  return new Promise<BakeResult>((resolve, reject) => {
    let done = false, w: BakeWorkerLike | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const t0 = now();
    const finish = () => {
      done = true;
      if (timer !== undefined) clearTimeout(timer);
      try { w?.terminate(); } catch { /* already gone */ }
    };
    const fall = (why: string) => {
      if (done) return;
      finish();
      console.warn(`world: bake worker failed (${why}), baking on the main thread`);
      try { resolve(fallback(o)); } catch (err) { reject(err); }
    };
    const fail = (why: string) => {
      if (done) return;
      finish();
      reject(new Error(`world: bake worker ${why}`));
    };
    /** An error: fall back if it came right away (no workers here), else give up (a slow device). */
    const errored = (why: string) => (now() - t0 <= EARLY_ERROR_MS ? fall(why) : fail(`failed late (${why})`));
    if (d.job) d.job.cancel = () => { if (done) return; finish(); reject(new Error('bake cancelled')); };
    try { w = createWorker(); } catch (err) { fall(String(err)); return; }
    w.onmessage = (e: MessageEvent<{ r?: BakeResult; error?: string }>) => {
      if (done) return;
      if (e.data?.r) { finish(); resolve(e.data.r); } else errored(e.data?.error ?? 'no result');
    };
    w.onerror = (e) => errored(e?.message || 'worker error');
    w.onmessageerror = () => errored('messageerror');
    timer = setTimeout(() => fail(`gave no answer in ${timeoutMs} ms`), timeoutMs);
    w.postMessage(o);
  });
}
