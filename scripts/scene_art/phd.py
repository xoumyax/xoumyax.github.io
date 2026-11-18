"""Ph.D. world: the palomino by the Rio Grande. Layers back to front:
far (cliff, water, and sand; trees underpainted with cliff/water), trees, bank (the dark sand
behind the horse), ground (the bright sand bar the horse stands on), fore (the near sand lip).
Sprites on `ground`, in draw order: horse, tail (over the hind legs), grass (in front of the
forelegs; the grazing muzzle dips into it).

Cut lines and the horse outline are in photo px and mapped with to_world; pose pivots are in
world px (they follow the drawn sprite, so they are tied to this density)."""
import math, random
from PIL import ImageFilter
from . import common as C
from .common import KEY

# ---------------------------------------------------------------- photo-space cut lines
HORSE = [(992, 1051), (994, 1024), (1005, 1005), (1021, 991), (1042, 980), (1069, 974), (1096, 974),
         (1122, 981), (1144, 991), (1165, 994), (1186, 988), (1213, 977), (1240, 966), (1261, 958),
         (1282, 949), (1304, 946), (1330, 947), (1352, 953), (1368, 961), (1381, 955), (1408, 940),
         (1401, 957), (1390, 975), (1392, 992), (1396, 1024), (1401, 1061), (1404, 1093), (1401, 1112),
         (1389, 1124), (1370, 1129), (1352, 1123), (1336, 1107), (1320, 1088), (1305, 1067), (1296, 1083),
         (1293, 1109), (1288, 1131), (1284, 1147), (1286, 1189), (1284, 1243), (1283, 1296), (1287, 1333),
         (1288, 1344), (1264, 1347), (1242, 1344), (1240, 1296), (1237, 1253), (1232, 1253), (1229, 1296),
         (1230, 1341), (1208, 1347), (1193, 1344), (1194, 1285), (1196, 1216), (1194, 1157), (1170, 1141),
         (1138, 1137), (1106, 1134), (1093, 1131), (1091, 1179), (1089, 1232), (1088, 1285), (1089, 1341),
         (1072, 1347), (1064, 1320), (1056, 1345), (1032, 1347), (1017, 1344), (1016, 1296), (1014, 1243),
         (1010, 1189), (1002, 1136), (994, 1093)]
# The river's near shore (water above belongs to `far`), left to right.
SHORE = [(1544, 1012), (1800, 1016), (2050, 1022), (2304, 1028)]
# Top of the bright sand bar under the hooves (bank above, ground below).
BAR = [(781, 1330), (1010, 1336), (1240, 1342), (1350, 1320), (1500, 1300), (1700, 1305),
       (1950, 1314), (2130, 1302), (2304, 1308)]
# Top of the near lip (fore).
LIP = [(781, 1462), (1100, 1452), (1450, 1468), (1800, 1458), (2304, 1466)]

PAPER, MIST, CREAM, TAN, DKTAN, GREY, DUSK, BROWN = 0, 1, 3, 8, 11, 16, 19, 21
OLIVE, DKGREEN, MOSS = 18, 20, 25


def lum(c): return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def line_y(pts, to_world, w):
    """A polyline in photo px -> one y per world column (linear in between)."""
    q = [to_world(*p) for p in pts]
    out = []
    for x in range(w):
        for (x0, y0), (x1, y1) in zip(q, q[1:]):
            if x0 <= x + 0.5 <= x1 or (x + 0.5 < q[0][0] and (x0, y0) == q[0]) or (x + 0.5 > q[-1][0] and (x1, y1) == q[-1]):
                t = 0 if x1 == x0 else min(1, max(0, (x + 0.5 - x0) / (x1 - x0)))
                out.append(y0 + (y1 - y0) * t)
                break
    return out


