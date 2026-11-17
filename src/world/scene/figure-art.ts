// Hand-made glyph sprites for Soumya and Jen, drawn facing right; the overlay mirrors them to face left.
// Each sprite row is a [glyphs, keys] pair of the same length. A key picks a palette entry: `bg` fills
// the cell (the silhouette and its colour mass) and `fg` colours the glyph on top (texture). A space
// key is an empty cell. Read by silhouette and colour, no faces: the two walkers are told apart by
// hair, clothing and colour (see PALETTE).

export interface Sprite { rows: string[]; keys: string[] }
export interface SpriteSet { stand: Sprite; walk: [Sprite, Sprite, Sprite, Sprite] }

export const PALETTE: Record<string, { fg: string; bg: string }> = {
  // Soumya
  h: { fg: '#4e3f36', bg: '#120d0a' },   // dark wavy hair
  s: { fg: '#f0c09a', bg: '#a8765a' },   // skin
  b: { fg: '#7e5c46', bg: '#2e1d14' },   // beard
  j: { fg: '#6d727c', bg: '#2a2d34' },   // charcoal jacket
  t: { fg: '#3a3a40', bg: '#0c0c0f' },   // black tee under it
  p: { fg: '#4c5059', bg: '#1a1c22' },   // dark trousers, near leg
  q: { fg: '#3a3d45', bg: '#111216' },   // far leg
  f: { fg: '#55524e', bg: '#090909' },   // shoes
  // Jen
  r: { fg: '#b4485e', bg: '#5a1f2b' },   // long burgundy-dark hair
  k: { fg: '#ffe2cc', bg: '#c49a82' },   // fair skin
  K: { fg: '#d8b8a2', bg: '#8e6c5a' },   // far leg
  d: { fg: '#4f4552', bg: '#141116' },   // black dress
  e: { fg: '#6e6372', bg: '#1d1920' },   // dress hem, catching light
};

type Row = [string, string];
/** A sprite from [glyphs, keys] row pairs. */
function P(...rows: Row[]): Sprite {
  if (rows.some(([g, k]) => g.length !== k.length || g.length !== rows[0][0].length)) throw new Error('sprite rows differ in shape');
  return { rows: rows.map((r) => r[0]), keys: rows.map((r) => r[1]) };
}

// ---------------------------------------------------------------- desktop: 7 × 9 cells
const SOUMYA_HEAD: Row[] = [
  ['  &@%  ', '  hhh  '],
  ['  @#>  ', '  hss  '],
  ['  [#w  ', '  jbb  '],
];
// stride: arms out, legs apart; passing: arms in, one leg lifted. The far limb takes the darker key.
type SLeg = 'p' | 'q';
const SOUMYA_STRIDE = (near: SLeg, far: SLeg): Row[] => [
  [' /#|#\\ ', ' jjtjj '],
  [" '#|#' ", ' sjtjs '],
  ['  =#=  ', '  jjj  '],
  ['  /^\\  ', `  ${far}${near}${near}  `],
  [' /   \\ ', ` ${far}   ${near} `],
  ['_=   =>', 'ff   ff'],
];
const SOUMYA_PASS = (stand: SLeg, lift: SLeg): Row[] => [
  ['  #|#  ', '  jtj  '],
  ["  #|#' ", '  jtjs '],
  ['  =#=  ', '  jjj  '],
  ['   |\\  ', `   ${stand}${lift}  `],
  ['   | > ', `   ${stand} ${lift} `],
  ['   =>  ', '   ff  '],
];
const JEN_HEAD: Row[] = [
  ['  &@@  ', '  rrr  '],
  [' (@#>  ', ' rrkk  '],
  [' (@88  ', ' rrdd  '],
];
type JLeg = 'k' | 'K';
const JEN_STRIDE = (near: JLeg, far: JLeg): Row[] => [
  [' ((88\\ ', ' rrddk '],
  ["  888' ", '  dddk '],
  [' /888\\ ', ' eeeee '],
  ['  / \\  ', `  ${far} ${near}  `],
  [' /   \\ ', ` ${far}   ${near} `],
  ['^     >', 'f     f'],
];
const JEN_PASS = (stand: JLeg, lift: JLeg): Row[] => [
  [' ((88  ', ' rrdd  '],
  ["  888' ", '  dddk '],
  [' /888\\ ', ' eeeee '],
  ['   |\\  ', `   ${stand}${lift}  `],
  ['   | > ', `   ${stand} ${lift} `],
  ['   ^   ', '   f   '],
];

