"""Turn Big Bend photos into the seven pixel-art home-page scenes, one shared palette.
usage: python -I scripts/pixel-scenes.py <album_dir> [--only <id,id>] [--sheet <out.png>] [--new-palette]
Writes public/scenes/<id>.png (240x135), <id>-m.png (120x214) and public/og.png (1440x810).
A scene with world settings and an art module scripts/scene_art/<id>.py is also cut into a
layered world, public/scenes/<id>/ (scene.json + indexed layer and sprite PNGs); its flat files
are then the world's rest frame cropped at its two views. --only regenerates just those scenes
(og.png only when the hero is among them).
This is the only file in the repo allowed to name the source photos."""
import importlib, json, math, os, sys
from PIL import Image, ImageOps, ImageEnhance, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # -I leaves the script dir off sys.path
from scene_art import common as art_common
LAND, PORT = (240, 135), (120, 214)
K = 28
STRENGTH = 14
PULL = 0.22

# id -> (photo, landscape crop, portrait crop); a crop is (cx, cy) or (cx, cy, zoom), see load().
# Crops are judged on the built page with the section centred: the panel and deck cover most of
# the middle, so each subject is placed in what they leave free. hero: the Chisos peak right of
# the YARAikiba card (desktop), in the band above the intro panel (phone). phd's crops are unused
# while it has a world (see its world settings). now (phone):
# the lit door left of the deck. river (phone): the camp between the panel and the footer.
SCENES = {
    'hero':      ('DSC04135.JPG', (0.42, 1, 1.3), (0.85, 1, 1.9)),
    'srm':       ('DSC04305.JPG', (0.5, 0.55), (0.5, 0.55)),
    'cognizant': ('DSC04343.JPG', (0.5, 0.55), (0.5, 0.55)),
    'ms':        ('IMG_1444.JPG', (0.5, 0.55), (0.5, 0.55)),
    'phd':       ('DSC04340.JPG', (0.82, 1, 1.8), (0.52, 0, 1.35), {
        # A world at 400 px per photo width (the old crops were 432): the horse is ~72 px wide,
        # so on a phone its rest pose sits inside the middle 90 px of the 120 px view and its
        # whole swing (grazing head, tail swish, camera drift) inside the ~97 px a phone shows.
        # Desktop keeps the old framing: the horse in the free column left of the deck.
        'density': 400, 'world': (264, 224), 'centre': (0.669, 0.5776),
        'land': (6, 89), 'port': (8, 10)}),
    'now':       ('IMG_7089.JPG', (0.5, 0.55), (1, 0.5, 1.27)),
    'river':     ('IMG_7241.JPG', (0.5, 0.55), (0.55, 0, 1.22)),
}
# The shared palette, fixed so a crop change never recolours the other scenes. It was made by
# build_palette() (median cut + k-means over the seven landscape crops, each colour pulled
# toward the site tokens); run with --new-palette to print a fresh one instead of using it.
PALETTE = [
    (244, 241, 236), (210, 216, 223), (193, 202, 213), (219, 200, 176),
    (169, 204, 227), (185, 211, 194), (171, 185, 201), (136, 179, 159),
    (174, 157, 124), (143, 152, 156), (118, 163, 151), (140, 133, 113),
    (110, 159, 193), (89, 131, 134), (67, 128, 182), (239, 141, 25),
    (107, 103, 102), (58, 110, 113), (88, 109, 65), (95, 86, 83),
    (54, 69, 35), (66, 50, 44), (20, 93, 152), (52, 76, 99),
    (24, 39, 54), (40, 47, 29), (31, 31, 17), (14, 15, 8),
]
COOL_GUARD = {'now'}
TOKENS = [(0xF5,0xF2,0xEC),(0x1D,0x1B,0x18),(0xE9,0xDC,0xC4),(0x8A,0x9A,0x6B),
          (0xA4,0x50,0x2E),(0x4F,0x62,0x72),(0xF0,0xA4,0x3A)]
LIGHT_TOKENS = TOKENS[:3]   # paper, ink, sand: the only pull targets for pale, low-chroma colours
BAYER = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]]

def d2(a, b): return sum((x - y) ** 2 for x, y in zip(a, b))
def lum(c): return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]
def chroma(c): return max(c) - min(c)

def load(path, size, crop):
    # crop = (cx, cy) or (cx, cy, zoom): the largest window of the scene's shape, shrunk by zoom,
    # placed at (cx, cy) of the slack as in ImageOps.fit (zoom 1 is exactly ImageOps.fit).
    im = ImageOps.exif_transpose(Image.open(path)).convert('RGB')
    cx, cy, zoom = (*crop, 1)[:3]
    if zoom == 1:
        im = ImageOps.fit(im, size, Image.LANCZOS, centering=(cx, cy))
    else:
        W, H = im.size
        cw, ch = (W, W * size[1] / size[0]) if W * size[1] <= H * size[0] else (H * size[0] / size[1], H)
        cw, ch = cw / zoom, ch / zoom
        x0, y0 = (W - cw) * cx, (H - ch) * cy
        im = im.resize(size, Image.LANCZOS, box=(x0, y0, x0 + cw, y0 + ch))
    im = ImageEnhance.Contrast(im).enhance(1.18)
    return ImageEnhance.Color(im).enhance(1.12)

