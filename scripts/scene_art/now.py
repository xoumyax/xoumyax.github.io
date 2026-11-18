"""Now world: the geodesic dome at dusk. Layers back to front:
sky (opaque: the storm sky, a far ridge and the ground under it; behind the hill, the dome and
the plants it is underpainted, so the camera or a pan never shows a ghost), hill (the dark hill
on the left with its rubble foot; its hidden right end runs on behind the dome and tapers
diagonally into the gravel), dome (the dome, its deck, the yucca and the AC unit beside it),
gravel (the near stones). Sprite on `dome`: door, the open doorway from dark (rest) to lit.

Cut lines and outlines are in photo px and mapped with to_world."""
import math, random
from . import common as C
from .common import KEY
from .phd import line_y, wobble

# ---------------------------------------------------------------- photo-space outlines
# The dome and its deck, clockwise from the deck's left end (the bottom runs under the gravel).
DOME = [(560, 2489), (605, 2396), (808, 2396), (791, 2291), (779, 2163), (785, 2047), (803, 1954), (826, 1884),
        (872, 1826), (919, 1780), (965, 1739), (1024, 1692), (1082, 1657), (1128, 1628), (1210, 1588),
        (1303, 1553), (1396, 1535), (1512, 1529), (1628, 1541), (1721, 1570), (1838, 1622), (1942, 1681),
        (2035, 1745), (2094, 1803), (2152, 1861), (2187, 1919), (2221, 1977), (2245, 2035), (2268, 2094),
        (2280, 2152), (2285, 2233), (2291, 2326), (2291, 2408), (2338, 2489), (2338, 2698), (582, 2698)]
# Where the yucca and its dark stalks stand right of the dome (only non-sky / dark pixels in it
# are taken), and the AC unit.
CLUSTER = [(2163, 1896), (2489, 1896), (2582, 2070), (2600, 2140), (2720, 2698), (2163, 2698)]
RIDGE_FOOT = 2210                     # photo y: below the far ridge's dark band, right of the dome
AC = [(2396, 2268), (2594, 2268), (2594, 2524), (2396, 2524)]
# The far ridge's top (the sky layer's horizon): measured right of the dome, run on level
# behind the dome and the hill.
HORIZON = [(0, 2128), (700, 2140), (1400, 2128), (2268, 2105), (2326, 2117), (2442, 2128),
           (2559, 2152), (2675, 2175), (2756, 2187), (3024, 2175)]
# Top of the near gravel (gravel below), under the deck's shadow.
GRAVEL = [(0, 2431), (233, 2454), (465, 2489), (605, 2512), (814, 2524), (1279, 2536), (1745, 2536),
          (2280, 2524), (2384, 2536), (2675, 2536), (3024, 2524)]
# The open doorway (inside the frame): the door sprite's mask.
DOOR = [(1349, 1791), (1663, 1791), (1663, 2524), (1349, 2524)]

HILL_TOP = 1100                       # photo y: the hill's ridge is searched below the storm cloud
UNDER = (6, 10)                       # rows the hill and dome run on under the gravel's top


def lum(c): return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def is_sky(c): return c[2] - c[0] > 22 and lum(c) > 95


