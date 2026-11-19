"""Hero world: the Chisos peaks over the haze, seen from above the desert. Layers back to front:
sky (opaque: the sky, the haze and the far desert plain; under the cloud streaks, the peaks and
the near slopes it is a smooth haze fill, and below the ridge's top the plain runs on, so a pan
or the cloud's slide never shows a ghost), cloud (the bank of cloud streaks around the peaks,
across the whole world, so a streak is never split when the bank moves; it runs on behind the
peaks, and a shift hook slides it up to 40 px right, off the peak), peaks (the two peaks, solid
from their tops down under the ridge), ridge (the near dark slopes, the brown hills and the dead tree). No sprites:
the haze shimmer is plotted by the act.

Lines are found from the photo's colours (the ridge's top, the peaks' outline, the streaks); the
few constants are photo px mapped with to_world."""
import random
from . import common as C
from .common import KEY, lum, smooth_fill, tile_fill

# The two peaks' outline (photo px), clockwise from under the ridge on the left.
PEAKS = [(1566, 1002), (1597, 983), (1605, 952), (1628, 933), (1655, 914), (1674, 891), (1686, 868), (1697, 849),
         (1713, 829), (1732, 810), (1747, 799), (1759, 791), (1770, 791), (1782, 799), (1797, 810), (1812, 822),
         (1824, 837), (1832, 856), (1843, 876), (1855, 891), (1870, 891), (1882, 876), (1897, 864), (1912, 852),
         (1932, 845), (1951, 837), (1966, 829), (1978, 822), (1993, 822), (2008, 833), (2028, 845), (2047, 856),
         (2066, 868), (2085, 879), (2097, 887), (2100, 887), (2100, 1002)]
SKY_TOP = 800                         # photo y: the ridge's top is searched below this
TRAVEL = 40                           # px the cloud bank may slide right
UNDER = 8                             # rows the peaks run on under the ridge
PLAIN_TOP = 1036                      # photo y: the near plain (under the haze) starts here


def is_ridge(c): return lum(c) < 78 or (lum(c) < 125 and c[2] - c[0] < 28)


def is_streak(c): return (c[2] - c[0] >= 75 and lum(c) < 168) or lum(c) > 192   # blue cloud or white


def is_plain(c): return lum(c) > 95 and c[2] - c[0] < 20                     # the near plain: neutral to tan


def is_haze_like(c): return lum(c) > 148 or c[2] - c[0] > 85


