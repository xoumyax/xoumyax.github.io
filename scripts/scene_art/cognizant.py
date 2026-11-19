"""Cognizant world: the open road under a stormy teal sky. Layers back to front:
sky (opaque: the cloudy sky; behind the dark storm band it is a smooth sky fill, and below the
horizon it holds the fields without the road, so a pan never shows a second road), storm (the
dark cloud mass along the horizon, running on a few rows under the fields), land (the dark
fields and brush from the horizon down; under the road it is fields too), road (the road from
its far end down, with a ragged near verge along both edges and across the bottom).
Sprites: rain (on `land`: a tileable strip of falling streaks, frame 0 empty), flash (on
`storm`: frame 0 empty, frame 1 the storm band lit from inside, brightest right of the road).

Cut lines are found from the photo's colours (storm top, horizon) or are photo-px polylines
mapped with to_world (the road's edges)."""
import random
from . import common as C
from .common import KEY, BAYER, line_y, lum, smooth_fill, wobble

# ---------------------------------------------------------------- photo-space lines
STORM_SEARCH = (760, 1030)            # photo y: the storm band's top is searched in these rows
HORIZON_SEARCH = (1000, 1220)         # photo y: the fields' top (the horizon) in these rows
# The road's edges, from its far end (just under the horizon) to the bottom of the photo.
ROAD_LEFT = [(1015, 1150), (1015, 1159), (878, 1207), (741, 1248), (603, 1289), (466, 1337),
             (329, 1378), (171, 1419), (0, 1454)]
ROAD_RIGHT = [(1522, 1150), (1522, 1159), (1557, 1207), (1618, 1255), (1749, 1310), (1920, 1365),
              (2091, 1413), (2263, 1461), (2304, 1474)]
NEAR = 1470                           # photo y: below this the whole width is near verge (road)
UNDER = (4, 8)                        # rows the storm runs on under the horizon

# ---------------------------------------------------------------- the sprites (world px)
MIST = 1
FLASH_CENTRE = (232, 140)             # world px: the flash is brightest here (both views see it)
FLASH_R = (130, 30)                   # its falloff radii in x and y
FLASH_K = 0.5                         # the most a pixel moves toward mist


def is_land(c): return c[1] - c[2] >= 14 or lum(c) < 45


