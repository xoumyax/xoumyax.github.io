import { describe, it, expect } from 'vitest';
import { read } from './helpers';

const css = read('src/styles/tokens.css');
const block = (sel: string) => {
  const i = css.indexOf(sel);
  return css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
};
const vars = (body: string) => Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]));
const light = vars(block(':root {'));
const dark = { ...light, ...vars(block(":root[data-mode='dark']")) };

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (c: number[]) => {
  const [r, g, b] = c.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(rgb(a)), lum(rgb(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('mode tokens', () => {
  it('the device-dark media block repeats the data-mode dark values', () => {
    const media = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'));
    expect(vars(media)).toEqual(vars(block(":root[data-mode='dark']")));
  });

  for (const [mode, t] of [['light', light], ['dark', dark]] as const) {
    describe(mode, () => {
      // Text pairs in use. The 84/88/94% paper panels are approximated as paper, the
      // 70-90% blends of ink into paper used for secondary text are checked separately.
      const pairs: [string, string, string][] = [
        ['ink on paper', t.ink, t.paper],
        ['paper on ink (pager current, buttons)', t.paper, t.ink],
        ['ink on sand', t.ink, t.sand],
        ['char on amber', t.char, t.amber],
        ['cream on rust (cover)', t.cream, t.rust],
        ['cream on storm (cover)', t.cream, t.storm],
        ['char on sage (cover)', t.char, t.sage],
        ['char on sand-lit (cover)', t.char, t['sand-lit']],
        ['cream on night', t.cream, t.night],
        ['night on amber', t.night, t.amber],
      ];
      for (const [name, fg, bg] of pairs) {
        it(`${name} >= 4.5`, () => expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5));
      }
      it('secondary text (ink at 75%) on paper >= 4.5', () => {
        const mix = (a: string, b: string, k: number) => '#' + rgb(a).map((v, i) => Math.round(v * k + rgb(b)[i] * (1 - k)).toString(16).padStart(2, '0')).join('');
        expect(ratio(mix(t.ink, t.paper, 0.75), t.paper)).toBeGreaterThanOrEqual(4.5);
      });
    });
  }
});
