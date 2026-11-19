"""M.S. world: the mesa under towering clouds. Layers back to front:
sky (opaque: the blue sky, the hazy far desert and its lake; behind the clouds it is a smooth
sky fill, behind the mesa and the near slope the sky runs on down to the far horizon and the
desert below it, so a pan or the cloud's slide never shows a ghost), clouds (every cloud above
a ragged floor just over the far horizon), ridge (the mesa and the brown hills under it, running
on under the near slope), slope (the near rocks, the sandy path and the shrubs, with the rock
pillar on the left and the dead tree on the right). Sprite on `ridge`: hawk (frame 0 empty, then
four wing poses).

Cut lines are photo-px polylines mapped with to_world, or found from the photo's colours (the
mesa's skyline)."""
import random
from . import common as C
from .common import KEY, line_y, lum, smooth_fill, tile_fill, wobble

# ---------------------------------------------------------------- photo-space lines
SKY_TOP = 650                         # photo y: the mesa's skyline is searched below this
FLANK = (650, 890)                    # photo x: the mesa's left flank (searched lower, below the haze)
FLANK_TOP = 765                       # photo y: where the flank search starts
# Top of the brown hills left of the flank (the far desert above belongs to the sky).
HILLS = [(0, 1092), (410, 1092), (550, 1065), (650, 1025)]
HORIZON = [(0, 826), (900, 826), (2048, 819)]      # the far desert's top; level behind the mesa
HAZE = 16                             # rows of haze over the far desert, under its top
CLOUD_FLOOR = 724                     # photo y: clouds stop here (6+ rows over the far haze)
# Top of the near slope: the rock pillar on the left, then the sandy path and the shrubs.
SLOPE = [(0, 894), (41, 881), (96, 888), (123, 942), (150, 1004), (205, 1038), (273, 1058),
         (341, 1078), (423, 1112), (512, 1140), (614, 1167), (717, 1194), (806, 1229), (922, 1236),
         (1024, 1243), (1106, 1256), (1195, 1283), (1297, 1311), (1434, 1317), (1570, 1297),
         (1673, 1283), (1775, 1263), (1877, 1270), (1980, 1256), (2048, 1249)]
TREE = (1680, 1092, 1857, 1338)       # photo box of the dead tree's trunk (dark grey pixels in it)
UNDER = (8, 12)                       # rows the mesa's hills run on under the near slope

# ---------------------------------------------------------------- the hawk (world px)
HAWK_AT = (150, 40)                   # its default spot; the act flies it about
DKTAN, BROWN = 11, 21               # phd.py's names for these palette indices
HAWK = [                              # 11x5 pixel maps, 'd' dark brown, 't' pale underside
    ['d.........d',                   # 1: wings raised (soaring, dihedral)
     '.d.......d.',
     '..dd.d.dd..',
     '....dtd....',
     '.....d.....'],
    ['...........',                   # 2: wings level (gliding)
     '...........',
     'ddddtttdddd',
     '....dtd....',
     '.....d.....'],
    ['...........',                   # 3: wings down (the downstroke)
     '...........',
     '..ddddddd..',
     '.d..dtd..d.',
     'd....d....d'],
    ['dd.........',                   # 4: banking (left wing up, right wing down)
     '..dd.......',
     '....ddd....',
     '....dtdddd.',
     '.....d...dd'],
]


def is_blue(c): return c[2] - c[0] > 55


