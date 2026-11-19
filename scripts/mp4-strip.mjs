// Drops the user-data box (moov/udta: the iTunes ilst ffmpeg writes even with -map_metadata -1)
// from MP4 files in place, and shifts the chunk offsets (stco/co64) when mdat follows moov
// (+faststart), so the files still play. Usage: node scripts/mp4-strip.mjs <file.mp4>...
import { readFileSync, writeFileSync } from 'node:fs';

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl']);

function boxes(b, start, end) {
  const out = [];
  for (let o = start; o + 8 <= end; ) {
    let size = b.readUInt32BE(o);
    let hdr = 8;
    if (size === 1) { size = Number(b.readBigUInt64BE(o + 8)); hdr = 16; } else if (size === 0) size = end - o;
    if (size < hdr || o + size > end) throw new Error(`bad box at ${o}`);
    out.push({ type: b.toString('latin1', o + 4, o + 8), start: o, hdr, end: o + size });
    o += size;
  }
  return out;
}

function shiftOffsets(b, box, by) {
  for (const c of boxes(b, box.start + box.hdr, box.end)) {
    if (CONTAINERS.has(c.type)) shiftOffsets(b, c, by);
    else if (c.type === 'stco' || c.type === 'co64') {
      const n = b.readUInt32BE(c.start + c.hdr + 4);
      const wide = c.type === 'co64';
      for (let i = 0, p = c.start + c.hdr + 8; i < n; i++, p += wide ? 8 : 4) {
        if (wide) b.writeBigUInt64BE(b.readBigUInt64BE(p) - BigInt(by), p);
        else b.writeUInt32BE(b.readUInt32BE(p) - by, p);
      }
    }
  }
}

for (const file of process.argv.slice(2)) {
  const b = readFileSync(file);
  const top = boxes(b, 0, b.length);
  const moov = top.find((x) => x.type === 'moov');
  const mdat = top.find((x) => x.type === 'mdat');
  if (!moov || !mdat) throw new Error(`${file}: no moov or mdat`);
  if (moov.hdr !== 8) throw new Error(`${file}: 64-bit moov not handled`);
  const udta = boxes(b, moov.start + 8, moov.end).filter((x) => x.type === 'udta');
  if (!udta.length) { console.log(`${file}: clean`); continue; }
  const cut = udta.reduce((n, u) => n + (u.end - u.start), 0);
  b.writeUInt32BE(moov.end - moov.start - cut, moov.start);
  if (mdat.start > moov.start) shiftOffsets(b, moov, cut);
  const keep = [];
  let at = 0;
  for (const u of udta) { keep.push(b.subarray(at, u.start)); at = u.end; }
  keep.push(b.subarray(at));
  writeFileSync(file, Buffer.concat(keep));
  console.log(`${file}: dropped ${cut} bytes of udta`);
}
