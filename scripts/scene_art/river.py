"""Open to work world: the camp by the Rio Grande at dusk. Layers back to front:
sky (opaque: the evening sky with its clouds; below the skyline, where the hills cover it, it is
patches of the hills' own terrain, so a pan shows land behind the hills, never a ghost), hills
(the far range and the slope of the hill on the right, down past the camp's top; under the
camp it is terrain too), camp (the trailers, the carport, the sheds, the truck and the lot,
down past the near scrub's top; under the scrub it is lot and brush), brush (the near scrub).
Sprites on `camp`: lights (frame 0 empty, the camp as generated; frames 1-3 its windows lit, a
few more each step, each frame holding every light of the one before), smoke (frame 0 empty;
frames 1-5 a thin plume from a campfire in front of the trailer, looping as it rises).

Cut lines are found from the photo's colours (the skyline) or are photo-px polylines mapped
with to_world (the camp's top, the near scrub's top)."""
import math, random
from . import common as C
from .common import KEY, BAYER, line_y, lum, wobble

# ---------------------------------------------------------------- photo-space lines
SKY_SEARCH = 1150                     # photo y: the skyline is searched below this (clouds above)
# The camp's top (camp below): over the shed, the blue building and the carport, then down the
# lower slope of the hill on the right.
CAMP = [(0, 1800), (840, 1800), (1320, 1740), (1680, 1630), (2100, 1625), (2460, 1700),
        (2880, 1760), (3480, 1830), (4032, 1860)]
# The near scrub's top (brush below): under the truck, then along the dark clumps.
BRUSH = [(0, 2268), (792, 2292), (1200, 2268), (1800, 2292), (2400, 2280), (3000, 2256),
         (3600, 2232), (4032, 2232)]
CLUMP = 8                             # rows over the scrub's top where dark clumps still belong to it
UNDER = (8, 12)                       # rows the hills and the camp run on under the layer in front

# ---------------------------------------------------------------- the sprites (world px)
DIM, LAMP, GLOW = 8, 15, 3            # tan, amber, warm cream
# Windows (x0, y0, x1, y1 world px, inclusive) and the frame each comes on in; only the dark
# glass in each box is lit, so the window keeps the photo's shape. A window is dim the frame it
# comes on and fully lit from the next.
WINDOWS = [
    ((172, 162, 176, 164), 1),        # the trailer's front window
    ((150, 141, 152, 143), 1),        # the blue building, left
    ((182, 162, 186, 164), 2),        # the trailer's door glass
    ((193, 162, 197, 163), 2),        # the trailer's back window
    ((83, 163, 85, 165), 2),          # the box trailer
    ((158, 141, 160, 143), 3),        # the blue building, right
    ((245, 122, 247, 122), 3),        # the house up the slope
]
LIGHT_FRAMES = 3
FIRE = (207, 173)                     # the campfire (world px): the smoke rises from here; both
                                      # views see it (the phone between the panel and the footer,
                                      # the desktop right of the panel)
SMOKE = (10, 22)                      # the smoke strip's size; the fire is at its bottom, column 3
SMOKE_FRAMES = 5
PUFF_ROWS = 2                         # rows the plume rises a frame
PALE, MIST, HAZE = 1, 2, 6


def is_sky(c): return lum(c) >= 85 or c[2] - c[0] > 70