def build(world, render, to_world):
    W, H = world.size
    rng = random.Random(1444)
    src = list(world.get_flattened_data())
    y_of = lambda py: round(to_world(0, py)[1])
    x_of = lambda px_: to_world(px_, 0)[0]

    # ------------------------------------------------------------ the mesa's skyline
    fx0, fx1 = x_of(FLANK[0]), x_of(FLANK[1])
    hills = line_y(HILLS, to_world, W)
    rt = []
    for x in range(W):
        if x + 0.5 < fx0:
            rt.append(round(hills[x])); continue
        y0 = y_of(FLANK_TOP) if x + 0.5 < fx1 else y_of(SKY_TOP)
        r = None
        for y in range(y0, H - 3):
            if all(lum(src[(y + j) * W + x]) < 100 for j in range(3)):
                r = y; break
        r = r if r is not None else round(hills[x])
        rt.append(min(r, round(hills[x])) if x + 0.5 < fx1 else r)   # the flank meets the hills: no step
    rt = [sorted(rt[max(0, x - 1):x + 2])[len(rt[max(0, x - 1):x + 2]) // 2] for x in range(W)]

    # ------------------------------------------------------------ the near slope
    sl = [round(v) + d for v, d in zip(line_y(SLOPE, to_world, W), wobble(W, rng, 1.5, (5.5, 2.4)))]
    tx0, ty0 = to_world(TREE[0], TREE[1])
    tx1, ty1 = to_world(TREE[2], TREE[3])
    tree = bytearray(W * H)
    for y in range(int(ty0), int(ty1) + 1):
        for x in range(int(tx0), int(tx1) + 1):
            c = src[y * W + x] if 0 <= x < W else (255, 255, 255)
            if 0 <= x < W and rt[x] <= y < min(H, sl[x]) and lum(c) < 65 and c[2] - c[0] < 16:   # dark, not navy
                tree[y * W + x] = 1
    tree = C.drop_specks(tree, W, H, 3)
    slope = bytearray(1 if i // W >= sl[i % W] or tree[i] else 0 for i in range(W * H))
    ridge = bytearray(1 if i // W >= rt[i % W] and not slope[i] else 0 for i in range(W * H))

    # ------------------------------------------------------------ clouds
    floor = [y_of(CLOUD_FLOOR) + d for d in wobble(W, rng, 2, (6.5, 2.6))]
    cloud = bytearray(1 if i // W < floor[i % W] and i // W < rt[i % W] and not is_blue(src[i]) else 0 for i in range(W * H))
    cloud = C.majority(cloud, W, H, 1)
    for i in range(W * H):
        if i // W >= floor[i % W] or i // W >= rt[i % W]: cloud[i] = 0
    cloud = C.drop_specks(cloud, W, H, 4)

    # ------------------------------------------------------------ sky: clouds, mesa and slope removed
    hz = [round(v) for v in line_y(HORIZON, to_world, W)]
    front = bytearray(1 if cloud[i] or ridge[i] or slope[i] else 0 for i in range(W * H))
    hole = C.dilate(front, W, H, 1)
    sky_img = world.copy()
    # sky and the haze over the far desert: smooth (copied patches of cloud-flecked sky and haze
    # read as confetti); the desert under the haze: patches of the bare grey-tan plain
    hb = [hz[x] + d for x, d in enumerate(wobble(W, rng, 2.5, (7.5, 3.3)))]
    hb = [v + HAZE for v in hb]
    smooth_fill(sky_img, hole, lambda x, y: y < hb[x], lambda x, y: y)
    plain = bytearray(1 if i // W >= hb[i % W] and not hole[i] and lum(src[i]) > 105 and src[i][2] - src[i][0] < 30 else 0
                      for i in range(W * H))
    low = bytearray(1 if hole[i] and i // W >= hb[i % W] else 0 for i in range(W * H))
    tile_fill(sky_img, low, plain, rng, patch=(5, 3))
    Qsky = list(render(sky_img).get_flattened_data())

    # ------------------------------------------------------------ ridge: runs on under the slope
    under = [round((UNDER[0] + UNDER[1]) / 2) + d for d in wobble(W, rng, (UNDER[1] - UNDER[0]) / 2, (5.0, 2.2))]   # a ragged hem, no spikes
    td = C.dilate(tree, W, H, 1)
    rhole = bytearray(1 if (td[i] and i // W >= rt[i % W]) or (sl[i % W] <= i // W < sl[i % W] + under[i % W] and i // W >= rt[i % W]) else 0
                      for i in range(W * H))
    ridge_img = world.copy()
    miss = C.inpaint(ridge_img, rhole, lambda sx, sy, tx, ty: ridge[sy * W + sx] and not td[sy * W + sx] and sy >= rt[sx] + 4
                     and abs(sy - ty) <= 16, rng, patch=(3, 2), reach=(3, 40), dy=14)
    assert not miss, f'ridge underpaint: {len(miss)} px unfilled'
    Qridge = list(render(ridge_img).get_flattened_data())

    Q = list(render(world).get_flattened_data())
    clouds_px = [Q[i] if cloud[i] else KEY for i in range(W * H)]
    ridge_px = [Qridge[i] if i // W >= rt[i % W] and (ridge[i] or rhole[i]) else KEY for i in range(W * H)]
    slope_px = [Q[i] if slope[i] else KEY for i in range(W * H)]

    layers = [
        C.Layer('sky', 0, 0.2, Qsky),
        C.Layer('clouds', 0.1, 0.3, clouds_px, (24, 0, 0, 6)),
        C.Layer('ridge', 0.45, 0.55, ridge_px),
        C.Layer('slope', 1, 1.3, slope_px),
    ]
    return C.Art(layers, [hawk_sprite()], {'alt': {'hawk': 2}})


def hawk_sprite():
    w, h = len(HAWK[0][0]), len(HAWK[0])
    frames = [[KEY] * (w * h)]
    for rows in HAWK:
        g = [KEY] * (w * h)
        C.paint(g, w, 0, 0, rows, {'d': BROWN, 't': DKTAN})
        frames.append(g)
    return C.Sprite('hawk', w, h, frames, HAWK_AT, 'ridge', 0)