def pull(c):
    # Pale cream/white must stay pale: amber and rust would turn highlights orange, so colours
    # that are light and low-chroma may only move toward paper/sand.
    pale = lum(c) > 170 and chroma(c) < 70
    pool = LIGHT_TOKENS if pale else TOKENS
    t = min(pool, key=lambda t: d2(c, t))
    return tuple(max(0, min(255, round(x * (1 - PULL) + y * PULL))) for x, y in zip(c, t))

def build_palette(lands):
    w, h = LAND
    mont = Image.new('RGB', (w * len(lands), h))
    for i, im in enumerate(lands): mont.paste(im, (i * w, 0))
    q = mont.quantize(colors=K, method=Image.Quantize.MEDIANCUT, kmeans=4)
    raw = q.getpalette()[:3 * K]
    cols = [tuple(raw[i:i + 3]) for i in range(0, len(raw), 3)]
    used = {i for _, i in q.getcolors()}
    cols = [c for i, c in enumerate(cols) if i in used]
    pal = []
    for c in map(pull, cols):
        if c not in pal: pal.append(c)
    return pal

def tame(c):
    # Sunlit cream (the horse, the dome) reads as orange once quantised. Warm pixels that are
    # bright but only moderately saturated keep their lightness and lose chroma; the truly
    # saturated door (chroma well above 175) is left alone.
    l = lum(c)
    ch = chroma(c)
    if l > 110 and c[0] >= c[1] >= c[2] and 60 < ch < 175:
        k = 60 / ch
        return tuple(l + (v - l) * k for v in c)
    return c

def render(im, pal, cool=False):
    w, h = im.size
    px = im.load()
    idx = []
    vivid = [i for i, c in enumerate(pal) if chroma(c) > 150]
    calm = [i for i in range(len(pal)) if i not in vivid]
    # now's blue-grey storm cloud sits nearer the warm dark greys than any cool entry and comes
    # out as a reddish smudge in a blue sky: with `cool`, clearly cool pixels never land on a warm
    # dark entry. Only the scenes in COOL_GUARD use it, so the other scenes stay as they are.
    warm_dark = {i for i, c in enumerate(pal) if c[0] > c[2] and lum(c) < 150}
    cool_pool = [i for i in range(len(pal)) if i not in warm_dark]
    for y in range(h):
        for x in range(w):
            o = (BAYER[y % 4][x % 4] / 16 - 0.5) * STRENGTH
            c = tame(px[x, y])
            p = tuple(v + o for v in c)
            # Warm cream shadows (horse, dome) sit nearer a vivid orange entry than any tan one;
            # only genuinely saturated source pixels may land on a vivid palette entry.
            pool = range(len(pal)) if chroma(c) > 110 or not vivid else calm
            if cool and c[2] - c[0] >= 12: pool = [i for i in pool if i in cool_pool]
            idx.append(min(pool, key=lambda i: d2(p, pal[i])))
    out = Image.new('P', im.size)
    flat = [v for c in pal for v in c]
    out.putpalette(flat)
    out.putdata(idx)
    return out

def world_image(path, cfg):
    # The world window of the photo at cfg's density, enhanced like load() (not quantised).
    # Returns the image and to_world(x, y): photo px -> world px, for cut lines in photo coords.
    im = ImageOps.exif_transpose(Image.open(path)).convert('RGB')
    W, H = im.size
    k = cfg['density'] / W                       # world px per photo px
    ww, wh = cfg['world']
    x0 = cfg['centre'][0] * W - ww / k / 2
    y0 = cfg['centre'][1] * H - wh / k / 2
    assert x0 >= 0 and y0 >= 0 and x0 + ww / k <= W + 1e-6 and y0 + wh / k <= H + 1e-6, 'world leaves the photo'
    im = im.resize((ww, wh), Image.LANCZOS, box=(x0, y0, x0 + ww / k, y0 + wh / k))
    im = ImageEnhance.Contrast(im).enhance(1.18)
    im = ImageEnhance.Color(im).enhance(1.12)
    return im, lambda x, y: ((x - x0) * k, (y - y0) * k)

