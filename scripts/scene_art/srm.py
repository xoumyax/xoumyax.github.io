"""B.Tech world: the storm over the road. Layers back to front:
sky (opaque: the teal sky; behind the dark storm band it is a smooth fill of the lighter teal
above it, so when the storm moves off it leaves the same stormy palette, no clear blue; below
the horizon it holds the fields without the road, so a pan never shows a second road), storm
(the darkest cloud mass and the rain curtain down to the horizon, running on a few rows under
the fields; travel right 50: a shift hook slides it off to the right, and its far left, which
no view shows at rest, is its trailing edge, thinning toward the world's left edge), land (the
fields, the hill on the left and the billboard; under the road it is fields too), road (the road
from its far end down, with a ragged verge along both edges and across the bottom).
Sprites: rain (on `storm`, so the fields hide it below the horizon and it leaves with the storm:
a tileable strip of falling streaks, frame 0 empty), road-lit (on `road`: frame 0 empty, frames
1-2 the road surface a little lighter each, as when the storm moves off), car (on `road`, after
road-lit: a small generic car drawn by hand, frame 0 empty, frames 1-2 its lamps and wheels
flickering).

Cut lines are found from the photo's colours (storm top, horizon) or are photo-px polylines
mapped with to_world (the road's edges)."""
import random
from . import common as C
import math
from .common import KEY, BAYER, line_y, lum, wobble

# ---------------------------------------------------------------- photo-space lines
STORM_SEARCH = 620                    # photo y: the storm band's top is searched below this
STORM_LUM = 101                       # the band: where the (blurred) sky is darker than this
HORIZON_SEARCH = (898, 1250)          # photo y: the fields' top (the horizon) in these rows
TAIL = 357                            # photo x: left of this (left of both views at rest, with
                                      # the seam) the band thins out: the storm's trailing edge
# The road's edges, from its far end down to the bottom of the photo (it bends left near us).
ROAD_LEFT = [(1275, 1214), (1275, 1220), (1255, 1255), (1241, 1303), (1207, 1344), (1179, 1371),
             (1138, 1392), (1097, 1406), (1029, 1419), (967, 1433), (905, 1454), (809, 1474),
             (713, 1495), (631, 1515), (549, 1543)]
ROAD_RIGHT = [(1406, 1214), (1406, 1220), (1426, 1255), (1454, 1282), (1474, 1303), (1495, 1337),
              (1509, 1371), (1529, 1399), (1563, 1419), (1598, 1440), (1646, 1461), (1687, 1481),
              (1714, 1509), (1742, 1543)]
NEAR = 1478                           # photo y: below this the whole width is near verge (road)
UNDER = (4, 8)                        # rows the storm runs on under the horizon

# ---------------------------------------------------------------- the sprites (world px)
LIT = (0.25, 0.5)                     # road-lit frames 1, 2: the share of road pixels one step lighter
# the road's own colours, dark to light: road-lit moves a pixel one step up this ramp
RAMP = [27, 26, 25, 20, 18]
CLEAR = 0.3                           # the cleared sky at the horizon: this share toward LIGHT
LIGHT = (150, 196, 180)               # the pale teal of the clearing sky
CAR_AT = (206, 186)                   # the car's default spot: the road's right lane, where both
                                      # views see it (the phone right of the deck card, the
                                      # desktop below it); the act drives it about
SILVER, ROOF, GLASS, LAMP, WARM, TYRE = 9, 23, 6, 0, 3, 27
CAR = [                               # 9x5, seen from ahead and a little to the left
    ['..rrrrr..',                     # 1: lamps full, tyres
     '.rgggggr.',
     'sssssssss',
     'LsssssssL',
     '.t.....t.'],
    ['..rrrrr..',                     # 2: lamps dipped, tyres turned
     '.rgggggr.',
     'sssssssss',
     'WsssssssW',
     'tt.....tt'],
]


