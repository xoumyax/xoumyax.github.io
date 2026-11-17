import { test, expect, vi, afterEach } from 'vitest';
import { bakeOffThread, BAKE_TIMEOUT_MS, EARLY_ERROR_MS, type BakeWorkerLike } from '../../src/world/bake-client';
import type { BakeResult } from '../../src/world/bake';

// M7 (Task 10b) and I8: a worker that never answers must not hang the mount, and must not freeze
// the page with a main-thread bake either: after BAKE_TIMEOUT_MS (10 s) the bake rejects and boot
// shows the poster. Only a worker that cannot run at all (cannot be constructed, or errors at
// once) falls back to baking on the main thread.

const fake = { meta: { cols: 1, rows: 1 } } as unknown as BakeResult;
const fromWorker = { meta: { cols: 2, rows: 2 } } as unknown as BakeResult;

class FakeWorker implements BakeWorkerLike {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  onmessageerror: ((e: MessageEvent) => void) | null = null;
  terminated = false;
  posted: unknown[] = [];
  postMessage(m: unknown) { this.posted.push(m); }
  terminate() { this.terminated = true; }
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

test('the bake timeout is 10 s', () => {
  expect(BAKE_TIMEOUT_MS).toBe(10000);
});

test('a worker that answers is used and terminated', async () => {
  const w = new FakeWorker(), fallback = vi.fn(() => fake);
  const p = bakeOffThread({ scrubCount: 10, seed: 1 }, { createWorker: () => w, fallback });
  expect(w.posted).toEqual([{ scrubCount: 10, seed: 1 }]);
  w.onmessage!({ data: { r: fromWorker } } as MessageEvent);
  await expect(p).resolves.toBe(fromWorker);
  expect(fallback).not.toHaveBeenCalled();
  expect(w.terminated).toBe(true);
});

test('a worker that never answers rejects at the timeout, with no main-thread bake (I8)', async () => {
  vi.useFakeTimers();
  const w = new FakeWorker(), fallback = vi.fn(() => fake);
  const p = bakeOffThread({ scrubCount: 10, seed: 1 }, { createWorker: () => w, fallback });
  const settled = vi.fn();
  p.then(settled, settled);
  await vi.advanceTimersByTimeAsync(BAKE_TIMEOUT_MS - 1);
  expect(settled).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(2);
  await expect(p).rejects.toThrow(/no answer in 10000 ms/);
  expect(fallback).not.toHaveBeenCalled();
  expect(w.terminated).toBe(true);
  // a late answer after the timeout is ignored (no double settle, no bake)
  w.onmessage?.({ data: { r: fromWorker } } as MessageEvent);
  expect(fallback).not.toHaveBeenCalled();
});

test('messageerror and error right away fall back to the main-thread bake', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  for (const fire of [(w: FakeWorker) => w.onmessageerror!({} as MessageEvent), (w: FakeWorker) => w.onerror!({ message: 'boom' } as ErrorEvent)]) {
    const w = new FakeWorker(), fallback = vi.fn(() => fake);
    const p = bakeOffThread({ scrubCount: 10, seed: 1 }, { createWorker: () => w, fallback });
    fire(w);
    await expect(p).resolves.toBe(fake);
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(w.terminated).toBe(true);
  }
});

test('an error long after the start rejects instead of freezing the page (I8)', async () => {
  let t = 0;
  const w = new FakeWorker(), fallback = vi.fn(() => fake);
  const p = bakeOffThread({ scrubCount: 10, seed: 1 }, { createWorker: () => w, fallback, now: () => t });
  t = EARLY_ERROR_MS + 1;
  w.onerror!({ message: 'boom' } as ErrorEvent);
  await expect(p).rejects.toThrow(/failed late/);
  expect(fallback).not.toHaveBeenCalled();
  expect(w.terminated).toBe(true);
});

test('a worker that cannot be constructed falls back', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const fallback = vi.fn(() => fake);
  await expect(bakeOffThread({ scrubCount: 10, seed: 1 }, { createWorker: () => { throw new Error('no workers'); }, fallback })).resolves.toBe(fake);
});

test('cancel() terminates a pending worker (an abort or a dispose during mount)', async () => {
  const w = new FakeWorker(), fallback = vi.fn(() => fake);
  const job = { cancel: () => {} };
  const p = bakeOffThread({ scrubCount: 10, seed: 1 }, { createWorker: () => w, fallback, job });
  job.cancel();
  expect(w.terminated).toBe(true);
  await expect(p).rejects.toThrow(/cancel/);
  expect(fallback).not.toHaveBeenCalled();
});
