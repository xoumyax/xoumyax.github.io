// The 28 colours every pixel scene shares (same order as PALETTE in scripts/pixel-scenes.py).
// Kept free of imports so the client canvas script stays light.
export const PALETTE: readonly [number, number, number][] = [
  [244, 241, 236], [210, 216, 223], [193, 202, 213], [219, 200, 176],
  [169, 204, 227], [185, 211, 194], [171, 185, 201], [136, 179, 159],
  [174, 157, 124], [143, 152, 156], [118, 163, 151], [140, 133, 113],
  [110, 159, 193], [89, 131, 134], [67, 128, 182], [239, 141, 25],
  [107, 103, 102], [58, 110, 113], [88, 109, 65], [95, 86, 83],
  [54, 69, 35], [66, 50, 44], [20, 93, 152], [52, 76, 99],
  [24, 39, 54], [40, 47, 29], [31, 31, 17], [14, 15, 8],
];

/** Each colour as a little-endian 0xAABBGGRR word, alpha 255, for writing straight into ImageData. */
export const PAL32 = new Uint32Array(PALETTE.map(([r, g, b]) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0));