export const DESKTOP: { soumya: SpriteSet; jen: SpriteSet } = {
  soumya: {
    stand: P(...SOUMYA_HEAD,
      ['  #|#  ', '  jtj  '],
      ['  #|#  ', '  jtj  '],
      ['  =#=  ', '  jjj  '],
      ['  | |  ', '  q p  '],
      ['  | |  ', '  q p  '],
      ['  = => ', '  f ff '],
    ),
    walk: [
      P(...SOUMYA_HEAD, ...SOUMYA_STRIDE('p', 'q')),
      P(...SOUMYA_HEAD, ...SOUMYA_PASS('p', 'q')),
      P(...SOUMYA_HEAD, ...SOUMYA_STRIDE('q', 'p')),
      P(...SOUMYA_HEAD, ...SOUMYA_PASS('q', 'p')),
    ],
  },
  jen: {
    stand: P(...JEN_HEAD,
      [' ((88  ', ' rrdd  '],
      ['  888  ', '  ddd  '],
      [' /888\\ ', ' eeeee '],
      ['  | |  ', '  K k  '],
      ['  | |  ', '  K k  '],
      ['  ^ ^  ', '  f f  '],
    ),
    walk: [
      P(...JEN_HEAD, ...JEN_STRIDE('k', 'K')),
      P(...JEN_HEAD, ...JEN_PASS('k', 'K')),
      P(...JEN_HEAD, ...JEN_STRIDE('K', 'k')),
      P(...JEN_HEAD, ...JEN_PASS('K', 'k')),
    ],
  },
};

// ---------------------------------------------------------------- phone: 4 × 6 cells
// phone Soumya: no room for a beard row, so the lower face cell is the beard
const SH: Row[] = [['&@% ', 'hhh '], ['@#w ', 'hsb ']];
const JH: Row[] = [[' @@ ', ' rr '], ['(#> ', 'rkk ']];
export const PHONE: { soumya: SpriteSet; jen: SpriteSet } = {
  soumya: {
    stand: P(...SH, ['#|# ', 'jtj '], ['=#= ', 'jjj '], ['| | ', 'q p '], ['= =>', 'f ff']),
    walk: [
      P(...SH, ['#|#\\', 'jtjs'], ['/^\\ ', 'qpp '], ['/  \\', 'q  p'], ['=  >', 'f  f']),
      P(...SH, ['#|# ', 'jtj '], ['=#= ', 'jjj '], [' |\\ ', ' pq '], [' => ', ' ff ']),
      P(...SH, ['#|#\\', 'jtjs'], ['/^\\ ', 'ppq '], ['/  \\', 'p  q'], ['=  >', 'f  f']),
      P(...SH, ['#|# ', 'jtj '], ['=#= ', 'jjj '], [' |\\ ', ' qp '], [' => ', ' ff ']),
    ],
  },
  jen: {
    stand: P(...JH, ['(88 ', 'rdd '], ['/88\\', 'eeee'], [' || ', ' Kk '], [' ^^ ', ' ff ']),
    walk: [
      P(...JH, ['(88\\', 'rddk'], ['/88\\', 'eeee'], ['/  \\', 'K  k'], ['^  >', 'f  f']),
      P(...JH, ['(88 ', 'rdd '], ['/88\\', 'eeee'], [' |\\ ', ' kK '], [' ^  ', ' f  ']),
      P(...JH, ['(88\\', 'rddk'], ['/88\\', 'eeee'], ['/  \\', 'k  K'], ['^  >', 'f  f']),
      P(...JH, ['(88 ', 'rdd '], ['/88\\', 'eeee'], [' |\\ ', ' Kk '], [' ^  ', ' f  ']),
    ],
  },
};

// ---------------------------------------------------------------- the horse: a cream palomino grazing on the bank
// (Its 3D version read as an orange bar of `&$` glyphs, so it gets the sprite treatment too.)
// Walking: head up, legs alternating. Grazing: neck down to the grass, a tail swish.
/**
 * The horse's coat colour (cream palomino, owner's choice 2026-11-16, matching the Big Bend river photo). Change it here: this one value sets the
 * coat, the far legs and the mane; their shades keep its hue and saturation (see `coatTone`).
 */