def build_world(k, album):
    # Cuts scene k into its world, writes public/scenes/<k>/ and returns (art, meta, rest grid).
    photo, _, _, cfg = SCENES[k]
    mod = importlib.import_module('scene_art.' + k)
    world, to_world = world_image(os.path.join(album, photo), cfg)
    art = mod.build(world, lambda im: render(im, PALETTE, k in COOL_GUARD), to_world)
    ww, wh = cfg['world']
    out = os.path.join(ROOT, 'public', 'scenes', k)
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):                    # no stale layers from an earlier cut
        if f.endswith('.png') or f == 'scene.json': os.remove(os.path.join(out, f))
    pal = PALETTE + [(0, 0, 0)]
    assert art.layers[0].depth == 0 and art_common.KEY not in art.layers[0].px, 'layers[0] must be opaque, depth 0'
    for L in art.layers:
        art_common.write_png(os.path.join(out, L.name + '.png'), ww, wh, L.px, pal)
    for sp in art.sprites:
        art_common.write_png(os.path.join(out, sp.name + '.png'), sp.w, sp.h * len(sp.frames),
                             [v for f in sp.frames for v in f], pal)
    meta = {
        'id': k, 'world': [ww, wh], 'view': {'land': list(cfg['land']), 'port': list(cfg['port'])},
        'layers': [dict({'name': L.name, 'depth': L.depth, 'rate': L.rate}, **({'travel': list(L.travel)} if L.travel else {}))
                   for L in art.layers],
        'sprites': [{'name': sp.name, 'w': sp.w, 'h': sp.h, 'frames': len(sp.frames), 'at': list(sp.at),
                     'layer': sp.layer, 'rest': sp.rest} for sp in art.sprites],
    }
    with open(os.path.join(out, 'scene.json'), 'w') as f:
        json.dump(meta, f, indent=1)
        f.write('\n')
    return art, meta, art_common.composite(art, ww, wh)

def crop(grid, ww, at, size):
    x0, y0 = at
    return [grid[(y0 + y) * ww + x0 + x] for y in range(size[1]) for x in range(size[0])]

def main():
    args = sys.argv[1:]
    if not args: sys.exit(__doc__)
    album = args[0]
    sheet = args[args.index('--sheet') + 1] if '--sheet' in args else None
    only = args[args.index('--only') + 1].split(',') if '--only' in args else list(SCENES)
    bad = [k for k in only if k not in SCENES]
    if bad: sys.exit('unknown scene: ' + ', '.join(bad))
    if '--new-palette' in args:
        lands = [load(os.path.join(album, v[0]), LAND, v[1]) for v in SCENES.values()]
        print(build_palette(lands))
        return
    pal = PALETTE
    out_dir = os.path.join(ROOT, 'public', 'scenes')
    os.makedirs(out_dir, exist_ok=True)
    done, worlds = {}, {}
    for k in only:
        v = SCENES[k]
        if len(v) > 3 and os.path.exists(os.path.join(ROOT, 'scripts', 'scene_art', k + '.py')):
            art, meta, rest = build_world(k, album)
            worlds[k] = (art, meta, rest)
            ww = meta['world'][0]
            for name, at, size in ((k, meta['view']['land'], LAND), (k + '-m', meta['view']['port'], PORT)):
                done[name] = art_common.flat_image(crop(rest, ww, at, size), *size, pal)
        else:
            for name, size, c in ((k, LAND, v[1]), (k + '-m', PORT, v[2])):
                done[name] = render(load(os.path.join(album, v[0]), size, c), pal, k in COOL_GUARD)
        for name in (k, k + '-m'):
            done[name].save(os.path.join(out_dir, name + '.png'), compress_level=9)
    if 'hero' in only:
        og = done['hero'].resize((LAND[0] * 6, LAND[1] * 6), Image.NEAREST)
        og.save(os.path.join(ROOT, 'public', 'og.png'), compress_level=9)
    if sheet:
        parts = [art_common.world_sheet(k, *worlds[k], pal) for k in only if k in worlds]
        flats = [k for k in only if k not in worlds]
        if flats:
            pad, lab, s = 8, 14, 2
            cw = max(LAND[0], PORT[0]) * s
            W = pad + len(flats) * (cw + pad)
            H = pad + lab + LAND[1] * s + pad + lab + PORT[1] * s + pad
            sh = Image.new('RGB', (W, H), (245, 242, 236))
            d = ImageDraw.Draw(sh)
            for i, k in enumerate(flats):
                x = pad + i * (cw + pad)
                d.text((x, pad), k, fill=(29, 27, 24))
                sh.paste(done[k].convert('RGB').resize((LAND[0] * s, LAND[1] * s), Image.NEAREST), (x, pad + lab))
                y2 = pad + lab + LAND[1] * s + pad
                d.text((x, y2), k + '-m', fill=(29, 27, 24))
                sh.paste(done[k + '-m'].convert('RGB').resize((PORT[0] * s, PORT[1] * s), Image.NEAREST), (x, y2 + lab))
            parts.append(sh)
        W = max(p.width for p in parts)
        out = Image.new('RGB', (W, sum(p.height for p in parts)), (245, 242, 236))
        y = 0
        for p in parts:
            out.paste(p, (0, y)); y += p.height
        out.save(sheet)
    print('palette', len(pal), 'files', len(done) + ('hero' in only), 'worlds', ' '.join(worlds) or '-')

if __name__ == '__main__':
    main()