def index_fill(g, W, H, hole, ok, rng, patch=(3, 2), reach=(4, 60), dy=1):
    """Fills the hole cells of index grid g (in place) with patches copied, KEY included, from
    cells where ok(x, y) holds, each patch at its own random offset (x within reach, y within
    +-dy): streak and gap patterns carry on into the hole without repeating."""
    pw, ph = patch
    for y in range(0, H, ph):
        for x in range(0, W, pw):
            cells = [(xx, yy) for yy in range(y, min(H, y + ph)) for xx in range(x, min(W, x + pw)) if hole[yy * W + xx]]
            if not cells: continue
            for tries in range(400):
                r = reach[1] * (1 + tries // 100)
                ox, oy = rng.randint(reach[0], r) * rng.choice((-1, 1)), rng.randint(-dy, dy)
                if all(0 <= xx + ox < W and 0 <= yy + oy < H and ok(xx + ox, yy + oy) for xx, yy in cells):
                    for xx, yy in cells: g[yy * W + xx] = g[(yy + oy) * W + xx + ox]
                    break
            else:
                raise AssertionError(f'index_fill: no source for ({x}, {y})')


def build(world, render, to_world):
    W, H = world.size
    rng = random.Random(4135)
    src = list(world.get_flattened_data())
    y_of = lambda py: round(to_world(0, py)[1])

    # ------------------------------------------------------------ the ridge's top, the peaks
    rt = []
    for x in range(W):
        r = H - 1
        for y in range(max(0, y_of(SKY_TOP)), H - 3):
            if is_ridge(src[y * W + x]) and sum(is_ridge(src[(y + j) * W + x]) for j in range(6)) >= 5:
                r = y; break
        rt.append(r)
    rt = [sorted(rt[max(0, x - 3):x + 4])[len(rt[max(0, x - 3):x + 4]) // 2] for x in range(W)]   # no posts
    # the peaks: the traced outline, its edge settled per pixel (haze out, rock in)
    poly = C.raster([to_world(*p) for p in PEAKS], W, H)
    core, rim = C.erode(poly, W, H, 2), C.dilate(poly, W, H, 1)
    pk = bytearray(1 if rim[i] and (core[i] or not is_haze_like(src[i])) and i // W < rt[i % W] + UNDER else 0
                   for i in range(W * H))
    pk = C.drop_specks(pk, W, H, 4)
    ridge = bytearray(1 if i // W >= rt[i % W] else 0 for i in range(W * H))

    # ------------------------------------------------------------ cloud streaks
    streak = bytearray(W * H)
    for y in range(H):
        for x in range(W):
            i = y * W + x
            if y >= rt[x] or pk[i]: continue
            if is_streak(src[i]): streak[i] = 1
    streak = C.majority(streak, W, H, 1)
    for i in range(W * H):
        if pk[i] or ridge[i]: streak[i] = 0
    streak = C.drop_specks(streak, W, H, 4)

    # ------------------------------------------------------------ sky: streaks, peaks and slopes removed
    hole = C.dilate(bytearray(1 if streak[i] or pk[i] or ridge[i] else 0 for i in range(W * H)), W, H, 1)
    sky_img = world.copy()
    smooth_fill(sky_img, hole, lambda x, y: y < rt[x], lambda x, y: y)
    # below the ridge's top: patches of the near plain (the tan-grey ground under the haze, not
    # its blue-grey), so what a pan uncovers there reads as terrain
    plain = bytearray(1 if not hole[i] and y_of(PLAIN_TOP) <= i // W < rt[i % W] - 1 and is_plain(src[i]) else 0
                      for i in range(W * H))
    low = bytearray(1 if hole[i] and i // W >= rt[i % W] else 0 for i in range(W * H))
    tile_fill(sky_img, low, plain, rng, patch=(4, 2))
    Qsky = list(render(sky_img).get_flattened_data())

    Q = list(render(world).get_flattened_data())
    cloud = [Q[i] if streak[i] else KEY for i in range(W * H)]
    # behind the peaks the streak pattern carries on (gaps and all), so the bank slides out from
    # behind them whole; sources: the bank in the open, at the same rows
    behind = bytearray(1 if pk[i] and i // W < rt[i % W] else 0 for i in range(W * H))
    open_ = lambda x, y: y < rt[x] and not pk[y * W + x] and not behind[y * W + x]
    index_fill(cloud, W, H, behind, open_, rng)
    # under the ridge the peaks run on in their own rock, not the ridge's dark slope
    peak_img = world.copy()
    sunk = bytearray(1 if pk[i] and i // W >= rt[i % W] else 0 for i in range(W * H))
    miss = C.inpaint(peak_img, sunk, lambda sx, sy, tx, ty: pk[sy * W + sx] and sy < rt[sx] - 1, rng,
                     patch=(3, 2), reach=(2, 20), dy=10)
    assert not miss, f'peak underlap: {len(miss)} px unfilled'
    Qpk = list(render(peak_img).get_flattened_data())
    peaks = [Qpk[i] if pk[i] else KEY for i in range(W * H)]
    ridge_px = [Q[i] if ridge[i] else KEY for i in range(W * H)]

    layers = [
        C.Layer('sky', 0, 0.2, Qsky),
        C.Layer('cloud', 0.15, 0.3, cloud, (0, TRAVEL, 0, 0)),
        C.Layer('peaks', 0.4, 0.5, peaks),
        C.Layer('ridge', 0.8, 1.0, ridge_px),
    ]
    return C.Art(layers, [], {})
