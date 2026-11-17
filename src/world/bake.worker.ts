// Runs the bake off the main thread and transfers the typed arrays back (zero copy).
import { bakeWorld, bakeTimings, bakeTransfer } from './bake';

self.onmessage = (e: MessageEvent<{ scrubCount: number; seed: number }>) => {
  try {
    const r = bakeWorld(e.data);
    (self as unknown as Worker).postMessage({ r, ms: bakeTimings }, bakeTransfer(r));
  } catch (err) {
    (self as unknown as Worker).postMessage({ error: String((err as Error)?.stack ?? err) });
  }
};