def is_land(c): return c[1] - c[2] >= 14 or lum(c) < 45


def build(world, render, to_world):
    W, H = world.size
    rng = random.Random(4305)
    src = list(world.get_flattened_data())
    y_of = lambda py: round(to_world(0, py)[1])
    x_of = lambda px_: to_world(px_, 0)[0]

    # ------------------------------------------------------------ cut lines from colour
    hz = []                                     # horizon: the first of 3 field rows
    for x in range(W):
        r = None
        for y in range(y_of(HORIZON_SEARCH[0]), y_of(HORIZON_SEARCH[1])):
            if all(is_land(src[(y + j) * W + x]) for j in range(3)):
                r = y; break
        hz.append(r)
    assert all(r is not None for r in hz), 'horizon not found'
    hz = [sorted(hz[max(0, x - 1):x + 2])[len(hz[max(0, x - 1):x + 2]) // 2] for x in range(W)]

    def blum(x, y):                             # a 5x3 box blur of the sky's lightness
        s = n = 0
        for yy in range(max(0, y - 1), min(H, y + 2)):
            for xx in range(max(0, x - 2), min(W, x + 3)):
                s += lum(src[yy * W + xx]); n += 1
        return s / n
    st = []                                     # storm top: the first of 3 dark rows
    for x in range(W):
        r = None
        for y in range(y_of(STORM_SEARCH), hz[x] - 2):
            if all(blum(x, y + j) < STORM_LUM for j in range(3)):
                r = y; break
        st.append(r if r is not None else hz[x] - 6)
    st = [sorted(st[max(0, x - 3):x + 4])[len(st[max(0, x - 3):x + 4]) // 2] for x in range(W)]  # median: no lone spikes
    st = [min(s, hz[x] - 6) for x, s in enumerate(st)]
    # the trailing edge: left of TAIL the band's top sinks toward the horizon, raggedly, so a
    # slide to the right shows the storm's end leaving, not a cut
    tx = x_of(TAIL)
    rag = wobble(W, rng, 2.5, (4.1, 1.7))
    for x in range(W):
        if x + 0.5 < tx:
            f = (tx - x - 0.5) / tx
            f = f * f * (3 - 2 * f)
            st[x] = min(hz[x] - 3, round(st[x] + (hz[x] - 3 - st[x]) * 0.92 * f + rag[x] * f))

    # the road: between its two edges below its far end, widened by a ragged verge; the bottom
    # rows are near verge across the whole width
    ql = [to_world(*p) for p in ROAD_LEFT]
    qr = [to_world(*p) for p in ROAD_RIGHT]
    top = ql[0][1]
    near = [round(v) + d for v, d in zip(line_y([(0, NEAR), (2304, NEAR)], to_world, W), wobble(W, rng, 1.5, (6.0, 2.9)))]

    def edge_x(q, y):                           # x of a polyline (top to bottom) at row y
        for (x0, y0), (x1, y1) in zip(q, q[1:]):
            if y0 <= y <= y1 and y1 > y0:
                return x0 + (x1 - x0) * (y - y0) / (y1 - y0)
        return q[-1][0] if y > q[-1][1] else None
    vl = wobble(H, rng, 2, (4.0, 1.7))
    vr = wobble(H, rng, 2, (4.3, 1.9))
    xt0, xt1 = ql[0][0], qr[0][0]               # the far end: a crest with a slight wobble and
    crest = wobble(W, rng, 1, (3.1, 1.3))       # rounded corners, not a ruled line
    rtop = [top + crest[x] + 0.8 * min(5, max(0, 5 - min(x + 0.5 - xt0, xt1 - x - 0.5))) for x in range(W)]
    road = bytearray(W * H)
    surface = bytearray(W * H)                  # the road itself, without its verges
    for y in range(H):
        xl, xr = edge_x(ql, y + 0.5), edge_x(qr, y + 0.5)
        grow = max(0.0, (y - top) / (H - top))  # the verge widens toward the viewer
        k = 0.4 + 0.6 * grow
        a = (xl if xl is not None else 0) - (1 + 3 * grow) + vl[y] * k
        b = (xr if xr is not None else W) + (1 + 3 * grow) + vr[y] * k
        for x in range(W):
            if (a <= x + 0.5 <= b and y + 0.5 >= rtop[x] and y >= hz[x]) or y >= near[x]:
                road[y * W + x] = 1
            if xl is not None and xl + 1 <= x + 0.5 <= xr - 1 and y + 0.5 >= rtop[x] + 1:
                surface[y * W + x] = 1
    land = bytearray(1 if i // W >= hz[i % W] else 0 for i in range(W * H))

    # ------------------------------------------------------------ fields under the road
    land_img = world.copy()
    hole = bytearray(1 if road[i] and land[i] else 0 for i in range(W * H))
    hole = C.dilate(hole, W, H, 1)
    for i in range(W * H):
        if not land[i] or (i // W) < hz[i % W] + 1: hole[i] = 0
    rel = lambda x, y: (y - hz[x]) / max(1, H - hz[x])   # 0 at the horizon, 1 at the bottom
    top_rel = max(rel(i % W, i // W) for i in range(W * H) if land[i] and not road[i])
    miss = C.inpaint(land_img, hole, lambda sx, sy, tx_, ty: land[sy * W + sx] and not road[sy * W + sx]
                     and sy > hz[sx] and abs(rel(sx, sy) - min(rel(tx_, ty), top_rel - 0.04)) < 0.08, rng,
                     patch=(3, 2), reach=(4, 60), dy=3)
    assert not miss, f'field underpaint: {len(miss)} px unfilled'
    Qland = list(render(land_img).get_flattened_data())

    # ------------------------------------------------------------ sky: the storm band cleared away
    sky_img = land_img.copy()                   # below the horizon: the fields without the road
    clear_fill(sky_img, st, hz, W, H)
    Qsky = list(render(sky_img).get_flattened_data())

    # ------------------------------------------------------------ storm: runs on under the fields
    storm_img = world.copy()
    under = [round((UNDER[0] + UNDER[1]) / 2) + d for d in wobble(W, rng, (UNDER[1] - UNDER[0]) / 2, (5.0, 2.2))]   # a ragged hem, no spikes
    # the storm's foot: under the lowest horizon from 6 px left to 56 px right of it (the storm
    # slides up to 50 px right), so neither a comb of spikes between the hills nor a gap over the
    # far horizon shows once it slides; the hidden rows are copied from the band's own pixels in
    # the same rows (behind the hill on the left, from the open horizon to its right)
    sb = [max(hz[max(0, x - 6):x + 57]) + under[x] for x in range(W)]
    uhole = bytearray(1 if hz[i % W] <= i // W < sb[i % W] else 0 for i in range(W * H))
    band = lambda x, y: st[x] <= y < hz[x] and not is_land(src[y * W + x])
    miss = C.inpaint(storm_img, uhole, lambda sx, sy, tx_, ty: band(sx, sy) and abs(sy - min(ty, hz[sx] - 1)) <= 1,
                     rng, patch=(3, 2), reach=(2, 120), dy=10)
    assert not miss, f'storm underlap: {len(miss)} px unfilled'
    Qstorm = list(render(storm_img).get_flattened_data())

    q = render(world)
    Q = list(q.get_flattened_data())
    pal = [tuple(q.getpalette()[3 * i:3 * i + 3]) for i in range(KEY)]
    storm = [Qstorm[i] if st[i % W] <= i // W < sb[i % W] else KEY for i in range(W * H)]
    land_px = [Qland[i] if land[i] else KEY for i in range(W * H)]
    road_px = [Q[i] if road[i] else KEY for i in range(W * H)]

    layers = [
        C.Layer('sky', 0, 0.2, Qsky),
        C.Layer('storm', 0.15, 0.3, storm, (0, 50, 0, 0)),
        C.Layer('land', 0.5, 0.6, land_px),
        C.Layer('road', 1, 1.3, road_px),
    ]
    rain = C.rain_sprite(random.Random(1305), (0, min(st)), 'storm')
    lit = road_lit_sprite(road_px, surface, W, H, pal)
    return C.Art(layers, [rain, lit, car_sprite()], {'alt': {'rain': 1, 'road-lit': 2, 'car': 1}})


# ---------------------------------------------------------------- the cleared sky
def clear_fill(img, st, hz, W, H):
    """Behind the storm band (exactly its rows, so the rest frame keeps the photo's sky above it):
    the teal just over the band at its top, easing down to a paler teal at the horizon, as a sky
    clearing behind a storm looks; soft wisps so no dither threshold runs as a straight row."""
    px = img.load()
    top = min(st)
    edge = []                                   # the photo's sky just over the band, per column
    for x in range(W):
        cs = [px[xx, y] for xx in range(max(0, x - 8), min(W, x + 9)) for y in range(max(0, st[xx] - 5), st[xx] - 1)]
        edge.append([sum(c[j] for c in cs) / len(cs) for j in range(3)])
    bot = max(hz)
    for x in range(W):
        a = edge[x]
        b = [v + (t - v) * CLEAR for v, t in zip(a, LIGHT)]
        for y in range(st[x], hz[x]):
            t = min(1.0, max(0.0, (y - st[x]) / max(1, bot - top)))
            t = t * (2 - t)
            n = 5 * math.sin(x / 7.3 + y / 2.9) + 4 * math.sin(x / 13.7 - y / 4.1 + 1.3)
            px[x, y] = tuple(round(u + (w - u) * t + n) for u, w in zip(a, b))


# ---------------------------------------------------------------- the road brightening
def road_lit_sprite(road_px, surface, W, H, pal):
    """Frame 0 is empty (rest: the road as generated). Frames 1 and 2 move a growing share
    (LIT) of the road surface's pixels one step up the road's own colour ramp (RAMP), chosen by
    a world-aligned Bayer threshold, so frame 2 holds every pixel of frame 1. The share fades
    toward the surface's edges, so the lit road has no outline. Pixels that do not change stay
    transparent; the strip covers the surface's bounding box."""
    up = {RAMP[i]: RAMP[i + 1] for i in range(len(RAMP) - 1)}
    cells = [i for i in range(W * H) if surface[i] and road_px[i] in up]
    xs, ys = [i % W for i in cells], [i // W for i in cells]
    x0, y0, x1, y1 = min(xs), min(ys), max(xs) + 1, max(ys) + 1
    w, h = x1 - x0, y1 - y0

    def inset(x, y):                            # columns to the surface's nearer edge in this row
        d = 0
        while d < 6 and surface[y * W + x - d - 1] and surface[y * W + x + d + 1]: d += 1
        return d
    frames = [[KEY] * (w * h)]
    for k in LIT:
        g = [KEY] * (w * h)
        for i in cells:
            x, y = i % W, i // W
            share = k * min(1.0, (inset(x, y) + 1) / 4)
            if BAYER[y % 4][x % 4] / 16 < share:
                g[(y - y0) * w + x - x0] = up[road_px[i]]
        frames.append(g)
    return C.Sprite('road-lit', w, h, frames, (x0, y0), 'road', 0)


# ---------------------------------------------------------------- the car
def car_sprite():
    w, h = len(CAR[0][0]), len(CAR[0])
    frames = [[KEY] * (w * h)]
    for rows in CAR:
        g = [KEY] * (w * h)
        C.paint(g, w, 0, 0, rows, {'r': ROOF, 'g': GLASS, 's': SILVER, 'L': LAMP, 'W': WARM, 't': TYRE})
        frames.append(g)
    return C.Sprite('car', w, h, frames, CAR_AT, 'road', 0)