def build(world, render, to_world):
    W, H = world.size
    rng = random.Random(7241)
    src = list(world.get_flattened_data())
    y_of = lambda py: round(to_world(0, py)[1])

    # ------------------------------------------------------------ cut lines
    sk = []                                     # skyline: the first of 3 rows of land
    for x in range(W):
        r = None
        for y in range(y_of(SKY_SEARCH), H - 3):
            if all(not is_sky(src[(y + j) * W + x]) for j in range(3)):
                r = y; break
        sk.append(r)
    assert all(r is not None for r in sk), 'skyline not found'
    sk = [sorted(sk[max(0, x - 2):x + 3])[len(sk[max(0, x - 2):x + 3]) // 2] for x in range(W)]
    cl = [round(v) + d for v, d in zip(line_y(CAMP, to_world, W), wobble(W, rng, 1.5, (5.5, 2.4)))]
    bl = [round(v) + d for v, d in zip(line_y(BRUSH, to_world, W), wobble(W, rng, 1.5, (6.0, 2.7)))]

    # dark clumps reaching over the line belong to the scrub, whole: a clump that reaches more
    # than CLUMP rows over it stays with the camp (cut by the line), so no clump has a flat top
    dark = C.majority(bytearray(1 if bl[i % W] - 3 * CLUMP <= i // W < bl[i % W] and lum(src[i]) < 40 else 0
                                for i in range(W * H)), W, H, 1)
    brush = bytearray(1 if i // W >= bl[i % W] else 0 for i in range(W * H))
    for comp in C.components(dark, W, H):
        if any(i + W < W * H and brush[i + W] for i in comp) and all(i // W >= bl[i % W] - CLUMP for i in comp):
            for i in comp: brush[i] = 1
    camp = bytearray(1 if i // W >= cl[i % W] and not brush[i] else 0 for i in range(W * H))
    hills = bytearray(1 if i // W >= sk[i % W] and not camp[i] and not brush[i] else 0 for i in range(W * H))
    hem = lambda line: [line[x] + round((UNDER[0] + UNDER[1]) / 2) + d
                        for x, d in enumerate(wobble(W, rng, (UNDER[1] - UNDER[0]) / 2, (5.0, 2.2)))]
    ch, bh = hem(cl), hem(bl)                   # how far the hills and the camp run on under

    # ------------------------------------------------------------ sky: terrain under the skyline
    sky_img = world.copy()
    shole = bytearray(1 if i // W >= sk[i % W] - 1 else 0 for i in range(W * H))
    terrain = bytearray(1 if hills[i] and i // W >= sk[i % W] + 3 and src[i][2] - src[i][0] < 25 else 0 for i in range(W * H))   # no blue roofs
    shuffle_fill(sky_img, world, shole, terrain, rng, (3, 2), 6)
    Qsky = list(render(sky_img).get_flattened_data())

    # ------------------------------------------------------------ hills: run on under the camp
    hills_img = world.copy()
    hhole = bytearray(1 if i // W >= sk[i % W] and (camp[i] or brush[i]) and i // W < ch[i % W] else 0
                      for i in range(W * H))
    miss = C.inpaint(hills_img, hhole, lambda sx, sy, tx, ty: hills[sy * W + sx] and sy >= sk[sx] + 3
                     and abs(sy - min(ty, cl[sx] - 1)) <= 6, rng, patch=(3, 2), reach=(3, 50), dy=6)
    assert not miss, f'hills underpaint: {len(miss)} px unfilled'
    Qhills = list(render(hills_img).get_flattened_data())

    # ------------------------------------------------------------ camp: runs on under the scrub
    camp_img = world.copy()
    chole = bytearray(1 if i // W >= cl[i % W] and brush[i] and i // W < bh[i % W] else 0 for i in range(W * H))
    miss = C.inpaint(camp_img, chole, lambda sx, sy, tx, ty: camp[sy * W + sx] and sy < bl[sx] - 1
                     and abs(sy - min(ty, bl[sx] - 2)) <= 5, rng, patch=(3, 2), reach=(3, 50), dy=5)
    assert not miss, f'camp underpaint: {len(miss)} px unfilled'
    Qcamp = list(render(camp_img).get_flattened_data())

    q = render(world)
    Q = list(q.get_flattened_data())
    hills_px = [Qhills[i] if i // W >= sk[i % W] and (hills[i] or hhole[i]) else KEY for i in range(W * H)]
    camp_px = [Qcamp[i] if camp[i] or chole[i] else KEY for i in range(W * H)]
    brush_px = [Q[i] if brush[i] else KEY for i in range(W * H)]

    layers = [
        C.Layer('sky', 0, 0.2, Qsky),
        C.Layer('hills', 0.3, 0.4, hills_px),
        C.Layer('camp', 0.6, 0.7, camp_px),
        C.Layer('brush', 1, 1.3, brush_px),
    ]
    rest = C.composite(C.Art(layers), W, H)
    lights = lights_sprite(rest, W)
    return C.Art(layers, [lights, smoke_sprite()], {'alt': {'lights': LIGHT_FRAMES, 'smoke': 2}})


def shuffle_fill(img, srcimg, hole, srcs, rng, patch, dy):
    """Fills the hole pixels of img (in place) patch by patch, each from its own random patch of
    srcimg lying wholly in mask srcs, its top within dy rows of the target's (clamped to the rows
    the sources span):
    the land under the skyline as shuffled terrain, so no hill or trailer shape survives in it."""
    W, H = img.size
    px, sp = img.load(), srcimg.load()
    pw, ph = patch
    ok = [(x, y) for y in range(H - ph + 1) for x in range(W - pw + 1)
          if all(srcs[(y + j) * W + x + i] for j in range(ph) for i in range(pw))]
    assert ok, 'shuffle_fill: no source patch'
    by_row = {}
    for x, y in ok: by_row.setdefault(y, []).append((x, y))
    lo, hi = min(by_row) + dy, max(by_row) - dy   # rows past the sources' take the nearest ones
    for ty in range(0, H, ph):
        c = min(max(ty, lo), hi)
        pool = [p for y in range(c - dy, c + dy + 1) for p in by_row.get(y, ())] or ok
        for tx in range(0, W, pw):
            cells = [(tx + i, ty + j) for j in range(ph) for i in range(pw) if tx + i < W and ty + j < H and hole[(ty + j) * W + tx + i]]
            if not cells: continue
            sx, sy = rng.choice(pool)
            for x, y in cells:
                px[x, y] = sp[sx + x - tx, sy + y - ty]


# ---------------------------------------------------------------- the lights
def lights_sprite(rest, W):
    """Frame 0 is empty. Frame f lights every window whose step is <= f: dim (tan) the frame it
    comes on, then amber with a warm cream pixel at its top left. Only the window box's dark
    pixels (the glass) change; everything else stays transparent."""
    x0 = min(b[0] for b, _ in WINDOWS); y0 = min(b[1] for b, _ in WINDOWS)
    x1 = max(b[2] for b, _ in WINDOWS) + 1; y1 = max(b[3] for b, _ in WINDOWS) + 1
    w, h = x1 - x0, y1 - y0
    frames = [[KEY] * (w * h)]
    for f in range(1, LIGHT_FRAMES + 1):
        g = [KEY] * (w * h)
        for (bx0, by0, bx1, by1), step in WINDOWS:
            if step > f: continue
            glass = [(x, y) for y in range(by0, by1 + 1) for x in range(bx0, bx1 + 1) if is_glass(rest[y * W + x])]
            for n, (x, y) in enumerate(glass):
                v = DIM if step == f else (GLOW if n == 0 and len(glass) > 3 else LAMP)
                g[(y - y0) * w + x - x0] = v
        frames.append(g)
    return C.Sprite('lights', w, h, frames, (x0, y0), 'camp', 0)


GLASS = {23, 24, 26, 27, 25, 21, 19, 13, 16, 17}   # the dark palette entries a window's glass is in


def is_glass(v): return v in GLASS


# ---------------------------------------------------------------- the smoke
def smoke_sprite():
    """Frame 0 is empty. Frames 1..SMOKE_FRAMES: a thin, wavering plume over the fire that leans
    right as it rises, one pixel wide low down and two higher up, with gaps between its puffs
    that grow toward the top, where it fades out. The wave and the gaps move up PUFF_ROWS rows a
    frame and repeat every SMOKE_FRAMES * PUFF_ROWS rows, so the frames loop. Pale near the fire,
    greyer higher up. The fire is an amber ember at the foot, one pixel or two."""
    w, h = SMOKE
    fx, fy = 3, h - 1
    period = SMOKE_FRAMES * PUFF_ROWS
    frames = [[KEY] * (w * h)]
    for f in range(SMOKE_FRAMES):
        g = [KEY] * (w * h)
        for r in range(1, h - 1):               # rows above the fire
            t = r / (h - 2)
            ph = (r - PUFF_ROWS * f) % period    # the plume's own phase at this row
            if r > 3 and ph < 1 + round(3 * t): continue          # the gap between two puffs
            if t > 0.55 and ph % 3 == 1: continue                 # thinning out near the top
            cx = fx + 4.2 * t * t + (0.4 + 1.1 * t) * math.sin(2 * math.pi * ph / period)
            xs = [round(cx)] + ([round(cx) + 1] if 0.3 < t < 0.8 and ph % 2 == 0 else [])
            col = PALE if t < 0.3 else MIST if t < 0.65 else HAZE
            for x in xs:
                if 0 <= x < w: g[(fy - r) * w + x] = col
        g[fy * w + fx] = LAMP
        if f % 2: g[fy * w + fx + 1] = LAMP
        frames.append(g)
    return C.Sprite('smoke', w, h, frames, (FIRE[0] - fx, FIRE[1] - fy), 'camp', 0)
