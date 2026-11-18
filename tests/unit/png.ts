// A tiny PNG reader for the scene asset tests: chunks, and 8-bit indexed pixels (all five filters).
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

export interface Chunk { type: string; data: Buffer }

export function chunks(file: string): Chunk[] {
  const b = readFileSync(file);
  const out: Chunk[] = [];
  let o = 8;
  while (o < b.length) {
    const len = b.readUInt32BE(o);
    out.push({ type: b.toString('latin1', o + 4, o + 8), data: b.subarray(o + 8, o + 8 + len) });
    o += 12 + len;
  }
  return out;
}

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Palette indices of an 8-bit indexed, non-interlaced PNG, row-major. */
export function readIndexed(file: string): { w: number; h: number; px: Uint8Array } {
  const cs = chunks(file);
  const ihdr = cs.find((c) => c.type === 'IHDR')!.data;
  const w = ihdr.readUInt32BE(0);
  const h = ihdr.readUInt32BE(4);
  if (ihdr[8] !== 8 || ihdr[9] !== 3 || ihdr[12] !== 0) throw new Error(`${file}: not 8-bit indexed, non-interlaced`);
  const raw = inflateSync(Buffer.concat(cs.filter((c) => c.type === 'IDAT').map((c) => c.data)));
  if (raw.length !== h * (w + 1)) throw new Error(`${file}: IDAT is ${raw.length} bytes, want ${h * (w + 1)}`);
  const px = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (w + 1)];
    const src = y * (w + 1) + 1;
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const v = raw[src + x];
      const a = x > 0 ? px[row + x - 1] : 0;          // bpp = 1
      const b = y > 0 ? px[row - w + x] : 0;
      const c = x > 0 && y > 0 ? px[row - w + x - 1] : 0;
      let r: number;
      switch (f) {
        case 0: r = v; break;
        case 1: r = v + a; break;
        case 2: r = v + b; break;
        case 3: r = v + ((a + b) >> 1); break;
        case 4: r = v + paeth(a, b, c); break;
        default: throw new Error(`${file}: bad filter ${f} on row ${y}`);
      }
      px[row + x] = r & 0xff;
    }
  }
  return { w, h, px };
}