def build(world, render, to_world):
    W, H = world.size
    rng = random.Random(7089)
    src = list(world.get_flattened_data())
    tw = lambda pts: [to_world(*p) for p in pts]

    # ------------------------------------------------------------ cut lines
    g = [round(v) + d for v, d in zip(line_y(GRAVEL, to_world, W), wobble(W, rng, 1.5, (6.0, 2.7)))]
    right = to_world(2268, 0)[0]                 # the real ridge starts right of the dome
    hz = [round(v) + (d if x < right else 0) for x, (v, d) in enumerate(zip(line_y(HORIZON, to_world, W), wobble(W, rng, 1.5, (13.0, 5.1))))]
    th = [max(2, round(4.5 + 2.5 * math.sin(x / 8.3 + 1.1) + 1.2 * math.sin(x / 3.1))) for x in range(W)]
    dome = C.raster(tw(DOME), W, H)
    ac = C.raster(tw(AC), W, H)
    box = C.raster(tw(CLUSTER), W, H)

    # the yucca (non-sky above the ridge, dark below the ridge's band) and the AC unit
    foot = round(to_world(0, RIDGE_FOOT)[1])
    cl = bytearray(W * H)
    for y in range(H):
        for x in range(W):
            i = y * W + x
            if y >= g[x] or dome[i]: continue
            if ac[i] or (box[i] and ((y < hz[x] and not is_sky(src[i])) or (y >= foot and lum(src[i]) < 80))):
                cl[i] = 1
    stalks = cl                                 # every yucca pixel leaves the sky layer...
    cl = drop_specks(cl, W, H, 4)               # ...but lone ones would float once the layers part
    for _ in range(2):                          # the dome's sky-blue rim stays with the sky
        rim = [i for i in range(W, W * H - W) if dome[i] and not (dome[i - 1] and dome[i + 1] and dome[i - W] and dome[i + W])
               and src[i][2] - src[i][0] > 12]
        for i in rim: dome[i] = 0
    front = bytearray(1 if (dome[i] or cl[i]) else 0 for i in range(W * H))

    # hill: under its ridge (the first dark rows from the top) left of where it meets the dome;
    # behind the dome the ridge runs on down at the hill's slope until it meets the gravel.
    top = round(to_world(0, HILL_TOP)[1])
    ridge = []
    for x in range(W):
        r = None
        for y in range(top, H - 3):
            if all(lum(src[(y + j) * W + x]) < 80 for j in range(3)) and not dome[y * W + x]:
                r = y; break
        ridge.append(r)
    assert all(r is not None for r in ridge[:W // 4]), 'hill ridge not found'
    meet = max(x for x in range(W // 2) if ridge[x] is not None and ridge[x] < g[x] - 40 and not dome[ridge[x] * W + x])
    slope = (ridge[meet] - ridge[meet - 12]) / 12
    bump = wobble(W, rng, 1.5, (7.0, 3.3))
    for x in range(meet + 1, W):                # easing off a little, with a rough crest
        d = x - meet
        ridge[x] = round(ridge[meet] + slope * d * (1 - d / 220) + bump[x] * min(1, d / 6))
    under = [rng.randint(*UNDER) for _ in range(W)]
    hill = bytearray(1 if ridge[i % W] <= i // W < g[i % W] + under[i % W] else 0 for i in range(W * H))

    # ------------------------------------------------------------ sky: hill, dome and plants underpainted
    # Sky and the far ridge are filled smoothly (patches of the cloud-flecked sky read as confetti
    # over this much area); the ground under the ridge is patch-filled from ground that is not near-black.
    def band(x, y):
        return 0 if y < hz[x] else 1 if y < hz[x] + th[x] else 2
    hole = C.dilate(bytearray(1 if (hill[i] or front[i] or stalks[i]) and i // W < g[i % W] else 0 for i in range(W * H)), W, H, 2)
    for i in range(W * H):
        if i // W >= g[i % W]: hole[i] = 0
    sky_img = world.copy()
    smooth_fill(sky_img, hole, lambda x, y: band(x, y) == 0, lambda x, y: y)
    smooth_fill(sky_img, hole, lambda x, y: band(x, y) == 1, lambda x, y: min(2, 3 * (y - hz[x]) // th[x]))
    hole2 = bytearray(1 if hole[i] and band(i % W, i // W) == 2 else 0 for i in range(W * H))
    miss = C.inpaint(sky_img, hole2, lambda sx, sy, tx, ty: band(sx, sy) == 2 and lum(src[sy * W + sx]) > 60, rng,
                     patch=(3, 3), reach=(3, 40), dy=8)
    assert not miss, f'sky underpaint: {len(miss)} px unfilled'
    Qsky = list(render(sky_img).get_flattened_data())

    # ------------------------------------------------------------ hill: its hidden end underpainted
    fd = C.dilate(front, W, H, 2)
    hidden = bytearray(1 if hill[i] and fd[i] else 0 for i in range(W * H))
    hill_img = world.copy()
    depth = lambda x, y: min(3, (y - ridge[x]) // 12)
    miss = C.inpaint(hill_img, hidden, lambda sx, sy, tx, ty: hill[sy * W + sx] and depth(sx, sy) == depth(tx, ty), rng,
                     patch=(3, 3), reach=(3, 30), dy=4)
    assert not miss, f'hill underpaint: {len(miss)} px unfilled'
    Qhill = list(render(hill_img).get_flattened_data())

    # ------------------------------------------------------------ dome, gravel
    Q = list(render(world).get_flattened_data())
    door = C.raster(tw(DOOR), W, H)
    frames, dbox = door_frames(Q, door, W, H)
    dx0, dy0, dw, dh = dbox
    assert all(v == KEY or v == Q[(dy0 + i // dw) * W + dx0 + i % dw] for i, v in enumerate(frames[-1])), 'lit door != photo'
    xs = [x for x in range(W) if any(front[y * W + x] and y == g[x] - 1 for y in range(H))]
    lo, hi = min(xs), max(xs)
    dome_px = [KEY] * (W * H)
    for y in range(H):
        for x in range(W):
            i = y * W + x
            if (front[i] and y < g[x]) or (lo <= x <= hi and g[x] <= y < g[x] + min(under[x], 2 + min(x - lo, hi - x))):
                dome_px[i] = Q[i]
    for y in range(dh):                         # the doorway at rest (dark) is part of the dome too
        for x in range(dw):
            v = frames[0][y * dw + x]
            if v != KEY: dome_px[(dy0 + y) * W + dx0 + x] = v
    hill_px = [Qhill[i] if hill[i] else KEY for i in range(W * H)]
    gravel_px = [Q[i] if i // W >= g[i % W] else KEY for i in range(W * H)]

    layers = [
        C.Layer('sky', 0, 0.2, Qsky),
        C.Layer('hill', 0.35, 0.4, hill_px),
        C.Layer('dome', 0.6, 0.7, dome_px),
        C.Layer('gravel', 1, 1.3, gravel_px),
    ]
    door_sp = C.Sprite('door', dw, dh, frames, (dx0, dy0), 'dome', 0)
    return C.Art(layers, [door_sp], {'alt': {'door': len(frames) - 1}})


def drop_specks(m, W, H, n):
    """Clears 8-connected pieces of mask m smaller than n pixels."""
    seen = bytearray(W * H)
    out = bytearray(m)
    for i in range(W * H):
        if not m[i] or seen[i]: continue
        comp, stack = [], [i]
        seen[i] = 1
        while stack:
            j = stack.pop(); comp.append(j)
            x, y = j % W, j // W
            for yy in range(max(0, y - 1), min(H, y + 2)):
                for xx in range(max(0, x - 1), min(W, x + 2)):
                    k = yy * W + xx
                    if m[k] and not seen[k]: seen[k] = 1; stack.append(k)
        if len(comp) < n:
            for j in comp: out[j] = 0
    return out


def smooth_fill(img, hole, inside, key):
    """Fills the hole pixels for which inside(x, y) holds (RGB, in place): each takes the mean of
    the non-hole pixels with the same key (+-3 keys), eased toward the colours at the edges of
    its run in the row, then two passes of a vertical 1-2-1 blur inside the fill. Smooth colour
    that the Bayer dither then textures (with a faint wave, so no dither band runs dead straight):
    no copied flecks."""
    W, H = img.size
    px = img.load()
    sums = {}
    for y in range(H):
        for x in range(W):
            if not hole[y * W + x] and inside(x, y):
                k = key(x, y)
                s = sums.setdefault(k, [0, 0, 0, 0])
                for c in range(3): s[c] += px[x, y][c]
                s[3] += 1
    keys = sorted(sums)

    def mean(k):
        acc, n = [0, 0, 0], 0
        for kk in keys:
            if abs(kk - k) <= 3:
                s = sums[kk]
                for c in range(3): acc[c] += s[c]
                n += s[3]
        if not n:
            kk = min(keys, key=lambda q: abs(q - k)); s = sums[kk]
            return [s[c] / s[3] for c in range(3)]
        return [v / n for v in acc]
    fill = {}
    for y in range(H):
        x = 0
        while x < W:
            if not (hole[y * W + x] and inside(x, y)):
                x += 1; continue
            x0 = x
            while x < W and hole[y * W + x] and inside(x, y): x += 1
            x1 = x                                   # run x0 .. x1 - 1

            def edge(xs):
                cs = [px[e, y] for e in xs if 0 <= e < W and not hole[y * W + e] and inside(e, y)]
                return [sum(c[j] for c in cs) / len(cs) for j in range(3)] if cs else None
            cl, cr = edge(range(x0 - 3, x0)), edge(range(x1, x1 + 3))
            for xx in range(x0, x1):
                m = mean(key(xx, y))
                for e, d in ((cl, xx - x0 + 1), (cr, x1 - xx)):
                    if e: m = [m[j] + (e[j] - m[j]) * math.exp(-d / 6) for j in range(3)]
                fill[(xx, y)] = m
    for _ in range(2):
        nxt = {}
        for (x, y), c in fill.items():
            up, dn = fill.get((x, y - 1), c), fill.get((x, y + 1), c)
            nxt[(x, y)] = [(up[j] + 2 * c[j] + dn[j]) / 4 for j in range(3)]
        fill = nxt
    for (x, y), c in fill.items():               # soft wisps, so a dither threshold never runs as a straight row
        n = 5 * math.sin(x / 7.3 + y / 2.9) + 4 * math.sin(x / 13.7 - y / 4.1 + 1.3)
        px[x, y] = tuple(round(v + n) for v in c)
        hole[y * W + x] = 0


# ---------------------------------------------------------------- the door light
ORANGE = 15
DARK, NIGHT, BROWN, GREYBROWN = 27, 26, 21, 19
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def door_frames(Q, door, W, H):
    """Frames of the doorway, all with the same opaque mask: 0 = dark (rest), 5 = lit, the photo's
    own quantised doorway (today's orange door). In between the light warms up in index space,
    through dithered brown into orange with a world-aligned Bayer phase (dimming the RGB and
    re-quantising would snap: the quantiser keeps mid-chroma orange off the vivid entry).
    Dark: the room is near-black, a little less so near the top; pale things in it (the pillow)
    stay faintly visible, the hanging cord and the floor glint are gone."""
    pts = [(i % W, i // W) for i in range(W * H) if door[i]]
    x0, y0 = min(p[0] for p in pts), min(p[1] for p in pts)
    x1, y1 = max(p[0] for p in pts), max(p[1] for p in pts)
    w, h = x1 - x0 + 1, y1 - y0 + 1
    lit = [Q[(y0 + y) * W + x0 + x] if door[(y0 + y) * W + x0 + x] else KEY for y in range(h) for x in range(w)]
    pale = {0, 1, 2, 3}

    def bayer(x, y): return BAYER[(y0 + y) % 4][(x0 + x) % 4]

    def dark(x, y, v):
        if v == KEY: return KEY
        if v == ORANGE or v not in pale and v not in (DARK, NIGHT, BROWN):
            return NIGHT if bayer(x, y) < 8 * max(0, 1 - y / (0.7 * h)) else DARK
        if v in pale: return GREYBROWN if v in (0, 3) else BROWN
        return v
    # The light grows from the lamp above: frame f lights the room down to level L[f] (0 = top of
    # the orange, 1 = its foot) with a dithered falloff band below; under it the room is dim
    # (a dark/brown checker) from frame 1 on.
    foot = max(y for y in range(h) for x in range(w) if lit[y * w + x] == ORANGE) + 1
    L = [None, -1, 0.15, 0.45, 0.75, None]
    BAND = 0.4

    def share(f, y):
        return min(1.0, max(0.0, (L[f] - y / foot) / BAND + 0.5))
    frames = []
    for f in range(len(L)):
        g = []
        for y in range(h):
            for x in range(w):
                v = lit[y * w + x]
                if f == len(L) - 1 or v == KEY: g.append(v); continue
                dk = dark(x, y, v)
                if f == 0: g.append(dk); continue
                k = share(f, y)
                dim = BROWN if (x + y) % 2 else DARK
                if v == ORANGE:
                    g.append(ORANGE if bayer(x, y) < 16 * k else dim)
                else:
                    g.append(v if k > 0.5 else dk)
        frames.append(g)
    return frames, (x0, y0, w, h)