def build(world, render, to_world):
    W, H = world.size
    rng = random.Random(4343)
    src = list(world.get_flattened_data())

    # ------------------------------------------------------------ cut lines from colour
    y_of = lambda py: round(to_world(0, py)[1])
    hz = []                                     # horizon: the first of 3 field rows
    for x in range(W):
        r = None
        for y in range(y_of(HORIZON_SEARCH[0]), y_of(HORIZON_SEARCH[1])):
            if all(is_land(src[(y + j) * W + x]) for j in range(3)):
                r = y; break
        hz.append(r)
    assert all(r is not None for r in hz), 'horizon not found'
    st = []                                     # storm top: the first of 3 dark rows
    for x in range(W):
        r = None
        for y in range(y_of(STORM_SEARCH[0]), hz[x]):
            if all(lum(src[(y + j) * W + x]) < 112 for j in range(3)):
                r = y; break
        st.append(r if r is not None else hz[x] - 6)
    st = [sorted(st[max(0, x - 3):x + 4])[len(st[max(0, x - 3):x + 4]) // 2] for x in range(W)]  # median: no lone spikes
    st = [min(s, hz[x] - 4) for x, s in enumerate(st)]

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
    for y in range(H):
        xl, xr = edge_x(ql, y + 0.5), edge_x(qr, y + 0.5)
        grow = max(0.0, (y - top) / (H - top))  # the verge widens toward the viewer
        k = 0.4 + 0.6 * grow
        a = (xl if xl is not None else 0) - (1 + 3 * grow) + vl[y] * k
        b = (xr if xr is not None else W) + (1 + 3 * grow) + vr[y] * k
        for x in range(W):
            if (a <= x + 0.5 <= b and y + 0.5 >= rtop[x] and y >= hz[x]) or y >= near[x]:
                road[y * W + x] = 1
    land = bytearray(1 if i // W >= hz[i % W] else 0 for i in range(W * H))

    # ------------------------------------------------------------ fields under the road
    land_img = world.copy()
    hole = bytearray(1 if road[i] and land[i] else 0 for i in range(W * H))
    hole = C.dilate(hole, W, H, 1)
    for i in range(W * H):
        if not land[i] or (i // W) < hz[i % W] + 1: hole[i] = 0
    rel = lambda x, y: (y - hz[x]) / max(1, H - hz[x])   # 0 at the horizon, 1 at the bottom
    top_rel = max(rel(i % W, i // W) for i in range(W * H) if land[i] and not road[i])
    miss = C.inpaint(land_img, hole, lambda sx, sy, tx, ty: land[sy * W + sx] and not road[sy * W + sx]
                     and sy > hz[sx] and abs(rel(sx, sy) - min(rel(tx, ty), top_rel - 0.04)) < 0.08, rng,
                     patch=(3, 2), reach=(4, 60), dy=3)
    assert not miss, f'field underpaint: {len(miss)} px unfilled'
    Qland = list(render(land_img).get_flattened_data())

    # ------------------------------------------------------------ sky: the storm band smoothed away
    sky_img = land_img.copy()                   # below the horizon: the fields without the road
    shole = C.dilate(bytearray(1 if st[i % W] <= i // W < hz[i % W] else 0 for i in range(W * H)), W, H, 2)
    for i in range(W * H):
        if i // W >= hz[i % W]: shole[i] = 0
    smooth_fill(sky_img, shole, lambda x, y: y < hz[x], lambda x, y: y)
    Qsky = list(render(sky_img).get_flattened_data())

    # ------------------------------------------------------------ storm: runs on under the fields
    storm_img = world.copy()
    under = [round((UNDER[0] + UNDER[1]) / 2) + d for d in wobble(W, rng, (UNDER[1] - UNDER[0]) / 2, (5.0, 2.2))]   # a ragged hem, no spikes
    sb = [max(hz[max(0, x - 6):x + 7]) + under[x] for x in range(W)]   # the storm's foot: under the
    # lowest horizon nearby, so it hangs no comb of spikes between the trees once the fields slide
    uhole = bytearray(1 if hz[i % W] <= i // W < sb[i % W] else 0 for i in range(W * H))
    band = lambda x, y: hz[x] - 6 <= y < hz[x] and not is_land(src[y * W + x]) and lum(src[y * W + x]) < 112
    miss = C.inpaint(storm_img, uhole, lambda sx, sy, tx, ty: band(sx, sy), rng, patch=(3, 2), reach=(2, 30), dy=10)
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
        C.Layer('storm', 0.15, 0.3, storm),
        C.Layer('land', 0.5, 0.6, land_px),
        C.Layer('road', 1, 1.3, road_px),
    ]
    rest = C.composite(C.Art(layers), W, H)
    rain = C.rain_sprite(random.Random(1343), (0, min(st) - 8), 'land')
    flash = flash_sprite(rest, st, hz, W, H, pal, random.Random(2021))
    return C.Art(layers, [flash, rain], {'alt': {'rain': 1, 'flash': 1}})


# ---------------------------------------------------------------- the distant flash
def lighter(i, k, pal):
    """The palette entry nearest colour i moved a share k toward pale mist."""
    c = pal[i]
    t = tuple(v + (m - v) * k for v, m in zip(c, (200, 214, 222)))
    return min(range(len(pal)), key=lambda j: sum((a - b) ** 2 for a, b in zip(pal[j], t)))


def flash_sprite(rest, st, hz, W, H, pal, rng):
    """Frame 0 is empty (rest). Frame 1 lights the storm band and the sky just above it, as a
    flash inside the cloud would: each pixel moves toward pale mist by a share that falls off
    from FLASH_CENTRE and is broken up by soft value noise (the billows catch the light, the
    gaps stay dark), Bayer-dithered (world-aligned) so the lit area has no hard edge.
    Pixels that do not change stay transparent."""
    cx, cy = FLASH_CENTRE
    rx, ry = FLASH_R
    gx, gy = 9, 4                               # value-noise cell, world px
    cells = [[rng.random() for _ in range(W // gx + 2)] for _ in range(H // gy + 2)]

    def noise(x, y):
        i, j = x / gx, y / gy
        i0, j0 = int(i), int(j)
        fx, fy = i - i0, j - j0
        fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
        a = cells[j0][i0] * (1 - fx) + cells[j0][i0 + 1] * fx
        b = cells[j0 + 1][i0] * (1 - fx) + cells[j0 + 1][i0 + 1] * fx
        return a * (1 - fy) + b * fy
    y0 = max(0, min(st) - 8)
    y1 = max(hz)
    w, h = W, y1 - y0
    g = [KEY] * (w * h)
    for y in range(y0, y1):
        for x in range(W):
            if y >= hz[x] or y < st[x] - 8: continue
            d2 = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
            k = max(0.0, 1 - d2) * max(0.0, 1.5 * noise(x, y) - 0.35) * FLASH_K
            if y < st[x]: k *= 0.5                # the sky above the band takes less light
            k *= min(1.0, (hz[x] - y) / 10)       # and the light fades toward the horizon
            if k <= 0.02 or BAYER[y % 4][x % 4] / 16 >= min(1.0, 3 * k): continue
            v = lighter(rest[y * W + x], k, pal)
            if v != rest[y * W + x]: g[(y - y0) * w + x] = v
    return C.Sprite('flash', w, h, [[KEY] * (w * h), g], (0, y0), 'storm', 0)