export const HORSE_COAT = '#e3c38c';

/** The coat's hue and saturation (scaled by `sat`) at HSL lightness `l`, as #rrggbb. */
function coatTone(l: number, sat = 1): string {
  const n = parseInt(HORSE_COAT.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, L = (mx + mn) / 2;
  const S = d === 0 ? 0 : d / (1 - Math.abs(2 * L - 1));
  const H = d === 0 ? 0 : mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const s = Math.min(1, S * sat), C = (1 - Math.abs(2 * l - 1)) * s, X = C * (1 - Math.abs((H % 2) - 1)), m = l - C / 2;
  const [r1, g1, b1] = H < 1 ? [C, X, 0] : H < 2 ? [X, C, 0] : H < 3 ? [0, C, X] : H < 4 ? [0, X, C] : H < 5 ? [X, 0, C] : [C, 0, X];
  return `#${[r1, g1, b1].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}

export const HORSE_PALETTE: Record<string, { fg: string; bg: string }> = {
  c: { fg: HORSE_COAT, bg: coatTone(0.3) },                 // coat
  C: { fg: coatTone(0.45, 0.82), bg: coatTone(0.22) },      // far legs
  m: { fg: coatTone(0.28, 0.86), bg: coatTone(0.1) },       // mane and tail
  l: { fg: '#5a3a26', bg: '#1e120a' },                      // lower legs, hooves
  w: { fg: '#fff0da', bg: '#c0a688' },                      // blaze
};
export interface HorseSet { walk: [Sprite, Sprite]; graze: [Sprite, Sprite] }
export const HORSE_DESKTOP: HorseSet = {
  walk: [
    P(['         %@^ ', '         mcc '],
      ['        %##\\>', '        mcccw'],
      ['  ~######/   ', '  mccccccc   '],
      [' (########   ', ' mcccccccc   '],
      [' ( /|   |\\   ', ' m Cc   Cc   '],
      ['   ||   ||   ', '   ll   ll   ']),
    P(['         %@^ ', '         mcc '],
      ['        %##\\>', '        mcccw'],
      ['  ~######/   ', '  mccccccc   '],
      [' (########   ', ' mcccccccc   '],
      [' ( |\\   /|   ', ' m cC   cC   '],
      ['   ||   ||   ', '   ll   ll   ']),
  ],
  graze: [
    P(['             ', '             '],
      ['             ', '             '],
      ['  ~#######%  ', '  mcccccccm  '],
      [' (#########\\ ', ' mcccccccccc '],
      [' ( ||   || \\ ', ' m Cc   Cc c '],
      ['   ||   || #>', '   ll   ll cw']),
    P(['             ', '             '],
      ['             ', '             '],
      ['  ~#######%  ', '  mcccccccm  '],
      [' {#########\\ ', ' mcccccccccc '],
      [' ) ||   || \\ ', ' m Cc   Cc c '],
      ['   ||   || #>', '   ll   ll cw']),
  ],
};
export const HORSE_PHONE: HorseSet = {
  walk: [
    P(['      %^', '      mc'], ['     %#>', '     mcw'], ['(#####/ ', 'mcccccc '], [' /|  |\\ ', ' Cc  Cc ']),
    P(['      %^', '      mc'], ['     %#>', '     mcw'], ['(#####/ ', 'mcccccc '], [' |\\  /| ', ' cC  cC ']),
  ],
  graze: [
    P(['        ', '        '], [' ~####% ', ' mccccm '], ['(#####\\ ', 'mCcccCc '], [' ||  |#>', ' ll  lcw']),
    P(['        ', '        '], [' ~####% ', ' mccccm '], ['{#####\\ ', 'mCcccCc '], [' ||  |#>', ' ll  lcw']),
  ],
};

const MIRROR: Record<string, string> = { '/': '\\', '\\': '/', '(': ')', ')': '(', '<': '>', '>': '<', '[': ']', ']': '[', '{': '}', '}': '{' };
/** The same sprite facing left. */
export function mirror(s: Sprite): Sprite {
  return {
    rows: s.rows.map((r) => [...r].reverse().map((c) => MIRROR[c] ?? c).join('')),
    keys: s.keys.map((k) => [...k].reverse().join('')),
  };
}