def wobble(w, rng, amp, scales=(5.0, 2.3)):
    """Smooth-ish integer noise per column: the cut lines are never straight."""
    ph = [rng.random() * 6.3 for _ in scales]
    return [round(sum(amp / (i + 1) * math.sin(x / s + p) for i, (s, p) in enumerate(zip(scales, ph))) + rng.choice((0, 0, 0, 1, -1)) * (amp > 1))
            for x in range(w)]


def build(world, render, to_world):
    W, H = world.size
    rng = random.Random(1840)
    src = list(world.get_flattened_data())

    # ------------------------------------------------------------ masks
    horse = C.raster([to_world(*p) for p in HORSE], W, H)

    def is_tree(x, y):
        r, g, b = src[y * W + x]
        if g > r + 4 and g > b: return True
        return x < 140 and lum((r, g, b)) < 70 and g >= r - 6
    tree = bytearray(1 if is_tree(x, y) and not horse[y * W + x] else 0 for y in range(H) for x in range(W))
    tree = C.majority(tree, W, H, 1)

    # b: first sand row per column. Trees: bottom-up, the lowest tree pixel with tree above it;
    # water columns: the shore line; behind the horse: interpolated between its sides.
    shore = line_y(SHORE, to_world, W)
    hx = [x for x in range(W) if any(horse[y * W + x] for y in range(H))]
    hx0, hx1 = min(hx) - 1, max(hx) + 1
    b = []
    for x in range(W):
        y0 = 90
        for y in range(150, 90, -1):
            if all(tree[(y - j) * W + x] for j in range(3)):
                y0 = y + 1; break
        b.append(max(y0, round(shore[x])) if shore[x] < 160 and x >= to_world(1544, 0)[0] else y0)
    for x in range(hx0 + 1, hx1):
        t = (x - hx0) / (hx1 - hx0)
        b[x] = round(b[hx0] * (1 - t) + b[hx1] * t) + rng.choice((0, 1, 1, 2))
    # g: top of the bright bar; f: top of the near lip
    g = [round(v) + d for v, d in zip(line_y(BAR, to_world, W), wobble(W, rng, 2))]
    f = [round(v) + d for v, d in zip(line_y(LIP, to_world, W), wobble(W, rng, 1.5, (7.0, 3.1)))]

    def band(x, y):
        return 0 if y < b[x] else 1 if y < g[x] else 2 if y < f[x] else 3

    # ------------------------------------------------------------ the scene without the horse
    bg = world.copy()
    hole = C.dilate(horse, W, H, 2)              # the photo's horse has a 1-2 px pale halo
    hx0w, hy0w = to_world(1290, 860)             # pale twigs around the head read as stray ear
    hx1w, _ = to_world(1480, 0)                  # bits once it moves: fill them with foliage
    for y in range(int(hy0w), H):
        for x in range(int(hx0w), int(hx1w)):
            if y < b[x] and (lum(src[y * W + x]) > 120 or not tree[y * W + x]): hole[y * W + x] = 1
    miss = C.inpaint(bg, hole, lambda sx, sy, tx, ty: band(sx, sy) == band(tx, ty) and (band(tx, ty) or tree[sy * W + sx]),
              rng, patch=(3, 2), reach=(4, 30), dy=2)
    assert not miss, f'horse hole: {len(miss)} px unfilled'
    for i in range(W * H):                       # what was filled above the sand is foliage now
        if hole[i] and i // W < b[i % W]: tree[i] = 1
    Qbg = list(render(bg).get_flattened_data())

    # far: trees replaced by what is behind them (cliff above, the river lower down)
    far_img = bg.copy()
    under = C.dilate(bytearray(tree[i] if (i // W) < b[i % W] else 0 for i in range(W * H)), W, H, 2)
    # sources: bare cliff or water, never a leaf (green) or a pixel at a tree's edge
    bare = [not under[i] and not (src[i][1] > src[i][0] + 2) for i in range(W * H)]
    miss = C.inpaint(far_img, under, lambda sx, sy, tx, ty: bare[sy * W + sx] and sy < b[sx] - 1, rng,
              patch=(4, 3), reach=(4, 70), dy=3)
    assert not miss, f'far underpaint: {len(miss)} px unfilled'
    Qfar = list(render(far_img).get_flattened_data())

    # trees: tree pixels, plus a ragged hem 3..8 rows under b (hidden by the bank at rest)
    hem = [3 + (v % 6) for v in (rng.randint(0, 99) for _ in range(W))]
    tree_img = bg.copy()
    hem_mask = bytearray(1 if b[i % W] <= i // W < b[i % W] + hem[i % W] else 0 for i in range(W * H))
    C.inpaint(tree_img, hem_mask, lambda sx, sy, tx, ty: tree[sy * W + sx] and sy < b[sx], rng, patch=(3, 2), reach=(0, 6), dy=8)
    Qtree = list(render(tree_img).get_flattened_data())

    far = Qfar
    trees = [Qtree[i] if (tree[i] and i // W < b[i % W]) or hem_mask[i] else KEY for i in range(W * H)]
    bank = [Qbg[i] if b[i % W] <= i // W < g[i % W] + 6 else KEY for i in range(W * H)]
    ground = [Qbg[i] if g[i % W] <= i // W < f[i % W] + 8 else KEY for i in range(W * H)]
    fore = [Qbg[i] if i // W >= f[i % W] else KEY for i in range(W * H)]
    for x in range(W):                          # the lip: a broken bright edge with a shade under it
        y = f[x]
        if rng.random() < 0.8: fore[y * W + x] = PAPER
        if rng.random() < 0.3 and y + 1 < H: fore[(y + 1) * W + x] = CREAM

    # ------------------------------------------------------------ horse and tail
    horse_sp, tail_sp = horse_sprites(world, horse)
    layers = [
        C.Layer('far', 0, 0.25, far),
        C.Layer('trees', 0.35, 0.4, trees),
        C.Layer('bank', 0.5, 0.55, bank),
        C.Layer('ground', 0.65, 0.75, ground),
        C.Layer('fore', 1, 1.4, fore),
    ]
    grass_sp = grass_sprite(random.Random(77))
    return C.Art(layers, [horse_sp, tail_sp, grass_sp], {'alt': {'horse': len(POSES) * 2 - 2, 'tail': 2, 'grass': 1}})


# ---------------------------------------------------------------- the horse rig (world px)
BOX = (30, 112, 84, 86)                 # sprite frame: x, y, w, h
WITHERS = (66.0, 125.0)                 # neck pivot (the neck and head turn about it)
THROAT = (89.0, 150.0)                  # the neck/body cut runs WITHERS -> THROAT
POLL = (87.0, 134.0)                    # head pivot, on the head's back edge
HEAD = [(84, 119), (110, 117), (111, 152), (106, 158), (95, 158), (89, 151), (85, 141)]
EAR = [(102, 118), (110, 116), (110, 127), (103, 127)]   # the near (right) ear
EAR_BASE = (104.5, 126.5)
TAIL_GAP = (46, 49, 151, 188)           # x0, x1 (incl), y0, y1: between the hind legs
# (neck turn about the withers, head turn about the poll on top of it), degrees: up, lowering,
# low, grazing, grazing (chew). The neck keeps its length: from this front three-quarter view the
# muzzle then reaches knee height, so the horse grazes the tall grass clump in front of it.
# Sprite frames are pose-major: frame = 2 * pose + ear, ear 0 = at rest, 1 = flicked back
# (0 up, 2 lowering, 4 low, 6 grazing, 8 grazing-chew; +1 for the flick). Rest = 0.
POSES = [(0, 0), (14, -7), (27, -16), (40, -25), (40, -22)]
# Hand touches on the rest frame (world px of the top-left of each map; '.' keeps the pixel).
HAND = {
    (96, 134): ['.gg.',          # near eye
                'gddg',
                '.gg.'],
    (100, 149): ['gddg',         # nostrils
                 '.gg.'],
    (106, 119): ['..d',          # near ear tip
                 '.dk',
                 'dkc'],
}
RAMP = [(PAPER, 228), (CREAM, 190), (TAN, 150), (DKTAN, 120), (GREY, 95), (DUSK, 0)]


def side(a, b, p):
    return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])


def horse_sprites(world, horse):
    W, H = world.size
    bx, by, bw, bh = BOX
    bl = list(world.filter(ImageFilter.BoxBlur(0.6)).get_flattened_data())

    def tone(c):
        l = lum(c)
        for i, t in RAMP:
            if l >= t: return i
        return DUSK
    rest = [KEY] * (bw * bh)
    for y in range(bh):
        for x in range(bw):
            wx, wy = bx + x, by + y
            if horse[wy * W + wx] and not (TAIL_GAP[0] <= wx <= TAIL_GAP[1] and TAIL_GAP[2] <= wy <= TAIL_GAP[3]):
                rest[y * bw + x] = tone(bl[wy * W + wx])
    rest = C.despeckle(rest, bw, bh)
    for (x, y), rows in HAND.items():            # hand touches: eye, nostril, ear tips
        C.paint(rest, bw, x - bx, y - by, rows, {'d': DUSK, 'g': GREY, 'k': DKTAN, 'c': CREAM, 'p': PAPER})
    loc = lambda p: (p[0] - bx, p[1] - by)
    head_m = C.raster([loc(p) for p in HEAD], bw, bh)
    ear_m = C.raster([loc(p) for p in EAR], bw, bh)
    W_, T_, P_ = loc(WITHERS), loc(THROAT), loc(POLL)
    moving = [1 if rest[i] != KEY and side(W_, T_, (i % bw + .5, i // bw + .5)) < 0 and i % bw + .5 > W_[0] - 1 else 0
              for i in range(bw * bh)]
    body = [v if not moving[i] else KEY for i, v in enumerate(rest)]
    neck = [v if moving[i] and not head_m[i] else KEY for i, v in enumerate(rest)]
    head = [v if moving[i] and head_m[i] else KEY for i, v in enumerate(rest)]

    def rot(p, c, a):
        s_, c_ = math.sin(a), math.cos(a)
        return (c[0] + (p[0] - c[0]) * c_ - (p[1] - c[1]) * s_, c[1] + (p[0] - c[0]) * s_ + (p[1] - c[1]) * c_)

    def frame(phi, psi, ear):
        hd = head
        if ear:
            hd = [v if not ear_m[i] else KEY for i, v in enumerate(head)]
            earpx = [v if ear_m[i] else KEY for i, v in enumerate(head)]
            C.rotate(earpx, bw, bh, math.radians(-ear), loc(EAR_BASE), hd, bw, bh, to=loc(EAR_BASE))
        if phi == 0 and psi == 0:                  # head up: the rest frame, only the ear may differ
            return [hd[i] if hd[i] != KEY else (KEY if head_m[i] and moving[i] else rest[i]) for i in range(bw * bh)]
        out = list(body)
        a = math.radians(phi)
        moved = C.rotate(neck, bw, bh, a, W_, out, bw, bh, to=W_)
        P2 = rot(P_, W_, a)
        steps = max(1, int(abs(psi) / 4))
        for k in range(steps + 1):                 # sweep the head turn: no gap at the throat
            moved |= C.rotate(hd, bw, bh, a + math.radians(psi) * k / steps, P_, out, bw, bh, to=P2)
        clean = C.despeckle(out, bw, bh)           # tidy the moved pixels only: the body never changes
        return [clean[i] if (i % bw, i // bw) in moved else out[i] for i in range(bw * bh)]

    frames = [frame(phi, psi, ear) for phi, psi in POSES for ear in (0, 40)]
    horse_sp = C.Sprite('horse', bw, bh, frames, (bx, by), 'ground', 0)
    tail_sp = tail_sprite()
    return horse_sp, tail_sp


TAIL_BOX = (30, 146, 26, 44)
TAIL_ROOT = (46.5, 147.0)               # just under the rump: the strand hangs between the hind legs
TAIL_TOP = 150                          # rows above this stay hidden in the rump's shadow


def tail_sprite():
    """A hand-drawn strand, drawn over the horse so a swish shows across the near hind leg.
    Frames: 0 rest (hangs straight, as in the photo), 1 a little left, 2 full left, 3 a little
    right. A swish plays 0 1 2 1 0 (or 0 3 0), so it starts and ends at rest."""
    tx, ty, tw, th = TAIL_BOX
    tips = [(47.5, 186.0), (43.5, 185.0), (37.0, 182.0), (51.0, 185.0)]
    frames = []
    for tip in tips:
        g = [KEY] * (tw * th)
        ctrl = (TAIL_ROOT[0] + 0.5, (TAIL_ROOT[1] + tip[1]) / 2 - 2)
        for k in range(201):
            t = k / 200
            x = (1 - t) ** 2 * TAIL_ROOT[0] + 2 * (1 - t) * t * ctrl[0] + t * t * tip[0]
            y = (1 - t) ** 2 * TAIL_ROOT[1] + 2 * (1 - t) * t * ctrl[1] + t * t * tip[1]
            if y < TAIL_TOP: continue
            wd = 3.4 - 1.6 * t
            for dx in range(-2, 3):
                if abs(dx + 0.5 - (x - math.floor(x))) > wd / 2 + 0.2: continue
                X, Y = math.floor(x) + dx - tx, round(y) - ty
                if 0 <= X < tw and 0 <= Y < th:
                    col = PAPER if dx < 0 else CREAM if dx == 0 else DKTAN
                    if t > 0.86: col = CREAM if dx < 0 else TAN
                    g[Y * tw + X] = col
        frames.append(g)
    return C.Sprite('tail', tw, th, frames, (tx, ty), 'ground', 0)


GRASS_BOX = (70, 158, 30, 38)           # x, y, w, h of the grass sprite (world px)
GRASS_BASE = (85.0, 194)                # root of the clump, just in front of the forehooves


def grass_sprite(rng):
    """A clump of tall bunchgrass in front of the forelegs, drawn after the horse so the grazing
    muzzle dips into it from behind. A fountain of single-pixel blades, green with dry tips.
    Frames: 0 rest, 1 tips lean right, 2 tips lean left (sway: rest -> 1 -> rest -> 2 -> rest)."""
    gx, gy, gw, gh = GRASS_BOX
    cx, base = GRASS_BASE
    blades = []
    for k in range(16):
        u = (k / 15) * 2 - 1 + rng.uniform(-0.05, 0.05)            # -1 .. 1, left .. right
        hgt = (31 - 15 * abs(u + 0.15) ** 1.4) * rng.uniform(0.8, 1.0)
        blades.append((cx + 3.5 * u + rng.uniform(-0.6, 0.6), hgt, u, k % 3 == 0))
    blades.sort(key=lambda b: (not b[3], -b[1]))                   # dark back blades first
    frames = []
    for sway in (0, 1, -1):
        g = [KEY] * (gw * gh)
        for x0, hgt, u, back in blades:
            steps = int(hgt * 3)
            for st in range(steps + 1):
                t = st / steps
                x = x0 + u * (5 * t * t + 3 * t ** 3) + sway * 1.6 * t ** 2
                y = base - hgt * (t - 0.3 * abs(u) ** 1.5 * t ** 3)
                if back: col = MOSS if t < 0.45 else DKGREEN if t < 0.9 else DKTAN
                else: col = DKGREEN if t < 0.3 else OLIVE if t < 0.88 else DKTAN
                X, Y = round(x) - gx, round(y) - gy
                if 0 <= X < gw and 0 <= Y < gh: g[Y * gw + X] = col
        frames.append(g)
    return C.Sprite('grass', gw, gh, frames, (gx, gy), 'ground', 0)
