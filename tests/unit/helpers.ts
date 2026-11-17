import { readFileSync } from 'node:fs';
import fg from 'fast-glob';

export const glob = (p: string) => fg.sync(p, { dot: false });
export const read = (f: string) => readFileSync(f, 'utf8');
