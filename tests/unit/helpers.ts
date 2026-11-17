import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import fg from 'fast-glob';

export const glob = (p: string) => fg.sync(p, { dot: false });
export const read = (f: string) => readFileSync(f, 'utf8');

const BINARY = /\.(png|jpe?g|gif|webp|avif|ico|pdf|woff2?|ttf|otf|zip|gz|mp4|webm|mp3)$/i;
const SKIP = [/^public\/CSCE-313\//, /(^|\/)package-lock\.json$/, /(^|\/)(yarn\.lock|pnpm-lock\.yaml)$/];

// Tracked text files: binaries, verbatim course material and lockfiles are skipped.
export function trackedTextFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\0').filter((f) => f && !BINARY.test(f) && !SKIP.some((re) => re.test(f)));
}
